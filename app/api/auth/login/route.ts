import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username?.trim() || !password) {
      return NextResponse.json({ error: '아이디와 비밀번호를 입력해주세요.' }, { status: 400 });
    }

    const user = await authenticateUser(username, password);
    return NextResponse.json({ user });
  } catch (error: any) {
    console.error('Login Error:', error);
    return NextResponse.json({ error: error.message || '로그인에 실패했어요.' }, { status: 401 });
  }
}
