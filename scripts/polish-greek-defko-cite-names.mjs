#!/usr/bin/env node
/**
 * 동사 조립·인용 자르기·한자어·고유명사 말투·krvKo 내용어 비율
 * 범위: scripts/, public/word-study/, data/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "public", "word-study");
const LEX = path.join(OUT, "lexicon", "greek");
const LEX_H = path.join(OUT, "lexicon", "hebrew");
const BD = path.join(root, "public", "bible-data");
const REPORT = path.join(OUT, "_greek-defko-cite-names-report.json");

const NT = [
  "matthew", "mark", "luke", "john", "acts",
  "romans", "corinthians1", "corinthians2", "galatians", "ephesians",
  "philippians", "colossians", "thessalonians1", "thessalonians2",
  "timothy1", "timothy2", "titus", "philemon", "hebrews",
  "james", "peter1", "peter2", "john1", "john2", "john3", "jude", "revelation",
];
const BOOK_KO = {
  matthew: "마", mark: "막", luke: "눅", john: "요", acts: "행",
  romans: "롬", corinthians1: "고전", corinthians2: "고후", galatians: "갈",
  ephesians: "엡", philippians: "빌", colossians: "골", thessalonians1: "살전",
  thessalonians2: "살후", timothy1: "딤전", timothy2: "딤후", titus: "딛",
  philemon: "몬", hebrews: "히", james: "약", peter1: "벧전", peter2: "벧후",
  john1: "요일", john2: "요이", john3: "요삼", jude: "유", revelation: "계",
};

const APP_FN = /관사|전치사|접속사|대명사|부정어|불변화사/;

/** 헷갈리는 한자어 → 풀어 쓴 표기 */
const HANJA_EXPAND = {
  의원: "공회 의원(공회원)",
  공회원: "공회 의원(공회원)",
  백부장: "백부장(로마 군대 장교)",
  서기관: "서기관(율법 학자)",
  장로: "장로(교회·회당의 어른)",
  사도: "사도(보내심을 받은 이)",
  제사장: "제사장(성전 제사 담당)",
  대제사장: "대제사장(제사장 우두머리)",
  회당: "회당(유대인 예배·모임 장소)",
  성전: "성전(하나님을 섬기던 집)",
  세리: "세리(세금 걷는 이)",
};

/** gloss 조립 예외(목적어·띄어쓰기) */
const VERB_BODY = {
  G1001: "물 깊이를 재는",
  G1006: "가축을 먹이고 돌보는",
  G14: "선을 행하는",
  G1765: "힘을 주는",
  G1026: "비를 내리는",
  G101: "불가능하게 만드는",
  G1416: "해가 지는",
  G1412: "능하게 하는",
  G2427: "감당하게 하는",
  G4456: "둔하게 하는",
  G5448: "교만하게 하는",
  G4906: "함께 먹는 것, 곧 식탁을 같이하는 일",
  G1019: "더디게 하는",
  G1241: "둘러싸는",
  G1315: "사람을 죽이는",
  G1073: "가득하게 하는",
  G1072: "그릇이나 마음을 채우는",
};

