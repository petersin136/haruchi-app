# 헬라어 보기 v2 — 인수인계서

> 신약 27권에 **단어 블록(3줄) UI**(`GreekChapterV2`)와 100% 어휘 커버
> 데이터(`*-v2.json`)를 채워 넣는 작업의 인수인계 문서.
> 새 에이전트는 이 문서만 보고 이어서 같은 패턴으로 책을 추가할 수 있다.

---

## 1. 큰 그림

- **앱**: Next.js 14 + Supabase. 경로 `app/bible-reading/`.
- **무엇을 만드는가**:
  헬라어 모드(`?t=greek`)에서 절마다 헬라어 / 발음 / 뜻이 한 단어씩 3줄로
  쌓이는 **새 UI** (`GreekChapterV2`)와 그 UI 가 읽을 책별 **사전화된
  JSON**(`<book>-v2.json`)을 책 단위로 만든다.
- **현재 진행도** (이 문서 작성 시점, 2026-06-05):
  - **완료 14권** — 마태 · 마가 · 누가 · 요한 · 사도행전 · 로마 ·
    고린도전 · 고린도후 · 갈라디아 · 에베소 · 빌립보 · 골로새 ·
    데살로니가전 · 데살로니가후
  - **남은 13권** — 디모데전 · 디모데후 · 디도 · 빌레몬 · 히브리 ·
    야고보 · 베드로전 · 베드로후 · 요한1 · 요한2 · 요한3 · 유다 · 계시
  - 남은 13권은 모두 `greekKr`(한글 의역) 100% 완료 + SBLGNT 캐시 존재
    상태이므로, **빌더에 책 ID만 추가 → 누락 lemma 보강 → 컴포넌트
    1줄씩 추가** 흐름으로 바로 진행 가능.

---

## 2. 핵심 파일 지도

```
app/bible-reading/
  page.tsx                          # 헬라어 v2 책 라우팅 분기 2곳
  components/GreekChapterV2.tsx     # 단어 블록 3줄 UI + dynamic import
  matthew.json … revelation.json    # 원문 + greekKr 한글 의역
  matthew-v2.json … (각 책)         # 빌더 산출물 (UI 가 직접 읽음)

scripts/
  build-gospel-v2.mjs               # 메인 빌더 (책 추가 = BOOKS 배열 1줄)
  dump-gospel-missing.mjs           # 등록된 책들의 누락 lemma 통합 리포트
  lib/gospel-lexicon.mjs            # 통합 어휘집 (이름은 gospel 이지만 신약 전체)
  lib/greek-pron.mjs                # 헬라어 → 한글 발음
  lib/morph-parse.mjs               # MorphGNT parse code → 한국어 라벨

.cache/
  sblgnt-<book>.txt                 # MorphGNT/SBLGNT 입력 (이미 모두 존재)
  nt-missing.json                   # dump-gospel-missing 산출물
  nt-missing-<N>.tsv                # 빈도 N 인 누락 lemma 목록 (선택적)
```

**JSON 스키마 (`<book>-v2.json`)** — `GreekChapterV2` 가 의존하는 형상.
변경 시 컴포넌트도 같이 수정해야 함.

```ts
{
  meta: { book, sources: { sblgnt, morphgnt, kr } },
  chapters: [{
    chapter: number,
    verses: [{
      n: number,                    // 절 번호
      copyGreek: string,            // 절 헬라어 원문 (복사용)
      copyKr:    string,            // 절 한글 의역 (복사용)
      tokens: [{
        w, p, gloss,                // 표시되는 3줄 (헬라어/발음/뜻)
        lemma, lemmaP, pos, posLabel,
        parse, parseLabel, parseLabelLong,
        meanings: string[],
        nameType: "person" | "place" | null,
        note: string,
      }]
    }]
  }]
}
```

---

## 3. 책 한 권 추가 — 표준 절차

작업 디렉토리는 항상 레포 루트 `/Users/jibmaeg/Church Solutions/haruchi-app`.

### 3.1 사전 체크 (책 ID 와 입력 데이터)

