#!/usr/bin/env node
/**
 * 구약 히브리어 원어 단어 연구 데이터 빌드.
 *
 * 요한일서 헬라어(public/word-study/john1, lexicon/greek)와 같은 구조.
 *
 * 입력:
 *   - .cache/oshb/{Osis}.xml          (OSHB morphhb / WLC, CC BY 4.0) — 없으면 raw.githubusercontent 에서 받음
 *   - .cache/oshb/strong-he-enriched.json (또는 strong-he.json / HebrewStrong.xml)
 *   - scripts/lib/tanakh-lexicon.mjs
 *   - scripts/lib/hebrew-pron.mjs
 *   - scripts/lib/hebrew-morph-parse.mjs
 *   - data/keyword-notes/hebrew.json  (있으면 pron·defKo 우선)
 *   - public/bible-study/chunks/{book}/{ch}/korean.json  (개역한글 절 수 — 표제 매핑용)
 *
 * 출력 (신규 폴더만):
 *   - public/word-study/{bookId}/{ch}.json
 *   - public/word-study/lexicon/hebrew/{strong}.json
 *
 * 사용:
 *   node scripts/build-word-study-hebrew.mjs              # 파일럿: 시 1–30 + 창 1–3
 *   node scripts/build-word-study-hebrew.mjs --all        # 구약 39권 (승인 후)
 *
 * 설치·커밋·기존 파일 수정·외부 번역 API 금지.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

import { pron as hebPron } from "./lib/hebrew-pron.mjs";
import { decodeMorph, PREFIX_LEMMA } from "./lib/hebrew-morph-parse.mjs";
import { normalizeStrong, lookupTanakh } from "./lib/tanakh-lexicon.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const OSHB_DIR = path.join(repoRoot, ".cache", "oshb");
const OUT_ROOT = path.join(repoRoot, "public", "word-study");
const OUT_LEX = path.join(OUT_ROOT, "lexicon", "hebrew");
const NOTES_PATH = path.join(repoRoot, "data", "keyword-notes", "hebrew.json");
const KRV_CHUNKS = path.join(repoRoot, "public", "bible-study", "chunks");
const ENRICHED = path.join(OSHB_DIR, "strong-he-enriched.json");
const STRONG_CACHE = path.join(OSHB_DIR, "strong-he.json");
const STRONG_XML = path.join(OSHB_DIR, "HebrewStrong.xml");

const MORPHHB_BASE =
  "https://raw.githubusercontent.com/openscriptures/morphhb/master/wlc";

const DEF_EN_MAX = 160;
const FAMILY_MAX = 6;
const PHRASE_MIN = 3;
const PHRASE_MAX = 5;
const PHRASE_REFS_MAX = 12;

const BOOKS = [
  { id: "genesis", label: "창세기", osis: "Gen" },
  { id: "exodus", label: "출애굽기", osis: "Exod" },
  { id: "leviticus", label: "레위기", osis: "Lev" },
  { id: "numbers", label: "민수기", osis: "Num" },
  { id: "deuteronomy", label: "신명기", osis: "Deut" },
  { id: "joshua", label: "여호수아", osis: "Josh" },
  { id: "judges", label: "사사기", osis: "Judg" },
  { id: "ruth", label: "룻기", osis: "Ruth" },
  { id: "samuel1", label: "사무엘상", osis: "1Sam" },
  { id: "samuel2", label: "사무엘하", osis: "2Sam" },
  { id: "kings1", label: "열왕기상", osis: "1Kgs" },
  { id: "kings2", label: "열왕기하", osis: "2Kgs" },
  { id: "chronicles1", label: "역대상", osis: "1Chr" },
  { id: "chronicles2", label: "역대하", osis: "2Chr" },
  { id: "ezra", label: "에스라", osis: "Ezra" },
  { id: "nehemiah", label: "느헤미야", osis: "Neh" },
  { id: "esther", label: "에스더", osis: "Esth" },
  { id: "job", label: "욥기", osis: "Job" },
  { id: "psalms", label: "시편", osis: "Ps" },
  { id: "proverbs", label: "잠언", osis: "Prov" },
  { id: "ecclesiastes", label: "전도서", osis: "Eccl" },
  { id: "songofsolomon", label: "아가", osis: "Song" },
  { id: "isaiah", label: "이사야", osis: "Isa" },
  { id: "jeremiah", label: "예레미야", osis: "Jer" },
  { id: "lamentations", label: "예레미야애가", osis: "Lam" },
  { id: "ezekiel", label: "에스겔", osis: "Ezek" },
  { id: "daniel", label: "다니엘", osis: "Dan" },
  { id: "hosea", label: "호세아", osis: "Hos" },
  { id: "joel", label: "요엘", osis: "Joel" },
  { id: "amos", label: "아모스", osis: "Amos" },
  { id: "obadiah", label: "오바댜", osis: "Obad" },
  { id: "jonah", label: "요나", osis: "Jonah" },
  { id: "micah", label: "미가", osis: "Mic" },
  { id: "nahum", label: "나훔", osis: "Nah" },
  { id: "habakkuk", label: "하박국", osis: "Hab" },
  { id: "zephaniah", label: "스바냐", osis: "Zeph" },
  { id: "haggai", label: "학개", osis: "Hag" },
  { id: "zechariah", label: "스가랴", osis: "Zech" },
  { id: "malachi", label: "말라기", osis: "Mal" },
];

/** 파일럿: 시편 1–30 + 창세기 1–3 */
const PILOT = [
  { id: "psalms", chapters: range(1, 30) },
  { id: "genesis", chapters: range(1, 3) },
];

