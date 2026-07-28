import { NextRequest } from "next/server";

/**
 * WebView 안에서 난 오류는 기기에서만 보이고 개발자에게는 닿지 않는다.
 * 원격 진단을 위해 클라이언트 오류를 서버 로그로 끌어올린다.
 * ponytail: 진단용. 원인이 잡히면 이 라우트와 ClientDiagnostics를 함께 지운다.
 */
export async function POST(request: NextRequest) {
  const { message } = (await request.json()) as { message?: string };
  console.error(`[기기] ${String(message).slice(0, 500)}`);
  return Response.json({ ok: true });
}
