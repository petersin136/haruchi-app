"use client";

// =============================================================================
// 비밀번호 재설정 — /reset-password
// -----------------------------------------------------------------------------
// /forgot-password 에서 보낸 메일의 링크를 누르고 돌아온 사용자가 새 비밀번호
// 를 정한다. Supabase 가 URL fragment 의 access_token 을 자동으로 세션화하므로
// (PKCE/implicit 둘 다), 페이지가 mount 되면 잠시 기다린 뒤 세션 유무를 보고
// 폼을 보여주면 된다.
// =============================================================================

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adultUpdatePassword } from "../../lib/multitenancy";
import { getSupabaseClient, isSupabaseConfigured } from "../../lib/supabaseClient";
import { authStyles } from "../authStyles";

type Stage =
  | { kind: "loading" }
  | { kind: "ready"; email: string | null }
  | { kind: "no_session" }
  | { kind: "done" };

export default function ResetPasswordPage() {
  const router = useRouter();
  const configured = useMemo(() => isSupabaseConfigured(), []);

  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStage({ kind: "no_session" });
      return;
    }
    // recovery 링크로 들어오면 supabase 가 hash fragment 의 토큰을 읽어
    // PASSWORD_RECOVERY 이벤트를 발생시키며 세션을 잠시 만들어 준다.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setStage({ kind: "ready", email: session?.user?.email ?? null });
      }
    });
    // 이미 세션이 있을 수도 있으니 한 번 직접 확인.
    void (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session) {
        setStage({ kind: "ready", email: sess.session.user.email ?? null });
      } else {
        // 잠시 기다렸다가 그래도 없으면 안내.
        setTimeout(async () => {
          const { data: again } = await supabase.auth.getSession();
          if (again.session) {
            setStage({ kind: "ready", email: again.session.user.email ?? null });
          } else {
            setStage((cur) => (cur.kind === "loading" ? { kind: "no_session" } : cur));
          }
        }, 1500);
      }
    })();
    return () => {
      data.subscription.unsubscribe();
    };
  }, [configured]);

  const handleSubmit = useCallback(async () => {
    setError(null);
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
      await adultUpdatePassword(password);
      setStage({ kind: "done" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "비밀번호 변경에 실패했어요.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, [password, passwordConfirm]);

  if (!configured) {
    return (
      <main className="au-page">
        <div className="au-card">
          <p className="au-eyebrow">설정 필요</p>
          <h1>Supabase 연결이 필요해요</h1>
        </div>
        <style jsx>{authStyles}</style>
      </main>
    );
  }

  let body: React.ReactNode;
  if (stage.kind === "loading") {
    body = <p className="au-sub">재설정 링크를 확인하는 중…</p>;
  } else if (stage.kind === "no_session") {
    body = (
      <>
        <p className="au-sub">
          이 페이지는 메일로 받은 <strong>비밀번호 재설정 링크</strong>를
          누르고 들어와야 동작해요. 링크가 만료됐거나 잘못된 것 같으면 다시
          한 번 시도해 주세요.
        </p>
        <Link href="/forgot-password" className="au-primary" style={{ textAlign: "center", textDecoration: "none", display: "block", lineHeight: "var(--ctrl-h)" }}>
          재설정 메일 다시 보내기
        </Link>
      </>
    );
  } else if (stage.kind === "done") {
    body = (
      <>
        <div className="au-info">
          비밀번호가 변경됐어요. 이제 새 비밀번호로 로그인해 주세요.
        </div>
        <button
          type="button"
          className="au-primary"
          onClick={() => router.replace("/login")}
        >
          로그인 페이지로 이동
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="au-sub">
          {stage.email ? (
            <>
              <strong>{stage.email}</strong> 계정의 새 비밀번호를 정해 주세요.
              {" "}8자 이상으로 입력하시면 돼요.
            </>
          ) : (
            <>새 비밀번호를 정해 주세요. 8자 이상으로 입력해 주세요.</>
          )}
        </p>

        <label className="au-field">
          <span>새 비밀번호</span>
          <div className="au-password">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="au-password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
              aria-pressed={showPassword}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.84 19.84 0 0 1 4.06-5.16" />
                  <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.86 19.86 0 0 1-3.17 4.19" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  <line x1="2" y1="2" x2="22" y2="22" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </label>
        <label className="au-field">
          <span>새 비밀번호 확인</span>
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSubmit();
            }}
          />
        </label>

        {error ? <div className="au-error">{error}</div> : null}

        <button
          type="button"
          className="au-primary"
          onClick={() => void handleSubmit()}
          disabled={busy || !password || !passwordConfirm}
        >
          {busy ? "변경 중…" : "비밀번호 변경"}
        </button>
      </>
    );
  }

  return (
    <main className="au-page">
      <div className="au-topbar">
        <Link href="/login">← 로그인으로</Link>
      </div>

      <div className="au-card">
        <p className="au-eyebrow">비밀번호 재설정</p>
        <h1>새 비밀번호 정하기</h1>
        {body}
      </div>
      <style jsx>{authStyles}</style>
    </main>
  );
}
