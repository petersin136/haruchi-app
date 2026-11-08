/** /word-study 원어 사전 로더 + 한글 선택 매칭 */

export type WordStudyToken = {
  ref: number;
  i: number;
  word: string;
  lemma: string;
  strong: string;
  pron: string;
  parse: string;
  parseKo: string;
  glossKo: string;
};

export type WordStudyRoot = {
  lemma: string;
  strong?: string;
  pron?: string;
  glossKo?: string;
};

/** 같은 뿌리: 옛 데이터는 lemma 문자열, 새 데이터는 객체 */
export type WordStudyFamilyItem =
  | string
  | { lemma: string; strong?: string; pron?: string; glossKo?: string };

export type WordStudyPhraseWord = {
  word: string;
  lemma?: string;
  strong?: string;
  pron?: string;
};

export type WordStudyPhrase = {
  greek: string;
  pron?: string;
  lemmas?: string[];
  words?: WordStudyPhraseWord[];
  count?: number;
  refs: string[];
};

export type WordStudyLexicon = {
  lemma: string;
  pron?: string;
  strong: string;
  posKo?: string;
  root?: WordStudyRoot | null;
  family?: WordStudyFamilyItem[];
  defKo?: string;
  defEn?: string;
  /** 이렇게 번역됐어요. 없으면 compareKo */
  usageKo?: string;
  /** 고유명사 이름 뜻 */
  nameMeaning?: string;
  compare?: string;
  compareKo?: string;
  note?: string;
  countNT?: number;
  countOT?: number;
  count1John?: number;
  byBook?: Record<string, number>;
  phrases?: WordStudyPhrase[];
};

type ChapterFile =
  | WordStudyToken[]
  | { words?: WordStudyToken[]; tokens?: WordStudyToken[]; verses?: unknown }
  | Record<string, unknown>;

const lexCache = new Map<string, Promise<WordStudyLexicon | null>>();

