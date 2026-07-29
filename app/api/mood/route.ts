import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requirePatientSelf } from "@/lib/auth/permissions";
import { analyzeMood } from "@/lib/moodAnalysis";
import { serializeNotableMoments } from "@/lib/db/types";
import { dispatchMoodAlerts } from "@/lib/guardian/alertDispatcher";
import { dispatchEmergency } from "@/lib/guardian/emergencyDispatcher";

/** 이 이상으로 확신하며 "가라앉음"이 나오면 일반 알림을 넘어 긴급 알림까지 보낸다. */
const CRITICAL_MOOD_CONFIDENCE = 0.85;

/** POST - 세션을 종료하고 그날 대화의 정서적 톤을 분석해 저장한다. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePatientSelf();
    // final=true는 세션을 정말 끝낼 때만. 대화 도중 중간 분석은 세션을 닫지 않는다.
    const { sessionId, final } = (await request.json()) as {
      sessionId?: string;
      final?: boolean;
    };

    if (!sessionId) {
      return Response.json({ error: "sessionId가 필요합니다." }, { status: 400 });
    }

    const conversation = await prisma.conversationSession.findUnique({
      where: { id: sessionId },
      select: {
        patientId: true,
        turns: { select: { role: true, text: true }, orderBy: { createdAt: "asc" } },
      },
    });

    if (!conversation || conversation.patientId !== auth.user.id) {
      return Response.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
    }

    if (final) {
      await prisma.conversationSession.update({
        where: { id: sessionId },
        data: { endedAt: new Date() },
      });
    }

    // 대화가 너무 짧으면 정서를 읽어낼 근거가 없으므로 분석을 건너뛴다.
    if (conversation.turns.length < 2) {
      return Response.json({ analyzed: false, reason: "대화가 너무 짧습니다." });
    }

    const result = await analyzeMood(conversation.turns, auth.user.name ?? "환자");

    const saved = await prisma.moodAnalysis.upsert({
      where: { sessionId },
      update: {
        mood: result.mood,
        confidence: result.confidence,
        summary: result.summary,
        notableMoments: serializeNotableMoments(result.notableMoments),
      },
      create: {
        sessionId,
        mood: result.mood,
        confidence: result.confidence,
        summary: result.summary,
        notableMoments: serializeNotableMoments(result.notableMoments),
      },
      select: { mood: true, confidence: true, summary: true },
    });

    // 알림 발송 실패가 기분 분석 저장 자체를 실패로 만들면 안 되므로 별도로 감싼다.
    try {
      await dispatchMoodAlerts(auth.user.id, auth.user.name ?? "환자", result.mood, saved.summary);

      if (result.mood === "sad" && result.confidence >= CRITICAL_MOOD_CONFIDENCE) {
        const event = await prisma.emergencyEvent.create({
          data: { patientId: auth.user.id, triggerType: "mood_critical", detail: saved.summary },
        });
        await dispatchEmergency(event.id);
      }
    } catch (alertErr) {
      console.error("기분 알림 발송 실패:", alertErr);
    }

    return Response.json({ analyzed: true, mood: saved });
  } catch (err) {
    const authResponse = authErrorResponse(err);
    if (authResponse) return authResponse;

    // 원인을 서버 로그에는 남기되, 클라이언트에는 내부 오류를 노출하지 않는다.
    console.error("기분 분석 실패:", err);
    return Response.json({ error: "기분 분석 실패" }, { status: 500 });
  }
}
