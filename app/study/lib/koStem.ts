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

/**
 * 어절에서 본체 구간. start/end는 eojeol 문자열 기준 반개구간.
 * 앞쪽 따옴표·괄호·문장부호는 빼고, 뒤붙이는 최대 2단계까지 뗀다.
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
    if (!isValidStem(c, bookText)) continue;
    // 접미사만 떼므로 후보는 항상 core 접두사
    return { start, end: start + c.length };
  }

  return { start, end };
}
