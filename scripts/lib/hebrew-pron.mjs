// =============================================================================
// 히브리어 → 한글 음역 (transliteration).
//
// 한글로 표기 가능한 수준의 음역. 정확한 IPA 가 아니라 "읽기 편한 한국어"가
// 목표. 헬라어용 lib/greek-pron.mjs 와 같은 자리에 있다.
//
// 규칙 요약:
//   1) 칸틸레이션 부호(악센트·텡엠 등)는 모두 제거.
//   2) 자음 → 한국어 초성, 닉쿠드(모음) → 한국어 중성, 음절 종성은 마지막
//      자음으로 결합.
//   3) י(yod) 와 ו(vav) 가 모음 역할을 할 때는 모음으로 처리(hireq + yod = ㅣ,
//      holem + vav = ㅗ, shureq = ㅜ).
//   4) שׁ (오른점) = 시/쉬 계열, שׂ (왼점) = 사/세 계열.
//   5) 닉쿠드 없는 자음은 무성으로 종성처리 (또는 단독이면 묵음 ㅡ로 처리).
//
// 입력이 형태소 단위로 "/" 로 갈라져 있어도 (예: "בְּ/רֵאשִׁית") 자동으로
// 각 부분을 음역해 합친다. 모르는 입력은 빈 문자열 대신 가능한 한 그대로 둔다.
// =============================================================================

// ── 유니코드 상수 ────────────────────────────────────────────────────────────
const HEB_LETTER_RANGE = /[\u05D0-\u05EA]/;
// 모음(닉쿠드)만. shin/sin dot (U+05C1/05C2) 는 자음 구분자이므로 별도 처리.
const NIQQUD_RANGE = /[\u05B0-\u05BB\u05C7]/;
const SHIN_DOT = "\u05C1";
const SIN_DOT = "\u05C2";
const DAGESH = "\u05BC";
// 칸틸레이션·텡엠 부호 (악센트). 발음에 영향 없음 — 제거.
const ACCENT_RE = /[\u0591-\u05AF]/g;

// 자음별 초성/종성 매핑 ([초성, 종성, 비고]). 음역 일관성을 위해 표준화.
const CONS = {
  "\u05D0": ["ㅇ", ""], // א aleph (silent)
  "\u05D1": ["ㅂ", "ㅂ"], // ב bet
  "\u05D2": ["ㄱ", "ㄱ"], // ג gimel
  "\u05D3": ["ㄷ", "ㄷ"], // ד dalet
  "\u05D4": ["ㅎ", ""], // ה he (종성에서는 묵음)
  "\u05D5": ["ㅂ", ""], // ו vav (자음)
  "\u05D6": ["ㅈ", "ㅅ"], // ז zayin
  "\u05D7": ["ㅎ", "ㅎ"], // ח het (강한 H — chet)
  "\u05D8": ["ㄷ", "ㄷ"], // ט tet
  "\u05D9": ["ㅇ", ""], // י yod (자음 위치에선 묵음 ㅇ, 모음 ㅣ는 별도 처리)
  "\u05DB": ["ㅋ", "ㄱ"], // כ kaf
  "\u05DC": ["ㄹ", "ㄹ"], // ל lamed
  "\u05DE": ["ㅁ", "ㅁ"], // מ mem
  "\u05E0": ["ㄴ", "ㄴ"], // נ nun
  "\u05E1": ["ㅅ", "ㅅ"], // ס samekh
  "\u05E2": ["ㅇ", ""], // ע ayin (silent)
  "\u05E4": ["ㅍ", "ㅂ"], // פ pe
  "\u05E6": ["ㅉ", "ㅅ"], // צ tsade
  "\u05E7": ["ㅋ", "ㄱ"], // ק qof
  "\u05E8": ["ㄹ", "ㄹ"], // ר resh
  "\u05E9": ["ㅅ", "ㅅ"], // ש shin/sin
  "\u05EA": ["ㅌ", "ㅅ"], // ת tav
  // 어미형
  "\u05DA": ["ㅋ", "ㄱ"], // ך kaf-final
  "\u05DD": ["ㅁ", "ㅁ"], // ם mem-final
  "\u05DF": ["ㄴ", "ㄴ"], // ן nun-final
  "\u05E3": ["ㅍ", "ㅂ"], // ף pe-final
  "\u05E5": ["ㅉ", "ㅅ"], // ץ tsade-final
};

// 닉쿠드 → 모음 (중성 인덱스 + 표기). null = 약한 sheva (묵음).
const VOWEL = {
  "\u05B0": "ㅡ", // sheva — 약하지만 표기는 ㅡ
  "\u05B1": "ㅔ", // hataf segol
  "\u05B2": "ㅏ", // hataf patah
  "\u05B3": "ㅗ", // hataf qamets
  "\u05B4": "ㅣ", // hireq
  "\u05B5": "ㅔ", // tsere
  "\u05B6": "ㅔ", // segol
  "\u05B7": "ㅏ", // patah
  "\u05B8": "ㅏ", // qamets (qamets gadol; qamets hatuf 은 ㅗ 이지만 단순화)
  "\u05B9": "ㅗ", // holem (앞 자음 위)
  "\u05BA": "ㅗ", // holem haser for vav
  "\u05BB": "ㅜ", // qubuts
};

