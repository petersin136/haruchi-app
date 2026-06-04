// =============================================================================
// OSHB Hebrew Morphology (OSHM) 코드 → 한국어 라벨.
// 헬라어의 morph-parse.mjs 와 동일한 자리. 입력은 "HC/Vqw3ms" 처럼 "/" 로
// 형태소가 갈라진 문자열. 첫 글자는 H(히브리어) / A(아람어).
// 참고: https://hb.openscriptures.org/parsing/HebrewMorphologyCodes.html
// =============================================================================

const POS = {
  A: "형용사",
  C: "접속사",
  D: "부사",
  N: "명사",
  P: "대명사",
  R: "전치사",
  S: "접미대명사",
  T: "소사",
  V: "동사",
};

const VERB_STEM = {
  q: "Qal", N: "Niphal", p: "Piel", P: "Pual", h: "Hiphil",
  H: "Hophal", t: "Hithpael", o: "Polel", O: "Polal",
  r: "Hithpolel", m: "Poel", M: "Poal", k: "Palel", K: "Pulal",
  Q: "Qal pass.", l: "Pilpel", L: "Polpal", f: "Hithpalpel",
  D: "Tiphil", j: "Pealal", i: "Pilel", u: "Hothpaal",
  c: "Lifel", v: "Tiphal", w: "Pasel", y: "Peil",
  z: "Hishtaphel",
};

const VERB_CONJ = {
  p: "완료", q: "연속완료", i: "미완료", w: "연속미완료",
  h: "명령형", j: "단축형", v: "권유형", r: "분사 능동",
  s: "분사 수동", a: "부정사 절대", c: "부정사 연계",
};

const PERSON = { 1: "1인칭", 2: "2인칭", 3: "3인칭" };
const GENDER = { m: "남성", f: "여성", b: "공성", c: "공성" };
const NUMBER = { s: "단수", p: "복수", d: "양수" };
const NOUN_TYPE = { c: "보통", p: "고유", g: "민족", t: "지명" };
const NOUN_STATE = { a: "절대", c: "연계", d: "결정" };
const PRON_TYPE = {
  p: "인칭", d: "지시", i: "의문",
  r: "관계", f: "재귀",
};
const PART_TYPE = {
  a: "긍정", d: "정관사", e: "감탄", i: "의문",
  j: "지시", m: "지명", n: "부정", o: "직접목적격",
  r: "관계", x: "허사",
};
const ADJ_TYPE = { a: "일반", c: "기수", g: "민족", o: "서수", x: "기타" };

