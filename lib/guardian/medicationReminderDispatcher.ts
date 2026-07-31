import { prisma } from "@/lib/db/prisma";
import { parseReminderTimes, type NotificationChannel } from "@/lib/db/types";
import { notifyGuardianByChannel } from "@/lib/guardian/notify";

/** 정확히 그 분에 크론이 안 걸려도 놓치지 않도록 봐주는 여유 창(분). */
const DUE_WINDOW_MINUTES = 15;

// 보호자 앱(../Neurocaremam)은 별도 오리진에서 뜬다 - 알림 클릭 시 그 앱의 URL을 절대경로로 열어야 한다.
const GUARDIAN_APP_URL = process.env.GUARDIAN_APP_URL || "http://localhost:3001";

/** KST는 DST 없이 항상 UTC+9로 고정이라, 오프셋을 직접 문자열에 박아 넣으면 서버가
 * 어느 시간대에서 돌든(Vercel은 보통 UTC) 항상 정확한 순간(instant)을 얻는다. */
function kstInstant(dateKey: string, hhmm: string): Date {
  return new Date(`${dateKey}T${hhmm}:00+09:00`);
}

function todayKstDateKey(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(dateKey: string, days: number): string {
  const d = kstInstant(dateKey, "00:00");
  d.setUTCDate(d.getUTCDate() + days);
  return todayKstDateKey(d);
}

/**
 * "HH:MM"이 예약된 실제 날짜(dateKey)를 실시간 타임스탬프로 찾아낸다 - "오늘 날짜의
 * HH:MM"과 "어제 날짜의 HH:MM" 두 후보의 실제 순간을 각각 계산해 지금이 [그 순간, 그
 * 순간+windowMinutes] 안에 드는 쪽을 찾는다. 자정 근처 시각(예: 23:55)도 문자열
 * 뺄셈(HH:MM끼리 단순 분 차이) 방식과 달리 정확히 처리된다 - 그 방식은 자정을 걸친
 * 체크가 서로 다른 dateKey로 쪼개져 놓치거나 중복 발송될 수 있었다
 * (scripts/check-reminder-scheduling.ts로 확인). 이 함수가 찾은 dateKey를 그대로
 * dedup 키(MedicationReminderLog)에 써서 그 문제를 없앤다.
 * export: 위 스크립트에서 이 로직만 DB 없이 따로 검증하려고.
 */
export function findDueDateKey(hhmm: string, now: Date, windowMinutes: number): string | null {
  const today = todayKstDateKey(now);
  for (const candidateDateKey of [today, addDays(today, -1)]) {
    const diffMinutes = (now.getTime() - kstInstant(candidateDateKey, hhmm).getTime()) / 60_000;
    if (diffMinutes >= 0 && diffMinutes <= windowMinutes) return candidateDateKey;
  }
  return null;
}

interface DueMedication {
  id: string;
  patientId: string;
  name: string;
  dosage: string;
  patient: { name: string };
}

/**
 * GPU 서버(rookie)의 crontab이 5~15분마다 이 함수를 호출한다(app/api/cron/medication-reminders
 * 경유) - Vercel Hobby 플랜의 Cron Jobs는 하루 1회로 제한돼 하루 여러 번 확인해야 하는
 * 복약 알림엔 못 쓴다. 이미 상시 구동 중인 GPU 서버를 재사용한다.
 * MedicationReminderLog로 같은 (약, 시각, 날짜) 슬롯의 중복 발송을 막는다.
 */
export async function checkAndSendMedicationReminders(): Promise<{ checked: number; sent: number }> {
  const now = new Date();

  const medications = await prisma.medication.findMany({
    where: {
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    include: { patient: { select: { name: true } } },
  });

  let checked = 0;
  let sent = 0;

  for (const medication of medications) {
    for (const time of parseReminderTimes(medication.reminderTimes)) {
      checked += 1;
      const dueDateKey = findDueDateKey(time, now, DUE_WINDOW_MINUTES);
      if (!dueDateKey) continue;

      try {
        await prisma.medicationReminderLog.create({
          data: { medicationId: medication.id, reminderTime: time, dateKey: dueDateKey },
        });
      } catch {
        continue; // 유니크 제약 위반 = 이 슬롯엔 이미 보냈다는 뜻. 중복 발송 방지.
      }

      await sendMedicationReminder(medication, time);
      sent += 1;
    }
  }

  return { checked, sent };
}

async function sendMedicationReminder(medication: DueMedication, time: string): Promise<void> {
  const links = await prisma.patientGuardianLink.findMany({
    where: { patientId: medication.patientId },
    select: { guardianId: true },
  });
  if (links.length === 0) return;

  const guardianIds = links.map((l) => l.guardianId);
  const preferences = await prisma.guardianPreference.findMany({ where: { guardianId: { in: guardianIds } } });
  const prefByGuardian = new Map(preferences.map((p) => [p.guardianId, p]));

  const payload = {
    title: `${medication.patient.name}님 복약 시간 (${time})`,
    body: `${medication.name} ${medication.dosage} 드실 시간이에요.`,
    url: GUARDIAN_APP_URL,
  };

  await Promise.all(
    guardianIds.map((guardianId) => {
      const pref = prefByGuardian.get(guardianId);
      if (!(pref?.medicationReminderOptIn ?? false)) return Promise.resolve();
      const channel = (pref?.notificationChannel ?? "push") as NotificationChannel;
      return notifyGuardianByChannel(guardianId, channel, payload);
    }),
  );
}
