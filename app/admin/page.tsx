"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { isSupabaseConfigured, getSupabaseClient } from "../lib/supabaseClient";
import {
  adminCreateTeacherInvite,
  adminListTeacherInvites,
  adminResetStudentPin,
  adminRevokeTeacherInvite,
  assignTeacherToClass,
  createClass,
  createStudent,
  deleteClass,
  deleteStudent,
  listChurchMembers,
  listClasses,
  listReadingLogsByClass,
  listStudentsByChurch,
  listTeacherAssignments,
  removeChurchMember,
  unassignTeacherFromClass,
  updateClass,
  updateMemberName,
  updateStudent,
  useAdultSession,
  type ClassRow,
  type MemberRow,
  type ReadingLogRow,
  type StudentRow,
  type TeacherClassRow,
  type TeacherInviteRow,
} from "../lib/multitenancy";
import { BOOKS, BOOK_ORDER, type BookId } from "../bible-reading/books";
import Wordmark from "../components/Wordmark";
// 주의: .dash-* 스타일은 app/globals.css 에 글로벌 클래스로 정의돼 있다.
// styled-jsx 의 <style jsx>{외부변수}</style> 패턴이 Next.js + SWC 환경에서
// 스코프 hash 가 undefined 가 되어 스타일이 주입되지 않으므로 사용하지 않는다.

type TabKey = "classes" | "teachers" | "students" | "progress";

const TABS: { key: TabKey; label: string }[] = [
  { key: "classes", label: "반" },
  { key: "teachers", label: "교사" },
  { key: "students", label: "학생" },
  { key: "progress", label: "진도" },
];

export default function AdminPage() {
  const router = useRouter();
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const { state, signOut } = useAdultSession();

  const [tab, setTab] = useState<TabKey>("classes");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [assignments, setAssignments] = useState<TeacherClassRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // 인증 가드 + role 가드
  useEffect(() => {
    if (state.status === "signed_out") {
      router.replace("/login");
    } else if (state.status === "signed_in") {
      const m = state.session.membership;
      if (!m) {
        router.replace("/signup");
      } else if (m.role !== "admin") {
        router.replace("/teacher");
      }
    }
  }, [router, state]);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cls, stu, mem, asg] = await Promise.all([
        listClasses(),
        listStudentsByChurch(),
        listChurchMembers(),
        listTeacherAssignments(),
      ]);
      setClasses(cls);
      setStudents(stu);
      setMembers(mem);
      setAssignments(asg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "데이터를 불러오지 못했어요.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (state.status === "signed_in" && state.session.membership?.role === "admin") {
      void reloadAll();
    }
  }, [reloadAll, state]);

  if (!configured) {
    return (
      <main className="dash-page">
        <div className="dash-shell">
          <div className="dash-empty">Supabase 환경변수가 비어 있어요.</div>
        </div>
      </main>
    );
  }

  if (state.status === "loading") {
    return (
      <main className="dash-page">
        <div className="dash-shell">
          <div className="dash-empty">불러오는 중…</div>
        </div>
      </main>
    );
  }

  if (state.status === "signed_out" || !state.session.membership) {
    return null; // 리다이렉트 진행 중
  }

  const membership = state.session.membership;

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
            <p className="dash-eyebrow">관리자 대시보드</p>
            <h1>{membership.churchName || "우리 교회"}</h1>
            <p className="dash-header-meta">
              {membership.name} 관리자 · {state.session.email}
            </p>
          </div>
          <div className="dash-actions">
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

        <nav className="dash-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`dash-tab ${tab === t.key ? "is-active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {error ? <div className="dash-error">{error}</div> : null}
        {info ? <div className="dash-info">{info}</div> : null}
        {loading ? <div className="dash-empty">불러오는 중…</div> : null}

        {tab === "classes" ? (
          <ClassesTab
            churchId={membership.churchId}
            classes={classes}
            onChanged={reloadAll}
            onError={setError}
            onInfo={setInfo}
          />
        ) : null}

        {tab === "teachers" ? (
          <TeachersTab
            classes={classes}
            members={members}
            assignments={assignments}
            currentMemberId={membership.id}
            onChanged={reloadAll}
            onError={setError}
            onInfo={setInfo}
          />
        ) : null}

        {tab === "students" ? (
          <StudentsTab
            churchId={membership.churchId}
            classes={classes}
            students={students}
            onChanged={reloadAll}
            onError={setError}
            onInfo={setInfo}
          />
        ) : null}

        {tab === "progress" ? (
          <ProgressTab classes={classes} students={students} />
        ) : null}
      </div>
    </main>
  );
}

