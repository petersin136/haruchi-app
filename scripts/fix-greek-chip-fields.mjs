#!/usr/bin/env node
/**
 * 신약 칩 strong/glossKo 빈 칸 보정 + 롬 16:25–27 형태 재기입 + ζωή glossKo.
 * 범위: public/word-study/{nt}/, lexicon, data/keyword-notes
 * 설치·커밋·외부 API 없음.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupPron, stripDiacritics } from "./lib/greek-pron.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const OUT_ROOT = path.join(repoRoot, "public", "word-study");
const LEX = path.join(OUT_ROOT, "lexicon", "greek");
const NOTES = path.join(repoRoot, "data", "keyword-notes", "greek.json");
const MAP_PATH = "/tmp/lemma-strong-fix.json";

const NT = [
  "matthew", "mark", "luke", "john", "acts",
  "romans", "corinthians1", "corinthians2", "galatians", "ephesians",
  "philippians", "colossians", "thessalonians1", "thessalonians2",
  "timothy1", "timothy2", "titus", "philemon", "hebrews",
  "james", "peter1", "peter2", "john1", "john2", "john3", "jude", "revelation",
];

/** hapax·특수 철자 — Strong's 표제어와 대응되는 것만 */
const EXTRA = {
  διαπαρατριβή: "G3859", // παραδιατριβή
  πραϋπαθία: "G4236", // πρᾳότης 계열
  Νέα: "G3501",
  δεισιδαίμων: "G1174",
  ὑπεροράω: "G5237", // ὑπερείδω
  εὐρακύλων: "G2148", // Εὐροκλύδων
  διαχλευάζω: "G5512", // χλευάζω
  διόρθωμα: "G1357", // διόρθωσις
  ἐπάρατος: "G1944", // ἐπικατάρατος
  εὐπάρεδρον: "G2145",
  παρεδρεύω: "G4332",
  διαυγής: "G1307", // διαφανής
  ῥυπαρεύω: "G4508",
  δισμυριάς: "G3461", // μυριάς
  ταπεινόφρων: "G5012",
  προπάτωρ: "G3962",
  οἰκετεία: "G3610",
  Μαγαδάν: "G3093",
  ὑπερεκχύννομαι: "G5240",
  παρακαθέζομαι: "G3869",
  κίχρημι: "G5531",
  κατευλογέω: "G2127",
  καταβαρύνομαι: "G2599",
  ἅλα: "G217",
  δοκιμασία: "G1383",
  Ἄρειος: "G697",
  Πάγος: "G697",
  εἵνεκεν: "G1752",
  ἄχρις: "G891",
  μαμωνᾶς: "G3126",
  Ἰάϊρος: "G2383",
  Βαριωνᾶ: "G920",
};

