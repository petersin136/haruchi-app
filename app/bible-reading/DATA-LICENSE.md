# 성경 본문 데이터 라이선스 및 출처

이 문서는 `app/bible-reading/` 에 포함된 성경 본문 JSON 의 **저작권 근거**
와 **데이터 출처**를 명시한다. 본문 데이터를 추가·교체할 때는 반드시 이
문서의 원칙을 확인할 것.

---

## 1. 적용 본문

이 앱이 사용하는 한국어 성경은 **성경전서 개역한글판(Korean Revised
Version, KRV, 대한성서공회, 1961)** 한 가지이다.

> **개역개정판(Korean Revised New Version, NKRV)은 절대 사용하지 않는다.**
> NKRV 는 대한성서공회의 저작권이 유효한 별도 번역본이며, 본 라이선스
> 근거의 적용 대상이 아니다.

스크립트 `scripts/import-bible-krv.mjs` 의 `KRV_CHECKS` 가 변환 시점에
KRV / NKRV 가 결정적으로 갈리는 절을 자동 점검하여, NKRV 패턴이
검출되면 변환을 중단(abort)한다.

---

## 2. 라이선스 근거

대한성서공회(bskorea.or.kr) **공식 저작권 FAQ** 명시:

> **"성경전서 개역한글판은 저작재산권 보호기간 50년이 경과되어
> 저작권료 지급 없이 사용 가능"**

따라서 본 앱은 별도의 사용 허락이나 저작권료 지급 없이 개역한글판
본문을 자유롭게 사용·재배포할 수 있다.

법적 근거 보충(한국 저작권법):
- 1961년 초판 발행 → 발행 후 50년 경과(2011년 기준 만료)
- 대한성서공회가 동 FAQ 로 공식적으로 자유 사용을 확인

---

## 3. 데이터 출처

