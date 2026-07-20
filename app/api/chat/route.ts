import { NextRequest, NextResponse } from 'next/server';
import { streamLLMResponse } from '@/lib/exaone';
import { retrieveMemory, storeMemory } from '@/lib/pinecone';

export async function POST(req: NextRequest) {
  try {
    const { userText, stage, history, patientId: requestPatientId } = await req.json();

    const patientId = requestPatientId || process.env.NEXT_PUBLIC_PATIENT_ID || 'patient_001';
    const memories = await retrieveMemory(patientId, userText);

    const systemPrompt = generateSystemPrompt(stage, memories);

    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = '';

        const onToken = (token: string) => {
          controller.enqueue(new TextEncoder().encode(`data: ${token}\n\n`));
        };

        const onComplete = () => {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
          storeMemory(patientId, userText, 'user_utterance');
          storeMemory(patientId, fullResponse, 'ai_response');
        };

        await streamLLMResponse(history, systemPrompt, onToken, onComplete);
      }
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat Error:', error);
    return new NextResponse('{"error":"채팅 처리 실패"}', {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function generateSystemPrompt(stage: string, memories: string[]) {
  const basePrompt = `
    당신은 'NeuroCare'라는 치매 환자 전문 회상 치료 동반자입니다.
    비정정 원칙: 환자의 틀린 발언을 절대 정정하지 말고 감정을 수용하십시오.
    정서적 공명: 과거의 감각(시각, 청각)을 떠올리도록 유도하십시오.
  `;

  const stagePrompts: Record<string, string> = {
    mild: "전략: 성인처럼 존중하며 대화하되, 최근 기억보다 오래된 기억을 먼저 꺼내십시오. 문장 길이: 3\~5 문장.",
    moderate: "전략: 긴 설명을 피하고, 1\~2 문장으로 명확하게 응답하십시오. 반복되더라도 매번 새롭게 공감하십시오.",
    severe: "전략: 질문을 최소화하고, 감각적인 단어로 응답하십시오. 문장 길이: 1 문장 이내. 질문형 응답 금지."
  };

  const memoryContext = memories.length > 0
    ? `\n\n# 참고 기억\n${memories.join('\n')}`
    : '';

  return `${basePrompt}\n\n# 현재 환자 단계: ${stage}\n${stagePrompts[stage] || stagePrompts.moderate}${memoryContext}`;
}