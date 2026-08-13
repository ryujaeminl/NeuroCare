import { prisma } from "@/lib/db/prisma";
import { parseReminderTimes } from "@/lib/db/types";
import { findDueDateKey } from "@/lib/guardian/medicationReminderDispatcher";

/** 홈 화면 배너와 realtime 음성 확인이 같은 창을 보게 맞춘다 - 서로 다르면 배너엔
 * 뜨는데 AI는 조용하거나 그 반대인 어긋난 상태가 생긴다. */
export const DUE_MEDICATION_WINDOW_MINUTES = 30;

export interface DueMedication {
  id: string;
  name: string;
  dosage: string;
  reminderTime: string;
  dateKey: string;
}

/**
 * 지금 시각 기준 복용 예정이면서 아직 MedicationConfirmation이 없는 약을 하나 찾는다.
 * 여러 개가 동시에 겹쳐도 가장 먼저 걸리는 슬롯 하나만 다룬다 - 홈 배너와 realtime
 * 프롬프트(app/api/realtime/token/route.ts) 양쪽에서 재사용한다.
 */
export async function findDueUnconfirmedMedication(patientId: string): Promise<DueMedication | null> {
  const now = new Date();
  const medications = await prisma.medication.findMany({
    where: { patientId, startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gte: now } }] },
    select: { id: true, name: true, dosage: true, reminderTimes: true },
  });

  for (const medication of medications) {
    for (const time of parseReminderTimes(medication.reminderTimes)) {
      const dateKey = findDueDateKey(time, now, DUE_MEDICATION_WINDOW_MINUTES);
      if (!dateKey) continue;
      const confirmed = await prisma.medicationConfirmation.findUnique({
        where: { medicationId_reminderTime_dateKey: { medicationId: medication.id, reminderTime: time, dateKey } },
      });
      if (confirmed) continue;
      return { id: medication.id, name: medication.name, dosage: medication.dosage, reminderTime: time, dateKey };
    }
  }
  return null;
}

/** 확인 처리 시점의 창(분) - 대화가 길어져 물어보고 답 듣기까지 시간이 걸려도 같은
 * "오늘 그 시간대" 슬롯으로 잡히도록 조회 창(30분)보다 훨씬 넉넉하게 잡는다. */
const CONFIRMATION_MATCH_WINDOW_MINUTES = 6 * 60;

/**
 * confirm_medication 호출 시점(app/api/realtime/medication-confirm/route.ts)에 어느
 * dateKey 슬롯으로 기록할지 계산한다. reminderTime이 오늘 안 슬롯이면 그 dateKey를,
 * 어떤 이유로든(자정을 넘겨 답하는 등) 못 찾으면 그냥 오늘 날짜로 떨어진다 - 클라이언트가
 * dateKey를 직접 넘길 필요 없이 서버가 항상 스스로 결정한다.
 */
export function resolveConfirmationDateKey(reminderTime: string, now: Date): string {
  return (
    findDueDateKey(reminderTime, now, CONFIRMATION_MATCH_WINDOW_MINUTES) ??
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now)
  );
}

/** realtime 세션 instructions에 그대로 끼워 넣을 블록. 없으면 null. */
export async function buildDueMedicationContext(patientId: string): Promise<string | null> {
  const due = await findDueUnconfirmedMedication(patientId);
  if (!due) return null;

  return `[복용 예정 약]
지금(${due.reminderTime}) 복용 예정인 약이 있고, 환자가 아직 드셨는지 확인되지 않았습니다.
- medicationId: ${due.id}
- reminderTime: ${due.reminderTime}
- 약: ${due.name} (${due.dosage})`;
}
