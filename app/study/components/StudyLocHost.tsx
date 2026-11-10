"use client";

/**
 * /study 전용 장 서랍 호스트.
 * studyLocStore만 구독 → 열·닫아도 StudyNotebook 본문 리렌더 없음.
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { BookId } from "../../bible-reading/books";
import StudyBookDrawer from "./StudyBookDrawer";
import {
  getStudyLocOpen,
  setStudyLocOpen,
  subscribeStudyLoc,
} from "../lib/studyLocStore";

type Props = {
  bookId: BookId;
  chapter: number;
};

export default function StudyLocHost({ bookId, chapter }: Props) {
  const open = useSyncExternalStore(
    subscribeStudyLoc,
    getStudyLocOpen,
    () => false,
  );
  const router = useRouter();
  const pathKey = `${bookId}/${chapter}`;
  const pathRef = useRef(pathKey);

  // 검증용: store open ↔ DOM dataset (본문 리렌더 없음)
  useEffect(() => {
    document.documentElement.dataset.studyLocOpen = open ? "1" : "0";
    return () => {
      delete document.documentElement.dataset.studyLocOpen;
    };
  }, [open]);

  // 경로가 실제로 바뀔 때만 닫기 — 마운트 직후 effect가 연 직후 클릭을 덮어쓰지 않음
  useEffect(() => {
    if (pathRef.current === pathKey) return;
    pathRef.current = pathKey;
    setStudyLocOpen(false);
  }, [pathKey]);

  // 호스트 언마운트(장 이동 soft nav) 시 잔여 open·배경막 제거
  useEffect(() => {
    return () => setStudyLocOpen(false);
  }, []);

  const onClose = useCallback(() => setStudyLocOpen(false), []);

  const onSelect = useCallback(
    (nextBook: BookId, nextChapter: number) => {
      setStudyLocOpen(false);
      if (nextBook === bookId && nextChapter === chapter) return;
      router.push(`/study/${nextBook}/${nextChapter}`);
    },
    [bookId, chapter, router],
  );

  return (
    <StudyBookDrawer
      open={open}
      onClose={onClose}
      bookId={bookId}
      chapterNumber={chapter}
      onSelectBookChapter={onSelect}
    />
  );
}
