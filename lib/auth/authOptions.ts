import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { isUserRole, type UserRole } from "@/lib/db/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      /** 이 사용자가 볼 수 있는 환자 ID 목록. 환자면 자기 자신, 보호자면 연동된 환자들. */
      linkedPatientIds: string[];
    } & DefaultSession["user"];
  }
}

/** 이 사용자가 조회 권한을 가진 환자 ID 목록을 구한다. */
async function resolveLinkedPatientIds(userId: string, role: UserRole): Promise<string[]> {
  if (role === "patient") return [userId];

  const links = await prisma.patientGuardianLink.findMany({
    where: { guardianId: userId },
    select: { patientId: true },
  });
  return links.map((link) => link.patientId);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt",
    // 환자는 매번 로그인하는 것 자체가 부담이므로 세션을 길게 유지한다.
    maxAge: 60 * 60 * 24 * 90,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "이메일", type: "email" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const passwordMatches = await compare(password, user.passwordHash);
        if (!passwordMatches) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.uid = user.id;
        token.role = "role" in user && typeof user.role === "string" ? user.role : "patient";
      }

      // 보호자-환자 연동은 로그인 이후에도 바뀔 수 있으므로, 세션 갱신 시 다시 조회한다.
      const role = isUserRole(String(token.role)) ? (token.role as UserRole) : "patient";
      if (token.uid && (user || trigger === "update" || !token.linkedPatientIds)) {
        token.linkedPatientIds = await resolveLinkedPatientIds(String(token.uid), role);
      }

      return token;
    },
    async session({ session, token }) {
      session.user.id = String(token.uid ?? "");
      session.user.role = isUserRole(String(token.role)) ? (token.role as UserRole) : "patient";
      session.user.linkedPatientIds = Array.isArray(token.linkedPatientIds)
        ? (token.linkedPatientIds as string[])
        : [];
      return session;
    },
  },
});
