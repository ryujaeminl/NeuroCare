import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";

// ponytail: 실제 S3/R2 자격증명이 없어 로컬 디스크에 저장한다. S3로 옮기려면
// putObject(file, patientId)를 @aws-sdk/client-s3 PutObjectCommand 호출로 바꾸고
// deletePhoto를 DeleteObjectCommand로 바꾸면 된다 - 호출부(API 라우트)는 그대로 둬도 된다.
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads", "patients");

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
  const filename = `${randomUUID()}.${ext}`;
  const dir = path.join(UPLOAD_ROOT, patientId);
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  return `/uploads/patients/${patientId}/${filename}`;
}

/** url이 이 스토리지가 발급한 로컬 경로일 때만 실제 파일을 지운다. */
export async function deletePhoto(url: string): Promise<void> {
  if (!url.startsWith("/uploads/patients/")) return;
  try {
    await unlink(path.join(process.cwd(), "public", url));
  } catch {
    // 이미 지워졌거나 없는 파일이면 조용히 넘어간다 (DB 레코드 삭제를 막지 않는다).
  }
}
