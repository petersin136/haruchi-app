"use client";

/**
 * LayeredBibleViewer — "성경 공부" 다중 역본 레이어 뷰어 (구약 39 + 신약 27 = 66권).
 *
 * 한 절을 기준으로, 사용자가 켠 역본(레이어)들이 그 절 아래 layerOrder 순서대로
 * 층층이 쌓여 보인다. 영어만 켜면 한 줄, 영어+한글이면 두 줄, 헬라어/히브리어까지
 * 켜면 세 줄… 식으로 누적 표시. NT 는 5층(영어/개역/헬라/헬라의역/어린이),
 * OT 는 4층(영어/개역/히브리/어린이 — 히브리 의역은 미보유).
 *
 *   - text 레이어  : 모든 역본이 동일한 테마 폰트·크기를 상속. 레이어 구분은
 *                    오직 줄 앞의 색상 점 + 짧은 라벨로만 한다.
 *   - greek 레이어 : 단어 블록(헬라어 / 발음 / 뜻 3줄 세로). 단어 클릭 시 그 아래
 *                    원형·품사·격수성·시제태법·확장 의미·풀이 카드를 펼친다.
 *   - 토글 상태와 "토글 순서" 모두 localStorage 에 저장 → 다음에 와도 유지.
 *   - 토글 5개는 드래그(모바일은 길게 눌러서)로 순서 재배치 가능. 그 순서가
 *     곧 layerOrder 가 되어 각 절 아래 레이어 누적 순서에 즉시 반영된다.
 *   - 절마다 복사 버튼: "현재 켜둔 레이어"를 사용자 순서대로 한 절씩 깔끔한
 *                       텍스트로 복사. 헬라어는 단어 블록이 아니라 원문 한 줄.
 *
 * 데이터:
 *   - bookId 에 따라 `app/bible-study/data/<bookId>.json` 을 lazy import.
 *   - 한 책의 모든 장이 한 파일에 들어 있어, 같은 책의 장 전환은 즉시 가능.
 *   - 책을 바꾸면 새 파일을 fetch (Next.js 가 자동 chunk 분리).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

// ── 타입 ────────────────────────────────────────────────────────────────────
type LayerId =
  | "english"
  | "krv"
  | "greek"
  | "greekpara"
  | "kids"
  | "hebrew"
  | "hebrewpara";

// 신약 27권.
export type StudyNTBookId =
  | "matthew"
  | "mark"
  | "luke"
  | "john"
  | "acts"
  | "romans"
  | "corinthians1"
  | "corinthians2"
  | "galatians"
  | "ephesians"
  | "philippians"
  | "colossians"
  | "thessalonians1"
  | "thessalonians2"
  | "timothy1"
  | "timothy2"
  | "titus"
  | "philemon"
  | "hebrews"
  | "james"
  | "peter1"
  | "peter2"
  | "john1"
  | "john2"
  | "john3"
  | "jude"
  | "revelation";

// 구약 39권.
export type StudyOTBookId =
  | "genesis"
  | "exodus"
  | "leviticus"
  | "numbers"
  | "deuteronomy"
  | "joshua"
  | "judges"
  | "ruth"
  | "samuel1"
  | "samuel2"
  | "kings1"
  | "kings2"
  | "chronicles1"
  | "chronicles2"
  | "ezra"
  | "nehemiah"
  | "esther"
  | "job"
  | "psalms"
  | "proverbs"
  | "ecclesiastes"
  | "songofsolomon"
  | "isaiah"
  | "jeremiah"
  | "lamentations"
  | "ezekiel"
  | "daniel"
  | "hosea"
  | "joel"
  | "amos"
  | "obadiah"
  | "jonah"
  | "micah"
  | "nahum"
  | "habakkuk"
  | "zephaniah"
  | "haggai"
  | "zechariah"
  | "malachi";

export type StudyBookId = StudyNTBookId | StudyOTBookId;

type GreekWord = {
  word: string;
  pron: string;
  meaning: string;
  lemma: string;
  morph: string;
  pos?: string;
  meanings?: string[];
  nameType?: "person" | "place";
  note?: string;
};

type TextLayer = { type: "text"; content: string };
type WordblockLayer = { type: "wordblock"; text: string; words: GreekWord[] };
type AnyLayer = TextLayer | WordblockLayer;

type Verse = {
  ref: string;
  layers: Partial<Record<LayerId, AnyLayer>>;
};

type StudyChapter = {
  chapter: number;
  verses: Verse[];
};

type StudyBookData = {
  book: string;
  bookId: StudyBookId;
  testament?: "nt" | "ot";
  layerOrder: LayerId[];
  layerLabels: Partial<Record<LayerId, string>>;
  defaultOn: LayerId[];
  sources?: Partial<Record<LayerId, string>>;
  chapters: StudyChapter[];
};

// ── 청크/manifest 스키마 ─────────────────────────────────────────────────────
// 책 한 권을 통째 fetch 하면 첫 진입이 느리고(예: 창세기 5MB+) 화면이 깨져 보인다.
// 따라서 데이터를 작은 manifest + (장, 레이어) 조합 청크로 나눠 받는다.
//   - manifest:  /bible-study/chunks/<book>/manifest.json — 메타 + 절 갯수만.
//   - 청크:      /bible-study/chunks/<book>/<ch>/<layer>.json — 그 한 장의 한 레이어.
// 첫 진입은 (manifest + 현재 장의 defaultOn 레이어) 만 받아 가볍다. 다른 레이어를
// 켜거나 다른 장으로 이동하면 그때 그 청크를 추가로 fetch 한다.
type ChapterMeta = { chapter: number; verseCount: number };

type BookManifest = {
  book: string;
  bookId?: StudyBookId;
  testament?: "nt" | "ot";
  layerOrder: LayerId[];
  layerLabels: Partial<Record<LayerId, string>>;
  defaultOn: LayerId[];
  sources?: Partial<Record<LayerId, string>>;
  chapters: ChapterMeta[];
};

type LayerChunk = {
  chapter: number;
  layer: LayerId;
  verses: Record<string, AnyLayer>;
};

// ── 모듈 레벨 캐시 — 같은 책/장/레이어를 두 번 받지 않는다.
//   재마운트(예: 모드 토글로 컴포넌트가 잠깐 사라졌다 돌아옴) 사이에서도 살아있다.
const manifestCache = new Map<StudyBookId, Promise<BookManifest>>();
const chunkCache = new Map<string, Promise<LayerChunk>>();

function chunkKey(book: StudyBookId, ch: number, layer: LayerId) {
  return `${book}|${ch}|${layer}`;
}

async function loadManifest(book: StudyBookId): Promise<BookManifest> {
  const cached = manifestCache.get(book);
  if (cached) return cached;
  const p = (async () => {
    // `force-cache` 는 데이터 재빌드 후에도 옛 파일을 안고 있으므로 위험.
    // HTTP 캐시 헤더(+ETag) 에 맡기는 `default` 가 dev/prod 모두 안전.
    const res = await fetch(`/bible-study/chunks/${book}/manifest.json`, {
      cache: "default",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${book} manifest 없음`);
    return (await res.json()) as BookManifest;
  })();
  manifestCache.set(book, p);
  p.catch(() => manifestCache.delete(book));
  return p;
}

async function loadLayerChunk(
  book: StudyBookId,
  ch: number,
  layer: LayerId,
): Promise<LayerChunk> {
  const k = chunkKey(book, ch, layer);
  const cached = chunkCache.get(k);
  if (cached) return cached;
  const p = (async () => {
    const res = await fetch(
      `/bible-study/chunks/${book}/${ch}/${layer}.json`,
      { cache: "default" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${book} ${ch}장 ${layer} 없음`);
    return (await res.json()) as LayerChunk;
  })();
  chunkCache.set(k, p);
  p.catch(() => chunkCache.delete(k));
  return p;
}

// 정본(폴백) 라벨/순서. 데이터 파일이 채워두지 않았을 때도 동일 기본값.
// NT 5층 기본 — 책 데이터의 layerOrder 가 우선한다(OT 는 4층).
const DEFAULT_LAYER_ORDER: LayerId[] = [
  "english",
  "krv",
  "greek",
  "greekpara",
  "kids",
];
const DEFAULT_LAYER_LABELS: Record<LayerId, string> = {
  english: "영어(WEB)",
  krv: "개역한글",
  greek: "헬라어",
  greekpara: "헬라 의역",
  kids: "어린이 의역",
  hebrew: "히브리어",
  hebrewpara: "히브리 의역",
};
const DEFAULT_ON: LayerId[] = ["english", "krv"];

// 레이어별 표시 메타 — 색상 점 + 짧은 라벨.
const LAYER_META: Record<LayerId, { dot: string; short: string }> = {
  english: { dot: "#3B6EA5", short: "영어" },
  krv: { dot: "#9A9AA0", short: "개역" },
  greek: { dot: "#2E5D4B", short: "헬라" },
  greekpara: { dot: "#6F9C84", short: "헬라의역" },
  kids: { dot: "#B58A2A", short: "어린이" },
  hebrew: { dot: "#7A4E2A", short: "히브리" },
  hebrewpara: { dot: "#C29B6A", short: "히브리의역" },
};

// 켜진 역본 목록과 토글 "순서" 는 별도 키로 저장. 한쪽만 바뀌어도 안전.
// 신약 27권 어디서든 동일 사용자 취향이 유지되도록 단일 키로 통일.
const ON_STORAGE_KEY = "haruchi.bibleStudy.layers";
const ORDER_STORAGE_KEY = "haruchi.bibleStudy.order";

function loadStoredArray(key: string, valid: LayerId[]): LayerId[] | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x): x is LayerId => valid.includes(x));
  } catch {
    return null;
  }
}

// 저장된 순서 + 정본 layerOrder 를 합쳐 누락된 항목은 뒤에 붙여 길이 보존.
function mergedOrder(stored: LayerId[] | null, all: LayerId[]): LayerId[] {
  if (!stored || stored.length === 0) return all;
  const seen = new Set<LayerId>();
  const out: LayerId[] = [];
  for (const id of stored) {
    if (!seen.has(id) && all.includes(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  for (const id of all) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// 현재 켠 레이어를 사용자 순서(order) 대로 한 절치 깔끔한 텍스트로.
// 헬라어는 단어 블록이 아니라 원문 한 줄로만 복사.
function buildVerseCopy(
  verse: Verse,
  onLayers: LayerId[],
  order: LayerId[],
): string {
  const lines: string[] = [verse.ref];
  for (const id of order) {
    if (!onLayers.includes(id)) continue;
    const layer = verse.layers[id];
    if (!layer) continue;
    if (layer.type === "wordblock") {
      if (layer.text.trim()) lines.push(layer.text.trim());
    } else if (layer.content.trim()) {
      lines.push(layer.content.trim());
    }
  }
  return lines.join("\n");
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 15V5a2 2 0 0 1 2-2h8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

// 드래그 임계값.
//   - 마우스: 6px 이상 움직여야 드래그 모드 진입.
//   - 터치 : 220ms 이상 누른 채로 있어야 드래그 모드 진입(스크롤과 구분).
//   - 터치에서 드래그 진입 전에 움직임이 너무 크면 스크롤로 판단해 취소.
const DRAG_MOUSE_PX = 6;
const DRAG_TOUCH_HOLD_MS = 220;
const DRAG_TOUCH_CANCEL_PX = 10;
// 드래그 직후 따라오는 합성 click 을 잠시 무시할 시간.
const SUPPRESS_CLICK_MS = 500;

type LayeredBibleViewerProps = {
  /**
   * 기존 사이트 레이아웃(.brp-reader 카드) 안에 임베드 모드로 렌더할지 여부.
   *   true  → 자체 큰 타이틀("로마서 1장") 과 sticky 헤더를 숨겨, 부모 카드의
   *           hero/미니바 와 중복되지 않게 한다. 푸터(라이선스) 는 그대로 유지.
   *   false → 단독 페이지용. 자체 타이틀 + sticky 헤더 모두 표시.
   * 기본 false (이전 동작과 호환).
   */
  embedded?: boolean;
  /**
   * 신약 27권 중 어느 책의 어느 장을 보여줄지. 책이 바뀌면 그 책의 데이터
   * 파일을 새로 fetch 하고, 같은 책 내에서 장만 바뀌면 즉시 전환된다.
   * 미지정이면 로마서 1장(이전 동작과의 호환).
   */
  bookId?: StudyBookId;
  chapter?: number;
};

