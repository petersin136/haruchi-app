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
  /** 어원 설명(한글). 없어도 됨 */
  etymKo?: string;
  /**
   * 구형 어원 필드.
   * 문자열(설명)이거나 `{ lemma, strong, glossKo }` 뿌리 객체일 수 있음.
   */
  etym?: string | WordStudyRoot;
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
  /** "auto" 이면 정의 아래 안내 문구 */
  noteSrc?: string;
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

function verseEntries(
  verses: unknown,
): { ref: number; list: unknown[]; meta: Record<string, unknown> }[] {
  const out: { ref: number; list: unknown[]; meta: Record<string, unknown> }[] =
    [];
  if (!verses) return out;
  if (Array.isArray(verses)) {
    for (const verse of verses) {
      if (!verse || typeof verse !== "object") continue;
      const v = verse as Record<string, unknown>;
      const ref = num(v.n);
      if (!ref) continue;
      const list = Array.isArray(v.words)
        ? (v.words as unknown[])
        : Array.isArray(v.tokens)
          ? (v.tokens as unknown[])
          : [];
      out.push({ ref, list, meta: v });
    }
    return out;
  }
  if (typeof verses !== "object") return out;
  for (const [k, val] of Object.entries(verses as Record<string, unknown>)) {
    if (!val || typeof val !== "object") continue;
    if (Array.isArray(val)) {
      const ref = Number(k);
      if (!Number.isInteger(ref) || ref < 1) continue;
      out.push({ ref, list: val, meta: {} });
      continue;
    }
    const v = val as Record<string, unknown>;
    const refFromN = num(v.n);
    const refFromKey = Number(k);
    const ref =
      refFromN > 0
        ? refFromN
        : Number.isInteger(refFromKey) && refFromKey >= 1
          ? refFromKey
          : 0;
    if (!ref) continue;
    const list = Array.isArray(v.words)
      ? (v.words as unknown[])
      : Array.isArray(v.tokens)
        ? (v.tokens as unknown[])
        : [];
    out.push({ ref, list, meta: v });
  }
  return out;
}