// 한글 자모 → 음절 합성 (초성/중성/종성 → 완성형 코드포인트).
const CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
const JUNG = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
  "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
];
const JONG = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ",
  "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

function compose(cho, jung, jong) {
  const i = CHO.indexOf(cho);
  const j = JUNG.indexOf(jung);
  const k = jong ? JONG.indexOf(jong) : 0;
  if (i < 0 || j < 0 || k < 0) return cho + jung + (jong ?? "");
  return String.fromCodePoint(0xac00 + i * 588 + j * 28 + k);
}

export function stripHebrewAccents(s) {
  return (s || "").normalize("NFD").replace(ACCENT_RE, "").normalize("NFC");
}

function isLetter(c) {
  return c && HEB_LETTER_RANGE.test(c);
}
function isVowelMark(c) {
  return c && NIQQUD_RANGE.test(c);
}

// 단일 형태소(prefix 미포함) 음역. "/" 포함 입력은 transliterate() 가 분할 처리.
function transliterateWord(raw) {
  const word = stripHebrewAccents(raw)
    .replace(/[־'״\u05F3\u05F4]/g, "") // 마케프·게르샤임 제거
    .replace(/[\u05BD\u05BF]/g, ""); // meteg, rafe 제거
  if (!word) return "";

  // 토큰화: 자음 + 그 뒤에 붙는 모든 결합 부호 (dagesh, shin-dot, 모음 niqqud).
  // NFC 정규화 결과에서 결합 부호는 자음 직후에 임의 순서로 나타날 수 있으므로
  // 다음 자음 전까지 모두 수집한다.
  const tokens = [];
  let i = 0;
  while (i < word.length) {
    const c = word[i];
    if (isLetter(c)) {
      const cur = { cons: c, dot: null, dagesh: false, marks: [] };
      i += 1;
      while (i < word.length && !isLetter(word[i])) {
        const c2 = word[i];
        if (c2 === SHIN_DOT || c2 === SIN_DOT) cur.dot = c2;
        else if (c2 === DAGESH) cur.dagesh = true;
        else if (isVowelMark(c2)) cur.marks.push(c2);
        // 그 외는 무시 (이미 ACCENT_RE 로 걸러졌지만 안전망)
        i += 1;
      }
      tokens.push(cur);
    } else {
      i += 1;
    }
  }

  // 음절 합성. ו(vav) + holem = "ㅗ" 음절, ו + shureq dot = "ㅜ", י + hireq = "ㅣ"
  const out = [];
  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (t._consumed) continue;
    // ו가 모음 역할인가? (앞 토큰의 모음이 없는데, ו가 dagesh 또는 holem 부호와 함께)
    const prev = out.length ? out[out.length - 1] : null;
    const cu = t.cons;

    // 1) ו 가 holem(왈리프) 또는 shureq 표기를 받쳐주는 경우:
    //    앞 자음이 holem 부호(05B9)를 가졌고 다음이 ו 라면, ㅗ 로 흡수 (이미 prev 에 적용)
    //    또는 ו 가 dagesh 만 가지면 shureq (ㅜ) — 단독 모음 음절로 추가.
    if (cu === "\u05D5" && t.dagesh && t.marks.length === 0) {
      // shureq: 앞 자음의 종성/홀로 음절이 없으면 ㅇ+ㅜ
      if (prev && !prev.jung) {
        prev.jung = "ㅜ";
      } else {
        out.push({ cho: "ㅇ", jung: "ㅜ", jong: "" });
      }
      continue;
    }
    if (cu === "\u05D5" && t.marks.length === 1 && t.marks[0] === "\u05B9") {
      // vav + holem (after consonant) — vav가 holem 를 받친 형태
      if (prev && !prev.jung) {
        prev.jung = "ㅗ";
      } else {
        out.push({ cho: "ㅇ", jung: "ㅗ", jong: "" });
      }
      continue;
    }
    // 2) י (yod) 가 모음 마커 역할인 경우 — 앞 모음이 ㅣ 면 hireq-yod 결합으로
    //    조용히 흡수. 앞 모음이 ㅔ 면 tsere-yod (ay) 로 ㅣ 처럼 흡수해도 무방.
    if (cu === "\u05D9" && t.marks.length === 0 && !t.dagesh) {
      if (prev && (prev.jung === "ㅣ" || prev.jung === "ㅔ")) {
        continue; // 모음을 받쳐주는 yod — 발음에 영향 없음
      }
      // 그 외는 자음 yod 로 처리 (이 분기에서 떨어지면 fall-through 일반 처리)
    }

    // 3) 묵음 자음 처리.
    //    aleph/ayin: 모음·다게쉬 없으면 모두 묵음 (성문 폐쇄음, 한글로 표기 무리).
    //    he:        단어 끝에서 모음·다게쉬 없을 때만 묵음. 어중에서는 다음
    //               vav-shureq/holem 모음을 받아 발음됨.
    const isSilentAlephAyin =
      (cu === "\u05D0" || cu === "\u05E2") &&
      t.marks.length === 0 &&
      !t.dagesh;
    const isSilentFinalHe =
      cu === "\u05D4" &&
      t.marks.length === 0 &&
      !t.dagesh &&
      idx === tokens.length - 1;
    if (isSilentAlephAyin || isSilentFinalHe) {
      continue;
    }

    // 일반 자음 처리
    let cho = CONS[cu]?.[0] ?? "ㅇ";
    let jung = null;
    let jong = "";
    if (cu === "\u05E9") {
      // shin (right dot, U+05C1) → ㅅ (sh) ; sin (left dot, U+05C2) → ㅅ
      cho = "ㅅ";
    }
    if (cu === "\u05D5") {
      // vav 자음 (모음 역할 아닌 경우): ㅂ 보다 ㅇ+모음 형태가 더 자연. 그러나
      // 단순화: vav 가 자음 위치이고 모음을 동반하면 일반 ㅂ로 처리.
      cho = "ㅂ";
    }
    // 모음 결정 (마지막으로 등장한 닉쿠드를 모음으로 — 가장 강한 모음을 잡음)
    if (t.marks.length) {
      // hataf 류는 다른 모음과 결합되지 않으므로 그대로 사용
      const mark = t.marks[t.marks.length - 1];
      jung = VOWEL[mark] ?? null;
      // weak sheva (단독 sheva) 는 종성으로 직전 음절에 흡수
      if (mark === "\u05B0" && prev && !prev.jong && jung === "ㅡ") {
        // 직전 음절 종성으로 흡수 시도
        const jongSym = CONS[cu]?.[1] ?? "";
        if (jongSym) {
          prev.jong = jongSym;
          continue;
        }
      }
    }
    // Look-ahead: 다음 토큰이 vav-holem 또는 shureq 라면 모음으로 흡수.
    if (!jung) {
      const nx = tokens[idx + 1];
      if (nx && nx.cons === "\u05D5" && !nx._consumed) {
        if (nx.dagesh && nx.marks.length === 0) {
          jung = "ㅜ";
          nx._consumed = true;
        } else if (
          !nx.dagesh &&
          nx.marks.length === 1 &&
          nx.marks[0] === "\u05B9"
        ) {
          jung = "ㅗ";
          nx._consumed = true;
        }
      }
    }
    // Look-ahead: 다음이 마터 yod (모음 마커) 이면 ㅣ/ㅔ 흡수.
    if (!jung) {
      const nx = tokens[idx + 1];
      if (
        nx &&
        nx.cons === "\u05D9" &&
        !nx._consumed &&
        !nx.dagesh &&
        nx.marks.length === 0
      ) {
        // 모음 마커 yod — 일반적으로 ㅣ 로 흡수.
        jung = "ㅣ";
        nx._consumed = true;
      }
    }
    if (!jung) {
      // 종성으로 흡수 가능?
      const jongSym = CONS[cu]?.[1] ?? "";
      if (prev && !prev.jong && jongSym) {
        prev.jong = jongSym;
        continue;
      }
      // 그렇지 않으면 단독 자음을 ㅡ 로 발음 (sheva 묵음 처리)
      jung = "ㅡ";
    }
    out.push({ cho, jung, jong });
  }

  return out
    .map((s) => {
      if (!s.jung) return s.cho; // 비정상 — 자모 한 글자만
      return compose(s.cho, s.jung, s.jong || null);
    })
    .join("");
}

// "/" 로 분리된 형태소 다발을 전체적으로 음역.
export function transliterate(hebrew) {
  if (!hebrew) return "";
  return hebrew
    .split("/")
    .map((p) => transliterateWord(p))
    .filter(Boolean)
    .join("");
}

// 고전 인명/지명 등 알고리즘이 어색한 케이스는 PRON_OVERRIDES 에서 우선 매핑.
export const PRON_OVERRIDES = {
  // 유명한 신성 4자: 별도 처리 (전통적인 음역).
  "יהוה": "여호와",
  "אדני": "아도나이",
  "אלהים": "엘로힘",
  "אל": "엘",
  // 알려진 인명 — 발음 안정성 우선
  "אברהם": "아브라함",
  "יצחק": "이삭",
  "יעקב": "야곱",
  "משה": "모세",
  "אהרן": "아론",
  "דוד": "다윗",
  "שלמה": "솔로몬",
  "ישראל": "이스라엘",
  "ירושלם": "예루살렘",
};

function stripAllNiqqud(s) {
  return (s || "").normalize("NFD").replace(/[\u0591-\u05C7]/g, "").normalize("NFC");
}

export function lookupPron(hebrew) {
  if (!hebrew) return "";
  // 부호 제거 자음 골격만 비교
  const skel = stripAllNiqqud(hebrew).replace(/[־'״\u05F3\u05F4]/g, "");
  return PRON_OVERRIDES[skel] || "";
}

export function pron(hebrew) {
  return lookupPron(hebrew) || transliterate(hebrew);
}
