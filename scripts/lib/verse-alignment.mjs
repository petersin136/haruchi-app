// =============================================================================
// KRV ↔ WLC 절 번호 정렬 규칙.
//
// 한국어 개역한글(KRV)과 히브리 본문(WLC)은 책마다 한두 군데에서 절 분할이
// 다르게 들어간다. 우리는 히브리 학습용 매니페스트(hebrewpara) 와 v2 토큰 데이터
// 모두 WLC 번호를 기준으로 작성하므로, KRV 와 영문 본문(WEB), kids 도 같은
// WLC 번호로 재배치한 뒤에 빌드한다.
//
// 형식:
//   VERSE_ALIGNMENT[bookId] = [{ krv: { ch, n }, wlc: { ch, n } }, ...]
//   (krv 좌표에 있던 텍스트를 wlc 좌표로 옮긴다. 원래 자리는 비운다.)
// =============================================================================

export const VERSE_ALIGNMENT = {
  // 창세기:
  //   · KRV 31:55  = WLC 32:1   (라반 떠남, 야곱 송별)
  //   · KRV 32:1~32 = WLC 32:2~33
  genesis: [
    { krv: { ch: 31, n: 55 }, wlc: { ch: 32, n: 1 } },
    ...Array.from({ length: 32 }, (_, i) => ({
      krv: { ch: 32, n: i + 1 },
      wlc: { ch: 32, n: i + 2 },
    })),
  ],
  // 출애굽기:
  //   · KRV 8:1~4   = WLC 7:26~29 (재앙 단락 분절)
  //   · KRV 8:5~32  = WLC 8:1~28
  //   · KRV 22:1    = WLC 21:37  (도둑질 배상법)
  //   · KRV 22:2~31 = WLC 22:1~30
  exodus: [
    ...Array.from({ length: 4 }, (_, i) => ({
      krv: { ch: 8, n: i + 1 },
      wlc: { ch: 7, n: 26 + i },
    })),
    ...Array.from({ length: 28 }, (_, i) => ({
      krv: { ch: 8, n: i + 5 },
      wlc: { ch: 8, n: i + 1 },
    })),
    { krv: { ch: 22, n: 1 }, wlc: { ch: 21, n: 37 } },
    ...Array.from({ length: 30 }, (_, i) => ({
      krv: { ch: 22, n: i + 2 },
      wlc: { ch: 22, n: i + 1 },
    })),
  ],
};

// 단일 텍스트 레이어(예: krvByCh, kidsByCh) 를 in-place 로 재배치한다.
//   byCh: Map<chapterNo, Map<verseNo, string>>
export function applyAlignmentToMap(bookId, byCh) {
  const rules = VERSE_ALIGNMENT[bookId];
  if (!rules || rules.length === 0) return;
  const writes = [];
  for (const { krv, wlc } of rules) {
    const m = byCh.get(krv.ch);
    if (!m) continue;
    const t = m.get(krv.n);
    if (t == null) continue;
    writes.push({ krv, wlc, t });
  }
  for (const { krv } of writes) {
    byCh.get(krv.ch)?.delete(krv.n);
  }
  for (const { wlc, t } of writes) {
    if (!byCh.has(wlc.ch)) byCh.set(wlc.ch, new Map());
    byCh.get(wlc.ch).set(wlc.n, t);
  }
}

// `app/bible-reading/<id>.json` 형식의 KRV 데이터 객체를 in-place 정렬.
//   { chapters: [{ chapter, verses: { krv:[{n,t}], kids:[{n,t}]? ... } }] }
// 텍스트 키만 옮기고, 빈 챕터/배열은 자연스럽게 재구성한다.
export function alignKrvDataInPlace(bookId, krvData) {
  const rules = VERSE_ALIGNMENT[bookId];
  if (!rules || rules.length === 0) return;
  const layerNames = new Set();
  const byChByLayer = new Map(); // layer -> Map<ch, Map<n, t>>
  const ensureLayer = (layer) => {
    if (!byChByLayer.has(layer)) byChByLayer.set(layer, new Map());
    return byChByLayer.get(layer);
  };
  for (const c of krvData.chapters || []) {
    for (const layer of Object.keys(c.verses || {})) {
      layerNames.add(layer);
      const byCh = ensureLayer(layer);
      const m = new Map((c.verses[layer] || []).map((v) => [v.n, v.t]));
      byCh.set(c.chapter, m);
    }
  }
  for (const layer of layerNames) {
    applyAlignmentToMap(bookId, ensureLayer(layer));
  }
  const chapters = new Set();
  for (const byCh of byChByLayer.values()) {
    for (const ch of byCh.keys()) chapters.add(ch);
  }
  const sortedChapters = [...chapters].sort((a, b) => a - b);
  krvData.chapters = sortedChapters.map((ch) => {
    const verses = {};
    for (const layer of layerNames) {
      const m = byChByLayer.get(layer)?.get(ch);
      if (!m || m.size === 0) continue;
      verses[layer] = [...m.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([n, t]) => ({ n, t }));
    }
    return { chapter: ch, verses };
  });
}

// `.cache/web/<id>.json` 형식 — { chapters: [{ chapter, verses: [{n,t},...] }] }
export function alignWebDataInPlace(bookId, webData) {
  const rules = VERSE_ALIGNMENT[bookId];
  if (!rules || rules.length === 0) return;
  const byCh = new Map();
  for (const c of webData.chapters || []) {
    byCh.set(c.chapter, new Map((c.verses || []).map((v) => [v.n, v.t])));
  }
  applyAlignmentToMap(bookId, byCh);
  const sortedChapters = [...byCh.keys()].sort((a, b) => a - b);
  webData.chapters = sortedChapters.map((ch) => ({
    chapter: ch,
    verses: [...byCh.get(ch).entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([n, t]) => ({ n, t })),
  }));
}
