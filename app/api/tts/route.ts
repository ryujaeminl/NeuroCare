import { NextRequest, NextResponse } from 'next/server';  // ✅ 닫는 중괄호 추가
import { generateClovaTTS } from '@/lib/clova';           // ✅ 닫는 중괄호 추가

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: '텍스트가 필요합니다' }, { status: 400 });
    }

    const audioBuffer = await generateClovaTTS(text);

    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mp3',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error('TTS Error:', error);
    return NextResponse.json({ error: 'TTS 생성 실패' }, { status: 500 });  // ✅ 쉼표와 중괄호 수정
  }
}