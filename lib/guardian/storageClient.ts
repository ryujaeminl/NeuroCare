import { randomUUID } from "crypto";
import { del, put } from "@vercel/blob";

// ponytail: 예전엔 로컬 디스크(public/uploads/...)에 썼는데, Vercel 서버리스는
// 파일시스템이 읽기전용/휘발성이라 프로덕션에서 조용히 실패했다(로컬 개발 서버에서만
// 동작해 문제를 못 알아챘다 - 실제 프로덕션 API로 직접 확인해서 발견) - Vercel Blob으로
// 교체. 기존 로컬 저장과 같은 보안 수준(추측 불가능한 경로, 별도 인증 없음)을 유지하려고
// public 접근 스토어를 쓴다 - 더 엄격한 접근 제어가 필요해지면 Blob을 private로 바꾸고
// 읽을 때 서명 URL을 발급하는 방식으로 옮길 것.
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 8 * 1024 * 1024;

export class UploadError extends Error {}

/** 사진 파일을 저장하고 브라우저에서 바로 쓸 수 있는 URL을 반환한다. */
export async function putPhoto(file: Blob, patientId: string): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new UploadError("jpg, png, webp, gif 파일만 업로드할 수 있습니다.");
  }
  if (file.size > MAX_BYTES) {
    throw new UploadError("파일 크기는 8MB를 넘을 수 없습니다.");
  }

  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const pathname = `patients/${patientId}/${randomUUID()}.${ext}`;

  const blob = await put(pathname, file, { access: "public", addRandomSuffix: false });
  return blob.url;
}

/** url이 이 스토리지가 발급한 Blob URL일 때만 실제 파일을 지운다. */
export async function deletePhoto(url: string): Promise<void> {
  if (!url.includes(".public.blob.vercel-storage.com/")) return;
  try {
    await del(url);
  } catch {
    // 이미 지워졌거나 없는 파일이면 조용히 넘어간다 (DB 레코드 삭제를 막지 않는다).
  }
}
