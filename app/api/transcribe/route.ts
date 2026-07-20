import { NextRequest, NextResponse } from 'next/server';
import { correctTranscript } from '@/lib/solar';

const WHISPER_SERVICE_URL = process.env.WHISPER_SERVICE_URL || 'http://localhost:8000';

// GPU(A100) 서버에서 도는 faster-whisper 서비스 상태 확인
export async function GET() {
  try {
    const res = await fetch(`${WHISPER_SERVICE_URL}/health`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 503 });
  } catch (error) {
    console.error('Whisper 서비스 상태 확인 실패:', error);
    return NextResponse.json({ ready: false, error: 'Whisper 서비스에 연결할 수 없어요.' }, { status: 503 });
  }
}

// 클라이언트가 디코딩한 16kHz 모노 PCM(Float32) 원본 바이트를 GPU 추론 서비스로 그대로 전달
export async function POST(req: NextRequest) {
  try {
    const arrayBuffer = await req.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json({ error: '오디오 데이터가 없어요.' }, { status: 400 });
    }

    const whisperRes = await fetch(`${WHISPER_SERVICE_URL}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: arrayBuffer,
    });

    if (!whisperRes.ok) {
      const errorBody = await whisperRes.text();
      throw new Error(`Whisper 서비스 오류 (${whisperRes.status}): ${errorBody}`);
    }

    const { text: rawText } = await whisperRes.json();
    const text = await correctTranscript(rawText);
    return NextResponse.json({ text, rawText });
  } catch (error) {
    console.error('Transcribe Error:', error);
    return NextResponse.json({ error: '음성 인식에 실패했어요.' }, { status: 500 });
  }
}