/** gloss → 목적어 보강 본문 */
const VERB_BODY_BY_GLOSS = {
  채우다: "그릇이나 마음을 채우는",
  두르다: "둘레를 두르는",
  죽이다: "사람을 죽이는",
  열다: "문을 여는",
  닫다: "문을 닫는",
  던지다: "무엇을 던지는",
  잡다: "사람을 잡는",
  부르다: "이름을 부르는",
  보내다: "사람을 보내는",
  받다: "무엇을 받는",
  주다: "무엇을 주는",
  먹다: "무엇을 먹는",
  마시다: "무엇을 마시는",
  입다: "옷을 입는",
  벗다: "옷을 벗는",
  고치다: "병을 고치는",
  세우다: "무엇을 세우는",
  헐다: "무엇을 헐는",
  심다: "씨를 심는",
  거두다: "곡식을 거두는",
  모으다: "사람을 모으는",
  팔다: "무엇을 파는",
  사다: "무엇을 사는",
  가르치다: "사람을 가르치는",
  전하다: "말씀을 전하는",
  전파하다: "복음을 전파하는",
  기록하다: "글을 기록하는",
  쓰다: "글을 쓰는",
  읽다: "글을 읽는",
  듣다: "말씀을 듣는",
  보다: "무엇을 보는",
  감추다: "무엇을 감추는",
  택하다: "사람을 택하는",
  버리다: "무엇을 버리는",
  따르다: "예수를 따르는",
  쫓다: "사람을 쫓는",
  피하다: "위험을 피하는",
  만나다: "사람을 만나는",
  찾다: "무엇을 찾는",
  구하다: "무엇을 구하는",
  치다: "무엇을 치는",
  두다: "무엇을 두는",
  밀다: "무엇을 미는",
  끌다: "무엇을 끄는",
  찢다: "무엇을 찢는",
  자르다: "무엇을 자르는",
  찍다: "무엇을 찍는",
  씻다: "무엇을 씻는",
  숨기다: "무엇을 숨기는",
  드러내다: "무엇을 드러내는",
  나타내다: "무엇을 나타내는",
  더디다: "더디게 되는",
  가득하다: "가득하게 되는",
};

