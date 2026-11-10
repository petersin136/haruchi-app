/**
 * 소제목 문법·주어·높임 다듬기 (보수적 전수)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BOOK_TO_BSB } from "./lib-bsb-usfm.mjs";
import { normEn } from "./lib-bsb-title-ko.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const OT = new Set([
  "genesis", "exodus", "leviticus", "numbers", "deuteronomy", "joshua", "judges",
  "ruth", "samuel1", "samuel2", "kings1", "kings2", "chronicles1", "chronicles2",
  "ezra", "nehemiah", "esther", "job", "psalms", "proverbs", "ecclesiastes",
  "songofsolomon", "isaiah", "jeremiah", "lamentations", "ezekiel", "daniel",
  "hosea", "joel", "amos", "obadiah", "jonah", "micah", "nahum", "habakkuk",
  "zephaniah", "haggai", "zechariah", "malachi",
]);

const BOOK_ABBR = {
  genesis: "창", exodus: "출", leviticus: "레", numbers: "민", deuteronomy: "신",
  joshua: "수", judges: "삿", ruth: "룻", samuel1: "삼상", samuel2: "삼하",
  kings1: "왕상", kings2: "왕하", chronicles1: "대상", chronicles2: "대하",
  ezra: "스", nehemiah: "느", esther: "에", job: "욥", psalms: "시",
  proverbs: "잠", ecclesiastes: "전", songofsolomon: "아", isaiah: "사",
  jeremiah: "렘", lamentations: "애", ezekiel: "겔", daniel: "단", hosea: "호",
  joel: "욜", amos: "암", obadiah: "옵", jonah: "욘", micah: "미", nahum: "나",
  habakkuk: "합", zephaniah: "습", haggai: "학", zechariah: "슥", malachi: "말",
  matthew: "마", mark: "막", luke: "눅", john: "요", acts: "행", romans: "롬",
  corinthians1: "고전", corinthians2: "고후", galatians: "갈", ephesians: "엡",
  philippians: "빌", colossians: "골", thessalonians1: "살전", thessalonians2: "살후",
  timothy1: "딤전", timothy2: "딤후", titus: "딛", philemon: "몬", hebrews: "히",
  james: "약", peter1: "벧전", peter2: "벧후", john1: "요일", john2: "요이",
  john3: "요삼", jude: "유", revelation: "계",
};

function clip14(s) {
  const chars = [...String(s).trim()];
  return chars.length <= 14 ? chars.join("") : chars.slice(0, 14).join("");
}
function len(s) {
  return [...String(s)].length;
}

/** 확정 교정 (영어 norm → 한국어) */
const EXACT_FIX = {
  "peter addresses the crowd": "베드로가 무리에게 말함",
  "a lame man walks": "걷지 못하던 사람이 걸음",
  "elijah denounces ahaziah": "엘리야가 아하시야를 꾸짖음",
  "elisha raises the shunammite's son": "수넴 여인의 아들을 살림",
  "elisha raises the shunammite’s son": "수넴 여인의 아들을 살림",
  "jesus heals the multitudes": "예수가 많은 병을 고치심",
  "jesus heals at peter's house": "예수가 베드로 집에서 고치심",
  "jesus heals at peter’s house": "예수가 베드로 집에서 고치심",
  "jesus calms the storm": "예수가 풍랑을 잔잔케 하심",
  "jesus heals a paralytic": "예수가 중풍병자를 고치심",
  "jesus calls matthew": "예수가 마태를 부르심",
  "jesus heals the blind and mute": "예수가 맹인과 벙어리를 고치심",
  "jesus heals on the sabbath": "예수가 안식일에 고치심",
  "jesus heals at gennesaret": "예수가 게네사렛에서 고치심",
  "jesus blesses the children": "예수가 어린이를 축복하심",
  "jesus cleanses the temple": "예수가 성전을 깨끗케 하심",
  "jesus prays at gethsemane": "예수가 겟세마네에서 기도하심",
  "jesus prays and preaches": "예수가 기도하며 전파하심",
  "jesus calls levi": "예수가 레위를 부르심",
  "jesus heals bartimaeus": "예수가 바디매오를 고치심",
  "jesus appears to two disciples": "예수가 두 제자에게 나타나심",
  "jesus raises a widow's son": "예수가 과부의 아들을 살리심",
  "jesus raises a widow’s son": "예수가 과부의 아들을 살리심",
  "jesus sends the seventy-two": "예수가 칠십 인을 보내심",
  "jesus heals a disabled woman": "예수가 아픈 여인을 고치심",
  "jesus heals a man with dropsy": "예수가 고창병자를 고치심",
  "jesus heals a blind beggar": "예수가 맹인 거지를 고치심",
  "jesus prays on the mount of olives": "예수가 감람산에서 기도하심",
  "jesus appears to the disciples": "예수가 제자들에게 나타나심",
  "jesus calls philip and nathanael": "예수가 빌립을 부르심",
  "jesus heals the official's son": "예수가 신하의 아들을 고치심",
  "jesus heals the official’s son": "예수가 신하의 아들을 고치심",
  "jesus teaches at the feast": "예수가 명절에 가르치심",
  "jesus heals the man born blind": "예수가 맹인을 고치심",
  "jesus raises lazarus": "예수가 나사로를 살리심",
  "jesus preaches in judea": "예수가 유대에서 전파하심",
  "the lord reigns!": "여호와께서 통치하심",
  "god's mercies recalled": "하나님 긍휼을 기억함",
  "god’s mercies recalled": "하나님 긍휼을 기억함",
  "jeremiah prays for understanding": "예레미야가 기도함",
  "noah sends a raven and a dove": "노아가 새를 보냄",
  "david delivers keilah": "다윗이 그일라를 건짐",
  "jephthah delivers israel": "입다가 이스라엘을 건짐",
  "jephthah defeats ephraim": "입다가 에브라임을 이김",
  "the call of gideon": "기드온을 부르심",
  "the call of elisha": "엘리사를 부르심",
  "the call of jeremiah": "예레미야를 부르심",
  "the call of moses": "모세를 부르심",
  "elisha captures the blinded arameans": "엘리사가 아람 군을 사로잡음",
  "the blind men by the road": "길가의 맹인들",
  "the blind man at bethsaida": "벳새다의 맹인",
  "israel is deaf and blind": "듣지 못하고 보지 못함",
  "the birth of perez and zerah": "베레스와 세라의 출생",
  "the song of deborah and barak": "드보라와 바락의 노래",
  "the song of the slandered": "모욕 받는 자의 노래",
  "jesus begins his ministry": "예수 전도의 시작",
  "the flight to egypt": "애굽으로 피하심",
  "the baptism of jesus": "예수께서 세례를 받으심",
  "the temptation of jesus": "광야에서 시험받으심",
};