function verseNumFromRef(ref: unknown, fallback: number): number {
  if (typeof ref === "number" && Number.isFinite(ref) && ref > 0) return ref;
  if (typeof ref === "string") {
    // "31:1" → 절 번호는 콜론 뒤
    const m = ref.trim().match(/(\d+)\s*[:：]\s*(\d+)/);
    if (m) return Number(m[2]);
    const n = Number(ref);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return fallback;
}

function asToken(raw: unknown, fallbackRef = 1, fallbackI = 0): WordStudyToken | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const word = str(o.word ?? o.w);
  if (!word) return null;
  const ref = verseNumFromRef(o.ref ?? o.verse ?? o.n, fallbackRef);
  const i = num(o.i ?? o.index);
  return {
    ref,
    i: Number.isFinite(i) ? i : fallbackI,
    word,
    lemma: str(o.lemma) || word,
    strong: normalizeStrong(str(o.strong ?? o.strongs ?? o.g)),
    pron: str(o.pron ?? o.p ?? o.lemmaP),
    parse: str(o.parse),
    parseKo: str(o.parseKo ?? o.parseLabelLong ?? o.parseLabel ?? o.posKo),
    glossKo: str(o.glossKo ?? o.gloss ?? o.mean ?? o.meaning),
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * lexicon strong을 접두 포함해 유지(H#### / G####).
 * 예전에 G?(\d+) 로 H를 G로 덮어쓰던 버그 제거.
 * 접두 없는 숫자(bible-v2 폴백)만 헬라어 파일명 호환으로 G를 붙임.
 */
function normalizeStrong(s: string): string {
  if (!s) return "";
  const t = s.trim();
  const m = t.match(/^([HG])\s*0*(\d+)$/i);
  if (m) return `${m[1].toUpperCase()}${m[2]}`;
  const m2 = t.match(/([HG])\s*0*(\d+)/i);
  if (m2) return `${m2[1].toUpperCase()}${m2[2]}`;
  const digits = t.match(/(\d+)/);
  return digits ? `G${digits[1]}` : t;
}

function readVerseMeta(raw: ChapterFile): Record<number, VerseWordStudyMeta> {
  const out: Record<number, VerseWordStudyMeta> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const verses = (raw as { verses?: unknown }).verses;
  if (!Array.isArray(verses)) return out;
  for (const verse of verses) {
    if (!verse || typeof verse !== "object") continue;
    const v = verse as {
      n?: unknown;
      words?: unknown[];
      tokens?: unknown[];
      split?: unknown;
      splitWith?: unknown;
      wordSplit?: unknown;
    };
    const ref = num(v.n);
    if (!ref) continue;
    const list = Array.isArray(v.words)
      ? v.words
      : Array.isArray(v.tokens)
        ? v.tokens
        : [];
    const splitWith = Array.isArray(v.splitWith)
      ? v.splitWith.filter((n): n is number => typeof n === "number" && n > 0)
      : [];
    out[ref] = {
      empty: list.length === 0,
      split: !!v.split || !!v.wordSplit || splitWith.length >= 2,
      splitWith,
    };
  }
  return out;
}

function normalizeChapter(raw: ChapterFile): WordStudyToken[] {
  if (Array.isArray(raw)) {
    return raw
      .map((t, i) => asToken(t, 1, i))
      .filter((t): t is WordStudyToken => !!t);
  }
  if (!raw || typeof raw !== "object") return [];

  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.words)) {
    return o.words
      .map((t, i) => asToken(t, 1, i))
      .filter((t): t is WordStudyToken => !!t);
  }
  if (Array.isArray(o.tokens)) {
    return o.tokens
      .map((t, i) => asToken(t, 1, i))
      .filter((t): t is WordStudyToken => !!t);
  }

  const out: WordStudyToken[] = [];

  // { verses: [{ n, words: [...] }, ...] }
  if (Array.isArray(o.verses)) {
    for (const verse of o.verses) {
      if (!verse || typeof verse !== "object") continue;
      const v = verse as { n?: unknown; words?: unknown[]; tokens?: unknown[] };
      const ref = num(v.n) || 0;
      const list = Array.isArray(v.words)
        ? v.words
        : Array.isArray(v.tokens)
          ? v.tokens
          : [];
      list.forEach((t, i) => {
        const tok = asToken(t, ref || 1, i);
        if (tok) out.push({ ...tok, ref: ref || tok.ref });
      });
    }
    return out.sort((a, b) => a.ref - b.ref || a.i - b.i);
  }

  // { "1": [...], "2": [...] } or verses: { "1": [...] }
  const verses =
    o.verses && typeof o.verses === "object" && !Array.isArray(o.verses)
      ? (o.verses as Record<string, unknown>)
      : o;

  for (const [k, val] of Object.entries(verses)) {
    const ref = Number(k);
    if (!Number.isInteger(ref) || ref < 1) continue;
    const list = Array.isArray(val)
      ? val
      : val &&
          typeof val === "object" &&
          Array.isArray((val as { tokens?: unknown }).tokens)
        ? (val as { tokens: unknown[] }).tokens
        : val &&
            typeof val === "object" &&
            Array.isArray((val as { words?: unknown }).words)
          ? (val as { words: unknown[] }).words
          : null;
    if (!list) continue;
    list.forEach((t, i) => {
      const tok = asToken(t, ref, i);
      if (tok) out.push({ ...tok, ref });
    });
  }
  return out.sort((a, b) => a.ref - b.ref || a.i - b.i);
}

/** bible-v2 장 파일 → word-study 토큰 형태 (word-study 미생성 시 폴백) */
async function loadFromBibleV2(
  book: string,
  chapter: number,
): Promise<WordStudyToken[]> {
  const res = await fetch(`/bible-v2/chapters/${book}/${chapter}.json`, {
    cache: "default",
  });
  if (!res.ok) return [];
  const raw = (await res.json()) as {
    verses?: {
      n?: number;
      tokens?: {
        w?: string;
        p?: string;
        gloss?: string;
        lemma?: string;
        lemmaP?: string;
        parse?: string;
        parseLabel?: string;
        parseLabelLong?: string;
        strong?: string;
        posLabel?: string;
      }[];
    }[];
  };
  const out: WordStudyToken[] = [];
  for (const v of raw.verses ?? []) {
    const ref = v.n ?? 0;
    (v.tokens ?? []).forEach((t, i) => {
      const word = (t.w || "").trim();
      if (!word) return;
      out.push({
        ref,
        i,
        word,
        lemma: (t.lemma || word).trim(),
        strong: normalizeStrong(t.strong || ""),
        pron: (t.p || t.lemmaP || "").trim(),
        parse: (t.parse || "").trim(),
        parseKo: (t.parseLabelLong || t.parseLabel || t.posLabel || "").trim(),
        glossKo: (t.gloss || "").trim(),
      });
    });
  }
  return out;
}

export type VerseWordStudyMeta = {
  /** 칩(단어)이 비어 있음 */
  empty: boolean;
  /** 원문·개역 절 경계가 어긋나 이어진 절 */
  split: boolean;
  splitWith: number[];
};

export type ChapterWordStudyLoad = {
  tokens: WordStudyToken[];
  /** public/word-study/{book}/{ch}.json 이 실제로 있었는지 */
  hasFile: boolean;
  /** 시편 표제 등으로 KRV 절 번호가 원문과 어긋남 */
  titleShift?: boolean;
  /** 절 번호 → split/empty 메타 (장 JSON verses[] 기준) */
  verseMeta: Record<number, VerseWordStudyMeta>;
};

export type MatchFailReason =
  | "ok"
  | "empty-query"
  | "no-file"
  | "no-verse"
  | "split"
  | "titleShift"
  | "match-zero";

export type GlossMatchResult = {
  token: WordStudyToken | null;
  nearest: WordStudyToken | null;
  reason: MatchFailReason;
  score: number;
};

const chapterCache = new Map<string, Promise<ChapterWordStudyLoad>>();

export function loadChapterWordStudy(
  book: string,
  chapter: number,
): Promise<ChapterWordStudyLoad> {
  const key = `${book}/${chapter}`;
  const hit = chapterCache.get(key);
  if (hit) return hit;

  const p = (async (): Promise<ChapterWordStudyLoad> => {
    try {
      const res = await fetch(`/word-study/${book}/${chapter}.json`, {
        cache: "default",
      });
      if (res.ok) {
        const json = (await res.json()) as ChapterFile & {
          titleShift?: boolean;
        };
        const tokens = normalizeChapter(json);
        const titleShift = !!json.titleShift;
        const verseMeta = readVerseMeta(json);
        // 토큰이 없어도(전부 빈 절) 파일은 있는 것으로 — 안내 시트를 연다
        return { tokens, hasFile: true, titleShift, verseMeta };
      }
    } catch {
      /* fall through */
    }
    const tokens = await loadFromBibleV2(book, chapter);
    return { tokens, hasFile: false, verseMeta: {} };
  })();

  p.catch(() => chapterCache.delete(key));
  chapterCache.set(key, p);
  return p;
}

export type LexiconLoadMeta = {
  url: string;
  status: number | null;
  error?: string;
};

export function lexiconUrlFor(strong: string): string {
  const id = normalizeStrong(strong);
  const file = id || strong;
  if (/^H/i.test(file)) {
    return `/word-study/lexicon/hebrew/${file}.json`;
  }
  return `/word-study/lexicon/greek/${file}.json`;
}

export function loadWordLexicon(
  strong: string,
  metaOut?: LexiconLoadMeta,
): Promise<WordStudyLexicon | null> {
  const id = normalizeStrong(strong);
  const url = lexiconUrlFor(strong);
  if (metaOut) {
    metaOut.url = url;
    metaOut.status = null;
    delete metaOut.error;
  }
  if (!id) {
    if (metaOut) metaOut.error = "empty-strong";
    return Promise.resolve(null);
  }
  const hit = lexCache.get(id);
  if (hit) {
    return hit.then((v) => {
      if (metaOut && v) metaOut.status = 200;
      return v;
    });
  }

  const p = (async () => {
    try {
      const res = await fetch(url, { cache: "default" });
      if (metaOut) metaOut.status = res.status;
      if (!res.ok) {
        if (metaOut) metaOut.error = `http-${res.status}`;
        return null;
      }
      const raw = (await res.json()) as WordStudyLexicon;
      return {
        ...raw,
        strong: normalizeStrong(raw.strong || id),
        lemma: raw.lemma || "",
      };
    } catch (e) {
      if (metaOut) {
        metaOut.status = null;
        metaOut.error = e instanceof Error ? e.message : "network";
      }
      return null;
    }
  })();

  // 사전 파일이 아직 채워지는 중일 수 있어 없음(null)은 캐시하지 않음
  p.then(
    (v) => {
      if (v == null) lexCache.delete(id);
    },
    () => lexCache.delete(id),
  );
  lexCache.set(id, p);
  return p;
}

export function familyItem(f: WordStudyFamilyItem): {
  lemma: string;
  strong?: string;
  pron?: string;
  glossKo?: string;
} {
  return typeof f === "string" ? { lemma: f } : f;
}

function normalizeKo(s: string): string {
  return s.replace(/\s+/g, "").replace(/[.,;:!?·"'“”‘’()[\]{}]/g, "");
}

function scoreGloss(q: string, glossKo: string): number {
  const g = normalizeKo(glossKo);
  if (!g) return -1;
  let score = 0;
  if (g === q) score = 1000;
  else if (g.includes(q) || q.includes(g)) {
    score = 500 + Math.min(g.length, q.length);
  } else {
    let overlap = 0;
    for (let n = Math.min(g.length, q.length); n >= 1; n -= 1) {
      if (g.includes(q.slice(0, n)) || q.includes(g.slice(0, n))) {
        overlap = n;
        break;
      }
    }
    score = overlap * 10;
  }
  if (glossKo.length <= 1) score -= 50;
  return score;
}

/**
 * 같은 절 토큰만. 한글 뜻 점수는 쓰지 않고,
 * 절 안 글자 위치(0..verseLen)에 가장 가까운 순번을 고른다.
 */
function nearestByChar(
  pool: WordStudyToken[],
  charIndex: number,
  verseLen: number,
): WordStudyToken | null {
  if (pool.length === 0) return null;
  const ordered = [...pool].sort((a, b) => a.i - b.i);
  const len = Math.max(1, verseLen);
  const at = Math.max(0, Math.min(len - 1, charIndex));
  let best = ordered[0];
  let bestD = Infinity;
  for (let k = 0; k < ordered.length; k++) {
    const center = ((k + 0.5) / ordered.length) * len;
    const d = Math.abs(center - at);
    if (d < bestD) {
      bestD = d;
      best = ordered[k];
    }
  }
  return best;
}

/** 선택 한글 ↔ glossKo 유사도 + 실패 사유 */
export function matchTokenByGlossDetailed(
  tokens: WordStudyToken[],
  verse: number,
  selectedKo: string,
  opts?: { titleShift?: boolean; charIndex?: number; verseLen?: number },
): GlossMatchResult {
  const pool = tokens.filter((t) => t.ref === verse);
  const nearest = nearestByChar(
    pool,
    opts?.charIndex ?? 0,
    opts?.verseLen ?? 0,
  );
  const q = normalizeKo(selectedKo);
  if (!q) {
    return {
      token: null,
      nearest,
      reason: "empty-query",
      score: 0,
    };
  }
  if (pool.length === 0) {
    return { token: null, nearest: null, reason: "no-verse", score: 0 };
  }

  let best: WordStudyToken | null = null;
  let bestScore = -1;
  for (const t of pool) {
    const score = scoreGloss(q, t.glossKo);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  const multi =
    /[\s·・,/，]/.test(selectedKo.trim()) ||
    (selectedKo.trim().length >= 4 && bestScore < 500);

  if (bestScore >= 500 && best) {
    return { token: best, nearest: best, reason: "ok", score: bestScore };
  }
  if (opts?.titleShift) {
    return {
      token: null,
      nearest,
      reason: "titleShift",
      score: Math.max(0, bestScore),
    };
  }
  if (multi && bestScore < 500) {
    return {
      token: null,
      nearest,
      reason: "split",
      score: Math.max(0, bestScore),
    };
  }
  return {
    token: null,
    nearest,
    reason: "match-zero",
    score: Math.max(0, bestScore),
  };
}

/** 선택 한글 ↔ glossKo 유사도로 그 절 단어 하나 고르기 */
export function matchTokenByGloss(
  tokens: WordStudyToken[],
  verse: number,
  selectedKo: string,
): WordStudyToken | null {
  const r = matchTokenByGlossDetailed(tokens, verse, selectedKo);
  return r.token ?? r.nearest;
}

export function tokensInVerse(
  tokens: WordStudyToken[],
  verse: number,
): WordStudyToken[] {
  return tokens.filter((t) => t.ref === verse);
}

/** "john.3.16" | "john1 1:2" | "matthew 7:14" | "3:16" → 이동 정보 */
export function parsePhraseRef(
  ref: string,
  currentBook: string,
): { book: string; chapter: number; verse?: number } | null {
  const s = ref.trim();
  if (!s) return null;

  let m = s.match(/^([a-z][a-z0-9]*)\.(\d+)\.(\d+)$/i);
  if (m) {
    return { book: m[1], chapter: Number(m[2]), verse: Number(m[3]) };
  }
  m = s.match(/^([a-z][a-z0-9]*)\s+(\d+)\s*[:：]\s*(\d+)$/i);
  if (m) {
    return { book: m[1], chapter: Number(m[2]), verse: Number(m[3]) };
  }
  m = s.match(/^(\d+)\s*[:：]\s*(\d+)$/);
  if (m) {
    return { book: currentBook, chapter: Number(m[1]), verse: Number(m[2]) };
  }
  m = s.match(/(\d+)\s*장\s*(\d+)/);
  if (m) {
    return { book: currentBook, chapter: Number(m[1]), verse: Number(m[2]) };
  }
  return null;
}
