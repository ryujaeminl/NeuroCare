"use client";

import { useEffect, useState } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** VAPID 공개키는 base64url 문자열로 오지만 pushManager.subscribe는 Uint8Array를 요구한다. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** 긴급 알림/기분 알림을 브라우저 푸시로 받기 위한 구독 버튼. VAPID 미설정이면 아예 숨긴다. */
export function PushOptIn() {
  const [status, setStatus] = useState<"idle" | "subscribed" | "denied">("idle");
  const [error, setError] = useState<string | null>(null);

  // 브라우저 지원 여부는 렌더 중 계산하는 값이라 상태로 두지 않는다(react-hooks/set-state-in-effect).
  const unsupported = typeof navigator === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window);

  useEffect(() => {
    if (unsupported) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((sub) => {
        if (sub) setStatus("subscribed");
      })
      .catch(() => {});
  }, [unsupported]);

  async function subscribe() {
    setError(null);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
      });
      const json = subscription.toJSON();

      const response = await fetch("/api/guardian/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!response.ok) throw new Error();
      setStatus("subscribed");
    } catch {
      setError("알림 구독에 실패했습니다.");
    }
  }

  if (!VAPID_PUBLIC_KEY || unsupported) return null;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-surface-border bg-surface p-5">
      <h3 className="font-semibold">브라우저 알림</h3>
      {status === "subscribed" ? (
        <p className="text-sm text-emerald-300">이 브라우저에서 알림을 받을 수 있어요.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            긴급 상황과 기분 알림을 이 브라우저로도 받으려면 알림을 허용해주세요.
          </p>
          <button
            type="button"
            onClick={subscribe}
            className="w-fit rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:brightness-110"
          >
            알림 받기
          </button>
          {status === "denied" && (
            <p className="text-sm text-danger-foreground">브라우저 알림 권한이 거부되어 있습니다.</p>
          )}
        </>
      )}
      {error && <p className="text-sm text-danger-foreground">{error}</p>}
    </div>
  );
}
