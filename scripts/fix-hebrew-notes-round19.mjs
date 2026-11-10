/**
 * 히브리어 19차 (dry-run 기본):
 *  1) H3075·H4918·H5718 관계 오류
 *  2) 관계 문장 전수 × KRV 기계 대조
 *  3) 18차 수정분 시드 무작위 20 전문
 *  4) 약한 신원 503 미터치 (H5718만 예외)
 *
 *   node scripts/fix-hebrew-notes-round19.mjs           # .cache dry-run만 (lexicon 미기록)
 *   node scripts/fix-hebrew-notes-round19.mjs --apply  # 사용자가 에이전트3 완료 알린 뒤만
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncHebrewLexiconEntry } from "./lib/hebrew-lexicon-sync.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const NOTES = path.join(root, "data/keyword-notes/hebrew.json");
const LEX = path.join(root, "public/word-study/lexicon/hebrew");
const KRV = path.join(root, "public/bible-study/chunks");
const WS = path.join(root, "public/word-study");
const CACHE = path.join(root, ".cache");
const APPLY = process.argv.includes("--apply");

const AUDIT_OUT = path.join(WS, "_hebrew-notes-round19-relation-audit.json");
const DRY_OUT = path.join(CACHE, "_hebrew-notes-round19-dry-run.json");
const REPORT_OUT = APPLY
  ? path.join(WS, "_hebrew-notes-round19-report.json")
  : path.join(CACHE, "_hebrew-notes-round19-report.json");

const SAMPLE_SEED = 20261110;
const SAMPLE_N = 20;

const BOOK_KO = {
  genesis: "창",
  exodus: "출",
  leviticus: "레",
  numbers: "민",
  deuteronomy: "신",
  joshua: "수",
  judges: "삿",
  ruth: "룻",
  samuel1: "삼상",
  samuel2: "삼하",
  kings1: "왕상",
  kings2: "왕하",
  chronicles1: "대상",
  chronicles2: "대하",
  ezra: "스",
  nehemiah: "느",
  esther: "에",
  job: "욥",
  psalms: "시",
  proverbs: "잠",
  ecclesiastes: "전",
  songofsolomon: "아",
  isaiah: "사",
  jeremiah: "렘",
  lamentations: "애",
  ezekiel: "겔",
  daniel: "단",
  hosea: "호",
  joel: "욜",
  amos: "암",
  obadiah: "옵",
  jonah: "욘",
  micah: "미",
  nahum: "나",
  habakkuk: "합",
  zephaniah: "습",
  haggai: "학",
  zechariah: "슥",
  malachi: "말",
};
const KO_BOOK = Object.fromEntries(Object.entries(BOOK_KO).map(([a, b]) => [b, a]));

function hasBatchim(word) {
  const ch = String(word || "").replace(/[^가-힣]/g, "").slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
function ieya(w) {
  return hasBatchim(w) ? "이에요" : "예요";
}
function ensurePeriod(s) {
  const t = String(s || "").trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}
function isSentenceMeaning(nm) {
  return /(?:다|시다|셨다|신다|이다)$/.test(String(nm || "").trim());
}
function nameLine(nm) {
  if (!nm) return "이름 뜻은 확실하지 않아요.";
  if (isSentenceMeaning(nm)) return `이름은 「${nm}」라는 뜻이에요.`;
  return `이름 뜻은 「${nm}」${ieya(nm)}.`;
}
function parseParts(def) {
  const raw = String(def || "").replace(/\s+/g, " ").trim();
  const firstM = raw.match(/처음 나오는 곳:\s*([가-힣]+)\s*(\d+):(\d+)\.?/);
  const first = firstM ? `처음 나오는 곳: ${firstM[1]} ${firstM[2]}:${firstM[3]}.` : "";
  const firstRef = firstM ? `${firstM[1]} ${firstM[2]}:${firstM[3]}` : "";
  const nmM =
    raw.match(/이름은\s*「([^」]+)」라는\s*뜻이에요/) ||
    raw.match(/이름 뜻은\s*「([^」]+)」([^.]*)\./);
  const nm = nmM ? nmM[1] : "";
  const extras = [];
  for (const re of [
    /창 32:28에서는[^.]+\./g,
    /[가-힣]+\s*\d+:\d+(?:에도|에는)[^.]*같은 사람인지 확실하지 않아요\.?/g,
    /동명이인\([^)]+\)은[^.]+어요\.?/g,
  ]) {
    for (const e of raw.match(re) || []) extras.push(e.replace(/\.+$/, ""));
  }
  let identity = raw
    .replace(/처음 나오는 곳:\s*[^.]+\./g, " ")
    .replace(/이름은\s*「[^」]+」라는\s*뜻이에요\.?/g, " ")
    .replace(/이름 뜻은\s*「[^」]+」[^.]*(?:\.|$)/g, " ")
    .replace(/이름 뜻은 확실하지 않아요\.?/g, " ")
    .replace(/창 32:28에서는[^.]+\./g, " ")
    .replace(/[가-힣]+\s*\d+:\d+(?:에도|에는)[^.]*같은 사람인지 확실하지 않아요\.?/g, " ")
    .replace(/동명이인\([^)]+\)은[^.]+어요\.?/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "");
  return { identity, first, firstRef, nm, extras };
}
function rebuildDef({ identity, nm, first, extras = [] }) {
  const parts = [];
  if (identity) parts.push(ensurePeriod(identity));
  if (!nm) parts.push("이름 뜻은 확실하지 않아요.");
  else parts.push(nameLine(nm));
  for (const e of extras) if (e) parts.push(ensurePeriod(e));
  if (first) parts.push(first.endsWith(".") ? first : `${first}.`);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
function isWeakIdentity(identity) {
  const x = String(identity || "")
    .trim()
    .replace(/\.+$/, "");
  if (!x) return false;
  if (/^같은 이름이 여럿/.test(x)) return false;
  if (/땅 이름이자 사람/.test(x)) return false;
  if (/이며 |으로[,\s]|로,\s|로서 /.test(x) && !/나오는 인물이에요$/.test(x)) return false;
  if (/에 나오는 인물이에요$/.test(x)) return true;
  if (/에 처음 나오는 인물이에요$/.test(x)) return true;
  if (/에 나오는 사람이에요$/.test(x)) return true;
  if (/에 처음 소개되는 인물이에요$/.test(x)) return true;
  if (/에 나오는 고유명사예요$/.test(x)) return true;
  if (/구약에 나오는 고유명사예요$/.test(x)) return true;
  if (/성경에 나오는 인명이에요$/.test(x)) return true;
  if (/이스라엘 사람이에요$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 왕이에요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 제사장이에요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 대제사장이에요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 예언자예요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 선지자예요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 사사예요(\([^)]*\))?$/.test(x)) return true;
  if (/^[가-힣()약식·,\s]+[은는] 두령이에요(\([^)]*\))?$/.test(x)) return true;
  if (
    /^[가-힣()약식·,\s]+[은는] (유다의|이스라엘의|이스라엘|바벨론|모압|아람|블레셋|시리아|바산) ?왕이에요(\([^)]*\))?$/.test(
      x,
    )
  )
    return true;
  if (/^[가-힣()약식·,\s]+[은는] (유다|이스라엘) 왕이에요(\([^)]*\))?$/.test(x)) return true;
  return false;
}

function krvVerse(bookEn, ch, n) {
  const p = path.join(KRV, bookEn, String(ch), "korean.json");
  if (!fs.existsSync(p)) return "";
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return (j.verses?.krv || []).find((x) => x.n === n)?.t || "";
  } catch {
    return "";
  }
}

function parseKoRef(ref) {
  const m = String(ref || "").match(/([가-힣]+)\s*(\d+):(\d+)/);
  if (!m) return null;
  const bookEn = KO_BOOK[m[1]];
  if (!bookEn) return null;
  return { ko: m[1], bookEn, ch: +m[2], n: +m[3] };
}

function displayName(id, note) {
  const lexPath = path.join(LEX, `${id}.json`);
  if (fs.existsSync(lexPath)) {
    const lex = JSON.parse(fs.readFileSync(lexPath, "utf8"));
    const krv = lex?.krvKo?.[0];
    if (krv && !/^[A-Za-z]/.test(krv)) return krv.replace(/\(약식\)/, "").trim();
  }
  const idPart = parseParts(note?.defKo || "").identity;
  const m = idPart.match(/^([가-힣·()약식]+?)[은는]/);
  if (m) return m[1].replace(/\(약식\)/, "").trim();
  return id;
}

/** mulberry32 */
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededSample(arr, n, seed) {
  const a = [...arr].sort((x, y) => String(x).localeCompare(String(y), "en"));
  const rnd = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

const REL_WORD = "(아들|딸|아버지|손자|아내|어머니|며느리|사위)";

/**
 * 구절에서 「P의 REL N」 쌍 추출 (쌍 나열·단일).
 * 위험①: A의 아들 B과/와 … C의 아들 D
 */
function extractVersePairs(text) {
  const t = String(text || "").replace(/\s+/g, " ");
  const pairs = [];
  const re = new RegExp(
    `([가-힣]{2,12})의\\s*(아들|딸|아버지|손자|아내|어머니|며느리|사위)\\s*([가-힣]{2,12})`,
    "g",
  );
  function stripParticle(name) {
    // 이름 끝「이」(빈누이)는 보존. 절 어미·접속만 제거.
    return String(name || "")
      .replace(/(이었더라|이더라|이라|이요|이며|이고|과|와)$/g, "")
      .trim();
  }
  let m;
  while ((m = re.exec(t)) !== null) {
    pairs.push({
      parent: stripParticle(m[1]),
      rel: m[2],
      child: stripParticle(m[3]),
      index: m.index,
    });
  }
  // 쌍 나열: 과/와 + 사이에 짧은 끼움말 허용
  const pairList = [
    ...t.matchAll(
      /([가-힣]{2,12})의\s*(아들|딸)\s*([가-힣]{2,12})\s*[과와]\s*.{0,24}?([가-힣]{2,12})의\s*(아들|딸)\s*([가-힣]{2,12})/g,
    ),
  ].map((x) => ({
    kind: "pairList",
    a: { parent: stripParticle(x[1]), rel: x[2], child: stripParticle(x[3]) },
    b: { parent: stripParticle(x[4]), rel: x[5], child: stripParticle(x[6]) },
    raw: x[0],
  }));
  // 같은 절에 아들/딸 쌍이 2개 이상이면 위험①로도 취급
  const sonDaughter = pairs.filter((p) => p.rel === "아들" || p.rel === "딸");
  if (pairList.length === 0 && sonDaughter.length >= 2) {
    for (let i = 0; i + 1 < sonDaughter.length; i++) {
      pairList.push({
        kind: "pairList",
        a: sonDaughter[i],
        b: sonDaughter[i + 1],
        raw: "multi-pair",
      });
    }
  }
  // 대 연쇄: A의 손자 B의 아들 C
  const chains = [
    ...t.matchAll(
      /([가-힣]{2,12})의\s*(손자|증손|현손|오대손|육대손|칠대손)\s*([가-힣]{2,12})의\s*(아들|딸)\s*([가-힣]{2,12})/g,
    ),
  ].map((x) => ({
    kind: "genChain",
    elder: x[1],
    elderRel: x[2],
    mid: x[3],
    midRel: x[4],
    head: x[5],
    raw: x[0],
  }));
  // 외가: A의 딸 B / 「여디다라 … 아다야의 딸」
  const daughters = [
    ...t.matchAll(/([가-힣]{2,12})의\s*딸\s*([가-힣]{2,12})/g),
  ].map((x) => ({ kind: "daughter", parent: x[1], child: x[2], raw: x[0] }));
  for (const x of t.matchAll(
    /([가-힣]{2,12})(?:이라|라)\s*[^.]{0,20}?([가-힣]{2,12})의\s*딸/g,
  )) {
    daughters.push({ kind: "daughter", parent: x[2], child: x[1], raw: x[0] });
    pairs.push({ parent: x[2], rel: "딸", child: x[1], index: x.index });
  }

  return { pairs, pairList, chains, daughters, text: t };
}

function normName(s) {
  return String(s || "")
    .replace(/\(약식\)/g, "")
    .replace(/[·\s]/g, "")
    .trim();
}
/** 짧은 이름 부분일치(말리⊂가말리엘) 금지. 표기 흔들림만 허용. */
function nameHit(a, b) {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const alts = (s) => {
    const out = new Set([s]);
    if (/바드$/.test(s)) out.add(s.replace(/바드$/, "밧"));
    if (/밧$/.test(s)) out.add(s.replace(/밧$/, "바드"));
    if (/야$/.test(s)) out.add(s.replace(/야$/, "야후"));
    return out;
  };
  for (const p of alts(x)) for (const q of alts(y)) if (p === q) return true;
  // 「온이」↔「온」 정도의 주격 잔여만
  if (x.length >= 2 && y.length >= 2) {
    if (x === y + "이" || y === x + "이") return true;
  }
  return false;
}
function isBadParentToken(s) {
  return /^(사람|자손|족속|남자|여자|왕|신복|지휘관)$/.test(normName(s));
}

/**
 * 노트 신원에서 관계 주장 추출
 * 예: "여호사바드는 소멜의 아들이에요(왕하 12:21)"
 * 예: "… 시므앗의 아들(왕하 12:21) …"
 */
function extractClaims(identity, subjectHint) {
  const claims = [];
  const text = String(identity || "");

  // S는 … A의 REL …
  const subjM = text.match(/^([가-힣·()약식]+?)[은는]\s*(.+)$/);
  const subject = subjectHint || (subjM ? subjM[1] : "");

  // 인라인 인용 포함 관계
  const reCite = new RegExp(
    `([가-힣·]{2,14})의\\s*${REL_WORD}(?:이며|이고|이요|로|로서|예요|이에요)?[^().]{0,40}?\\(([가-힣]+\\s*\\d+:\\d+[^)]*)\\)`,
    "g",
  );
  let m;
  while ((m = reCite.exec(text)) !== null) {
    const refs = [...m[3].matchAll(/([가-힣]+)\s*(\d+):(\d+)/g)].map(
      (x) => `${x[1]} ${x[2]}:${x[3]}`,
    );
    claims.push({
      subject,
      related: m[1],
      rel: m[2],
      refs,
      raw: m[0],
      style: "citeInline",
    });
  }

  // 동명이인 목록형: 「A의 아들·…(ref)」 / 「A의 아들(ref)」
  const reList = new RegExp(
    `([가-힣·]{2,14})의\\s*${REL_WORD}[^().]{0,30}?\\(([가-힣]+\\s*\\d+:\\d+[^)]*)\\)`,
    "g",
  );
  while ((m = reList.exec(text)) !== null) {
    const refs = [...m[3].matchAll(/([가-힣]+)\s*(\d+):(\d+)/g)].map(
      (x) => `${x[1]} ${x[2]}:${x[3]}`,
    );
    // 목록형에서는 항목의 ‘머리’가 주어(표제어) — subjectHint 사용
    claims.push({
      subject: subjectHint || subject,
      related: m[1],
      rel: m[2],
      refs,
      raw: m[0],
      style: "homonymList",
    });
  }

  // 인용 없는 단순형 (첫 출현 절로 나중에 붙임)
  if (!claims.length) {
    const rePlain = new RegExp(`([가-힣·]{2,14})의\\s*${REL_WORD}`, "g");
    while ((m = rePlain.exec(text)) !== null) {
      claims.push({
        subject: subjectHint || subject,
        related: m[1],
        rel: m[2],
        refs: [],
        raw: m[0],
        style: "plain",
      });
    }
  }

  // dedupe
  const seen = new Set();
  return claims.filter((c) => {
    const k = `${c.subject}|${c.related}|${c.rel}|${c.refs.join(",")}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * 관계 방향: 노트 「A의 아들」+ subject=S → S가 A의 아들이어야 함
 * 「A의 아버지」+ subject=S → S가 A의 아버지 → A가 S의 아들/딸
 */
function verifyClaimAgainstVerse(claim, verseText) {
  const v = extractVersePairs(verseText);
  const S = claim.subject;
  const A = claim.related;
  const rel = claim.rel;
  if (!verseText) return { status: "noVerse", detail: "KRV 절 없음" };
  if (!S || !A) return { status: "needHuman", detail: "주어/관계어 추출 실패" };

  const hazards = [];
  if (v.pairList.length) hazards.push("pairList");
  if (v.chains.length) hazards.push("genChain");
  if (v.daughters.length && /딸|아내|어머니|아버지/.test(rel)) hazards.push("daughter");

  const altS = [S];
  if (/바드$/.test(S)) altS.push(S.replace(/바드$/, "밧"));
  if (/밧$/.test(S)) altS.push(S.replace(/밧$/, "바드"));
  const isSubj = (name) => altS.some((s) => nameHit(name, s));

  // 본문에서 주어가 자식인 쌍들
  const asChild = v.pairs.filter((p) => isSubj(p.child) && !isBadParentToken(p.parent));
  // 주어가 부모인 쌍들 (「S의 아들 A」)
  const asParent = v.pairs.filter((p) => isSubj(p.parent));

  // ① 자식 방향: 「A의 아들/딸/손자 S」
  if (rel === "아들" || rel === "딸" || rel === "손자" || rel === "아내") {
    const sameRel = asChild.filter((p) => p.rel === rel || (rel === "아들" && p.rel === "아들"));
    if (sameRel.length) {
      if (sameRel.some((p) => nameHit(p.parent, A))) {
        return {
          status: "ok",
          hazard: hazards[0] || null,
          detail: `본문 「${A}의 ${rel}」 일치`,
          verse: verseText,
        };
      }
      // 주어의 실제 부모가 클레임과 다름 → mismatch (이웃 오염)
      const actual = sameRel[0];
      if (!isBadParentToken(actual.parent)) {
        return {
          status: "mismatch",
          hazard: hazards[0] || (v.pairList.length ? "pairList" : "order"),
          detail: `본문은 「${actual.parent}의 ${actual.rel} ${actual.child}」인데 노트는 「${A}의 ${rel}」`,
          expected: `${actual.parent}의 ${actual.rel}`,
          verse: verseText,
        };
      }
    }
  }

  // 부모 방향: 「A의 아버지/어머니 S」 ↔ 본문 「S의 아들/딸 A」 또는 「A의 딸 …」에서 S=아버지
  if (rel === "아버지" || rel === "어머니") {
    if (asParent.some((p) => nameHit(p.child, A) && (p.rel === "아들" || p.rel === "딸"))) {
      return { status: "ok", detail: "부모 방향 일치", verse: verseText };
    }
    for (const d of v.daughters) {
      if (rel === "아버지" && nameHit(d.parent, S) && nameHit(d.child, A)) {
        return { status: "ok", hazard: "daughter", detail: "딸의 아버지 일치", verse: verseText };
      }
      // 「보스갓 아다야의 딸 여디다」— S=아다야, A=여디다
      if (rel === "아버지" && nameHit(d.parent, S) === false && nameHit(d.parent, A) === false) {
        /* skip */
      }
      if (rel === "아버지" && isSubj(d.parent) === false && nameHit(d.child, A)) {
        // A가 딸, S가 노트 주어=딸의 아버지=d.parent
        if (nameHit(d.parent, S) || isSubj(d.parent)) {
          return { status: "ok", hazard: "daughter", detail: "딸 구문 아버지", verse: verseText };
        }
      }
      if (rel === "아버지" && nameHit(d.child, A) && !isSubj(d.child)) {
        // claim: S는 A의 아버지, verse: d.parent의 딸 A → S should be d.parent
        if (!nameHit(d.parent, S) && S && d.parent) {
          // 노트 주어가 d.parent와 같으면 ok — displayName 불일치 시 needHuman
          if (nameHit(d.parent, S)) {
            return { status: "ok", hazard: "daughter", verse: verseText };
          }
        }
      }
    }
  }

  // ② 대 연쇄
  for (const ch of v.chains) {
    if (isSubj(ch.head)) {
      if (rel === "아들" && nameHit(ch.mid, A)) {
        return { status: "ok", hazard: "genChain", detail: "연쇄 mid의 아들", verse: verseText };
      }
      if (rel === "손자" && nameHit(ch.elder, A)) {
        return { status: "ok", hazard: "genChain", detail: "연쇄 elder의 손자", verse: verseText };
      }
      if (rel === "아들" && nameHit(ch.elder, A) && !nameHit(ch.mid, A)) {
        return {
          status: "mismatch",
          hazard: "genChain",
          detail: `대 연쇄 오독: 본문 head는 ${ch.mid}의 ${ch.midRel}·${ch.elder}의 ${ch.elderRel}`,
          expected: `${ch.mid}의 ${ch.midRel}`,
          verse: verseText,
        };
      }
    }
    if (isSubj(ch.elder) && (rel === "아버지" || rel === "할아버지") && (nameHit(ch.mid, A) || nameHit(ch.head, A))) {
      return { status: "ok", hazard: "genChain", detail: "조부 elder", verse: verseText };
    }
    // 「므술람의 손자 아살리야의 아들 사반」— S=므술람, A=아살리야, rel=아버지
    if (isSubj(ch.elder) && rel === "아버지" && nameHit(ch.mid, A)) {
      return { status: "ok", hazard: "genChain", detail: "elder=mid의 조부/아버지 계열", verse: verseText };
    }
    // 「S는 mid의 아들」인데 S=elder인 경우 — KRV 「A의 손자 B의 아들 C」수식 범위가 모호해 자동 확정하지 않음
    if (isSubj(ch.elder) && rel === "아들" && nameHit(ch.mid, A)) {
      return {
        status: "needHuman",
        hazard: "genChain",
        detail: `대 연쇄 수식 모호: 본문 「${ch.elder}의 ${ch.elderRel} ${ch.mid}의 ${ch.midRel} ${ch.head}」— 「${A}의 아들」이 elder·head 어느 쪽인지 사람 확인`,
        verse: verseText,
      };
    }
  }

  // ③ 딸 일치
  for (const d of v.daughters) {
    if (rel === "딸" && isSubj(d.child) && nameHit(d.parent, A)) {
      return { status: "ok", hazard: "daughter", detail: "딸 관계 일치", verse: verseText };
    }
    if (rel === "딸" && isSubj(d.child) && !nameHit(d.parent, A) && !isBadParentToken(d.parent)) {
      return {
        status: "mismatch",
        hazard: "daughter",
        detail: `본문은 「${d.parent}의 딸 ${d.child}」인데 노트는 「${A}의 딸」`,
        expected: `${d.parent}의 딸`,
        verse: verseText,
      };
    }
  }

  const hasA = v.pairs.some((p) => nameHit(p.parent, A) || nameHit(p.child, A)) || verseText.includes(A);
  const hasS = asChild.length || asParent.length || altS.some((s) => verseText.includes(s));

  if (hazards.length && (hasA || hasS)) {
    return {
      status: "needHuman",
      hazard: hazards.join(","),
      detail: "위험 구조 절에서 자동 확정 실패",
      verse: verseText,
      pairs: v.pairs.slice(0, 8),
      pairList: v.pairList.slice(0, 4),
      chains: v.chains,
    };
  }

  if (!hasA) {
    return { status: "needHuman", detail: "인용 절에 관계어(A) 미검출", verse: verseText };
  }
  if (!hasS) {
    return { status: "needHuman", detail: "인용 절에 주어(S) 미검출", verse: verseText };
  }

  return {
    status: "needHuman",
    detail: "기계 대조 불명확",
    verse: verseText,
    hazards,
    pairs: v.pairs.slice(0, 6),
  };
}

function buildWeakSet(notes) {
  const weakSet = new Set();
  for (const [id, note] of Object.entries(notes)) {
    if (note?.defKo && isWeakIdentity(parseParts(note.defKo).identity)) weakSet.add(id);
  }
  return weakSet;
}

function proposeManualFixes(notes) {
  const fixes = [];

  // —— H3075 여호사바드 ——
  {
    const id = "H3075";
    const note = notes[id];
    const before = note.defKo;
    const parts = parseParts(before);
    // 왕하 12:21 소멜의 아들 = 대하 24:26 시므릿의 아들 (동일인, 요아스 암살)
    // 동명이인 3: ①요아스 암살 ②오벧에돔 아들(대상 26:4) ③여호사밧 휘하 지휘관(대하 17:18)
    const identity =
      "같은 이름이 여럿 나와요: 소멜의 아들·요아스를 친 신복(왕하 12:21; 대하 24:26에서는 시므릿의 아들), 오벧에돔의 아들(대상 26:4), 여호사밧 왕 휘하의 지휘관(대하 17:18)";
    const defKo = rebuildDef({
      identity,
      nm: note.nameMeaning || parts.nm,
      first: "처음 나오는 곳: 왕하 12:21.",
      extras: parts.extras,
    });
    fixes.push({
      id,
      reason: "쌍 나열 오염(시므앗←요사갈) 교정; 대하24:26 시므릿=동일인; 동명이인 3명",
      before,
      after: defKo,
      nameMeaning: note.nameMeaning,
      etymKo: note.etymKo,
      usageKo: note.usageKo || "",
      noteSrc: note.noteSrc || "auto",
      samePersonCheck: {
        kings2_12_21: "소멜의 아들 여호사바드",
        chronicles2_24_26: "시므릿의 아들 여호사밧",
        verdict: "same",
        note: "요아스 암살 병렬 기사. KRV 표기 여호사바드/여호사밧 흔들림. Strong three Israelites",
      },
    });
  }

  // —— H4918 므술람 ——
  {
    const id = "H4918";
    const note = notes[id];
    const before = note.defKo;
    const parts = parseParts(before);
    // Strong: seventeen Israelites — 대표만 간결히
    const identity =
      "같은 이름이 여럿 나와요: 아살리야의 아버지·서기관 사반의 할아버지(왕하 22:3), 스룹바벨의 아들(대상 3:19), 성벽 중수자(느 3:4), 그 밖에 여러 명";
    const defKo = rebuildDef({
      identity,
      nm: note.nameMeaning || parts.nm,
      first: "처음 나오는 곳: 왕하 22:3.",
      extras: parts.extras,
    });
    fixes.push({
      id,
      reason: "대 연쇄 오독(아들←할아버지) 교정 + 동명이인",
      before,
      after: defKo,
      nameMeaning: note.nameMeaning,
      etymKo: note.etymKo,
      usageKo: note.usageKo || "",
      noteSrc: note.noteSrc || "auto",
      verse: krvVerse("kings2", 22, 3),
    });
  }

  // —— H5718 아다야 (약한신원 예외) ——
  {
    const id = "H5718";
    const note = notes[id];
    const before = note.defKo;
    const parts = parseParts(before);
    // 왕하 22:1 「보스갓 아다야의 딸」여디다 = 요시야 모친 → 아다야는 여디다의 아버지
    // Strong eight Israelites
    const identity =
      "같은 이름이 여럿 나와요: 요시야의 어머니 여디다의 아버지(왕하 22:1), 시므이의 아들(대상 8:21), 여로함의 아들·제사장(대상 9:12), 그 밖에 여러 명";
    const defKo = rebuildDef({
      identity,
      nm: note.nameMeaning || parts.nm,
      first: "처음 나오는 곳: 왕하 22:1.",
      extras: parts.extras,
    });
    // 중복 「처음 나오는」이 identity에 안 들어가게 처리됨
    fixes.push({
      id,
      reason: "약한신원→관계 보강(예외); 딸 구문; 처음 나오는 곳 중복 제거",
      before,
      after: defKo,
      nameMeaning: note.nameMeaning,
      etymKo: note.etymKo,
      usageKo: note.usageKo || "",
      noteSrc: note.noteSrc || "auto",
      verse: krvVerse("kings2", 22, 1),
      weakException: true,
    });
  }

  // —— 쌍 나열 오염 (감사에서 확정된 이웃 칸) ——
  const pairFixes = [
    {
      id: "H1583",
      identity: "가말리엘은 브다술의 아들이에요(민 1:10)",
      reason: "쌍 나열: 암미훗의 아들 엘리사마와 브다술의 아들 가말리엘",
      first: "처음 나오는 곳: 민 1:10.",
    },
    {
      id: "H1885",
      identity: "다단은 엘리압의 아들이에요(민 16:1)",
      reason: "쌍 나열: 이스할의 아들 고라와 … 엘리압의 아들 다단",
      first: "처음 나오는 곳: 민 16:1.",
    },
    {
      id: "H203",
      identity: "온은 벨렛의 아들이에요(민 16:1)",
      reason: "쌍 나열: … 벨렛의 아들 온 (이스할=고라 쪽)",
      first: "처음 나오는 곳: 민 16:1.",
    },
    {
      id: "H6034",
      // 동명이인 목록 중 창 36:2만 교정
      patch: (identity) =>
        identity.replace("엘론의 딸(창 36:2)", "시브온의 딸(창 36:2)"),
      reason: "쌍 나열: 엘론의 딸 아다와 시브온의 딸 아나",
    },
  ];
  for (const pf of pairFixes) {
    const note = notes[pf.id];
    if (!note) continue;
    const before = note.defKo;
    const parts = parseParts(before);
    let identity = pf.patch ? pf.patch(parts.identity) : pf.identity;
    const defKo = rebuildDef({
      identity,
      nm: note.nameMeaning || parts.nm,
      first: pf.first || parts.first,
      extras: parts.extras,
    });
    // soft 「으로 보기도」 보존
    let after = defKo;
    if (/으로 보기도 해요/.test(before) && note.nameMeaning) {
      after = before
        .replace(parts.identity, identity)
        .replace(/\s+/g, " ")
        .trim();
      if (pf.first && !/처음 나오는 곳:/.test(after)) {
        after = `${after.replace(/\.$/, "")}. ${pf.first}`;
      }
    }
    fixes.push({
      id: pf.id,
      reason: pf.reason,
      before,
      after,
      nameMeaning: note.nameMeaning,
      etymKo: note.etymKo,
      usageKo: note.usageKo || "",
      noteSrc: note.noteSrc || "auto",
    });
  }

  return fixes;
}

function runRelationAudit(notes, weakSet, manualFixIds) {
  const REL_GATE = /의 (아들|딸|아버지|손자|아내|어머니)/;
  const items = [];
  let scanned = 0;
  let withCite = 0;
  let skippedWeak = 0;
  let hazardPair = 0;
  let hazardChain = 0;
  let hazardDaughter = 0;
  let itemMismatch = 0;
  let itemOk = 0;
  let itemNeedHuman = 0;

  for (const [id, note] of Object.entries(notes)) {
    if (!note?.defKo) continue;
    if (!note.nameMeaning && !/이름은 「|이름 뜻은/.test(note.defKo)) continue;
    const parts = parseParts(note.defKo);
    if (!REL_GATE.test(parts.identity)) continue;
    scanned += 1;

    if (weakSet.has(id) && !manualFixIds.has(id)) {
      skippedWeak += 1;
      continue;
    }

    const subject = displayName(id, note);
    const claims = extractClaims(parts.identity, subject);
    for (const c of claims) {
      if (!c.refs.length && parts.firstRef) c.refs = [parts.firstRef];
    }
    if (!claims.length) continue;

    const claimResults = [];
    for (const c of claims) {
      if (!c.refs.length) {
        claimResults.push({ ...c, status: "needHuman", detail: "인용 절 없음" });
        continue;
      }
      withCite += 1;
      const ref0 = c.refs[0];
      const parsed = parseKoRef(ref0);
      if (!parsed) {
        claimResults.push({ ...c, status: "needHuman", detail: `책 코드 미해석: ${ref0}` });
        continue;
      }
      const verse = krvVerse(parsed.bookEn, parsed.ch, parsed.n);
      const ver = verifyClaimAgainstVerse(c, verse);
      claimResults.push({ ...c, ref: ref0, ...ver });
      if (ver.hazard === "pairList" || ver.hazard?.includes?.("pairList")) hazardPair += 1;
      if (ver.hazard === "genChain" || ver.hazard?.includes?.("genChain")) hazardChain += 1;
      if (ver.hazard === "daughter" || ver.hazard?.includes?.("daughter")) hazardDaughter += 1;
    }

    const worst = claimResults.some((x) => x.status === "mismatch")
      ? "mismatch"
      : claimResults.every((x) => x.status === "ok")
        ? "ok"
        : "needHuman";
    if (worst === "mismatch") itemMismatch += 1;
    else if (worst === "ok") itemOk += 1;
    else itemNeedHuman += 1;

    items.push({
      id,
      subject,
      identity: parts.identity,
      firstRef: parts.firstRef,
      worst,
      claims: claimResults,
    });
  }

  return {
    scanned,
    skippedWeak,
    withCiteClaims: withCite,
    counts: {
      /** 항목(Strong) 단위 */
      mismatch: itemMismatch,
      ok: itemOk,
      needHuman: itemNeedHuman,
      hazardPairListHits: hazardPair,
      hazardGenChainHits: hazardChain,
      hazardDaughterHits: hazardDaughter,
    },
    items: items.sort((a, b) => {
      const rank = { mismatch: 0, needHuman: 1, ok: 2 };
      return (rank[a.worst] ?? 9) - (rank[b.worst] ?? 9) || a.id.localeCompare(b.id);
    }),
  };
}

function autoFixFromAudit(notes, audit, weakSet, already) {
  const fixes = [];
  for (const item of audit.items) {
    if (item.worst !== "mismatch") continue;
    if (already.has(item.id)) continue;
    if (weakSet.has(item.id)) continue;
    const note = notes[item.id];
    if (!note) continue;
    const parts = parseParts(note.defKo);
    let identity = parts.identity;
    let changed = false;
    let skip = false;
    for (const c of item.claims) {
      if (c.status !== "mismatch" || !c.expected) continue;
      // 대 연쇄·모호 수식은 자동 금지 — 쌍 나열(pairList/order)만
      if (c.hazard === "genChain" || String(c.hazard || "").includes("genChain")) {
        skip = true;
        break;
      }
      if (!(c.hazard === "pairList" || c.hazard === "order" || c.hazard === "daughter")) {
        skip = true;
        break;
      }
      const expParent = c.expected.split("의")[0];
      if (isBadParentToken(expParent)) {
        skip = true;
        break;
      }
      // 주어가 인용 절에서 「자식」칸일 때만 (이웃 오염형)
      if (c.verse) {
        const v = extractVersePairs(c.verse);
        const asChild = v.pairs.some((p) => nameHit(p.child, item.subject));
        if (!asChild) {
          skip = true;
          break;
        }
      }
      const bad = `${c.related}의 ${c.rel}`;
      if (identity.includes(bad) && c.expected) {
        identity = identity.replace(bad, c.expected);
        changed = true;
      }
    }
    if (skip || !changed) continue;
    const after = note.defKo.replace(parts.identity, identity);
    const defKo =
      after !== note.defKo
        ? after.replace(/\s+/g, " ").trim()
        : rebuildDef({
            identity,
            nm: note.nameMeaning || parts.nm,
            first: parts.first,
            extras: parts.extras,
          });
    fixes.push({
      id: item.id,
      reason: "쌍 나열·순서 mismatch 자동 치환",
      before: note.defKo,
      after: defKo,
      nameMeaning: note.nameMeaning,
      etymKo: note.etymKo,
      usageKo: note.usageKo || "",
      noteSrc: note.noteSrc || "auto",
      auto: true,
    });
  }
  return fixes;
}

function collectRound18Pool() {
  const r18 = JSON.parse(
    fs.readFileSync(path.join(WS, "_hebrew-notes-round18-report.json"), "utf8"),
  );
  const ids = new Set();
  for (const x of r18["1_nameMeaningCalqueDrift"]?.list || []) ids.add(x.id);
  // ending: non-weak 84 — report may not list ids; reconstruct from notes if needed
  // nation 10
  for (const x of r18["3_nationErrors"]?.assyria6 || []) ids.add(x.id);
  for (const x of r18["3_nationErrors"]?.additionalFixed || []) ids.add(x.id);
  // ending wrong set not listed — pull from dry if present, else scan notes for sentence pattern that was fixed
  // Use calque(86)+nation(10) and fill from a saved list if any
  const endingPath = path.join(CACHE, "_hebrew-notes-round18-ending-ids.json");
  if (fs.existsSync(endingPath)) {
    for (const id of JSON.parse(fs.readFileSync(endingPath, "utf8"))) ids.add(id);
  }
  return [...ids];
}

function rebuildEndingPool(notes, weakSet) {
  // 문장형 nameMeaning인데 옛 틀이 아닌 「이름은 「」라는 뜻」을 쓰는 항목 ≈ 18차 ending 수정분
  const ids = [];
  for (const [id, note] of Object.entries(notes)) {
    if (weakSet.has(id)) continue;
    const nm = note.nameMeaning || "";
    if (!isSentenceMeaning(nm)) continue;
    if (/이름은\s*「[^」]+」라는\s*뜻이에요/.test(note.defKo || "")) ids.push(id);
  }
  return ids;
}

// —— main ——
fs.mkdirSync(CACHE, { recursive: true });
const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
const weakSet = buildWeakSet(notes);
console.log(`[r19] weakSet=${weakSet.size} apply=${APPLY}`);

const manual = proposeManualFixes(notes);
const manualIds = new Set(manual.map((x) => x.id));

const auditBefore = runRelationAudit(notes, weakSet, manualIds);

// apply manual into a working copy for after-audit preview
const preview = structuredClone(notes);
for (const f of manual) {
  preview[f.id] = {
    ...preview[f.id],
    defKo: f.after,
    etymKo: f.etymKo,
    usageKo: f.usageKo,
    noteSrc: f.noteSrc,
    nameMeaning: f.nameMeaning,
  };
}
const auto = autoFixFromAudit(preview, auditBefore, weakSet, manualIds);
for (const f of auto) {
  preview[f.id] = {
    ...preview[f.id],
    defKo: f.after,
  };
}
const allFixes = [...manual, ...auto];
const auditAfter = runRelationAudit(preview, weakSet, manualIds);

const auditDoc = {
  round: 19,
  mode: APPLY ? "apply" : "dry-run",
  generatedAt: new Date().toISOString(),
  weakProtected: { size: weakSet.size, untouchedExcept: ["H5718"] },
  summary: {
    before: {
      scanned: auditBefore.scanned,
      mismatch: auditBefore.counts.mismatch,
      needHuman: auditBefore.counts.needHuman,
      ok: auditBefore.counts.ok,
    },
    after: {
      scanned: auditAfter.scanned,
      mismatch: auditAfter.counts.mismatch,
      needHuman: auditAfter.counts.needHuman,
      ok: auditAfter.counts.ok,
    },
    fixed: allFixes.length,
    fixedManual: manual.length,
    fixedAuto: auto.length,
    hazards: {
      before: {
        pairList: auditBefore.counts.hazardPairListHits,
        genChain: auditBefore.counts.hazardGenChainHits,
        daughter: auditBefore.counts.hazardDaughterHits,
      },
      after: {
        pairList: auditAfter.counts.hazardPairListHits,
        genChain: auditAfter.counts.hazardGenChainHits,
        daughter: auditAfter.counts.hazardDaughterHits,
      },
    },
  },
  manualFixes: manual.map((f) => ({
    id: f.id,
    reason: f.reason,
    before: f.before,
    after: f.after,
    samePersonCheck: f.samePersonCheck || null,
  })),
  autoFixes: auto.map((f) => ({ id: f.id, reason: f.reason, before: f.before, after: f.after })),
  mismatchBefore: auditBefore.items.filter((x) => x.worst === "mismatch"),
  needHumanBeforeIds: auditBefore.items
    .filter((x) => x.worst === "needHuman")
    .map((x) => x.id),
  needHumanBeforeSample: auditBefore.items
    .filter((x) => x.worst === "needHuman")
    .slice(0, 100),
  needHumanHazardBefore: auditBefore.items
    .filter(
      (x) =>
        x.worst === "needHuman" &&
        x.claims.some((c) => /pairList|genChain|daughter/.test(String(c.hazard || ""))),
    )
    .map((x) => ({
      id: x.id,
      subject: x.subject,
      identity: x.identity,
      hazards: [...new Set(x.claims.flatMap((c) => String(c.hazard || "").split(",").filter(Boolean)))],
      detail: x.claims.find((c) => c.hazard)?.detail || "",
    })),
  mismatchAfter: auditAfter.items.filter((x) => x.worst === "mismatch"),
  needHumanAfterCount: auditAfter.items.filter((x) => x.worst === "needHuman").length,
  needHumanAfterIds: auditAfter.items.filter((x) => x.worst === "needHuman").map((x) => x.id),
};

// 감사 목록 경로(요청): public/word-study/… — lexicon 아님
fs.writeFileSync(AUDIT_OUT, JSON.stringify(auditDoc, null, 2) + "\n");

// round18 pool sample
const r18 = JSON.parse(fs.readFileSync(path.join(WS, "_hebrew-notes-round18-report.json"), "utf8"));
const pool = new Set(collectRound18Pool());
for (const id of rebuildEndingPool(notes, weakSet)) pool.add(id);
const poolArr = [...pool];
const sampleIds = seededSample(poolArr, SAMPLE_N, SAMPLE_SEED);
const sample20 = sampleIds.map((id) => ({
  id,
  defKo: notes[id]?.defKo || "",
  etymKo: notes[id]?.etymKo || "",
  nameMeaning: notes[id]?.nameMeaning || "",
}));

const dry = {
  round: 19,
  apply: APPLY,
  lexiconWrite: APPLY,
  note: APPLY
    ? "applied"
    : "에이전트3 --apply 완료 전: lexicon·hebrew.json 미기록. 패치는 proposed만.",
  weakSet: weakSet.size,
  proposed: allFixes.map((f) => ({
    id: f.id,
    reason: f.reason,
    defKo: f.after,
    etymKo: f.etymKo,
    usageKo: f.usageKo,
    noteSrc: f.noteSrc,
    nameMeaning: f.nameMeaning,
    before: f.before,
  })),
  sample20: { seed: SAMPLE_SEED, poolSize: poolArr.length, ids: sampleIds, texts: sample20 },
  counts: auditDoc.summary,
};
fs.writeFileSync(DRY_OUT, JSON.stringify(dry, null, 2) + "\n");

if (APPLY) {
  for (const f of allFixes) {
    const n = notes[f.id];
    n.defKo = f.after;
    if (f.etymKo !== undefined) n.etymKo = f.etymKo;
    if (f.usageKo !== undefined) n.usageKo = f.usageKo;
    if (f.noteSrc !== undefined) n.noteSrc = f.noteSrc;
    if (f.nameMeaning !== undefined) n.nameMeaning = f.nameMeaning;
    syncHebrewLexiconEntry(f.id, n, { lexDir: LEX });
  }
  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");
}

const report = {
  round: 19,
  mode: APPLY ? "apply" : "dry-run",
  lexiconWriteDeferred: !APPLY,
  weakProtected: { before: weakSet.size, after: buildWeakSet(preview).size, exception: ["H5718"] },
  specific: Object.fromEntries(
    manual.map((f) => [f.id, { before: f.before, after: f.after, reason: f.reason }]),
  ),
  relationAudit: auditDoc.summary,
  autoFixed: auto.length,
  sample20: { seed: SAMPLE_SEED, poolSize: poolArr.length, ids: sampleIds, texts: sample20 },
  outputs: {
    audit: AUDIT_OUT,
    dryRun: DRY_OUT,
  },
};
fs.writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2) + "\n");

console.log(
  JSON.stringify(
    {
      mode: APPLY ? "apply" : "dry-run",
      weak: weakSet.size,
      manual: manual.length,
      auto: auto.length,
      audit: auditDoc.summary,
      sampleSeed: SAMPLE_SEED,
      sampleIds,
      wrote: { audit: AUDIT_OUT, dry: DRY_OUT, report: REPORT_OUT },
    },
    null,
    2,
  ),
);