/**
 * WLC(히브리) ↔ 개역한글(KRV) 장절 체계 차이 목록 (보고용).
 * 시편 표제는 런타임에 절 수 비교로 처리. 아래는 책·장 단위 주요 차이.
 */
const VERSE_SYSTEM_DIFFS = [
  {
    book: "psalms",
    note:
      "표제(superscript)가 있는 편은 히브리어(WLC)에서 1절로 세어, 개역한글보다 절이 1개 많아요. 표제 단어를 KRV 1절 앞에 붙이고 WLC n→KRV n-1로 매핑해요.",
    examples: "시 3,4,5,6,7,8,9,12,18–22,30 등 (시 1·2·23처럼 표제가 본문 1절에 합쳐진 편은 절 수 동일)",
  },
  {
    book: "genesis",
    note: "창 31:55(KRV) = 창 32:1(WLC). KRV 32:n = WLC 32:n+1.",
  },
  {
    book: "exodus",
    note:
      "출 8:1–4(KRV) = 출 7:26–29(WLC); 출 8:5–32(KRV) = 출 8:1–28(WLC). 출 22:1(KRV) = 출 21:37(WLC); 출 22:2–31(KRV) = 출 22:1–30(WLC).",
  },
  {
    book: "joel",
    note:
      "히브리어 4장 / 개역한글 3장. KRV 2:28–32 = WLC 3:1–5. KRV 3장 = WLC 4장.",
  },
  {
    book: "malachi",
    note:
      "히브리어는 3:24로 끝나요. 개역한글 4:1–6 = WLC 3:19–24.",
  },
  {
    book: "samuel1",
    note: "일부 판본에서 삼상 23:29(KRV) ↔ 24:1(WLC) 분절 차이가 있어요.",
  },
];

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1).trimEnd() + "…";
}

function padNum(n) {
  return String(n).replace(/\D/g, "").replace(/^0+/, "") || "0";
}

function normH(id) {
  if (!id) return "";
  if (/^[a-z]+$/i.test(String(id)) && String(id).length <= 2) return String(id).toLowerCase();
  const m = String(id).match(/(\d+)/);
  return m ? `H${padNum(m[1])}` : "";
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          httpsGet(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`GET ${url} → ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

async function ensureOshbXml(osis) {
  fs.mkdirSync(OSHB_DIR, { recursive: true });
  const dest = path.join(OSHB_DIR, `${osis}.xml`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return dest;
  const url = `${MORPHHB_BASE}/${osis}.xml`;
  console.log(`[oshb] download ${osis}.xml …`);
  const buf = await httpsGet(url);
  fs.writeFileSync(dest, buf);
  console.log(`[oshb] ${osis}.xml ${(buf.length / 1024).toFixed(0)} KB`);
  return dest;
}

function loadStrongLex() {
  if (fs.existsSync(ENRICHED)) {
    return JSON.parse(fs.readFileSync(ENRICHED, "utf8"));
  }
  if (fs.existsSync(STRONG_CACHE)) {
    return JSON.parse(fs.readFileSync(STRONG_CACHE, "utf8"));
  }
  if (!fs.existsSync(STRONG_XML)) {
    throw new Error(`Strong's Hebrew 없음: ${ENRICHED} / ${STRONG_CACHE} / ${STRONG_XML}`);
  }
  const xml = fs.readFileSync(STRONG_XML, "utf8");
  const out = {};
  const entryRe = /<entry\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const id = normH(m[1]);
    const body = m[2];
    const word = body.match(/<w\b[^>]*>([^<]+)/)?.[1] || "";
    const defEn = clip(
      (body.match(/<definition[^>]*>([\s\S]*?)<\/definition>/)?.[1] || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
      DEF_EN_MAX,
    );
    const root = body.match(/<root[^>]*strong="([^"]+)"/)?.[1] || null;
    out[id] = {
      word,
      xlit: "",
      pronEn: "",
      rootStrong: root ? normH(root) : null,
      defEn,
      usage: "",
    };
  }
  fs.writeFileSync(STRONG_CACHE, JSON.stringify(out));
  return out;
}

