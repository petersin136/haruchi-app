"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adultSignIn,
  adultSignUp,
  useAdultSession,
} from "../../lib/multitenancy";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { authStyles } from "../authStyles";

// 교사 자가 가입 — 이 단계에서는 Supabase auth 계정만 만든다.
// 가입 후 관리자에게 이 이메일을 알려주면, 관리자가 /admin 에서 br_admin_add_teacher
// RPC 로 교회에 연결한다.
export default function TeacherSignupPage() {
  const router = useRouter();
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const { state } = useAdultSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // 이미 로그인 + 멤버십 있으면 분기.
  useEffect(() => {
    if (state.status === "signed_in" && state.session.membership) {
      const role = state.session.membership.role;
      router.replace(role === "admin" ? "/admin" : "/teacher");
    }
  }, [router, state]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setDone(null);
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
      await adultSignUp(email.trim(), password);
      try {
        await adultSignIn(email.trim(), password);
      } catch {
        // confirm 메일 모드면 즉시 로그인 실패. 안내만 띄움.
      }
      setDone(
        `가입이 완료됐어요. 이 이메일 주소(${email.trim()})를 우리 교회 관리자에게 알려 주세요. 관리자가 연결해주면 이 페이지에서 로그인하여 /teacher 로 들어갈 수 있어요.`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "가입에 실패했어요.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, [email, password, passwordConfirm]);

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
        <Link href="/login">로그인</Link>
      </div>

      <div className="au-card">
        <p className="au-eyebrow">교사 가입</p>
        <h1>교사용 계정 만들기</h1>
        <p className="au-sub">
          먼저 이메일·비밀번호로 계정만 만들어 주세요. 그 다음 우리 교회 관리자가
          이 이메일로 우리 교회 교사로 연결해 주면, <code>/teacher</code> 에 들어가
          담당 반을 볼 수 있어요.
        </p>

        <label className="au-field">
          <span>이메일</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teacher@church.example"
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
              if (e.key === "Enter") void handleSubmit();
            }}
          />
        </label>

        {error ? <div className="au-error">{error}</div> : null}
        {done ? <div className="au-info">{done}</div> : null}

        <button
          type="button"
          className="au-primary"
          onClick={() => void handleSubmit()}
          disabled={busy || !email || !password || !passwordConfirm}
        >
          {busy ? "가입 중…" : "가입하기"}
        </button>

        <p className="au-foot">
          이미 가입했고 관리자가 연결해줬다면 <Link href="/login">로그인</Link>
        </p>
      </div>
      <style jsx>{authStyles}</style>
    </main>
  );
}
