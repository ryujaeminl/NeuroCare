"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConversationLogEntry,
  ConversationPhase,
  UseConversationEngineResult,
} from "@/hooks/useConversationEngine";
import { useConversationPersistence } from "@/hooks/useConversationPersistence";
import type { MusicOverlayState } from "@/components/MusicOverlay";
import { Lipsync } from "wawa-lipsync";

declare global {
  interface Window {
    Android?: {
      closeApp?: () => void;
      syncCalendarNow?: () => void;
      openYoutubeSearch?: (query: string) => void;
      openYoutubeVideo?: (videoId: string) => void;
    };
    __neurocarePause?: () => void;
    __neurocareResume?: () => void;
  }
}

// hooks/useConversationEngine.ts의 END_CONVERSATION_PATTERN과 글자 하나 다르지 않게 복사.
// 이 훅 하나에서만 쓰고 기존 훅은 곧 삭제될 예정이라 공유 모듈로 뽑지 않는다.
const END_CONVERSATION_PATTERN =
  /(복실아\s*)?(대화\s*종료|종료|앱\s*종료|이제\s*그만|그만\s*할래|그만\s*하자|끝낼래|끝내자|잘\s*자|잘\s*자요|잘\s*가|잘\s*가요|안녕히\s*주무세요|주무세요|안녕히\s*계세요)/i;

