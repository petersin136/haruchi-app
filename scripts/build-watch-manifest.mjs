// =============================================================================
// 리딩지저스 「○○ 전체 듣기」 재생목록 → public/watch-times/manifest.json
//
// 구약: PL68UlTaS5lt8X0EqkQh8ZgNJp0hfleNVV
// 신약: PL68UlTaS5lt9IsvbVw0LySdmyHoGj5XeO
//
// 산출:
//   public/watch-times/manifest.json
//     { "genesis": [{ "videoId": "...", "from": 1, "to": 50 }], ... }
//   .cache/watch-manifest/playlists-raw.json
//   .cache/watch-manifest/videos-meta.json   (제목·길이·embed·asr)
//   .cache/watch-manifest/report.json
//
// 사용: node scripts/build-watch-manifest.mjs
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outManifest = path.join(repoRoot, "public", "watch-times", "manifest.json");
const cacheDir = path.join(repoRoot, ".cache", "watch-manifest");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const PLAYLISTS = {
  ot: "PL68UlTaS5lt8X0EqkQh8ZgNJp0hfleNVV",
  nt: "PL68UlTaS5lt9IsvbVw0LySdmyHoGj5XeO",
};

/** books.ts 와 동일한 순서·이름·장수 (scripts 전용 복사 — app 파일 수정 금지) */
const BOOKS = [
  ["genesis", "창세기", 50],
  ["exodus", "출애굽기", 40],
  ["leviticus", "레위기", 27],
  ["numbers", "민수기", 36],
  ["deuteronomy", "신명기", 34],
  ["joshua", "여호수아", 24],
  ["judges", "사사기", 21],
  ["ruth", "룻기", 4],
  ["samuel1", "사무엘상", 31],
  ["samuel2", "사무엘하", 24],
  ["kings1", "열왕기상", 22],
  ["kings2", "열왕기하", 25],
  ["chronicles1", "역대상", 29],
  ["chronicles2", "역대하", 36],
  ["ezra", "에스라", 10],
  ["nehemiah", "느헤미야", 13],
  ["esther", "에스더", 10],
  ["job", "욥기", 42],
  ["psalms", "시편", 150],
  ["proverbs", "잠언", 31],
  ["ecclesiastes", "전도서", 12],
  ["songofsolomon", "아가", 8],
  ["isaiah", "이사야", 66],
  ["jeremiah", "예레미야", 52],
  ["lamentations", "예레미야애가", 5],
  ["ezekiel", "에스겔", 48],
  ["daniel", "다니엘", 12],
  ["hosea", "호세아", 14],
  ["joel", "요엘", 3],
  ["amos", "아모스", 9],
  ["obadiah", "오바댜", 1],
  ["jonah", "요나", 4],
  ["micah", "미가", 7],
  ["nahum", "나훔", 3],
  ["habakkuk", "하박국", 3],
  ["zephaniah", "스바냐", 3],
  ["haggai", "학개", 2],
  ["zechariah", "스가랴", 14],
  ["malachi", "말라기", 4],
  ["matthew", "마태복음", 28],
  ["mark", "마가복음", 16],
  ["luke", "누가복음", 24],
  ["john", "요한복음", 21],
  ["acts", "사도행전", 28],
  ["romans", "로마서", 16],
  ["corinthians1", "고린도전서", 16],
  ["corinthians2", "고린도후서", 13],
  ["galatians", "갈라디아서", 6],
  ["ephesians", "에베소서", 6],
  ["philippians", "빌립보서", 4],
  ["colossians", "골로새서", 4],
  ["thessalonians1", "데살로니가전서", 5],
  ["thessalonians2", "데살로니가후서", 3],
  ["timothy1", "디모데전서", 6],
  ["timothy2", "디모데후서", 4],
  ["titus", "디도서", 3],
  ["philemon", "빌레몬서", 1],
  ["hebrews", "히브리서", 13],
  ["james", "야고보서", 5],
  ["peter1", "베드로전서", 5],
  ["peter2", "베드로후서", 3],
  ["john1", "요한일서", 5],
  ["john2", "요한이서", 1],
  ["john3", "요한삼서", 1],
  ["jude", "유다서", 1],
  ["revelation", "요한계시록", 22],
];