function grammarFlags(ko) {
  const f = [];
  if (/[을를]\s*말함|[을를]\s*설교|[을를]\s*전파함/.test(ko)) f.push("조사-동사");
  if (/수넴\s*아들/.test(ko)) f.push("소유누락");
  if (/저는\s*자|앉은뱅이/.test(ko)) f.push("낮잡는말");
  if (/소경/.test(ko)) f.push("낮잡는말");
  // 조사 잔여: " 을 "/"을 고치" / "마태 을 "
  if (/(?:^|\s)[을를](?:\s|$)/.test(ko) || /[가-힣]\s[을를]\s*[가-힣]/.test(ko)) f.push("조사잔여");
  if (/^(건지심|이김)\s/.test(ko)) f.push("어순");
  return f;
}

function parseSubject(en) {
  const rules = [
    [/^(The LORD)\b/i, "여호와", "god"],
    [/^(Jesus)\b/i, "예수", "god"],
    [/^(God)\b/i, "하나님", "god"],
    [/^(Christ)\b/i, "그리스도", "god"],
    [/^(Peter)\b/i, "베드로", "human"],
    [/^(Paul)\b/i, "바울", "human"],
    [/^(Elijah)\b/i, "엘리야", "human"],
    [/^(Elisha)\b/i, "엘리사", "human"],
    [/^(Moses)\b/i, "모세", "human"],
    [/^(David)\b/i, "다윗", "human"],
    [/^(Noah)\b/i, "노아", "human"],
    [/^(Jeremiah)\b/i, "예레미야", "human"],
    [/^(Jephthah)\b/i, "입다", "human"],
    [/^(Isaac)\b/i, "이삭", "human"],
  ];
  for (const [re, ko, kind] of rules) if (re.test(en)) return { ko, kind };
  return null;
}

const ACTION_EN =
  /\b(Denounces|Raises|Heals|Addresses|Speaks|Sends|Calls|Blesses|Prays|Teaches|Feeds|Calms|Cleanses|Appears|Preaches|Delivers|Defeats|Captures|Reigns)\b/i;

function honorificFlag(en, ko) {
  const sub = parseSubject(en);
  if (!sub || !ACTION_EN.test(en)) return null;
  if (sub.kind === "god" && /함$/.test(ko) && !/(하심|받음|주심)$/.test(ko)) return "god→함";
  if (sub.kind === "human" && /(?:하)?심$/.test(ko) && !/받으심/.test(ko)) return "human→심";
  return null;
}

