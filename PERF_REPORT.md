# 성능 작업 보고

브랜치: `perf-improve`  
기준: `main` (`a03fae18`) 은 그대로 두었다. push 하지 않았다.

## 단계별 결과

| 단계 | 결과 | 커밋 |
|---|---|---|
| 1단계. JSON 공백 제거, Supabase를 처음 쓸 때 불러오기, Noto Sans KR 300 제거, 안 쓰는 `romans1.json` 삭제, `dev:webpack` 유지 | 완료. 이 커밋만 떼어 `npm run build` 하면 **실패**한다. 이유는 아래 보류 항목. | `433d20ac` perf: 1단계 JSON 압축, Supabase 지연 로드, 폰트 |
| 2단계. 개역한글/어린이/원어 의역을 장 파일로, 헬라어·히브리어 보기도 해당 장만 | 완료. `npm run build` 성공. | `2d88a3fe` perf: 2단계 개역한글·원어 장 단위 분리 |
| `page.tsx` 를 여러 컴포넌트로 나누기 | 하지 않음. 요청대로 보류. | — |
| Turbopack (`next dev --turbo`) | 실패해서 `dev` 는 webpack 으로 되돌림. | `package.json` 의 `dev` / `dev:webpack` 둘 다 `NODE_OPTIONS=--max-old-space-size=12288 next dev` |

`page.tsx` 한 파일에 1단계(빈 배열 상수, `useMemo`, 검색/학생 바 동적 로드), 2단계(장 단위 fetch), KJV 읽기 모드가 같이 들어 있다. 파일을 쪼개지 말라는 요청 때문에 이 변경은 2단계 커밋에 함께 넣었다. KJV 데이터와 `englishSpeech.ts` 도 그 커밋에 있다. 빼면 빌드가 깨진다.

2단계 빌드 결과에서 `/bible-reading` 라우트는 56 kB, First Load JS 147 kB 이다.

## 받는 파일 크기

이전은 그 화면이 받던 책 전체 파일이다. 이후는 그 장 파일이다. 헬라어·히브리어 화면은 아래 장 파일과 함께 작은 `korean.json` 도 받는다. 책 전체는 받지 않는다.

| 화면 | 이전 | 이후 | 줄어든 비율 |
|---|---:|---:|---:|
| 요한복음 3장 개역한글 | 2.31 MB | 15.7 KB | 99.3% |
| 요한복음 3장 헬라어 | 4.99 MB | 220.1 KB | 95.7% |
| 누가복음 1장 개역한글 | 2.90 MB | 30.5 KB | 99.0% |
| 누가복음 1장 헬라어 | 6.36 MB | 397.8 KB | 93.9% |
| 시편 119편 개역한글 | 632.8 KB | 39.4 KB | 93.8% |
| 시편 119편 히브리어 | 7.47 MB | 429.8 KB | 94.4% |
| 예레미야 1장 개역한글 | 539.9 KB | 7.0 KB | 98.7% |
| 예레미야 1장 히브리어 | 7.97 MB | 100.5 KB | 98.8% |

요한복음·누가복음은 히브리어 파일이 없고, 시편·예레미야는 헬라어 파일이 없다.

변환 스크립트 `scripts/split-chapter-files.mjs` 검증:

- 개역한글: 66권, 1,189장, 31,104절. 장마다 원본 `bible-data` 와 절 수가 같다.
- 헬라어·히브리어 v2: 66권, 1,189장, 31,140절. 장마다 원본 `-v2.json` 과 같다. 절 수가 개역한글보다 많은 것은 원본 v2 가 그렇다.
- 불일치 0건.
- `greekTokens` 는 `korean.json` 에 넣지 않았다. 헬라어 모드의 음성·마이크가 쓰는 의역 문장(`greekKr`)만 넣었다. 빼면 헬라어 보기가 개역한글로 돌아간다.
- 공부 모드 `krv.json` 은 덮어쓰지 않았다. 출애굽기 8장은 개역한글 32절, 공부용 파일은 28절이다.

원본 `public/bible-data/*.json`, `public/bible-v2/*-v2.json` 은 삭제하지 않았다. 검색은 여전히 `bible-data` 책 전체를 받는다.

## 첫 컴파일 시간

