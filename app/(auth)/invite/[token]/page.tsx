"use client";

// =============================================================================
// 교사 초대 수락 페이지 — /invite/[token]
// -----------------------------------------------------------------------------
// 흐름:
//   1) 토큰을 br_peek_teacher_invite 로 검증해 교회명/이메일/이름 + 유효성을 가져옴.
//   2) 무효(만료/사용됨/없음) 이면 안내 후 종료.
//   3) 유효한 경우:
//      - 로그인 안 됨 → 비밀번호 입력 폼. 제출 시 signUp + signIn + accept.
//      - 다른 이메일로 로그인 → "다른 이메일로 로그인되어 있어요. 로그아웃 후 다시 시도해 주세요."
//      - 같은 이메일로 로그인 + 멤버십 없음 → 한 번에 수락 버튼.
//      - 같은 이메일로 로그인 + 이미 멤버십 있음 → /teacher 로 리다이렉트.
//
// 스타일은 .au-* + .sg-* 글로벌 클래스 재사용 (다른 어른 인증 페이지와 통일).
// =============================================================================

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  acceptTeacherInvite,
  adultSignIn,
  adultSignUp,
  peekTeacherInvite,
  useAdultSession,
  type TeacherInvitePeek,
} from "../../../lib/multitenancy";
import { getSupabaseClient, isSupabaseConfigured } from "../../../lib/supabaseClient";

type PeekState =
  | { status: "loading" }
  | { status: "ok"; peek: TeacherInvitePeek }
  | { status: "error"; message: string };