// =============================================================================
// 반 Tab
// =============================================================================
function ClassesTab({
  churchId,
  classes,
  onChanged,
  onError,
  onInfo,
}: {
  churchId: string;
  classes: ClassRow[];
  onChanged: () => Promise<void>;
  onError: (msg: string | null) => void;
  onInfo: (msg: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("학생");
  const [busy, setBusy] = useState(false);

  const onCreate = useCallback(async () => {
    onError(null);
    onInfo(null);
    if (!name.trim()) {
      onError("반 이름을 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      await createClass({
        churchId,
        name,
        memberLabel: label,
      });
      setName("");
      setLabel("학생");
      onInfo(`반 "${name.trim()}" 을(를) 만들었어요.`);
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "반 생성에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }, [churchId, label, name, onChanged, onError, onInfo]);

  return (
    <>
      <section className="dash-section">
        <h2>반 만들기</h2>
        <p className="dash-header-meta" style={{ margin: "0 0 10px" }}>
          반은 그릇입니다. 실제 학생 이름은 여기서 입력하지 않고
          <strong> [학생] 탭 </strong>에서 추가하세요.
        </p>
        <div className="dash-form">
          <label>
            반 이름
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 청년부 / 1학년 / 새신자반"
            />
          </label>
          <label>
            멤버 호칭 (일반 명사 — 예: 학생 / 청년)
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="학생"
            />
          </label>
          <button
            type="button"
            className="dash-primary"
            onClick={() => void onCreate()}
            disabled={busy || !name.trim()}
          >
            반 만들기
          </button>
        </div>
      </section>

      <section className="dash-section">
        <h2>반 목록 ({classes.length}개)</h2>
        {classes.length === 0 ? (
          <div className="dash-empty">아직 만들어진 반이 없어요.</div>
        ) : (
          <ul className="dash-list">
            {classes.map((c) => (
              <ClassRowItem
                key={c.id}
                cls={c}
                onChanged={onChanged}
                onError={onError}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function ClassRowItem({
  cls,
  onChanged,
  onError,
}: {
  cls: ClassRow;
  onChanged: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cls.name);
  const [label, setLabel] = useState(cls.member_label);
  const [busy, setBusy] = useState(false);

  const onSave = useCallback(async () => {
    onError(null);
    setBusy(true);
    try {
      await updateClass({ id: cls.id, name, memberLabel: label });
      setEditing(false);
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "수정에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }, [cls.id, label, name, onChanged, onError]);

  const onDelete = useCallback(async () => {
    if (
      !window.confirm(
        `"${cls.name}" 반을 삭제할까요? 이 반의 학생과 진도 기록도 함께 삭제돼요.`,
      )
    ) {
      return;
    }
    onError(null);
    setBusy(true);
    try {
      await deleteClass(cls.id);
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "삭제에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }, [cls.id, cls.name, onChanged, onError]);

  return (
    <li>
      {editing ? (
        <>
          <input
            className="dash-inline-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="반 이름"
          />
          <input
            className="dash-inline-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="호칭"
          />
          <span className="grow" />
          <button
            type="button"
            className="dash-primary"
            disabled={busy}
            onClick={() => void onSave()}
          >
            저장
          </button>
          <button
            type="button"
            className="dash-ghost"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setName(cls.name);
              setLabel(cls.member_label);
            }}
          >
            취소
          </button>
        </>
      ) : (
        <>
          <span className="name">{cls.name}</span>
          <span className="meta">호칭: {cls.member_label}</span>
          <span className="grow" />
          <button
            type="button"
            className="dash-ghost"
            onClick={() => setEditing(true)}
          >
            수정
          </button>
          <button
            type="button"
            className="dash-danger"
            disabled={busy}
            onClick={() => void onDelete()}
          >
            삭제
          </button>
        </>
      )}
    </li>
  );
}

// =============================================================================
// 교사 Tab
// =============================================================================
function TeachersTab({
  classes,
  members,
  assignments,
  currentMemberId,
  onChanged,
  onError,
  onInfo,
}: {
  classes: ClassRow[];
  members: MemberRow[];
  assignments: TeacherClassRow[];
  currentMemberId: string;
  onChanged: () => Promise<void>;
  onError: (msg: string | null) => void;
  onInfo: (msg: string | null) => void;
}) {
  const teachers = useMemo(
    () => members.filter((m) => m.role === "teacher"),
    [members],
  );
  const admins = useMemo(
    () => members.filter((m) => m.role === "admin"),
    [members],
  );

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [invites, setInvites] = useState<TeacherInviteRow[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const refreshInvites = useCallback(async () => {
    setInvitesLoading(true);
    try {
      const list = await adminListTeacherInvites();
      setInvites(list);
    } catch (e) {
      onError(e instanceof Error ? e.message : "초대 목록을 불러오지 못했어요.");
    } finally {
      setInvitesLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void refreshInvites();
  }, [refreshInvites]);

  const buildInviteUrl = useCallback((token: string) => {
    if (typeof window === "undefined") return `/invite/${token}`;
    return `${window.location.origin}/invite/${token}`;
  }, []);

  const onCreateInvite = useCallback(async () => {
    onError(null);
    onInfo(null);
    setLastInviteUrl(null);
    if (!name.trim()) {
      onError("교사 이름을 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const created = await adminCreateTeacherInvite({ name });
      const url = buildInviteUrl(created.token);
      setLastInviteUrl(url);
      setName("");
      onInfo(
        `${name.trim()} 교사용 초대 링크를 만들었어요. 아래 링크를 복사해 카톡으로 보내주세요.`,
      );
      await refreshInvites();
      await onChanged();
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          // ignore — UI 의 복사 버튼이 있으므로 fallback 가능.
        }
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "초대 발급에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }, [buildInviteUrl, name, onChanged, onError, onInfo, refreshInvites]);

  const onCopyInvite = useCallback(
    async (token: string) => {
      const url = buildInviteUrl(token);
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          onInfo("초대 링크를 복사했어요.");
        } else {
          onInfo(`복사하지 못했어요. 직접 복사해 주세요: ${url}`);
        }
      } catch {
        onInfo(`복사하지 못했어요. 직접 복사해 주세요: ${url}`);
      }
    },
    [buildInviteUrl, onInfo],
  );

  const onRevokeInvite = useCallback(
    async (invite: TeacherInviteRow) => {
      if (!window.confirm(`${invite.name} 교사 초대를 취소할까요?`)) return;
      onError(null);
      try {
        await adminRevokeTeacherInvite(invite.id);
        onInfo("초대를 취소했어요.");
        await refreshInvites();
      } catch (e) {
        onError(e instanceof Error ? e.message : "초대 취소에 실패했어요.");
      }
    },
    [onError, onInfo, refreshInvites],
  );

  return (
    <>
      <section className="dash-section">
        <h2>교사 초대</h2>
        <p className="dash-header-meta" style={{ margin: "0 0 10px" }}>
          교사 이름만 입력하면 초대 링크가 만들어집니다. 그 링크를 카톡으로 보내주면,
          교사는 링크를 열어 본인 이메일·비밀번호를 정해 한 번에 가입·연결을 마칩니다.
          (링크는 14일간 유효)
        </p>
        <div className="dash-form">
          <label>
            교사 이름
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onCreateInvite();
              }}
              placeholder="예: 이선생"
            />
          </label>
          <button
            type="button"
            className="dash-primary"
            disabled={busy || !name}
            onClick={() => void onCreateInvite()}
          >
            초대 링크 만들기
          </button>
        </div>

        {lastInviteUrl ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: "var(--accent-soft)",
              border: "1px solid var(--accent)",
              borderRadius: 8,
              fontSize: 14,
              wordBreak: "break-all",
            }}
          >
            <strong>방금 만든 초대 링크</strong> (자동으로 복사를 시도했어요)
            <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 13 }}>
              {lastInviteUrl}
            </div>
          </div>
        ) : null}

        <h3 style={{ marginTop: 20, fontSize: 15 }}>
          대기 중인 초대 ({invites.filter((i) => i.status === "pending").length}개)
        </h3>
        {invitesLoading ? (
          <div className="dash-empty">초대 목록을 불러오는 중…</div>
        ) : invites.length === 0 ? (
          <div className="dash-empty">아직 발급한 초대가 없어요.</div>
        ) : (
          <ul className="dash-list">
            {invites.map((inv) => {
              const url = buildInviteUrl(inv.token);
              const exp = new Date(inv.expires_at);
              const expLabel = `${exp.getFullYear()}-${String(exp.getMonth() + 1).padStart(2, "0")}-${String(exp.getDate()).padStart(2, "0")}`;
              return (
                <li
                  key={inv.id}
                  style={{ flexDirection: "column", alignItems: "stretch" }}
                >
                  <div className="dash-row">
                    <span className="name">{inv.name}</span>
                    <span className="meta">
                      {inv.email
                        ? inv.email
                        : inv.status === "pending"
                          ? "이메일 미정 (교사가 가입 시 입력)"
                          : "이메일 미정"}
                    </span>
                    <span className="grow" />
                    <span
                      className="meta"
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        background:
                          inv.status === "pending"
                            ? "var(--accent-soft)"
                            : inv.status === "used"
                              ? "var(--surface-alt)"
                              : "var(--surface-alt)",
                        color:
                          inv.status === "pending"
                            ? "var(--accent)"
                            : "var(--ink-soft)",
                        fontSize: 12,
                      }}
                    >
                      {inv.status === "pending"
                        ? `대기 중 · 만료 ${expLabel}`
                        : inv.status === "used"
                          ? "사용됨"
                          : "만료됨"}
                    </span>
                  </div>
                  {inv.status === "pending" ? (
                    <>
                      <div
                        style={{
                          marginTop: 6,
                          fontFamily: "monospace",
                          fontSize: 12,
                          color: "var(--ink-soft)",
                          wordBreak: "break-all",
                        }}
                      >
                        {url}
                      </div>
                      <div
                        style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}
                      >
                        <button
                          type="button"
                          className="dash-primary"
                          onClick={() => void onCopyInvite(inv.token)}
                        >
                          링크 복사
                        </button>
                        <button
                          type="button"
                          className="dash-danger"
                          onClick={() => void onRevokeInvite(inv)}
                        >
                          취소
                        </button>
                      </div>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="dash-section">
        <h2>교사 목록 ({teachers.length}명)</h2>
        {teachers.length === 0 ? (
          <div className="dash-empty">아직 연결된 교사가 없어요.</div>
        ) : (
          <ul className="dash-list">
            {teachers.map((t) => (
              <TeacherRowItem
                key={t.id}
                teacher={t}
                classes={classes}
                assignments={assignments.filter((a) => a.church_member_id === t.id)}
                onChanged={onChanged}
                onError={onError}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="dash-section">
        <h2>관리자 ({admins.length}명)</h2>
        <ul className="dash-list">
          {admins.map((a) => (
            <AdminRowItem
              key={a.id}
              admin={a}
              isSelf={a.id === currentMemberId}
              onChanged={onChanged}
              onError={onError}
              onInfo={onInfo}
            />
          ))}
        </ul>
      </section>
    </>
  );
}

// 관리자 행 — 본인 행은 inline 이름 수정 가능. 비밀번호를 실수로 이름에 넣은 경우 등을
// 본인이 직접 고칠 수 있게 함.
function AdminRowItem({
  admin,
  isSelf,
  onChanged,
  onError,
  onInfo,
}: {
  admin: MemberRow;
  isSelf: boolean;
  onChanged: () => Promise<void>;
  onError: (msg: string | null) => void;
  onInfo: (msg: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(admin.name);
  const [busy, setBusy] = useState(false);

  const onSave = useCallback(async () => {
    onError(null);
    onInfo(null);
    if (!draft.trim()) {
      onError("이름을 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      await updateMemberName({ memberId: admin.id, name: draft });
      setEditing(false);
      onInfo("이름을 바꿨어요.");
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "이름 수정에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }, [admin.id, draft, onChanged, onError, onInfo]);

  if (editing) {
    return (
      <li style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoComplete="name"
          spellCheck={false}
          maxLength={30}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") void onSave();
            if (e.key === "Escape") {
              setDraft(admin.name);
              setEditing(false);
            }
          }}
          style={{
            flex: "1 1 200px",
            padding: "8px 10px",
            border: "1px solid var(--line-strong)",
            borderRadius: 6,
            fontSize: 14,
          }}
        />
        <button
          type="button"
          className="dash-primary"
          disabled={busy || !draft.trim()}
          onClick={() => void onSave()}
        >
          저장
        </button>
        <button
          type="button"
          className="dash-ghost"
          disabled={busy}
          onClick={() => {
            setDraft(admin.name);
            setEditing(false);
          }}
        >
          취소
        </button>
      </li>
    );
  }

  return (
    <li>
      <span className="name">{admin.name}</span>
      <span className="meta">관리자{isSelf ? " · 본인" : ""}</span>
      {isSelf ? (
        <>
          <span className="grow" />
          <button
            type="button"
            className="dash-ghost"
            onClick={() => {
              setDraft(admin.name);
              setEditing(true);
            }}
          >
            이름 수정
          </button>
        </>
      ) : null}
    </li>
  );
}

function TeacherRowItem({
  teacher,
  classes,
  assignments,
  onChanged,
  onError,
}: {
  teacher: MemberRow;
  classes: ClassRow[];
  assignments: TeacherClassRow[];
  onChanged: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [picking, setPicking] = useState("");
  const [busy, setBusy] = useState(false);

  const assignedSet = useMemo(
    () => new Set(assignments.map((a) => a.class_id)),
    [assignments],
  );
  const assignedClasses = useMemo(
    () => classes.filter((c) => assignedSet.has(c.id)),
    [assignedSet, classes],
  );
  const availableClasses = useMemo(
    () => classes.filter((c) => !assignedSet.has(c.id)),
    [assignedSet, classes],
  );

  const onAssign = useCallback(async () => {
    if (!picking) return;
    onError(null);
    setBusy(true);
    try {
      await assignTeacherToClass({
        churchMemberId: teacher.id,
        classId: picking,
      });
      setPicking("");
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "배정에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }, [onChanged, onError, picking, teacher.id]);

  const onUnassign = useCallback(
    async (classId: string) => {
      onError(null);
      setBusy(true);
      try {
        await unassignTeacherFromClass({
          churchMemberId: teacher.id,
          classId,
        });
        await onChanged();
      } catch (e) {
        onError(e instanceof Error ? e.message : "해제에 실패했어요.");
      } finally {
        setBusy(false);
      }
    },
    [onChanged, onError, teacher.id],
  );

  const onRemove = useCallback(async () => {
    if (!window.confirm(`${teacher.name} 교사를 우리 교회에서 제거할까요?`)) return;
    onError(null);
    setBusy(true);
    try {
      await removeChurchMember(teacher.id);
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "제거에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }, [onChanged, onError, teacher.id, teacher.name]);

  return (
    <li style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div className="dash-row">
        <span className="name">{teacher.name}</span>
        <span className="meta">교사</span>
        <span className="grow" />
        <button
          type="button"
          className="dash-danger"
          disabled={busy}
          onClick={() => void onRemove()}
        >
          제거
        </button>
      </div>

      <div className="dash-row" style={{ marginTop: 8 }}>
        {assignedClasses.length === 0 ? (
          <span className="meta">배정된 반 없음</span>
        ) : (
          assignedClasses.map((c) => (
            <span key={c.id} className="dash-chip">
              {c.name}
              <button
                type="button"
                aria-label={`${c.name} 배정 해제`}
                onClick={() => void onUnassign(c.id)}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      {availableClasses.length > 0 ? (
        <div className="dash-row" style={{ marginTop: 8 }}>
          <select
            className="dash-inline-input"
            value={picking}
            onChange={(e) => setPicking(e.target.value)}
          >
            <option value="">반을 골라 배정…</option>
            {availableClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="dash-ghost"
            disabled={busy || !picking}
            onClick={() => void onAssign()}
          >
            배정 추가
          </button>
        </div>
      ) : null}
    </li>
  );
}

// =============================================================================
// 학생 Tab
// =============================================================================
function StudentsTab({
  churchId,
  classes,
  students,
  onChanged,
  onError,
  onInfo,
}: {
  churchId: string;
  classes: ClassRow[];
  students: StudentRow[];
  onChanged: () => Promise<void>;
  onError: (msg: string | null) => void;
  onInfo: (msg: string | null) => void;
}) {
  const [classId, setClassId] = useState<string>(classes[0]?.id ?? "");
  useEffect(() => {
    if (classes.length > 0 && !classes.find((c) => c.id === classId)) {
      setClassId(classes[0].id);
    }
  }, [classId, classes]);

  const currentClass = classes.find((c) => c.id === classId);
  const memberLabel = currentClass?.member_label ?? "학생";
  const filtered = useMemo(
    () => students.filter((s) => s.class_id === classId),
    [classId, students],
  );

  const [newName, setNewName] = useState("");
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const onAdd = useCallback(async () => {
    if (!classId) {
      onError("먼저 반을 만들어 주세요.");
      return;
    }
    if (!newName.trim()) {
      onError(`${memberLabel} 이름을 입력해 주세요.`);
      return;
    }
    if (!guardianConsent) {
      onError("부모(법정대리인) 동의 확인 체크가 필요해요.");
      return;
    }
    onError(null);
    onInfo(null);
    setBusy(true);
    try {
      await createStudent({
        churchId,
        classId,
        name: newName,
        guardianConsent: true,
      });
      setNewName("");
      setGuardianConsent(false);
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "추가에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }, [
    churchId,
    classId,
    guardianConsent,
    memberLabel,
    newName,
    onChanged,
    onError,
    onInfo,
  ]);

  if (classes.length === 0) {
    return (
      <section className="dash-section">
        <h2>학생</h2>
        <div className="dash-empty">
          먼저 [반] 탭에서 반을 만들어 주세요.
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="dash-section">
        <h2>{memberLabel} 추가</h2>
        <div className="dash-form">
          <label>
            반
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.member_label})
                </option>
              ))}
            </select>
          </label>
          <label>
            {memberLabel} 이름
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onAdd();
              }}
            />
          </label>
          <button
            type="button"
            className="dash-primary"
            disabled={busy || !newName.trim() || !guardianConsent}
            onClick={() => void onAdd()}
          >
            추가
          </button>
        </div>
        <div className="dash-consent">
          <label>
            <input
              type="checkbox"
              checked={guardianConsent}
              onChange={(e) => setGuardianConsent(e.target.checked)}
            />
            <span>
              이 이용자가 <strong>미성년자인 경우, 법정대리인(부모)의 동의를
              받았습니다.</strong>
            </span>
          </label>
          <p className="dash-consent-hint">
            성인 이용자라면 본인 동의로 갈음됩니다. 동의 기록 시각은
            서버가 자동으로 남깁니다.
          </p>
        </div>
      </section>

      <section className="dash-section">
        <h2>
          {currentClass?.name} {memberLabel} 목록 ({filtered.length}명)
        </h2>
        {filtered.length === 0 ? (
          <div className="dash-empty">아직 {memberLabel}이 없어요.</div>
        ) : (
          <ul className="dash-list">
            {filtered.map((s) => (
              <StudentRowItem
                key={s.id}
                student={s}
                classes={classes}
                onChanged={onChanged}
                onError={onError}
                onInfo={onInfo}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function StudentRowItem({
  student,
  classes,
  onChanged,
  onError,
  onInfo,
}: {
  student: StudentRow;
  classes: ClassRow[];
  onChanged: () => Promise<void>;
  onError: (msg: string | null) => void;
  onInfo: (msg: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(student.name);
  const [classId, setClassId] = useState(student.class_id);
  const [guardianConsent, setGuardianConsent] = useState(student.guardian_consent);
  const [busy, setBusy] = useState(false);

  const onSave = useCallback(async () => {
    onError(null);
    setBusy(true);
    try {
      await updateStudent({
        id: student.id,
        name,
        classId,
        guardianConsent,
      });
      setEditing(false);
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "수정에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }, [classId, guardianConsent, name, onChanged, onError, student.id]);

  const onDelete = useCallback(async () => {
    if (
      !window.confirm(`${student.name} 학생을 삭제할까요? 진도 기록도 같이 삭제돼요.`)
    )
      return;
    onError(null);
    setBusy(true);
    try {
      await deleteStudent(student.id);
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "삭제에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }, [onChanged, onError, student.id, student.name]);

  const onResetPin = useCallback(async () => {
    if (
      !window.confirm(
        `${student.name} 학생의 비밀번호(PIN)를 초기화할까요? 학생이 다음 로그인 때 새 PIN을 설정하게 됩니다.`,
      )
    )
      return;
    onError(null);
    onInfo(null);
    setBusy(true);
    try {
      const ok = await adminResetStudentPin(student.id);
      if (ok) onInfo(`${student.name} 학생의 PIN을 초기화했어요.`);
      else onError("초기화 대상이 없었어요.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "초기화에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }, [onError, onInfo, student.id, student.name]);

  return (
    <li style={{ flexDirection: "column", alignItems: "stretch" }}>
      {editing ? (
        <>
          <div className="dash-row">
            <input
              className="dash-inline-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              className="dash-inline-input"
              value={classId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setClassId(e.target.value)
              }
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="grow" />
            <button
              type="button"
              className="dash-primary"
              disabled={busy}
              onClick={() => void onSave()}
            >
              저장
            </button>
            <button
              type="button"
              className="dash-ghost"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setName(student.name);
                setClassId(student.class_id);
                setGuardianConsent(student.guardian_consent);
              }}
            >
              취소
            </button>
          </div>
          <label className="dash-row dash-row--consent">
            <input
              type="checkbox"
              checked={guardianConsent}
              onChange={(e) => setGuardianConsent(e.target.checked)}
            />
            <span>
              부모(법정대리인) 동의 완료
              {student.guardian_consent_at ? (
                <span className="meta" style={{ marginLeft: 8 }}>
                  최초 기록: {formatConsentDate(student.guardian_consent_at)}
                </span>
              ) : null}
            </span>
          </label>
        </>
      ) : (
        <div className="dash-row">
          <span className="name">{student.name}</span>
          {student.guardian_consent ? (
            <span className="dash-chip" title={
              student.guardian_consent_at
                ? `부모 동의 기록: ${formatConsentDate(student.guardian_consent_at)}`
                : undefined
            }>
              부모 동의 완료
            </span>
          ) : (
            <span
              className="dash-chip is-warn"
              title="이 학생의 부모(법정대리인) 동의 기록이 아직 없습니다."
            >
              부모 동의 미기록
            </span>
          )}
          <span className="grow" />
          <button
            type="button"
            className="dash-ghost"
            onClick={() => setEditing(true)}
          >
            수정
          </button>
          <button
            type="button"
            className="dash-ghost"
            disabled={busy}
            onClick={() => void onResetPin()}
          >
            PIN 초기화
          </button>
          <button
            type="button"
            className="dash-danger"
            disabled={busy}
            onClick={() => void onDelete()}
          >
            삭제
          </button>
        </div>
      )}
    </li>
  );
}

function formatConsentDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return iso;
  }
}

// =============================================================================
// 진도 Tab — 반 × 책 선택 → 학생 진도 그리드 (Realtime 구독)
// =============================================================================
function ProgressTab({
  classes,
  students,
}: {
  classes: ClassRow[];
  students: StudentRow[];
}) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [classId, setClassId] = useState<string>(classes[0]?.id ?? "");
  const [book, setBook] = useState<BookId>("proverbs");
  const [logs, setLogs] = useState<ReadingLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (classes.length > 0 && !classes.find((c) => c.id === classId)) {
      setClassId(classes[0].id);
    }
  }, [classId, classes]);

  const refresh = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setErr(null);
    try {
      const rows = await listReadingLogsByClass({ classId, book });
      setLogs(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "진도를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [book, classId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime 구독: 선택된 반의 reading_logs 변경.
  useEffect(() => {
    if (!supabase || !classId) return;
    const channel = supabase
      .channel(`admin_logs_${classId}_${book}`)
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

  if (classes.length === 0) {
    return (
      <section className="dash-section">
        <h2>진도</h2>
        <div className="dash-empty">먼저 반을 만들어 주세요.</div>
      </section>
    );
  }

  const totalChapters = BOOKS[book].totalChapters;

  return (
    <>
      <section className="dash-section">
        <h2>진도 보기</h2>
        <div className="dash-form">
          <label>
            반
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
          <button
            type="button"
            className="dash-ghost"
            onClick={() => void refresh()}
          >
            새로고침
          </button>
        </div>
      </section>

      {err ? <div className="dash-error">{err}</div> : null}
      {loading ? <div className="dash-empty">불러오는 중…</div> : null}

      {!loading && filteredStudents.length === 0 ? (
        <div className="dash-empty">이 반에 학생이 없어요.</div>
      ) : null}

      <section className="dash-grid">
        {filteredStudents.map((s) => {
          const chapters = new Set<number>();
          let latest: ReadingLogRow | null = null;
          for (const l of logs) {
            if (l.student_id !== s.id) continue;
            chapters.add(l.chapter);
            if (!latest || l.completed_at > latest.completed_at) latest = l;
          }
          const pct =
            totalChapters > 0 ? Math.round((chapters.size / totalChapters) * 100) : 0;
          return (
            <article key={s.id} className="dash-card">
              <h3>{s.name}</h3>
              <p className="sub">
                {chapters.size} / {totalChapters}장 ({pct}%)
                {latest ? ` · 최근 ${latest.chapter}장` : ""}
              </p>
              <div className="dash-mini-grid">
                {Array.from({ length: totalChapters }, (_, i) => i + 1).map((ch) => (
                  <span
                    key={ch}
                    className={`dash-cell ${chapters.has(ch) ? "is-done" : ""}`}
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
  );
}
