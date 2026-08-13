import { prisma } from "@/lib/db/prisma";

/** 학습된 평소 기상시간대와 지금이 이만큼(분) 안이면 "평소 시간대"로 본다. */
const WAKE_TIME_TOLERANCE_MINUTES = 90;
/** 과거 기록이 부족할 때(3일 미만) 대신 쓰는 기본 아침 시간대. */
const DEFAULT_MORNING_WINDOW = { startMinutes: 6 * 60, endMinutes: 11 * 60 };
/** 평균을 낼 때 참고하는 최근 세션 수 - 너무 오래된 습관까지 반영하지 않는다. */
const HISTORY_SESSION_COUNT = 14;

function kstMinutesOfDay(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function todayDateKeyKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

/**
 * ConversationSession.startedAt(+dateKey 유니크 제약으로 "하루 첫 세션 시각"이 곧
 * 그날의 첫 대화 시각)을 그대로 기상시간 학습 데이터로 재사용한다 - 별도 로그 테이블
 * 없이도 이미 하루에 한 번, 대화 시작 시각이 기록되고 있었다.
 *
 * 오늘 이미 세션이 있으면(=오늘 첫 대화가 아니면) null - 아침 인사는 하루 한 번만.
 * 과거 세션이 3개 미만이면 학습된 패턴이 없다고 보고 널리 알려진 아침 시간대(06~11시)만
 * 기본값으로 쓴다. 그 이상 쌓였으면 최근 세션들의 평균 시각과 지금이 90분 이내인지로
 * 판단한다.
 */
export async function buildMorningGreetingContext(patientId: string): Promise<string | null> {
  const todaySession = await prisma.conversationSession.findUnique({
    where: { patientId_dateKey: { patientId, dateKey: todayDateKeyKst() } },
  });
  if (todaySession) return null;

  const now = new Date();
  const nowMinutes = kstMinutesOfDay(now);

  const history = await prisma.conversationSession.findMany({
    where: { patientId, dateKey: { not: null } },
    orderBy: { startedAt: "desc" },
    take: HISTORY_SESSION_COUNT,
    select: { startedAt: true },
  });

  const isMorningTime =
    history.length < 3
      ? nowMinutes >= DEFAULT_MORNING_WINDOW.startMinutes && nowMinutes <= DEFAULT_MORNING_WINDOW.endMinutes
      : (() => {
          const avgMinutes = history.reduce((sum, s) => sum + kstMinutesOfDay(s.startedAt), 0) / history.length;
          return Math.abs(nowMinutes - avgMinutes) <= WAKE_TIME_TOLERANCE_MINUTES;
        })();

  if (!isMorningTime) return null;

  return `[아침 인사]
오늘 첫 대화이고 평소 대화를 시작하시던 시간대입니다. 대화를 시작할 때 자연스럽게
"OO님, 안녕히 주무셨어요?"처럼 짧게 아침 안부를 물어보고 나서 원래 하려던 이야기로
넘어가세요. 이미 다른 인사나 용건으로 대화가 시작됐으면 억지로 끼워 넣지 마세요.`;
}
