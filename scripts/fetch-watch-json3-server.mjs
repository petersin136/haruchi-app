// =============================================================================
// 브라우저에서 POST 한 youtube timedtext json3 를 .cache/transcript/<book>-json3.json 에 저장.
// 페이지 안 fetch 는 PO 토큰이 붙은 URL 이라 본문이 온다. (설치 없음)
//
//   node scripts/fetch-watch-json3-server.mjs
//   → http://127.0.0.1:8766/  POST { bookId, videoId, languageCode?, kind?, body: <json3 string|object> }
// =============================================================================

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, ".cache", "transcript");
const PORT = Number(process.env.PORT || 8766);

fs.mkdirSync(outDir, { recursive: true });

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end("POST only");
    return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    res.writeHead(400);
    res.end("bad json");
    return;
  }
  const bookId = payload.bookId;
  const videoId = payload.videoId;
  if (!bookId || !videoId) {
    res.writeHead(400);
    res.end("bookId+videoId required");
    return;
  }
  let body = payload.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end("body not json3");
      return;
    }
  }
  if (!body || !Array.isArray(body.events)) {
    res.writeHead(400);
    res.end("json3 events missing");
    return;
  }
  const out = {
    videoId,
    languageCode: payload.languageCode || "ko",
    kind: payload.kind || "asr",
    source: "youtube-player-timedtext-json3",
    fetchedAt: new Date().toISOString(),
    ...body,
  };
  const outPath = path.join(outDir, `${bookId}-json3.json`);
  fs.writeFileSync(outPath, JSON.stringify(out));
  const bytes = fs.statSync(outPath).size;
  console.log(
    `[ok] ${bookId} video=${videoId} events=${body.events.length} bytes=${bytes} → ${outPath}`,
  );
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, bookId, events: body.events.length, bytes }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`listening http://127.0.0.1:${PORT}/`);
});