신약 책 ID 는 파일명과 동일:
`timothy1 timothy2 titus philemon hebrews james peter1 peter2 john1 john2 john3 jude revelation`.

```bash
# 한 번에 13권 상태 확인
for b in timothy1 timothy2 titus philemon hebrews james peter1 peter2 \
         john1 john2 john3 jude revelation; do
  printf "%-12s " "$b"
  node -e "const fs=require('fs');const p='app/bible-reading/$b.json';
const d=JSON.parse(fs.readFileSync(p,'utf8'));
let t=0,f=0;for(const c of (d.chapters||[])) for(const v of (c.verses?.greekKr||[])){t++;if((v.t||'').trim())f++};
const sb='.cache/sblgnt-$b.txt';
console.log((d.chapters?.length||0)+'장','greekKr',t?(f/t*100).toFixed(1)+'%':'no','('+f+'/'+t+')','sblgnt:'+(fs.existsSync(sb)?'OK':'MISSING'));"
done
```

`greekKr` 비율이 100% 가 아니면 먼저 의역을 채워야 한다 — 본 문서 범위
밖이지만, 그 책의 `<book>.json` 의 `verses.greekKr[].t` 가 빈 절이 있다는
뜻이므로, 보통 이전 채팅(인수인계 prev) 에서 사용한 한글 의역 작성
방식대로 자연스러운 문장으로 채운다.

### 3.2 BOOKS 에 추가

`scripts/build-gospel-v2.mjs` 의 `BOOKS` 배열에 한 줄씩 추가.
순서는 의미 없으나, 신약 순서대로 적어 두면 로그가 읽기 편하다.

```js
// 예: 디모데전·후서 ~ 빌레몬을 추가
const BOOKS = [
  { id: "matthew", label: "마태복음" },
  // ... 기존 14권 ...
  { id: "thessalonians2", label: "데살로니가후서" },
  { id: "timothy1", label: "디모데전서" },
  { id: "timothy2", label: "디모데후서" },
  { id: "titus",    label: "디도서" },
  { id: "philemon", label: "빌레몬서" },
];
```

`scripts/dump-gospel-missing.mjs` 의 `NT_BOOKS` 도 같이 동기화.

### 3.3 초기 빌드 (누락 lemma 파악)

```bash
node scripts/build-gospel-v2.mjs > /tmp/build.log 2>&1; tail -50 /tmp/build.log
```

각 책별 커버리지 + 통합 누락 lemma 상위 30개 가 출력된다. 신규 추가
책의 커버리지가 보통 85~97% 사이로 나옴.

### 3.4 누락 lemma 빈도순 보강

```bash
node scripts/dump-gospel-missing.mjs > .cache/nt-missing.json
# 빈도 분포 보기
node -e "const a=JSON.parse(require('fs').readFileSync('.cache/nt-missing.json','utf8'));
const b={};a.items.forEach(x=>{const k=x.count>=4?'4+':x.count>=3?'3':x.count>=2?'2':'1';b[k]=(b[k]||0)+1});
console.log(b,'total',a.total);"
# 빈도 N 짜리만 추출 (예: 1)
node -e "const a=JSON.parse(require('fs').readFileSync('.cache/nt-missing.json','utf8'));
console.log(a.items.filter(x=>x.count===1).map(x=>x.count+'\t'+x.lemma+'\t'+x.posLabel).join('\n'));" \
  > .cache/nt-missing-1.tsv
cat .cache/nt-missing-1.tsv
```

`scripts/lib/gospel-lexicon.mjs` 의 GOSPEL_EXTRA 객체 맨 아래에 새
구역(`// ── 디모데·디도·빌레몬 누락 보강 ─`)을 만들고 **소문자 lemma 키**로
하나씩 추가. 어휘집 lookup 은 빌더에서 case/diacritic-insensitive 라
대소문자는 신경쓰지 말고 `JSON.parse(fs.readFileSync(...))` 에 찍힌
정규형(`x.lemma`)을 **그대로 lowercase 해서** 키로 쓰면 된다.

