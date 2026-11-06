"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { BOOKS, type BookId } from "../../../bible-reading/books";
import StudyNotebook from "../../components/StudyNotebook";
import "../../study.css";

const STUDY_BOOK: BookId = "john1";

function isKnownBook(id: string): id is BookId {
  return Object.prototype.hasOwnProperty.call(BOOKS, id);
}

export default function StudyChapterPage() {
  const params = useParams<{ book: string; chapter: string }>();
  const bookRaw = params?.book ?? "";
  const chapterRaw = Number(params?.chapter);

  if (!isKnownBook(bookRaw) || bookRaw !== STUDY_BOOK) {
    const name = isKnownBook(bookRaw) ? BOOKS[bookRaw].name : bookRaw;
    return (
      <div className="study-root">
        <div className="study-pending">
          <h1>준비 중</h1>
          <p>
            {name ? `「${name}」` : "이 책"} 공부 노트는 아직 열려 있지 않아요.
            지금은 요한일서만 사용할 수 있어요.
          </p>
          <Link href={`/study/${STUDY_BOOK}/1`}>요한일서 1장 열기</Link>
        </div>
      </div>
    );
  }

  const meta = BOOKS[STUDY_BOOK];
  const chapter = Number.isFinite(chapterRaw) ? Math.floor(chapterRaw) : NaN;
  if (
    !Number.isFinite(chapter) ||
    chapter < 1 ||
    chapter > meta.totalChapters
  ) {
    return (
      <div className="study-root">
        <div className="study-pending">
          <h1>장 번호를 확인해 주세요</h1>
          <p>
            요한일서는 1–{meta.totalChapters}장이에요.
          </p>
          <Link href={`/study/${STUDY_BOOK}/1`}>1장으로</Link>
        </div>
      </div>
    );
  }

  return <StudyNotebook bookId={STUDY_BOOK} chapter={chapter} />;
}
