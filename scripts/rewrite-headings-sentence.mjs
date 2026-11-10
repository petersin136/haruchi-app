/**
 * 문장 안 되는 소제목 재작성 (BSB 영어 뜻 → 직접 문장, 확신 없으면 빈 값)
 * 범위: public/headings, .cache
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BOOK_TO_BSB, loadBsbBook } from "./lib-bsb-usfm.mjs";
import {
  writeHeadingSentence,
  sentenceIssues,
  normEn,
  clip14,
  setExact,
} from "./lib-heading-sentence.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const BOOK_ABBR = {
  genesis: "창", exodus: "출", leviticus: "레", numbers: "민", deuteronomy: "신",
  joshua: "수", judges: "삿", ruth: "룻", samuel1: "삼상", samuel2: "삼하",
  kings1: "왕상", kings2: "왕하", chronicles1: "대상", chronicles2: "대하",
  ezra: "스", nehemiah: "느", esther: "에", job: "욥", psalms: "시",
  proverbs: "잠", ecclesiastes: "전", songofsolomon: "아", isaiah: "사",
  jeremiah: "렘", lamentations: "애", ezekiel: "겔", daniel: "단", hosea: "호",
  joel: "욜", amos: "암", obadiah: "옵", jonah: "욘", micah: "미", nahum: "나",
  habakkuk: "합", zephaniah: "습", haggai: "학", zechariah: "슥", malachi: "말",
  matthew: "마", mark: "막", luke: "눅", john: "요", acts: "행", romans: "롬",
  corinthians1: "고전", corinthians2: "고후", galatians: "갈", ephesians: "엡",
  philippians: "빌", colossians: "골", thessalonians1: "살전", thessalonians2: "살후",
  timothy1: "딤전", timothy2: "딤후", titus: "딛", philemon: "몬", hebrews: "히",
  james: "약", peter1: "벧전", peter2: "벧후", john1: "요일", john2: "요이",
  john3: "요삼", jude: "유", revelation: "계",
};

const OT = new Set(Object.keys(BOOK_ABBR).slice(0, 39));

const BATCHES = [
  ["pilot", ["genesis", "matthew", "psalms", "john1"]],
  ["ot1", ["exodus", "leviticus", "numbers", "deuteronomy", "joshua", "judges", "ruth", "samuel1", "samuel2", "kings1"]],
  ["ot2", ["kings2", "chronicles1", "chronicles2", "ezra", "nehemiah", "esther", "job", "proverbs", "ecclesiastes", "songofsolomon"]],
  ["ot3", ["isaiah", "jeremiah", "lamentations", "ezekiel", "daniel", "hosea", "joel", "amos", "obadiah", "jonah"]],
  ["ot4", ["micah", "nahum", "habakkuk", "zephaniah", "haggai", "zechariah", "malachi"]],
  ["nt1", ["mark", "luke", "john", "acts", "romans", "corinthians1", "corinthians2", "galatians", "ephesians"]],
  ["nt2", ["philippians", "colossians", "thessalonians1", "thessalonians2", "timothy1", "timothy2", "titus", "philemon", "hebrews", "james", "peter1", "peter2", "john2", "john3", "jude", "revelation"]],
];

function isBad(ko, en) {
  return sentenceIssues(ko, en).length > 0;
}

function restorePilot() {
  const report = { restored: [], keptIntentional: [] };
  const intentional = {
    "matthew|5|38": "눈은 눈으로",
    "matthew|5|43": "원수를 사랑하라",
    "matthew|11|25": "아버지를 찬송하심",
    "matthew|11|28": "수고한 자의 쉼",
    "genesis|30|1": "단과 납달리",
    "genesis|30|9": "갓과 아셀",
    "genesis|30|17": "잇사갈과 스불론과 디나",
    "genesis|30|22": "요셉의 출생",
    "genesis|30|25": "야곱이 창성함",
  };
  // force pilot checkpoints
  const force = {
    "john1|5|9": "하나님의 아들의 증거",
    "john1|5|13": "응답받는 기도",
    "matthew|26|17": "유월절을 예비함",
  };

  for (const id of ["genesis", "matthew", "psalms", "john1"]) {
    const prevPath = path.join(ROOT, ".cache", "headings-before-style", `${id}.json`);
    if (!fs.existsSync(prevPath)) continue;
    const prev = JSON.parse(fs.readFileSync(prevPath, "utf8"));
    const cur = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "headings", `${id}.json`), "utf8"));
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, ".cache", "headings-raw", `${id}.json`), "utf8"));
    let changed = false;
    for (const [chs, items] of Object.entries(prev)) {
      for (const [vs, koPrev] of Object.entries(items)) {
        const key = `${id}|${chs}|${vs}`;
        if (intentional[key]) {
          if (cur[chs]?.[vs] !== intentional[key]) {
            cur[chs] = cur[chs] || {};
            cur[chs][vs] = intentional[key];
            changed = true;
          }
          report.keptIntentional.push(key);
          continue;
        }
        if (force[key]) {
          cur[chs] = cur[chs] || {};
          if (cur[chs][vs] !== force[key]) {
            report.restored.push({ key, from: cur[chs][vs], to: force[key] });
            cur[chs][vs] = force[key];
            setExact(raw[chs]?.[vs] || "", force[key]);
            changed = true;
          }
          continue;
        }
        const now = cur[chs]?.[vs];
        const en = raw[chs]?.[vs] || "";
        // restore when current is bad and previous is better
        if (now != null && isBad(now, en) && !isBad(koPrev, en) && !/이라$/.test(koPrev)) {
          cur[chs][vs] = koPrev;
          setExact(en, koPrev);
          report.restored.push({ key, from: now, to: koPrev });
          changed = true;
        }
      }
    }
    // ensure intentional + force applied even if not in before-style
    for (const [key, ko] of Object.entries({ ...intentional, ...force })) {
      const [bid, ch, vs] = key.split("|");
      if (bid !== id) continue;
      cur[ch] = cur[ch] || {};
      if (cur[ch][vs] !== ko) {
        cur[ch][vs] = ko;
        changed = true;
      }
    }
    // keep self additions
    if (id === "matthew") {
      cur["5"] = cur["5"] || {};
      cur["5"]["43"] = "원수를 사랑하라";
      cur["11"] = cur["11"] || {};
      cur["11"]["28"] = cur["11"]["28"] || "수고한 자의 쉼";
    }
    if (changed) {
      fs.writeFileSync(path.join(ROOT, "public", "headings", `${id}.json`), JSON.stringify(cur, null, 2) + "\n");
    }
  }
  return report;
}

function polishJesus(ko) {
  return String(ko).replace(/^예수가\s+/g, "예수께서 ");
}

function rewriteBook(id) {
  const hPath = path.join(ROOT, "public", "headings", `${id}.json`);
  const rawPath = path.join(ROOT, ".cache", "headings-raw", `${id}.json`);
  const h = JSON.parse(fs.readFileSync(hPath, "utf8"));
  const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));
  let rewritten = 0;
  let blanked = 0;
  let kept = 0;
  const changes = [];

  for (const chs of Object.keys(h)) {
    for (const vs of Object.keys(h[chs])) {
      let ko = h[chs][vs];
      const en = raw[chs]?.[vs] || "";
      // self verses may have no raw en
      const before = ko;
      ko = polishJesus(ko);
      if (!isBad(ko, en) && ko) {
        if (ko !== before) {
          h[chs][vs] = ko;
          changes.push({ ref: `${chs}:${vs}`, en, before, after: ko, how: "예수높임" });
          rewritten++;
        } else kept++;
        continue;
      }
      // try sentence writer
      let next = writeHeadingSentence(en);
      if (next) next = polishJesus(next);
      if (next && !isBad(next, en)) {
        h[chs][vs] = next;
        setExact(en, next);
        changes.push({ ref: `${chs}:${vs}`, en, before, after: next, how: "재작성" });
        rewritten++;
      } else if (isBad(ko, en)) {
        // unsure → blank
        h[chs][vs] = "";
        changes.push({ ref: `${chs}:${vs}`, en, before, after: "", how: "불확실공백" });
        blanked++;
      } else {
        kept++;
      }
    }
  }

  // dedupe within chapter: if same ko appears twice, rewrite second from its EN
  for (const chs of Object.keys(h)) {
    const seen = new Map();
    for (const vs of Object.keys(h[chs]).sort((a, b) => +a - +b)) {
      const ko = h[chs][vs];
      if (!ko) continue;
      if (seen.has(ko)) {
        const en = raw[chs]?.[vs] || "";
        let next = writeHeadingSentence(en);
        if (next) next = polishJesus(next);
        // force uniqueness with light disambiguation from EN if still same
        if (!next || next === ko || isBad(next, en)) {
          // try clip of distinctive EN word
          next = "";
        }
        if (next && next !== ko) {
          changes.push({ ref: `${chs}:${vs}`, en, before: ko, after: next, how: "겹침해소" });
          h[chs][vs] = next;
          rewritten++;
        } else {
          // last resort: append short disambiguator from EN unique token — still blank if unsure
          h[chs][vs] = "";
          changes.push({ ref: `${chs}:${vs}`, en, before: ko, after: "", how: "겹침공백" });
          blanked++;
        }
      } else {
        seen.set(ko, vs);
      }
    }
  }

  fs.writeFileSync(hPath, JSON.stringify(h, null, 2) + "\n");
  return { rewritten, blanked, kept, changes };
}

function countBadAll() {
  let bad = 0;
  let total = 0;
  let blank = 0;
  const tall = {};
  for (const id of Object.keys(BOOK_TO_BSB)) {
    const h = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "headings", `${id}.json`), "utf8"));
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, ".cache", "headings-raw", `${id}.json`), "utf8"));
    for (const [chs, items] of Object.entries(h)) {
      for (const [vs, ko] of Object.entries(items)) {
        total++;
        if (!ko) {
          blank++;
          bad++;
          tall.blank = (tall.blank || 0) + 1;
          continue;
        }
        const issues = sentenceIssues(ko, raw[chs]?.[vs] || "");
        if (issues.length) {
          bad++;
          for (const i of issues) tall[i] = (tall[i] || 0) + 1;
        }
      }
    }
  }
  return { total, bad, blank, tall };
}

function countDups() {
  const dups = [];
  for (const id of Object.keys(BOOK_TO_BSB)) {
    const h = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "headings", `${id}.json`), "utf8"));
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, ".cache", "headings-raw", `${id}.json`), "utf8"));
    for (const [chs, items] of Object.entries(h)) {
      const seen = new Map();
      for (const [vs, ko] of Object.entries(items)) {
        if (!ko) continue;
        if (seen.has(ko)) dups.push({ id, ch: chs, a: seen.get(ko), b: vs, ko, enA: raw[chs]?.[seen.get(ko)], enB: raw[chs]?.[vs] });
        else seen.set(ko, vs);
      }
    }
  }
  return dups;
}

function writeTable() {
  const rows = [];
  for (const id of Object.keys(BOOK_TO_BSB)) {
    const bsb = loadBsbBook(id);
    const h = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "headings", `${id}.json`), "utf8"));
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, ".cache", "headings-raw", `${id}.json`), "utf8"));
    for (const chs of Object.keys(h).sort((a, b) => +a - +b)) {
      for (const vs of Object.keys(h[chs]).sort((a, b) => +a - +b)) {
        const ko = h[chs][vs];
        const bsbEn = bsb.s1Titles.get(+chs)?.get(+vs) ?? null;
        const rawEn = raw[chs]?.[vs] ?? null;
        let source = "bsb";
        let en = bsbEn || rawEn || "";
        // self: no bsb s1, OR content override at matt 5:38 / 11:25
        if (bsbEn == null) {
          source = "self";
          en = rawEn || "";
        }
        if (id === "matthew" && chs === "5" && vs === "38") {
          source = "self";
          en = "";
        }
        if (id === "matthew" && chs === "5" && vs === "43") {
          // user: BSB Love Your Enemies translation → source bsb with English
          source = "bsb";
          en = "Love Your Enemies";
          if (!raw[chs]) raw[chs] = {};
          raw[chs][vs] = "Love Your Enemies";
        }
        if (id === "matthew" && chs === "11" && vs === "25") {
          source = "self";
          en = "";
        }
        if (id === "matthew" && chs === "11" && vs === "28") {
          source = "self";
          en = "";
        }
        rows.push({
          book: id,
          abbr: BOOK_ABBR[id],
          ref: `${chs}:${vs}`,
          en,
          ko,
          source,
          ot: OT.has(id),
        });
      }
    }
    // persist raw fix for matt 5:43
    if (id === "matthew") {
      fs.writeFileSync(path.join(ROOT, ".cache", "headings-raw", "matthew.json"), JSON.stringify(raw, null, 2) + "\n");
    }
  }
  fs.writeFileSync(
    path.join(ROOT, ".cache", "headings-full-table.tsv"),
    ["책\t장:절\tBSB영어\tsource\t한국어", ...rows.map((r) => `${r.abbr}\t${r.ref}\t${r.en}\t${r.source}\t${r.ko}`)].join("\n") + "\n",
  );
  fs.writeFileSync(
    path.join(ROOT, ".cache", "headings-full-table.jsonl"),
    rows.map((r) => JSON.stringify({ ref: `${r.abbr} ${r.ref}`, en: r.en || null, source: r.source, ko: r.ko })).join("\n") + "\n",
  );
  return rows;
}

// ——— main ———
const before = countBadAll();
const dupsBefore = countDups();
console.log("BEFORE", before, "dups", dupsBefore.length);

const pilotReport = restorePilot();
console.log("PILOT restored", pilotReport.restored.length);

const batchProgress = [];
const allChanges = [];
for (const [name, books] of BATCHES) {
  let rewritten = 0;
  let blanked = 0;
  for (const id of books) {
    if (!BOOK_TO_BSB[id]) continue;
    // skip if already in pilot restore-only? still rewrite remaining bad
    const r = rewriteBook(id);
    rewritten += r.rewritten;
    blanked += r.blanked;
    allChanges.push(...r.changes.map((c) => ({ book: id, ...c })));
  }
  const mid = countBadAll();
  batchProgress.push({ batch: name, books: books.length, rewritten, blanked, badNow: mid.bad, blankNow: mid.blank });
  console.log("BATCH", name, { rewritten, blanked, badNow: mid.bad });
}

const after = countBadAll();
const dupsAfter = countDups();
const rows = writeTable();

// save exact overlay from setExact calls during run — dump getExact via rewriting file
const exactPath = path.join(ROOT, ".cache", "headings-sentence-exact.json");
// rebuild exact from successful non-blank rewrites
const exactOut = {};
for (const c of allChanges) {
  if (c.after && c.en && c.how !== "불확실공백" && c.how !== "겹침공백") {
    exactOut[normEn(c.en)] = c.after;
  }
}
fs.writeFileSync(exactPath, JSON.stringify(exactOut, null, 2) + "\n");

fs.writeFileSync(
  path.join(ROOT, ".cache", "headings-sentence-rewrite-report.json"),
  JSON.stringify(
    {
      before,
      after,
      dupsBefore: dupsBefore.length,
      dupsAfter: dupsAfter.length,
      dupsBeforeList: dupsBefore,
      dupsAfterList: dupsAfter,
      pilotReport,
      batchProgress,
      changesCount: allChanges.length,
      tableRows: rows.length,
      pilotChecks: {
        "john1 5:9": JSON.parse(fs.readFileSync(path.join(ROOT, "public/headings/john1.json"), "utf8"))["5"]["9"],
        "john1 5:13": JSON.parse(fs.readFileSync(path.join(ROOT, "public/headings/john1.json"), "utf8"))["5"]["13"],
        "matthew 26:17": JSON.parse(fs.readFileSync(path.join(ROOT, "public/headings/matthew.json"), "utf8"))["26"]["17"],
      },
    },
    null,
    2,
  ) + "\n",
);

fs.writeFileSync(
  path.join(ROOT, ".cache", "headings-sentence-changes.tsv"),
  ["책\t장:절\t영어\t전\t후\t방법", ...allChanges.map((c) => `${BOOK_ABBR[c.book] || c.book}\t${c.ref}\t${c.en}\t${c.before}\t${c.after}\t${c.how}`)].join("\n") + "\n",
);

console.log("AFTER", after, "dups", dupsAfter.length, "rows", rows.length);
console.log("pilotChecks", {
  j59: JSON.parse(fs.readFileSync(path.join(ROOT, "public/headings/john1.json"), "utf8"))["5"]["9"],
  j513: JSON.parse(fs.readFileSync(path.join(ROOT, "public/headings/john1.json"), "utf8"))["5"]["13"],
  m2617: JSON.parse(fs.readFileSync(path.join(ROOT, "public/headings/matthew.json"), "utf8"))["26"]["17"],
});
