import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { AuthError, authErrorResponse, requireSession } from "@/lib/auth/permissions";

interface SubscribeInput {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

/** POST /api/guardian/push-subscriptions - 브라우저 푸시 구독 등록 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (session.user.role !== "guardian") {
      throw new AuthError("보호자 계정만 구독할 수 있습니다.", 403);
    }

    const body = (await request.json()) as SubscribeInput;
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return Response.json({ error: "구독 정보가 올바르지 않습니다." }, { status: 400 });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: { guardianId: session.user.id, p256dh: body.keys.p256dh, auth: body.keys.auth },
      create: {
        guardianId: session.user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
    });
    return Response.json({ subscribed: true }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "구독 실패" }, { status: 400 });
  }
}

/** DELETE /api/guardian/push-subscriptions?endpoint=... - 구독 해제 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireSession();
    const endpoint = request.nextUrl.searchParams.get("endpoint");
    if (!endpoint) return Response.json({ error: "endpoint가 필요합니다." }, { status: 400 });

    await prisma.pushSubscription.deleteMany({ where: { endpoint, guardianId: session.user.id } });
    return Response.json({ deleted: true });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "해제 실패" }, { status: 500 });
  }
}
