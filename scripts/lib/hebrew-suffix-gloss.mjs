/**
 * OSHB/OSHM 대명 접미(Sp…) → 한국어 뜻.
 * 3fs 기본은 「그/그것」(사람 여성이 확실할 때만 「그녀」).
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
  // 3fs: 기본 「그」 — 사람 여성 확실 시에만 그녀 (clearFemale)
  "3fs": { poss: "그의", obj: "그를/그에게", label: "3인칭 여성 단수" },
  "3mp": { poss: "그들의", obj: "그들을/그들에게", label: "3인칭 남성 복수" },
  "3fp": { poss: "그들의", obj: "그들을/그들에게", label: "3인칭 여성 복수" },
  "3cs": { poss: "그의", obj: "그를/그에게", label: "3인칭 공성 단수" },
  "3cp": { poss: "그들의", obj: "그들을/그들에게", label: "3인칭 공성 복수" },
};

/**
 * morph 조각에서 접미 코드 추출.
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
 * מִמֶּנּוּ 동형(3ms/1cp) 보정.
 * MorphHB가 창 2:17 등을 Sp1cp로 잘못 표기하는 경우가 있어
 * 개역한글 문맥으로 가린다.
 */
export function disambiguateSuffixCode(code, { strong, surface, krvText } = {}) {
  let c = code;
  if (!c) return c;
  const surf = String(surface || "");
  const krv = String(krvText || "");
  // 니쿠드·악센트 제거 후 자음만 (נּוּ → נו)
  const cons = surf.replace(/[\u0591-\u05C7]/g, "");
  // מן + נו 동형 (MorphHB가 창 2:17 등을 Sp1cp로 잘못 표기하는 경우)
  if (
    (strong === "H4480" || /ממ/.test(cons) || /ממ/.test(surf)) &&
    (c === "1cp" || c === "3ms") &&
    /נו/.test(cons)
  ) {
    const hasUs = /우리(와|의|를|가|에게|에서|중|는|도)/.test(krv);
    const hasIt = /그것|그 나무|실과|먹는 날/.test(krv);
    if (c === "1cp" && hasIt && !hasUs) c = "3ms";
    else if (c === "3ms" && hasUs && /우리(와 같이| 중|에게서)/.test(krv)) c = "1cp";
  }
  return c;
}

/**
 * @param {string|null} code "2ms"
 * @param {"verb"|"noun"|"prep"|"other"} host
 * @param {{ clearFemale?: boolean }} [opt]
 */
export function suffixGlossKo(code, host = "verb", opt = {}) {
  if (!code) return "";
  if (code === "3fs" && opt.clearFemale) {
    return host === "noun" ? "그녀의" : "그녀를/그녀에게";
  }
  const row = SUFFIX_GLOSS[code];
  if (!row) return "";
  return host === "noun" ? row.poss : row.obj;
}

/** 전치사+접미용 짧은 지시어 */
export const SUFFIX_DET = {
  "1cs": "내",
  "1cp": "우리",
  "2ms": "네",
  "2fs": "네",
  "2mp": "너희",
  "2fp": "너희",
  "2cs": "네",
  "2cp": "너희",
  "3ms": "그",
  "3fs": "그", // 기본; clearFemale 시 그녀
  "3mp": "그들",
  "3fp": "그들",
  "3cs": "그",
  "3cp": "그들",
};

/**
 * ל/על/מן 등 + 접미
 * מן+3ms → 「그것에서/그에게서」, מן+1cp → 「우리에게서」
 */
export function composePrepSuffixGloss(stemGlossKo, suffixCode, opt = {}) {
  let prep = String(stemGlossKo || "")
    .replace(/~/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!prep) return "";
  if (prep.includes("에게")) prep = prep.includes("에게서") ? "에게서" : "에게";

  const clearFemale = !!opt.clearFemale;
  const det =
    suffixCode === "3fs" && clearFemale
      ? "그녀"
      : SUFFIX_DET[suffixCode] || "";
  if (!det) return prep;

  // 여격
  if (prep === "에게" || prep === "에게서" || prep.endsWith("에게")) {
    const map = {
      "1cs": "나에게",
      "1cp": "우리에게",
      "2ms": "너에게",
      "2fs": "너에게",
      "2mp": "너희에게",
      "2fp": "너희에게",
      "2cs": "너에게",
      "2cp": "너희에게",
      "3ms": "그에게",
      "3fs": clearFemale ? "그녀에게" : "그에게",
      "3mp": "그들에게",
      "3fp": "그들에게",
      "3cs": "그에게",
      "3cp": "그들에게",
    };
    const base = prep.endsWith("에게서") ? "에게서" : "에게";
    if (base === "에게서") {
      return (map[suffixCode] || `${det}에게`).replace(/에게$/, "에게서");
    }
    return map[suffixCode] || `${det}에게`;
  }

  // מן / 로부터 / 에서 / 중에서
  if (
    prep === "로부터" ||
    prep === "에서" ||
    prep === "중에서" ||
    prep.endsWith("로부터") ||
    prep.endsWith("중에서")
  ) {
    const fromMap = {
      "1cs": "나에게서",
      "1cp": "우리에게서",
      "2ms": "너에게서",
      "2fs": "너에게서",
      "2mp": "너희에게서",
      "2fp": "너희에게서",
      "2cs": "너에게서",
      "2cp": "너희에게서",
      "3ms": "그것에서/그에게서",
      "3fs": clearFemale ? "그녀에게서" : "그것에서",
      "3mp": "그들에게서",
      "3fp": "그들에게서",
      "3cs": "그것에서/그에게서",
      "3cp": "그들에게서",
    };
    return fromMap[suffixCode] || `${det}에게서`;
  }

  // 그 위에 / 그 앞에 …
  return `${det} ${prep}`.replace(/\s+/g, " ").trim();
}

export function isSuffixMorph(morphPart) {
  return !!parseSuffixCode(morphPart);
}

export function isPrefixLemma(lemmaPart) {
  const t = String(lemmaPart || "").trim();
  return t.length >= 1 && t.length <= 2 && /^[a-z]+$/.test(t);
}
