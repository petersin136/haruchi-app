/**
 * 소제목 새 규칙 점검
 * - 절 앞부분/일부를 6자 이상 그대로 자른 것 금지 (완결 인용 예외)
 * - 조사·어미 중간에서 끊긴 제목 금지
 */

const QUOTE_FINALS = [
  "나이까",
  "니까",
  "까",
  "소서",
  "하라",
  "말라",
  "리라",
  "리니라",
  "니라",
  "도다",
  "로다",
  "이라", // 금지 문체와 별개 — 인용 종결 감지용; 문체 검사에서 다시 걸림
  "이니라",
  "이니이다",
  "이니",
  "이다",
  "노라",
  "느니라",
  "다",
  "라",
  "요",
  "며",
  "심",
  "함",
];

function compact(s) {
  return String(s).replace(/\s+/g, "");
}

function endsWithQuoteFinal(title) {
  const t = String(title).trim();
  return QUOTE_FINALS.some((e) => t.endsWith(e));
}

/** 제목이 절 본문에 연속 6자 이상 그대로 있는가 */
export function findContiguousHit(title, verseTexts) {
  const t = compact(title);
  if (t.length < 6) return null;
  for (const vt of verseTexts) {
    const body = compact(vt);
    const idx = body.indexOf(t);
    if (idx >= 0) return { verse: vt, index: idx, compactTitle: t };
  }
  return null;
}

/**
 * 완결 구절 인용 예외: 말이 끝나는 곳에서 끊김
 * - 인용 종결형으로 끝나거나
 * - 본문에서 제목 직후가 절 끝/문장부호/조사만 남고 의미 단위가 닫힘
 */
export function isCompleteQuote(title, verseTexts) {
  const hit = findContiguousHit(title, verseTexts);
  if (!hit) return false;
  if (!endsWithQuoteFinal(title) && !/(심|함|들|자|것|일|말|길|집|산|땅|물|불|빛|복|언약|제사|성전|십자가)$/.test(title.trim())) {
    // 명사구 완결도 일부 허용: 제목이 절의 '앞머리 dump'가 아닐 것
  }
  const vt = hit.verse;
  const raw = String(vt);
  // 공백 유지 매칭 시도
  let pos = raw.indexOf(title);
  if (pos < 0) {
    // compact 매칭 → 대략적 종결만 확인
    if (endsWithQuoteFinal(title)) return true;
    // 절 앞머리 dump면 완결 인용으로 보지 않음
    if (compact(raw).startsWith(hit.compactTitle)) return false;
    // 중간의 짧은 완결 명사구(예: 화평이 아니요 검)
    return endsWithQuoteFinal(title) || /[^가-힣]?$/.test(title);
  }
  const after = raw.slice(pos + title.length);
  // 직후가 조사만 더 붙고 끊기거나, 문장부호/종결
  if (/^\s*$/.test(after)) return true;
  if (/^[을를이가는는의미와과도만]\s*/.test(after) && endsWithQuoteFinal(title.replace(/[을를이가는는의미와과도만]$/, ""))) {
    return true;
  }
  // 조사 하나 붙은 채 본문은 더 있음: 「검」+「을 주러」→ 명사 완결로 허용
  if (/^[을를이가는는의미와과도만]/.test(after) && !compact(raw).startsWith(hit.compactTitle)) {
    return true;
  }
  if (endsWithQuoteFinal(title) && !compact(raw).startsWith(hit.compactTitle)) {
    return true;
  }
  // 절 첫머리에서 잘린 것은 인용 예외 아님
  if (compact(raw).startsWith(hit.compactTitle)) {
    return endsWithQuoteFinal(title) && /^(?:\s|[\,，。]|$)/.test(after);
  }
  return endsWithQuoteFinal(title);
}

/** 조사·어미 중간 절단 (절 앞머리 dump에서 단어 도중 끊김) */
export function isMidParticleCut(title, verseTexts) {
  const t = String(title).trim();
  for (const vt of verseTexts) {
    const raw = String(vt).trim();
    // 제목이 절 시작(또는 공백 무시 시작)과 같으면
    if (raw.startsWith(t)) {
      const after = raw.slice(t.length);
      if (!after) return false;
      // 공백 없이 한글이 이어지면 단어 중간 절단
      if (/^[가-힣]/.test(after)) return true;
      // 「미디안 제」+「사장」처럼 공백 뒤 한 글자만 제목에 들어온 경우: 제목 끝 토큰 1글자 + 본문 연속
      const m = t.match(/([가-힣]+)$/);
      if (m && m[1].length === 1 && /^[가-힣]/.test(after.trim())) return true;
    }
    const ct = compact(t);
    const cv = compact(raw);
    if (cv.startsWith(ct) && cv.length > ct.length) {
      // 잘린 다음 글자가 한글이면 절단 가능 — 종결형으로 끝나는 완결 인용은 제외
      if (!endsWithQuoteFinal(t)) return true;
    }
  }
  return false;
}

/** ~이라 종결 금지(문체) */
export function endsWithIra(title) {
  return /이라\s*$/.test(String(title).trim());
}

/**
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function checkHeadingTitle(title, verseTexts) {
  const reasons = [];
  const t = String(title ?? "").trim();
  const chars = [...t];
  if (chars.length < 4 || chars.length > 14) reasons.push("길이");
  if (endsWithIra(t)) reasons.push("이라종결");

  const hit = findContiguousHit(t, verseTexts);
  if (hit) {
    if (!isCompleteQuote(t, verseTexts)) reasons.push("본문절단인용");
  }
  if (isMidParticleCut(t, verseTexts)) reasons.push("어미중간절단");

  // 명백한 잘림 꼬리: 공백+1글자
  if (/\s[가-힣]$/.test(t)) reasons.push("어미중간절단");

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function sectionVerseTexts(krvMap, start, end) {
  const out = [];
  for (let n = start; n <= end; n++) {
    if (krvMap.has(n)) out.push(krvMap.get(n));
  }
  return out;
}
