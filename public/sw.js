// 보호자 브라우저에서 Web Push 알림만 처리하는 최소 서비스워커.
// 오프라인 캐싱 등은 다루지 않는다 - 이 앱은 알림 표시가 유일한 목적이다.

self.addEventListener("push", (event) => {
  let payload = { title: "뉴로케어", body: "새 알림이 있습니다.", url: "/guardian" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // JSON이 아니면 기본값 그대로 표시한다.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/guardian";
  event.waitUntil(self.clients.openWindow(url));
});
