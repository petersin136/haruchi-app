/**
 * 히브리 lexicon H*.json 동기화.
 * - 에이전트4: defKo·etymKo·usageKo·noteSrc·nameMeaning (krvKo·krvForms 절대 미기입)
 * - 에이전트3: krvKo·krvForms 만 (defKo 등 절대 미기입)
 * - 쓰기 직전 파일을 다시 읽고, 자기 필드만 패치
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LEX_DIR = path.join(__dirname, "../../public/word-study/lexicon/hebrew");

/** 에이전트4가 갱신하는 필드만 */
export const AGENT4_LEX_FIELDS = [
  "defKo",
  "etymKo",
  "usageKo",
  "noteSrc",
  "nameMeaning",
];

/** 에이전트3이 갱신하는 필드만 */
export const AGENT3_LEX_FIELDS = ["krvKo", "krvForms"];

/**
 * @param {string} id e.g. H4782
 * @param {{ defKo?: string, etymKo?: string, usageKo?: string, noteSrc?: string, nameMeaning?: string }} note
 * @param {{ lexDir?: string }} [opts]
 */
export function syncHebrewLexiconEntry(id, note, opts = {}) {
  const lexDir = opts.lexDir || DEFAULT_LEX_DIR;
  const p = path.join(lexDir, `${id}.json`);
  if (!fs.existsSync(p)) return false;

  // 쓰기 직전 재읽기 — 에이전트3이 갱신한 krvKo·krvForms 보존
  const j = JSON.parse(fs.readFileSync(p, "utf8"));

  j.defKo = note?.defKo || "";
  j.etymKo = note?.etymKo ?? "";
  j.usageKo = note?.usageKo ?? j.usageKo ?? "";
  j.noteSrc = note?.noteSrc || j.noteSrc || "";
  j.nameMeaning = note?.nameMeaning || "";
  // krvKo / krvForms: 절대 할당하지 않음

  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  return true;
}

/**
 * 에이전트3: krvKo·krvForms만 갱신. defKo 등 에이전트4 필드는 건드리지 않음.
 * @param {string} id
 * @param {{ krvKo?: string[], krvForms?: string[] }} patch
 * @param {{ lexDir?: string, onlyIfEmpty?: boolean }} [opts]
 * @returns {'wrote'|'skipped-nonempty'|'missing'|false}
 */
export function syncHebrewKrvKo(id, patch, opts = {}) {
  const lexDir = opts.lexDir || DEFAULT_LEX_DIR;
  const p = path.join(lexDir, `${id}.json`);
  if (!fs.existsSync(p)) return "missing";

  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const cur = Array.isArray(j.krvKo) ? j.krvKo : [];
  if (opts.onlyIfEmpty && cur.length) return "skipped-nonempty";

  j.krvKo = Array.isArray(patch?.krvKo) ? [...patch.krvKo] : [];
  if (Array.isArray(patch?.krvForms) && patch.krvForms.length) {
    j.krvForms = [...patch.krvForms];
  } else {
    delete j.krvForms;
  }

  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  return "wrote";
}
