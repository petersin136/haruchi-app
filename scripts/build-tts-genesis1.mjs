#!/usr/bin/env node
/**
 * Gemini TTS — 개역한글 창세기 1장 절별 음성 생성 (테스트용).
 * 기존 앱 TTS(브라우저 speechSynthesis)와 무관. REST fetch only.
 *
 *   node scripts/build-tts-genesis1.mjs
 *   node scripts/build-tts-genesis1.mjs --verse 1
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const KOREAN_JSON = join(
  ROOT,
  "public/bible-study/chunks/genesis/1/korean.json",
);
const OUT_DIR = join(ROOT, "public/tts-test/genesis/1");
const MODEL = "gemini-3.8-flash-tts";
const VOICE = "Sulafat";
const STYLE =
  "한국어로 읽어주세요. 예배 시간에 성경을 봉독하듯, 차분하고 경건하게, 조금 천천히 읽어주세요. 문장 끝에서 잠깐 쉬어주세요.";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const REQUEST_GAP_MS = 4000;
const MAX_RETRIES = 8;

function loadEnvLocal() {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) {
    throw new Error(".env.local 이 없습니다. GEMINI_API_KEY= 를 넣어 주세요.");
  }
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function parseArgs(argv) {
  let verseOnly = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--verse" && argv[i + 1]) {
      verseOnly = Number(argv[++i]);
      if (!Number.isInteger(verseOnly) || verseOnly < 1) {
        throw new Error(`--verse 값은 양의 정수여야 합니다: ${argv[i]}`);
      }
    }
  }
  return { verseOnly };
}

function hasFfmpeg() {
  const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return r.status === 0;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function isWav(buf) {
  return (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WAVE"
  );
}

function pcmToWav(pcm, sampleRate = 24000, channels = 1, bits = 16) {
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE((sampleRate * channels * bits) / 8, 28);
  header.writeUInt16LE((channels * bits) / 8, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

function convertToMp3(inputPath, outputPath, { rawPcm = false } = {}) {
  const args = ["-y"];
  if (rawPcm) {
    args.push("-f", "s16le", "-ar", "24000", "-ac", "1", "-i", inputPath);
  } else {
    args.push("-i", inputPath);
  }
  args.push("-codec:a", "libmp3lame", "-q:a", "4", outputPath);
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(
      `ffmpeg 실패:\n${r.stderr || r.stdout || "(no output)"}`,
    );
  }
}

async function generateAudio(apiKey, text) {
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text,
            speech_metadata: { style: STYLE },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          voice: VOICE,
        },
      },
    },
  };

  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      const wait = Math.min(120_000, 4000 * 2 ** (attempt - 1));
      console.warn(
        `  429 rate limit — ${wait}ms 대기 후 재시도 (${attempt}/${MAX_RETRIES})`,
      );
      await sleep(wait);
      continue;
    }

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        json?.error?.message ||
        JSON.stringify(json)?.slice(0, 400) ||
        res.statusText;
      lastErr = new Error(`HTTP ${res.status}: ${msg}`);
      if (res.status >= 500 && attempt < MAX_RETRIES) {
        const wait = 2000 * attempt;
        console.warn(`  ${res.status} — ${wait}ms 후 재시도`);
        await sleep(wait);
        continue;
      }
      throw lastErr;
    }

    const inline =
      json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
        ?.inlineData ||
      json?.candidates?.[0]?.content?.parts?.find((p) => p.inline_data)
        ?.inline_data;
    if (!inline?.data) {
      throw new Error(
        `오디오 데이터 없음: ${JSON.stringify(json).slice(0, 500)}`,
      );
    }
    return {
      mimeType: inline.mimeType || inline.mime_type || "",
      buffer: Buffer.from(inline.data, "base64"),
    };
  }
  throw lastErr || new Error("재시도 한도 초과");
}

function saveAudio(buffer, mimeType, outBase, useMp3) {
  const mp3Path = `${outBase}.mp3`;
  const wavPath = `${outBase}.wav`;

  let wavBuf;
  let rawPcm = false;
  if (isWav(buffer)) {
    wavBuf = buffer;
  } else {
    // headerless L16 PCM (또는 기타) — WAV로 감싸서 저장/변환
    wavBuf = pcmToWav(buffer);
    rawPcm = /l16|pcm/i.test(mimeType);
  }

  if (useMp3) {
    const tmp = `${outBase}.tmp.wav`;
    writeFileSync(tmp, wavBuf);
    try {
      convertToMp3(tmp, mp3Path, { rawPcm: false });
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
    return mp3Path;
  }

  writeFileSync(wavPath, wavBuf);
  return wavPath;
}

async function main() {
  loadEnvLocal();
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(".env.local 에 GEMINI_API_KEY 값이 비어 있습니다.");
  }

  const { verseOnly } = parseArgs(process.argv.slice(2));
  const useMp3 = hasFfmpeg();
  const ext = useMp3 ? "mp3" : "wav";
  console.log(`ffmpeg: ${useMp3 ? "있음 → ." + ext : "없음 → .wav"}`);

  const data = JSON.parse(readFileSync(KOREAN_JSON, "utf8"));
  const verses = data?.verses?.krv;
  if (!Array.isArray(verses) || verses.length === 0) {
    throw new Error(`개역한글 절을 찾지 못함: ${KOREAN_JSON}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const targets = verseOnly
    ? verses.filter((v) => v.n === verseOnly)
    : verses;
  if (targets.length === 0) {
    throw new Error(`절 ${verseOnly} 이(가) 본문에 없습니다.`);
  }

  for (let i = 0; i < targets.length; i++) {
    const { n, t } = targets[i];
    const outBase = join(OUT_DIR, String(n));
    const outPath = `${outBase}.${ext}`;
    const altPath = `${outBase}.${ext === "mp3" ? "wav" : "mp3"}`;

    if (existsSync(outPath) || existsSync(altPath)) {
      console.log(`[skip] ${n}절 — 이미 있음`);
      continue;
    }

    console.log(`[gen] ${n}절 — ${t.slice(0, 40)}${t.length > 40 ? "…" : ""}`);
    const { buffer, mimeType } = await generateAudio(apiKey, t);
    const saved = saveAudio(buffer, mimeType, outBase, useMp3);
    const size = readFileSync(saved).length;
    console.log(`  → ${saved} (${size} bytes, mime=${mimeType || "?"})`);

    if (i < targets.length - 1) {
      await sleep(REQUEST_GAP_MS);
    }
  }

  console.log("done.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