const BOOK_BY_ID = Object.fromEntries(
  BOOKS.map(([id, name, chapters]) => [id, { id, name, chapters }]),
);

/** 긴 이름 우선 (예레미야애가 > 예레미야, 요한일서 > 요한복음 등) */
const NAME_TO_ID = [...BOOKS]
  .sort((a, b) => b[1].length - a[1].length)
  .map(([id, name]) => [name, id]);

const ALIASES = [
  ["창세", "genesis"],
  ["출애굽", "exodus"],
  ["레위", "leviticus"],
  ["민수", "numbers"],
  ["신명", "deuteronomy"],
  ["솔로몬의 노래", "songofsolomon"],
  ["아가서", "songofsolomon"],
  ["시편 1", "psalms"], // 혹시 "시편 1-72" 같은 제목
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractJsonAssign(html, marker) {
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const eq = html.indexOf("=", idx);
  const start = html.indexOf("{", eq);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseDuration(label) {
  if (!label) return null;
  const parts = String(label).trim().split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

function videosFromPlaylistData(data) {
  const out = [];
  function walk(obj) {
    if (!obj || typeof obj !== "object") return;
    if (obj.lockupViewModel) {
      const s = obj.lockupViewModel;
      const title = s.metadata?.lockupMetadataViewModel?.title?.content || "";
      const dur =
        s.contentImage?.thumbnailViewModel?.overlays
          ?.map(
            (o) =>
              o.thumbnailBottomOverlayViewModel?.badges?.[0]
                ?.thumbnailBadgeViewModel?.text,
          )
          .find(Boolean) || "";
      out.push({
        videoId: s.contentId,
        title,
        lengthText: dur,
        durationSec: parseDuration(dur),
      });
    }
    // 구 UI 호환
    if (obj.playlistVideoRenderer) {
      const r = obj.playlistVideoRenderer;
      const title =
        r.title?.runs?.map((x) => x.text).join("") || r.title?.simpleText || "";
      const lengthText =
        r.lengthText?.simpleText ||
        r.lengthText?.runs?.map((x) => x.text).join("") ||
        "";
      out.push({
        videoId: r.videoId,
        title,
        lengthText,
        durationSec: parseDuration(lengthText),
      });
    }
    if (Array.isArray(obj)) obj.forEach(walk);
    else Object.values(obj).forEach(walk);
  }
  walk(data);
  const seen = new Set();
  return out.filter(
    (v) => v.videoId && !seen.has(v.videoId) && (seen.add(v.videoId), true),
  );
}

/** "1권 1강 1일차" 등 일차별·강의 영상 제외 */
function isDailyLesson(title) {
  return /일차|^\s*\d+\s*강|\d+권\s*\d+강|강의\s*\d+|day\s*\d+/i.test(title);
}

/**
 * 제목에서 책·장 범위 추출.
 * 반환: [{ bookId, from, to }]  — 한 영상에 여러 책이면 여러 항목
 */
function parseTitleBooks(title) {
  if (isDailyLesson(title)) return [];

  const hits = [];

  // "시편 1-72", "시편 1~72장", "시편 73–150"
  for (const [name, id] of NAME_TO_ID) {
    const re = new RegExp(
      `${name}\\s*(\\d{1,3})\\s*[~～\\-–—]\\s*(\\d{1,3})\\s*장?`,
    );
    const m = title.match(re);
    if (m) {
      hits.push({ bookId: id, from: +m[1], to: +m[2], via: "range" });
    }
  }

  // "○○ 전체 듣기" / "○○ 통독" / 파이프 뒤 책 이름
  if (!hits.length) {
    for (const [name, id] of NAME_TO_ID) {
      if (
        title.includes(`${name} 전체`) ||
        title.includes(`${name}전체`) ||
        title.includes(`| ${name} `) ||
        title.includes(`|${name} `) ||
        title.endsWith(name) ||
        title.includes(`${name} 통독`)
      ) {
        // 예레미야 vs 예레미야애가: 긴 이름이 먼저 매칭되면 OK.
        // 짧은 이름만 잡히고 긴 이름도 있으면 스킵
        const longer = NAME_TO_ID.find(
          ([n, i]) => i !== id && n.includes(name) && title.includes(n),
        );
        if (longer && longer[0].length > name.length) continue;
        // 요한복음 vs 요한일/이/삼서
        if (
          name === "요한복음" &&
          /요한[일이삼]서/.test(title) &&
          !title.includes("요한복음")
        )
          continue;
        hits.push({
          bookId: id,
          from: 1,
          to: BOOK_BY_ID[id].chapters,
          via: "full",
        });
        break; // 전체듣기는 보통 한 책
      }
    }
  }

  // 별칭
  if (!hits.length) {
    for (const [alias, id] of ALIASES) {
      if (title.includes(alias)) {
        hits.push({
          bookId: id,
          from: 1,
          to: BOOK_BY_ID[id].chapters,
          via: "alias",
        });
        break;
      }
    }
  }

  // 한 제목에 여러 책 이름이 나란히 ("룻기·요나" 등) — 파이프 구간마다
  if (!hits.length) {
    const parts = title.split(/[|｜/·,，]/);
    for (const part of parts) {
      for (const [name, id] of NAME_TO_ID) {
        if (part.includes(name)) {
          const longer = NAME_TO_ID.find(
            ([n, i]) => i !== id && n.includes(name) && part.includes(n),
          );
          if (longer && longer[0].length > name.length) continue;
          if (!hits.some((h) => h.bookId === id)) {
            hits.push({
              bookId: id,
              from: 1,
              to: BOOK_BY_ID[id].chapters,
              via: "part",
            });
          }
        }
      }
    }
  }

  return hits;
}

async function fetchPlaylist(listId) {
  const res = await fetch(`https://www.youtube.com/playlist?list=${listId}`, {
    headers: { "Accept-Language": "ko-KR,ko;q=0.9", "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`playlist ${listId} HTTP ${res.status}`);
  const html = await res.text();
  const data = extractJsonAssign(html, "ytInitialData");
  if (!data) throw new Error(`playlist ${listId}: ytInitialData 없음`);
  return {
    listId,
    title: data?.metadata?.playlistMetadataRenderer?.title || "",
    videos: videosFromPlaylistData(data),
  };
}

async function checkOEmbed(videoId) {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`,
  )}&format=json`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return { embed: false, status: res.status };
    const j = await res.json();
    return {
      embed: true,
      status: res.status,
      oembedTitle: j.title || "",
      author: j.author_name || "",
    };
  } catch (e) {
    return { embed: false, error: String(e.message || e) };
  }
}

/**
 * 한국어 자동생성(asr) 자막 유무.
 * watch HTML 의 ytInitialPlayerResponse.captionTracks 를 본다.
 * (본문 다운로드는 PO 토큰이 필요할 수 있으나, 트랙 목록은 보통 여기 있음)
 */
async function checkAsr(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "User-Agent": UA,
      },
    });
    if (!res.ok) return { asr: false, status: res.status };
    const html = await res.text();
    let player = extractJsonAssign(html, "ytInitialPlayerResponse");
    if (!player) {
      // 변형: "ytInitialPlayerResponse":{...}
      const m = html.match(
        /ytInitialPlayerResponse"\s*:\s*(\{)/,
      );
      if (m) {
        const start = m.index + m[0].length - 1;
        let depth = 0;
        for (let i = start; i < html.length; i++) {
          if (html[i] === "{") depth++;
          else if (html[i] === "}") {
            depth--;
            if (depth === 0) {
              try {
                player = JSON.parse(html.slice(start, i + 1));
              } catch {
                player = null;
              }
              break;
            }
          }
        }
      }
    }
    const tracks =
      player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const koAsr = tracks.find(
      (t) =>
        (t.languageCode === "ko" || t.languageCode?.startsWith("ko")) &&
        (t.kind === "asr" || /a\./.test(t.vssId || "")),
    );
    const koAny = tracks.find(
      (t) => t.languageCode === "ko" || t.languageCode?.startsWith("ko"),
    );
    return {
      asr: Boolean(koAsr),
      koTrack: Boolean(koAny),
      tracks: tracks.map((t) => ({
        lang: t.languageCode,
        kind: t.kind || "uploaded",
        name: t.name?.simpleText || t.name?.runs?.[0]?.text || "",
        vssId: t.vssId,
      })),
      playability: player?.playabilityStatus?.status || null,
      lengthSeconds: Number(player?.videoDetails?.lengthSeconds) || null,
    };
  } catch (e) {
    return { asr: false, error: String(e.message || e) };
  }
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

function buildManifest(assignments) {
  /** @type {Record<string, {videoId:string,from:number,to:number}[]>} */
  const manifest = {};
  for (const [id] of BOOKS) manifest[id] = [];

  for (const a of assignments) {
    for (const hit of a.hits) {
      manifest[hit.bookId].push({
        videoId: a.videoId,
        from: hit.from,
        to: hit.to,
      });
    }
  }

  // 같은 책 안 정렬·겹침 정리(보고용으로는 그대로 두고, from 순 정렬만)
  for (const id of Object.keys(manifest)) {
    manifest[id].sort((a, b) => a.from - b.from || a.to - b.to);
  }
  return manifest;
}

function coverageGaps(manifest) {
  const missing = [];
  const split = [];
  const incomplete = [];
  for (const [id, name, chapters] of BOOKS) {
    const parts = manifest[id] || [];
    if (!parts.length) {
      missing.push(id);
      continue;
    }
    if (parts.length > 1) split.push({ bookId: id, name, parts });
    const covered = new Set();
    for (const p of parts) {
      for (let c = p.from; c <= p.to; c++) covered.add(c);
    }
    const gaps = [];
    for (let c = 1; c <= chapters; c++) if (!covered.has(c)) gaps.push(c);
    if (gaps.length) incomplete.push({ bookId: id, name, gaps, parts });
  }
  return { missing, split, incomplete };
}

async function main() {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(path.dirname(outManifest), { recursive: true });

  console.log("재생목록 수집…");
  const ot = await fetchPlaylist(PLAYLISTS.ot);
  const nt = await fetchPlaylist(PLAYLISTS.nt);
  const allVideos = [
    ...ot.videos.map((v) => ({ ...v, playlist: "ot", listId: ot.listId })),
    ...nt.videos.map((v) => ({ ...v, playlist: "nt", listId: nt.listId })),
  ];

  fs.writeFileSync(
    path.join(cacheDir, "playlists-raw.json"),
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        ot: { listId: ot.listId, title: ot.title, videos: ot.videos },
        nt: { listId: nt.listId, title: nt.title, videos: nt.videos },
      },
      null,
      2,
    ),
  );
  console.log(`OT ${ot.videos.length} · NT ${nt.videos.length}`);

  const dailySkipped = allVideos.filter((v) => isDailyLesson(v.title));
  const candidates = allVideos.filter((v) => !isDailyLesson(v.title));

  const assignments = candidates.map((v) => ({
    ...v,
    hits: parseTitleBooks(v.title),
  }));
  const unmapped = assignments.filter((a) => !a.hits.length);

  console.log(`oEmbed + ASR 확인 (${candidates.length}개, 동시 4)…`);
  const metaList = await mapPool(candidates, 4, async (v, idx) => {
    const [embedInfo, asrInfo] = await Promise.all([
      checkOEmbed(v.videoId),
      checkAsr(v.videoId),
    ]);
    // duration: playlist badge 우선, player 보조
    const durationSec =
      v.durationSec ?? asrInfo.lengthSeconds ?? null;
    if ((idx + 1) % 10 === 0 || idx === candidates.length - 1) {
      console.log(
        `  ${idx + 1}/${candidates.length} ${v.videoId} embed=${embedInfo.embed} asr=${asrInfo.asr}`,
      );
    }
    await sleep(80);
    return {
      videoId: v.videoId,
      title: v.title,
      playlist: v.playlist,
      listId: v.listId,
      lengthText: v.lengthText,
      durationSec,
      hits: parseTitleBooks(v.title),
      embed: embedInfo.embed,
      embedStatus: embedInfo.status ?? null,
      asr: asrInfo.asr,
      koTrack: asrInfo.koTrack ?? false,
      tracks: asrInfo.tracks || [],
      playability: asrInfo.playability ?? null,
      asrError: asrInfo.error || null,
    };
  });

  fs.writeFileSync(
    path.join(cacheDir, "videos-meta.json"),
    JSON.stringify({ fetchedAt: new Date().toISOString(), videos: metaList }, null, 2),
  );

  const manifest = buildManifest(
    metaList.map((m) => ({ videoId: m.videoId, hits: m.hits })),
  );

  // manifest 항목에 메타 플래그는 넣지 않음 — 요청 형식 그대로
  fs.writeFileSync(outManifest, JSON.stringify(manifest, null, 2) + "\n");

  const { missing, split, incomplete } = coverageGaps(manifest);
  const byVideo = Object.fromEntries(metaList.map((m) => [m.videoId, m]));

  const rows = BOOKS.map(([id, name, chapters]) => {
    const parts = manifest[id];
    const metas = parts.map((p) => byVideo[p.videoId]).filter(Boolean);
    const embed = metas.length
      ? metas.every((m) => m.embed)
        ? true
        : metas.some((m) => m.embed)
          ? "partial"
          : false
      : null;
    const asr = metas.length
      ? metas.every((m) => m.asr)
        ? true
        : metas.some((m) => m.asr)
          ? "partial"
          : false
      : null;
    const ranges = parts.map((p) => `${p.from}-${p.to}`).join(", ") || "—";
    return {
      bookId: id,
      name,
      chapters,
      videoCount: parts.length,
      ranges,
      videoIds: parts.map((p) => p.videoId),
      embed,
      asr,
    };
  });

  const report = {
    fetchedAt: new Date().toISOString(),
    playlistCounts: { ot: ot.videos.length, nt: nt.videos.length },
    dailySkipped: dailySkipped.map((v) => ({
      videoId: v.videoId,
      title: v.title,
    })),
    unmapped: unmapped.map((v) => ({ videoId: v.videoId, title: v.title })),
    missing,
    split,
    incomplete,
    embedFail: metaList.filter((m) => !m.embed).map((m) => m.videoId),
    asrFail: metaList.filter((m) => !m.asr).map((m) => m.videoId),
    rows,
  };
  fs.writeFileSync(
    path.join(cacheDir, "report.json"),
    JSON.stringify(report, null, 2),
  );

  // 콘솔 표
  console.log("\nbookId\t영상수\t장범위\tembed\tasr\t이름");
  for (const r of rows) {
    console.log(
      `${r.bookId}\t${r.videoCount}\t${r.ranges}\t${r.embed}\t${r.asr}\t${r.name}`,
    );
  }
  console.log("\n찾지 못한 책:", missing.length ? missing.join(", ") : "(없음)");
  console.log(
    "여러 편으로 나뉜 책:",
    split.length
      ? split.map((s) => `${s.bookId}(${s.parts.length})`).join(", ")
      : "(없음)",
  );
  console.log("매핑 안 된 영상:", unmapped.length);
  console.log("일차별 제외:", dailySkipped.length);
  console.log("embed 실패:", report.embedFail.length);
  console.log("asr 실패:", report.asrFail.length);
  console.log(`\n→ ${outManifest}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