**작성 규칙**
- 명사: `{ gloss: "짧은뜻", meanings: ["뜻1", "뜻2"] }`
- 인명: `person("바울")` / `person("바울", "선택적 메모")`
- 지명: `place("로마")`
- 형용사/부사/동사도 동일한 `{ gloss, meanings }` 구조
- `nameType: "person"` 을 직접 붙여야 하는 경우 (예: 민족명) 가 있으니
  필요시 `{ gloss, meanings, nameType: "person" }` 형태로.

작업 효율: **빈도가 높은 lemma 부터(≥4 → 3 → 2 → 1) 한 단계씩**.
한 단계 추가 후 빌드 → 다시 dump → 다음 빈도 진행. 마지막 빈도 1 단계가
가장 길지만 한 번에 처리해도 안전.

### 3.5 빌드 → 100% 확인

```bash
node scripts/build-gospel-v2.mjs > /tmp/build.log 2>&1; tail -30 /tmp/build.log
```

모든 책이 `커버리지 100.0% (누락 lemma 0종 / 0 토큰)` 으로 끝나야 다음
단계로 넘어간다.

### 3.6 컴포넌트 추가

`app/bible-reading/components/GreekChapterV2.tsx` 의 두 곳을 수정.

(1) `GospelId` 유니온에 책 ID 추가.
(2) `loadGospelData()` switch 에 동적 import case 추가.

```ts
case "timothy1":
  return (await import("../timothy1-v2.json")).default as V2Data;
```

이렇게만 하면 Next.js 가 책별로 chunk 를 자동 분리한다 (정적 import
지만 lazy 로드된 컴포넌트 안이므로 사실상 dynamic).

### 3.7 페이지 라우팅

`app/bible-reading/page.tsx` 에서 헬라어 v2 가 분기되는 위치를 찾는다
(주석: "4복음서·사도행전·로마·고전·고후 + 헬라어 모드일 때 새 …").
그 분기 조건 안의 OR 체인과 fallback(부정 조건)의 OR 체인에 책 ID 두 곳을
각각 똑같이 추가. `bookId={bookId as ...}` 의 union 타입도 같이 확장.

### 3.8 검증

```bash
# 1) lint/타입 검사
npx tsc --noEmit                 # 0건이어야 정상

# 2) dev 서버 (이미 백그라운드로 돌아가고 있을 가능성 큼: terminals/47.txt 확인)
#    안 돌고 있으면: npm run dev

# 3) 새 책 1장 요청
for p in timothy1 timothy2 titus philemon; do
  echo -n "$p: "
  curl -s -o /dev/null -w "%{http_code}\n" \
    "http://localhost:3000/bible-reading?book=$p&chapter=1&t=greek" --max-time 90
done
# 전부 200 이면 OK.
```

또한 ReadLints 로 `app/bible-reading/{page.tsx,components/GreekChapterV2.tsx}`
가 깨끗한지 본다.

---

## 4. 작업 패턴 — 한 번에 몇 권씩?

- **4~6권 묶음 권장**. 한 번의 보강 cycle 로 100% 까지 빠르게 도달 가능.
- 누락 lemma 가 책당 평균 30~100 개씩 나오므로, 6권 묶음이면 한 번의 lex
  보강에 200~400 lemma 작성. 무리하지 말고 한 단계(빈도≥4 → 3 → …)씩
  진행하면 실수 없이 100% 까지 갈 수 있다.
- 묶음 후 컴포넌트/페이지 수정은 책당 한 줄(GospelId) + switch case 한
  줄 + page.tsx 조건 두 줄로 매우 가볍다.

추천 다음 묶음 (남은 13권):
1. **목회서신 + 빌레몬 (4권)** — `timothy1 timothy2 titus philemon`
2. **히브리·일반서신 1차 (4권)** — `hebrews james peter1 peter2`
3. **요한서신·유다 (4권)** — `john1 john2 john3 jude`
4. **계시록 단독 (1권)** — `revelation` (22장 분량)

위 순서로 가면 신약 27권을 4번의 묶음으로 완료.

---

## 5. 어휘집 작성 시 주의

- 키는 **항상 소문자**. 빌더의 `lookupLex` 가 exact → lowercase →
  no-diacritic 순으로 매칭한다.
