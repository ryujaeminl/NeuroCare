export interface TranscribeResult {
  text: string;
  language: string;
  duration: number;
  /** 성문이 등록된 경우에만 채워진다. 등록 전이면 null. */
  speaker_similarity?: number | null;
}

const BACKEND_URL = process.env.WHISPER_BACKEND_URL ?? "http://127.0.0.1:8000";

/**
 * Next.js 서버(라우트 핸들러)에서만 호출한다 - 브라우저는 백엔드 주소를 직접 알 필요가 없다.
 * speakerId를 넘기면 백엔드가 등록된 성문과 비교해 본인 목소리가 아니면 빈 텍스트를 돌려준다.
 */
export async function transcribeAudio(
  audio: Blob,
  filename: string,
  speakerId?: string,
): Promise<TranscribeResult> {
  const form = new FormData();
  form.append("file", audio, filename);
  if (speakerId) form.append("speaker_id", speakerId);

  const response = await fetch(`${BACKEND_URL}/transcribe`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`whisper backend error (${response.status}): ${detail}`);
  }

  return response.json() as Promise<TranscribeResult>;
}

/** 등록용 음성으로 성문을 저장한다. */
export async function enrollVoice(audio: Blob, speakerId: string): Promise<{ duration: number }> {
  const form = new FormData();
  form.append("file", audio, "enroll.wav");
  form.append("speaker_id", speakerId);

  const response = await fetch(`${BACKEND_URL}/enroll`, { method: "POST", body: form });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `등록 실패 (${response.status})`);
  }
  return response.json() as Promise<{ duration: number }>;
}

export async function getEnrollmentStatus(speakerId: string): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/enroll/${encodeURIComponent(speakerId)}`);
    if (!response.ok) return false;
    const data = (await response.json()) as { enrolled?: boolean };
    return Boolean(data.enrolled);
  } catch {
    return false;
  }
}

export async function deleteEnrollment(speakerId: string): Promise<void> {
  await fetch(`${BACKEND_URL}/enroll/${encodeURIComponent(speakerId)}`, { method: "DELETE" });
}