// 연결은 계속 붙어있는데(마이크 살아있음 = 앱을 끈 게 아님) 환자가 이 시간 넘게
// 한마디도 안 하면 이상 징후로 본다("대화 이어져야 하는데 응답이 없다"는 요청) -
// session_timeout 트리거(app/api/emergency, PATIENT_TRIGGER_TYPES에 이미 허용돼
// 있었지만 실제로 만드는 코드가 없었음). 5분은 오탐(단순히 생각하거나 잠깐 조용한
// 것)과 놓침 사이 절충값 - 너무 예민하면 사용자에게 알려주면 늘린다.
// 곧바로 SOS를 보내지 않는다 - 먼저 모델이 "괜찮으세요?"라고 한 번 안부를 묻고,
// 그 뒤로도 CHECK_IN_GRACE_MS 동안 응답이 없을 때만 실제로 SOS를 보낸다(사용자
// 확인 - 무응답 원인이 진짜 위급 상황이 아니라 단순히 조용히 있는 것일 수도 있어서
// 한 번은 직접 불러 확인한다).
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const CHECK_IN_GRACE_MS = 90 * 1000;
const SESSION_TIMEOUT_CHECK_INTERVAL_MS = 15 * 1000;
const CHECK_IN_INSTRUCTIONS =
  "환자가 5분 넘게 아무 말도 하지 않았습니다. 하던 이야기와 상관없이 지금 " +
  "다정하게 이름을 부르며 '~~님, 괜찮으세요?'라고 안부를 물어보세요. 다른 말은 하지 마세요.";

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
  const handledTranscriptsRef = useRef<Set<string>>(new Set());

  const handleUserTranscript = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || handledTranscriptsRef.current.has(trimmed)) return;
      handledTranscriptsRef.current.add(trimmed);
      if (handledTranscriptsRef.current.size > 100) {
        handledTranscriptsRef.current.clear();
      }

      setLog((prev) => [{ id: Date.now(), role: "user", text: trimmed }, ...prev]);
      saveTurn("user", trimmed);

      if (/(보여\s*줘|메시지\s*보여|사진\s*보여|열어\s*줘|확인\s*할래|보여드릴|볼래)/i.test(trimmed)) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("open-message-modal"));
        }
      }

      const isDistressKeyword = /(살려|도와|구해|119|sos|에스오에스|응급|비상|긴급|신호|아파|아파요|배\s*아파|머리\s*아파|연락|보호자)/i.test(trimmed);
      if (isDistressKeyword) {
        void fetch("/api/emergency", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ triggerType: "voice_distress", detail: trimmed }),
        });
      }

      void fetch("/api/realtime/distress-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
    },
    [saveTurn],
  );
  const [phase, setPhase] = useState<ConversationPhase>("listening");
  const [assistantDraft, setAssistantDraft] = useState("");
  const [speakingLevel, setSpeakingLevel] = useState(0);
  const [viseme, setViseme] = useState("viseme_sil");
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
  const lipsyncRef = useRef<Lipsync | null>(null);
  const startedRef = useRef(false);
  const lastUserSpeechAtRef = useRef<number | null>(null);
  const checkInSentAtRef = useRef<number | null>(null);
  const sessionTimeoutFiredRef = useRef(false);
  const sessionTimeoutIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // effect cleanup가 set(true)하는 취소 플래그. connect()는 await 뒤마다 이 값을 확인해
  // 언마운트가 getUserMedia/offer/answer 대기 중에 끼어든 경우 이미 닫힌 pc를 계속
  // 건드리지 않고 그 시점까지 확보한 리소스만 정리한 뒤 빠져나온다.
  const cancelledRef = useRef(false);

  // Azure Realtime은 한 번에 응답(response) 하나만 진행 중일 수 있다 - 이미 진행 중인
  // 응답이 있을 때 response.create를 또 보내면 서버가 거부하고 error 이벤트만 온다.
  // tool 호출(play_song 등) 직후 우리가 곧바로 response.create를 보내는 게 바로 이
  // 상황이다: 모델이 tool을 부른 그 응답 자체가 아직 안 끝난 상태이기 때문이다.
  // "생각 중" 멈춤(특히 음악 재생 직후)의 유력한 원인으로 지목돼 응답 진행 여부를
  // 추적해 진행 중이면 큐에 쌓았다가 response.done 시점에 보내도록 고쳤다.
  const responseActiveRef = useRef(false);
  const queuedResponseCreateRef = useRef<Record<string, unknown> | null>(null);

  // "생각 중"에서 다음 이벤트 없이 멈춘 채 굳는 사례가 반복 보고됐다(음악 재생 요청
  // 직후가 가장 흔함) - 위 큐잉으로 근본 원인을 고쳤지만, 혹시 놓치는 경로가 있을 때를
  // 대비한 마지막 안전장치로 남겨둔다.
  const THINKING_STALL_TIMEOUT_MS = 15000;
  useEffect(() => {
    if (phase !== "thinking") return undefined;
    const timer = setTimeout(() => setPhase("listening"), THINKING_STALL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

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
        // 진단용(ponytail: 원인 잡히면 지운다) - "생각 중"에 굳는 게 tool 호출
        // 문제가 아니라 WebRTC 연결/데이터채널 자체가 조용히 죽는 것일 가능성을
        // 확인하려고 연결 상태 변화를 전부 서버로 올린다.
        void fetch("/api/client-log", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `pc.connectionState=${pc.connectionState}` }),
        }).catch(() => {});
      };
      pc.oniceconnectionstatechange = () => {
        void fetch("/api/client-log", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `pc.iceConnectionState=${pc.iceConnectionState}` }),
        }).catch(() => {});
      };

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      document.body.appendChild(audioEl);
      audioElRef.current = audioEl;
      pc.ontrack = (event) => {
        audioEl.src = "about:blank";
        audioEl.srcObject = event.streams[0];
        const lipsync = new Lipsync({ fftSize: 1024, historySize: 8 });
        lipsync.connectAudio(audioEl);
        lipsyncRef.current = lipsync;
        const updateSpeakingLevel = () => {
          lipsync.processAudio();
          const features = lipsync.features;
          setSpeakingLevel(features?.volume ?? 0);
          setViseme(lipsync.viseme);
          audioFrameRef.current = requestAnimationFrame(updateSpeakingLevel);
        };
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

      lastUserSpeechAtRef.current = Date.now();
      checkInSentAtRef.current = null;
      sessionTimeoutFiredRef.current = false;

      const dataChannel = pc.createDataChannel("realtime-channel");

      // response.create를 직접 보내지 말고 항상 이 함수를 거친다 - 이미 진행 중인
      // 응답이 있으면(responseActiveRef) 큐에 쌓아뒀다가 그 응답의 response.done이
      // 온 뒤 자동으로 보낸다. extra로 instructions 등 response.create의 추가 필드를
      // 전달할 수 있다(체크인 안부 질문 등).
      function sendResponseCreate(extra?: Record<string, unknown>) {
        const payload = { type: "response.create", ...extra };
        if (responseActiveRef.current) {
          queuedResponseCreateRef.current = payload;
          return;
        }
        responseActiveRef.current = true;
        dataChannel.send(JSON.stringify(payload));
      }

      /** 응답이 끝났다고 볼 수 있는 시점(response.done 또는 error)에 부른다. 큐에
       * 쌓인 요청이 있으면 그제서야 실제로 내보낸다. */
      function onResponseSlotFreed() {
        responseActiveRef.current = false;
        const queued = queuedResponseCreateRef.current;
        if (!queued) return;
        queuedResponseCreateRef.current = null;
        responseActiveRef.current = true;
        dataChannel.send(JSON.stringify(queued));
      }

      sessionTimeoutIntervalRef.current = setInterval(() => {
        if (sessionTimeoutFiredRef.current) return;
        if (pc.connectionState !== "connected") return; // 연결 자체가 끊긴 건 다른 문제(앱 종료 등)다.
        if (!lastUserSpeechAtRef.current) return;
        if (dataChannel.readyState !== "open") return;

        if (!checkInSentAtRef.current) {
          if (Date.now() - lastUserSpeechAtRef.current < SESSION_TIMEOUT_MS) return;
          // 1단계: 곧바로 SOS가 아니라 먼저 모델이 안부를 묻는다.
          checkInSentAtRef.current = Date.now();
          sendResponseCreate({ response: { instructions: CHECK_IN_INSTRUCTIONS } });
          return;
        }

        // 2단계: 안부를 물은 뒤에도 그레이스 기간 동안 응답이 없으면 그때 SOS.
        if (Date.now() - checkInSentAtRef.current < CHECK_IN_GRACE_MS) return;
        sessionTimeoutFiredRef.current = true;
        void fetch("/api/emergency", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ triggerType: "session_timeout" }),
        }).catch(() => {});
      }, SESSION_TIMEOUT_CHECK_INTERVAL_MS);
      // 진단용(ponytail: 원인 잡히면 지운다) - 데이터채널이 열린 뒤 조용히 닫히거나
      // 에러 나면 그 이후로는 어떤 서버 이벤트(tool 호출 포함)도 영영 못 받는다.
      dataChannel.addEventListener("open", () => {
        void fetch("/api/client-log", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "dataChannel open" }),
        }).catch(() => {});
      });
      dataChannel.addEventListener("close", () => {
        void fetch("/api/client-log", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "dataChannel closed" }),
        }).catch(() => {});
      });
      dataChannel.addEventListener("error", (ev) => {
        void fetch("/api/client-log", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `dataChannel error: ${JSON.stringify((ev as unknown as { error?: unknown }).error ?? ev)}`.slice(0, 300) }),
        }).catch(() => {});
      });
      dataChannel.addEventListener("message", (event) => {
        const e = JSON.parse(event.data as string) as RealtimeServerEvent;
        // 진단용(ponytail: 원인 잡히면 지운다) - 모델이 play_song 등 tool을 실제로
        // 호출하는지, 아니면 아예 말로만 때우고 넘어가는지가 서버 로그에서 안 보여서
        // "재생 안 됨" 보고를 몇 번이나 받고도 어느 단계에서 끊기는지 특정을 못 했다.
        if (e.type === "response.function_call_arguments.done") {
          void fetch("/api/client-log", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: `tool 호출: name=${e.name} call_id=${e.call_id} args=${(e.arguments ?? "").slice(0, 200)}` }),
          }).catch(() => {});
        }
        if (e.type === "error") {
          void fetch("/api/client-log", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: `realtime 오류: ${e.error?.message ?? "알 수 없음"}` }),
          }).catch(() => {});
        }
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
            sendResponseCreate();
          })();
          return;
        }
        if (e.type === "response.function_call_arguments.done" && e.name === "add_calendar_event" && e.call_id) {
          void (async () => {
            let title = "";
            let date = "";
            let notes = "";
            try {
              const args = JSON.parse(e.arguments ?? "{}") as { title?: string; date?: string; notes?: string };
              title = args.title?.trim() ?? "";
              date = args.date?.trim() ?? "";
              notes = args.notes?.trim() ?? "";
            } catch {}
            const callId = e.call_id as string;
            let output = "일정을 저장하지 못했어요. 다시 한번 말씀해주시겠어요?";
            if (title && date) {
              const post = () =>
                fetch("/api/realtime/calendar-event", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title, date, notes }),
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
            sendResponseCreate();
          })();
          return;
        }
        if (e.type === "response.function_call_arguments.done" && e.name === "confirm_medication" && e.call_id) {
          void (async () => {
            let medicationId = "";
            let reminderTime = "";
            try {
              const args = JSON.parse(e.arguments ?? "{}") as { medicationId?: string; reminderTime?: string };
              medicationId = args.medicationId?.trim() ?? "";
              reminderTime = args.reminderTime?.trim() ?? "";
            } catch {}
            const callId = e.call_id as string;
            let output = "복약 확인을 저장하지 못했어요.";
            if (medicationId && reminderTime) {
              const res = await fetch("/api/realtime/medication-confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ medicationId, reminderTime }),
              }).catch(() => null);
              if (res && res.ok) output = "복약 확인을 저장했어요.";
            }
            dataChannel.send(JSON.stringify({ type: "conversation.item.create", item: {
              type: "function_call_output", call_id: callId, output,
            }}));
            sendResponseCreate();
          })();
          return;
        }
        if (e.type === "response.function_call_arguments.done" && e.name === "play_song" && e.call_id) {
          void (async () => {
            let query = "";
            try { query = (JSON.parse(e.arguments ?? "{}") as { query?: string }).query?.trim() ?? ""; } catch {}
            const callId = e.call_id as string;
            let output = "그 노래를 못 찾았어요.";
            // "그만"/"다른 곡"을 음성으로 제어하려면 재생을 앱 안(임베드)에 붙들고
            // 있어야 한다 - 유튜브 앱으로 완전히 넘기면 편하지만 우리가 멈추거나
            // 바꿀 방법이 없다(사용자 확인). 임베드가 실패하는 영상도 있어서
            // (MusicOverlay.tsx의 onError에서 서버로 에러 코드를 올림 - 흔한 원인은
            // 업로더가 임베드 재생 자체를 막아둔 경우) 실패하면 그 자리에서 유튜브로
            // 폴백하되, 우선은 임베드로 시도해 음성 제어가 되게 한다.
            if (query) {
              const searchRes = await fetch("/api/music/search", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }),
                signal: AbortSignal.timeout(10000),
              }).catch(() => null);
              const payload = (await searchRes?.json().catch(() => ({}))) as { videoId?: string | null; title?: string } | undefined;
              if (payload?.videoId && payload.title) {
                setMusicOverlay({ videoId: payload.videoId, title: payload.title });
                void fetch("/api/music/history", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title: payload.title, videoId: payload.videoId }),
                }).catch(() => {});
                output = `"${payload.title}"을(를) 재생을 시작했어요.`;
              } else {
                window.Android?.openYoutubeSearch?.(query);
                output = `"${query}"을(를) 유튜브에서 열었어요.`;
              }
            }
            dataChannel.send(JSON.stringify({ type: "conversation.item.create", item: {
              type: "function_call_output", call_id: callId, output,
            }}));
            sendResponseCreate();
          })();
          return;
        }
        if (e.type === "response.function_call_arguments.done" && e.name === "trigger_emergency" && e.call_id) {
          void (async () => {
            let detail = "환자 긴급 SOS 요청";
            try { detail = (JSON.parse(e.arguments ?? "{}") as { detail?: string }).detail?.trim() || detail; } catch {}
            const callId = e.call_id as string;
            await fetch("/api/emergency", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ triggerType: "voice_distress", detail }),
            }).catch(() => null);

            dataChannel.send(JSON.stringify({ type: "conversation.item.create", item: {
              type: "function_call_output", call_id: callId, output: "보호자분께 긴급 SOS 신호를 즉시 보냈습니다.",
            }}));
            sendResponseCreate();
          })();
          return;
        }
        if (e.type === "response.function_call_arguments.done" && e.name === "stop_song" && e.call_id) {
          setMusicOverlay(null);
          dataChannel.send(JSON.stringify({ type: "conversation.item.create", item: {
            type: "function_call_output", call_id: e.call_id, output: "재생을 멈췄어요.",
          }}));
          sendResponseCreate();
          return;
        }
        switch (e.type) {
          case "input_audio_buffer.speech_started":
            setPhase("transcribing");
            setVadUserSpeaking(true);
            lastUserSpeechAtRef.current = Date.now();
            checkInSentAtRef.current = null;
            sessionTimeoutFiredRef.current = false;
            break;
          case "input_audio_buffer.speech_stopped":
            setVadUserSpeaking(false);
            setPhase("thinking");
            break;
          case "output_audio_buffer.started":
            setPhase("speaking");
            break;
          case "response.created":
            responseActiveRef.current = true;
            break;
          case "response.done":
            onResponseSlotFreed();
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
          case "conversation.item.created": {
            const rawEvent = e as any;
            if (rawEvent.item?.role === "user") {
              const text = (rawEvent.item?.content?.[0]?.transcript || rawEvent.item?.content?.[0]?.text || rawEvent.transcript || "").trim();
              if (text) handleUserTranscript(text);
            }
            break;
          }
          case "conversation.item.input_audio_transcription.completed": {
            const rawEvent = e as any;
            const transcript: string = (rawEvent.transcript ?? rawEvent.item?.content?.[0]?.transcript ?? "").trim();
            if (transcript) handleUserTranscript(transcript);

            if (END_CONVERSATION_PATTERN.test(transcript.trim())) {
              if (window.Android?.closeApp) {
                window.Android.closeApp();
              } else if (typeof navigator !== "undefined" && (navigator as any).app?.exitApp) {
                (navigator as any).app.exitApp();
              }
              try { peerConnectionRef.current?.close(); } catch {}
              setPhase("listening");
            }
            break;
          }
          case "error":
            setErrorMsg(e.error?.message ?? "오류가 발생했습니다.");
            // 에러가 나면 response.done이 영영 안 올 수 있다 - 응답 슬롯을 점유한 채로
            // 두면 큐에 쌓인 response.create가 영원히 못 나가고, phase도 "생각 중"에
            // 멈춘 채로 굳는다. 슬롯을 비우고(큐 있으면 바로 흘려보내고) 리스닝으로 돌린다.
            onResponseSlotFreed();
            setPhase("listening");
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
      if (sessionTimeoutIntervalRef.current !== null) clearInterval(sessionTimeoutIntervalRef.current);
      sessionTimeoutIntervalRef.current = null;
      if (audioFrameRef.current !== null) cancelAnimationFrame(audioFrameRef.current);
      audioFrameRef.current = null;
      audioAnalyserRef.current = null;
      lipsyncRef.current = null;
      void audioContextRef.current?.close();
      audioContextRef.current = null;
      setSpeakingLevel(0);
      setViseme("viseme_sil");
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
    viseme,
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