| 항목 | 내용 |
|---|---|
| 저장소 | [`scrollmapper/bible_databases`](https://github.com/scrollmapper/bible_databases) |
| 브랜치 | `2025-languages` |
| 파일 | `sources/ko/KorRV/KorRV.json` |
| 저장소 명시 라이선스 | `License: Public Domain` (README 명시) |
| 다운로드 크기 | 약 15.7 MB (원본 JSON) |
| 책 수 | 66 (구약 39 + 신약 27) |
| 절 수 합계 | 31,104 |

### 교차 검증 보조 소스

| 항목 | 내용 |
|---|---|
| 저장소 | [`laisiangtho/bible`](https://github.com/laisiangtho/bible) |
| 파일 | `json/88.json` (identify=88, "개역한글" 1961 명시) |
| 라이선스 | MIT (저장소 LICENSE) |

두 소스의 절 수가 66권 중 63권에서 완전히 일치(나머지 3권 ±1절 = 절
경계 분할 차이). 기존 보존 5권(잠언·마태·마가·누가·요한) 절 수와
scrollmapper 가 100% 일치하므로 **scrollmapper 를 1차 소스로 채택**.

---

## 4. KRV 확정 검증 (텍스트 단위)

KRV 와 NKRV 가 결정적으로 갈리는 절 샘플 — 모두 KRV 패턴 확인.

| 절 | KRV (본 앱 데이터) | NKRV (사용 금지) |
|---|---|---|
| 시 23:1 | 여호와는 나의 목자시니 **내가** 부족함이 없으리로다 | 여호와는 나의 목자시니 **내게** 부족함이 없으리로다 |
| 요 3:16 | 이는 **저를** 믿는 자마다 **멸망치** 않고 ... **하심이니라** | 이는 **그를** 믿는 자마다 **멸망하지** 않고 ... **하심이라** |
| 고전 13:13 | 이 **세가지는** 항상 있을 것인데 **그 중에** 제일은 사랑이라 | 이 **세 가지는** 항상 있을 것인데 **그 중의** 제일은 사랑이라 |

---

## 5. 코드 내 출처 표시

각 책 JSON 의 `translations.krv.note` 필드에 출처·라이선스 근거가
들어있다:

```
"성경전서 개역한글판 (대한성서공회, 1961). 라이선스: 대한성서공회 공식
저작권 FAQ에 따라 저작재산권 보호기간 50년 경과로 저작권료 지급 없이
사용 가능 공공저작물 (개역개정판은 해당 없음). 데이터 출처:
scrollmapper/bible_databases (GitHub, 2025-languages branch,
sources/ko/KorRV/KorRV.json, License: Public Domain)."
```

추가로 `app/bible-reading/bibleData.ts` 상단 코멘트 블록에도 동일한
근거가 명시되어 있다.

---

## 6. 헬라어(SBLGNT) 본문에 관해

마태복음 일부 장(현재 1~5장)에는 신약 헬라어 원문이 함께 들어 있다.
사용 본문과 라이선스 근거는 다음과 같다.

| 항목 | 내용 |
|---|---|
| 본문 | **SBLGNT** (SBL Greek New Testament) |
| 편집·발행 | Michael W. Holmes 편 / Society of Biblical Literature, Logos Bible Software |
| 라이선스 | **Creative Commons Attribution 4.0 (CC BY 4.0)** |
| 저장소 | [`LogosBible/SBLGNT`](https://github.com/LogosBible/SBLGNT) (`data/sblgnt/text/Matt.txt`) |
| 적용 범위 | 현재 **마태복음 1~5장 (138절)** 만. 점진적 확장 예정. |
| 처리 | 본문 표시 단계에서 SBLGNT 의 본문 비평 부호(⸀ ⸁ ⸂…⸃, U+2E00..U+2E03) 만 제거하고, 모음 앞 단축(ʼ U+02BC) 은 원문 그대로 보존. |

> **NA28/UBS5 는 사용하지 않는다.** 두 판본 모두 저작권이 살아 있는 본문 비평판이며,
> 사용 시 별도 사용 허락이 필요하다. SBLGNT 는 CC BY 4.0 으로 자유 사용·재배포가 가능해
> 본 앱(공공 배포 가능성 포함) 에 안전하다.

코드 내 출처 표시는 `app/bible-reading/matthew.json` 의 `translations.greek.note`
에 다음 형태로 들어가 있다:

```
"SBLGNT (SBL Greek New Testament), © Society of Biblical Literature, CC BY 4.0.
사용 범위: 마태복음 1~5장 (점진적 확장 예정). 각 절 아래 단어 풀이(greekWords)
는 본 앱이 직접 작성한 학습용 의역이며, 발음·격·뜻이 불확실한 부분은 단어 뒤
`(?)` 로 표시한다."
```

### 6.1 단어 풀이(`greekWords`) 데이터

각 절의 헬라어 단어를 한 단어씩 풀이한 학습용 데이터는 **본 앱이 직접 작성한
의역**이며, 다음 컨벤션을 따른다.

- 형식: 한 단어 = `헬라어(한글 발음) — 한국어 뜻 (괄호 안 격·시제 등 보조 설명)`,
  단어 구분은 줄바꿈(`\n`).
- 발음 표기는 한국 신학계에서 통용되는 **에라스무스식 한글 표기**.
  (η=에, ω=오, υ단독=위, ου=우, αυ=아우, ευ=에우, ει=에이, οι=오이,
  θ=ㅌ, φ=ㅍ, χ=ㅋ, β=ㅂ, δ=ㄷ, γ=ㄱ, ρ=ㄹ, ψ=프스, ξ=크스,
  거친숨표 ῾=ㅎ, 부드러운숨표 ᾿=무음)
- **불확실한 단어**(드문 어형, 모호한 분사 분석, 표준 한글 표기가 갈리는 고유명사 등)
  뒤에는 `(?)` 를 붙여 추후 검수 대상으로 표시한다.

> 단어 풀이는 한 단어 한 단어의 격·시제 해석이 검수자마다 다를 수 있다.
> 발견된 오류는 `scripts/import-bible-greek-matthew.mjs` 의 `WORDS` 객체에서
> 수정한 뒤 스크립트를 다시 실행해 `matthew.json` 을 재생성한다(절 수 자동 검증 포함).

### 6.2 데이터 재생성

```bash
# 1) SBLGNT Matt 원본 다운로드
mkdir -p tmp/bible-sources
curl -sSL -o tmp/bible-sources/sblgnt-matthew.txt \
  https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/Matt.txt

# 2) 본문 비평 부호 제거 + 단어 풀이 주입
node scripts/import-bible-greek-matthew.mjs
```

스크립트는 실행마다 `matthew.json` 의 1~5장 `verses.greek`/`verses.greekWords` 만
덮어쓰고 `verses.krv`/`verses.kids` 는 절대 건드리지 않는다. 또한 각 장마다
`krv = greek = greekWords` 절 개수가 일치하는지 검증해 실패 시 비-0 종료한다.

---

## 7. "어린이" 번역에 관해

신규 추가된 61권의 `translations.kids` 자리에는 placeholder 라벨만
있고 `verses.kids = []` 빈 배열이다. 어린이 번역은 본 앱이 직접
작성·관리하는 의역본으로, 외부 데이터셋에서 받아오지 않는다.

기존 5권(잠언·마태·마가·누가·요한)의 어린이 번역은 사용자가 이미
작성해 보관 중이며, 변환 스크립트가 절대 덮어쓰지 않는다
(`EXISTING_IDS` 가드).

---

## 8. 데이터 재생성 (KRV)

원본을 다시 받아 변환하려면:

```bash
# 1) scrollmapper KorRV 원본 다운로드
mkdir -p tmp/bible-sources
curl -sSL -o tmp/bible-sources/KorRV.json \
  https://raw.githubusercontent.com/scrollmapper/bible_databases/2025-languages/sources/ko/KorRV/KorRV.json

# 2) 변환 (기존 5권은 자동 보존, KRV 자동 검증 후 61권 작성)
node scripts/import-bible-krv.mjs
```

`tmp/` 는 `.gitignore` 에 포함되어 있다 (원본 JSON 은 저장소에 커밋하지
않음).
