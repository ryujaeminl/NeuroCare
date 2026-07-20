import { NextRequest, NextResponse } from 'next/server';
import { createUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { username, password, name } = await req.json();

    if (!username?.trim() || !password || !name?.trim()) {
      return NextResponse.json({ error: '아이디, 비밀번호, 이름을 모두 입력해주세요.' }, { status: 400 });
    }
    if (password.length < 4) {
      return NextResponse.json({ error: '비밀번호는 4자 이상으로 입력해주세요.' }, { status: 400 });
    }

    const user = await createUser(username, password, name);
    return NextResponse.json({ user });
  } catch (error: any) {
    console.error('Signup Error:', error);
    return NextResponse.json({ error: error.message || '회원가입에 실패했어요.' }, { status: 400 });
  }
}
