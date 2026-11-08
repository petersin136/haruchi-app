/**
 * OSHB/OSHM 대명 접미(Sp…) → 한국어 뜻.
 * 동사 목적/여격 · 명사 소유격을 구분해 쓸 수 있게 두 표를 둔다.
 */

/** @typedef {{ poss: string, obj: string, label: string }} SuffixGloss */

/** @type {Record<string, SuffixGloss>} */
export const SUFFIX_GLOSS = {
  "1cs": { poss: "나의", obj: "나를", label: "1인칭 단수" },
  "1cp": { poss: "우리의", obj: "우리를", label: "1인칭 복수" },
  "2ms": { poss: "너의", obj: "너를/너에게", label: "2인칭 남성 단수" },
  "2fs": { poss: "너의", obj: "너를/너에게", label: "2인칭 여성 단수" },
  "2mp": { poss: "너희의", obj: "너희를/너희에게", label: "2인칭 남성 복수" },
  "2fp": { poss: "너희의", obj: "너희를/너희에게", label: "2인칭 여성 복수" },
  "2cs": { poss: "너의", obj: "너를/너에게", label: "2인칭 공성 단수" },
  "2cp": { poss: "너희의", obj: "너희를/너희에게", label: "2인칭 공성 복수" },
  "3ms": { poss: "그의", obj: "그를/그에게", label: "3인칭 남성 단수" },
  "3fs": { poss: "그녀의", obj: "그녀를/그녀에게", label: "3인칭 여성 단수" },
  "3mp": { poss: "그들의", obj: "그들을/그들에게", label: "3인칭 남성 복수" },
  "3fp": { poss: "그들의", obj: "그들을/그들에게", label: "3인칭 여성 복수" },
  "3cs": { poss: "그의", obj: "그를/그에게", label: "3인칭 공성 단수" },
  "3cp": { poss: "그들의", obj: "그들을/그들에게", label: "3인칭 공성 복수" },
};

/**
 * morph 조각에서 접미 코드 추출.
 * OSHB 예: "Sp2ms", "HSp1cs", "S3mp"
 * @returns {string|null} "2ms" 형태
 */
export function parseSuffixCode(morphPart) {
  if (!morphPart) return null;
  const m = String(morphPart).match(/^H?S(?:p)?([123])([mfcb])([spd])/i);
  if (!m) return null;
  const person = m[1];
  const gender = m[2].toLowerCase() === "b" ? "c" : m[2].toLowerCase();
  const number = m[3].toLowerCase() === "d" ? "p" : m[3].toLowerCase();
  return `${person}${gender}${number}`;
}

/**
 * @param {string|null} code "2ms"
 * @param {"verb"|"noun"|"other"} host
 */
export function suffixGlossKo(code, host = "verb") {
  if (!code) return "";
  const row = SUFFIX_GLOSS[code];
  if (!row) return "";
  return host === "noun" ? row.poss : row.obj;
}

export function isSuffixMorph(morphPart) {
  return !!parseSuffixCode(morphPart);
}

export function isPrefixLemma(lemmaPart) {
  const t = String(lemmaPart || "").trim();
  return t.length >= 1 && t.length <= 2 && /^[a-z]+$/.test(t);
}
