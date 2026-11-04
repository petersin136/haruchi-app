"use client";

import {
  memo,
  type Dispatch,
  type PointerEvent,
  type SetStateAction,
} from "react";
import type { BookId } from "../books";

type Verse = {
  n: number;
  t: string;
};

type GreekToken = { w: string; p: string; info?: string };

type TranslationKey = "krv" | "kids" | "greek" | "hebrew";
type ReadingMode = "mic" | "scroll";

type VerseItemProps = {
  verse: Verse;
  isRead: boolean;
  isSelected: boolean;
  isSpeaking: boolean;
  isFlash: boolean;
  isDrawerOpen: boolean;
  selectionMode: boolean;
  showGreek: boolean;
  tokens: GreekToken[] | null;
  hasDrawer: boolean;
  greekWords: string | undefined;
  openTokenInfos: Set<string>;
  onVersePointerDown: (verseN: number, e: PointerEvent<HTMLDivElement>) => void;
  onVersePointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  onVersePointerCancel: () => void;
  onVerseClick: (verseN: number) => void;
  setOpenTokenInfos: Dispatch<SetStateAction<Set<string>>>;
  setOpenWordDrawers: Dispatch<SetStateAction<Set<number>>>;
};

const VerseItem = memo(function VerseItem({
  verse,
  isRead,
  isSelected,
  isSpeaking,
  isFlash,
  isDrawerOpen,
  selectionMode,
  showGreek,
  tokens,
  hasDrawer,
  greekWords,
  openTokenInfos,
  onVersePointerDown,
  onVersePointerMove,
  onVersePointerCancel,
  onVerseClick,
  setOpenTokenInfos,
  setOpenWordDrawers,
}: VerseItemProps) {
  return (
    <div
      data-verse-num={verse.n}
      className={`brp-verse ${isRead ? "is-read" : ""} ${
        selectionMode ? "is-selecting" : ""
      } ${isSelected ? "is-selected" : ""} ${isFlash ? "is-flash" : ""} ${
        isSpeaking ? "is-speaking" : ""
      }`}
      onPointerDown={(e) => onVersePointerDown(verse.n, e)}
      onPointerMove={onVersePointerMove}
      onPointerUp={onVersePointerCancel}
      onPointerCancel={onVersePointerCancel}
      onPointerLeave={onVersePointerCancel}
      onClick={() => onVerseClick(verse.n)}
      role={selectionMode ? "button" : undefined}
      aria-pressed={selectionMode ? isSelected : undefined}
      aria-label={
        selectionMode
          ? `${verse.n}절 ${isSelected ? "선택 해제" : "선택"}`
          : undefined
      }
    >
      <span className="brp-verse-number">{verse.n}</span>
      <p className="brp-verse-text">{verse.t}</p>
      {/* 원어묵상 모드 — 본문(verse.t) 자체가 이미 "원어 의역" 이다.
          그 아래에 헬라어 단어 토큰을 ruby 형태로(헬라어/한글 발음)
          렌더링하고, 오른쪽에 ▾ 갈매기로 절 전체 풀이를 펼친다.
          pointer 이벤트는 절 카드의 long-press 선택과 충돌하지
          않도록 모두 stopPropagation 한다. */}
      {showGreek && tokens && (
        <div className="brp-greek-block">
          <div className="brp-greek-line">
            <div className="brp-greek-tokens">
              {tokens.map((tk, i) => {
                const tokenKey = `${verse.n}:${i}`;
                const isInfoOpen = openTokenInfos.has(tokenKey);
                const hasInfo = !!tk.info;
                return (
                  <span key={tokenKey} className="brp-greek-token">
                    <span className="brp-greek-token-word">{tk.w}</span>
                    {tk.p &&
                      (hasInfo ? (
                        <button
                          type="button"
                          className={`brp-greek-token-pron is-clickable ${
                            isInfoOpen ? "is-open" : ""
                          }`}
                          aria-expanded={isInfoOpen}
                          aria-label={`${tk.w} (${tk.p}) 정보 ${
                            isInfoOpen ? "닫기" : "보기"
                          }`}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenTokenInfos((prev) => {
                              const next = new Set(prev);
                              if (next.has(tokenKey)) next.delete(tokenKey);
                              else next.add(tokenKey);
                              return next;
                            });
                          }}
                        >
                          {tk.p}
                        </button>
                      ) : (
                        <span className="brp-greek-token-pron">{tk.p}</span>
                      ))}
                  </span>
                );
              })}
            </div>
            {hasDrawer && (
              <button
                type="button"
                className={`brp-greek-drawer-toggle ${
                  isDrawerOpen ? "is-open" : ""
                }`}
                aria-expanded={isDrawerOpen}
                aria-label={`${verse.n}절 원어 풀이 ${
                  isDrawerOpen ? "닫기" : "열기"
                }`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenWordDrawers((prev) => {
                    const next = new Set(prev);
                    if (next.has(verse.n)) next.delete(verse.n);
                    else next.add(verse.n);
                    return next;
                  });
                }}
              >
                <span className="brp-greek-drawer-chevron" aria-hidden="true">
                  ▾
                </span>
              </button>
            )}
          </div>
          {(() => {
            // 열린 단어 인포 패널 — 토큰 줄 흐름을 깨지 않도록
            // tokens 컨테이너 바깥, 그 아래 별도 블록으로 렌더링.
            const openInfos = tokens
              .map((tk, i) => ({ tk, i }))
              .filter(
                ({ tk, i }) =>
                  !!tk.info && openTokenInfos.has(`${verse.n}:${i}`),
              );
            if (openInfos.length === 0) return null;
            return (
              <div className="brp-greek-token-info-panels">
                {openInfos.map(({ tk, i }) => (
                  <div
                    key={`info-${verse.n}:${i}`}
                    className="brp-greek-token-info"
                    role="region"
                    aria-label={`${tk.w} 단어 풀이`}
                  >
                    <div className="brp-greek-token-info-head">
                      <span className="brp-greek-token-info-w">{tk.w}</span>
                      <span className="brp-greek-token-info-p">{tk.p}</span>
                    </div>
                    <div className="brp-greek-token-info-body">{tk.info}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          {hasDrawer && isDrawerOpen && (
            <p className="brp-verse-greek-words">{greekWords}</p>
          )}
        </div>
      )}
    </div>
  );
});

type VerseListProps = {
  verses: Verse[];
  bookId: BookId;
  chapterNumber: number;
  effectiveTranslation: TranslationKey;
  readingMode: ReadingMode;
  readVerseCount: number;
  totalVerses: number;
  selectionMode: boolean;
  selectedVerses: Set<number>;
  flashVerse: number | null;
  ttsVerseN: number | null;
  greekTokensMap: Map<number, GreekToken[]> | null;
  greekWordsMap: Map<number, string> | null;
  openWordDrawers: Set<number>;
  openTokenInfos: Set<string>;
  onVersePointerDown: (verseN: number, e: PointerEvent<HTMLDivElement>) => void;
  onVersePointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  onVersePointerCancel: () => void;
  onVerseClick: (verseN: number) => void;
  setOpenTokenInfos: Dispatch<SetStateAction<Set<string>>>;
  setOpenWordDrawers: Dispatch<SetStateAction<Set<number>>>;
};

const VerseList = memo(function VerseList({
  verses,
  bookId,
  chapterNumber,
  effectiveTranslation,
  readingMode,
  readVerseCount,
  totalVerses,
  selectionMode,
  selectedVerses,
  flashVerse,
  ttsVerseN,
  greekTokensMap,
  greekWordsMap,
  openWordDrawers,
  openTokenInfos,
  onVersePointerDown,
  onVersePointerMove,
  onVersePointerCancel,
  onVerseClick,
  setOpenTokenInfos,
  setOpenWordDrawers,
}: VerseListProps) {
  // 스크롤 모드는 "스크롤 + 최소 시간 + 퀴즈"가 모두 끝나
  // 장 자체가 완료(readVerseCount === totalVerses)됐을 때만
  // 절 색을 바꾼다. 그 외에는 절별 진행 색을 절대 표시하지 않는다.
  //
  // 음성(verse-mic) 모드는 새 트리거 매칭으로 동작 — 절을 통째로
  // 한 번에 "읽음" 처리한다. "지금 기다리는 다음 절" 을 미리 회색으로
  // 깔아 보여주는 is-current 표시는 사용자가 아직 현재 절을 다 읽기도
  // 전에 다음 절이 강조되어 보여 혼란을 주므로 의도적으로 제거.
  const chapterFullyRead = totalVerses > 0 && readVerseCount >= totalVerses;
  const showGreekUi = effectiveTranslation === "greek" && !!greekTokensMap;

  return (
    <>
      {verses.map((verse, idx) => {
        const isRead =
          readingMode === "scroll" ? chapterFullyRead : idx < readVerseCount;
        const showGreek =
          showGreekUi && greekTokensMap!.has(verse.n);
        const tokens = showGreek
          ? (greekTokensMap!.get(verse.n) ?? null)
          : null;
        return (
          <VerseItem
            key={`${bookId}-${chapterNumber}-${effectiveTranslation}-${verse.n}`}
            verse={verse}
            isRead={isRead}
            isSelected={selectedVerses.has(verse.n)}
            isSpeaking={ttsVerseN === verse.n}
            isFlash={flashVerse === verse.n}
            isDrawerOpen={openWordDrawers.has(verse.n)}
            selectionMode={selectionMode}
            showGreek={showGreek}
            tokens={tokens}
            hasDrawer={greekWordsMap?.has(verse.n) ?? false}
            greekWords={greekWordsMap?.get(verse.n)}
            openTokenInfos={openTokenInfos}
            onVersePointerDown={onVersePointerDown}
            onVersePointerMove={onVersePointerMove}
            onVersePointerCancel={onVersePointerCancel}
            onVerseClick={onVerseClick}
            setOpenTokenInfos={setOpenTokenInfos}
            setOpenWordDrawers={setOpenWordDrawers}
          />
        );
      })}
    </>
  );
});

export default VerseList;
