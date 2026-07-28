import { auth } from "@/lib/auth/authOptions";
import type { Session } from "next-auth";

/** 권한 문제를 HTTP 상태코드와 함께 던져서, 라우트마다 응답을 다르게 만들지 않게 한다. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
  }
}

export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthError("로그인이 필요합니다.", 401);
  }
  return session;
}

/**
 * 이 세션이 해당 환자의 기록을 볼 수 있는지 확인한다.
 * 환자 본인이거나, 연동된 보호자여야 한다. 기록 조회 API는 전부 이걸 통과해야 한다.
 */
export async function requirePatientAccess(patientId: string): Promise<Session> {
  const session = await requireSession();
  if (!session.user.linkedPatientIds.includes(patientId)) {
    throw new AuthError("이 환자의 기록에 접근할 권한이 없습니다.", 403);
  }
  return session;
}

/** 쓰기 작업(대화 저장 등)은 환자 본인만 가능하다 - 보호자는 읽기 전용이다. */
export async function requirePatientSelf(): Promise<Session> {
  const session = await requireSession();
  if (session.user.role !== "patient") {
    throw new AuthError("환자 계정만 수행할 수 있습니다.", 403);
  }
  return session;
}

/**
 * 복용약/가족/기억/사진처럼 보호자가 환자를 위해 입력하는 자료는 보호자만 쓸 수 있다.
 * 조회(requirePatientAccess)와 달리 생성/수정/삭제는 이 함수를 통과해야 한다.
 */
export async function requireGuardianAccess(patientId: string): Promise<Session> {
  const session = await requireSession();
  if (session.user.role !== "guardian") {
    throw new AuthError("보호자 계정만 수행할 수 있습니다.", 403);
  }
  if (!session.user.linkedPatientIds.includes(patientId)) {
    throw new AuthError("이 환자에 대한 권한이 없습니다.", 403);
  }
  return session;
}

/** AuthError를 Response로 바꾼다. 그 외 오류는 호출부가 처리하도록 다시 던진다. */
export function authErrorResponse(err: unknown): Response | null {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return null;
}