function normalizeKo(s) {
  return String(s || "").replace(/\s+/g, "").replace(/[.,;:!?·"'“”‘’()[\]{}「」『』]/g, "");
}
function hasBatchim(word) {
  const ch = String(word || "").replace(/\s+/g, "").replace(/[「」()]/g, "").slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}
function eulReul(w) { return hasBatchim(w) ? "을" : "를"; }
function iraneun(w) { return hasBatchim(w) ? "이라는" : "라는"; }
function ieya(w) { return hasBatchim(w) ? "이에요" : "예요"; }
function ensurePeriod(s) {
  const t = String(s || "").trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}
function glossStem(g) {
  let x = normalizeKo(g);
  for (const suf of ["시키다", "하다", "주다", "되다"]) {
    if (x.endsWith(suf) && x.length > suf.length) return x.slice(0, -suf.length);
  }
  if (x.endsWith("다") && x.length > 1) return x.slice(0, -1);
  return x;
}
function majority(map) {
  if (!map?.size) return "";
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
function isFnParse(parseKo) {
  return APP_FN.test(((parseKo || "").split(/[,，·]/)[0] || "").trim());
}

/** 선을행하다 → 선을 행하는 */
function spacedVerbPhrase(gloss) {
  const g = String(gloss || "").trim();
  if (!g) return "이 동작을 하는";
  const table = [
    [/^선을행하다$/, "선을 행하는"],
    [/^힘을주다$/, "힘을 주는"],
    [/^비내리다$/, "비를 내리는"],
    [/^수심재다$/, "물 깊이를 재는"],
    [/^저녁먹다$/, "저녁을 먹는"],
    [/^함께먹다$/, "함께 먹는"],
    [/^불가능하다$/, "불가능하게 만드는"],
    [/^시집보내다$/, "시집을 보내는"],
    [/^지다\(해\)$/, "해가 지는"],
    [/^능하게하다$/, "능하게 하는"],
    [/^감당하게하다$/, "감당하게 하는"],
    [/^둔하게하다$/, "둔하게 하는"],
  ];
  for (const [re, out] of table) if (re.test(g)) return out;

  // generic: X하다 → X하는, with light spacing for 을-object compounds
  if (g.endsWith("하다")) {
    const stem = g.slice(0, -2);
    // 힘+주, 선+행 already handled; try insert space before last 2+ syllable verbish
    if (/^(힘|선|비|물|저녁|함께)/.test(stem) && stem.length >= 3 && !stem.includes(" ")) {
      if (stem.startsWith("힘") && stem.length > 1) return `힘을 ${stem.slice(1)}하는`.replace("힘을 주하는", "힘을 주는");
      if (stem.startsWith("선") && stem.includes("행")) return "선을 행하는";
      if (stem.startsWith("비")) return `비를 ${stem.slice(1)}하는`.replace("비를 내리하는", "비를 내리는");
    }
    return `${stem}하는`;
  }
  if (g.endsWith("되다")) return `${g.slice(0, -2)}되는`;
  if (g.endsWith("다")) return `${g.slice(0, -1)}는`;
  return `${g}하는`;
}

/** 타동사인데 목적어가 비어 보이는 gloss */
const TRANSITIVE_NEEDS_OBJ = new Set([
  "채우다", "두르다", "죽이다", "열다", "닫다", "던지다", "잡다", "부르다", "보내다",
  "받다", "주다", "먹다", "마시다", "입다", "벗다", "고치다", "세우다", "헐다", "심다",
  "거두다", "모으다", "팔다", "사다", "가르치다", "전하다", "전파하다", "기록하다",
  "쓰다", "읽다", "듣다", "보다", "감추다", "택하다", "버리다", "따르다", "쫓다",
  "피하다", "만나다", "찾다", "구하다", "치다", "두다", "밀다", "끌다", "찢다",
  "자르다", "찍다", "씻다", "숨기다", "드러내다", "나타내다",
]);

function classifyVerbDef(def, gloss) {
  const head = (def.split(/[「.]/)[0] || "").replace(/\([^)]*\)/g, "").trim();
  const m = head.match(/^(.+?)(는|하는|되는|시키는) 것을 말해요$/);
  if (!m && !/일을 말해요$/.test(head)) return null;
  const stem = (m?.[1] || head).trim();
  const types = [];
  const compact = stem.replace(/\s/g, "");
  if (
    /^(선을행|힘을주|비내리|수심재|저녁먹|함께먹)/.test(gloss) ||
    /^(선을행|힘을주|비내리|수심재)/.test(compact) ||
    (gloss === "불가능하다" && /불가능하는/.test(def))
  ) {
    types.push("띄어쓰기");
  }
  if (
    /\([^)]+\)/.test(gloss) ||
    /지다\(해\)하는|하게하다하는|하게하는 것을/.test(def.replace(/\s/g, "")) ||
    (/하게하는 것을/.test(def.replace(/\s/g, "")) && /하게하다$/.test(gloss))
  ) {
    types.push("어간잘림");
  }
  // 목적어 빠짐: 타동사 gloss인데 head에 을/를이 없고 짧은 어간만 남은 경우
  if (
    TRANSITIVE_NEEDS_OBJ.has(gloss) &&
    !/[을를에게]/.test(stem) &&
    compact.length <= 6
  ) {
    types.push("목적어빠짐");
  }
  if (["더디다", "가득하다"].includes(gloss) && !/[을를]/.test(stem) && compact.length <= 4) {
    types.push("목적어빠짐");
  }
  return { stem, types, head };
}

function extractCite(krv, needles, maxLen = 72) {
  const text = String(krv || "").replace(/\s+/g, " ").trim();
  if (!text) return { cite: "", ok: false, hit: "" };
  let best = null;
  for (const n of needles) {
    if (!n || n.length < 1) continue;
    let idx = text.indexOf(n);
    if (idx < 0 && n.length >= 2) {
      // try without particle-ish
      idx = text.indexOf(n.slice(0, Math.min(n.length, 3)));
      if (idx >= 0) {
        // expand to full word-ish
        const hit = n.slice(0, Math.min(n.length, 3));
        // find longer match from idx
        let end = idx + hit.length;
        while (end < text.length && /[가-힣]/.test(text[end])) end += 1;
        const found = text.slice(idx, end);
        if (!found.includes(hit)) continue;
        best = { idx, n: found, needle: n };
        break;
      }
    } else if (idx >= 0) {
      best = { idx, n, needle: n };
      break;
    }
  }
  if (!best) {
    const slice = text.length <= maxLen ? text : `${text.slice(0, maxLen - 1)}…`;
    return { cite: slice, ok: false, hit: "" };
  }
  const { idx, n } = best;
  const room = Math.max(10, maxLen - n.length);
  let start = Math.max(0, idx - Math.floor(room * 0.35));
  let end = Math.min(text.length, idx + n.length + Math.floor(room * 0.65));
  // don't cut the hit
  if (start > idx) start = idx;
  if (end < idx + n.length) end = idx + n.length;
  // prefer space boundaries but never move past hit
  if (start > 0) {
    const sp = text.lastIndexOf(" ", idx - 1);
    if (sp >= start - 15 && sp < idx) start = sp + 1;
  }
  if (end < text.length) {
    const sp = text.indexOf(" ", idx + n.length);
    if (sp > 0 && sp <= end + 15) end = sp;
  }
  let slice = text.slice(start, end);
  if (start > 0) slice = `…${slice}`;
  if (end < text.length) slice = `${slice}…`;
  const ok = slice.includes(n) || normalizeKo(slice).includes(normalizeKo(n));
  return { cite: slice, ok, hit: n };
}

function loadCorpus() {
  const hits = new Map();
  const glossMaj = new Map();
  const occByStrong = new Map();
  for (const book of NT) {
    const bd = JSON.parse(fs.readFileSync(path.join(BD, `${book}.json`), "utf8"));
    const dir = path.join(OUT, book);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const chN = Number(f.replace(".json", ""));
      const ch = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const krvMap = new Map((bd.chapters?.[chN - 1]?.verses?.krv || []).map((x) => [x.n, x.t || ""]));
      for (const v of ch.verses || []) {
        const krv = krvMap.get(v.n) || "";
        for (const w of v.words || []) {
          if (!w.strong) continue;
          occByStrong.set(w.strong, (occByStrong.get(w.strong) || 0) + 1);
          if (w.glossKo) {
            if (!glossMaj.has(w.strong)) glossMaj.set(w.strong, new Map());
            const m = glossMaj.get(w.strong);
            m.set(w.glossKo, (m.get(w.glossKo) || 0) + 1);
          }
          if (!hits.has(w.strong)) hits.set(w.strong, []);
          const arr = hits.get(w.strong);
          if (!arr.some((x) => x.book === book && x.ch === chN && x.n === v.n)) {
            arr.push({
              book, ch: chN, n: v.n, krv, gloss: w.glossKo || "", parseKo: w.parseKo || "",
            });
          }
        }
      }
    }
  }
  return { hits, glossMaj, occByStrong };
}

