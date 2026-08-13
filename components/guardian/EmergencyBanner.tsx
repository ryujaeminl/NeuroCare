"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface OpenEvent {
  id: string;
  triggerType: string;
  createdAt: string;
  patient: { name: string };
}

const POLL_MS = 3_000;

/** Active guardian screens jump straight to the emergency page instead of requiring a banner tap. */
export function EmergencyBanner() {
  const [events, setEvents] = useState<OpenEvent[]>([]);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch("/api/emergency", { cache: "no-store" });
        const data = await response.json();
        if (!cancelled && response.ok) setEvents(data.events ?? []);
      } catch {
        // This is a best-effort foreground check; push/SMS still handle fallback paths.
      }
    }

    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const firstOpenEvent = events[0];
    if (!firstOpenEvent) return;

    const emergencyPath = `/guardian/emergency/${firstOpenEvent.id}`;
    if (pathname !== emergencyPath) router.replace(emergencyPath);
  }, [events, pathname, router]);

  return null;
}
