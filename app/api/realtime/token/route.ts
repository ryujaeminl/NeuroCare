import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/authOptions";
import { prisma } from "@/lib/db/prisma";
import { buildFamilyRoster } from "@/lib/memory/familyContext";
import { buildBasePersonaPrompt } from "@/lib/persona";
import type { DementiaStage } from "@/lib/db/types";

// gpt-realtime 배포는 Azure OpenAI 쪽(openai.azure.com) 엔드포인트를 쓴다 - Foundry Claude
// 채팅과 같은 Cognitive Services 리소스/키를 공유하지만 API 형태가 다르고 아직
// @anthropic-ai/foundry-sdk나 openai SDK가 이 GA 엔드포인트를 감싸주지 않아 raw fetch로
// 호출한다. 임시토큰(ephemeral token)은 여기서만 발급하고 실제 키는 브라우저에 절대
// 안 보낸다 - 브라우저는 이 임시토큰으로만 Azure와 WebRTC 연결한다.
const AZURE_RESOURCE = process.env.ANTHROPIC_FOUNDRY_RESOURCE;
const AZURE_API_KEY = process.env.ANTHROPIC_FOUNDRY_API_KEY;
const REALTIME_DEPLOYMENT = process.env.REALTIME_DEPLOYMENT || "gpt-realtime";
// Azure Foundry에 아직 트랜스크립션 모델이 배포되지 않아 기본값을 주지 않는다 - 배포 후
// 이 배포 이름을 env에 채워 넣으면 자동으로 입력 트랜스크립션이 활성화된다.
const REALTIME_TRANSCRIPTION_DEPLOYMENT = process.env.REALTIME_TRANSCRIPTION_DEPLOYMENT;

export async function GET() {
  if (!AZURE_RESOURCE || !AZURE_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_FOUNDRY_RESOURCE / ANTHROPIC_FOUNDRY_API_KEY가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const session = await auth();
  if (session?.user?.role !== "patient") {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const patientId = session.user.id;

  const [roster, patientRecord] = await Promise.all([
    buildFamilyRoster(patientId),
    prisma.user.findUnique({ where: { id: patientId }, select: { dementiaStage: true } }),
  ]);
  const dementiaStage = (patientRecord?.dementiaStage as DementiaStage | null) ?? "moderate";

  let instructions = buildBasePersonaPrompt(dementiaStage);
  if (roster) {
    instructions += `

[등록된 가족 관계]
아래는 보호자가 미리 등록해 둔, 확인된 가족 관계입니다. 대화 중 가족 이야기가 나오면 이 정보만 사용하세요.
아래 목록에 없는 가족 관계는 추측하거나 지어내지 마세요.
${roster}`;
  }

  if (!REALTIME_TRANSCRIPTION_DEPLOYMENT) {
    console.error(
      "REALTIME_TRANSCRIPTION_DEPLOYMENT가 설정되지 않아 입력 트랜스크립션이 비활성화됩니다 - 응급감지/음성 기반 대화종료 기능이 동작하지 않습니다. Azure Foundry에 트랜스크립션 모델을 배포한 뒤 env를 설정하세요.",
    );
  }

  const audio = REALTIME_TRANSCRIPTION_DEPLOYMENT
    ? {
        output: { voice: "marin" },
        input: { transcription: { model: REALTIME_TRANSCRIPTION_DEPLOYMENT } },
      }
    : { output: { voice: "marin" } };

  const azureRes = await fetch(
    `https://${AZURE_RESOURCE}.openai.azure.com/openai/v1/realtime/client_secrets`,
    {
      method: "POST",
      headers: { "api-key": AZURE_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: REALTIME_DEPLOYMENT,
          instructions,
          audio,
        },
      }),
    },
  );

  if (!azureRes.ok) {
    const detail = await azureRes.text().catch(() => "");
    return NextResponse.json(
      { error: `Azure Realtime 토큰 발급 실패 (${azureRes.status}): ${detail}` },
      { status: 502 },
    );
  }

  const data = (await azureRes.json()) as { value?: string };
  if (!data.value) {
    return NextResponse.json({ error: "토큰 응답에 value가 없습니다." }, { status: 502 });
  }

  return NextResponse.json({ token: data.value, resource: AZURE_RESOURCE, deployment: REALTIME_DEPLOYMENT });
}
