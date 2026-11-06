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
//   4) שׁ (쉰) = 샤/쉬/셰… 계열, שׂ (신) = 사/세 계열.
//   5) 끝 ץ→츠, 끝 ח→흐(파타흐 숨은모음이면 아흐), 끝 ר→르.
//   6) 첫 י+모음 → 야/예….
//   7) 다게쉬 겹자음은 앞 음절 받침으로 (잇샤).
//   8) צ+ㅔ → 체. ל 앞 음절에 ㄹ 받침 복제 (첼렘).
// =============================================================================

const HEB_LETTER_RANGE = /[\u05D0-\u05EA]/;
const NIQQUD_RANGE = /[\u05B0-\u05BB\u05C7]/;
const SHIN_DOT = "\u05C1";
const SIN_DOT = "\u05C2";
const DAGESH = "\u05BC";
const ACCENT_RE = /[\u0591-\u05AF]/g;

const CONS = {
  "\u05D0": ["ㅇ", ""], // א
  "\u05D1": ["ㅂ", "ㅂ"], // ב
  "\u05D2": ["ㄱ", "ㄱ"], // ג
  "\u05D3": ["ㄷ", "ㄷ"], // ד
  "\u05D4": ["ㅎ", ""], // ה
  "\u05D5": ["ㅂ", ""], // ו
  "\u05D6": ["ㅈ", "ㅅ"], // ז
  "\u05D7": ["ㅎ", "ㅎ"], // ח
  "\u05D8": ["ㄷ", "ㄷ"], // ט
  "\u05D9": ["ㅇ", ""], // י
  "\u05DB": ["ㅋ", "ㄱ"], // כ
  "\u05DC": ["ㄹ", "ㄹ"], // ל
  "\u05DE": ["ㅁ", "ㅁ"], // מ
  "\u05E0": ["ㄴ", "ㄴ"], // נ
  "\u05E1": ["ㅅ", "ㅅ"], // ס
  "\u05E2": ["ㅇ", ""], // ע
  "\u05E4": ["ㅍ", "ㅂ"], // פ
  "\u05E6": ["ㅊ", "ㅅ"], // צ (츠/체)
  "\u05E7": ["ㅋ", "ㄱ"], // ק
  "\u05E8": ["ㄹ", "ㄹ"], // ר
  "\u05E9": ["ㅅ", "ㅅ"], // ש
  "\u05EA": ["ㅌ", "ㅅ"], // ת
  "\u05DA": ["ㅋ", "ㄱ"], // ך
  "\u05DD": ["ㅁ", "ㅁ"], // ם
  "\u05DF": ["ㄴ", "ㄴ"], // ן
  "\u05E3": ["ㅍ", "ㅂ"], // ף
  "\u05E5": ["ㅊ", "ㅅ"], // ץ → 츠
};

const VOWEL = {
  "\u05B0": "ㅡ", // sheva (음절핵일 때 아래에서 ㅔ/ㅡ로 재결정)
  "\u05B1": "ㅔ", // hataf segol
  "\u05B2": "ㅏ", // hataf patah
  "\u05B3": "ㅗ", // hataf qamets
  "\u05B4": "ㅣ", // hireq
  "\u05B5": "ㅔ", // tsere
  "\u05B6": "ㅔ", // segol
  "\u05B7": "ㅏ", // patah
  "\u05B8": "ㅏ", // qamets
  "\u05B9": "ㅗ", // holem
  "\u05BA": "ㅗ", // holem haser
  "\u05BB": "ㅜ", // qubuts
};

/** 끝자음: 받침 흡수 대신 초성+ㅡ 음절 */
const FINAL_OPEN = new Set([
  "\u05E8", // ר → 르
  "\u05D7", // ח → 흐
  "\u05E6", // צ
  "\u05E5", // ץ → 츠
  "\u05EA", // ת → 트
  "\u05DB", // כ
  "\u05DA", // ך → 크
  "\u05E9", // ש → 쉬
  "\u05E7", // ק
]);

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