export default function TeacherInvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";

  const configured = useMemo(() => isSupabaseConfigured(), []);
  const { state: session, refresh, signOut } = useAdultSession();

  const [peek, setPeek] = useState<PeekState>({ status: "loading" });
  const [emailInput, setEmailInput] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // 토큰으로 초대 정보 미리 조회 (anon 도 호출 가능한 RPC).
  useEffect(() => {
    if (!configured) return;
    if (!token) {
      setPeek({ status: "error", message: "초대 링크가 잘못된 것 같아요." });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const p = await peekTeacherInvite(token);
        if (cancelled) return;
        if (!p) {
          setPeek({ status: "error", message: "초대 링크가 잘못된 것 같아요." });
          return;
        }
        setPeek({ status: "ok", peek: p });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "초대 정보를 가져오지 못했어요.";
        setPeek({ status: "error", message: msg });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, token]);

  // 이미 우리 교회 교사로 연결돼 있으면 바로 /teacher 로.
  useEffect(() => {
    if (session.status === "signed_in" && session.session.membership) {
      router.replace(
        session.session.membership.role === "admin" ? "/admin" : "/teacher",
      );
    }
  }, [router, session]);

  // 로그인된 사용자가 초대 이메일과 같으면 곧바로 수락하는 핸들러.
  const handleAcceptOnly = useCallback(async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await acceptTeacherInvite(token);
      await refresh();
      router.replace("/teacher");
    } catch (e) {
      setError(e instanceof Error ? e.message : "초대 수락에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }, [refresh, router, token]);

  // 로그인 안 된 사용자가 이메일/비밀번호를 정해 가입하는 핸들러 (v3.1: 카톡 모델).
  const handleSignUpAndAccept = useCallback(async () => {
    setError(null);
    setInfo(null);
    const email = emailInput.trim();
    if (!/^.+@.+\..+$/.test(email)) {
      setError("이메일 형식을 확인해 주세요.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상으로 정해주세요.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호 확인이 일치하지 않아요.");
      return;
    }
    setBusy(true);
    try {
      await adultSignUp(email, password);
      try {
        await adultSignIn(email, password);
      } catch {
        // 이메일 confirm 정책이 켜진 프로젝트는 signUp 직후 signIn 이 실패할 수 있다.
        setInfo(
          `확인 메일이 전송됐어요. 받은 메일에서 이메일 인증을 완료한 뒤 이 페이지로 다시 돌아오면 자동으로 연결됩니다.`,
        );
        return;
      }
      await acceptTeacherInvite(token);
      await refresh();
      router.replace("/teacher");
    } catch (e) {
      setError(e instanceof Error ? e.message : "가입·연결에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }, [emailInput, password, passwordConfirm, refresh, router, token]);

  // ---------- 화면 ----------
  if (!configured) {
    return (
      <main className="au-page">
        <div className="au-card">
          <p className="au-eyebrow">설정 필요</p>
          <h1>Supabase 연결이 필요해요</h1>
          <p className="au-sub">
            <code>.env.local</code> 에 <code>NEXT_PUBLIC_SUPABASE_URL</code>,
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> 를 채워 주세요.
          </p>
        </div>
      </main>
    );
  }

  if (peek.status === "loading") {
    return (
      <main className="au-page">
        <div className="au-card">
          <p className="au-eyebrow">교사 초대</p>
          <h1>초대 정보를 확인 중…</h1>
        </div>
      </main>
    );
  }

  if (peek.status === "error") {
    return (
      <main className="au-page">
        <div className="au-card">
          <p className="au-eyebrow">교사 초대</p>
          <h1>초대 링크가 유효하지 않아요</h1>
          <p className="au-sub">{peek.message}</p>
          <p className="au-foot">
            <Link href="/login">로그인 페이지로 가기</Link>
          </p>
        </div>
      </main>
    );
  }

  const inviteInfo = peek.peek;
  if (!inviteInfo.valid) {
    const reasonMsg =
      inviteInfo.reason === "used"
        ? "이미 사용된 초대 링크예요. 관리자에게 새 링크를 부탁해 주세요."
        : inviteInfo.reason === "expired"
          ? "만료된 초대 링크예요. 관리자에게 새 링크를 부탁해 주세요."
          : "유효하지 않은 초대 링크예요.";
    return (
      <main className="au-page">
        <div className="au-card">
          <p className="au-eyebrow">교사 초대</p>
          <h1>이 링크는 더 이상 사용할 수 없어요</h1>
          <p className="au-sub">{reasonMsg}</p>
          <p className="au-foot">
            <Link href="/login">로그인 페이지로 가기</Link>
          </p>
        </div>
      </main>
    );
  }

  const churchName = inviteInfo.church_name ?? "우리 교회";
  const inviteName = inviteInfo.name ?? "";

  // 로그인 상태별로 다른 카드 본문 렌더.
  let body: React.ReactNode;
  if (session.status === "loading") {
    body = <p className="au-sub">세션 확인 중…</p>;
  } else if (session.status === "signed_in") {
    // v3.1: 이미 로그인된 사용자는 그대로 수락. 멤버십이 이미 있으면 위 useEffect 가 리다이렉트.
    body = (
      <>
        <p className="au-sub">
          지금 <strong>{session.session.email}</strong> 로 로그인되어 있어요.
          아래 버튼을 누르면 이 계정이 <strong>{churchName}</strong> 교사로 연결돼요.
        </p>
        {error ? <div className="au-error">{error}</div> : null}
        <button
          type="button"
          className="au-primary"
          disabled={busy}
          onClick={() => void handleAcceptOnly()}
        >
          {busy ? "연결 중…" : `${churchName} 교사로 시작하기`}
        </button>
        <p className="au-foot">
          다른 계정으로 가입하고 싶다면{" "}
          <button
            type="button"
            onClick={async () => {
              await signOut();
              const sb = getSupabaseClient();
              if (sb) await sb.auth.signOut();
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--ink)",
              textDecoration: "underline",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            로그아웃
          </button>
          {" "}후 다시 시작.
        </p>
      </>
    );
  } else {
    // signed_out → 이메일/비밀번호를 직접 정해 가입.
    body = (
      <>
        <p className="au-sub">
          이메일과 비밀번호를 정하면 가입과 우리 교회 교사 연결이 한 번에 끝나요.
          이메일은 본인이 자주 쓰는 것으로 자유롭게 입력하시면 됩니다.
        </p>

        <label className="au-field">
          <span>이메일</span>
          <input
            type="email"
            autoComplete="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="teacher@example.com"
          />
        </label>
        <label className="au-field">
          <span>비밀번호 (8자 이상)</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="au-field">
          <span>비밀번호 확인</span>
          <input
            type="password"
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSignUpAndAccept();
            }}
          />
        </label>

        {error ? <div className="au-error">{error}</div> : null}
        {info ? <div className="au-info">{info}</div> : null}

        <button
          type="button"
          className="au-primary"
          disabled={busy || !emailInput || !password || !passwordConfirm}
          onClick={() => void handleSignUpAndAccept()}
        >
          {busy ? "처리 중…" : `${churchName} 교사로 시작하기`}
        </button>

        <p className="au-foot">
          이미 계정이 있다면 <Link href="/login">로그인</Link> 후 이 페이지로 돌아오세요.
        </p>
      </>
    );
  }

  return (
    <main className="au-page">
      <div className="au-topbar">
        <Link href="/bible-reading">← 학생 페이지</Link>
        <Link href="/login">로그인</Link>
      </div>

      <div className="au-card">
        <p className="au-eyebrow">교사 초대</p>
        <h1>
          {churchName} 교사 초대장
        </h1>
        <p className="au-sub" style={{ marginBottom: "var(--space-3, 12px)" }}>
          관리자가 등록해 둔 교사 이름: <strong>{inviteName}</strong>
        </p>
        {body}
      </div>
    </main>
  );
}
