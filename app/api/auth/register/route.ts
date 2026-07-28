import { hash } from "bcryptjs";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { isUserRole } from "@/lib/db/types";

/** 환자 계정에 발급하는 초대 코드. 보호자가 이걸 입력해 연동한다. */
function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 0/O/1/I 제외
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `NEURO-${code}`;
}

export async function POST(request: NextRequest) {
  const { email, password, name, role } = (await request.json()) as {
    email?: string;
    password?: string;
    name?: string;
    role?: string;
  };

  if (!email || !password || !name || !role) {
    return Response.json({ error: "모든 항목을 입력해주세요." }, { status: 400 });
  }
  if (!isUserRole(role)) {
    return Response.json({ error: "역할이 올바르지 않습니다." }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "비밀번호는 8자 이상이어야 합니다." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "이미 가입된 이메일입니다." }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      role,
      passwordHash: await hash(password, 10),
      inviteCode: role === "patient" ? generateInviteCode() : null,
    },
    select: { id: true, email: true, name: true, role: true, inviteCode: true },
  });

  return Response.json({ user }, { status: 201 });
}