/** 롬 16:25–27 — SBLGNT 본문(bible-data) + 직접 형태 부여 (MorphGNT 장 파일에 없음) */
const ROM16_DOXOLOGY = {
  25: [
    ["τῷ", "ὁ", "G3588", "토", "그"],
    ["δὲ", "δέ", "G1161", "데", "그런데"],
    ["δυναμένῳ", "δύναμαι", "G1410", "뒤나메노", "능하다"],
    ["ὑμᾶς", "σύ", "G4771", "휘마스", "너"],
    ["στηρίξαι", "στηρίζω", "G4741", "스테릭사이", "굳게하다"],
    ["κατὰ", "κατά", "G2596", "카타", "따라"],
    ["τὸ", "ὁ", "G3588", "토", "그"],
    ["εὐαγγέλιόν", "εὐαγγέλιον", "G2098", "유앙겔리온", "복음"],
    ["μου", "ἐγώ", "G1473", "무", "나"],
    ["καὶ", "καί", "G2532", "카이", "그리고"],
    ["τὸ", "ὁ", "G3588", "토", "그"],
    ["κήρυγμα", "κήρυγμα", "G2782", "케뤼그마", "선포"],
    ["Ἰησοῦ", "Ἰησοῦς", "G2424", "이에수", "예수"],
    ["Χριστοῦ", "Χριστός", "G5547", "크리스투", "그리스도"],
    ["κατὰ", "κατά", "G2596", "카타", "따라"],
    ["ἀποκάλυψιν", "ἀποκάλυψις", "G602", "아포칼륍신", "계시"],
    ["μυστηρίου", "μυστήριον", "G3466", "뮈스테리우", "비밀"],
    ["χρόνοις", "χρόνος", "G5550", "크로노이스", "때"],
    ["αἰωνίοις", "αἰώνιος", "G166", "아이오니오이스", "영원한"],
    ["σεσιγημένου", "σιγάω", "G4601", "세시게메누", "잠잠하다"],
  ],
  26: [
    ["φανερωθέντος", "φανερόω", "G5319", "파네로텐토스", "나타내다"],
    ["δὲ", "δέ", "G1161", "데", "그런데"],
    ["νῦν", "νῦν", "G3568", "뉜", "이제"],
    ["διά", "διά", "G1223", "디아", "통하여"],
    ["τε", "τε", "G5037", "테", "그리고"],
    ["γραφῶν", "γραφή", "G1124", "그라폰", "글"],
    ["προφητικῶν", "προφητικός", "G4397", "프로페티콘", "예언의"],
    ["κατ’", "κατά", "G2596", "카트", "따라"],
    ["ἐπιταγὴν", "ἐπιταγή", "G2003", "에피타겐", "명령"],
    ["τοῦ", "ὁ", "G3588", "투", "그"],
    ["αἰωνίου", "αἰώνιος", "G166", "아이오니우", "영원한"],
    ["θεοῦ", "θεός", "G2316", "테우", "하나님"],
    ["εἰς", "εἰς", "G1519", "에이스", "안으로"],
    ["ὑπακοὴν", "ὑπακοή", "G5218", "휘파코엔", "순종"],
    ["πίστεως", "πίστις", "G4102", "피스테오스", "믿음"],
    ["εἰς", "εἰς", "G1519", "에이스", "안으로"],
    ["πάντα", "πᾶς", "G3956", "판타", "모든"],
    ["τὰ", "ὁ", "G3588", "타", "그"],
    ["ἔθνη", "ἔθνος", "G1484", "에트네", "민족"],
    ["γνωρισθέντος", "γνωρίζω", "G1107", "그노리스텐토스", "알게하다"],
  ],
  27: [
    ["μόνῳ", "μόνος", "G3441", "모노", "오직"],
    ["σοφῷ", "σοφός", "G4680", "소포", "지혜로운"],
    ["θεῷ", "θεός", "G2316", "테오", "하나님"],
    ["διὰ", "διά", "G1223", "디아", "통하여"],
    ["Ἰησοῦ", "Ἰησοῦς", "G2424", "이에수", "예수"],
    ["Χριστοῦ", "Χριστός", "G5547", "크리스투", "그리스도"],
    ["ᾧ", "ὅς", "G3739", "호", "(관계대명사)"],
    ["ἡ", "ὁ", "G3588", "헤", "그"],
    ["δόξα", "δόξα", "G1391", "독사", "영광"],
    ["εἰς", "εἰς", "G1519", "에이스", "안으로"],
    ["τοὺς", "ὁ", "G3588", "투스", "그"],
    ["αἰῶνας", "αἰών", "G165", "아이오나스", "영원"],
    ["ἀμήν", "ἀμήν", "G281", "아멘", "아멘"],
  ],
};

function loadLexGloss() {
  /** @type {Map<string, string>} */
  const byStrong = new Map();
  /** @type {Map<string, string>} */
  const byLemma = new Map();
  for (const f of fs.readdirSync(LEX)) {
    if (!f.endsWith(".json")) continue;
    const d = JSON.parse(fs.readFileSync(path.join(LEX, f), "utf8"));
    const short =
      (d.family || []).find((x) => x.strong === d.strong)?.glossKo ||
      "";
    const gloss =
      short ||
      (typeof d.defEn === "string"
        ? d.defEn.split(/[;,]/)[0].trim().slice(0, 24)
        : "");
    if (d.strong) byStrong.set(d.strong, gloss || d.lemma || "");
    if (d.lemma) byLemma.set(d.lemma, gloss || "");
    if (d.lemma) byLemma.set(stripDiacritics(d.lemma).toLowerCase(), gloss || "");
  }
  return { byStrong, byLemma };
}

function normG(s) {
  const m = String(s || "").match(/(\d+)/);
  return m ? `G${Number(m[1])}` : "";
}