function decodeOne(code) {
  if (!code) return { posLabel: "", parseLabel: "", parseLabelLong: "" };
  // 첫 글자는 H/A — 언어 표시. 두번째가 품사.
  let lang = "";
  let rest = code;
  if (code[0] === "H" || code[0] === "A") {
    lang = code[0];
    rest = code.slice(1);
  }
  const posC = rest[0] || "";
  const posLabel = POS[posC] || "";
  let parts = [];
  let partsLong = [];

  switch (posC) {
    case "V": {
      const stemC = rest[1];
      const conjC = rest[2];
      const stem = VERB_STEM[stemC] || stemC;
      const conj = VERB_CONJ[conjC] || conjC;
      parts.push(stem, conj);
      partsLong.push(stem, conj);
      // 나머지 인칭/성/수
      const more = rest.slice(3);
      if (conjC === "r" || conjC === "s" || conjC === "a" || conjC === "c") {
        // 분사·부정사: 인칭 없음, 성/수만 (분사) 또는 없음 (부정사)
        if (conjC === "r" || conjC === "s") {
          const g = GENDER[more[0]];
          const n = NUMBER[more[1]];
          const st = NOUN_STATE[more[2]];
          if (g) parts.push(g);
          if (n) parts.push(n);
          if (st) partsLong.push(st);
        }
      } else {
        // 정형동사: PGN
        const p = PERSON[more[0]];
        const g = GENDER[more[1]];
        const n = NUMBER[more[2]];
        if (p) parts.push(p);
        if (g) parts.push(g);
        if (n) parts.push(n);
      }
      break;
    }
    case "N": {
      const type = NOUN_TYPE[rest[1]] || "";
      const g = GENDER[rest[2]];
      const n = NUMBER[rest[3]];
      const st = NOUN_STATE[rest[4]];
      if (type && type !== "보통") parts.push(type);
      if (g) parts.push(g);
      if (n) parts.push(n);
      if (st) partsLong.push(st);
      break;
    }
    case "A": {
      const type = ADJ_TYPE[rest[1]] || "";
      const g = GENDER[rest[2]];
      const n = NUMBER[rest[3]];
      const st = NOUN_STATE[rest[4]];
      if (type && type !== "일반") parts.push(type);
      if (g) parts.push(g);
      if (n) parts.push(n);
      if (st) partsLong.push(st);
      break;
    }
    case "P": {
      const type = PRON_TYPE[rest[1]];
      const p = PERSON[rest[2]];
      const g = GENDER[rest[3]];
      const n = NUMBER[rest[4]];
      if (type) parts.push(type);
      if (p) parts.push(p);
      if (g) parts.push(g);
      if (n) parts.push(n);
      break;
    }
    case "S": {
      // suffix pronominal — 보통 V*/N* 뒤에 붙음
      const p = PERSON[rest[1]];
      const g = GENDER[rest[2]];
      const n = NUMBER[rest[3]];
      if (p) parts.push(p);
      if (g) parts.push(g);
      if (n) parts.push(n);
      break;
    }
    case "T": {
      const type = PART_TYPE[rest[1]];
      if (type) parts.push(type);
      break;
    }
    case "R": {
      // 전치사 — 추가 정보 보통 없음
      break;
    }
    case "C": {
      // 접속사
      break;
    }
    case "D": {
      // 부사
      break;
    }
    default:
      break;
  }

  return {
    posLabel,
    parseLabel: parts.join(" "),
    parseLabelLong: [posLabel, ...parts, ...partsLong].filter(Boolean).join(" · "),
    lang,
  };
}

// "HC/Vqw3ms" 처럼 형태소가 "/" 로 갈라진 입력을 처리. 마지막(주된) 형태소의
// 정보를 대표로 반환하되, 모든 형태소의 라벨도 함께 제공.
export function decodeMorph(morphRaw) {
  if (!morphRaw) {
    return { posLabel: "", parseLabel: "", parseLabelLong: "", parts: [] };
  }
  // 첫 글자(H/A) 가 한 번만 등장하더라도 각 형태소가 독립적으로 H 를 가지는
  // 경우가 OSHM 의 표준. 분리 후 각각 디코드.
  const tokens = morphRaw.split("/").map((m) => {
    // 두번째 형태소부터 H 가 생략될 수 있음 — 보강.
    if (!m) return "";
    if (m[0] === "H" || m[0] === "A") return m;
    return (morphRaw[0] === "A" ? "A" : "H") + m;
  });
  const decoded = tokens.map(decodeOne);
  // 대표 항목은 동사가 있으면 동사, 없으면 마지막 형태소.
  const main =
    decoded.find((d) => d.posLabel === "동사") ||
    decoded.find((d) => d.posLabel === "명사" || d.posLabel === "형용사") ||
    decoded[decoded.length - 1] ||
    {};
  return {
    posLabel: main.posLabel || "",
    parseLabel: main.parseLabel || "",
    parseLabelLong: decoded
      .map((d) => d.parseLabelLong)
      .filter(Boolean)
      .join(" + "),
    parts: decoded,
  };
}

// 1 글자 prefix lemma 코드(b, c, d, k, l, m, s, i 등) → 한국어 라벨.
export const PREFIX_LEMMA = {
  a: { gloss: "~의", role: "전치사" },
  b: { gloss: "~ 안에/으로", role: "전치사 בְּ" },
  c: { gloss: "그리고", role: "접속사 וְ" },
  d: { gloss: "그", role: "정관사 הַ" },
  i: { gloss: "~인가?", role: "의문사 הֲ" },
  k: { gloss: "~처럼", role: "전치사 כְּ" },
  l: { gloss: "~에게/를 위해", role: "전치사 לְ" },
  m: { gloss: "~로부터", role: "전치사 מִן" },
  s: { gloss: "~한 (자/것)", role: "관계대명사 שֶׁ" },
};
