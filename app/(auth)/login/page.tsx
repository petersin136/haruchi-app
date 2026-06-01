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
    } catch (e) {
      const msg = e instanceof Error ? e.message : "로그인에 실패했어요.";
      setError(msg);
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
        <Link href="/signup">계정이 없어요</Link>
      </div>

      <div className="au-card">
        <p className="au-eyebrow">관리자 · 교사 로그인</p>
        <h1>로그인</h1>
        <p className="au-sub">
          가입한 이메일과 비밀번호로 로그인하면 권한(admin/teacher)에 맞는
          대시보드로 이동해요.
        </p>

        <label className="au-field">
          <span>이메일</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="au-field">
          <span>비밀번호</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSignIn();
            }}
          />
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

        <p className="au-foot">
          새로 시작하려면 <Link href="/signup">관리자 가입</Link>,
          교사 분은 <Link href="/teacher-signup">교사 가입</Link>
        </p>
      </div>
      <style jsx>{authStyles}</style>
    </main>
  );
}
