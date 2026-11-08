/**
 * 히브리 동사 어간(binyan)별 뜻 · 다의어(poly) 판별.
 * OSHM 형태 코드 2번째 글자 → 어간 이름.
 * 참고: https://hb.openscriptures.org/parsing/HebrewMorphologyCodes.html
 */

export const VERB_STEM_NAME = {
  q: "Qal",
  N: "Niphal",
  p: "Piel",
  P: "Pual",
  h: "Hiphil",
  H: "Hophal",
  t: "Hithpael",
  o: "Polel",
  O: "Polal",
  r: "Hithpolel",
  m: "Poel",
  M: "Poal",
  k: "Palel",
  K: "Pulal",
  Q: "Qal pass.",
  l: "Pilpel",
  L: "Polpal",
  f: "Hithpalpel",
  D: "Tiphil",
  j: "Pealal",
  i: "Pilel",
  u: "Hothpaal",
  c: "Lifel",
  v: "Tiphal",
  w: "Pasel",
  y: "Peil",
  z: "Hishtaphel",
};

/**
 * strong → { [stemName]: glossKo }
 * H2490: Piel 더럽히다 / Hiphil 시작하다 / Poel·Pual·Polal 찔리다·상하다
 * (대표 「찌르다」 기본값 없음)
 */
export const STEM_SENSES = {
  H2490: {
    // Strong bore 순서는 기본값 아님. 칩 뜻은 ①KRV→②어간→③빈도.
    Piel: "더럽히다",
    Pual: "상하다",
    Poel: "찔리다",
    Polal: "찔리다", // 사 53:5 ①찔림 → 찔림을 당한
    Polel: "상하다",
    Hiphil: "시작하다",
    Hophal: "시작되다",
    Niphal: "더럽혀지다",
    Qal: "상하다",
    "Qal pass.": "상하다",
    Hithpael: "더럽혀지다",
  },
  H6030: {
    Qal: "응답하다",
    Niphal: "응답받다",
    Piel: "응답하다",
    Hiphil: "응답하게 하다",
  },
  H1288: {
    Qal: "무릎 꿇다",
    Niphal: "축복받다",
    Piel: "축복하다",
    Pual: "축복받다",
    Hiphil: "꿇리다",
    Hithpael: "축복하다",
  },
  H1792: {
    Qal: "상하게 하다",
    Niphal: "상하다",
    Piel: "박살내다",
    Pual: "상함을 당한",
    Hiphil: "상하게 하다",
  },
};

/** morph 문자열에서 어간 이름 추출 (없으면 null) */
export function verbStemFromMorph(morph) {
  if (!morph) return null;
  const parts = String(morph).split("/");
  for (const part of parts) {
    const m = part.match(/^H?V([a-zA-Z])/);
    if (m) return VERB_STEM_NAME[m[1]] || null;
  }
  return null;
}

export function stemSenseGloss(strong, morph) {
  const table = STEM_SENSES[strong];
  if (!table) return null;
  const stem = verbStemFromMorph(morph);
  if (!stem) return null;
  return table[stem] || null;
}

/**
 * BDB/Strong defEn 이 세미콜론으로 의미 묶음 2개 이상이면 true
 */
export function defEnHasMultipleSenses(defEn) {
  if (!defEn) return false;
  const parts = String(defEn)
    .split(/[;]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  return parts.length >= 2;
}

export function senseHead(m) {
  return String(m || "")
    .replace(/^~/u, "")
    .replace(/하다$/u, "")
    .replace(/되다$/u, "")
    .replace(/을 당한$/u, "")
    .slice(0, 2);
}