function polish(en, ko) {
  const key = normEn(en);
  if (EXACT_FIX[key]) {
    return { ko: clip14(EXACT_FIX[key]), reasons: ["exact"] };
  }

  let t = String(ko).trim();
  const reasons = [];
  const before = t;

  // pejorative
  if (/저는\s*자/.test(t)) {
    t = "걷지 못하던 사람이 걸음";
    reasons.push("낮잡는말");
  }
  if (/앉은뱅이/.test(t)) {
    t = t.replace(/앉은뱅이/g, "걷지 못하는 사람");
    reasons.push("낮잡는말");
  }
  if (/소경/.test(t)) {
    t = t.replace(/소경/g, "맹인");
    reasons.push("낮잡는말");
  }

  // particle-verb
  if (/[을를]\s*말함/.test(t)) {
    t = t.replace(/([가-힣]+?)[을를]\s*말함/, "$1에게 말함");
    reasons.push("조사-동사");
  }
  if (/[을를]\s*설교함?/.test(t)) {
    t = t.replace(/([가-힣]+?)[을를]\s*설교함?/, "$1의 설교");
    reasons.push("조사-동사");
  }

  // possessive
  if (/수넴\s*아들/.test(t)) {
    t = t.replace(/수넴\s*아들/, "수넴 여인의 아들");
    reasons.push("소유누락");
  }

  // stray object particle only: "을 고치심", "마태 을 부르심", "집 을 고치심"
  if (/(?:^|\s)[을를](?:\s|$)/.test(t) || /[가-힣]\s[을를]\s*[가-힣]/.test(t)) {
    t = t
      .replace(/^[을를]\s*/, "")
      .replace(/\s+[을를]\s+/g, "")
      .replace(/([가-힣])\s+([을를])\s*/g, "$1$2")
      .replace(/\s+/g, " ")
      .trim();
    reasons.push("조사잔여");
  }

  // word order
  if (/^건지심\s+/.test(t)) {
    t = t.replace(/^건지심\s+(.+)$/, "$1을 건짐");
    reasons.push("어순");
  }
  if (/^이김\s+/.test(t)) {
    t = t.replace(/^이김\s+(.+)$/, "$1을 이김");
    reasons.push("어순");
  }

  // honorific swap only when flagged
  const hf = honorificFlag(en, t);
  if (hf === "god→함") {
    t = t.replace(/함$/, "하심");
    reasons.push("높임-심");
  } else if (hf === "human→심") {
    if (/하심$/.test(t)) t = t.replace(/하심$/, "함");
    else if (/지심$/.test(t)) t = t.replace(/지심$/, "짐");
    else if (/내심$/.test(t)) t = t.replace(/내심$/, "냄");
    else if (/리심$/.test(t)) t = t.replace(/리심$/, "림");
    else t = t.replace(/심$/, "함");
    reasons.push("높임-함");
  }

  // subject restore (only if missing and fits in 14)
  const sub = parseSubject(en);
  if (sub && ACTION_EN.test(en) && !t.includes(sub.ko)) {
    // special short forms already in EXACT; here try generic
    let cand = `${sub.ko}가 ${t}`.replace(/\s+/g, " ").trim();
    if (sub.kind === "god" && /함$/.test(cand) && !/하심$/.test(cand)) {
      cand = cand.replace(/함$/, "하심");
    }
    if (len(cand) <= 14) {
      t = cand;
      reasons.push("주어보강");
    }
  }

  // KRV
  const krv = [
    [/이집트/g, "애굽"],
    [/파라오/g, "바로"],
    [/메시아(?!야)/g, "메시야"],
    [/세례요한/g, "세례 요한"],
    [/침례\s*요한/g, "세례 요한"],
    [/나병/g, "문둥병"],
    [/야훼/g, "여호와"],
  ];
  for (const [re, good] of krv) {
    if (re.test(t)) {
      t = t.replace(re, good);
      reasons.push("개역표기");
    }
    re.lastIndex = 0;
  }

  t = clip14(t);
  return { ko: t, reasons: t === before ? [] : [...new Set(reasons)] };
}

const changes = [];
const fillPath = path.join(ROOT, ".cache", "headings-exact-fill.json");
const fill = JSON.parse(fs.readFileSync(fillPath, "utf8"));

let grammarBefore = 0;
let grammarAfter = 0;
let honBefore = 0;
let honAfter = 0;
let blankAfter = 0;
let over14After = 0;
let dupInChapter = 0;
const rows = [];

