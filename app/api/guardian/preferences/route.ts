import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { AuthError, authErrorResponse, requireSession } from "@/lib/auth/permissions";
import {
  ALERT_THRESHOLD_VALUES,
  DEFAULT_WIDGET_ORDER,
  NOTIFICATION_CHANNEL_VALUES,
  parseDashboardLayout,
  serializeDashboardLayout,
  type AlertThreshold,
  type NotificationChannel,
  type WidgetId,
} from "@/lib/db/types";

interface PreferencePatch {
  moodAlertEnabled?: boolean;
  moodAlertThreshold?: AlertThreshold;
  medicationReminderOptIn?: boolean;
  defaultPatientId?: string | null;
  dashboardOrder?: string[];
  notificationChannel?: NotificationChannel;
  phone?: string | null;
}

/** 클라이언트가 보낸 순서 배열 중 알려진 위젯 id만 남기고, 빠진 위젯은 뒤에 이어붙인다. */
function toWidgetOrder(order: string[]): WidgetId[] {
  const valid = order.filter((id): id is WidgetId => (DEFAULT_WIDGET_ORDER as readonly string[]).includes(id));
  const missing = DEFAULT_WIDGET_ORDER.filter((id) => !valid.includes(id));
  return [...valid, ...missing];
}

async function requireGuardian() {
  const session = await requireSession();
  if (session.user.role !== "guardian") {
    throw new AuthError("보호자 계정만 조회할 수 있습니다.", 403);
  }
  return session;
}

/** GET /api/guardian/preferences - 없으면 기본값으로 응답한다(아직 저장 전) */
export async function GET() {
  try {
    const session = await requireGuardian();
    const pref = await prisma.guardianPreference.findUnique({ where: { guardianId: session.user.id } });

    return Response.json({
      preference: {
        moodAlertEnabled: pref?.moodAlertEnabled ?? true,
        moodAlertThreshold: pref?.moodAlertThreshold ?? "moderate",
        medicationReminderOptIn: pref?.medicationReminderOptIn ?? false,
        defaultPatientId: pref?.defaultPatientId ?? null,
        dashboardOrder: parseDashboardLayout(pref?.dashboardLayout ?? null).order,
        notificationChannel: pref?.notificationChannel ?? "push",
        phone: pref?.phone ?? "",
      },
    });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "조회 실패" }, { status: 500 });
  }
}

/** PATCH /api/guardian/preferences - 보호자 본인 설정만 upsert한다 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireGuardian();
    const body = (await request.json()) as PreferencePatch;

    if (body.moodAlertThreshold && !ALERT_THRESHOLD_VALUES.includes(body.moodAlertThreshold)) {
      return Response.json({ error: "잘못된 민감도 값입니다." }, { status: 400 });
    }
    if (body.notificationChannel && !NOTIFICATION_CHANNEL_VALUES.includes(body.notificationChannel)) {
      return Response.json({ error: "잘못된 알림 채널 값입니다." }, { status: 400 });
    }
    if (body.defaultPatientId && !session.user.linkedPatientIds.includes(body.defaultPatientId)) {
      return Response.json({ error: "연동되지 않은 환자입니다." }, { status: 400 });
    }

    const data = {
      ...(body.moodAlertEnabled !== undefined && { moodAlertEnabled: body.moodAlertEnabled }),
      ...(body.moodAlertThreshold !== undefined && { moodAlertThreshold: body.moodAlertThreshold }),
      ...(body.medicationReminderOptIn !== undefined && { medicationReminderOptIn: body.medicationReminderOptIn }),
      ...(body.defaultPatientId !== undefined && { defaultPatientId: body.defaultPatientId }),
      ...(body.dashboardOrder !== undefined && {
        dashboardLayout: serializeDashboardLayout({ order: toWidgetOrder(body.dashboardOrder) }),
      }),
      ...(body.notificationChannel !== undefined && { notificationChannel: body.notificationChannel }),
      ...(body.phone !== undefined && { phone: body.phone?.trim() || null }),
    };

    const pref = await prisma.guardianPreference.upsert({
      where: { guardianId: session.user.id },
      update: data,
      create: { guardianId: session.user.id, ...data },
    });

    return Response.json({
      preference: {
        moodAlertEnabled: pref.moodAlertEnabled,
        moodAlertThreshold: pref.moodAlertThreshold,
        medicationReminderOptIn: pref.medicationReminderOptIn,
        defaultPatientId: pref.defaultPatientId,
        dashboardOrder: parseDashboardLayout(pref.dashboardLayout).order,
        notificationChannel: pref.notificationChannel,
        phone: pref.phone ?? "",
      },
    });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "저장 실패" }, { status: 400 });
  }
}
