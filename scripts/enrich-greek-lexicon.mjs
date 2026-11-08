#!/usr/bin/env node
/**
 * data/keyword-notes/greek.json → public/word-study/lexicon/greek/*.json 병합.
 * etym / nameMeaning / defKo / compareKo(usageKo) / phrase glossKo·noteKo.
 * 전체 MorphGNT 재스캔 없이 기존 lexicon 파일을 패치한다.
 * 설치·커밋·외부 API 없음.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripDiacritics } from "./lib/greek-pron.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const NOTES_PATH = path.join(repoRoot, "data", "keyword-notes", "greek.json");
const OUT_LEX = path.join(repoRoot, "public", "word-study", "lexicon", "greek");

const NAME_MEANING_BY_STRONG = {
  G2424: "여호와는 구원이시다",
  G5547: "기름 부음 받은 이, 메시아",
  G4074: "바위, 반석",
  G2491: "여호와는 은혜로우시다",
  G3972: "작은 이",
  G4613: "들으심",
  G11: "많은 무리의 아버지",
  G3475: "물에서 끌어내다",
  G2419: "평화의 기초",
  G2414: "평화의 기초",
  G2474: "하나님과 겨루다, 하나님이 다스리시다",
  G1056: "이방의 둘레, 갈릴리",
  G2453: "유다 사람, 유대인",
  G5330: "구별된 이, 바리새인",
  G4091: "창으로 찌른 이(?), 빌라도",
};

function shortKoGloss(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  const paren = t.match(/[（(]([^）)]{1,16})[）)]/);
  if (paren) return paren[1].trim();
  if (t.length <= 16 && !/[.。!?]/.test(t) && !/이에요|습니다|해요|예요/.test(t)) return t;
  return t.split(/[,，.。!?\n]/)[0].trim().slice(0, 16);
}

function lookPhraseHit(map, greek, lemmas) {
  if (!map || typeof map !== "object") return "";
  if (map[greek]) return String(map[greek]);
  if (Array.isArray(lemmas) && map[lemmas.join(" ")]) return String(map[lemmas.join(" ")]);
  const key = stripDiacritics(greek);
  for (const [k, v] of Object.entries(map)) {
    if (stripDiacritics(k) === key) return String(v);
  }
  return "";
}

function looksLikeProperName(lemma, defEn) {
  const L = String(lemma || "");
  if (/^[Ἀ-ῬA-Z]/.test(L)) return true;
  const d = String(defEn || "");
  return /\b(name of|the name)\b/i.test(d);
}

function loadNotes() {
  if (!fs.existsSync(NOTES_PATH)) return {};
  return JSON.parse(fs.readFileSync(NOTES_PATH, "utf8"));
}

function enrichOne(obj, note) {
  const n = note || {};
  if (n.defKo) obj.defKo = String(n.defKo);
  const usage = n.usageKo || n.compare || n.compareKo || n.note;
  if (usage) obj.compareKo = String(usage);

  // root.glossKo ← etym prose (칩 메모), etym ← 뿌리+짧은 뜻
  const root = obj.root && typeof obj.root === "object" ? { ...obj.root } : null;
  const etymProse = n.etymKo || n.rootNote || n.rootGloss || "";
  if (root) {
    if (etymProse) root.glossKo = etymProse;
    obj.root = root;
    const short =
      shortKoGloss(
        (obj.family || []).find((f) => f && f.strong === root.strong)?.glossKo || "",
      ) ||
      shortKoGloss(etymProse) ||
      shortKoGloss(obj.defKo || "");
    obj.etym = {
      lemma: root.lemma || "",
      strong: root.strong || "",
      glossKo: short,
    };
  } else {
    obj.etym = null;
  }

  const nm =
    (typeof n.nameMeaning === "string" && n.nameMeaning.trim()) ||
    NAME_MEANING_BY_STRONG[obj.strong] ||
    "";
  obj.nameMeaning = nm || (looksLikeProperName(obj.lemma, obj.defEn) ? nm : "");
  if (!obj.nameMeaning) obj.nameMeaning = NAME_MEANING_BY_STRONG[obj.strong] || "";

  // family 유지 (이미 있음)
  if (!Array.isArray(obj.family)) obj.family = [];
  if (typeof obj.defEn !== "string") obj.defEn = obj.defEn || "";

  if (Array.isArray(obj.phrases)) {
    obj.phrases = obj.phrases.map((p) => {
      const next = { ...p };
      if (!("glossKo" in next)) next.glossKo = "";
      const noteHit = lookPhraseHit(n.phraseNotes, p.greek, p.lemmas);
      if (noteHit) next.noteKo = noteHit;
      const glossHit = lookPhraseHit(n.phraseGlosses, p.greek, p.lemmas);
      if (glossHit) next.glossKo = glossHit;
      return next;
    });
  }

  // 필드 순서 정리
  return {
    lemma: obj.lemma,
    pron: obj.pron,
    strong: obj.strong,
    posKo: obj.posKo || "",
    root: obj.root ?? null,
    etym: obj.etym ?? null,
    family: obj.family || [],
    nameMeaning: obj.nameMeaning || "",
    defEn: obj.defEn || "",
    defKo: obj.defKo || "",
    compareKo: obj.compareKo || "",
    countNT: obj.countNT ?? 0,
    byBook: obj.byBook || {},
    count1John: obj.count1John ?? 0,
    phrases: obj.phrases || [],
  };
}

function main() {
  const notes = loadNotes();
  const files = fs.readdirSync(OUT_LEX).filter((f) => f.endsWith(".json"));
  let patched = 0;
  let withNotes = 0;
  let withEtym = 0;
  let withName = 0;
  let phraseGloss = 0;

  for (const f of files) {
    const p = path.join(OUT_LEX, f);
    const strong = f.replace(/\.json$/, "");
    const obj = JSON.parse(fs.readFileSync(p, "utf8"));
    const note = notes[strong] || {};
    const next = enrichOne(obj, note);
    fs.writeFileSync(p, JSON.stringify(next, null, 2) + "\n");
    patched += 1;
    if (note.defKo) withNotes += 1;
    if (next.etym) withEtym += 1;
    if (next.nameMeaning) withName += 1;
    for (const ph of next.phrases || []) {
      if (ph.glossKo) phraseGloss += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        files: patched,
        notesKeys: Object.keys(notes).length,
        lexiconWithNoteDefKo: withNotes,
        withEtym,
        withNameMeaning: withName,
        phrasesWithGlossKo: phraseGloss,
      },
      null,
      2,
    ),
  );
}

main();