function main() {
  const lemmaMap = JSON.parse(fs.readFileSync(MAP_PATH, "utf8"));
  for (const [k, v] of Object.entries(EXTRA)) lemmaMap[k] = v;

  const { byStrong, byLemma } = loadLexGloss();
  // always force article / David
  lemmaMap["ὁ"] = "G3588";
  lemmaMap["Δαυίδ"] = "G1138";

  const before = { strong: 0, glossKo: 0, pron: 0 };
  const after = { strong: 0, glossKo: 0, pron: 0 };
  const emptyStrongLemma = new Map();

  let fixedStrong = 0;
  let fixedGloss = 0;

  for (const book of NT) {
    const dir = path.join(OUT_ROOT, book);
    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const fp = path.join(dir, name);
      const ch = JSON.parse(fs.readFileSync(fp, "utf8"));
      let changed = false;

      // special: romans 16 doxology
      if (book === "romans" && ch.chapter === 16) {
        for (const verse of ch.verses || []) {
          const rows = ROM16_DOXOLOGY[verse.n];
          if (!rows) continue;
          verse.words = rows.map(([word, lemma, strong, pron, glossKo], i) => ({
            ref: `16:${verse.n}`,
            i,
            word,
            lemma,
            strong,
            pron: pron || lookupPron(word, lemma),
            parse: "",
            parseKo: "",
            glossKo,
          }));
          changed = true;
        }
      }

      for (const verse of ch.verses || []) {
        for (const w of verse.words || []) {
          if (!(w.strong || "").trim()) before.strong += 1;
          if (!(w.glossKo || "").trim()) before.glossKo += 1;
          if (!(w.pron || "").trim()) before.pron += 1;

          if (!(w.strong || "").trim()) {
            const hit = lemmaMap[w.lemma] || lemmaMap[stripDiacritics(w.lemma || "")];
            if (hit) {
              w.strong = normG(hit);
              fixedStrong += 1;
              changed = true;
            }
          }
          // ὁ by lemma even if somehow wrong
          if ((w.lemma === "ὁ" || w.lemma === "τό" || w.lemma === "τά") && !(w.strong || "").trim()) {
            w.strong = "G3588";
            fixedStrong += 1;
            changed = true;
          }

          if (!(w.glossKo || "").trim()) {
            const g =
              byStrong.get(normG(w.strong)) ||
              byLemma.get(w.lemma) ||
              byLemma.get(stripDiacritics(w.lemma || "").toLowerCase()) ||
              "";
            if (g) {
              w.glossKo = g;
              fixedGloss += 1;
              changed = true;
            }
          }
          if (!(w.pron || "").trim()) {
            const p = lookupPron(w.word || "", w.lemma || "");
            if (p) {
              w.pron = p;
              changed = true;
            }
          }

          if (!(w.strong || "").trim()) {
            after.strong += 1;
            const lem = w.lemma || "";
            emptyStrongLemma.set(lem, (emptyStrongLemma.get(lem) || 0) + 1);
          }
          if (!(w.glossKo || "").trim()) after.glossKo += 1;
          if (!(w.pron || "").trim()) after.pron += 1;
        }
      }

      if (changed) fs.writeFileSync(fp, JSON.stringify(ch) + "\n");
    }
  }

  // ζωή glossKo fix in notes + lexicon
  const notes = JSON.parse(fs.readFileSync(NOTES, "utf8"));
  if (notes.G2222?.phraseGlosses) {
    for (const [k, v] of Object.entries(notes.G2222.phraseGlosses)) {
      if (typeof v === "string" && v.includes("영생에로")) {
        notes.G2222.phraseGlosses[k] = v.replace(/영생에로/g, "영생에 이르도록");
      }
    }
  }
  fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");

  const zoePath = path.join(LEX, "G2222.json");
  const zoe = JSON.parse(fs.readFileSync(zoePath, "utf8"));
  for (const ph of zoe.phrases || []) {
    if (ph.glossKo && ph.glossKo.includes("영생에로")) {
      ph.glossKo = ph.glossKo.replace(/영생에로/g, "영생에 이르도록");
    }
    if (ph.noteKo && ph.noteKo.includes("영생에로")) {
      ph.noteKo = ph.noteKo.replace(/영생에로/g, "영생에 이르도록");
    }
  }
  if (zoe.compareKo?.includes("영생에로")) {
    zoe.compareKo = zoe.compareKo.replace(/영생에로/g, "영생에 이르도록");
  }
  fs.writeFileSync(zoePath, JSON.stringify(zoe, null, 2) + "\n");

  const top20 = [...emptyStrongLemma.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "el"))
    .slice(0, 20);

  const report = {
    before,
    after,
    fixedStrong,
    fixedGloss,
    remainingStrongTop20: top20,
    zoeGlossSample: (zoe.phrases || []).map((p) => [p.greek, p.glossKo]),
  };
  console.log(JSON.stringify(report, null, 2));
}

main();
