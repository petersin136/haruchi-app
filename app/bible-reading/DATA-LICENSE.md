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

## 6. "쉬운말" 번역에 관해

신규 추가된 61권의 `translations.kids` 자리에는 placeholder 라벨만
있고 `verses.kids = []` 빈 배열이다. 쉬운말 번역은 본 앱이 직접
작성·관리하는 의역본으로, 외부 데이터셋에서 받아오지 않는다.

기존 5권(잠언·마태·마가·누가·요한)의 쉬운말 번역은 사용자가 이미
작성해 보관 중이며, 변환 스크립트가 절대 덮어쓰지 않는다
(`EXISTING_IDS` 가드).

---

## 7. 데이터 재생성

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