function loadNotes() {
  if (!fs.existsSync(NOTES_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(NOTES_PATH, "utf8"));
  } catch {
    return {};
  }
}

function krvVerseCount(bookId, ch) {
  const p = path.join(KRV_CHUNKS, bookId, String(ch), "korean.json");
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  return j.verses?.krv?.length ?? null;
}

/** OSHB XML → Map<ch, Map<wlcVerse, {kjvNote, rows}>> */
function parseOshbXml(xmlPath) {
  const xml = fs.readFileSync(xmlPath, "utf8");
  const verseRe = /<verse osisID="([^"]+)">([\s\S]*?)<\/verse>/g;
  const out = new Map();
  let m;
  while ((m = verseRe.exec(xml)) !== null) {
    const parts = m[1].split(".");
    const ch = parseInt(parts[1], 10);
    const v = parseInt(parts[2], 10);
    if (!Number.isFinite(ch) || !Number.isFinite(v)) continue;
    const body = m[2];
    const kjv = body.match(/<note[^>]*>\s*KJV:([A-Za-z0-9]+)\.(\d+)\.(\d+)\s*<\/note>/);
    const rows = [];
    const wRe = /<w\b([^>]*)>([\s\S]*?)<\/w>/g;
    let wm;
    while ((wm = wRe.exec(body)) !== null) {
      const attrs = wm[1];
      const inner = wm[2].replace(/<[^>]+>/g, "").trim();
      if (!inner) continue;
      rows.push({
        word: inner,
        lemma: attr(attrs, "lemma"),
        morph: attr(attrs, "morph"),
      });
    }
    if (!out.has(ch)) out.set(ch, new Map());
    out.get(ch).set(v, {
      kjv: kjv ? { ch: +kjv[2], v: +kjv[3] } : null,
      rows,
    });
  }
  return out;
}

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : "";
}

function isPrefixCode(lp) {
  const t = String(lp || "").trim();
  return t.length >= 1 && t.length <= 2 && /^[a-z]+$/.test(t);
}

/**
 * 접두(ו ב ל כ מ ה관사 등)를 분리한 토큰 목록.
 * 칩·사전 집계는 numeric strong(본단어)만 사용.
 */