- 인명/지명은 `nameType` 이 자동으로 붙도록 `person()/place()` 헬퍼를
  쓰면 UI 가 살짝 다른 색으로 표시한다.
- 헬퍼 정의 위치: `scripts/lib/gospel-lexicon.mjs` 상단 (`function
  person(...)`, `function place(...)`).
- 같은 lemma 가 이미 어휘집에 있는데 신약 다른 책에서 의미가 살짝
  다를 때는 **추가하지 말고 그대로 두기**. 어색하면 `meanings` 배열에 두
  가지를 같이 넣어도 OK (예: `meanings: ["기쁨", "환희"]`).
- 어휘집 한 곳에서만 관리하므로 책별 lexicon 분리할 필요 없음.

---

## 6. UI 동작 (이미 구현됨, 참고용)

- 절마다 한 줄(헬라어 의역 한국말) → 펼치면 한 단어씩 3줄 블록 표시.
- 블록 클릭 = 상세 팝오버 (lemma · 품사 · 파싱 · 모든 의미 · 메모).
- 길게 누름(500ms) = 복사 시트 (헬라어만 / 한글만 / 둘 다 ×
  단어/절/장 단위).
- 의역 토글: 절 단위 또는 장 전체.
- 책 데이터는 chunk 분리되어 초진입 시 그 책만 다운로드.

새 책 추가 시 UI 로직 자체는 손댈 필요 없다.

---

## 7. 새 채팅 첫 메시지에서 할 일

1. 이 문서 (`HANDOFF-greek-v2.md`) 와 핵심 파일들을 읽는다.
   - `scripts/build-gospel-v2.mjs` (특히 `BOOKS`)
   - `scripts/lib/gospel-lexicon.mjs` (어휘집 패턴 파악)
   - `app/bible-reading/components/GreekChapterV2.tsx` 의 `GospelId` 와
     `loadGospelData()` 부분
   - `app/bible-reading/page.tsx` 의 헬라어 v2 분기 부분 (현재 14권
     OR 체인)
2. 위 §4 추천 다음 묶음 중 첫 번째 (목회서신 + 빌레몬 4권) 진행.
3. §3 의 표준 절차를 그대로 적용.

검증 끝나면 같은 패턴으로 다음 묶음(히브리·일반서신…) 으로 넘어가서
신약 27권 전체 100% 달성.

---

## 부록 A. 백그라운드 서버 확인

```bash
# 활성 터미널 메타데이터
head -n 5 /Users/jibmaeg/.cursor/projects/Users-jibmaeg-Church-Solutions-haruchi-app/terminals/47.txt
# 서버가 죽었으면
npm run dev
```

dev 서버는 보통 `http://localhost:3000` 에서 돌아간다. 페이지 URL
형식: `?book=<id>&chapter=<n>&t=greek`.

## 부록 B. 흔한 실패와 대응

- **`Cannot find module '../timothy1-v2.json'`**
  → `node scripts/build-gospel-v2.mjs` 가 그 책을 만들지 못한 것.
  `BOOKS` 에 들어갔는지, `.cache/sblgnt-<id>.txt` 가 있는지 확인.
- **TS error `Type '"timothy1"' is not assignable to ...`**
  → `GospelId` union 에 책 ID 누락. 컴포넌트 두 군데(타입+switch)와
  page.tsx 캐스팅 union 까지 모두 동기화.
- **빌드는 됐는데 UI 가 "이 장의 헬라어 자료가 아직 없어요" 표시**
  → page.tsx 의 헬라어 v2 분기 OR 체인에 책 ID 가 빠짐.
- **누락 lemma 가 계속 1~2개 남음**
  → 보통 어휘집에서 키 오타. dump 로 다시 lemma 글자를 복사해서 키로
  쓰면 해결.
- **`γάζα` 등 동음이의어**
  → 어휘집은 lowercase 키 1개만 살아남는다. 더 자주 쓰이는 의미를
  남기고, 그 책의 다른 의미는 `meanings` 배열에 함께 넣어 두면 상세
  팝오버에서 둘 다 보인다.

끝.
