"use client";

import { useEffect } from "react";

/**
 * 기기에서만 보이는 오류를 서버 로그로 올려 원격에서 원인을 잡을 수 있게 한다.
 * 특히 마이크는 보안 컨텍스트가 아니면 navigator.mediaDevices 자체가 없어서,
 * 그 사실을 먼저 확인해야 인증서 문제인지 권한 문제인지 갈린다.
 * ponytail: 진단용. 원인이 잡히면 이 컴포넌트와 /api/client-log를 함께 지운다.
 */
export function ClientDiagnostics() {
  useEffect(() => {
    const report = (message: string) => {
      void fetch("/api/client-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      }).catch(() => undefined);
    };

    report(
      [
        `origin=${window.location.origin}`,
        `secureContext=${window.isSecureContext}`,
        `mediaDevices=${typeof navigator.mediaDevices}`,
        `getUserMedia=${typeof navigator.mediaDevices?.getUserMedia}`,
        `ua=${navigator.userAgent.slice(0, 120)}`,
      ].join(" | "),
    );

    const onError = (event: ErrorEvent) => {
      report(`JS오류: ${event.message} @ ${event.filename}:${event.lineno}`);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      report(`처리안된거부: ${String(event.reason).slice(0, 300)}`);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
