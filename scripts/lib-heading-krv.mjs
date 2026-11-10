/**
 * 소제목 내용어 ↔ 개역한글 구간 본문 점검
 */
const SKIP = new Set(
  `그 저 또 및 곧 아니라 아니요 아니 것 자 일 더 다시 오직 가장 있는 없는 많은 대한 위하여 위해 않는 못할 앞에 스스로 처음 세 네 두 한 나의 너의 저의 우리 너희 저희 모두 이런 그런 저런 위에 아래 가운데 같이 처럼 따라`.split(
    /\s+/,
  ),
);

const ENDINGS = [
  "하시니라",
  "하시옵소서",
  "하옵소서",
  "하시나이까",
  "하시니",
  "하심을",
  "하심",
  "하시며",
  "하시고",
  "하소서",
  "하였느니라",
  "하였더라",
  "하나이다",
  "하오니",
  "함을",
  "함이",
  "함과",
  "함의",
  "함",
  "받으심",
  "되심",
  "케하심",
  "으시니라",
  "으시니",
  "으심",
  "으소서",
  "이니라",
  "이라",
  "이며",
  "이고",
  "이나",
  "이요",
  "느니라",
  "도다",
  "리라",
  "리니라",
  "리이까",
  "리요",
  "려고",
  "려고",
  "시니",
  "시며",
  "시고",
  "소서",
  "나이까",
  "하였",
  "하는",
  "하여",
  "하니",
  "하고",
  "더라",
  "느냐",
  "으리라",
  "으리니",
].sort((a, b) => b.length - a.length);

const PART = [
  "으로는",
  "으로",
  "로서",
  "로써",
  "에서",
  "에게서",
  "에게",
  "부터",
  "까지",
  "처럼",
  "같이",
  "께서",
  "의",
  "을",
  "를",
  "이",
  "가",
  "은",
  "는",
  "과",
  "와",
  "로",
  "에",
  "께",
].sort((a, b) => b.length - a.length);

function hangulTokens(s) {
  return String(s).match(/[가-힣]+/g) ?? [];
}

function peel(tok) {
  let s = tok;
  for (let i = 0; i < 6; i++) {
    let hit = false;
    for (const e of ENDINGS) {
      if (s.length - e.length >= 1 && s.endsWith(e)) {
        s = s.slice(0, -e.length);
        hit = true;
        break;
      }
    }
    if (hit) continue;
    for (const e of PART) {
      if (s.length - e.length >= 1 && s.endsWith(e)) {
        s = s.slice(0, -e.length);
        hit = true;
        break;
      }
    }
    if (!hit) break;
  }
  // 고치심·먹이심 등: 하 없는 ~심
  if (s.length >= 3 && s.endsWith("심")) s = s.slice(0, -1);
  return s;
}

export function contentStems(title) {
  const out = [];
  const seen = new Set();
  for (const t of hangulTokens(title)) {
    if (SKIP.has(t)) continue;
    let s = peel(t);
    if (s.length < 1 || SKIP.has(s)) continue;
    if (s === "하" || s === "하심") continue;
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function matchStem(stem, body, words) {
  const b = body.replace(/\s+/g, "");
  if (!stem) return true;
  const variants = [stem];
  if (stem.endsWith("들") && stem.length > 2) variants.push(stem.slice(0, -1));
  if (stem.endsWith("신") && stem.length > 2) variants.push(stem.slice(0, -1)); // 택하신→택하
  for (const s of variants) {
    if (b.includes(s)) return true;
    // 열두 ↔ 열 두
    if (s.length >= 2) {
      const spaced = [...s].join("\\s*");
      if (new RegExp(spaced).test(body)) return true;
    }
    for (const w of words) {
      if (!w) continue;
      if (w.startsWith(s) || (s.startsWith(w) && w.length >= 2)) return true;
      let n = 0;
      const lim = Math.min(s.length, w.length);
      for (let i = 0; i < lim; i++) {
        if (s[i] === w[i]) n += 1;
        else break;
      }
      if (n >= 3) return true;
      if (n >= 2 && s.length <= 3) return true;
    }
  }
  return false;
}

export function relatedWords(stem, body) {
  const words = hangulTokens(body);
  const head = stem.slice(0, 2);
  return [
    ...new Set(
      words.filter((w) => w.length >= 2 && (w.includes(head) || head.includes(w.slice(0, 2)))),
    ),
  ].slice(0, 8);
}

/**
 * @returns {{ stem: string, related: string[] }[]}
 */
export function missingContentStems(title, body) {
  const words = hangulTokens(body);
  /** @type {{ stem: string, related: string[] }[]} */
  const miss = [];
  for (const stem of contentStems(title)) {
    if (!matchStem(stem, body, words)) {
      miss.push({ stem, related: relatedWords(stem, body) });
    }
  }
  return miss;
}

export function sectionBody(krvMap, start, end) {
  const parts = [];
  for (let n = start; n <= end; n++) {
    if (krvMap.has(n)) parts.push(krvMap.get(n));
  }
  return parts.join(" ");
}

/** 본문 첫 절에서 짧은 제목 후보 (4–14자) */
export function titleFromKrvVerse(text, maxChars = 14) {
  let t = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  t = t
    .replace(/^(예수께서|여호와께서|하나님이|그\s*)\s*/u, "")
    .replace(/(하니라|더라|이로다|이니라|이니|이라|이로다)$/u, "");
  // 첫 절기 단위
  const cut = t.search(/[\,，]| 하고 | 하며 | 하되 | 가로되 | 이르시되/);
  if (cut > 4) t = t.slice(0, cut);
  const chars = [...t.trim()];
  if (chars.length > maxChars) return chars.slice(0, maxChars).join("").trim();
  if (chars.length < 2) return t.slice(0, maxChars);
  return chars.join("").trim();
}
