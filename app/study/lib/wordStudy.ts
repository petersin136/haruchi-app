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
  glossKo?: string;
};

export type WordStudyPhrase = {
  greek: string;
  lemmas?: string[];
  count?: number;
  refs: string[];
};

export type WordStudyLexicon = {
  lemma: string;
  pron?: string;
  strong: string;
  posKo?: string;
  root?: WordStudyRoot | null;
  family?: string[];
  defKo?: string;
  defEn?: string;
  compare?: string;
  compareKo?: string;
  note?: string;
  countNT?: number;
  count1John?: number;
  byBook?: Record<string, number>;
  phrases?: WordStudyPhrase[];
};

type ChapterFile =
  | WordStudyToken[]
  | { words?: WordStudyToken[]; tokens?: WordStudyToken[]; verses?: unknown }
  | Record<string, unknown>;

const chapterCache = new Map<string, Promise<WordStudyToken[]>>();
const lexCache = new Map<string, Promise<WordStudyLexicon | null>>();

function verseNumFromRef(ref: unknown, fallback: number): number {
  if (typeof ref === "number" && Number.isFinite(ref)) return ref;
  if (typeof ref === "string") {
    const m = ref.trim().match(/(?:^|[^\d])(\d+)\s*[:：]\s*\d+/);
    if (m) return Number(m[1]);
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

function normalizeStrong(s: string): string {
  if (!s) return "";
  const m = s.match(/G?(\d+)/i);
  return m ? `G${m[1]}` : s;
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

export function loadChapterWordStudy(
  book: string,
  chapter: number,
): Promise<WordStudyToken[]> {
  const key = `${book}/${chapter}`;
  const hit = chapterCache.get(key);
  if (hit) return hit;

  const p = (async () => {
    try {
      const res = await fetch(`/word-study/${book}/${chapter}.json`, {
        cache: "default",
      });
      if (res.ok) {
        const json = (await res.json()) as ChapterFile;
        const tokens = normalizeChapter(json);
        if (tokens.length > 0) return tokens;
      }
    } catch {
      /* fall through */
    }
    return loadFromBibleV2(book, chapter);
  })();

  p.catch(() => chapterCache.delete(key));
  chapterCache.set(key, p);
  return p;
}

export function loadWordLexicon(
  strong: string,
): Promise<WordStudyLexicon | null> {
  const id = normalizeStrong(strong);
  if (!id) return Promise.resolve(null);
  const hit = lexCache.get(id);
  if (hit) return hit;

  const p = (async () => {
    try {
      const res = await fetch(`/word-study/lexicon/greek/${id}.json`, {
        cache: "default",
      });
      if (!res.ok) return null;
      const raw = (await res.json()) as WordStudyLexicon;
      return {
        ...raw,
        strong: normalizeStrong(raw.strong || id),
        lemma: raw.lemma || "",
      };
    } catch {
      return null;
    }
  })();

  p.catch(() => lexCache.delete(id));
  lexCache.set(id, p);
  return p;
}

function normalizeKo(s: string): string {
  return s.replace(/\s+/g, "").replace(/[.,;:!?·"'“”‘’()[\]{}]/g, "");
}

/** 선택 한글 ↔ glossKo 유사도로 그 절 단어 하나 고르기 */
export function matchTokenByGloss(
  tokens: WordStudyToken[],
  verse: number,
  selectedKo: string,
): WordStudyToken | null {
  const q = normalizeKo(selectedKo);
  if (!q) return null;
  const pool = tokens.filter((t) => t.ref === verse);
  if (pool.length === 0) return null;

  let best: WordStudyToken | null = null;
  let bestScore = -1;

  for (const t of pool) {
    const g = normalizeKo(t.glossKo);
    if (!g) continue;
    let score = 0;
    if (g === q) score = 1000;
    else if (g.includes(q) || q.includes(g)) {
      score = 500 + Math.min(g.length, q.length);
    } else {
      // 부분 겹침
      let overlap = 0;
      for (let n = Math.min(g.length, q.length); n >= 1; n -= 1) {
        if (g.includes(q.slice(0, n)) || q.includes(g.slice(0, n))) {
          overlap = n;
          break;
        }
      }
      score = overlap * 10;
    }
    // 내용어 가산 (짧은 조사·접속사 감점)
    if (t.glossKo.length <= 1) score -= 50;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  return bestScore > 0 ? best : pool.find((t) => t.glossKo) ?? pool[0] ?? null;
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
