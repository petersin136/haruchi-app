/** 개역한글 어절에서 조사·어미를 떼어 본체를 고른다. */

/** 긴 것부터 매칭. 필요하면 여기만 늘리면 된다. */
export const KO_STEM_SUFFIXES = [
  "하였더라",
  "하였으니",
  "이었더라",
  "이니라",
  "이로다",
  "에게서",
  "으로서",
  "하시니",
  "하리라",
  "였더라",
  "었더라",
  "이라",
  "이니",
  "이요",
  "이며",
  "에게",
  "께서",
  "으로",
  "로서",
  "에서",
  "하는",
  "하여",
  "하고",
  "하며",
  "하라",
  "께",
  "로",
  "에",
  "와",
  "과",
  "을",
  "를",
  "이",
  "가",
  "은",
  "는",
  "의",
  "도",
  "만",
  "들",
  "히",
  "케",
];

const SUFFIXES_DESC = [...KO_STEM_SUFFIXES].sort(
  (a, b) => b.length - a.length || a.localeCompare(b),
);

const LEADING_PUNCT =
  /["'“”‘’([{「『《〈《（［｛]/;
const TRAILING_PUNCT =
  /["'“”‘’)\]}」』》〉）］｝.,?!;:·…~\-—,]/;
const BOUND_CHAR =
  /[\s.,?!;:·"'“”‘’()[\]{}「」『』《》〈〉…~\-—,]/;

function isHangul(ch: string | undefined): boolean {
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3;
}

function stripOnce(word: string): string | null {
  for (const suf of SUFFIXES_DESC) {
    if (word.length > suf.length && word.endsWith(suf)) {
      return word.slice(0, -suf.length);
    }
  }
  return null;
}

function startsWithSuffix(s: string): string | null {
  for (const suf of SUFFIXES_DESC) {
    if (s.startsWith(suf)) return suf;
  }
  return null;
}

/** 본체 후보가 책 본문에 ‘뒤에 다른 글자/공백’으로 충분히 나오는지 */
export function stemHitCount(
  stem: string,
  bookText: string,
): { bare: number; affixed: number; suffixes: Set<string> } {
  let bare = 0;
  let affixed = 0;
  const suffixes = new Set<string>();
  if (!stem || !bookText) return { bare, affixed, suffixes };
  let from = 0;
  while (from < bookText.length) {
    const i = bookText.indexOf(stem, from);
    if (i < 0) break;
    from = i + 1;
    const before = i > 0 ? bookText[i - 1] : undefined;
    if (isHangul(before)) continue;
    const after = bookText.slice(i + stem.length);
    if (!after) continue;
    const ch = after[0];
    if (BOUND_CHAR.test(ch) || !isHangul(ch)) {
      bare += 1;
      continue;
    }
    const suf = startsWithSuffix(after);
    if (!suf) continue;
    const rest = after.slice(suf.length);
    const next = rest[0];
    if (!next || BOUND_CHAR.test(next) || !isHangul(next) || startsWithSuffix(rest)) {
      affixed += 1;
      suffixes.add(suf);
    }
  }
  return { bare, affixed, suffixes };
}

function isValidStem(stem: string, bookText: string): boolean {
  if (stem.length < 1) return false;
  const { bare, affixed, suffixes } = stemHitCount(stem, bookText);
  // 1글자(물 등)는 단독형(뒤가 공백·부호)이 2회 이상일 때만 — '아' 오탐 방지
  if (stem.length <= 1) return bare >= 2;
  if (bare + affixed < 2) return false;
  // 단독형이 없고 접미사가 한 종류뿐이면 더 긴 말의 앞부분(여호+와)으로 본다
  if (bare === 0 && suffixes.size <= 1) return false;
  return true;
}

/** 「핍박하거든」의 「하」처럼 명사 본체 뒤에 붙어 동사를 만드는 말 */
const KO_VERBALIZERS = ["시키", "하", "되", "케"] as const;
const KO_NOUN_PARTICLES = [
  "으로",
  "을",
  "를",
  "이",
  "가",
  "은",
  "는",
  "의",
  "에",
  "과",
  "와",
  "도",
] as const;
const KO_VERBALIZER_MIN_LEAD = 2;
const KO_NOUN_PARTICLE_MIN_HITS = 2;

/** 책 본문에서 stem 바로 뒤에 명사 조사가 붙고 어절이 끝나는 횟수·조사 종류 */
export function stemNounParticleHits(
  stem: string,
  bookText: string,
): { count: number; kinds: Set<string> } {
  const kinds = new Set<string>();
  if (!stem || !bookText) return { count: 0, kinds };
  let n = 0;
  let from = 0;
  while (from < bookText.length) {
    const i = bookText.indexOf(stem, from);
    if (i < 0) break;
    from = i + 1;
    if (i > 0 && isHangul(bookText[i - 1])) continue;
    const after = bookText.slice(i + stem.length);
    for (const p of KO_NOUN_PARTICLES) {
      if (!after.startsWith(p)) continue;
      const next = after[p.length];
      if (!next || !isHangul(next)) {
        n += 1;
        kinds.add(p);
        break;
      }
    }
  }
  return { count: n, kinds };
}

/**
 * 명사 본체로 볼 만한지. 조사 한 종류만 붙는 경우는
 * 「말하+는」「드리+는」(동사 어간)·「여호+와」(긴 이름의 앞부분)라서 뺀다.
 */
function isNounStem(stem: string, bookText: string): boolean {
  const { count, kinds } = stemNounParticleHits(stem, bookText);
  return count >= KO_NOUN_PARTICLE_MIN_HITS && kinds.size >= 2;
}

/**
 * 「기뻐」「싫어」「두려워」처럼 -아/-어 활용형으로 끝남.
 * 「용서」「전파」「이사」 같은 한자어 명사와 겹치지 않게 ㅘ/ㅝ와 몇 글자만 본다.
 */
function endsLikeVerbForm(stem: string): boolean {
  const ch = stem[stem.length - 1];
  if (!isHangul(ch)) return false;
  if ("아어여워와뻐퍼버".includes(ch!)) return true;
  const code = ch!.charCodeAt(0) - 0xac00;
  if (code % 28 !== 0) return false;
  const jung = Math.floor(code / 28) % 21;
  return jung === 9 || jung === 14;
}

/** 「순종+의」「순종+치/케」처럼 명사 흔적이 한 번이라도 있는지 */
function hasNounTrace(stem: string, bookText: string): boolean {
  if (stemNounParticleHits(stem, bookText).count >= 1) return true;
  return new RegExp(`(?<![가-힣])${escapeRe(stem)}[치케](?![가-힣])`).test(
    bookText,
  );
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 「아비하일」「요아하스」처럼 stem+하 뒤가 늘 같은 글자면 이름으로 본다 */
function looksLikeName(stemPlusV: string, bookText: string): boolean {
  const nexts = new Set<string>();
  let hits = 0;
  let from = 0;
  while (from < bookText.length) {
    const i = bookText.indexOf(stemPlusV, from);
    if (i < 0) break;
    from = i + 1;
    if (i > 0 && isHangul(bookText[i - 1])) continue;
    hits += 1;
    nexts.add(bookText[i + stemPlusV.length] ?? "");
  }
  if (hits < 2 || nexts.size !== 1) return false;
  const next = [...nexts][0]!;
  return isHangul(next) && !KO_VERB_ENDING_HEADS.includes(next);
}

/** 「하/되」 바로 뒤에 오는 흔한 어미 첫 글자 */
const KO_VERB_ENDING_HEADS =
  "여였고며는라니시지게되사던리나면매기심셨거오옵소도자든므려야신실셔세겠어었었은";

/**
 * 어절 안 「하/되/시키/케」 앞부분 후보(앞 글자 ≥2). 앞쪽부터.
 * 어절 끝 「되」는 「이르시되」「여기되」 같은 연결 어미라서 뺀다.
 */
export function verbalizerCuts(core: string): { cut: number; v: string }[] {
  const out: { cut: number; v: string }[] = [];
  for (let i = KO_VERBALIZER_MIN_LEAD; i < core.length; i += 1) {
    const v = KO_VERBALIZERS.find((x) => core.startsWith(x, i));
    if (!v) continue;
    if (v === "되" && i + 1 >= core.length) continue;
    out.push({ cut: i, v });
  }
  return out;
}

/**
 * 어절에서 본체 구간. start/end는 eojeol 문자열 기준 반개구간.
 * 앞쪽 따옴표·괄호·문장부호는 빼고,
 * ① 「하/되/시키/케」 앞부분이 책에서 명사 조사와 2회 이상 쓰이면 그 앞부분,
 * ② 아니면 뒤붙이를 최대 2단계까지 뗀다(「기뻐+하라」처럼 명사가 아닌 앞부분에서 「하」를 자르지는 않음).
 */
export function stemOf(
  eojeol: string,
  bookText: string,
): { start: number; end: number } {
  if (!eojeol) return { start: 0, end: 0 };

  let start = 0;
  let end = eojeol.length;
  while (start < end && LEADING_PUNCT.test(eojeol[start]!)) start += 1;
  while (end > start && TRAILING_PUNCT.test(eojeol[end - 1]!)) end -= 1;

  const core = eojeol.slice(start, end);
  if (!core) return { start: 0, end: eojeol.length };

  const rejectedHaCuts = new Set<number>();
  for (const { cut, v } of verbalizerCuts(core)) {
    const stem = core.slice(0, cut);
    if (looksLikeName(core.slice(0, cut + v.length), bookText)) {
      rejectedHaCuts.add(cut);
      continue;
    }
    if (isNounStem(stem, bookText)) {
      return { start, end: start + cut };
    }
    if (v === "하" && endsLikeVerbForm(stem) && !hasNounTrace(stem, bookText)) {
      rejectedHaCuts.add(cut);
    }
  }

  const candidates: string[] = [core];
  let cur = core;
  for (let stage = 0; stage < 2; stage += 1) {
    const next = stripOnce(cur);
    if (!next || next === cur) break;
    candidates.push(next);
    cur = next;
  }

  for (let i = candidates.length - 1; i >= 1; i -= 1) {
    const c = candidates[i]!;
    if (rejectedHaCuts.has(c.length)) continue;
    if (!isValidStem(c, bookText)) continue;
    // 접미사만 떼므로 후보는 항상 core 접두사
    return { start, end: start + c.length };
  }

  return { start, end };
}