/** 쉰(sh): ㅏ→ㅑ, ㅔ→ㅖ, ㅗ→ㅛ, ㅜ→ㅠ, ㅡ→ㅟ */
function shinJung(jung) {
  return (
    { ㅏ: "ㅑ", ㅐ: "ㅒ", ㅓ: "ㅕ", ㅔ: "ㅖ", ㅗ: "ㅛ", ㅜ: "ㅠ", ㅡ: "ㅟ" }[jung] ||
    jung
  );
}

/** 첫 요드: ㅏ→ㅑ, ㅔ→ㅖ … */
function yodJung(jung) {
  return (
    { ㅏ: "ㅑ", ㅐ: "ㅒ", ㅓ: "ㅕ", ㅔ: "ㅖ", ㅗ: "ㅛ", ㅜ: "ㅠ", ㅡ: "ㅟ" }[jung] ||
    jung
  );
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

function isShin(t) {
  return t.cons === "\u05E9" && t.dot !== SIN_DOT;
}

function transliterateWord(raw) {
  const word = stripHebrewAccents(raw)
    .replace(/[־'״\u05F3\u05F4]/g, "")
    .replace(/[\u05BD\u05BF]/g, "");
  if (!word) return "";

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
        i += 1;
      }
      tokens.push(cur);
    } else {
      i += 1;
    }
  }

  const out = [];
  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (t._consumed) continue;
    const prev = out.length ? out[out.length - 1] : null;
    const cu = t.cons;
    const isLast = idx === tokens.length - 1;

    // ו shureq / holem-vav
    if (cu === "\u05D5" && t.dagesh && t.marks.length === 0) {
      if (prev && !prev.jung) prev.jung = "ㅜ";
      else out.push({ cho: "ㅇ", jung: "ㅜ", jong: "" });
      continue;
    }
    if (cu === "\u05D5" && t.marks.length === 1 && t.marks[0] === "\u05B9") {
      if (prev && !prev.jung) prev.jung = "ㅗ";
      else out.push({ cho: "ㅇ", jung: "ㅗ", jong: "" });
      continue;
    }

    // 어중/어말 요드가 앞 모음을 받치는 마터 (hireq-yod / tsere-yod)
    if (cu === "\u05D9" && t.marks.length === 0 && !t.dagesh) {
      if (prev && (prev.jung === "ㅣ" || prev.jung === "ㅔ")) continue;
      // חַי 등: 모음 있는 앞 음절 뒤 맨끝 요드 → 이
      if (prev && prev.jung && isLast) {
        out.push({ cho: "ㅇ", jung: "ㅣ", jong: "" });
        continue;
      }
    }

    // 묵음 א/ע (모음·다게쉬 없음), 끝 ה
    const isSilentAlephAyin =
      (cu === "\u05D0" || cu === "\u05E2") && t.marks.length === 0 && !t.dagesh;
    const isSilentFinalHe =
      cu === "\u05D4" && t.marks.length === 0 && !t.dagesh && isLast;
    if (isSilentAlephAyin || isSilentFinalHe) continue;

    // 끝 숨은 파타흐(furtive patah): ח→아흐, ע/ה→아 (자음 거의 묵음)
    if (
      isLast &&
      (cu === "\u05D7" || cu === "\u05E2" || cu === "\u05D4") &&
      t.marks.length === 1 &&
      t.marks[0] === "\u05B7"
    ) {
      out.push({ cho: "ㅇ", jung: "ㅏ", jong: "" });
      if (cu === "\u05D7") out.push({ cho: "ㅎ", jung: "ㅡ", jong: "" });
      continue;
    }

    let cho = CONS[cu]?.[0] ?? "ㅇ";
    let jung = null;
    let jong = "";
    let shevaOnly = false;

    if (cu === "\u05E9") cho = "ㅅ";
    if (cu === "\u05D5") cho = "ㅂ";

    if (t.marks.length) {
      const mark = t.marks[t.marks.length - 1];
      shevaOnly = mark === "\u05B0" && t.marks.length === 1;
      jung = VOWEL[mark] ?? null;

      // weak sheva → 앞 음절 받침 흡수 (다게쉬 겹자음이 아닐 때)
      if (shevaOnly && prev && !prev.jong && !t.dagesh) {
        const jongSym = CONS[cu]?.[1] ?? "";
        if (jongSym && !FINAL_OPEN.has(cu)) {
          prev.jong = jongSym;
          continue;
        }
      }
      // 음성 셰바(음절핵): ㅔ / 끝이면 ㅡ
      if (shevaOnly) {
        jung = isLast ? "ㅡ" : "ㅔ";
      }
    }

    // look-ahead: vav holem / shureq
    if (!jung) {
      const nx = tokens[idx + 1];
      if (nx && nx.cons === "\u05D5" && !nx._consumed) {
        if (nx.dagesh && nx.marks.length === 0) {
          jung = "ㅜ";
          nx._consumed = true;
        } else if (!nx.dagesh && nx.marks.length === 1 && nx.marks[0] === "\u05B9") {
          jung = "ㅗ";
          nx._consumed = true;
        }
      }
    }
    // look-ahead: mater yod
    if (!jung) {
      const nx = tokens[idx + 1];
      if (
        nx &&
        nx.cons === "\u05D9" &&
        !nx._consumed &&
        !nx.dagesh &&
        nx.marks.length === 0
      ) {
        jung = "ㅣ";
        nx._consumed = true;
      }
    }

    if (!jung) {
      // 끝 자음 → 츠/르/흐/트/크/쉬 …
      if (isLast && FINAL_OPEN.has(cu)) {
        jung = "ㅡ";
      } else {
        const jongSym = CONS[cu]?.[1] ?? "";
        if (prev && !prev.jong && jongSym) {
          prev.jong = jongSym;
          continue;
        }
        jung = "ㅡ";
      }
    }

    // 쉰 활음
    if (isShin(t)) jung = shinJung(jung);

    // 첫 요드 + 모음 → 야/예
    if (idx === 0 && cu === "\u05D9") jung = yodJung(jung);

    // 다게쉬 포르테: 앞 음절 받침으로 겹자음
    if (t.dagesh && prev && !prev.jong) {
      const gem = CONS[cu]?.[1] || (isShin(t) ? "ㅅ" : "");
      // begadkepat 마찰 표시만인 어두 다게쉬는 제외(앞 음절 없을 때는 이미 prev 없음)
      if (gem) prev.jong = gem;
    }

    // ל : 앞 음절에 ㄹ 받침 복제 (첼렘)
    if (cu === "\u05DC" && prev && !prev.jong) {
      prev.jong = "ㄹ";
    }

    out.push({ cho, jung, jong });
  }

  return out
    .map((s) => {
      if (!s.jung) return s.cho;
      return compose(s.cho, s.jung, s.jong || null);
    })
    .join("");
}

export function transliterate(hebrew) {
  if (!hebrew) return "";
  return hebrew
    .split("/")
    .map((p) => transliterateWord(p))
    .filter(Boolean)
    .join("");
}

export const PRON_OVERRIDES = {
  יהוה: "여호와",
  אדני: "아도나이",
  אלהים: "엘로힘",
  אל: "엘",
  אברהם: "아브라함",
  יצחק: "이삭",
  יעקב: "야곱",
  משה: "모세",
  אהרן: "아론",
  דוד: "다윗",
  שלמה: "솔로몬",
  ישראל: "이스라엘",
  ירושלם: "예루살렘",
};

function stripAllNiqqud(s) {
  return (s || "").normalize("NFD").replace(/[\u0591-\u05C7]/g, "").normalize("NFC");
}

export function lookupPron(hebrew) {
  if (!hebrew) return "";
  const skel = stripAllNiqqud(hebrew).replace(/[־'״\u05F3\u05F4]/g, "");
  return PRON_OVERRIDES[skel] || "";
}

export function pron(hebrew) {
  return lookupPron(hebrew) || transliterate(hebrew);
}
