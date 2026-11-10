/**
 * BSB 영어 \s1 → 한국어 소제목
 */
import {
  normEn,
  translateBsbHeading,
  rememberExact,
} from "./lib-bsb-title-ko.mjs";

export { normEn, translateBsbHeading, rememberExact };

export function titleFromBsbEnglish(en) {
  return translateBsbHeading(en);
}

/** 호환: 옛 MAP 스냅샷 쓰지 않음 */
export function rememberTitle(en, ko) {
  rememberExact(en, ko);
}

export function allMappedTitles() {
  return {};
}
