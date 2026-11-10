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

const PARTICLE_START = /^[은는이가을를의미와과도만께도아여요시]/;

/** 조사·어미 중간 절단 (절 앞머리 dump에서 단어 도중 끊김) */
export function isMidParticleCut(title, verseTexts) {
  const t = String(title).trim();
  for (const vt of verseTexts) {
    const raw = String(vt).trim();
    // 공백 유지 prefix
    if (raw.startsWith(t)) {
      const after = raw.slice(t.length);
      if (!after) continue;
      if (/^\s/.test(after)) continue;
      if (PARTICLE_START.test(after)) continue;
      if (/^[\,，。\.\!\?；;:]/.test(after)) continue;
      if (/^[가-힣]/.test(after)) return true;
    }
    // 공백 무시 + 절 앞머리: 「미디안제」↔「미디안 제사장」
    const ct = compact(t);
    const cv = compact(raw);
    if (
      ct.length >= 6 &&
      cv.startsWith(ct) &&
      cv.length > ct.length &&
      raw.replace(/\s+/g, " ").startsWith(t.split(/\s+/)[0])
    ) {
      const afterC = cv.slice(ct.length);
      if (PARTICLE_START.test(afterC)) continue;
      const last = (t.match(/[가-힣]+/g) || []).at(-1) || "";
      if (last.length === 1 && /^[가-힣]/.test(afterC) && !PARTICLE_START.test(afterC)) {
        return true;
      }
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

  // 절 앞머리를 의미 없이 자른 dump만 실패.
  // 말이 끝나는 곳(조사·어미 앞)에서 끊은 완결 인용은 허용.
  const openingDump = verseTexts.some((vt) => {
    const raw = String(vt).trim();
    const body = compact(raw);
    const titleC = compact(t);
    if (titleC.length < 6) return false;
    if (!body.startsWith(titleC)) return false;
    if (body.length === titleC.length) return false;
    if (isCompleteQuote(t, [vt])) return false;
    // 원문에서 제목 직후가 조사·어미면 완결 인용
    if (raw.startsWith(t)) {
      const after = raw.slice(t.length);
      if (PARTICLE_START.test(after) || /^\s/.test(after)) return false;
    } else {
      const afterC = body.slice(titleC.length);
      if (PARTICLE_START.test(afterC)) return false;
    }
    // 직후가 한글 어간 연결이면 잘린 dump
    return true;
  });
  if (openingDump) reasons.push("본문절단인용");
  if (isMidParticleCut(t, verseTexts)) reasons.push("어미중간절단");

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function sectionVerseTexts(krvMap, start, end) {
  const out = [];
  for (let n = start; n <= end; n++) {
    if (krvMap.has(n)) out.push(krvMap.get(n));
  }
  return out;
}
