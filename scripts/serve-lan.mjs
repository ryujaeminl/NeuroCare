// LAN용 HTTPS 프록시.
//
// 왜 필요한가:
//  - WebView의 마이크(getUserMedia)는 보안 컨텍스트에서만 동작해서 https가 필수인데,
//    `next start`는 https를 직접 지원하지 않는다.
//  - `next dev`는 HMR(WSS)과 devtools 오버레이 때문에 WebView에서 불안정하다.
// 그래서 Next는 프로덕션 모드로 127.0.0.1에 띄우고, 이 프록시가 앞에서 https를 씌운다.
//
// 요청을 그대로 파이프하므로 LLM 스트리밍(SSE)과 오디오도 문제없이 지나간다.
import { createServer } from "node:https";
import { request as httpRequest } from "node:http";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const HTTPS_PORT = Number(process.env.LAN_PORT ?? 3000);
const TARGET_PORT = Number(process.env.NEXT_PORT ?? 3001);

// Windows에서 `a & b`는 백그라운드가 아니라 순차 실행이라 npm 스크립트로 둘을 못 띄운다.
// 그래서 프록시가 Next를 자식 프로세스로 직접 띄우고 생명주기를 함께 가져간다.
const next = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "start", "-p", String(TARGET_PORT)],
  { stdio: "inherit", shell: process.platform === "win32" },
);
next.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => next.kill());
process.on("SIGTERM", () => next.kill());

const options = {
  key: readFileSync("certificates/localhost-key.pem"),
  cert: readFileSync("certificates/localhost.pem"),
};

const server = createServer(options, (req, res) => {
  const client = req.socket.remoteAddress?.replace("::ffff:", "") ?? "?";

  const upstream = httpRequest(
    { host: "127.0.0.1", port: TARGET_PORT, path: req.url, method: req.method, headers: req.headers },
    (upstreamRes) => {
      // 폰이 실제로 무엇을 받아가는지 보이게 남긴다 - 원격 진단에 이 로그가 유일한 단서다.
      console.log(`${client}  ${req.method} ${req.url} -> ${upstreamRes.statusCode}`);
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", (err) => {
    console.error(`${client}  ${req.method} ${req.url} -> 프록시 실패: ${err.message}`);
    if (!res.headersSent) res.writeHead(502);
    res.end("upstream unavailable");
  });

  req.pipe(upstream);
});

server.listen(HTTPS_PORT, "0.0.0.0", () => {
  console.log(`HTTPS 프록시 :${HTTPS_PORT} -> Next :${TARGET_PORT}`);
});