function expandRow(row, strongLex, notes) {
  const surfaces = String(row.word || "").split("/");
  const lemmas = String(row.lemma || "").split("/");
  const morphs = String(row.morph || "").split("/");
  const n = Math.max(surfaces.length, lemmas.length, 1);
  const out = [];

  for (let i = 0; i < n; i++) {
    const surface = (surfaces[i] ?? surfaces[surfaces.length - 1] ?? "").trim();
    const lemmaRaw = (lemmas[i] ?? "").trim();
    const morphRaw = (morphs[i] ?? morphs[morphs.length - 1] ?? "").trim();
    if (!surface && !lemmaRaw) continue;

    const prefix = isPrefixCode(lemmaRaw);
    const strong = prefix ? "" : normalizeStrong(lemmaRaw);
    const morphInfo = decodeMorph(
      morphRaw
        ? morphRaw[0] === "H" || morphRaw[0] === "A"
          ? morphRaw
          : `H${morphRaw}`
        : "",
    );

    let glossKo = "";
    let lemmaDisp = lemmaRaw;
    let posKo = morphInfo.posLabel || "";

    if (prefix) {
      const px = PREFIX_LEMMA[lemmaRaw];
      glossKo = px?.gloss || lemmaRaw;
      posKo = px?.role?.split(/\s/)[0] || "접두사";
      lemmaDisp = lemmaRaw;
    } else {
      const note = notes[strong] || {};
      const kr = lookupTanakh(strong);
      const en = strongLex[strong] || strongLex[`H${padNum(strong)}`];
      glossKo = kr?.gloss || "";
      if (!glossKo && en?.defEn) {
        glossKo = String(en.defEn).split(/[;(]/)[0].trim().slice(0, 24);
      }
      lemmaDisp = en?.word || lemmaRaw.replace(/^\d+\s*/, "") || strong;
      if (note.gloss) glossKo = note.gloss;
    }

    const note = notes[strong] || {};
    const pronunciation =
      (!prefix && note.pron) ||
      hebPron(surface) ||
      (!prefix && enPronFallback(strongLex[strong])) ||
      "";

    const parseKo = prefix
      ? posKo
      : [morphInfo.posLabel, morphInfo.parseLabel]
          .filter(Boolean)
          .join(", ")
          .replace(/\s+/g, " ")
          .trim() || morphInfo.parseLabelLong || "";

    out.push({
      word: surface,
      lemma: lemmaDisp,
      strong: strong || "",
      pron: pronunciation,
      parseKo,
      glossKo: glossKo || "",
      _prefix: prefix,
      _posKo: posKo,
      _mainChip: !prefix && !!strong,
    });
  }
  return out;
}

function enPronFallback(entry) {
  return "";
}

/**
 * WLC 절 → KRV 절 매핑.
 * - 시편 등: WLC 절수 = KRV+1 이면 표제 모드
 * - OSHB KJV note 가 있으면 우선
 * - 그 외 1:1
 */
function mapChapterToKrv(bookId, ch, wlcChapterMap) {
  const wlcVerses = [...wlcChapterMap.keys()].sort((a, b) => a - b);
  const krvCount = krvVerseCount(bookId, ch);
  const titleShift =
    krvCount != null && wlcVerses.length === krvCount + 1;

  /** @type {Map<number, {rows: object[], wlcSources: number[]}>} */
  const krvMap = new Map();

  for (const wv of wlcVerses) {
    const cell = wlcChapterMap.get(wv);
    let krvV = wv;
    if (cell.kjv && cell.kjv.ch === ch) {
      krvV = cell.kjv.v;
    } else if (titleShift) {
      krvV = wv === 1 ? 1 : wv - 1;
    } else {
      krvV = wv;
    }
    if (!krvMap.has(krvV)) krvMap.set(krvV, { rows: [], wlcSources: [] });
    const bucket = krvMap.get(krvV);
    // 표제(WLC 1, no kjv)는 KRV 1 앞에
    if (titleShift && wv === 1 && !cell.kjv) {
      bucket.rows = [...cell.rows, ...bucket.rows];
    } else {
      bucket.rows.push(...cell.rows);
    }
    bucket.wlcSources.push(wv);
  }

  return { krvMap, titleShift, wlcCount: wlcVerses.length, krvCount };
}

function bump(map, key, bookId) {
  if (!map.has(key)) map.set(key, { total: 0, byBook: {} });
  const row = map.get(key);
  row.total += 1;
  row.byBook[bookId] = (row.byBook[bookId] || 0) + 1;
}

function buildFamily(strong, strongLex) {
  const self = normH(strong);
  const entry = strongLex[self];
  const root = normH(entry?.rootStrong) || self;
  const siblings = [];
  for (const [id, e] of Object.entries(strongLex)) {
    const hid = normH(id);
    if (hid === self) continue;
    const r = normH(e?.rootStrong) || hid;
    if (r === root || hid === root || (entry?.rootStrong && hid === root)) {
      siblings.push(hid);
    }
  }
  // also: same rootStrong pointing to self
  for (const [id, e] of Object.entries(strongLex)) {
    const hid = normH(id);
    if (hid === self) continue;
    if (normH(e?.rootStrong) === self || normH(e?.rootStrong) === root) {
      if (!siblings.includes(hid)) siblings.push(hid);
    }
  }
  return [...new Set(siblings)]
    .filter((id) => strongLex[id]?.word)
    .sort((a, b) => Number(padNum(a)) - Number(padNum(b)))
    .slice(0, FAMILY_MAX);
}

function dirSize(dir) {
  if (!fs.existsSync(dir)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isFile()) {
      files += 1;
      bytes += st.size;
    } else if (st.isDirectory()) {
      const sub = dirSize(p);
      files += sub.files;
      bytes += sub.bytes;
    }
  }
  return { files, bytes };
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");

  console.log("[word-study-he] OSHB morphhb → public/word-study/{book}/ + lexicon/hebrew/");
  const strongLex = loadStrongLex();
  const notes = loadNotes();
  console.log(
    `[word-study-he] strong ${Object.keys(strongLex).length}, notes ${Object.keys(notes).length}`,
  );

  const targets = all
    ? BOOKS.map((b) => ({ id: b.id, chapters: null }))
    : PILOT;

  // ensure XML for target books (+ full book for scan when pilot)
  const booksNeeded = new Set(targets.map((t) => t.id));
  for (const b of BOOKS) {
    if (!booksNeeded.has(b.id)) continue;
    await ensureOshbXml(b.osis);
  }

  /** @type {Map<string, { total:number, byBook:Record<string,number> }>} */
  const strongCounts = new Map();
  /** @type {Map<string, Map<string, number>>} */
  const strongPos = new Map();
  /** @type {Map<string, string>} */
  const strongLemma = new Map();
  /** @type {Map<string, string>} */
  const strongGloss = new Map();
  /** @type {Map<string, string>} */
  const strongPron = new Map();
  /** @type {Map<string, Map<string, { hebVotes:Map<string,number>, count:number, refs:string[] }>>} */
  const phrasesByStrong = new Map();

  const titleShiftReport = [];
  const emitStats = [];

  for (const t of targets) {
    const meta = BOOKS.find((b) => b.id === t.id);
    if (!meta) continue;
    const xmlPath = path.join(OSHB_DIR, `${meta.osis}.xml`);
    const wlcBook = parseOshbXml(xmlPath);
    const chapters = t.chapters
      ? t.chapters
      : [...wlcBook.keys()].sort((a, b) => a - b);

    // 전체 책 스캔(빈도·구문) — 파일럿도 해당 책 전체를 집계
    const scanChapters = [...wlcBook.keys()].sort((a, b) => a - b);

    for (const ch of scanChapters) {
      const { krvMap, titleShift, wlcCount, krvCount } = mapChapterToKrv(
        meta.id,
        ch,
        wlcBook.get(ch),
      );
      if (titleShift && chapters.includes(ch)) {
        titleShiftReport.push({
          book: meta.id,
          ch,
          wlc: wlcCount,
          krv: krvCount,
        });
      }

      for (const [krvV, bucket] of [...krvMap.entries()].sort((a, b) => a[0] - b[0])) {
        const ref = `${meta.id} ${ch}:${krvV}`;
        const expanded = [];
        for (const row of bucket.rows) {
          expanded.push(...expandRow(row, strongLex, notes));
        }
        // 칩 기준(본단어) 시퀀스
        const chipSeq = expanded.filter((w) => w._mainChip);
        for (const w of chipSeq) {
          bump(strongCounts, w.strong, meta.id);
          if (!strongLemma.has(w.strong)) strongLemma.set(w.strong, w.lemma);
          if (!strongGloss.has(w.strong) && w.glossKo) strongGloss.set(w.strong, w.glossKo);
          if (!strongPron.has(w.strong) && w.pron) strongPron.set(w.strong, w.pron);
          if (w._posKo) {
            if (!strongPos.has(w.strong)) strongPos.set(w.strong, new Map());
            const pm = strongPos.get(w.strong);
            pm.set(w._posKo, (pm.get(w._posKo) || 0) + 1);
          }
        }
        for (let n = 2; n <= 3; n++) {
          for (let i = 0; i + n <= chipSeq.length; i++) {
            const slice = chipSeq.slice(i, i + n);
            const key = slice.map((w) => w.strong).join(" ");
            const heb = slice.map((w) => w.word).join(" ");
            for (const w of slice) {
              if (!phrasesByStrong.has(w.strong)) phrasesByStrong.set(w.strong, new Map());
              const bag = phrasesByStrong.get(w.strong);
              if (!bag.has(key)) bag.set(key, { hebVotes: new Map(), count: 0, refs: [] });
              const row = bag.get(key);
              row.count += 1;
              row.hebVotes.set(heb, (row.hebVotes.get(heb) || 0) + 1);
              if (row.refs.length < PHRASE_REFS_MAX && !row.refs.includes(ref)) {
                row.refs.push(ref);
              }
            }
          }
        }
      }
    }

    // 장 JSON 출력
    const outBook = path.join(OUT_ROOT, meta.id);
    fs.mkdirSync(outBook, { recursive: true });

    for (const ch of chapters) {
      if (!wlcBook.has(ch)) {
        console.warn(`[skip] ${meta.id} ${ch} — OSHB에 없음`);
        continue;
      }
      const { krvMap, titleShift } = mapChapterToKrv(meta.id, ch, wlcBook.get(ch));
      const verses = [];
      let wordCount = 0;
      for (const [krvV, bucket] of [...krvMap.entries()].sort((a, b) => a[0] - b[0])) {
        const words = [];
        let i = 0;
        for (const row of bucket.rows) {
          for (const tok of expandRow(row, strongLex, notes)) {
            words.push({
              ref: `${ch}:${krvV}`,
              i,
              word: tok.word,
              lemma: tok.lemma,
              strong: tok.strong,
              pron: tok.pron,
              parseKo: tok.parseKo,
              glossKo: tok.glossKo,
            });
            i += 1;
            wordCount += 1;
          }
        }
        verses.push({ n: krvV, words });
      }
      const out = {
        book: meta.id,
        chapter: ch,
        sources: {
          wlc: "Westminster Leningrad Codex (Public Domain)",
          morphhb: "Open Scriptures Hebrew Bible morphhb (CC BY 4.0)",
          lexicon: "OSHB HebrewLexicon / Strong's (Public Domain)",
          kr: "개역한글 절 번호 매핑(표제·장절 체계)",
        },
        titleShift: titleShift || undefined,
        verses,
      };
      const outPath = path.join(outBook, `${ch}.json`);
      fs.writeFileSync(outPath, JSON.stringify(out) + "\n");
      emitStats.push({ book: meta.id, ch, verses: verses.length, words: wordCount, titleShift });
      console.log(
        `[${meta.id}] ch ${ch} → ${verses.length}v / ${wordCount}w${titleShift ? " (title→KRV)" : ""}`,
      );
    }
  }

  // lexicon — 파일럿에 등장한 strong (+ family/root)
  const emittedStrongs = new Set();
  for (const st of emitStats) {
    const j = JSON.parse(
      fs.readFileSync(path.join(OUT_ROOT, st.book, `${st.ch}.json`), "utf8"),
    );
    for (const v of j.verses) {
      for (const w of v.words) {
        if (w.strong && /^H\d+/.test(w.strong)) emittedStrongs.add(w.strong);
      }
    }
  }
  for (const s of [...emittedStrongs]) {
    for (const f of buildFamily(s, strongLex)) emittedStrongs.add(f);
    const root = normH(strongLex[s]?.rootStrong);
    if (root) emittedStrongs.add(root);
  }

  fs.mkdirSync(OUT_LEX, { recursive: true });
  let lexWritten = 0;
  for (const strong of [...emittedStrongs].sort(
    (a, b) => Number(padNum(a)) - Number(padNum(b)),
  )) {
    const entry = strongLex[strong];
    const note = notes[strong] || {};
    const counts = strongCounts.get(strong) || { total: 0, byBook: {} };
    const posMap = strongPos.get(strong);
    const posKo = posMap
      ? [...posMap.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : "";
    const lemma =
      strongLemma.get(strong) || entry?.word || note.gloss || strong;
    const pronunciation =
      note.pron || strongPron.get(strong) || (entry?.word ? hebPron(entry.word) : "");

    const rootStrong = normH(entry?.rootStrong);
    let root = null;
    if (rootStrong && rootStrong !== strong) {
      root = {
        lemma: strongLex[rootStrong]?.word || rootStrong,
        strong: rootStrong,
      };
      if (notes[rootStrong]?.rootNote || notes[strong]?.rootNote) {
        root.glossKo = notes[strong]?.rootNote || notes[rootStrong]?.rootNote;
      } else if (lookupTanakh(rootStrong)?.gloss) {
        root.glossKo = lookupTanakh(rootStrong).gloss;
      }
    }

    const family = buildFamily(strong, strongLex)
      .filter((id) => emittedStrongs.has(id))
      .map((id) => ({
        lemma: strongLemma.get(id) || strongLex[id]?.word || id,
        strong: id,
        pron: notes[id]?.pron || strongPron.get(id) || "",
        glossKo: strongGloss.get(id) || lookupTanakh(id)?.gloss || "",
      }));

    const bag = phrasesByStrong.get(strong);
    let phrases = [];
    if (bag) {
      const rows = [];
      for (const [key, row] of bag.entries()) {
        if (row.count < PHRASE_MIN) continue;
        const strongs = key.split(" ");
        if (strongs.length < 2 || strongs.length > 3) continue;
        const heb =
          [...row.hebVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
        const forms = heb.split(" ");
        rows.push({
          hebrew: heb,
          pron: strongs
            .map((s, i) => notes[s]?.pron || strongPron.get(s) || hebPron(forms[i] || ""))
            .join(" "),
          lemmas: strongs.map((s) => strongLemma.get(s) || strongLex[s]?.word || s),
          words: strongs.map((s, i) => ({
            word: forms[i] || "",
            lemma: strongLemma.get(s) || strongLex[s]?.word || s,
            strong: s,
            pron: notes[s]?.pron || strongPron.get(s) || hebPron(forms[i] || ""),
          })),
          count: row.count,
          refs: row.refs.slice(0, PHRASE_REFS_MAX),
          glossKo: "",
        });
      }
      rows.sort((a, b) => b.count - a.count || a.hebrew.localeCompare(b.hebrew, "he"));
      phrases = rows.slice(0, PHRASE_MAX);
    }

    const obj = {
      lemma,
      pron: pronunciation,
      strong,
      posKo,
      root,
      family,
      defEn: clip(note.defEn || entry?.defEn || "", DEF_EN_MAX),
      defKo: note.defKo || "",
      countOT: counts.total,
      byBook: Object.fromEntries(
        Object.entries(counts.byBook).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      ),
      phrases,
    };
    fs.writeFileSync(path.join(OUT_LEX, `${strong}.json`), JSON.stringify(obj, null, 2) + "\n");
    lexWritten += 1;
  }

  // ── 보고용 샘플 ─────────────────────────────────────────────────────────
  const ps20 = JSON.parse(fs.readFileSync(path.join(OUT_ROOT, "psalms", "20.json"), "utf8"));
  const ps23 = JSON.parse(fs.readFileSync(path.join(OUT_ROOT, "psalms", "23.json"), "utf8"));
  const v20_1 = ps20.verses.find((v) => v.n === 1);
  const v23_1 = ps23.verses.find((v) => v.n === 1);

  const bookSizes = {};
  for (const id of new Set(emitStats.map((s) => s.book))) {
    bookSizes[id] = dirSize(path.join(OUT_ROOT, id));
  }
  const lexSize = dirSize(OUT_LEX);

  const report = {
    mode: all ? "all" : "pilot",
    verseSystemDiffs: VERSE_SYSTEM_DIFFS,
    titleShiftsInPilot: titleShiftReport,
    emit: emitStats,
    lexiconFiles: lexWritten,
    sizes: {
      books: bookSizes,
      lexicon: lexSize,
      totalBytes:
        Object.values(bookSizes).reduce((n, s) => n + s.bytes, 0) + lexSize.bytes,
      totalFiles:
        Object.values(bookSizes).reduce((n, s) => n + s.files, 0) + lexSize.files,
    },
    psalm20_1: (v20_1?.words || []).map((w) => ({
      word: w.word,
      pron: w.pron,
      glossKo: w.glossKo,
      strong: w.strong,
    })),
    psalm23_1: {
      titleShift: !!ps23.titleShift,
      verseCount: ps23.verses.length,
      krvExpected: krvVerseCount("psalms", 23),
      firstWords: (v23_1?.words || []).slice(0, 8).map((w) => ({
        word: w.word,
        pron: w.pron,
        glossKo: w.glossKo,
      })),
      mappingNote:
        "시 23은 WLC·KRV 절 수가 같아 1:1. 표제(미즈몰 르다윗)가 히브리 1절 본문에 포함되어 있어요.",
    },
  };

  const reportPath = path.join(OUT_ROOT, "_hebrew-pilot-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log("\n=== REPORT ===");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\n[report] ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
