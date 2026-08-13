import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (id) {
      await prisma.familyMessage.update({
        where: { id },
        data: { deliveredAt: new Date(), photoShownAt: new Date() },
      }).catch(() => null);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Mark message read error:", err);
    return NextResponse.json({ ok: true });
  }
}
