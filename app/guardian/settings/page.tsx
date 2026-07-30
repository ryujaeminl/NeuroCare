"use client";

import { useEffect, useState } from "react";
import { DashboardLayoutEditor } from "@/components/guardian/DashboardLayoutEditor";
import { PushOptIn } from "@/components/guardian/PushOptIn";
import { useLinkedPatients } from "@/hooks/useLinkedPatients";
import {
  ALERT_THRESHOLD_VALUES,
  NOTIFICATION_CHANNEL_VALUES,
  type AlertThreshold,
  type NotificationChannel,
  type WidgetId,
} from "@/lib/db/types";

interface PreferenceState {
  moodAlertEnabled: boolean;
  moodAlertThreshold: AlertThreshold;
  medicationReminderOptIn: boolean;
  defaultPatientId: string | null;
  dashboardOrder: WidgetId[];
  notificationChannel: NotificationChannel;
  phone: string;
}

const THRESHOLD_LABELS: Record<AlertThreshold, string> = {
  sensitive: "민감하게 (혼란/불안/가라앉음 모두)",
  moderate: "보통 (불안/가라앉음)",
  low: "낮게 (많이 가라앉았을 때만)",
};

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  push: "브라우저 푸시 알림",
  email: "이메일",
  sms: "문자(SMS)",
  none: "받지 않음",
};

export default function SettingsPage() {
  const { patients, loading: loadingPatients } = useLinkedPatients();
  const [pref, setPref] = useState<PreferenceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [phoneInput, setPhoneInput] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/guardian/preferences");
        const data = await response.json();
        if (!response.ok) {
          setError(data.error ?? "설정을 불러오지 못했습니다.");
          return;
        }
        setPref(data.preference);
        setPhoneInput(data.preference.phone ?? "");
      } catch {
        setError("설정을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function save(patch: Partial<PreferenceState>) {
    if (!pref) return;
    const next = { ...pref, ...patch };
    setPref(next);
    setSaving(true);
    try {
      const response = await fetch("/api/guardian/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      setPref(data.preference);
      setError(null);
      setSavedAt(Date.now());
    } catch {
      setError("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || loadingPatients) return <p className="text-muted-foreground">불러오는 중...</p>;
  if (!pref) return <p className="text-danger-foreground">{error ?? "설정을 불러오지 못했습니다."}</p>;

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <h2 className="text-lg font-semibold">알림 설정</h2>

      <PushOptIn />

      <section className="flex flex-col gap-4 rounded-2xl border border-surface-border bg-surface p-5">
        <label className="flex items-center justify-between gap-4">
          <span>기분 이상 신호 알림</span>
          <input
            type="checkbox"
            checked={pref.moodAlertEnabled}
            onChange={(e) => save({ moodAlertEnabled: e.target.checked })}
            className="h-5 w-5 accent-accent"
          />
        </label>

        {pref.moodAlertEnabled && (
          <label className="flex flex-col gap-1 text-sm">
            민감도
            <select
              value={pref.moodAlertThreshold}
              onChange={(e) => save({ moodAlertThreshold: e.target.value as AlertThreshold })}
              className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
            >
              {ALERT_THRESHOLD_VALUES.map((value) => (
                <option key={value} value={value}>
                  {THRESHOLD_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex items-center justify-between gap-4">
          <span>복약 알림 수신</span>
          <input
            type="checkbox"
            checked={pref.medicationReminderOptIn}
            onChange={(e) => save({ medicationReminderOptIn: e.target.checked })}
            className="h-5 w-5 accent-accent"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          알림 수신 채널 (기분 알림/복약 알림에 적용)
          <select
            value={pref.notificationChannel}
            onChange={(e) => save({ notificationChannel: e.target.value as NotificationChannel })}
            className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
          >
            {NOTIFICATION_CHANNEL_VALUES.map((value) => (
              <option key={value} value={value}>
                {CHANNEL_LABELS[value]}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            이메일은 로그인 계정 이메일로, 문자는 아래 번호로 발송됩니다. (긴급 알림은 이 설정과
            무관하게 항상 푸시 우선으로 갑니다)
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          휴대폰 번호 (긴급 알림 문자 발송용, 선택)
          <input
            type="tel"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            onBlur={() => {
              if (phoneInput !== pref.phone) save({ phone: phoneInput });
            }}
            placeholder="+821012345678"
            className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
          />
          <span className="text-xs text-muted-foreground">
            긴급 알림은 이 번호와 무관하게 항상 브라우저 푸시로 먼저 갑니다. 60초 안에 아무도
            확인하지 않으면 이 번호로 문자를 보냅니다.
          </span>
        </label>
      </section>

      {patients.length > 1 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">기본으로 보여줄 환자</h2>
          <select
            value={pref.defaultPatientId ?? ""}
            onChange={(e) => save({ defaultPatientId: e.target.value || null })}
            className="rounded-xl border border-surface-border bg-surface px-3 py-2 outline-none focus:border-accent"
          >
            <option value="">로그인할 때마다 선택</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.name}
              </option>
            ))}
          </select>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">대시보드 위젯 순서</h2>
        <p className="text-sm text-muted-foreground">끌어다 놓아 순서를 바꾸세요. 위에 있을수록 먼저 보입니다.</p>
        <DashboardLayoutEditor order={pref.dashboardOrder} onChange={(order) => save({ dashboardOrder: order })} />
      </section>

      {error && <p className="text-sm text-danger-foreground">{error}</p>}
      <p className="text-xs text-muted-foreground">{saving ? "저장 중..." : savedAt ? "저장되었습니다." : ""}</p>
    </div>
  );
}
