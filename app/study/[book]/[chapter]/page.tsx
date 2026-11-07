"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { BOOKS, type BookId } from "../../../bible-reading/books";
import StudyNotebook from "../../components/StudyNotebook";
import "../../study.css";

function isKnownBook(id: string): id is BookId {
  return Object.prototype.hasOwnProperty.call(BOOKS, id);
}

export default function StudyChapterPage() {
  const params = useParams<{ book: string; chapter: string }>();
  const bookRaw = params?.book ?? "";
  const chapterRaw = Number(params?.chapter);

  if (!isKnownBook(bookRaw)) {
    return (
      <div className="study-root">
        <div className="study-pending">
          <h1>책을 확인해 주세요</h1>
          <p>성경 책 이름을 찾을 수 없어요.</p>
          <Link href="/study/john1/1">요한일서 1장 열기</Link>
        </div>
      </div>
    );
  }

  const meta = BOOKS[bookRaw];
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
            {meta.name}은(는) 1–{meta.totalChapters}장이에요.
          </p>
          <Link href={`/study/${bookRaw}/1`}>1장으로</Link>
        </div>
      </div>
    );
  }

  return <StudyNotebook bookId={bookRaw} chapter={chapter} />;
}