export default function LayeredBibleViewer({
  embedded = false,
  bookId = "romans",
  chapter = 1,
}: LayeredBibleViewerProps = {}) {
  // ── 책 manifest + 장별/레이어별 청크 lazy load ───────────────────────────
  // bookId 가 바뀌면 manifest 를 새로 받고, chapter 만 바뀌면 같은 manifest 안에서
  // 절 갯수만 가져온다. 켠 레이어의 (book, ch, layer) 청크만 추가로 fetch.
  const [manifest, setManifest] = useState<BookManifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 현재 (book, chapter) 의 레이어별 청크. 장이 바뀌면 비우고 다시 채운다.
  const [chunkByLayer, setChunkByLayer] = useState<Map<LayerId, LayerChunk>>(
    () => new Map(),
  );
  const [loadingLayers, setLoadingLayers] = useState<Set<LayerId>>(
    () => new Set(),
  );
  const [layerErrors, setLayerErrors] = useState<Map<LayerId, string>>(
    () => new Map(),
  );

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setManifest(null);
    setChunkByLayer(new Map());
    setLoadingLayers(new Set());
    setLayerErrors(new Map());
    loadManifest(bookId)
      .then((m) => {
        if (!cancelled) setManifest(m);
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("성경공부 manifest 로드 실패", e);
          setLoadError(
            e instanceof Error ? e.message : "데이터를 불러오지 못했어요.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // 정본 layerOrder/labels — 데이터가 들어와도 같은 값을 사용.
  const layerOrderAll: LayerId[] = useMemo(
    () => manifest?.layerOrder ?? DEFAULT_LAYER_ORDER,
    [manifest],
  );
  // 책 manifest 의 라벨이 일부만 있으면 정본 라벨로 보완.
  const layerLabels = useMemo<Record<LayerId, string>>(
    () => ({ ...DEFAULT_LAYER_LABELS, ...(manifest?.layerLabels ?? {}) }),
    [manifest],
  );

  // 현재 장 메타 — chapter 가 책 범위를 벗어나면 마지막 장으로 클램프.
  const currentChapterMeta = useMemo<ChapterMeta | null>(() => {
    if (!manifest) return null;
    const found = manifest.chapters.find((c) => c.chapter === chapter);
    if (found) return found;
    return manifest.chapters[manifest.chapters.length - 1] ?? null;
  }, [manifest, chapter]);

  const effectiveChapter = currentChapterMeta?.chapter ?? chapter;

  // SSR 초기값은 정본 — hydration 이후 localStorage 로 동기화.
  const [onLayers, setOnLayers] = useState<LayerId[]>(DEFAULT_ON);
  const [layerOrder, setLayerOrder] = useState<LayerId[]>(DEFAULT_LAYER_ORDER);
  const [openWord, setOpenWord] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [draggingId, setDraggingId] = useState<LayerId | null>(null);

  // 토글 DOM ref 모음 — 드래그 중 좌표 → id 매핑에 사용.
  const itemRefs = useRef<Map<LayerId, HTMLButtonElement>>(new Map());
  // 진행 중인 드래그 제스처 상태.
  const dragRef = useRef<{
    id: LayerId;
    startX: number;
    startY: number;
    pointerType: string;
    pointerId: number;
    longPressTimer: number | null;
    active: boolean;
  } | null>(null);
  // 드래그 직후 click 한 번 무시.
  const suppressClickUntilRef = useRef(0);

  useEffect(() => {
    const storedOn = loadStoredArray(ON_STORAGE_KEY, layerOrderAll);
    // 저장값이 비어 있거나, 옛 빌드에서 저장된 값이라 현재 유효 LayerId 와
    // 모두 mismatch 인 경우 → setOnLayers([]) 가 되어 청크 fetch effect 가
    // 한 줄도 트리거되지 않고 placeholder 만 영구히 보이는 사고를 막는다.
    // 매니페스트가 도착했으면 그 책의 defaultOn 으로, 아직이면 NT 기본값으로
    // 폴백.
    const fallbackOn = manifest?.defaultOn?.length
      ? manifest.defaultOn
      : DEFAULT_ON;
    if (storedOn && storedOn.length > 0) {
      setOnLayers(storedOn);
    } else {
      setOnLayers(fallbackOn);
    }
    const storedOrder = loadStoredArray(ORDER_STORAGE_KEY, layerOrderAll);
    setLayerOrder(mergedOrder(storedOrder, layerOrderAll));
    setHydrated(true);
    // 데이터의 layerOrder 가 후속 책에서 달라질 가능성도 대비해 layerOrderAll
    // 변경 시 한 번 더 정렬을 동기화. (현재는 모든 책이 동일한 5개 레이어.)
  }, [layerOrderAll, manifest]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(ON_STORAGE_KEY, JSON.stringify(onLayers));
    } catch {
      /* ignore */
    }
  }, [onLayers, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(layerOrder));
    } catch {
      /* ignore */
    }
  }, [layerOrder, hydrated]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1400);
    return () => window.clearTimeout(t);
  }, [toast]);

  // 장 또는 책이 바뀌면 현재 장의 청크 상태를 비운다 — 캐시는 살아있어
  // 같은 (book, ch, layer) 로 돌아오면 fetch 가 일어나지 않는다.
  useEffect(() => {
    setChunkByLayer(new Map());
    setLoadingLayers(new Set());
    setLayerErrors(new Map());
  }, [bookId, effectiveChapter]);

  // 켠 레이어 / 장 / 책이 바뀌면 필요한 (장, 레이어) 청크를 lazy 로 가져온다.
  // 이미 캐시에 있거나 받는 중이면 skip — 두 번 받지 않는다.
  useEffect(() => {
    if (!manifest) return;
    let cancelled = false;
    for (const layer of onLayers) {
      if (chunkByLayer.has(layer)) continue;
      if (loadingLayers.has(layer)) continue;
      setLoadingLayers((prev) => {
        if (prev.has(layer)) return prev;
        const next = new Set(prev);
        next.add(layer);
        return next;
      });
      loadLayerChunk(bookId, effectiveChapter, layer)
        .then((chunk) => {
          if (cancelled) return;
          setChunkByLayer((prev) => {
            const next = new Map(prev);
            next.set(layer, chunk);
            return next;
          });
          setLoadingLayers((prev) => {
            if (!prev.has(layer)) return prev;
            const next = new Set(prev);
            next.delete(layer);
            return next;
          });
          setLayerErrors((prev) => {
            if (!prev.has(layer)) return prev;
            const next = new Map(prev);
            next.delete(layer);
            return next;
          });
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          console.error(
            `bible-study 청크 로드 실패: ${bookId}/${effectiveChapter}/${layer}`,
            e,
          );
          setLoadingLayers((prev) => {
            if (!prev.has(layer)) return prev;
            const next = new Set(prev);
            next.delete(layer);
            return next;
          });
          setLayerErrors((prev) => {
            const next = new Map(prev);
            next.set(
              layer,
              e instanceof Error ? e.message : "청크를 불러오지 못했어요.",
            );
            return next;
          });
        });
    }
    return () => {
      cancelled = true;
    };
    // chunkByLayer / loadingLayers 는 effect 내부에서 setter 로 다루므로 deps 에서
    // 빼도 안전 — onLayers / chapter / book 변화 시점에만 새 fetch 시도.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, bookId, effectiveChapter, onLayers]);

  const isOn = useCallback((id: LayerId) => onLayers.includes(id), [onLayers]);

  const toggleLayer = useCallback((id: LayerId) => {
    setOnLayers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const toggleWord = useCallback((key: string) => {
    setOpenWord((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleCopy = useCallback(
    async (ref: string) => {
      const layers: Partial<Record<LayerId, AnyLayer>> = {};
      for (const id of onLayers) {
        const got = chunkByLayer.get(id)?.verses?.[ref];
        if (got) layers[id] = got;
      }
      const text = buildVerseCopy({ ref, layers }, onLayers, layerOrder);
      const ok = await writeClipboard(text);
      setToast(ok ? `${ref} 복사됨` : "복사에 실패했어요");
    },
    [onLayers, layerOrder, chunkByLayer],
  );

  // ── 드래그 핸들러 ──────────────────────────────────────────────────────────
  // 포인터 좌표 → 어떤 토글 위에 있는지 식별 (현재 시각적 순서 기준).
  const findIdAt = useCallback((x: number, y: number): LayerId | null => {
    for (const id of layerOrder) {
      const el = itemRefs.current.get(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
    }
    return null;
  }, [layerOrder]);

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    if (d?.longPressTimer != null) window.clearTimeout(d.longPressTimer);
    if (d?.active) {
      suppressClickUntilRef.current = Date.now() + SUPPRESS_CLICK_MS;
    }
    dragRef.current = null;
    setDraggingId(null);
  }, []);

  const onItemPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, id: LayerId) => {
      // 마우스 좌클릭만 — 우클릭/중간클릭은 무시.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // 다른 드래그가 진행 중이면 무시.
      if (dragRef.current) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const longPressTimer =
        e.pointerType === "touch" || e.pointerType === "pen"
          ? window.setTimeout(() => {
              const d = dragRef.current;
              if (!d || d.active) return;
              d.active = true;
              setDraggingId(d.id);
              try {
                (
                  navigator as Navigator & { vibrate?: (p: number) => boolean }
                ).vibrate?.(12);
              } catch {
                /* ignore */
              }
            }, DRAG_TOUCH_HOLD_MS)
          : null;
      dragRef.current = {
        id,
        startX: e.clientX,
        startY: e.clientY,
        pointerType: e.pointerType,
        pointerId: e.pointerId,
        longPressTimer,
        active: false,
      };
    },
    [],
  );

  const onItemPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const dist = Math.hypot(dx, dy);

      if (!d.active) {
        if (d.pointerType === "mouse" && dist > DRAG_MOUSE_PX) {
          d.active = true;
          setDraggingId(d.id);
        } else if (
          (d.pointerType === "touch" || d.pointerType === "pen") &&
          dist > DRAG_TOUCH_CANCEL_PX
        ) {
          // 길게 누르기 발동 전에 손가락이 많이 움직였다 → 스크롤로 보고 취소.
          if (d.longPressTimer != null) window.clearTimeout(d.longPressTimer);
          dragRef.current = null;
          return;
        }
      }
      if (!d.active) return;

      // 활성 드래그 — 페이지 스크롤/선택 방지.
      e.preventDefault();

      const overId = findIdAt(e.clientX, e.clientY);
      if (!overId || overId === d.id) return;
      setLayerOrder((prev) => {
        const from = prev.indexOf(d.id);
        const to = prev.indexOf(overId);
        if (from < 0 || to < 0 || from === to) return prev;
        const next = prev.slice();
        next.splice(from, 1);
        next.splice(to, 0, d.id);
        return next;
      });
    },
    [findIdAt],
  );

  const onItemClick = useCallback(
    (id: LayerId) => {
      // 드래그 직후 따라오는 합성 click 은 한 번 흘려보낸다.
      if (Date.now() < suppressClickUntilRef.current) {
        suppressClickUntilRef.current = 0;
        return;
      }
      toggleLayer(id);
    },
    [toggleLayer],
  );

  // 화면에 그릴 레이어 = 사용자 순서 중 켜진 것만.
  const visibleLayers = useMemo(
    () => layerOrder.filter((id) => onLayers.includes(id)),
    [layerOrder, onLayers],
  );

  // 화면에 그릴 절 목록.
  const bookLabel = manifest?.book ?? "";
  const chapterLabel = currentChapterMeta?.chapter ?? chapter;
  const verseCount = currentChapterMeta?.verseCount ?? 0;
  const buildRef = useCallback(
    (n: number) => `${bookLabel} ${chapterLabel}:${n}`,
    [bookLabel, chapterLabel],
  );

  return (
    <section
      className={`bsv ${embedded ? "bsv--embedded" : ""}`}
      aria-label={
        bookLabel ? `${bookLabel} ${chapterLabel}장 성경 공부` : "성경 공부"
      }
    >
      <header className="bsv-top">
        {!embedded && (
          <div className="bsv-titles">
            <h1 className="bsv-title">
              {bookLabel} {chapterLabel}장
            </h1>
            <p className="bsv-sub">
              켠 역본이 절 아래로 층층이 쌓입니다 · 토글을 드래그(모바일은 길게 눌러서)하면 순서를 바꿀 수 있어요
            </p>
          </div>
        )}
        {embedded && (
          <p className="bsv-sub bsv-sub--embedded">
            토글을 드래그(모바일은 길게 눌러서)하면 절 아래로 쌓이는 순서가 바뀌어요
          </p>
        )}

        <div className="bsv-toggles" role="group" aria-label="역본 토글">
          {layerOrder.map((id) => {
            const active = isOn(id);
            const isDrag = draggingId === id;
            return (
              <button
                key={id}
                ref={(el) => {
                  if (el) itemRefs.current.set(id, el);
                  else itemRefs.current.delete(id);
                }}
                type="button"
                className={`bsv-toggle ${active ? "is-on" : ""} ${
                  isDrag ? "is-dragging" : ""
                } ${draggingId && !isDrag ? "is-drag-other" : ""}`}
                aria-pressed={active}
                aria-grabbed={isDrag}
                onClick={() => onItemClick(id)}
                onPointerDown={(e) => onItemPointerDown(e, id)}
                onPointerMove={onItemPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{ ["--dot" as string]: LAYER_META[id].dot }}
              >
                <span className="bsv-toggle-grip" aria-hidden="true">
                  <span />
                  <span />
                </span>
                <span className="bsv-toggle-dot" aria-hidden="true" />
                {layerLabels[id]}
              </button>
            );
          })}
        </div>
      </header>

      {loadError && (
        <p className="bsv-empty bsv-error">
          데이터를 불러오는 중 오류가 발생했어요 — {loadError}
        </p>
      )}
      {!manifest && !loadError && (
        <ol className="bsv-verses" aria-busy="true" aria-live="polite">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={`sk-${i}`} className="bsv-verse bsv-verse--skeleton">
              <div className="bsv-verse-head">
                <span className="bsv-verse-num bsv-skeleton-pill" aria-hidden="true" />
              </div>
              <div className="bsv-layers">
                <div className="bsv-layer bsv-layer--skeleton">
                  <span className="bsv-tag bsv-skeleton-pill" aria-hidden="true" />
                  <span className="bsv-skeleton-line" aria-hidden="true" />
                </div>
                <div className="bsv-layer bsv-layer--skeleton">
                  <span className="bsv-tag bsv-skeleton-pill" aria-hidden="true" />
                  <span className="bsv-skeleton-line bsv-skeleton-line--short" aria-hidden="true" />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {manifest && verseCount === 0 && (
        <p className="bsv-empty">이 장에는 절 데이터가 없어요.</p>
      )}
      {manifest && verseCount > 0 && visibleLayers.length === 0 && (
        <p className="bsv-empty">위에서 역본을 하나 이상 켜 주세요.</p>
      )}

      {manifest && verseCount > 0 && (
        <ol className="bsv-verses">
          {Array.from({ length: verseCount }, (_, idx) => {
            const n = idx + 1;
            const ref = buildRef(n);
            return (
              <li key={ref} className="bsv-verse">
                <div className="bsv-verse-head">
                  <span className="bsv-verse-num" aria-hidden="true">
                    {n}
                  </span>
                  <button
                    type="button"
                    className="bsv-copy"
                    onClick={() => handleCopy(ref)}
                    aria-label={`${ref} 켠 역본 복사`}
                    title="켠 역본 복사"
                  >
                    <CopyIcon />
                  </button>
                </div>

                <div className="bsv-layers">
                  {visibleLayers.map((id) => {
                    const meta = LAYER_META[id];
                    const chunk = chunkByLayer.get(id);
                    const isLayerLoading = loadingLayers.has(id) && !chunk;
                    const layer = chunk?.verses?.[ref];

                    // 청크가 아직 도착 전 — 그 레이어 한 줄만 스켈레톤.
                    if (!chunk) {
                      return (
                        <div
                          key={id}
                          className={`bsv-layer bsv-layer--${id} bsv-layer--pending`}
                          aria-busy={isLayerLoading || undefined}
                        >
                          <span
                            className="bsv-tag"
                            style={{ ["--dot" as string]: meta.dot }}
                          >
                            <span className="bsv-tag-dot" aria-hidden="true" />
                            <span className="bsv-tag-text">{meta.short}</span>
                          </span>
                          <span
                            className={
                              id === "hebrew"
                                ? "bsv-skeleton-line bsv-skeleton-line--rtl"
                                : "bsv-skeleton-line"
                            }
                            aria-hidden="true"
                          />
                        </div>
                      );
                    }

                    // 청크는 받았는데 그 절은 비어있을 수 있다(예: 어떤 레이어 누락).
                    if (!layer) return null;

                    return (
                      <div key={id} className={`bsv-layer bsv-layer--${id}`}>
                        <span
                          className="bsv-tag"
                          style={{ ["--dot" as string]: meta.dot }}
                        >
                          <span className="bsv-tag-dot" aria-hidden="true" />
                          <span className="bsv-tag-text">{meta.short}</span>
                        </span>

                        {layer.type === "text" ? (
                          <p
                            className="bsv-text"
                            lang={id === "english" ? "en" : "ko"}
                          >
                            {layer.content}
                          </p>
                        ) : (
                          <div
                            className={`bsv-greek ${
                              id === "hebrew" ? "bsv-greek--rtl" : ""
                            }`}
                          >
                            <div
                              className="bsv-words"
                              dir={id === "hebrew" ? "rtl" : "ltr"}
                            >
                              {layer.words.map((w, i) => {
                                const key = `${ref}#${i}`;
                                const open = openWord.has(key);
                                return (
                                  <button
                                    type="button"
                                    key={key}
                                    className={`bsv-word ${open ? "is-open" : ""} ${
                                      w.nameType ? `is-${w.nameType}` : ""
                                    }`}
                                    aria-expanded={open}
                                    aria-label={`${w.word} (${w.pron}) 상세 ${
                                      open ? "닫기" : "열기"
                                    }`}
                                    onClick={() => toggleWord(key)}
                                  >
                                    <span
                                      className="bsv-word-g"
                                      lang={id === "hebrew" ? "he" : "grc"}
                                      dir={id === "hebrew" ? "rtl" : "ltr"}
                                    >
                                      {w.word}
                                    </span>
                                    <span className="bsv-word-p" aria-hidden="true">
                                      {w.pron || "\u00A0"}
                                    </span>
                                    <span className="bsv-word-m" aria-hidden="true">
                                      {w.meaning || "\u00A0"}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>

                            {layer.words.map((w, i) => {
                              const key = `${ref}#${i}`;
                              if (!openWord.has(key)) return null;
                              return (
                                <article key={`d-${key}`} className="bsv-detail">
                                  <header className="bsv-detail-head">
                                    <span
                                      className="bsv-detail-w"
                                      lang={id === "hebrew" ? "he" : "grc"}
                                      dir={id === "hebrew" ? "rtl" : "ltr"}
                                    >
                                      {w.word}
                                    </span>
                                    {w.pron && (
                                      <span className="bsv-detail-p">{w.pron}</span>
                                    )}
                                    {w.nameType && (
                                      <span className={`bsv-detail-tag is-${w.nameType}`}>
                                        {w.nameType === "person" ? "인명" : "지명"}
                                      </span>
                                    )}
                                  </header>
                                  <dl className="bsv-detail-grid">
                                    <dt>원형</dt>
                                    <dd
                                      lang={id === "hebrew" ? "he" : "grc"}
                                      dir={id === "hebrew" ? "rtl" : "ltr"}
                                    >
                                      {w.lemma}
                                    </dd>
                                    {w.pos && (
                                      <>
                                        <dt>품사</dt>
                                        <dd>{w.pos}</dd>
                                      </>
                                    )}
                                    {w.morph && (
                                      <>
                                        <dt>문법</dt>
                                        <dd>{w.morph}</dd>
                                      </>
                                    )}
                                    {w.meanings && w.meanings.length > 0 && (
                                      <>
                                        <dt>뜻</dt>
                                        <dd>{w.meanings.join(" · ")}</dd>
                                      </>
                                    )}
                                    {w.note && (
                                      <>
                                        <dt>풀이</dt>
                                        <dd>{w.note}</dd>
                                      </>
                                    )}
                                  </dl>
                                </article>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {manifest && layerErrors.size > 0 && (
        <p className="bsv-empty bsv-error" role="alert">
          일부 레이어를 불러오지 못했어요 —{" "}
          {Array.from(layerErrors.entries())
            .map(([k, v]) => `${layerLabels[k] ?? k}: ${v}`)
            .join(" / ")}
        </p>
      )}

      <footer className="bsv-footer">
        <small>
          영어 World English Bible (WEB, 퍼블릭 도메인) · 개역한글 (퍼블릭
          도메인) · 헬라어 SBLGNT © Society of Biblical Literature, CC BY 4.0 ·
          형태소 분석 MorphGNT (CC BY-SA 4.0) · 히브리어 WLC (퍼블릭 도메인) ·
          형태소 분석 OSHB morphhb (CC BY 4.0) · 사전 OSHB HebrewLexicon (Strong's·BDB,
          퍼블릭 도메인) · 헬라 의역·어린이 의역은 개역한글 기반으로 직접 제작한
          학습용 자료입니다.
        </small>
      </footer>

      {toast && (
        <div className="bsv-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      <style jsx>{`
        .bsv {
          --bsv-ink: var(--ink, #16161a);
          --bsv-soft: var(--ink-soft, #6b6b70);
          --bsv-mute: var(--ink-mute, #9a9aa0);
          --bsv-line: var(--line, #e6e6e2);
          --bsv-surface: var(--surface, #fff);
          --bsv-accent: var(--accent, #2e5d4b);
          max-width: min(100%, 820px);
          margin: 0 auto;
          padding: 0 16px 80px;
          color: var(--bsv-ink);
          /* 사용자가 설정에서 고른 테마 폰트(--reader-font-family) 를 그대로
             상속받는다. 모든 text 레이어(영어·개역·헬라 의역·어린이 의역) 가
             동일한 폰트·크기로 보이도록, 어린이 레이어용 별도 폰트 지정은
             제거했다. */
          font-family: var(--reader-font-family, inherit);
          font-size: 16px;
        }
        /* 임베드 모드 — 기존 reader 카드 안에 들어가므로 좌우/하단 여백은 부모
           가 잡는다. 자체 패딩은 없애고, sticky 헤더의 blur/배경도 끈다(부모
           카드 자체가 surface 라 중복 효과 방지). */
        .bsv--embedded {
          max-width: 100%;
          padding: 0 0 16px;
        }

        /* ── 상단 헤더 + 토글 ── */
        .bsv-top {
          position: sticky;
          top: 0;
          z-index: 5;
          background: color-mix(in srgb, var(--bg, #fafaf8) 92%, transparent);
          backdrop-filter: saturate(1.2) blur(8px);
          padding: 16px 0 12px;
          margin-bottom: 8px;
          border-bottom: 1px solid var(--bsv-line);
        }
        /* 임베드 모드에서는 부모(.brp-reader) 가 이미 sticky 미니바를 가지고
           있어 중복 sticky 가 어색하다. sticky 해제 + blur/배경 제거 + 위쪽
           패딩만 살짝 줄임. */
        .bsv--embedded .bsv-top {
          position: static;
          background: transparent;
          backdrop-filter: none;
          padding: 4px 0 10px;
        }
        .bsv-titles {
          margin-bottom: 12px;
        }
        .bsv-title {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .bsv-sub {
          margin: 4px 0 0;
          font-size: 13px;
          color: var(--bsv-soft);
        }
        .bsv-sub--embedded {
          margin: 0 0 10px;
        }
        .bsv-toggles {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .bsv-toggle {
          appearance: none;
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 14px 8px 10px;
          font: inherit;
          font-size: 14px;
          font-weight: 600;
          color: var(--bsv-soft);
          background: var(--bsv-surface);
          border: 1px solid var(--bsv-line);
          border-radius: 999px;
          /* 드래그를 깔끔하게 처리하려면 토글 위에서 브라우저 기본 동작(스크롤·
             텍스트 선택·iOS 길게 누르기 메뉴) 을 막아야 한다. */
          touch-action: none;
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
          cursor: grab;
          transition: background 0.15s ease, color 0.15s ease,
            border-color 0.15s ease, transform 0.18s ease,
            box-shadow 0.18s ease, opacity 0.18s ease;
        }
        .bsv-toggle:hover {
          border-color: var(--dot);
          color: var(--bsv-ink);
        }
        /* 드래그 손잡이 — 토글 좌측에 작게 두 줄, hover/on/drag 시 더 진하게.
           순서 변경이 가능하다는 시각 단서. */
        .bsv-toggle-grip {
          display: inline-flex;
          flex-direction: column;
          justify-content: center;
          gap: 2px;
          width: 8px;
          height: 12px;
          opacity: 0.45;
          transition: opacity 0.15s ease;
        }
        .bsv-toggle-grip > span {
          display: block;
          width: 8px;
          height: 2px;
          border-radius: 1px;
          background: currentColor;
        }
        .bsv-toggle:hover .bsv-toggle-grip,
        .bsv-toggle.is-on .bsv-toggle-grip,
        .bsv-toggle.is-dragging .bsv-toggle-grip {
          opacity: 0.9;
        }
        .bsv-toggle-dot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: var(--dot);
          opacity: 0.35;
          transition: opacity 0.15s ease;
        }
        .bsv-toggle.is-on {
          color: #fff;
          background: var(--dot);
          border-color: var(--dot);
        }
        .bsv-toggle.is-on .bsv-toggle-dot {
          opacity: 1;
          background: #fff;
        }
        /* 드래그 중인 토글 — 살짝 들어 올린 느낌. */
        .bsv-toggle.is-dragging {
          cursor: grabbing;
          transform: scale(1.05);
          box-shadow: 0 8px 22px rgba(22, 22, 26, 0.18);
          z-index: 2;
        }
        /* 다른 토글들은 조금 옅게 — 무엇이 드래그 중인지 명확하게. */
        .bsv-toggle.is-drag-other {
          opacity: 0.85;
        }

        .bsv-empty {
          padding: 40px 8px;
          text-align: center;
          color: var(--bsv-mute);
        }
        .bsv-empty.bsv-error {
          color: #b54545;
        }
        /* ── 로딩 스켈레톤 ── */
        .bsv-verse--skeleton {
          opacity: 0.7;
        }
        .bsv-skeleton-pill {
          display: inline-block;
          min-width: 28px;
          height: 18px;
          background: color-mix(in srgb, var(--bsv-line) 70%, var(--bsv-surface));
          border-radius: 999px;
        }
        .bsv-skeleton-line {
          display: block;
          width: 100%;
          height: 14px;
          margin: 4px 0;
          background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--bsv-line) 60%, var(--bsv-surface)) 0%,
            color-mix(in srgb, var(--bsv-line) 90%, var(--bsv-surface)) 50%,
            color-mix(in srgb, var(--bsv-line) 60%, var(--bsv-surface)) 100%
          );
          background-size: 200% 100%;
          border-radius: 6px;
          animation: bsv-shimmer 1.4s ease-in-out infinite;
        }
        .bsv-skeleton-line--short {
          width: 60%;
        }
        .bsv-skeleton-line--rtl {
          margin-left: auto;
          width: 80%;
        }
        @keyframes bsv-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .bsv-layer--pending {
          align-items: center;
        }
        @media (prefers-reduced-motion: reduce) {
          .bsv-skeleton-line {
            animation: none;
          }
        }

        /* ── 절 목록 ── */
        .bsv-verses {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
        }
        .bsv-verse {
          padding: 14px 0;
          border-bottom: 1px solid var(--bsv-line);
        }
        .bsv-verse:last-child {
          border-bottom: none;
        }
        .bsv-verse-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }
        .bsv-verse-num {
          font-size: 13px;
          font-weight: 700;
          color: var(--bsv-accent);
          font-variant-numeric: tabular-nums;
          background: color-mix(in srgb, var(--bsv-accent) 10%, transparent);
          min-width: 24px;
          height: 24px;
          padding: 0 7px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .bsv-copy {
          appearance: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border: 1px solid var(--bsv-line);
          border-radius: 8px;
          background: var(--bsv-surface);
          color: var(--bsv-mute);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .bsv-copy:hover {
          color: var(--bsv-accent);
          border-color: color-mix(in srgb, var(--bsv-accent) 40%, transparent);
          background: color-mix(in srgb, var(--bsv-accent) 7%, transparent);
        }

        /* ── 레이어 스택 ── */
        .bsv-layers {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .bsv-layer {
          display: grid;
          grid-template-columns: 64px minmax(0, 1fr);
          column-gap: 12px;
          align-items: start;
        }
        .bsv-tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding-top: 3px;
          font-size: 11px;
          font-weight: 700;
          color: var(--dot);
          white-space: nowrap;
          letter-spacing: -0.01em;
        }
        .bsv-tag-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: var(--dot);
          flex: 0 0 auto;
        }
        /* 모든 text 레이어(영어·개역·헬라 의역·어린이 의역)는 동일한 테마
           폰트·크기·줄간격을 그대로 상속한다. 레이어 구분은 폰트가 아니라
           오직 줄 앞 색상 점 + 짧은 라벨로만 한다. */
        .bsv-text {
          margin: 0;
          font: inherit;
          line-height: 1.62;
          word-break: keep-all;
          overflow-wrap: break-word;
        }
        .bsv-layer--english .bsv-text {
          word-break: normal;
        }
        .bsv-layer--krv .bsv-text {
          color: var(--bsv-soft);
        }

        /* ── 헬라어/히브리어 단어 블록 ── */
        .bsv-greek {
          min-width: 0;
        }
        .bsv-words {
          display: flex;
          flex-wrap: wrap;
          gap: 7px 5px;
          margin-left: -5px;
        }
        /* 히브리어는 RTL 로 흘러야 첫 단어가 오른쪽에 온다. flex 의 row 자동
           반전 효과를 활용해 dir="rtl" 만으로 자연스러운 어순이 된다. */
        .bsv-greek--rtl .bsv-words {
          margin-left: 0;
          margin-right: -5px;
        }
        .bsv-greek--rtl .bsv-word-g {
          /* 히브리어 본문은 자체 폰트 스택 — Serif/Garamond 가 니쿠드(모음 기호) 를
             충분히 못 그리는 환경이 있어, Hebrew 전용 폰트를 우선한다. */
          font-family: "SBL Hebrew", "Ezra SIL", "Frank Ruehl CLM",
            "Times New Roman", serif;
          font-size: 20px;
        }
        .bsv-word {
          appearance: none;
          background: transparent;
          border: 1px solid transparent;
          padding: 2px 5px 3px;
          border-radius: 6px;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 1px;
          line-height: 1.1;
          cursor: pointer;
          font: inherit;
          color: inherit;
          transition: background 0.12s ease, border-color 0.12s ease;
        }
        .bsv-word:hover {
          background: rgba(0, 0, 0, 0.04);
        }
        .bsv-word.is-open {
          background: color-mix(in srgb, var(--bsv-accent) 10%, var(--bsv-surface));
          border-color: color-mix(in srgb, var(--bsv-accent) 35%, transparent);
        }
        .bsv-word-g {
          font-family: "EB Garamond", "Garamond", "Times New Roman", serif;
          font-size: 19px;
          font-weight: 500;
          color: var(--bsv-ink);
          white-space: nowrap;
        }
        .bsv-word-p {
          font-size: 11px;
          color: #6c7e9b;
          white-space: nowrap;
        }
        .bsv-word-m {
          font-size: 11px;
          color: color-mix(in srgb, var(--bsv-accent) 60%, var(--bsv-mute));
          white-space: nowrap;
        }
        .bsv-word.is-person .bsv-word-m,
        .bsv-word.is-place .bsv-word-m {
          color: color-mix(in srgb, var(--bsv-accent) 100%, #000 12%);
          font-weight: 600;
        }

        /* ── 단어 상세 카드 ── */
        .bsv-detail {
          margin: 8px 0 2px;
          padding: 2px 0 4px 12px;
          border-left: 2px solid
            color-mix(in srgb, var(--bsv-accent) 55%, transparent);
        }
        .bsv-detail-head {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }
        .bsv-detail-w {
          font-family: "EB Garamond", "Garamond", "Times New Roman", serif;
          font-size: 19px;
          font-weight: 600;
          background: color-mix(in srgb, var(--bsv-accent) 8%, transparent);
          padding: 1px 7px 2px;
          border-radius: 4px;
        }
        .bsv-detail-p {
          font-size: 13px;
          color: #6c7e9b;
          font-weight: 500;
        }
        .bsv-detail-tag {
          margin-left: auto;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 999px;
          font-weight: 700;
          background: color-mix(in srgb, var(--bsv-accent) 18%, transparent);
          color: color-mix(in srgb, var(--bsv-accent) 100%, #000 12%);
        }
        .bsv-detail-grid {
          display: grid;
          grid-template-columns: 44px minmax(0, 1fr);
          column-gap: 12px;
          row-gap: 4px;
          margin: 0;
          font-size: 14px;
          line-height: 1.6;
        }
        .bsv-detail-grid dt {
          color: var(--bsv-soft);
          font-weight: 600;
          font-size: 13px;
          padding-top: 1px;
        }
        .bsv-detail-grid dd {
          margin: 0;
          overflow-wrap: break-word;
          word-break: keep-all;
        }

        /* ── 푸터 / 토스트 ── */
        .bsv-footer {
          margin-top: 24px;
          padding-top: 12px;
          border-top: 1px dashed var(--bsv-line);
          color: var(--bsv-mute);
          font-size: 11.5px;
          line-height: 1.6;
        }
        .bsv-toast {
          position: fixed;
          left: 50%;
          bottom: 40px;
          transform: translateX(-50%);
          z-index: 60;
          background: var(--bsv-ink);
          color: var(--bg, #fff);
          padding: 9px 18px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22);
          pointer-events: none;
          white-space: nowrap;
          animation: bsv-toast-in 0.16s ease-out;
        }
        @keyframes bsv-toast-in {
          from {
            opacity: 0;
            transform: translate(-50%, 6px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }

        /* ── 모바일 ── */
        @media (max-width: 520px) {
          .bsv {
            padding: 0 12px 72px;
          }
          .bsv-layer {
            grid-template-columns: 100%;
            row-gap: 2px;
          }
          .bsv-tag {
            padding-top: 0;
          }
          .bsv-words {
            gap: 5px 4px;
          }
          .bsv-toggle {
            padding: 7px 12px;
            font-size: 13px;
          }
        }
      `}</style>
    </section>
  );
}
