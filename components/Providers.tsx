"use client";

import { SessionProvider } from "next-auth/react";
import { RealtimeConversationProvider } from "@/components/RealtimeConversationProvider";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <RealtimeConversationProvider>{children}</RealtimeConversationProvider>
    </SessionProvider>
  );
}
