"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ConversationLogEntry,
  ConversationPhase,
  UseConversationEngineResult,
} from "@/hooks/useConversationEngine";
import { useConversationPersistence } from "@/hooks/useConversationPersistence";
import type { MusicOverlayState } from "@/components/MusicOverlay";

declare global {
  interface Window {
    Android?: { closeApp?: () => void; syncCalendarNow?: () => void };
    __neurocarePause?: () => void;
    __neurocareResume?: () => void;
  }
}

// hooks/useConversationEngine.ts의 END_CONVERSATION_PATTERN과 글자 하나 다르지 않게 복사.
// 이 훅 하나에서만 쓰고 기존 훅은 곧 삭제될 예정이라 공유 모듈로 뽑지 않는다.
const END_CONVERSATION_PATTERN =
  /^(대화종료|이제그만|그만할래|그만하자|끝낼래|끝내자|잘자|잘자요|안녕히주무세요|주무세요)[.!?~,]*$/;

/** Azure Realtime data channel이 보내는 서버 이벤트 중 이 훅이 실제로 쓰는 필드만 타입화한다. */
interface RealtimeServerEvent {
  type: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string };
}

export function useRealtimeConversation(enabled = true): UseConversationEngineResult {
  // 서버(/api/sessions, /api/turns)가 이미 requirePatientSelf()로 인증을 막고
  // 있으므로(기존 /api/realtime/token과 동일 패턴), 여기서 role을 다시 가리지
  // 않고 항상 켠다 - 보호자 세션이면 저장 호출이 조용히 401로 실패할 뿐 대화
  // 자체엔 영향 없다.
  const persistence = useConversationPersistence(enabled);
  const { saveTurn } = persistence;
  const [phase, setPhase] = useState<ConversationPhase>("listening");
  const [assistantDraft, setAssistantDraft] = useState("");
  const [speakingLevel, setSpeakingLevel] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [log, setLog] = useState<ConversationLogEntry[]>([]);
  const [vadListening, setVadListening] = useState(false);
  const [vadUserSpeaking, setVadUserSpeaking] = useState(false);
  const [vadError, setVadError] = useState<string | null>(null);
  const [musicOverlay, setMusicOverlay] = useState<MusicOverlayState | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioFrameRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  // effect cleanup가 set(true)하는 취소 플래그. connect()는 await 뒤마다 이 값을 확인해
  // 언마운트가 getUserMedia/offer/answer 대기 중에 끼어든 경우 이미 닫힌 pc를 계속
  // 건드리지 않고 그 시점까지 확보한 리소스만 정리한 뒤 빠져나온다.
  const cancelledRef = useRef(false);

  // 페이지 마운트 시 한 번 연결 - 기존 useConversationEngine이 마운트 시 vad.start()를
  // 부르던 것과 동일한 타이밍(app/page.tsx는 이 훅을 호출만 하면 된다). startedRef 가드가
  // 있어 StrictMode의 effect 2회 실행에도 안전하다. connect를 effect 밖 useCallback으로
  // 빼지 않고 effect 안에 두는 이유: hooks/useLinkedPatients.ts와 같은 패턴(effect-local
  // async 함수) - react-hooks/set-state-in-effect가 "effect 밖 콜백을 의존성으로 불러
  // 그 안에서 setState" 모양을 정적으로 문제 삼는다.
  useEffect(() => {
    if (!enabled) return;
    cancelledRef.current = false;

    // connect()가 각 await 이후 이미 확보한 리소스(pc/mic/audioEl)를 정리할 때 쓰는
    // 헬퍼. pc.close()·track.stop()·audioEl.remove()는 모두 멱등이라, 언마운트 시
    // effect cleanup이 같은 리소스를 이미 정리했더라도 다시 불러도 안전하다.
    function cleanupPartialConnection(
      pc: RTCPeerConnection,
      mic: MediaStream | null,
      audioEl: HTMLAudioElement | null,
    ) {
      pc.close();
      mic?.getTracks().forEach((track) => track.stop());
      audioEl?.remove();
    }

    async function connect() {
      if (startedRef.current) return;
      startedRef.current = true;

      let tokenRes: Response;
      try {
        tokenRes = await fetch("/api/realtime/token");
      } catch {
        if (!cancelledRef.current) setErrorMsg("네트워크 연결을 확인해주세요.");
        startedRef.current = false;
        return;
      }
      if (cancelledRef.current) return;
      if (!tokenRes.ok) {
        setErrorMsg("지금은 대화를 시작할 수 없어요.");
        startedRef.current = false;
        return;
      }
      const { token, resource } = (await tokenRes.json()) as { token: string; resource: string };
      if (cancelledRef.current) return;

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;
      // "연결 성공 후 true, 연결 전/종료 후 false"를 이 이벤트 한 곳에서만 결정한다 - 연결이
      // 붙은 뒤 네트워크 등으로 끊기는 경우까지 반영하려면 연결 직후 한 번만 true로 두는
      // 것으론 부족하다.
      pc.onconnectionstatechange = () => {
        setVadListening(pc.connectionState === "connected");
      };

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      document.body.appendChild(audioEl);
      audioElRef.current = audioEl;
      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0];
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        const source = audioContext.createMediaStreamSource(event.streams[0]);
        source.connect(analyser);
        audioContextRef.current = audioContext;
        audioAnalyserRef.current = analyser;
        const samples = new Uint8Array(analyser.fftSize);
        const updateSpeakingLevel = () => {
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) {
            const normalized = (sample - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / samples.length);
          setSpeakingLevel(Math.min(1, Math.max(0, (rms - 0.01) / 0.08)));
          audioFrameRef.current = requestAnimationFrame(updateSpeakingLevel);
        };
        void audioContext.resume();
        updateSpeakingLevel();
      };

      let mic: MediaStream;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        cleanupPartialConnection(pc, null, audioEl);
        if (!cancelledRef.current) {
          setVadError(err instanceof Error ? err.message : "마이크 접근 실패");
        }
        startedRef.current = false;
        return;
      }
      if (cancelledRef.current) {
        cleanupPartialConnection(pc, mic, audioEl);
        return;
      }
      micStreamRef.current = mic;
      pc.addTrack(mic.getAudioTracks()[0]);

      const dataChannel = pc.createDataChannel("realtime-channel");
      dataChannel.addEventListener("message", (event) => {
        const e = JSON.parse(event.data as string) as RealtimeServerEvent;
        if (e.type === "response.function_call_arguments.done" && e.name === "web_search" && e.call_id) {
          void (async () => {
            let query = "";
            try { query = (JSON.parse(e.arguments ?? "{}") as { query?: string }).query?.trim() ?? ""; } catch {}
            if (!query) return;
            const result = await fetch("/api/realtime/web-search", {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }),
            });
            const payload = (await result.json().catch(() => ({}))) as { result?: string; error?: string };
            dataChannel.send(JSON.stringify({ type: "conversation.item.create", item: {
              type: "function_call_output", call_id: e.call_id, output: payload.result ?? payload.error ?? "검색 실패",
            }}));
            dataChannel.send(JSON.stringify({ type: "response.create" }));
          })();
          return;
        }
        if (e.type === "response.function_call_arguments.done" && e.name === "add_calendar_event" && e.call_id) {
          void (async () => {
            let title = "";
            let date = "";
            try {
              const args = JSON.parse(e.arguments ?? "{}") as { title?: string; date?: string };
              title = args.title?.trim() ?? "";
              date = args.date?.trim() ?? "";
            } catch {}
            const callId = e.call_id as string;
            let output = "일정을 저장하지 못했어요. 다시 한번 말씀해주시겠어요?";
            if (title && date) {
              const post = () =>
                fetch("/api/realtime/calendar-event", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title, date }),
                });
              // 네트워크/일시적 DB 오류 대비 1회 재시도 - 그 이상은 모델이 대화로 재시도를 유도한다.
              // 짧은 대기 후 재요청(설계 스펙) - 즉시 재시도는 같은 순간의 장애를 다시 맞기 쉽다.
              let res = await post().catch(() => null);
              if (!res || !res.ok) {
                await new Promise((resolve) => setTimeout(resolve, 300));
                res = await post().catch(() => null);
              }
              if (res && res.ok) {
                output = `"${title}"을(를) ${date} 일정에 추가했어요.`;
                window.Android?.syncCalendarNow?.();
              }
            }
            dataChannel.send(JSON.stringify({ type: "conversation.item.create", item: {
              type: "function_call_output", call_id: callId, output,
            }}));
            dataChannel.send(JSON.stringify({ type: "response.create" }));
          })();
          return;
        }
        if (e.type === "response.function_call_arguments.done" && e.name === "play_song" && e.call_id) {
          void (async () => {
            let query = "";
            try { query = (JSON.parse(e.arguments ?? "{}") as { query?: string }).query?.trim() ?? ""; } catch {}
            const callId = e.call_id as string;
            let output = "그 노래를 못 찾았어요.";
            if (query) {
              const searchRes = await fetch("/api/music/search", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }),
              }).catch(() => null);
              const payload = (await searchRes?.json().catch(() => ({}))) as { videoId?: string | null; title?: string } | undefined;
              if (payload?.videoId && payload.title) {
                setMusicOverlay({ videoId: payload.videoId, title: payload.title });
                void fetch("/api/music/history", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title: payload.title, videoId: payload.videoId }),
                }).catch(() => {});
                output = `"${payload.title}"을(를) 재생을 시작했어요.`;
              }
            }
            dataChannel.send(JSON.stringify({ type: "conversation.item.create", item: {
              type: "function_call_output", call_id: callId, output,
            }}));
            dataChannel.send(JSON.stringify({ type: "response.create" }));
          })();
          return;
        }
        if (e.type === "response.function_call_arguments.done" && e.name === "stop_song" && e.call_id) {
          setMusicOverlay(null);
          dataChannel.send(JSON.stringify({ type: "conversation.item.create", item: {
            type: "function_call_output", call_id: e.call_id, output: "재생을 멈췄어요.",
          }}));
          dataChannel.send(JSON.stringify({ type: "response.create" }));
          return;
        }
        switch (e.type) {
          case "input_audio_buffer.speech_started":
            setPhase("transcribing");
            setVadUserSpeaking(true);
            break;
          case "input_audio_buffer.speech_stopped":
            setVadUserSpeaking(false);
            setPhase("thinking");
            break;
          case "output_audio_buffer.started":
            setPhase("speaking");
            break;
          case "output_audio_buffer.stopped":
            setPhase("listening");
            setAssistantDraft("");
            break;
          case "response.output_audio_transcript.delta":
            setAssistantDraft((prev) => prev + (e.delta ?? ""));
            break;
          case "response.output_audio_transcript.done": {
            const assistantText = e.transcript ?? "";
            setLog((prev) => [{ id: Date.now(), role: "assistant", text: assistantText }, ...prev]);
            saveTurn("assistant", assistantText);
            break;
          }
          case "conversation.item.input_audio_transcription.completed": {
            const transcript: string = e.transcript ?? "";
            setLog((prev) => [{ id: Date.now(), role: "user", text: transcript }, ...prev]);
            saveTurn("user", transcript);
            void fetch("/api/realtime/distress-check", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: transcript }),
            });
            if (END_CONVERSATION_PATTERN.test(transcript.trim().replace(/\s+/g, ""))) {
              window.Android?.closeApp?.();
            }
            break;
          }
          case "error":
            setErrorMsg(e.error?.message ?? "오류가 발생했습니다.");
            break;
        }
      });

      const offer = await pc.createOffer();
      if (cancelledRef.current) {
        cleanupPartialConnection(pc, mic, audioEl);
        return;
      }
      await pc.setLocalDescription(offer);
      if (cancelledRef.current) {
        cleanupPartialConnection(pc, mic, audioEl);
        return;
      }

      const sdpRes = await fetch(`https://${resource}.openai.azure.com/openai/v1/realtime/calls?webrtcfilter=on`, {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/sdp" },
      });
      if (cancelledRef.current) {
        cleanupPartialConnection(pc, mic, audioEl);
        return;
      }
      if (!sdpRes.ok) {
        cleanupPartialConnection(pc, mic, audioEl);
        setErrorMsg("지금은 대화를 시작할 수 없어요.");
        startedRef.current = false;
        return;
      }
      const answerSdp = await sdpRes.text();
      if (cancelledRef.current) {
        cleanupPartialConnection(pc, mic, audioEl);
        return;
      }
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      if (cancelledRef.current) {
        cleanupPartialConnection(pc, mic, audioEl);
      }
    }

    // 언마운트 정리와 네이티브 pause 둘 다 "지금 붙어있는 연결을 놓는다"는 동일 작업이라
    // 여기 하나로 모아 재사용한다. pc.close()는 마이크 트랙을 멈추지 않는다(WebRTC 스펙) -
    // 그대로 두면 훅이 정리된 뒤에도 브라우저 마이크 사용중 표시가 계속 떠 있는다.
    function teardownActiveConnection() {
      if (audioFrameRef.current !== null) cancelAnimationFrame(audioFrameRef.current);
      audioFrameRef.current = null;
      audioAnalyserRef.current = null;
      void audioContextRef.current?.close();
      audioContextRef.current = null;
      setSpeakingLevel(0);
      peerConnectionRef.current?.close();
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioElRef.current?.remove();
      peerConnectionRef.current = null;
      micStreamRef.current = null;
      audioElRef.current = null;
    }

    // 네이티브 셸이 백그라운드 전환(화면 꺼짐/홈/전화 수신 - 완전 종료 아님) 시 부르는
    // 훅. cancelledRef를 켜서 진행 중이던 connect()의 await 체크포인트들이 더 이상
    // 진행하지 않게 막고, 이미 붙은 연결/마이크는 teardownActiveConnection으로 놓는다.
    // startedRef를 다시 false로 돌려 resume 시 connect()가 재실행될 수 있게 한다 -
    // "언마운트(다시 연결 안 함)"와 "일시정지(재연결 가능)"를 cancelledRef 하나로 같이
    // 표현하되, resume이 호출될 때 cancelledRef를 다시 false로 되돌려 구분한다.
    window.__neurocarePause = () => {
      cancelledRef.current = true;
      teardownActiveConnection();
      startedRef.current = false;
      setVadListening(false);
    };

    window.__neurocareResume = () => {
      if (startedRef.current) return;
      cancelledRef.current = false;
      void connect();
    };

    void connect();
    return () => {
      cancelledRef.current = true;
      teardownActiveConnection();
      delete window.__neurocarePause;
      delete window.__neurocareResume;
    };
  }, [enabled, saveTurn]);

  return {
    phase,
    interimText: "",
    assistantDraft,
    speakingLevel,
    errorMsg,
    log,
    vadListening,
    vadUserSpeaking,
    vadError,
    photo: null,
    dismissPhoto: () => {},
    musicOverlay,
    dismissMusicOverlay: () => setMusicOverlay(null),
  };
}
