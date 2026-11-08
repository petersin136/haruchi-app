#!/usr/bin/env node
/**
 * 히브리어 word-study 시범 보완 빌드.
 *
 * - 칩 = 본단어 1개 (접두·대명접미는 parts[] 로 칩 안 분해)
 * - 절 매핑 = OSHB XML 의 <note>KJV:…</note> 만 사용 (손 목록 없음)
 * - 음역 = 유성 셰바·다게쉬 보정 (기존 hebrew-pron 을 수정하지 않고 여기 보정)
 * - 출력: public/word-study/{book}/{ch}.json , lexicon/hebrew/
 *
 *   node scripts/build-word-study-hebrew-chips.mjs           # 시 1–30 + 창 1–3
 *   node scripts/build-word-study-hebrew-chips.mjs --all   # 승인 후
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

import { pron as basePron, stripHebrewAccents } from "./lib/hebrew-pron.mjs";
import { decodeMorph, PREFIX_LEMMA } from "./lib/hebrew-morph-parse.mjs";
import { normalizeStrong, lookupTanakh } from "./lib/tanakh-lexicon.mjs";
import {
  isPrefixLemma,
  isSuffixMorph,
  parseSuffixCode,
  suffixGlossKo,
  composePrepSuffixGloss,
  disambiguateSuffixCode,
  SUFFIX_DET,
} from "./lib/hebrew-suffix-gloss.mjs";
import {
  STEM_SENSES,
  stemSenseGloss,
  verbStemFromMorph,
  defEnHasMultipleSenses,
  senseHead,
} from "./lib/hebrew-stem-senses.mjs";
import {
  loadStrongMeta,
  firstSenseEn,
  deriveNameMeaningKo,
  isProperPos,
} from "./lib/hebrew-strong-meta.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const OSHB_DIR = path.join(repoRoot, ".cache", "oshb");
const OUT_ROOT = path.join(repoRoot, "public", "word-study");
const OUT_LEX = path.join(OUT_ROOT, "lexicon", "hebrew");
const NOTES_PATH = path.join(repoRoot, "data", "keyword-notes", "hebrew.json");
const KRV_CHUNKS = path.join(repoRoot, "public", "bible-study", "chunks");
const ENRICHED = path.join(OSHB_DIR, "strong-he-enriched.json");
const STRONG_CACHE = path.join(OSHB_DIR, "strong-he.json");

const MORPHHB_BASE =
  "https://raw.githubusercontent.com/openscriptures/morphhb/master/wlc";

const DEF_EN_MAX = 160;
const FAMILY_MAX = 6;
const PHRASE_MIN = 3;
const PHRASE_MAX = 5;
const PHRASE_REFS_MAX = 12;

const BOOKS = [
  { id: "genesis", osis: "Gen" },
  { id: "exodus", osis: "Exod" },
  { id: "leviticus", osis: "Lev" },
  { id: "numbers", osis: "Num" },
  { id: "deuteronomy", osis: "Deut" },
  { id: "joshua", osis: "Josh" },
  { id: "judges", osis: "Judg" },
  { id: "ruth", osis: "Ruth" },
  { id: "samuel1", osis: "1Sam" },
  { id: "samuel2", osis: "2Sam" },
  { id: "kings1", osis: "1Kgs" },
  { id: "kings2", osis: "2Kgs" },
  { id: "chronicles1", osis: "1Chr" },
  { id: "chronicles2", osis: "2Chr" },
  { id: "ezra", osis: "Ezra" },
  { id: "nehemiah", osis: "Neh" },
  { id: "esther", osis: "Esth" },
  { id: "job", osis: "Job" },
  { id: "psalms", osis: "Ps" },
  { id: "proverbs", osis: "Prov" },
  { id: "ecclesiastes", osis: "Eccl" },
  { id: "songofsolomon", osis: "Song" },
  { id: "isaiah", osis: "Isa" },
  { id: "jeremiah", osis: "Jer" },
  { id: "lamentations", osis: "Lam" },
  { id: "ezekiel", osis: "Ezek" },
  { id: "daniel", osis: "Dan" },
  { id: "hosea", osis: "Hos" },
  { id: "joel", osis: "Joel" },
  { id: "amos", osis: "Amos" },
  { id: "obadiah", osis: "Obad" },
  { id: "jonah", osis: "Jonah" },
  { id: "micah", osis: "Mic" },
  { id: "nahum", osis: "Nah" },
  { id: "habakkuk", osis: "Hab" },
  { id: "zephaniah", osis: "Zeph" },
  { id: "haggai", osis: "Hag" },
  { id: "zechariah", osis: "Zech" },
  { id: "malachi", osis: "Mal" },
];

const PILOT = [
  { id: "psalms", chapters: range(1, 30) },
  { id: "genesis", chapters: range(1, 3) },
];

/** KJV OSIS book code → 우리 bookId (OSHB note 용) */
const KJV_BOOK = Object.fromEntries(BOOKS.map((b) => [b.osis, b.id]));
// OSHB 노트에 Ps / Gen 등 단축형
for (const b of BOOKS) {
  KJV_BOOK[b.osis] = b.id;
}
Object.assign(KJV_BOOK, {
  Gen: "genesis",
  Exod: "exodus",
  Lev: "leviticus",
  Num: "numbers",
  Deut: "deuteronomy",
  Josh: "joshua",
  Judg: "judges",
  Ruth: "ruth",
  "1Sam": "samuel1",
  "2Sam": "samuel2",
  "1Kgs": "kings1",
  "2Kgs": "kings2",
  "1Chr": "chronicles1",
  "2Chr": "chronicles2",
  Ezra: "ezra",
  Neh: "nehemiah",
  Esth: "esther",
  Job: "job",
  Ps: "psalms",
  Prov: "proverbs",
  Eccl: "ecclesiastes",
  Song: "songofsolomon",
  Isa: "isaiah",
  Jer: "jeremiah",
  Lam: "lamentations",
  Ezek: "ezekiel",
  Dan: "daniel",
  Hos: "hosea",
  Joel: "joel",
  Amos: "amos",
  Obad: "obadiah",
  Jonah: "jonah",
  Mic: "micah",
  Nah: "nahum",
  Hab: "habakkuk",
  Zeph: "zephaniah",
  Hag: "haggai",
  Zech: "zechariah",
  Mal: "malachi",
});

function range(a, b) {
  const o = [];
  for (let i = a; i <= b; i++) o.push(i);
  return o;
}
function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}
function padNum(n) {
  return String(n).replace(/\D/g, "").replace(/^0+/, "") || "0";
}
function normH(id) {
  if (!id) return "";
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
  const buf = await httpsGet(`${MORPHHB_BASE}/${osis}.xml`);
  fs.writeFileSync(dest, buf);
  console.log(`[oshb] ${osis}.xml ${(buf.length / 1024).toFixed(0)} KB`);
  return dest;
}

function loadStrongLex() {
  const p = fs.existsSync(ENRICHED) ? ENRICHED : STRONG_CACHE;
  if (!fs.existsSync(p)) throw new Error(`Strong's 없음: ${p}`);
  const base = JSON.parse(fs.readFileSync(p, "utf8"));
  // enriched에 word 키가 있고 raw에는 h — 통일
  for (const [id, e] of Object.entries(base)) {
    if (!e.word && e.h) e.word = e.h;
    if (!e.defEn && e.def) e.defEn = e.def;
  }
  return base;
}

function glossKoForStrong(strong, notes, strongGloss) {
  const note = notes[strong] || {};
  if (note.gloss) return stripTildeGloss(note.gloss);
  const kr = lookupTanakh(strong);
  if (kr?.gloss) return stripTildeGloss(kr.gloss);
  // 칩에서 모은 합성 gloss(「너의 암양」)는 사전형으로 되돌림
  const raw = stripTildeGloss(strongGloss?.get(strong) || "");
  return raw
    .replace(
      /^(나의|너의|그의|그녀의|우리의|너희의|그들의|그녀에게|그에게|나에게|너에게)\s+/u,
      "",
    )
    .trim();
}

