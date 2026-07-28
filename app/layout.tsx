import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClientDiagnostics } from "@/components/ClientDiagnostics";
import { Providers } from "@/components/Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "뉴로케어",
  description: "AI 기억회상 음성 대화 앱",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClientDiagnostics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
