// KJV 낭독 인식용 영어 정규화.
// 대소문자와 구두점을 지우고, thee / thou / hath 같은 고어를
// 음성 인식이 내는 현대 영어에 가깝게 접는다.
// 본문(목표)과 인식 결과(발화) 양쪽에 같은 함수를 적용한 뒤 비교한다.

const ARCHAIC_TO_MODERN: Record<string, string> = {
  thee: "you",
  thou: "you",
  thy: "your",
  thine: "your",
  ye: "you",
  hath: "has",
  hast: "have",
  doth: "does",
  dost: "do",
  saith: "says",
  unto: "to",
  art: "are",
  wilt: "will",
  shalt: "shall",
  wast: "were",
  wert: "were",
  whosoever: "whoever",
  whoso: "whoever",
  whatsoever: "whatever",
  wheresoever: "wherever",
  believeth: "believes",
  spake: "spoke",
  shew: "show",
  shewed: "showed",
  shewn: "shown",
  alway: "always",
  yea: "yes",
  nay: "no",
  o: "oh",
  verily: "truly",
  brethren: "brothers",
  afore: "before",
  betwixt: "between",
  nigh: "near",
  wherefore: "therefore",
};

function modernizeToken(token: string): string {
  if (!token) return "";
  const mapped = ARCHAIC_TO_MODERN[token];
  if (mapped) return mapped;

  // loveth → loves. 어간이 i 로 끝나면 cities 처럼 -ies.
  if (token.length > 4 && token.endsWith("eth")) {
    const stem = token.slice(0, -3);
    if (stem.endsWith("i")) return `${stem.slice(0, -1)}ies`;
    return `${stem}s`;
  }
  // givest → give, lovest → love
  if (token.length > 4 && token.endsWith("est")) {
    return token.slice(0, -3);
  }
  // lovedst 같은 2인칭 과거.
  if (token.length > 5 && token.endsWith("edst")) {
    return token.slice(0, -2);
  }
  return token;
}

/** 음성 인식 비교용. 구두점·대소문자를 없애고 고어를 접는다. */
export function normalizeEnglishSpeech(value: string): string {
  const token = value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
  return modernizeToken(token);
}