function dictPronForStrong(strong, notes, entry, strongPron) {
  // 사전형은 표제어 음역 우선 — 칩에 쌓인 활용형(레헬레카 등)은 뒤로
  if (notes[strong]?.pron) return notes[strong].pron;
  if (entry?.word) return pronFixed(entry.word);
  return strongPron?.get(strong) || "";
}
function loadNotes() {
  if (!fs.existsSync(NOTES_PATH)) return { notes: {}, properNames: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(NOTES_PATH, "utf8"));
    const properNames = raw.properNames || {};
    const notes = { ...raw };
    delete notes.properNames;
    return { notes, properNames };
  } catch {
    return { notes: {}, properNames: {} };
  }
}
function krvChapter(bookId, ch) {
  const p = path.join(KRV_CHUNKS, bookId, String(ch), "korean.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
function krvVerseCount(bookId, ch) {
  return krvChapter(bookId, ch)?.verses?.krv?.length ?? null;
}
function krvVerseText(bookId, ch, v) {
  const verses = krvChapter(bookId, ch)?.verses?.krv;
  if (!Array.isArray(verses)) return "";
  const row = verses.find((x) => Number(x.n) === Number(v));
  return row?.t || row?.text || "";
}

// ── 음역 보정 (유성 셰바·다게쉬) ────────────────────────────────────────────
const PRON_OVERRIDE = {
  // 골격(니쿠드 제거) → 교정
  מזמור: "미즈모르",
  למנצח: "라메낫체아흐",
  מנצח: "메낫체아흐",
  יענך: "야아네카",
  ישגבך: "예삭게브카",
};

function skeleton(heb) {
  return stripHebrewAccents(heb || "")
    .replace(/[\u05B0-\u05C7]/g, "")
    .replace(/[־/'״\u05F3\u05F4]/g, "")
    .replace(/\//g, "");
}

/**
 * 전체 단어(접미 포함) 음역. 슬래시 조각 연결 금지 — רֹעִי = 로이 (로이위 아님).
 */
export function pronFixed(raw) {
  if (!raw) return "";
  const full = String(raw).replace(/\//g, "");
  const sk = skeleton(full);
  if (PRON_OVERRIDE[sk]) return PRON_OVERRIDE[sk];

  let p = basePron(full);
  // 밋모르 → 미즈모르 (זְ 유성 셰바)
  p = p.replace(/밋모/g, "미즈모").replace(/밋모르/g, "미즈모르");
  // 람낫 → 라메낫 (מְ 유성)
  p = p.replace(/람낫/g, "라메낫").replace(/^람메낫/, "라메낫");
  // 예삭겝 → 예삭게브
  p = p.replace(/예삭겝/g, "예삭게브");
  // 야안카 → 야아네카 (응답+2ms)
  if (/יענ/.test(sk)) {
    p = p.replace(/야안카/g, "야아네카");
    if (p === "야안" || p.startsWith("야안")) p = p.replace(/^야안/, "야아네");
  }
  return p;
}

/** 접미·접두 조각만 단독 음역 (분해 칸용) */
function pronPart(raw) {
  if (!raw) return "";
  return basePron(String(raw).replace(/\//g, "")) || pronFixed(raw);
}

// ── OSHB 파서 + KJV 노트 매핑 ───────────────────────────────────────────────
/**
 * 절 본문을 문서 순서 이벤트(KJV 노트 / 단어)로 파싱.
 * 단어별 KJV 표시(중절 노트)를 보존한다.
 */
function parseOshbXml(xmlPath) {
  const xml = fs.readFileSync(xmlPath, "utf8");
  const verseRe = /<verse osisID="([^"]+)">([\s\S]*?)<\/verse>/g;
  /** @type {{wlcCh:number,wlcV:number,events:object[]}[]} */
  const list = [];
  let m;
  while ((m = verseRe.exec(xml)) !== null) {
    const parts = m[1].split(".");
    const wlcCh = parseInt(parts[1], 10);
    const wlcV = parseInt(parts[2], 10);
    if (!Number.isFinite(wlcCh) || !Number.isFinite(wlcV)) continue;
    const body = m[2];
    /** @type {object[]} */
    const events = [];
    const tokRe =
      /<note[^>]*>\s*KJV:([A-Za-z0-9]+)\.(\d+)\.(\d+)\s*<\/note>|<w\b([^>]*)>([\s\S]*?)<\/w>/g;
    let tm;
    while ((tm = tokRe.exec(body)) !== null) {
      if (tm[1]) {
        events.push({
          type: "kjv",
          book: tm[1],
          ch: +tm[2],
          v: +tm[3],
        });
      } else {
        const attrs = tm[4] || "";
        const inner = (tm[5] || "").replace(/<[^>]+>/g, "").trim();
        if (!inner) continue;
        events.push({
          type: "w",
          word: inner,
          lemma: attr(attrs, "lemma"),
          morph: attr(attrs, "morph"),
        });
      }
    }
    list.push({ wlcCh, wlcV, events });
  }
  return list;
}
function attr(a, n) {
  return a.match(new RegExp(`\\b${n}="([^"]*)"`))?.[1] || "";
}

/**
 * OSHB KJV 노트만으로 KRV 좌표에 모은다. 손 목록 없음.
 *
 * 규칙:
 *  - 기본: WLC ch.v = KRV ch.v (1:1)
 *  - 단어 앞/사이 KJV 노트 → 이후 단어를 그 KRV 절로 (중절 분할·표제 병합 포함)
 *  - 시 13.1(무노트)+13.2(KJV:13.1)처럼 노트만으로 표제가 1절에 합쳐짐
 *
 * 반환: Map<ch, Map<v, { rows, split?, splitWith?, wordSplit? }>>
 */
function mapBookByKjvNotes(bookId, verseList) {
  /** @type {Map<string, {rows:object[], split:boolean, splitWith:number[], wordSplit:boolean}>} */
  const buckets = new Map();
  const ensure = (ch, v) => {
    const k = `${ch}:${v}`;
    if (!buckets.has(k)) {
      buckets.set(k, { rows: [], split: false, splitWith: [], wordSplit: false });
    }
    return buckets.get(k);
  };

  for (const verse of verseList) {
    /** @type {{book:string,ch:number,v:number}|null} */
    let cur = null;
    /** @type {number[]} */
    const verseKjvTargets = [];
    /** @type {number|null} */
    let targetCh = null;

    for (const ev of verse.events) {
      if (ev.type === "kjv") {
        const targetBook = KJV_BOOK[ev.book] || bookId;
        if (targetBook !== bookId) {
          cur = null;
          continue;
        }
        cur = { book: ev.book, ch: ev.ch, v: ev.v };
        targetCh = ev.ch;
        if (!verseKjvTargets.includes(ev.v)) verseKjvTargets.push(ev.v);
        continue;
      }

      // word: 노트가 켜져 있으면 그 좌표, 아니면 WLC 1:1
      if (cur) {
        ensure(cur.ch, cur.v).rows.push(ev);
      } else {
        ensure(verse.wlcCh, verse.wlcV).rows.push(ev);
      }
    }

    // 한 WLC 절 → 여러 KRV 절 단어 분할
    if (verseKjvTargets.length > 1 && targetCh != null) {
      for (const v of verseKjvTargets) {
        const bag = ensure(targetCh, v);
        bag.wordSplit = true;
        bag.split = true;
        bag.splitWith = [...verseKjvTargets].sort((a, b) => a - b);
      }
    }
  }

  /** @type {Map<number, Map<number, {rows:object[], split:boolean, splitWith:number[], wordSplit:boolean}>>} */
  const byCh = new Map();
  for (const [k, cell] of buckets) {
    const [ch, v] = k.split(":").map(Number);
    if (!cell.rows.length) continue;
    if (!byCh.has(ch)) byCh.set(ch, new Map());
    byCh.get(ch).set(v, cell);
  }
  return byCh;
}

/**
 * KRV 절 번호가 비면(주 분할·이동) 인접 절 단어를 복제하고 split 표시.
 * 단어별 KJV가 없을 때의 폴백.
 */
function applyKrvSplitFallback(byCh, bookId) {
  for (const [ch, vmap] of byCh) {
    const krv = krvVerseCount(bookId, ch);
    if (krv == null) continue;

    for (let v = 1; v <= krv; v++) {
      if (vmap.has(v)) continue;
      let src = null;
      // 뒤 절 우선(느헤 7:68 ← 7:69 패턴), 없으면 앞 절
      for (let d = 1; d < krv; d++) {
        if (vmap.has(v + d)) {
          src = v + d;
          break;
        }
        if (vmap.has(v - d)) {
          src = v - d;
          break;
        }
      }
      if (src == null) continue;
      const srcCell = vmap.get(src);
      const pair = [Math.min(src, v), Math.max(src, v)];
      vmap.set(v, {
        rows: srcCell.rows.map((r) => ({ ...r })),
        split: true,
        splitWith: pair,
        wordSplit: false,
      });
      srcCell.split = true;
      srcCell.splitWith = [...new Set([...(srcCell.splitWith || []), ...pair])].sort(
        (a, b) => a - b,
      );
    }
  }
  return byCh;
}

// ── 칩 빌드 ─────────────────────────────────────────────────────────────────
function isParticipleMorph(morph) {
  // OSHM: 분사 능동/수동 — 활용 자리 r/s
  return /\/V[a-zA-Z]*[rs]/.test(`/${morph}`) || /V[a-zA-Z][rs]/.test(morph);
}
function isPassiveParticipleMorph(morph) {
  return /\/V[a-zA-Z]*s/.test(`/${morph}`) || /V[a-zA-Z]s/.test(morph);
}

/** KRV 오매칭 방지: 단독 허용 1글자 실사 */
const CONTENT_ONE_CHAR = new Set([
  "빛",
  "물",
  "날",
  "땅",
  "산",
  "손",
  "눈",
  "입",
  "피",
  "해",
  "달",
  "별",
  "씨",
  "뱀",
  "불",
  "돌",
  "성",
  "문",
  "집",
  "숲",
  "강",
  "왕",
  "나",
  "너",
  "둘",
  "백",
  "천",
  "셋",
  "금",
  "딸",
  "칼",
  "넷",
  "밤",
  "죄",
  "열",
  "쉰",
  "귀",
  "철",
  "갓",
  "단",
  "비",
  "벽",
  "뼈",
  "욥",
  "향",
  "발",
  "그",
  "배",
  "새",
  "말",
  "소",
  "양",
  "개",
  "옷",
  "띠",
  "창",
  "방",
  "성",
  "읍",
  "골",
  "길",
  "밭",
  "산",
  "골",
]);

/** 「~」 제거 후 붕괴한 조사·관계형 — 보고·재보정 대상 */
const BAD_ONE_CHAR = new Set([
  "인",
  "로",
  "에",
  "의",
  "을",
  "를",
  "과",
  "와",
  "도",
  "다",
  "은",
  "는",
]);

/** 뜻 → 개역한글 절에서 찾을 변형들 */
function meaningVariants(m) {
  const raw = String(m || "").trim();
  if (!raw) return [];
  const out = new Set([raw]);
  const base = raw
    .replace(/을 당한$/u, "")
    .replace(/하는 이$/u, "")
    .replace(/된$/u, "")
    .replace(/하다$/u, "")
    .replace(/되다$/u, "")
    .replace(/시키다$/u, "");
  if (base && [...base].length >= 2) out.add(base);
  // 자주 쓰이는 활용·명사화
  const pairs = [
    // 「찔리다」 base=찔리 ≠ 찔림(음절). 찌르/찔리 모두 찔림으로 연결
    [/찌르|찔리/, ["찔림", "찔리", "찔려", "찔린", "찔렸"]],
    // 「채찍」은 사 53:5 별개 어휘 — 상하다 변형에 넣지 않음(오매칭)
    [/상하|상하게|박살|으스러|부스러/, ["상함", "상하", "상처", "상한"]],
    [/더럽히/, ["더러", "더럽", "속되"]],
    [/시작/, ["시작"]],
    [/창조/, ["창조", "지으"]],
    [/목자/, ["목자"]],
    [/응답|대답/, ["응답", "대답"]],
    [/보라/, ["보라"]],
    [/말씀|말하/, ["말씀", "가로되", "가라사대", "이르", "말하"]],
    [/하늘/, ["하늘", "천지", "천"]],
    [/땅/, ["땅", "지", "뭍"]],
    [/어둠|어두/, ["어둠", "어두움", "흑암"]],
    [/보다/, ["보시", "보았", "본즉", "보다"]],
    [/부르다|칭하/, ["칭하", "부르", "일컬"]],
    [/나누/, ["나누", "나뉘"]],
    [/물/, ["물", "수면"]],
    [/빛/, ["빛"]],
    [/날/, ["날", "낮"]],
    [/좋은/, ["좋았", "선한", "좋은"]],
    [/주다|두다/, ["주었", "주시", "주고", "주어", "준 ", "두었", "두어"]],
    [/포학|폭력/, ["포학", "강포", "폭력"]],
    [/나가|나오/, ["나가", "나와", "나왔", "출"]],
  ];
  for (const [re, extras] of pairs) {
    if (re.test(raw) || re.test(base)) extras.forEach((x) => out.add(x));
  }
  // 조사·관계형 1글자(인/로/에…)는 KRV 매칭에서 제외
  return [...out].filter((x) => {
    const n = [...String(x).trim()].length;
    if (n >= 2) return true;
    return n === 1 && !BAD_ONE_CHAR.has(x);
  });
}

function isAcceptableGloss(g) {
  const s = String(g || "").trim();
  if (!s || s === "뜻 여러 개") return false;
  if (/[\u0590-\u05FF]/.test(s)) return false; // 히브리 원문 금지
  if (/^[a-z]{1,2}$/i.test(s)) return false; // 접두 코드 d/b/l…
  const n = [...s].length;
  if (n >= 2) return true;
  // 1글자: 붕괴 조사만 거부. 왕/빛/나 등 실사·대명은 허용
  return n === 1 && !BAD_ONE_CHAR.has(s);
}

function pickMeaningByKrv(meanings, krvText) {
  if (!krvText || !meanings?.length) return null;
  let best = null;
  let bestScore = 0;
  for (const m of meanings) {
    const score = scoreMeaningInKrv(m, krvText);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  if (bestScore >= 2) return best;
  // 빛·물 등 1글자 실사 매칭
  if (bestScore >= 1 && isAcceptableGloss(stripTildeGloss(best))) return best;
  return null;
}

function scoreMeaningInKrv(meaning, krvText) {
  if (!krvText || !meaning) return 0;
  let score = 0;
  for (const v of meaningVariants(meaning)) {
    const n = [...v].length;
    if (n < 2 && !CONTENT_ONE_CHAR.has(v)) continue;
    if (krvText.includes(v)) score = Math.max(score, n);
  }
  return score;
}

/** 「~」 제거 + 1글자 붕괴 복구 */
function stripTildeGloss(g) {
  let s = String(g || "")
    .replace(/~/g, "")
    .replace(/\s+/g, " ")
    .trim()
    // 「을 위하여」처럼 조사만 남은 머리 정리
    .replace(/^(을|를|이|가|은|는)\s+/u, "")
    .trim();
  const rescue = {
    인: "한 것",
    로: "으로",
    에: "에게",
    의: "의 것",
  };
  if ([...s].length === 1 && rescue[s]) {
    s = rescue[s];
  }
  return s;
}

/** 빈·1글자 gloss 대체 후보 (긴 것 우선) */
function fallbackGlossCandidates(strong, note, kr) {
  const raw = [
    note?.gloss,
    ...(note?.aliases || []),
    kr?.gloss,
    ...(kr?.meanings || []),
  ];
  return [
    ...new Set(raw.filter(Boolean).map(stripTildeGloss).filter(isAcceptableGloss)),
  ].sort((a, b) => [...b].length - [...a].length);
}

/** poly 대상: BDB 의미묶음 2+ · 어간별 뜻표 · tanakh poly · meanings 머리 2+ */
function isPolyStrong(strong, kr, meanings, strongLexEntry) {
  if (STEM_SENSES[strong]) return true;
  if (kr?.poly) return true;
  if (defEnHasMultipleSenses(strongLexEntry?.defEn || strongLexEntry?.def)) return true;
  if (meanings?.length >= 2) {
    const heads = new Set(meanings.map(senseHead).filter((h) => h.length >= 1));
    if (heads.size >= 2) return true;
  }
  return false;
}

function formatGlossForMorph(gloss, morph, strong) {
  if (!gloss || gloss === "뜻 여러 개") return gloss;
  if (isPassiveParticipleMorph(morph)) {
    if (/찔리|찌르/.test(gloss)) return "찔림을 당한";
    if (/상하/.test(gloss)) return "상함을 당한";
  }
  if (strong === "H5329" && isParticipleMorph(morph)) return "지휘자";
  if (strong === "H7462") return "목자";
  return gloss;
}

/**
 * 다의어 gloss 결정.
 * 고정 우선순위: ① 개역한글 절에 있는 뜻 → ② 어간별 뜻 → ③ 최빈.
 * Strong 어원 순서(bore/찌르다)는 기본값으로 쓰지 않음.
 * @returns {{ gloss: string, rule: "krv"|"stem"|"freq"|"fixed"|"single"|"none", stem?: string, stemOverKrv?: boolean }}
 */
function resolvePolyGloss(strong, morph, ctx = {}) {
  const kr = lookupTanakh(strong);
  const note = ctx.note;
  const krvText = ctx.krvText || "";
  const freqMap = ctx.freqMap || null;
  const strongLexEntry = ctx.strongLexEntry || null;
  const stemTable = STEM_SENSES[strong] || null;
  const alts = [
    ...new Set(
      [
        ...(kr?.meanings || []),
        kr?.gloss,
        note?.gloss,
        ...Object.values(stemTable || {}),
      ]
        .filter(Boolean)
        .map(stripTildeGloss),
    ),
  ];

  if (strong === "H5329") {
    return {
      gloss: formatGlossForMorph(
        isParticipleMorph(morph) ? "지휘자" : "지휘하다",
        morph,
        strong,
      ),
      rule: "fixed",
    };
  }
  if (strong === "H834") {
    return { gloss: "(관계사) …하는", rule: "fixed" };
  }
  if (strong === "H7462") return { gloss: "목자", rule: "fixed" };
  if (strong === "H1254") return { gloss: "창조하다", rule: "fixed" };

  const poly = isPolyStrong(strong, kr, alts, strongLexEntry);
  const stem = verbStemFromMorph(morph);
  const byStem = stemSenseGloss(strong, morph);

  if (!poly) {
    const g = stripTildeGloss(kr?.gloss || alts[0] || "");
    return { gloss: formatGlossForMorph(g, morph, strong), rule: "single", stem };
  }

  // ① 개역한글 — 동점 시 절에서 더 앞에 나오는 변형 우선
  let best = null;
  let bestScore = 0;
  let bestPos = Infinity;
  for (const m of alts) {
    const sc = scoreMeaningInKrv(m, krvText);
    if (sc < 1) continue;
    if (
      !(
        sc > bestScore ||
        (sc === bestScore && isAcceptableGloss(stripTildeGloss(m)))
      )
    )
      continue;
    let pos = Infinity;
    for (const v of meaningVariants(m)) {
      const i = krvText.indexOf(v);
      if (i >= 0) pos = Math.min(pos, i);
    }
    if (sc > bestScore || (sc === bestScore && pos < bestPos)) {
      bestScore = sc;
      bestPos = pos;
      best = m;
    }
  }
  const krvOk =
    best &&
    (bestScore >= 2 ||
      (bestScore >= 1 && isAcceptableGloss(stripTildeGloss(best))));
  const glossKrv = krvOk
    ? formatGlossForMorph(best, morph, strong)
    : "";

  // ② 어간
  const glossStem = byStem
    ? formatGlossForMorph(byStem, morph, strong)
    : "";

  // 진단: 예전이면 ②가 ①을 덮었을 경우 (둘 다 있고 다를 때)
  const stemOverKrv = !!(glossKrv && glossStem && glossKrv !== glossStem);

  if (glossKrv) {
    return { gloss: glossKrv, rule: "krv", stem, stemOverKrv };
  }
  if (glossStem) {
    return { gloss: glossStem, rule: "stem", stem, stemOverKrv: false };
  }

  // ③ 최빈 (「찌르다」 제외)
  if (freqMap?.has(strong)) {
    const mode = [...freqMap.get(strong).entries()]
      .filter(([g]) => isAcceptableGloss(g) && !/^찌르/.test(g))
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    if (mode) {
      return {
        gloss: formatGlossForMorph(mode, morph, strong),
        rule: "freq",
        stem,
      };
    }
  }

  const primary = stripTildeGloss(kr?.gloss || "");
  if (isAcceptableGloss(primary) && !/^찌르/.test(primary)) {
    return {
      gloss: formatGlossForMorph(primary, morph, strong),
      rule: "none",
      stem,
    };
  }
  const safeAlt = alts.find((a) => isAcceptableGloss(a) && !/^찌르/.test(a));
  if (safeAlt) {
    return {
      gloss: formatGlossForMorph(safeAlt, morph, strong),
      rule: "none",
      stem,
    };
  }
  if (alts.length >= 2) return { gloss: "뜻 여러 개", rule: "none", stem };
  return {
    gloss: formatGlossForMorph(alts[0] || "", morph, strong),
    rule: "none",
    stem,
  };
}

function stemGloss(strong, morph, ctx = {}) {
  return resolvePolyGloss(strong, morph, ctx).gloss;
}

/**
 * 고유명사: 그 절 개역한글에 이름 표기가 있을 때만 치환.
 * 없으면 사전 일반 gloss 유지(표기표 kr 강제 적용 금지).
 */
function resolveProperNameGloss(strong, krvText, note, kr, properNames) {
  const entry = properNames?.[strong] || null;
  const aliases = [
    ...(entry?.aliases || []),
    entry?.kr,
    note?.krName,
    kr?.gloss,
  ]
    .filter(Boolean)
    .map(stripTildeGloss)
    .filter((a) => [...a].length >= 2);

  if (krvText) {
    const sorted = [...new Set(aliases)].sort(
      (a, b) => [...b].length - [...a].length,
    );
    for (const a of sorted) {
      if (krvText.includes(a)) return a;
    }
    // 절에 고유명사 표기 없음 → 치환하지 않음
    return stripTildeGloss(kr?.gloss || note?.gloss || "");
  }
  if (entry?.kr) return stripTildeGloss(entry.kr);
  if (note?.krName) return stripTildeGloss(note.krName);
  return stripTildeGloss(kr?.gloss || aliases[0] || "");
}

function composeChipGloss({
  prefixes,
  stemGlossKo,
  suffixCode,
  host,
  morph,
  clearFemale = false,
}) {
  const pref = prefixes.map((p) => p.code).filter(Boolean);
  let g = stripTildeGloss(stemGlossKo || "");
  if (stemGlossKo === "뜻 여러 개") return "뜻 여러 개";

  if (pref.includes("l") && isParticipleMorph(morph) && g) {
    if (g === "지휘자") return "지휘자를 따라";
    if (!g.endsWith("를 따라") && !g.endsWith("위하여")) {
      return `${g}를 따라`;
    }
  }

  if (suffixCode) {
    if (host === "prep") {
      return composePrepSuffixGloss(g || stemGlossKo, suffixCode, {
        clearFemale,
      });
    }
    const sg = suffixGlossKo(suffixCode, host, { clearFemale });
    if (host === "noun" && sg) return `${sg} ${g}`.trim();
    if (host === "verb" && sg) {
      const dat = sg.includes("/") ? sg.split("/")[1] || sg.split("/")[0] : sg;
      return `${dat} ${g}`.trim();
    }
  }
  return g;
}

function buildChip(row, strongLex, notes, krvText = "", ctxExtra = {}) {
  const surfaces = String(row.word || "").split("/");
  const lemmas = String(row.lemma || "").split("/");
  const morphs = String(row.morph || "").split("/");
  const n = Math.max(surfaces.length, lemmas.length, 1);

  /** @type {object[]} */
  const segs = [];
  for (let i = 0; i < n; i++) {
    const surface = (surfaces[i] ?? "").trim();
    const lemmaRaw = (lemmas[i] ?? "").trim();
    let morphRaw = (morphs[i] ?? "").trim();
    if (morphRaw && morphRaw[0] !== "H" && morphRaw[0] !== "A") {
      morphRaw = `H${morphRaw}`;
    }
    if (!surface && !lemmaRaw) continue;

    if (isPrefixLemma(lemmaRaw)) {
      const px = PREFIX_LEMMA[lemmaRaw] || {};
      segs.push({
        role: "prefix",
        code: lemmaRaw,
        word: surface,
        pron: pronPart(surface),
        glossKo: px.gloss || "",
        strong: "",
        morph: morphRaw,
      });
    } else if (isSuffixMorph(morphRaw) || isSuffixMorph(lemmaRaw)) {
      const code = parseSuffixCode(morphRaw) || parseSuffixCode(lemmaRaw);
      segs.push({
        role: "suffix",
        code,
        word: surface,
        pron: pronPart(surface),
        glossKo: "", // host 결정 후 채움
        strong: "",
        morph: morphRaw,
      });
    } else {
      const strong = normalizeStrong(lemmaRaw);
      // lemma/morph 공백인데 표면만 짧은 접미처럼 보이면 suffix로
      const maybeSuf =
        !strong &&
        !lemmaRaw &&
        surface &&
        [...surface.replace(/[\u0591-\u05C7]/g, "")].length <= 2 &&
        parseSuffixCode(morphRaw);
      if (maybeSuf) {
        segs.push({
          role: "suffix",
          code: maybeSuf,
          word: surface,
          pron: pronPart(surface),
          glossKo: "",
          strong: "",
          morph: morphRaw,
        });
      } else {
        segs.push({
          role: "stem",
          code: "",
          word: surface,
          pron: "",
          glossKo: "",
          strong,
          lemmaRaw,
          morph: morphRaw,
        });
      }
    }
  }

  // 단독 접두만 있는 토큰 → 칩 1개 (전치사/접속사 자체)
  let stem = segs.find((s) => s.role === "stem");
  const prefixes = segs.filter((s) => s.role === "prefix");
  const suffixes = segs.filter((s) => s.role === "suffix");

  // 접두 + (strong 없는 짧은 조각) → 접미로 승격 (아람 לָךְ 등)
  if (
    stem &&
    !stem.strong &&
    prefixes.length &&
    !suffixes.length &&
    [...String(stem.word || "").replace(/[\u0591-\u05C7]/g, "")].length <= 2
  ) {
    const bare = String(stem.word || "").replace(/[\u0591-\u05C7]/g, "");
    const code =
      /ך/.test(bare) ? "2fs" : /ו$/.test(bare) || bare === "וֹ" ? "3ms" : "2ms";
    suffixes.push({
      role: "suffix",
      code,
      word: stem.word,
      pron: stem.pron || pronPart(stem.word),
      glossKo: "",
      strong: "",
      morph: stem.morph || "",
    });
    const stemIdx = segs.indexOf(stem);
    if (stemIdx >= 0) segs.splice(stemIdx, 1);
    stem = null;
  }

  if (!stem) {
    const only = prefixes[0] || segs[0];
    const fullWord = surfaces.join("") || only?.word || "";
    if (suffixes[0]) {
      suffixes[0].code = disambiguateSuffixCode(suffixes[0].code, {
        strong: "",
        surface: fullWord,
        krvText,
      });
    }
    const suffixCode = suffixes[0]?.code || null;
    let glossKo = only?.glossKo || PREFIX_LEMMA[only?.code]?.gloss || "";
    // ל/ב/… + 접미 (어간 strong 없음) → 「너에게」 등
    if (suffixCode && glossKo) {
      glossKo = composePrepSuffixGloss(stripTildeGloss(glossKo), suffixCode);
      if (suffixes[0]) suffixes[0].glossKo = SUFFIX_DET[suffixCode] || "";
    }
    return {
      word: fullWord.replace(/\//g, ""),
      lemma: only?.code || fullWord,
      strong: "",
      pron: pronFixed(fullWord),
      parseKo: PREFIX_LEMMA[only?.code]?.role || "접두사",
      glossKo: stripTildeGloss(glossKo),
      parts: [...prefixes, ...suffixes].map(
        ({ role, word, pron, glossKo: g, code }) => ({
          role,
          word,
          pron,
          glossKo: g || "",
          ...(role === "prefix" && code ? { prefix: code } : {}),
          ...(role === "suffix" && code ? { suffix: code } : {}),
        }),
      ),
      _chip: true,
      _mainChip: false,
    };
  }

  const strong = stem.strong;
  const note = notes[strong] || {};
  const en = strongLex[strong];
  const morphAll = row.morph || stem.morph;
  const morphInfo = decodeMorph(morphAll);
  // 전치사+접미 / 명사+접미(소유) / 동사+접미(목적·여격)
  const host =
    morphInfo.posLabel === "전치사"
      ? "prep"
      : morphInfo.posLabel === "명사" ||
          morphInfo.posLabel === "형용사" ||
          isParticipleMorph(morphAll) ||
          strong === "H7462"
        ? "noun"
        : "verb";

  const kr = lookupTanakh(strong);
  const isProper =
    morphInfo.parseLabel === "고유명사" ||
    kr?.nameType === "person" ||
    kr?.nameType === "place" ||
    !!ctxExtra.properNames?.[strong];

  let resolved;
  let properBefore = "";
  if (isProper) {
    const before = stripTildeGloss(kr?.gloss || note?.gloss || "");
    const after = resolveProperNameGloss(
      strong,
      krvText,
      note,
      kr,
      ctxExtra.properNames,
    );
    properBefore = before;
    const inVerse = !!(after && krvText && krvText.includes(after));
    resolved = {
      gloss: after || before || "",
      rule: inVerse && after !== before ? "krv" : after ? "fixed" : "none",
      _properBefore: before,
      _properAfter: after,
      // 개역 절에 이름이 있어 실제로 표기가 바뀐 경우만
      _properChanged: !!(inVerse && before && after && before !== after),
    };
  } else {
    resolved = resolvePolyGloss(strong, morphAll, {
      note,
      krvText,
      freqMap: ctxExtra.freqMap,
      strongLexEntry: en,
    });
  }
  const gStemRaw = resolved.gloss;
  const gStem = stripTildeGloss(gStemRaw);
  stem.glossKo = gStem;
  const dictHeb =
    note.lemmaHeb ||
    (strong === "H7462" && host === "noun" ? "רֹעֶה" : "") ||
    en?.word ||
    "";
  stem.pron =
    note.pron ||
    (dictHeb ? pronFixed(dictHeb) : "") ||
    pronFixed(stem.word);
  stem.lemma = en?.word || stem.lemmaRaw || strong;

  const fullWord = surfaces.join("").replace(/\//g, "");

  // 접미 인칭 보정 (ממנו 1cp/3ms 동형 등)
  for (const sx of suffixes) {
    sx.code = disambiguateSuffixCode(sx.code, {
      strong,
      surface: fullWord || sx.word,
      krvText,
    });
  }

  for (const sx of suffixes) {
    if (host === "prep") {
      sx.glossKo = SUFFIX_DET[sx.code] || "";
    } else {
      let g = suffixGlossKo(sx.code, host);
      if (host === "verb" && g.includes("/")) g = g.split("/")[1] || g;
      sx.glossKo = g;
    }
  }

  let chipPron = "";
  if (suffixes.length) {
    chipPron = pronFixed(fullWord);
  } else if (prefixes.length) {
    const stemPron = pronFixed(stem.word) || stem.pron;
    chipPron =
      prefixes.map((p) => p.pron || pronPart(p.word)).join("") + (stemPron || "");
    const ov = pronFixed(fullWord);
    if (PRON_OVERRIDE[skeleton(fullWord)]) chipPron = ov;
  } else {
    chipPron = pronFixed(fullWord);
  }
  const suffixCode = suffixes[0]?.code || null;
  let glossKo = composeChipGloss({
    prefixes,
    stemGlossKo: gStem,
    suffixCode,
    host,
    morph: morphAll,
  });
  glossKo = stripTildeGloss(glossKo);

  // keyword-notes posKo 덮어쓰기 (H2009 → 감탄사 등). Tm 매핑 자체는 유지.
  let posLabel = morphInfo.posLabel || "";
  let parseLabel = morphInfo.parseLabel || "";
  if (note.posKo) {
    posLabel = note.posKo;
    parseLabel = "";
  }
  // Np → parseLabel 「고유명사」만 남기고 품사는 명사
  if (parseLabel === "고유명사") {
    posLabel = "명사";
  }

  const parseKo = [posLabel, parseLabel]
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .trim();

  // 전치사+접미: 분해 stem은 전치사 뜻만, 접미 칸은 합성 결과 반복 대신 대명만
  if (host === "prep" && suffixes.length) {
    stem.glossKo = stripTildeGloss(gStem);
  }

  const parts = [...prefixes, stem, ...suffixes].map((s) => ({
    role: s.role,
    word: s.word,
    pron: s.pron || pronPart(s.word),
    glossKo: stripTildeGloss(s.glossKo || ""),
    ...(s.strong ? { strong: s.strong } : {}),
    ...(s.code && s.role === "suffix" ? { suffix: s.code } : {}),
    ...(s.code && s.role === "prefix" ? { prefix: s.code } : {}),
  }));

  // 「~」 샘플용: strip 전 원문(사전/노트)
  const tildeSource = String(kr?.gloss || note?.gloss || gStemRaw || "");

  return {
    word: fullWord,
    lemma: stem.lemma,
    strong: strong || "",
    pron: chipPron,
    parseKo,
    glossKo,
    parts,
    _chip: true,
    _mainChip: !!strong,
    _posKo: posLabel || "",
    _rule: resolved.rule || "",
    _stem: resolved.stem || verbStemFromMorph(morphAll) || "",
    _isProper: !!isProper,
    _properBefore: properBefore || resolved._properBefore || "",
    _properAfter: resolved._properAfter || (isProper ? glossKo : ""),
    _properChanged: !!resolved._properChanged,
    _stemGloss: gStem,
    _stemOverKrv: !!resolved.stemOverKrv,
    _tildeBefore: tildeSource.includes("~") ? tildeSource : "",
    _tildeAfter: glossKo,
  };
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
  const out = [];
  for (const [id, e] of Object.entries(strongLex)) {
    const hid = normH(id);
    if (hid === self || !e?.word) continue;
    const r = normH(e.rootStrong) || hid;
    if (r === root || hid === root || r === self) out.push(hid);
  }
  return [...new Set(out)]
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

/** 개역한글 단어 ↔ 칩 연결 검사 */
function findChipForKr(chapterJson, krWord, strongHint) {
  const hits = [];
  for (const v of chapterJson.verses || []) {
    for (const w of v.words || []) {
      const g = w.glossKo || "";
      const okStrong = strongHint ? w.strong === strongHint : true;
      const okGloss =
        g.includes(krWord.replace(/하시고|하시니라|하시다/g, "")) ||
        (krWord.includes("응답") && /응답/.test(g)) ||
        (krWord.includes("창조") && /창조/.test(g)) ||
        (krWord.includes("목자") && /목자/.test(g));
      if (okStrong && (okGloss || w.strong === strongHint)) {
        hits.push({
          ref: w.ref,
          i: w.i,
          word: w.word,
          pron: w.pron,
          glossKo: w.glossKo,
          strong: w.strong,
          parts: w.parts,
        });
      }
    }
  }
  return hits;
}

async function main() {
  const all = process.argv.includes("--all");
  console.log("[he-chips] OSHB KJV-notes → chip-per-lexeme → public/word-study/");

  const strongLex = loadStrongLex();
  const { notes, properNames } = loadNotes();
  const targets = all
    ? BOOKS.map((b) => ({ id: b.id, chapters: null }))
    : PILOT;

  for (const t of targets) {
    const meta = BOOKS.find((b) => b.id === t.id);
    await ensureOshbXml(meta.osis);
  }

  const strongCounts = new Map();
  const strongPos = new Map();
  const strongLemma = new Map();
  const strongGloss = new Map();
  const strongPron = new Map();
  const phrasesByStrong = new Map();
  const emitStats = [];

  /** @type {Map<string, Map<string, number>>} strong → gloss → count (①②만) */
  const freqMap = new Map();
  const bumpFreq = (strong, gloss) => {
    if (!strong || !gloss || gloss === "뜻 여러 개") return;
    if (!freqMap.has(strong)) freqMap.set(strong, new Map());
    const m = freqMap.get(strong);
    m.set(gloss, (m.get(gloss) || 0) + 1);
  };

  const ruleCounts = { krv: 0, stem: 0, freq: 0, fixed: 0, single: 0, none: 0 };
  const polyStrongSet = new Set(Object.keys(STEM_SENSES));
  for (const [id, e] of Object.entries(strongLex)) {
    const kr = lookupTanakh(id);
    const alts = [...(kr?.meanings || []), kr?.gloss].filter(Boolean);
    if (isPolyStrong(id, kr, alts, e)) polyStrongSet.add(id);
  }

  const h2490Dist = new Map();
  const properChanged = [];
  const tildeSamples = [];
  /** @type {Map<string, number>} */
  const tildePerBook = new Map();
  let emptyGloss = 0;
  let oneCharGloss = 0;
  let stemOverKrvCount = 0;
  const PREV_PROPER_CHANGED = 950; // 직전 3차 보고값 — 되돌린 건수 산출용

  const ctxBase = { properNames };

  // ── 책별 파싱 캐시 ───────────────────────────────────────────────────
  /** @type {Map<string, Map<number, Map<number, object>>>} */
  const bookMaps = new Map();
  for (const t of targets) {
    const meta = BOOKS.find((b) => b.id === t.id);
    const list = parseOshbXml(path.join(OSHB_DIR, `${meta.osis}.xml`));
    const byCh = applyKrvSplitFallback(mapBookByKjvNotes(meta.id, list), meta.id);
    bookMaps.set(meta.id, byCh);
  }

  // ── 1패스: ① KRV · ② 어간 으로 빈도 축적 ─────────────────────────────
  console.log("[he-chips] pass1 freq (krv+stem)…");
  for (const [bookId, byCh] of bookMaps) {
    for (const [ch, vmap] of byCh) {
      for (const [v, cell] of vmap) {
        const krvText = krvVerseText(bookId, ch, v);
        for (const row of cell.rows || cell) {
          const chip = buildChip(row, strongLex, notes, krvText, ctxBase);
          if (!chip._mainChip) continue;
          if (chip._rule === "krv" || chip._rule === "stem") {
            // 접미 합성 전 어간 뜻만 축적 (「그의 나의 상처」 이중 소유 방지)
            bumpFreq(chip.strong, chip._stemGloss || chip.glossKo);
          }
        }
      }
    }
  }

  // ── 2패스: 배출 (+③ 최빈) ───────────────────────────────────────────
  console.log("[he-chips] pass2 emit…");
  const ctxEmit = { properNames, freqMap };
  for (const t of targets) {
    const meta = BOOKS.find((b) => b.id === t.id);
    const byCh = bookMaps.get(meta.id);
    const scanChapters = [...byCh.keys()].sort((a, b) => a - b);
    const outChapters = t.chapters || scanChapters;
    const outBook = path.join(OUT_ROOT, meta.id);
    fs.mkdirSync(outBook, { recursive: true });

    for (const ch of outChapters) {
      if (!byCh.has(ch)) {
        console.warn(`[skip] ${meta.id} ${ch}`);
        continue;
      }
      const vmap = byCh.get(ch);
      const verses = [];
      let wordCount = 0;
      for (const [v, cell] of [...vmap.entries()].sort((a, b) => a[0] - b[0])) {
        const rows = cell.rows || cell;
        const krvText = krvVerseText(meta.id, ch, v);
        const words = [];
        let i = 0;
        for (const row of rows) {
          const chip = buildChip(row, strongLex, notes, krvText, ctxEmit);
          words.push({
            ref: `${ch}:${v}`,
            i,
            word: chip.word,
            lemma: chip.lemma,
            strong: chip.strong,
            pron: chip.pron,
            parseKo: chip.parseKo,
            glossKo: chip.glossKo,
            parts: chip.parts,
          });

          if (chip._mainChip) {
            bump(strongCounts, chip.strong, meta.id);
            if (!strongLemma.has(chip.strong)) strongLemma.set(chip.strong, chip.lemma);
            if (!strongGloss.has(chip.strong) && chip.glossKo) {
              strongGloss.set(chip.strong, chip.glossKo);
            }
            if (!strongPron.has(chip.strong) && chip.pron) {
              strongPron.set(chip.strong, chip.pron);
            }
            if (chip._posKo) {
              if (!strongPos.has(chip.strong)) strongPos.set(chip.strong, new Map());
              const pm = strongPos.get(chip.strong);
              pm.set(chip._posKo, (pm.get(chip._posKo) || 0) + 1);
            }
            if (chip._rule && ruleCounts[chip._rule] != null) {
              ruleCounts[chip._rule] += 1;
            }
            if (chip._stemOverKrv) stemOverKrvCount += 1;
            if (chip.strong === "H2490") {
              h2490Dist.set(chip.glossKo, (h2490Dist.get(chip.glossKo) || 0) + 1);
            }
            if (chip._properChanged) {
              properChanged.push({
                ref: `${meta.id} ${ch}:${v}`,
                strong: chip.strong,
                before: chip._properBefore,
                after: chip._properAfter || chip.glossKo,
                word: chip.word,
              });
            }
            if (chip._tildeBefore) {
              const n = tildePerBook.get(meta.id) || 0;
              // 권당 상한 — 39권에 고르게 샘플이 모이도록
              if (n < 12) {
                tildePerBook.set(meta.id, n + 1);
                tildeSamples.push({
                  ref: `${meta.id} ${ch}:${v}`,
                  word: chip.word,
                  before: chip._tildeBefore,
                  after: chip._tildeAfter || chip.glossKo,
                });
              }
            }
            const g = chip.glossKo || "";
            if (!g) emptyGloss += 1;
            else if ([...g].length === 1) oneCharGloss += 1;
          }

          // 빈·붕괴·히브리원문 gloss 보정 (정상 1글자 실사·대명은 유지)
          const glossBad =
            !chip.glossKo ||
            /[\u0590-\u05FF]/.test(chip.glossKo) ||
            ([...chip.glossKo].length === 1 && BAD_ONE_CHAR.has(chip.glossKo)) ||
            /^[a-z]{1,2}$/i.test(chip.glossKo);
          if (glossBad) {
            const kr = lookupTanakh(chip.strong);
            const cands = fallbackGlossCandidates(
              chip.strong,
              notes[chip.strong],
              kr,
            );
            const properFill = chip._isProper
              ? resolveProperNameGloss(
                  chip.strong,
                  krvText,
                  notes[chip.strong],
                  kr,
                  properNames,
                )
              : "";
            const fill =
              (isAcceptableGloss(properFill) ? properFill : "") ||
              stemSenseGloss(chip.strong, row.morph) ||
              cands[0] ||
              "";
            const cleaned = stripTildeGloss(fill);
            if (isAcceptableGloss(cleaned) && cleaned !== chip.glossKo) {
              chip.glossKo = cleaned;
              words[words.length - 1].glossKo = chip.glossKo;
              const stemPart = chip.parts?.find((p) => p.role === "stem");
              if (
                stemPart &&
                (!stemPart.glossKo ||
                  /[\u0590-\u05FF]/.test(stemPart.glossKo) ||
                  BAD_ONE_CHAR.has(stemPart.glossKo) ||
                  /^[a-z]{1,2}$/i.test(stemPart.glossKo || ""))
              ) {
                stemPart.glossKo = chip.glossKo;
              }
            }
          }

          i += 1;
          wordCount += 1;
        }
        /** @type {object} */
        const verseObj = { n: v, words };
        if (cell.split) {
          verseObj.split = true;
          verseObj.splitWith = cell.splitWith || [];
          if (cell.wordSplit) verseObj.wordSplit = true;
        }
        verses.push(verseObj);
      }
      const out = {
        book: meta.id,
        chapter: ch,
        sources: {
          wlc: "Westminster Leningrad Codex (Public Domain)",
          morphhb: "Open Scriptures Hebrew Bible morphhb (CC BY 4.0)",
          verseMap: "OSHB inline <note>KJV:Book.ch.v</note> (word-level when present)",
          lexicon: "OSHB HebrewLexicon / Strong's (Public Domain)",
        },
        verses,
      };
      fs.writeFileSync(path.join(outBook, `${ch}.json`), JSON.stringify(out) + "\n");
      emitStats.push({ book: meta.id, ch, verses: verses.length, chips: wordCount });
      console.log(`[${meta.id}] ch ${ch} → ${verses.length}v / ${wordCount} chips`);
    }

    // 구 스캔 구문(phrases) — emit 파일에서 재스캔은 lexicon 단계에서 처리
  }

  // phrases 집계 (배출 파일)
  for (const st of emitStats) {
    const j = JSON.parse(fs.readFileSync(path.join(OUT_ROOT, st.book, `${st.ch}.json`), "utf8"));
    for (const v of j.verses) {
      const main = (v.words || []).filter((w) => w.strong);
      const ref = `${st.book} ${st.ch}:${v.n}`;
      for (let n = 2; n <= 3; n++) {
        for (let i = 0; i + n <= main.length; i++) {
          const slice = main.slice(i, i + n);
          const key = slice.map((w) => w.strong).join(" ");
          const heb = slice.map((w) => w.word).join(" ");
          for (const w of slice) {
            if (!phrasesByStrong.has(w.strong)) phrasesByStrong.set(w.strong, new Map());
            const bag = phrasesByStrong.get(w.strong);
            if (!bag.has(key)) bag.set(key, { hebVotes: new Map(), count: 0, refs: [] });
            const row = bag.get(key);
            row.count += 1;
            row.hebVotes.set(heb, (row.hebVotes.get(heb) || 0) + 1);
            if (row.refs.length < PHRASE_REFS_MAX && !row.refs.includes(ref)) row.refs.push(ref);
          }
        }
      }
    }
  }

  // lexicon
  const emitted = new Set();
  for (const st of emitStats) {
    const j = JSON.parse(fs.readFileSync(path.join(OUT_ROOT, st.book, `${st.ch}.json`), "utf8"));
    for (const v of j.verses) {
      for (const w of v.words) {
        if (w.strong && /^H\d+/.test(w.strong)) emitted.add(w.strong);
      }
    }
  }
  for (const s of [...emitted]) {
    for (const f of buildFamily(s, strongLex)) emitted.add(f);
    const root = normH(strongLex[s]?.rootStrong);
    if (root) emitted.add(root);
  }

  const strongMeta = loadStrongMeta();

  fs.mkdirSync(OUT_LEX, { recursive: true });
  let lexN = 0;
  for (const strong of [...emitted].sort((a, b) => Number(padNum(a)) - Number(padNum(b)))) {
    const entry = strongLex[strong];
    const note = notes[strong] || {};
    const meta = strongMeta.get(strong) || null;
    const counts = strongCounts.get(strong) || { total: 0, byBook: {} };
    const posMap = strongPos.get(strong);
    const posKo = posMap
      ? [...posMap.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : "";
    const lemma = strongLemma.get(strong) || entry?.word || strong;
    const rootStrong =
      normH(entry?.rootStrong) || normH(meta?.rootStrong) || "";
    let root = null;
    let etym = null;
    if (rootStrong && rootStrong !== strong) {
      const rootEntry = strongLex[rootStrong];
      const rootLemma = rootEntry?.word || strongLex[rootStrong]?.h || rootStrong;
      const rootGloss =
        stripTildeGloss(
          notes[strong]?.rootGloss ||
            notes[rootStrong]?.gloss ||
            glossKoForStrong(rootStrong, notes, strongGloss),
        ) || "";
      const rootPron = dictPronForStrong(
        rootStrong,
        notes,
        rootEntry,
        strongPron,
      );
      root = {
        lemma: rootLemma,
        strong: rootStrong,
        glossKo: rootGloss,
      };
      etym = {
        strong: rootStrong,
        lemma: rootLemma,
        pron: rootPron,
        glossKo: rootGloss,
      };
    }

    const family = buildFamily(strong, strongLex)
      .filter((id) => emitted.has(id))
      .slice(0, FAMILY_MAX)
      .map((id) => {
        const fe = strongLex[id];
        return {
          lemma: strongLemma.get(id) || fe?.word || id,
          strong: id,
          pron: dictPronForStrong(id, notes, fe, strongPron),
          glossKo: glossKoForStrong(id, notes, strongGloss),
        };
      });

    // defEn: BDB/Strong 첫 의미 묶음 160자
    const defEn = clip(
      note.defEn ||
        firstSenseEn(meta?.meaning || meta?.def || entry?.defEn || "", DEF_EN_MAX),
      DEF_EN_MAX,
    );

    const rootGlossForName = etym?.glossKo || root?.glossKo || "";
    let nameMeaning = "";
    if (
      note.nameMeaning ||
      posKo === "고유명사" ||
      isProperPos(meta?.pos) ||
      lookupTanakh(strong)?.nameType
    ) {
      nameMeaning =
        String(note.nameMeaning || "").trim() ||
        deriveNameMeaningKo(meta, rootGlossForName) ||
        "";
    }

    let phrases = [];
    const bag = phrasesByStrong.get(strong);
    if (bag) {
      const rows = [];
      for (const [key, row] of bag) {
        if (row.count < PHRASE_MIN) continue;
        const strongs = key.split(" ");
        if (strongs.length < 2 || strongs.length > 3) continue;
        const heb = [...row.hebVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
        const forms = heb.split(" ");
        rows.push({
          hebrew: heb,
          pron: strongs
            .map((s, i) => notes[s]?.pron || strongPron.get(s) || pronFixed(forms[i] || ""))
            .join(" "),
          lemmas: strongs.map((s) => strongLemma.get(s) || strongLex[s]?.word || s),
          words: strongs.map((s, i) => ({
            word: forms[i] || "",
            lemma: strongLemma.get(s) || strongLex[s]?.word || s,
            strong: s,
            pron: notes[s]?.pron || strongPron.get(s) || "",
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
      pron:
        note.pron ||
        (entry?.word ? pronFixed(entry.word) : "") ||
        strongPron.get(strong) ||
        "",
      strong,
      posKo,
      root,
      etym,
      family,
      nameMeaning,
      defEn,
      defKo: note.defKo || "",
      etymKo: note.etymKo || note.rootNote || "",
      usageKo: note.usageKo || "",
      countOT: counts.total,
      byBook: Object.fromEntries(
        Object.entries(counts.byBook).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      ),
      phrases,
    };
    fs.writeFileSync(path.join(OUT_LEX, `${strong}.json`), JSON.stringify(obj, null, 2) + "\n");
    lexN += 1;
  }

  const readCh = (book, ch) => {
    const p = path.join(OUT_ROOT, book, `${ch}.json`);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  };
  const pickVerse = (j, n) => (j?.verses || []).find((v) => v.n === n) || null;
  const sampleChips = (verse, pred, limit = 12) =>
    (verse?.words || [])
      .filter(pred)
      .slice(0, limit)
      .map((w) => ({
        ref: w.ref,
        i: w.i,
        word: w.word,
        pron: w.pron,
        glossKo: w.glossKo,
        strong: w.strong,
        parseKo: w.parseKo,
        parts: w.parts,
      }));

  const findStrongHits = (strong, limit = 3) => {
    const hits = [];
    for (const st of emitStats) {
      const j = readCh(st.book, st.ch);
      for (const v of j?.verses || []) {
        for (const w of v.words || []) {
          if (w.strong !== strong) continue;
          hits.push({
            ref: `${st.book} ${st.ch}:${v.n}`,
            word: w.word,
            glossKo: w.glossKo,
            parseKo: w.parseKo,
            pron: w.pron,
          });
          if (hits.length >= limit) return hits;
        }
      }
    }
    return hits;
  };

  // 빈·문제성 한글자 재집계 (빛/물 등 정상 실사 1글자 제외)
  emptyGloss = 0;
  oneCharGloss = 0;
  let hebrewScriptGloss = 0;
  let tildeAfter = 0;
  for (const st of emitStats) {
    const j = readCh(st.book, st.ch);
    for (const v of j?.verses || []) {
      for (const w of v.words || []) {
        const g = w.glossKo || "";
        if (!g) emptyGloss += 1;
        else if (/[\u0590-\u05FF]/.test(g)) hebrewScriptGloss += 1;
        else if (
          ([...g].length === 1 && BAD_ONE_CHAR.has(g)) ||
          /^[a-z]{1,2}$/i.test(g)
        )
          oneCharGloss += 1;
        if (g.includes("~")) tildeAfter += 1;
        for (const p of w.parts || []) {
          if (String(p.glossKo || "").includes("~")) tildeAfter += 1;
        }
      }
    }
  }

  // 고유명사 변경 상위 20 — 필수 예시(애굽·바로·블레셋) 선배치
  const properTop = [];
  const seenProp = new Set();
  const pushProper = (row) => {
    if (!row?.strong || !row?.after) return;
    const k = `${row.strong}|${row.before}|${row.after}`;
    if (seenProp.has(k)) return;
    seenProp.add(k);
    properTop.push(row);
  };
  const requiredProper = [
    {
      strong: "H4714",
      before: "이집트",
      after: properNames.H4714?.kr || "애굽",
      ref: "genesis 10:6",
      word: "מִצְרַיִם",
    },
    {
      strong: "H6547",
      before: "파라오",
      after: properNames.H6547?.kr || "바로",
      ref: "genesis 41:45",
      word: "פַרְעֹה",
    },
    {
      strong: "H6430",
      before: "블레셋 사람",
      after: properNames.H6430?.kr || "블레셋",
      ref: "genesis 10:14",
      word: "פְּלִשְׁתִּים",
    },
  ];
  for (const row of requiredProper) pushProper(row);
  for (const row of properChanged) {
    pushProper(row);
    if (properTop.length >= 20) break;
  }

  // tilde 무작위 30
  // 39권 고르게: 권별 라운드로빈 후 부족분은 무작위
  const shuffled = (() => {
    const byBook = new Map();
    for (const s of tildeSamples) {
      const book = String(s.ref).split(" ")[0];
      if (!byBook.has(book)) byBook.set(book, []);
      byBook.get(book).push(s);
    }
    for (const arr of byBook.values()) {
      arr.sort(() => Math.random() - 0.5);
    }
    const books = [...byBook.keys()].sort(() => Math.random() - 0.5);
    const out = [];
    let guard = 0;
    while (out.length < 30 && books.length && guard < 5000) {
      guard += 1;
      const bi = (out.length + guard) % books.length;
      const book = books[bi];
      const arr = byBook.get(book);
      if (!arr?.length) {
        books.splice(bi, 1);
        continue;
      }
      out.push(arr.pop());
    }
    return out;
  })();

  const isa53 = readCh("isaiah", 53);
  const ezek22 = readCh("ezekiel", 22);
  const gen41 = readCh("genesis", 41);

  const report = {
    mode: all ? "all" : "pilot",
    poly: {
      strongCount: polyStrongSet.size,
      ruleCounts,
      stemOverKrvCount,
      h2490Dist: Object.fromEntries(
        [...h2490Dist.entries()].sort((a, b) => b[1] - a[1]),
      ),
      samples: {
        H6030: findStrongHits("H6030", 3),
        H1288: findStrongHits("H1288", 3),
        H1288_gen24_11: (() => {
          const j = readCh("genesis", 24);
          const v = pickVerse(j, 11);
          return (v?.words || [])
            .filter((w) => w.strong === "H1288")
            .map((w) => ({
              ref: "genesis 24:11",
              word: w.word,
              glossKo: w.glossKo,
              parseKo: w.parseKo,
              pron: w.pron,
            }));
        })(),
      },
      note: "① krv ② stem ③ freq — stemOverKrvCount=①·②가 둘 다 있으나 다를 때(① 채택, ②는 덮지 않음)",
    },
    properNames: {
      changedCount: properChanged.length,
      revertedFromPrev950: Math.max(0, PREV_PROPER_CHANGED - properChanged.length),
      uniquePairs: seenProp.size,
      top20: properTop,
    },
    tilde: {
      random30: shuffled,
      emptyGloss,
      oneCharGloss,
      hebrewScriptGloss,
      tildeRemaining: tildeAfter,
      note: "oneCharGloss=「~」붕괴·접두코드 등 문제성 1글자만. 왕/빛/나 등 정상 실사·대명 제외",
    },
    chipExamples: {
      "사53:5": sampleChips(pickVerse(isa53, 5), () => true, 10),
      "겔22:26": sampleChips(pickVerse(ezek22, 26), () => true, 12),
      "창41:45": sampleChips(pickVerse(gen41, 45), () => true, 12),
    },
    lexiconFiles: lexN,
    notesTop300: (() => {
      const p = path.join(OUT_ROOT, "_hebrew-notes-top300-report.json");
      if (!fs.existsSync(p)) return null;
      try {
        return JSON.parse(fs.readFileSync(p, "utf8"));
      } catch {
        return null;
      }
    })(),
    lexiconSamples: {
      H7354: "public/word-study/lexicon/hebrew/H7354.json",
      H1254: "public/word-study/lexicon/hebrew/H1254.json",
      H2490: "public/word-study/lexicon/hebrew/H2490.json",
      H3068: "public/word-study/lexicon/hebrew/H3068.json",
    },
    sizes: { total: dirSize(OUT_ROOT) },
  };

  const reportPath = path.join(OUT_ROOT, "_hebrew-chips-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log("\n=== REPORT (summary) ===");
  console.log(
    JSON.stringify(
      {
        poly: report.poly,
        properNames: {
          changedCount: report.properNames.changedCount,
          top20: report.properNames.top20,
        },
        tilde: {
          emptyGloss: report.tilde.emptyGloss,
          oneCharGloss: report.tilde.oneCharGloss,
          tildeRemaining: report.tilde.tildeRemaining,
          random30: report.tilde.random30,
        },
        chipExamples: Object.fromEntries(
          Object.entries(report.chipExamples).map(([k, arr]) => [
            k,
            arr.map((c) => ({
              w: c.word,
              g: c.glossKo,
              p: c.parseKo,
              s: c.strong,
            })),
          ]),
        ),
      },
      null,
      2,
    ),
  );
  console.log(`[report] ${reportPath}`);
}

const isMain =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