for (const id of Object.keys(BOOK_TO_BSB)) {
  const hPath = path.join(ROOT, "public", "headings", `${id}.json`);
  const rawPath = path.join(ROOT, ".cache", "headings-raw", `${id}.json`);
  const h = JSON.parse(fs.readFileSync(hPath, "utf8"));
  const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));
  let changed = false;

  for (const chs of Object.keys(h).sort((a, b) => +a - +b)) {
    const seen = new Map();
    for (const vs of Object.keys(h[chs]).sort((a, b) => +a - +b)) {
      const en = raw[chs][vs];
      const before = h[chs][vs];
      if (grammarFlags(before).length) grammarBefore++;
      if (honorificFlag(en, before)) honBefore++;

      const { ko: after, reasons } = polish(en, before);
      h[chs][vs] = after;

      if (grammarFlags(after).length) grammarAfter++;
      if (honorificFlag(en, after)) honAfter++;
      if (after === "본문 단락") blankAfter++;
      if (len(after) > 14) over14After++;
      if (seen.has(after)) dupInChapter++;
      else seen.set(after, vs);

      const abbr = BOOK_ABBR[id] || id;
      rows.push({ book: id, abbr, ref: `${chs}:${vs}`, en, ko: after, ot: OT.has(id) });

      if (before !== after) {
        changed = true;
        changes.push({ book: id, abbr, ref: `${chs}:${vs}`, en, before, after, reasons });
        fill[normEn(en)] = after;
      }
    }
  }
  if (changed) fs.writeFileSync(hPath, JSON.stringify(h, null, 2) + "\n");
}

fs.writeFileSync(fillPath, JSON.stringify(fill, null, 2) + "\n");

fs.writeFileSync(
  path.join(ROOT, ".cache", "headings-grammar-changes.json"),
  JSON.stringify({ count: changes.length, changes }, null, 2) + "\n",
);
fs.writeFileSync(
  path.join(ROOT, ".cache", "headings-grammar-changes.tsv"),
  ["책\t장:절\t영어\t전\t후\t사유", ...changes.map((c) =>
    `${c.abbr}\t${c.ref}\t${c.en}\t${c.before}\t${c.after}\t${(c.reasons || []).join(",")}`,
  )].join("\n") + "\n",
);
fs.writeFileSync(
  path.join(ROOT, ".cache", "headings-full-table.tsv"),
  ["책\t장:절\tBSB영어\t한국어", ...rows.map((r) =>
    `${r.abbr}\t${r.ref}\t${r.en}\t${r.ko}`,
  )].join("\n") + "\n",
);
fs.writeFileSync(
  path.join(ROOT, ".cache", "headings-full-table.jsonl"),
  rows.map((r) => JSON.stringify({ ref: `${r.abbr} ${r.ref}`, en: r.en, ko: r.ko })).join("\n") + "\n",
);

const modernRe = /이집트|파라오|메시아(?!야)|침례\s*요한|나병|야훼/;
let krvMiss = 0;
for (const r of rows) {
  if (modernRe.test(r.ko) || (r.ko.includes("메시아") && !r.ko.includes("메시야"))) krvMiss++;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261110);
function pick(arr, n) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}
const sample40 = [...pick(rows.filter((r) => r.ot), 25), ...pick(rows.filter((r) => !r.ot), 15)];

const keyFixes = {};
for (const [b, c, v] of [["acts", "2", "14"], ["kings2", "1", "1"], ["kings2", "4", "18"], ["acts", "3", "1"]]) {
  const row = rows.find((r) => r.book === b && r.ref === `${c}:${v}`);
  const ch = changes.find((x) => x.book === b && x.ref === `${c}:${v}`);
  keyFixes[`${BOOK_ABBR[b]} ${c}:${v}`] = { en: row.en, before: ch?.before ?? row.ko, after: row.ko };
}

const report = {
  total: rows.length,
  grammarBefore,
  grammarAfter,
  honorificBefore: honBefore,
  honorificAfter: honAfter,
  changesTotal: changes.length,
  blankAfter,
  over14After,
  dupInChapter,
  krvMiss,
  changeList: ".cache/headings-grammar-changes.tsv",
  table: ".cache/headings-full-table.tsv",
  keyFixes,
  sample40: sample40.map((r) => `${r.abbr} ${r.ref} · ${r.en} · ${r.ko}`),
};
fs.writeFileSync(path.join(ROOT, ".cache", "headings-polish-report.json"), JSON.stringify(report, null, 2) + "\n");

console.log(JSON.stringify({
  total: report.total,
  grammarBefore,
  grammarAfter,
  honorificBefore: honBefore,
  honorificAfter: honAfter,
  changesTotal: changes.length,
  blankAfter,
  over14After,
  dupInChapter,
  krvMiss,
  keyFixes,
}, null, 2));
console.log("---CHANGES---");
changes.forEach((c) => console.log(`${c.abbr} ${c.ref} | ${c.before} → ${c.after} (${c.reasons})`));
console.log("---SAMPLE40---");
report.sample40.forEach((s) => console.log(s));
