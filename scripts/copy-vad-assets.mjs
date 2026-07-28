// @ricky0123/vad-web과 onnxruntime-web은 브라우저에서 fetch할 onnx/wasm/worklet 파일을
// node_modules에서 직접 로드할 수 없으므로, CDN 대신 이 프로젝트가 self-host하도록
// public/vad/ 로 복사한다. `npm install` 이후 자동 실행된다(postinstall).
import { copyFileSync, existsSync, globSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const vadWebDist = join(rootDir, "node_modules/@ricky0123/vad-web/dist");
const onnxRuntimeDist = join(rootDir, "node_modules/onnxruntime-web/dist");
const targetDir = join(rootDir, "public/vad");

if (!existsSync(vadWebDist) || !existsSync(onnxRuntimeDist)) {
  console.warn("[copy-vad-assets] node_modules에 vad-web/onnxruntime-web이 없어 건너뜁니다.");
  process.exit(0);
}

mkdirSync(targetDir, { recursive: true });

const filesToCopy = [
  join(vadWebDist, "silero_vad_legacy.onnx"),
  join(vadWebDist, "silero_vad_v5.onnx"),
  join(vadWebDist, "vad.worklet.bundle.min.js"),
  ...globSync(join(onnxRuntimeDist, "ort-wasm*.wasm")),
  ...globSync(join(onnxRuntimeDist, "ort-wasm*.mjs")),
];

for (const src of filesToCopy) {
  const dest = join(targetDir, src.split(/[\\/]/).pop());
  copyFileSync(src, dest);
}

console.log(`[copy-vad-assets] ${filesToCopy.length}개 파일을 public/vad/ 로 복사했습니다.`);
