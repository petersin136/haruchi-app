// =============================================================================
// MorphGNT 형태소 분석 코드 → 한국어 라벨 변환 유틸.
//
// 입력:
//   pos   : 2자리 품사 코드 (예: "N-", "V-", "RA", "RP", "C-", "P-")
//   parse : 8자리 분석 코드 (예: "3AAI-S--", "----NSF-")
//
// 출력:
//   {
//     posLabel       : "명사" 등
//     parseLabel     : "여성 단수 속격" 또는 "3인칭 단수 부정과거 능동 직설법" 식
//     parseLabelLong : 같은 정보를 길게 풀어 쓴 형태 (상세 카드용)
//     features       : 구조화된 필드 (필요 시 UI 에서 직접 조립할 때 사용)
//   }
//
// MorphGNT 표기 참고:
//   parse[0] = person  : 1, 2, 3, -
//   parse[1] = tense   : P, I, F, A, X, Y, -
//   parse[2] = voice   : A, M, P, D(중간 deponent), N, O, X, Q, -
//   parse[3] = mood    : I, S, M, O, N(부정사), P(분사), -
//   parse[4] = case    : N, G, D, A, V, -
//   parse[5] = number  : S, P, D, -
//   parse[6] = gender  : M, F, N, -
//   parse[7] = degree  : C(비교), S(최상), -
// =============================================================================

const POS_LABEL = {
  "A-": "형용사",
  "C-": "접속사",
  "D-": "부사",
  "I-": "감탄사",
  "N-": "명사",
  "P-": "전치사",
  "RA": "정관사",
  "RD": "지시대명사",
  "RI": "의문/부정 대명사",
  "RP": "인칭대명사",
  "RR": "관계대명사",
  "V-": "동사",
  "X-": "소사",
};

const PERSON = { "1": "1인칭", "2": "2인칭", "3": "3인칭" };
const TENSE = {
  P: "현재",
  I: "미완료",
  F: "미래",
  A: "부정과거",
  X: "완료",
  Y: "과거완료",
};
const VOICE = {
  A: "능동",
  M: "중간",
  P: "수동",
  D: "중간(이태)",
  N: "중간/수동(이태)",
  O: "중간/수동",
  X: "미정",
  Q: "비인칭 능동",
};
const MOOD = {
  I: "직설법",
  S: "가정법",
  M: "명령법",
  O: "기원법",
  N: "부정사",
  P: "분사",
};
const CASE = { N: "주격", G: "속격", D: "여격", A: "대격", V: "호격" };
const NUMBER = { S: "단수", P: "복수", D: "쌍수" };
const GENDER = { M: "남성", F: "여성", N: "중성" };
const DEGREE = { C: "비교급", S: "최상급" };

function get(map, ch) {
  return ch && ch !== "-" ? map[ch] ?? null : null;
}

export function decodeMorph(pos, parse) {
  const posLabel = POS_LABEL[pos] ?? pos;
  if (!parse || parse.length < 8) {
    return { posLabel, parseLabel: "", parseLabelLong: "", features: {} };
  }
  const features = {
    person: get(PERSON, parse[0]),
    tense: get(TENSE, parse[1]),
    voice: get(VOICE, parse[2]),
    mood: get(MOOD, parse[3]),
    case: get(CASE, parse[4]),
    number: get(NUMBER, parse[5]),
    gender: get(GENDER, parse[6]),
    degree: get(DEGREE, parse[7]),
  };
  // 짧은 라벨 — 명사·분사·관사 등 격성수 우선, 동사면 인칭·시제·태·법.
  const nominalParts = [features.gender, features.number, features.case].filter(Boolean);
  const verbalParts = [
    features.person,
    features.number,
    features.tense,
    features.voice,
    features.mood,
  ].filter(Boolean);
  let parseLabel = "";
  if (features.mood === "분사") {
    parseLabel = [features.tense, features.voice, "분사", ...nominalParts]
      .filter(Boolean)
      .join(" ");
  } else if (features.mood === "부정사") {
    parseLabel = [features.tense, features.voice, "부정사"].filter(Boolean).join(" ");
  } else if (verbalParts.length >= 3) {
    parseLabel = verbalParts.join(" ");
  } else if (nominalParts.length) {
    parseLabel = nominalParts.join(" ");
  }
  if (features.degree) parseLabel = `${parseLabel} ${features.degree}`.trim();
  // 길이가 짧은 단순 라벨이지만 상세 카드용 long 라벨도 별도 제공.
  const longParts = [];
  if (features.person) longParts.push(features.person);
  if (features.tense) longParts.push(features.tense);
  if (features.voice) longParts.push(features.voice);
  if (features.mood) longParts.push(features.mood);
  if (features.case) longParts.push(features.case);
  if (features.number) longParts.push(features.number);
  if (features.gender) longParts.push(features.gender);
  if (features.degree) longParts.push(features.degree);
  const parseLabelLong = longParts.join(" · ");
  return { posLabel, parseLabel, parseLabelLong, features };
}
