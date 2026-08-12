import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/authOptions";

/** Azure OpenAI Responses API 원본 JSON 응답 중 텍스트 추출에 필요한 필드만 타입화한다. */
interface ResponsesApiOutputTextPart {
  type: "output_text";
  text: string;
}
interface ResponsesApiMessageItem {
  type: "message";
  content?: Array<ResponsesApiOutputTextPart | { type: string }>;
}
interface ResponsesApiResult {
  output?: Array<ResponsesApiMessageItem | { type: string }>;
}

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const model = process.env.AZURE_OPENAI_RESPONSES_MODEL ?? "gpt-5.4-mini";

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "patient") return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  if (!endpoint || !apiKey) return NextResponse.json({ error: "Azure OpenAI 검색 환경변수가 설정되지 않았습니다." }, { status: 500 });
  const body = (await request.json().catch(() => null)) as { query?: string } | null;
  const query = body?.query?.trim();
  if (!query) return NextResponse.json({ error: "검색어가 필요합니다." }, { status: 400 });

  const response = await fetch(`${endpoint.replace(/\/$/, "")}/openai/v1/responses`, {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ model, tools: [{ type: "web_search" }], input: query }),
  });
  const raw = await response.text();
  if (!response.ok) return NextResponse.json({ error: `Azure 웹 검색 실패 (${response.status})`, detail: raw }, { status: 502 });
  const data = JSON.parse(raw) as ResponsesApiResult;
  const text = (data.output ?? [])
    .filter((item): item is ResponsesApiMessageItem => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part): part is ResponsesApiOutputTextPart => part.type === "output_text")
    .map((part) => part.text)
    .join("");
  return NextResponse.json({ result: text || "검색 결과를 찾지 못했습니다." });
}