| | 시간 | 비고 |
|---|---:|---|
| 변경 전, webpack 첫 `/` | 약 7.8초 | 이전 분석의 `.next/trace`. `compile-path` 7.8초, 요청 처리 8.0초 |
| Turbopack Ready | 0.8초 | 서버는 뜸 |
| Turbopack `/` | 3.7초 | 200 |
| Turbopack `/bible-reading` | 1.3초 | **500.** `@supabase/supabase-js` 가 선택 의존성 `@opentelemetry/api` 를 찾다 실패. webpack 은 그 import 를 무시한다 |
| 변경 후, dev Ready | 1.7초 | `npm run dev` |
| 변경 후, `/` 컴파일 | 645ms | 481 modules. 응답은 307 |
| 변경 후, `/bible-reading` 컴파일 | 733ms | 620 modules. 응답 200, 요청 전체 854ms |
| 변경 후, `npm run build` | 약 18초, 재실행 약 10초 | 타입 검사 포함, 67페이지. 성공 |

변경 후 dev 시간은 직전에 production build 가 `.next` 를 만든 상태에서 잰 것이다. 캐시가 빈 첫 실행과는 같지 않다. 그래도 `/bible-reading` 이 620 modules 에서 733ms 에 컴파일됐다.

## 화면에서 확인할 것

개발 서버는 `http://localhost:3000` 에 다시 켜 두었다.

- 요한복음 3장 개역한글. 1절은 "바리새인 중에 니고데모…", 16절은 "하나님이 세상을 이처럼 사랑하사…". 카운터 `0 / 36 절`. 네트워크에는 `chunks/john/3/korean.json` 만 있고 `bible-data/john.json` 은 없다.
- 같은 장에서 헬라어 보기. `bible-v2/chapters/john/3.json`. 단어 블록이 보이고 책 전체 `john-v2.json` 은 없다.
- 누가복음 1장 개역한글. 1절 "우리 중에 이루어진 사실에 대하여", `0 / 80 절`.
- 시편 119편 개역한글. 1절 "행위 완전하여…", `0 / 176 절`. 히브리어 보기는 `chapters/psalms/119.json`.
- 예레미야 1장 히브리어. `chapters/jeremiah/1.json`. 개역한글은 `chunks/jeremiah/1/korean.json`.
- 출애굽기 8장 개역한글이 32절인지. 1절이 "너는 바로에게 가서" 로 시작하는지. 28절이면 공부용 파일과 섞인 것이다.
- 영어(WEB), 영어(KJV). 요한복음 3:16 KJV 는 "For God so loved the world…". 재생 속도와 마이크 언어가 영어인지.
- 개역한글에서 마이크 카운터와 "다 읽었어요". 저장 키는 예전과 같이 `bible_done_<책>_<장>`, `bible_verse_progress_<책>_<장>` 이다.
- 검색을 열면 `bible-data/<책>.json` 66개를 받는지. 검색 결과 문장이 이전과 같은지.
- 학생 선택, 로그인, 진도 서버 저장. 이 작업 환경에는 `.env.local` 이 없어 로그인 화면은 "Supabase 연결이 필요해요" 에서 멈춘다. 환경 변수가 있는 곳에서 교회 선택과 저장까지 눌러 봐야 한다.
- 장 목록과 장 제목이 그대로 보이는지. 제목은 `korean-index.json` 에서 온다.

## 실패하거나 보류한 것

- **Turbopack.** `/bible-reading` 이 500 이어서 `dev` 를 원래 webpack 명령으로 되돌렸다. `dev:webpack` 도 같은 명령이다. 12GB 메모리 옵션도 그대로다.
- **1단계 커밋만 빌드.** `page.tsx:19` 의 `BibleData` import 충돌(TS2440)로 실패한다. 이 오류는 `main` 의 `page.tsx` 에 원래 있었고, 1단계 diff 는 그 파일을 건드리지 않았다. 그래서 1단계 커밋은 되돌리지 않았다. 2단계 커밋의 `page.tsx` 가 그 import 를 없애서, 두 커밋을 합친 빌드는 통과한다.
- **`page.tsx` 분리.** 요청대로 하지 않았다. 상태 하나가 바뀌어도 큰 컴포넌트 전체가 다시 그려지는 구조는 남아 있다.
- **공부 모드 청크를 읽기 화면에 재사용.** 구약 일부 장 번호가 달라서 하지 않았다. 읽기용 파일 이름은 `korean.json` 이다.
- **헬라어 의역 문장을 `korean.json` 에 포함.** 토큰은 뺐다. 문장까지 빼면 마이크가 읽는 본문이 바뀐다.
- **Nanum Pen Script 폰트 경고.** 빌드 중 "Failed to find font override values" 가 두 번 나온다. 빌드는 성공한다. 이번 작업에서 그 폰트 설정은 바꾸지 않았다.