function refOf(h) {
  return `${BOOK_KO[h.book]} ${h.ch}:${h.n}`;
}

function citeNeedles(d, gloss, hit) {
  const out = [];
  const add = (x) => {
    if (x && !out.includes(x)) out.push(x);
  };
  for (const k of d.krvKo || []) add(k);
  for (const k of d.krvForms || []) add(k);
  add(gloss);
  add(glossStem(gloss));
  // specials
  if (d.strong === "G596") {
    add("곡간"); add("곳간"); add("넣으라"); add("곡간에");
  }
  if (d.strong === "G1011") {
    add("헤아리지"); add("헤아리"); add("의논");
  }
  if (d.strong === "G1010") {
    add("공회원"); add("의원");
  }
  if (hit?.krv) {
    // pick longest hangul token overlapping gloss stem
    const gs = glossStem(gloss);
    if (gs.length >= 2) {
      for (const tok of hit.krv.split(/\s+/)) {
        if (tok.includes(gs) || normalizeKo(tok).includes(gs)) add(tok.replace(/[.,]/g, ""));
      }
    }
  }
  return out.filter(Boolean);
}

function main() {
  const { hits, glossMaj, occByStrong } = loadCorpus();

  // ——— 1) classify 729 ———
  const space = [];
  const obj = [];
  const trunc = [];
  const verbTpl = [];
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    if (!/동사/.test(d.posKo || "")) continue;
    const def = (d.defKo || "").trim();
    if (!/는 것을 말해요|하는 것을 말해요|일을 말해요/.test(def)) continue;
    verbTpl.push(d.strong);
    const gloss = majority(glossMaj.get(d.strong)) || "";
    const c = classifyVerbDef(def, gloss);
    if (!c || !c.types.length) continue;
    const row = { strong: d.strong, gloss, stem: c.stem, def: def.slice(0, 110), types: c.types };
    if (c.types.includes("띄어쓰기")) space.push(row);
    if (c.types.includes("목적어빠짐")) obj.push(row);
    if (c.types.includes("어간잘림")) trunc.push(row);
  }

  // ——— apply fixes to all lexicon ———
  let citeBefore = 0;
  let citeAfter = 0;
  let hanjaN = 0;
  let glossDiffN = 0;
  let sideTalkBefore = 0;
  let sideTalkAfter = 0;
  let verbFixed = 0;

  // H1732
  let h1732 = "사랑받는 자";
  try {
    const h = JSON.parse(fs.readFileSync(path.join(LEX_H, "H1732.json"), "utf8"));
    if (h.nameMeaning) h1732 = h.nameMeaning;
  } catch { /* */ }

  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const fp = path.join(LEX, f);
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    const strong = d.strong || f.replace(/\.json$/, "");
    const gloss = majority(glossMaj.get(strong)) || d.glossKo || "";
    let def = (d.defKo || "").trim();
    let changed = false;
    const hit = hits.get(strong)?.[0];

    if (/쪽이에요|쪽으로 읽혀요/.test(def)) sideTalkBefore += 1;

    // G1138
    if (strong === "G1138") {
      d.nameMeaning = h1732;
      def = ensurePeriod(
        `다윗은 이새의 아들이며 이스라엘의 둘째 왕이에요(삼상 16장; 삼하 5장). 신약에서는 예수님의 족보와 메시아 칭호에 반복해 나와요(마 1:1). 이름 뜻은 「${h1732}」${ieya(h1732)}`,
      );
      changed = true;
    }

    // name talk normalize
    if (/이름 뜻은/.test(def) || /쪽이에요|쪽으로 읽혀요/.test(def)) {
      def = def
        .replace(/이름 뜻은 「([^」]+)」이?라는 쪽이에요\.?/g, (_, w) => `이름 뜻은 「${w}」${ieya(w)}`)
        .replace(/이름 뜻은 「([^」]+)」이?라는 쪽으로 읽혀요\.?/g, (_, w) => `이름 뜻은 「${w}」${ieya(w)}`)
        .replace(/이름 뜻은 「([^」]+)」이?라는 뜻으로 읽혀요\.?/g, (_, w) => `이름 뜻은 「${w}」${ieya(w)}`)
        .replace(/이름 뜻은 「확실하지 않음」[^.]+\./g, "이름 뜻은 확실하지 않아요.")
        .replace(/이름 뜻은 「확실하지 않아요」[^.]+\./g, "이름 뜻은 확실하지 않아요.");
      changed = true;
    }

    // verb body fix
    const needsVerbFix =
      /동사/.test(d.posKo || "") &&
      (/는 것을 말해요|하는 것을 말해요|일을 말해요/.test(def) || VERB_BODY[strong]);
    if (needsVerbFix) {
      const cls = classifyVerbDef(def, gloss);
      if ((cls && cls.types.length) || VERB_BODY[strong] || VERB_BODY_BY_GLOSS[gloss]) {
        let bodyCore =
          VERB_BODY[strong] || VERB_BODY_BY_GLOSS[gloss] || spacedVerbPhrase(gloss);
        let body;
        if (/일을 말해요|것, 곧/.test(bodyCore) || bodyCore.includes("곧")) {
          body = bodyCore.includes("말해요")
            ? bodyCore
            : `${bodyCore}을 말해요`.replace("일을을", "일을").replace("것을을", "것을");
          if (!/말해요/.test(body)) {
            if (bodyCore.includes("일")) body = `${bodyCore}${eulReul(bodyCore.split(",")[0])} 말해요`;
            else body = `${bodyCore} 것을 말해요`;
          }
        } else {
          body = `${bodyCore} 것을 말해요`;
        }
        if (strong === "G4906") body = "함께 먹는 것, 곧 식탁을 같이하는 일을 말해요";

        const list = hits.get(strong) || [];
        const needles = citeNeedles(d, gloss, hit);
        let bestHit = hit;
        for (const n of needles) {
          const found = list.find((v) => n && v.krv.includes(n));
          if (found) { bestHit = found; break; }
        }
        const { cite } = bestHit ? extractCite(bestHit.krv, needles, 78) : { cite: "" };
        const ref = bestHit ? refOf(bestHit) : "";
        def = cite
          ? ensurePeriod(`${body}. 「${cite}」(${ref})`)
          : ref
            ? ensurePeriod(`${body}(${ref})`)
            : ensurePeriod(body);
        verbFixed += 1;
        changed = true;
      }
    }

    // cite repair: only ellipsis/citation quotes (skip short name-meaning quotes)
    {
      const cm = def.match(/「([^」]+)」/);
      if (cm && (/…/.test(cm[1]) || cm[1].length > 16)) {
        const list = hits.get(strong) || [];
        const needles = citeNeedles(d, gloss, hit);
        const citeText = cm[1];
        const missing = !needles.some(
          (n) => n.length >= 2 && (citeText.includes(n) || normalizeKo(citeText).includes(normalizeKo(n))),
        );
        if (/…/.test(citeText) && missing) citeBefore += 1;
        if (missing || (strong === "G1011" && !/헤아리/.test(citeText))) {
          let bestHit = null;
          let bestNeedle = null;
          for (const n of needles) {
            if (!n || n.length < 2) continue;
            const found = list.find((v) => v.krv.includes(n));
            if (found) { bestHit = found; bestNeedle = n; break; }
            const st = glossStem(n);
            if (st.length >= 2) {
              const found2 = list.find((v) => v.krv.includes(st));
              if (found2) { bestHit = found2; bestNeedle = st; break; }
            }
          }
          if (bestHit && bestNeedle) {
            const { cite, ok } = extractCite(bestHit.krv, [bestNeedle, ...needles], 78);
            if (cite && (ok || cite.includes(bestNeedle))) {
              def = def.replace(/「[^」]+」/, `「${cite}」`);
              const ref = refOf(bestHit);
              def = def.replace(/\(([가-힣]+\s*\d+:\d+[^\)]*)\)/g, "");
              def = ensurePeriod(`${def.replace(/\.$/, "")}(${ref})`);
              changed = true;
            }
          }
        }
      }
    }

    // hanja expand + gloss≠krv in opening noun/adj templates
    if (/^[^「.]{1,40}(을|를) 말해요/.test(def) || /^[^「.]{1,40} 것을 말해요/.test(def)) {
      const krvPreferred = (d.krvKo || [])[0] || "";
      let headWord = gloss;
      // expand hanja
      if (HANJA_EXPAND[gloss]) {
        headWord = HANJA_EXPAND[gloss];
        hanjaN += 1;
      }
      // gloss vs krv
      if (krvPreferred && gloss && normalizeKo(gloss) !== normalizeKo(krvPreferred) && !headWord.includes("개역한글")) {
        headWord = `${gloss}(개역한글: ${krvPreferred})`;
        glossDiffN += 1;
      }
      if (headWord !== gloss && /^[^「.]+(을|를) 말해요/.test(def)) {
        def = def.replace(/^[^「.]+(을|를) 말해요/, `${headWord}${eulReul(headWord.split("(")[0])} 말해요`);
        // fix double particle if headWord already long
        def = def.replace(/\)(을|를) 말해요/, ")을 말해요".replace("을", eulReul(headWord)));
        // simpler rebuild head
        const rest = def.replace(/^.*?말해요/, "말해요");
        const particle = eulReul(String(headWord).replace(/\([^)]*\)/g, "").trim());
        def = `${headWord}${particle} ${rest}`;
        changed = true;
      } else if (HANJA_EXPAND[gloss] && def.startsWith(gloss)) {
        const rest = def.slice(gloss.length);
        def = HANJA_EXPAND[gloss] + rest.replace(/^(을|를)/, eulReul(HANJA_EXPAND[gloss]));
        changed = true;
      }
    }

    // force key strongs
    if (strong === "G596") {
      // 마 13:30 원문 「곳간에 넣으라」(곡간은 마 3:12 이형)
      const h =
        hits.get(strong)?.find((x) => x.book === "matthew" && x.ch === 13 && x.n === 30) ||
        hits.get(strong)?.find((x) => /곳간에 넣/.test(x.krv)) ||
        hit;
      const { cite } = extractCite(h?.krv || "", ["곳간에 넣으라", "곳간", "곡간"], 78);
      def = ensurePeriod(
        `곳간(개역한글: 곡간)을 말해요. 「${cite || "곡식은 모아 내 곳간에 넣으라"}」(${h ? refOf(h) : "마 13:30"})`,
      );
      glossDiffN += 1;
      changed = true;
    }
    if (strong === "G1010") {
      const h =
        hits.get(strong)?.find((x) => x.book === "mark" && x.ch === 15 && x.n === 43) ||
        hits.get(strong)?.find((x) => /공회원/.test(x.krv)) ||
        hit;
      const { cite } = extractCite(h?.krv || "", ["공회원", "존귀한 공회원"], 75);
      def = ensurePeriod(
        `공회 의원(공회원)을 말해요. 「${cite}」(${h ? refOf(h) : "막 15:43"})`,
      );
      hanjaN += 1;
      changed = true;
    }
    if (strong === "G1011") {
      const h =
        hits.get(strong)?.find((x) => x.book === "luke" && x.ch === 14 && x.n === 31) ||
        hits.get(strong)?.find((x) => /헤아리/.test(x.krv)) ||
        hit;
      const { cite } = extractCite(h?.krv || "", ["헤아리지", "헤아리"], 75);
      def = ensurePeriod(`의논하는 것을 말해요. 「${cite}」(${h ? refOf(h) : "눅 14:31"})`);
      changed = true;
    }

    if (changed) {
      // final side-talk sweep
      def = def
        .replace(/쪽이에요/g, "예요")
        .replace(/쪽으로 읽혀요/g, "예요")
        .replace(/이름 뜻은 「([^」]+)」예요\.?/g, (_, w) => `이름 뜻은 「${w}」${ieya(w)}`)
        .replace(/이름 뜻은 「([^」]+)」이에요\.?/g, (_, w) => `이름 뜻은 「${w}」${ieya(w)}`);
      d.defKo = ensurePeriod(def.replace(/예요예요/g, "예요").replace(/이에요이에요/g, "이에요"));
      fs.writeFileSync(fp, JSON.stringify(d, null, 2) + "\n");
    }
  }

  // recount after
  const spaceA = [];
  const objA = [];
  const truncA = [];
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const def = (d.defKo || "").trim();
    if (/쪽이에요|쪽으로 읽혀요/.test(def)) sideTalkAfter += 1;
    if (!/동사/.test(d.posKo || "")) continue;
    if (!/는 것을 말해요|하는 것을 말해요/.test(def)) continue;
    const gloss = majority(glossMaj.get(d.strong)) || "";
    const c = classifyVerbDef(def, gloss);
    if (!c?.types?.length) continue;
    const row = { strong: d.strong, gloss, types: c.types, def: def.slice(0, 100) };
    if (c.types.includes("띄어쓰기")) spaceA.push(row);
    if (c.types.includes("목적어빠짐")) objA.push(row);
    if (c.types.includes("어간잘림")) truncA.push(row);

    const cm = def.match(/「([^」]+)」/);
    if (cm && /…/.test(cm[1])) {
      const needles = citeNeedles(d, gloss, hits.get(d.strong)?.[0]);
      const citeText = cm[1];
      const ok = needles.some(
        (n) => n.length >= 2 && (citeText.includes(n) || normalizeKo(citeText).includes(normalizeKo(n))),
      );
      if (!ok) citeAfter += 1;
    }
  }

  // also recount citeAfter more carefully for all with ellipsis missing needle
  citeAfter = 0;
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const def = d.defKo || "";
    const cm = def.match(/「([^」]+)」/);
    if (!cm || !/…/.test(cm[1])) continue;
    const gloss = majority(glossMaj.get(d.strong)) || "";
    const needles = citeNeedles(d, gloss, hits.get(d.strong)?.[0]);
    const ok = needles.some(
      (n) => n.length >= 2 && (cm[1].includes(n) || normalizeKo(cm[1]).includes(normalizeKo(n))),
    );
    if (!ok) citeAfter += 1;
  }

  // krvKo content-chip coverage
  const hasKrv = new Set();
  for (const f of fs.readdirSync(LEX).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    if (Array.isArray(d.krvKo) && d.krvKo.length) hasKrv.add(d.strong);
  }
  let content = 0;
  let contentWithKrv = 0;
  for (const book of NT) {
    const dir = path.join(OUT, book);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const ch = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const v of ch.verses || []) {
        for (const w of v.words || []) {
          if (!w.glossKo) continue;
          if (isFnParse(w.parseKo)) continue;
          content += 1;
          if (hasKrv.has(w.strong)) contentWithKrv += 1;
        }
      }
    }
  }

  const full = {};
  for (const s of ["G1377", "G25", "G1519", "G596", "G1010", "G1011"]) {
    const d = JSON.parse(fs.readFileSync(path.join(LEX, `${s}.json`), "utf8"));
    full[s] = d.defKo;
  }

  const report = {
    section1: {
      verbTemplateTotal: verbTpl.length,
      before: {
        띄어쓰기: space.length,
        목적어빠짐: obj.length,
        어간잘림: trunc.length,
        samples: {
          띄어쓰기: space.slice(0, 5),
          목적어빠짐: obj.slice(0, 5),
          어간잘림: trunc.slice(0, 5),
        },
      },
      after: {
        띄어쓰기: spaceA.length,
        목적어빠짐: objA.length,
        어간잘림: truncA.length,
      },
      verbFixed,
      note: "이전 보고 729는 「~는/하는 것을 말해요」 틀 전체. 그중 실제 오류는 띄어쓰기·목적어·어간잘림으로 재분류.",
    },
    section2: { citeBefore, citeAfter },
    section3: { hanjaExpanded: hanjaN, glossDiffKrvFormat: glossDiffN },
    section4: {
      sideTalkBefore,
      sideTalkAfter,
      g1138: JSON.parse(fs.readFileSync(path.join(LEX, "G1138.json"), "utf8")).defKo,
      nameMeaning: JSON.parse(fs.readFileSync(path.join(LEX, "G1138.json"), "utf8")).nameMeaning,
      h1732,
    },
    section5: {
      contentChips: content,
      contentWithKrv,
      pct: +((100 * contentWithKrv) / content).toFixed(2),
    },
    fullDefs: full,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

main();
