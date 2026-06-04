# 성경 공부 — 신약 27권 데이터 (LayeredBibleViewer 전용)

이 폴더는 `LayeredBibleViewer` 와 `EnglishOnlyView` 가 런타임에 fetch 로
받아오는 책 단위 학습 데이터다. 정적 import 로 webpack 번들에 끼워 넣지
않는 이유는 27권 합계가 30MB+ 라 dev/build 시 OOM 을 유발하기 때문 —
`public/` 에 두면 브라우저(+서비스 워커) 캐시가 자연스럽게 동작한다.

## 파일

`<bookId>.json` — 신약 27권. ID 는 우리 앱 표준(`app/bible-reading/books.ts`):
`matthew, mark, luke, john, acts, romans, corinthians1, corinthians2,
galatians, ephesians, philippians, colossians, thessalonians1,
thessalonians2, timothy1, timothy2, titus, philemon, hebrews, james,
peter1, peter2, john1, john2, john3, jude, revelation`.

## 스키마

```json
{
  "book": "로마서",
  "bookId": "romans",
  "layerOrder": ["english", "krv", "greek", "greekpara", "kids"],
  "layerLabels": { "english": "영어(WEB)", "krv": "개역한글", ... },
  "defaultOn": ["english", "krv"],
  "sources": { ... },
  "chapters": [
    {
      "chapter": 1,
      "verses": [
        {
          "ref": "로마서 1:1",
          "layers": {
            "english":   { "type": "text", "content": "Paul, a servant ..." },
            "krv":       { "type": "text", "content": "예수 그리스도의 종 ..." },
            "greek":     { "type": "wordblock", "text": "Παῦλος ...", "words": [...] },
            "greekpara": { "type": "text", "content": "예수 그리스도의 종 바울 ..." },
            "kids":      { "type": "text", "content": "예수 그리스도의 종 바울은 ..." }
          }
        }
      ]
    }
  ]
}
```

빈 절(예: WEB 이 다른 절과 묶음 처리한 케이스, KRV 가 textual variant로
비워둔 절)은 그 layer 만 빠진 채로 출력. UI 토글이 그 자리만 자연스럽게
스킵한다.

## 다시 빌드하기

원본이 바뀌었을 때(개역한글, 헬라 의역 greekKr, 어린이 의역 kids,
헬라어 wordblock v2) 다시 만들려면:

```bash
# 1) WEB 영어 본문 캐시 (이미 있으면 스킵)
node scripts/fetch-web-english.mjs

# 2) 헬라어 wordblock v2 빌드 (어휘집 변경 시)
node scripts/build-gospel-v2.mjs

# 3) 학습 데이터 27권 통합 빌드
node scripts/build-bible-study.mjs
```

각 단계는 idempotent. 특정 책만 다시 만들려면 `--only=romans,hebrews` 같이.

## 라이선스

- **English (WEB)** — World English Bible, 퍼블릭 도메인. TehShrike/world-english-bible.
- **개역한글** — 대한성서공회 1961, 저작재산권 보호기간 50년 경과로 공공저작물.
- **헬라어** — SBLGNT © Society of Biblical Literature, CC BY 4.0 · 형태소 분석 MorphGNT (CC BY-SA 4.0).
- **헬라 의역 / 어린이 의역** — 본 앱이 직접 작성한 학습용 2차 저작물.
