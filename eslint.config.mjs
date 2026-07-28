import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // postinstall이 node_modules에서 복사하는 vendor 자산 (vad-web worklet)
    "public/vad/**",
    // 이 앱과 무관하게 프로젝트 폴더에 들어와 있는 별도 저장소 / 네이티브 코드
    "everything-claude-code/**",
    "android/**",
    "server/**",
  ]),
]);

export default eslintConfig;
