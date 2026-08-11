"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { encodeWav } from "@/lib/audio/encodeWav";

const REQUIRED_SECONDS = 8;
const SAMPLE_RATE = 16000;

const ENROLL_SCRIPT =
  "안녕하세요. 오늘은 날씨가 참 좋네요. 저는 아침에 밥을 먹고 산책을 다녀왔습니다. 가족들과 함께 보내는 시간이 가장 즐겁습니다.";

type Status = "idle" | "recording" | "uploading";

/**
 * 본인 목소리를 등록해두면, 이후 TV 소리나 다른 사람 목소리는 대화로 인식되지 않는다.
 * 등록에는 몇 초 이상의 연속된 발화가 필요해서 문장을 읽도록 안내한다.
 */
export function VoiceEnrollment() {
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [secondsLeft, setSecondsLeft] = useState(REQUIRED_SECONDS);
  const [message, setMessage] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  useEffect(() => {
    async function loadStatus() {
      try {
        const response = await fetch("/api/enroll");
        if (!response.ok) {
          setEnrolled(false);
          return;
        }
        const data = (await response.json()) as { enrolled?: boolean };
        setEnrolled(Boolean(data.enrolled));
      } catch {
        setEnrolled(false);
      }
    }
    void loadStatus();
  }, []);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const upload = useCallback(async () => {
    setStatus("uploading");
    const merged = chunksRef.current.reduce<number[]>((acc, chunk) => {
      acc.push(...chunk);
      return acc;
    }, []);
    chunksRef.current = [];

    try {
      const wav = encodeWav(Float32Array.from(merged), SAMPLE_RATE);
      const form = new FormData();
      form.append("file", wav, "enroll.wav");

      const response = await fetch("/api/enroll", { method: "POST", body: form });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error ?? "등록에 실패했습니다.");
        setEnrolled(false);
      } else {
        setMessage("목소리가 등록되었습니다. 이제 본인 목소리만 인식합니다.");
        setEnrolled(true);
      }
    } catch {
      setMessage("등록에 실패했습니다.");
    } finally {
      setStatus("idle");
      setSecondsLeft(REQUIRED_SECONDS);
    }
  }, []);

  const startRecording = useCallback(async () => {
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const context = new AudioContext({ sampleRate: SAMPLE_RATE });
      contextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);

      chunksRef.current = [];
      processor.onaudioprocess = (event) => {
        chunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(context.destination);

      setStatus("recording");
      setSecondsLeft(REQUIRED_SECONDS);

      const timer = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            processor.disconnect();
            source.disconnect();
            cleanup();
            void upload();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      setMessage("마이크를 사용할 수 없습니다.");
      setStatus("idle");
    }
  }, [cleanup, upload]);

  const removeEnrollment = useCallback(async () => {
    try {
      await fetch("/api/enroll", { method: "DELETE" });
      setEnrolled(false);
      setMessage("등록이 해제되었습니다. 이제 모든 목소리를 인식합니다.");
    } catch {
      setMessage("해제에 실패했습니다.");
    }
  }, []);

  return (
    <div className="rounded-xl border border-surface-border bg-surface p-5">
      <p className="font-semibold">내 목소리 등록</p>
      <p className="mt-1 text-sm text-muted-foreground">
        목소리를 등록하면 TV 소리나 다른 사람의 말은 대화로 인식하지 않습니다.
      </p>

      {enrolled === null && <p className="mt-3 text-sm text-muted-foreground">확인 중...</p>}

      {enrolled === true && status === "idle" && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-emerald-700">✓ 등록되어 있습니다</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={startRecording}
              className="rounded-full border border-surface-border px-4 py-2 text-sm hover:border-accent"
            >
              다시 등록
            </button>
            <button
              type="button"
              onClick={removeEnrollment}
              className="rounded-full border border-surface-border px-4 py-2 text-sm text-muted-foreground hover:border-danger-border hover:text-danger-foreground"
            >
              해제
            </button>
          </div>
        </div>
      )}

      {enrolled === false && status === "idle" && (
        <button
          type="button"
          onClick={startRecording}
          className="mt-3 w-full rounded-full bg-accent px-6 py-3 font-medium text-accent-foreground hover:brightness-110"
        >
          목소리 등록하기
        </button>
      )}

      {status === "recording" && (
        <div className="mt-3 rounded-xl border border-accent/40 bg-accent/10 p-4">
          <p className="text-sm text-muted-foreground">
            아래 문장을 편하게 읽어주세요. <span className="font-semibold text-accent">{secondsLeft}초</span>
          </p>
          <p className="mt-2 text-lg leading-relaxed">{ENROLL_SCRIPT}</p>
        </div>
      )}

      {status === "uploading" && <p className="mt-3 text-sm text-muted-foreground">등록 중...</p>}

      {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