function readVerseMeta(raw: ChapterFile): Record<number, VerseWordStudyMeta> {
  const out: Record<number, VerseWordStudyMeta> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const verses = (raw as { verses?: unknown }).verses;
  for (const { ref, list, meta } of verseEntries(verses)) {
    const splitWith = Array.isArray(meta.splitWith)
      ? meta.splitWith.filter((n): n is number => typeof n === "number" && n > 0)
      : [];
    out[ref] = {
      empty: list.length === 0,
      split: !!meta.split || !!meta.wordSplit || splitWith.length >= 2,
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

  // verses: 배열 | { "0": { n, words }, ... } | { "1": [...] }
  // 객체 키(0,1,…)가 아니라 각 항목의 n / 토큰 ref 를 절 번호로 쓴다.
  if (o.verses != null) {
    const out: WordStudyToken[] = [];
    for (const { ref, list } of verseEntries(o.verses)) {
      list.forEach((t, i) => {
        const tok = asToken(t, ref, i);
        if (tok) out.push({ ...tok, ref });
      });
    }
    if (out.length > 0) {
      return out.sort((a, b) => a.ref - b.ref || a.i - b.i);
    }
  }

  // 최상위가 절 맵인 경우
  const out: WordStudyToken[] = [];
  for (const { ref, list } of verseEntries(o)) {
    if (ref < 1) continue;
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

/** gloss = ① 칩 glossKo, lexicon = ② 사전 한글 필드, none = 못 고름 */
export type GlossMatchStage = "gloss" | "lexicon" | "none";

export type GlossMatchResult = {
  token: WordStudyToken | null;
  reason: MatchFailReason;
  score: number;
  stage: GlossMatchStage;
  /** 같은 점수로 겹친 다른 strong (있으면 자동 선택 안 함) */
  tiedStrongs?: string[];
};

export type GlossMatchOpts = {
  titleShift?: boolean;
  /** 선택에서 뗀 본체(「핍박하거든」→「핍박」). 없으면 선택 전체 */
  stem?: string;
  /** 본체 뒤가 「하/되/시키/케」 — 동사 칩을 우선 */
  verbal?: boolean;
  /** 같은 절에서 이 본체가 몇 번째로 나온 것인지(0부터). 같은 strong 칩이 여럿일 때 */
  occurrence?: number;
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
  if (typeof f === "string") return { lemma: f };
  if (!f || typeof f !== "object") return { lemma: "" };
  return {
    lemma: typeof f.lemma === "string" ? f.lemma : "",
    strong: typeof f.strong === "string" ? f.strong : undefined,
    pron: typeof f.pron === "string" ? f.pron : undefined,
    glossKo: typeof f.glossKo === "string" ? f.glossKo : undefined,
  };
}

function normalizeKo(s: string): string {
  return s.replace(/\s+/g, "").replace(/[.,;:!?·"'“”‘’()[\]{}]/g, "");
}

/** 관사·전치사·접속사·대명사 칩은 본문 단어 짝 후보에서 뺀다 */
const FUNCTION_POS_RE = /관사|전치사|접속사|대명사/;

export function isFunctionWordToken(t: WordStudyToken, posKo?: string): boolean {
  const head = (t.parseKo || "").split(/[,，·]/)[0] ?? "";
  if (FUNCTION_POS_RE.test(head)) return true;
  return !!posKo && FUNCTION_POS_RE.test(posKo);
}

/** 「사랑하다」→「사랑」, 「쫓다」→「쫓」 */
function stripDictEnding(g: string): string {
  if (g.length > 2 && g.endsWith("하다")) return g.slice(0, -2);
  if (g.length > 1 && g.endsWith("다")) return g.slice(0, -1);
  return g;
}

/** ① 칩 glossKo에 본체가 들어 있는지. 0 = 아님 */
function scoreGloss(q: string, glossKo: string, verbal: boolean): number {
  const g = normalizeKo(glossKo);
  if (!g || !q) return 0;
  const gs = stripDictEnding(g);
  let score = 0;
  if (g === q) score = 1000;
  else if (gs === q) score = 900;
  else if (q.length >= 2 && (gs.includes(q) || g.includes(q))) {
    score = 500 + q.length;
  }
  if (score > 0 && verbal && g.endsWith("다") && g !== q) score += 200;
  return score;
}

type Scored = { token: WordStudyToken; score: number };

/** 최고점이 한 strong으로 모이면 그 칩(같은 strong 여럿이면 occurrence 번째) */
function pickBest(
  scored: Scored[],
  occurrence: number,
): { token: WordStudyToken | null; score: number; tied: string[] } {
  const top = scored.reduce((m, s) => Math.max(m, s.score), 0);
  if (top <= 0) return { token: null, score: 0, tied: [] };
  const best = scored
    .filter((s) => s.score === top)
    .map((s) => s.token)
    .sort((a, b) => a.i - b.i);
  const strongs = [...new Set(best.map((t) => t.strong || t.lemma))];
  if (strongs.length > 1) return { token: null, score: top, tied: strongs };
  const k = Math.max(0, Math.min(best.length - 1, occurrence));
  return { token: best[k] ?? null, score: top, tied: [] };
}

function failReason(
  selectedKo: string,
  opts?: GlossMatchOpts,
): MatchFailReason {
  if (opts?.titleShift) return "titleShift";
  if (/[\s·・,/，]/.test(selectedKo.trim())) return "split";
  return "match-zero";
}

/** ① 선택 본체 ↔ 칩 glossKo(끝 「하다/다」 뗀 것 포함). 동기 */
export function matchTokenByGlossDetailed(
  tokens: WordStudyToken[],
  verse: number,
  selectedKo: string,
  opts?: GlossMatchOpts,
): GlossMatchResult {
  const pool = tokens.filter((t) => t.ref === verse);
  const q = normalizeKo(opts?.stem || selectedKo);
  if (!q) {
    return { token: null, reason: "empty-query", score: 0, stage: "none" };
  }
  if (pool.length === 0) {
    return { token: null, reason: "no-verse", score: 0, stage: "none" };
  }
  const scored = pool
    .filter((t) => !isFunctionWordToken(t))
    .map((t) => ({ token: t, score: scoreGloss(q, t.glossKo, !!opts?.verbal) }));
  const best = pickBest(scored, opts?.occurrence ?? 0);
  if (best.token) {
    return { token: best.token, reason: "ok", score: best.score, stage: "gloss" };
  }
  if (!best.tied.length) {
    // 본체를 못 뗀 어절(「창조하시니라」「사랑이심이라」): 앞부분이 칩 뜻과 똑같을 때만
    for (let n = q.length - 1; n >= 2; n -= 1) {
      const p = q.slice(0, n);
      const verbal = /^(하|되|시키|케)/.test(q.slice(n));
      const exact = pool
        .filter((t) => !isFunctionWordToken(t))
        .map((t) => {
          const g = normalizeKo(t.glossKo);
          const s = g === p ? 1000 : stripDictEnding(g) === p ? 900 : 0;
          return {
            token: t,
            score: s > 0 && verbal && g.endsWith("다") && g !== p ? s + 200 : s,
          };
        });
      const hit = pickBest(exact, opts?.occurrence ?? 0);
      if (hit.token) {
        return { token: hit.token, reason: "ok", score: hit.score, stage: "gloss" };
      }
      if (hit.tied.length) break;
    }
  }
  return {
    token: null,
    reason: failReason(selectedKo, opts),
    score: best.score,
    stage: "none",
    tiedStrongs: best.tied.length ? best.tied : undefined,
  };
}

/** 따옴표·낫표 안 인용문(「…창조하시니라」, '이처럼 사랑하사')은 뜻풀이가 아니라서 뺀다 */
function stripQuoted(s: string): string {
  return s.replace(/'[^']*'|‘[^’]*’|"[^"]*"|“[^”]*”|「[^」]*」|『[^』]*』/g, " ");
}

/**
 * 사전 한글 필드별 가중치. family·root·etym 객체의 glossKo는
 * 다른 낱말 뜻(「살인자」⊃「인자」 등)이라 넣지 않는다.
 */
function lexiconKoFields(lex: WordStudyLexicon): { text: string; w: number }[] {
  const out: { text: string; w: number }[] = [];
  const add = (v: unknown, w: number, prose: boolean) => {
    const t = str(v);
    if (t) out.push({ text: normalizeKo(prose ? stripQuoted(t) : t), w });
  };
  const raw = lex as WordStudyLexicon & { glossKo?: unknown };
  add(raw.glossKo, 4, false);
  add(lex.usageKo, 4, false);
  for (const p of lex.phrases ?? []) {
    add((p as { glossKo?: unknown }).glossKo, 3, false);
  }
  add(lex.defKo, 2, true);
  add(lex.nameMeaning, 2, true);
  add(lex.etymKo, 1, true);
  if (typeof lex.etym === "string") add(lex.etym, 1, true);
  add(lex.compareKo, 1, true);
  add(lex.note, 1, true);
  return out;
}

/** ② 칩 strong 사전의 한글 필드에 본체가 들어 있는지. 비동기(사전 fetch) */
export async function matchTokenByLexicon(
  tokens: WordStudyToken[],
  verse: number,
  selectedKo: string,
  opts?: GlossMatchOpts,
): Promise<GlossMatchResult> {
  const q = normalizeKo(opts?.stem || selectedKo);
  const pool = tokens.filter((t) => t.ref === verse && !!t.strong);
  if (q.length < 2 || pool.length === 0) {
    return {
      token: null,
      reason: failReason(selectedKo, opts),
      score: 0,
      stage: "none",
    };
  }
  const cands = pool.filter((t) => !isFunctionWordToken(t));
  const lexes = await Promise.all(cands.map((t) => loadWordLexicon(t.strong)));
  const scored: Scored[] = [];
  cands.forEach((t, k) => {
    const lex = lexes[k];
    if (!lex || isFunctionWordToken(t, lex.posKo)) return;
    let score = 0;
    for (const f of lexiconKoFields(lex)) {
      if (f.text.includes(q)) score = Math.max(score, f.w);
    }
    scored.push({ token: t, score });
  });
  const best = pickBest(scored, opts?.occurrence ?? 0);
  if (best.token) {
    return {
      token: best.token,
      reason: "ok",
      score: best.score,
      stage: "lexicon",
    };
  }
  return {
    token: null,
    reason: failReason(selectedKo, opts),
    score: best.score,
    stage: "none",
    tiedStrongs: best.tied.length ? best.tied : undefined,
  };
}

/** ① → ② 순서로 짝 칩 고르기. 둘 다 실패면 token null(자동 선택 없음) */
export async function matchTokenForSelection(
  tokens: WordStudyToken[],
  verse: number,
  selectedKo: string,
  opts?: GlossMatchOpts,
): Promise<GlossMatchResult> {
  const first = matchTokenByGlossDetailed(tokens, verse, selectedKo, opts);
  if (first.token || first.reason === "empty-query" || first.reason === "no-verse") {
    return first;
  }
  if (first.tiedStrongs) return first;
  return matchTokenByLexicon(tokens, verse, selectedKo, opts);
}

/** 선택 한글 ↔ glossKo로 그 절 단어 하나 고르기(① 단계만, 실패 시 null) */
export function matchTokenByGloss(
  tokens: WordStudyToken[],
  verse: number,
  selectedKo: string,
  opts?: GlossMatchOpts,
): WordStudyToken | null {
  return matchTokenByGlossDetailed(tokens, verse, selectedKo, opts).token;
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
