"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabaseClient";
import {
  listClasses,
  listReadingLogsByClass,
  listStudentsByChurch,
  listTeacherAssignments,
  useAdultSession,
  type ClassRow,
  type ReadingLogRow,
  type StudentRow,
  type TeacherClassRow,
} from "../lib/multitenancy";
import { BOOKS, BOOK_ORDER, type BookId } from "../bible-reading/books";
import { dashStyles } from "../admin/adminStyles";
import Wordmark from "../components/Wordmark";

type SortKey = "name" | "progress" | "recent";

const formatDateTime = (iso: string) => {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch {
    return iso;
  }
};

export default function TeacherPage() {
  const router = useRouter();
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const supabase = useMemo(() => getSupabaseClient(), []);
  const { state, signOut } = useAdultSession();

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [assignments, setAssignments] = useState<TeacherClassRow[]>([]);

  const [classId, setClassId] = useState<string>("");
  const [book, setBook] = useState<BookId>("proverbs");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("progress");

  const [logs, setLogs] = useState<ReadingLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 인증/role 가드
  useEffect(() => {
    if (state.status === "signed_out") {
      router.replace("/login");
    } else if (state.status === "signed_in") {
      const m = state.session.membership;
      if (!m) router.replace("/signup");
      // admin 도 /teacher 페이지를 볼 수는 있게 둔다 (자기 교회 전체 반).
    }
  }, [router, state]);

  const isReady =
    state.status === "signed_in" && state.session.membership != null;
  const membership = isReady ? state.session.membership! : null;
  const myRole = membership?.role;

  const reloadAll = useCallback(async () => {
    if (!isReady) return;
    setLoading(true);
    setErr(null);
    try {
      const [cls, stu, asg] = await Promise.all([
        listClasses(),
        listStudentsByChurch(),
        listTeacherAssignments(),
      ]);
      setClasses(cls);
      setStudents(stu);
      setAssignments(asg);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "데이터를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [isReady]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  // 내 반 목록: admin 은 전체, teacher 는 assignments 와 교집합.
  const myClasses = useMemo(() => {
    if (myRole === "admin") return classes;
    if (!membership) return [];
    const mineIds = new Set(
      assignments
        .filter((a) => a.church_member_id === membership.id)
        .map((a) => a.class_id),
    );
    return classes.filter((c) => mineIds.has(c.id));
  }, [assignments, classes, membership, myRole]);

  useEffect(() => {
    if (myClasses.length > 0 && !myClasses.find((c) => c.id === classId)) {
      setClassId(myClasses[0].id);
    } else if (myClasses.length === 0 && classId) {
      setClassId("");
    }
  }, [classId, myClasses]);

  const currentClass = myClasses.find((c) => c.id === classId) ?? null;
  const memberLabel = currentClass?.member_label ?? "학생";

  const refreshLogs = useCallback(async () => {
    if (!classId) {
      setLogs([]);
      return;
    }
    try {
      const rows = await listReadingLogsByClass({ classId, book });
      setLogs(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "진도를 불러오지 못했어요.");
    }
  }, [book, classId]);

  useEffect(() => {
    void refreshLogs();
  }, [refreshLogs]);

  // Realtime 구독.
  useEffect(() => {
    if (!supabase || !classId) return;
    const channel = supabase
      .channel(`teacher_logs_${classId}_${book}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "br_reading_logs",
          filter: `class_id=eq.${classId}`,
        },
        (payload) => {
          const newRow = payload.new as ReadingLogRow | undefined;
          const oldRow = payload.old as ReadingLogRow | undefined;
          setLogs((prev) => {
            if (payload.eventType === "DELETE" && oldRow) {
              return prev.filter((r) => r.id !== oldRow.id);
            }
            if (!newRow) return prev;
            if (newRow.book !== book) return prev;
            const idx = prev.findIndex((r) => r.id === newRow.id);
            if (idx >= 0) {
              const copy = prev.slice();
              copy[idx] = newRow;
              return copy;
            }
            return [...prev, newRow];
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [book, classId, supabase]);

  const filteredStudents = useMemo(
    () => students.filter((s) => s.class_id === classId),
    [classId, students],
  );

  const stats = useMemo(() => {
    const total = BOOKS[book].totalChapters;
    return filteredStudents.map((s) => {
      const chSet = new Set<number>();
      let latest: ReadingLogRow | null = null;
      for (const l of logs) {
        if (l.student_id !== s.id) continue;
        chSet.add(l.chapter);
        if (!latest || l.completed_at > latest.completed_at) latest = l;
      }
      return {
        student: s,
        chapters: chSet,
        readCount: chSet.size,
        totalChapters: total,
        latest,
      };
    });
  }, [book, filteredStudents, logs]);

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? stats.filter((row) => row.student.name.toLowerCase().includes(q))
      : stats;
    const sorted = filtered.slice();
    if (sortKey === "name") {
      sorted.sort((a, b) =>
        a.student.name.localeCompare(b.student.name, "ko"),
      );
    } else if (sortKey === "progress") {
      sorted.sort((a, b) => b.readCount - a.readCount);
    } else {
      sorted.sort((a, b) => {
        const at = a.latest?.completed_at ?? "";
        const bt = b.latest?.completed_at ?? "";
        return bt.localeCompare(at);
      });
    }
    return sorted;
  }, [search, sortKey, stats]);

  if (!configured) {
    return (
      <main className="dash-page">
        <div className="dash-shell">
          <div className="dash-empty">Supabase 환경변수가 비어 있어요.</div>
        </div>
        <style jsx>{dashStyles}</style>
      </main>
    );
  }

  if (state.status === "loading") {
    return (
      <main className="dash-page">
        <div className="dash-shell">
          <div className="dash-empty">불러오는 중…</div>
        </div>
        <style jsx>{dashStyles}</style>
      </main>
    );
  }

  if (state.status === "signed_out" || !membership) return null;

  return (
    <main className="dash-page">
      <div className="dash-shell">
        <div className="dash-brand-strip">
          <Link href="/bible-reading" className="dash-brand-link" aria-label="하루치 홈으로">
            <Wordmark size="md" />
          </Link>
        </div>
        <header className="dash-header">
          <div className="dash-header-text">
            <p className="dash-eyebrow">
              {myRole === "admin" ? "관리자(교사 보기)" : "교사 대시보드"}
            </p>
            <h1>
              {membership.churchName || "우리 교회"}
              {currentClass ? ` · ${currentClass.name}` : ""}
            </h1>
            <p className="dash-header-meta">
              {membership.name} 선생님 · {state.session.email}
            </p>
          </div>
          <div className="dash-actions">
            {myRole === "admin" ? (
              <Link href="/admin" className="dash-link">
                관리자 페이지
              </Link>
            ) : null}
            <Link href="/bible-reading" className="dash-link">
              학생 페이지
            </Link>
            <button
              type="button"
              className="dash-signout"
              onClick={() => void signOut().then(() => router.replace("/login"))}
            >
              로그아웃
            </button>
          </div>
        </header>

        {err ? <div className="dash-error">{err}</div> : null}

        {myClasses.length === 0 ? (
          <div className="dash-empty" style={{ marginTop: 14 }}>
            아직 배정된 반이 없어요. 관리자에게 우리 반 배정을 요청해 주세요.
          </div>
        ) : (
          <>
            <section className="dash-section">
              <div className="dash-form">
                <label>
                  반
                  <select
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                  >
                    {myClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.member_label})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  책
                  <select
                    value={book}
                    onChange={(e) => setBook(e.target.value as BookId)}
                  >
                    {BOOK_ORDER.map((id) => (
                      <option key={id} value={id}>
                        {BOOKS[id].name} ({BOOKS[id].totalChapters}장)
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  정렬
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                  >
                    <option value="progress">진도순</option>
                    <option value="recent">최근순</option>
                    <option value="name">이름순</option>
                  </select>
                </label>
                <label>
                  이름 검색
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`${memberLabel} 이름`}
                  />
                </label>
              </div>
            </section>

            {loading ? (
              <div className="dash-empty">불러오는 중…</div>
            ) : null}

            {!loading && filteredSorted.length === 0 ? (
              <div className="dash-empty">
                표시할 {memberLabel}이 없어요. 검색어를 지워보세요.
              </div>
            ) : null}

            <section className="dash-grid">
              {filteredSorted.map((row) => {
                const total = row.totalChapters;
                const pct =
                  total > 0 ? Math.round((row.readCount / total) * 100) : 0;
                return (
                  <article key={row.student.id} className="dash-card">
                    <h3>{row.student.name}</h3>
                    <p className="sub">
                      {row.readCount} / {total}장 ({pct}%)
                      {row.latest
                        ? ` · 최근 ${row.latest.chapter}장 ${formatDateTime(row.latest.completed_at)}`
                        : " · 아직 기록 없음"}
                    </p>
                    <div className="dash-mini-grid">
                      {Array.from({ length: total }, (_, i) => i + 1).map((ch) => (
                        <span
                          key={ch}
                          className={`dash-cell ${row.chapters.has(ch) ? "is-done" : ""}`}
                          title={`${ch}장`}
                        >
                          {ch}
                        </span>
                      ))}
                    </div>
                  </article>
                );
              })}
            </section>
          </>
        )}
      </div>
      <style jsx>{dashStyles}</style>
    </main>
  );
}
