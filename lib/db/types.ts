/**
 * SQLite에는 enum/배열 타입이 없어 스키마에서는 문자열로 저장한다.
 * 앱 쪽에서는 이 유니온 타입과 파서로 안전하게 다룬다.
 */

export type UserRole = "patient" | "guardian";

export const MOOD_VALUES = ["positive", "neutral", "anxious", "confused", "sad"] as const;
export type Mood = (typeof MOOD_VALUES)[number];

export type TurnRole = "user" | "assistant";

export function isUserRole(value: string): value is UserRole {
  return value === "patient" || value === "guardian";
}

export function isMood(value: string): value is Mood {
  return (MOOD_VALUES as readonly string[]).includes(value);
}

/** MoodAnalysis.notableMoments는 JSON 문자열 배열로 저장된다. 깨져 있어도 화면이 죽지 않게 방어한다. */
export function parseNotableMoments(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function serializeNotableMoments(moments: string[]): string {
  return JSON.stringify(moments);
}

/** Memory.tags도 notableMoments와 같은 JSON 문자열 배열 패턴이다. */
export function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function serializeTags(tags: string[]): string {
  return JSON.stringify(tags);
}

const TIME_HHMM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeString(value: string): boolean {
  return TIME_HHMM_PATTERN.test(value);
}

/** Medication.reminderTimes도 tags와 같은 JSON 문자열 배열 패턴("HH:MM" 24시간제). */
export function parseReminderTimes(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && isValidTimeString(v)) : [];
  } catch {
    return [];
  }
}

export function serializeReminderTimes(times: string[]): string {
  return JSON.stringify(times.filter(isValidTimeString));
}

export const DEFAULT_WIDGET_ORDER = ["mood", "medication", "family"] as const;
export type WidgetId = (typeof DEFAULT_WIDGET_ORDER)[number];

export interface DashboardLayout {
  order: WidgetId[];
}

/** GuardianPreference.dashboardLayout은 JSON 문자열이다. 깨져 있거나 없으면 기본 순서로 돌아간다. */
export function parseDashboardLayout(raw: string | null): DashboardLayout {
  if (!raw) return { order: [...DEFAULT_WIDGET_ORDER] };
  try {
    const parsed = JSON.parse(raw);
    const order = Array.isArray(parsed?.order)
      ? parsed.order.filter((v: unknown): v is WidgetId =>
          (DEFAULT_WIDGET_ORDER as readonly string[]).includes(String(v)),
        )
      : [];
    // 순서에 빠진 위젯이 있으면 기본 순서 뒤에 이어붙여서 완전히 사라지지 않게 한다.
    const missing = DEFAULT_WIDGET_ORDER.filter((id) => !order.includes(id));
    return { order: [...order, ...missing] };
  } catch {
    return { order: [...DEFAULT_WIDGET_ORDER] };
  }
}

export function serializeDashboardLayout(layout: DashboardLayout): string {
  return JSON.stringify(layout);
}

export const ALERT_THRESHOLD_VALUES = ["sensitive", "moderate", "low"] as const;
export type AlertThreshold = (typeof ALERT_THRESHOLD_VALUES)[number];

export const NOTIFICATION_CHANNEL_VALUES = ["push", "email", "sms", "none"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNEL_VALUES)[number];

/**
 * 기분이 얼마나 우려되는지의 정도. positive/neutral은 걱정할 것이 없어 0이다.
 * MoodChart.tsx의 MOOD_LEVEL(긍정성 축)과는 다른 축이라 별도로 둔다.
 */
export const MOOD_CONCERN_LEVEL: Record<Mood, number> = {
  positive: 0,
  neutral: 0,
  confused: 1,
  anxious: 2,
  sad: 3,
};

/** 보호자의 민감도 설정이 이 기분을 알림 대상으로 보는지 판단한다. */
export function meetsAlertThreshold(mood: Mood, threshold: AlertThreshold): boolean {
  const level = MOOD_CONCERN_LEVEL[mood];
  if (threshold === "sensitive") return level >= 1;
  if (threshold === "moderate") return level >= 2;
  return level >= 3;
}

/** 기분 값을 화면에 표시할 한국어 라벨과 색으로 옮긴다. */
export const MOOD_LABELS: Record<Mood, { label: string; emoji: string; className: string }> = {
  positive: { label: "긍정적", emoji: "😊", className: "text-emerald-300" },
  neutral: { label: "평온함", emoji: "🙂", className: "text-sky-300" },
  anxious: { label: "불안함", emoji: "😟", className: "text-amber-300" },
  confused: { label: "혼란스러움", emoji: "😕", className: "text-orange-300" },
  sad: { label: "가라앉음", emoji: "😔", className: "text-rose-300" },
};
