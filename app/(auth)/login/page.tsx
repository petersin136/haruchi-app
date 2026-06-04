"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adultSignIn, useAdultSession } from "../../lib/multitenancy";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { authStyles } from "../authStyles";

export default function LoginPage() {
  const router = useRouter();
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const { state, refresh } = useAdultSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 이미 로그인되어 있으면 role 에 따라 분기.
  useEffect(() => {
    if (state.status !== "signed_in") return;
    const m = state.session.membership;
    if (!m) {
      // 가입은 됐지만 어느 교회 멤버도 아닌 경우 → 교회 만들러 보냄.
      router.replace("/signup");
      return;
    }
    router.replace(m.role === "admin" ? "/admin" : "/teacher");
  }, [router, state]);

  const handleSignIn = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await adultSignIn(email.trim(), password);
      await refresh();
      // 성공 시 직전 진단용 기록 제거.
      try {
        sessionStorage.removeItem("haruchi:last-auth-error");
      } catch {
        // 무시.
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "로그인에 실패했어요.";
      setError(msg);
      // 진단 페이지에서 raw 메시지 그대로 보여주기 위해 보관.
      try {
        sessionStorage.setItem(
          "haruchi:last-auth-error",
          `${new Date().toISOString()}\n${msg}`,
        );
      } catch {
        // sessionStorage 차단된 환경은 그냥 무시.
      }
    } finally {
      setBusy(false);
    }
  }, [email, password, refresh]);

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
        <style jsx>{authStyles}</style>
      </main>
    );
  }

  return (
    <main className="au-page">
      <div className="au-topbar">
        <Link href="/bible-reading">← 학생 페이지</Link>
        <Link href="/signup">새 교회 만들기</Link>
      </div>

      <div className="au-card">
        <p className="au-eyebrow">관리자·교사 공통 로그인</p>
        <h1>로그인</h1>
        <p className="au-sub">
          <strong>관리자와 교사 모두</strong> 이 페이지에서 로그인해요. 가입한
          이메일과 비밀번호를 입력하시면, 역할(관리자/교사)에 맞는 화면으로
          자동으로 이동합니다.
        </p>

        <details className="au-roles">
          <summary>누가 어디서 로그인하나요?</summary>
          <ul className="au-roles-list">
            <li>
              <strong>학생(어린이)</strong> — 로그인 없이{" "}
              <Link href="/bible-reading">학생 페이지</Link>에서 이름과 PIN
              으로 입장해요.
            </li>
            <li>
              <strong>교회/단체 관리자</strong> — 직접 가입(또는{" "}
              <Link href="/signup">새 교회/단체 만들기</Link>) 한 뒤, 다음
              부터는 이 페이지에서 이메일·비밀번호로 로그인.
            </li>
            <li>
              <strong>교사</strong> — <em>최초 가입은</em> 관리자가 보낸{" "}
              <strong>카톡 초대 링크</strong>로만 가능해요. 한 번 가입하시면{" "}
              그 뒤부터는 이 페이지에서 같은 이메일·비밀번호로 로그인하시면
              교사 페이지로 자동 이동합니다.
            </li>
          </ul>
        </details>

        <label className="au-field">
          <span>이메일</span>
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="au-field">
          <span>비밀번호</span>
          <div className="au-password">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSignIn();
              }}
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
                // 눈 가린 아이콘 (보이는 상태에서 누르면 숨김).
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.84 19.84 0 0 1 4.06-5.16" />
                  <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.86 19.86 0 0 1-3.17 4.19" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  <line x1="2" y1="2" x2="22" y2="22" />
                </svg>
              ) : (
                // 눈 아이콘 (가려진 상태에서 누르면 보임).
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </label>

        {error ? <div className="au-error">{error}</div> : null}

        <button
          type="button"
          className="au-primary"
          onClick={() => void handleSignIn()}
          disabled={busy || !email || !password}
        >
          {busy ? "로그인 중…" : "로그인"}
        </button>

        <div className="au-foot-row">
          <Link href="/forgot-password" className="au-foot-link">
            비밀번호를 잊으셨나요?
          </Link>
        </div>
        {error ? (
          <p className="au-foot" style={{ marginTop: 6 }}>
            <Link href="/debug-auth" className="au-foot-link">
              로그인이 계속 안 되면 진단 페이지 열기 →
            </Link>
          </p>
        ) : null}

        <p className="au-foot">
          처음 시작하시는 분은 <Link href="/signup">새 교회 만들기</Link>.
          <br />
          교사는 관리자가 보낸 초대 링크로 가입하세요.
          <br />
          <span className="au-foot-quiet">
            아이디는 가입할 때 사용한 <strong>이메일</strong>이에요. 어떤
            이메일로 가입했는지 기억이 안 나시면 같은 교회 관리자에게
            문의해 주세요.
          </span>
        </p>
      </div>
      <style jsx>{authStyles}</style>
    </main>
  );
}
