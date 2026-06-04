"use client";

// =============================================================================
// 비밀번호 찾기 (재설정 메일 발송) — /forgot-password
// -----------------------------------------------------------------------------
// 입력한 이메일로 Supabase 가 recovery 메일을 보낸다. 메일의 링크를 누르면
// /reset-password 페이지로 돌아와 새 비밀번호를 설정할 수 있다.
// =============================================================================

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { adultRequestPasswordReset } from "../../lib/multitenancy";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { authStyles } from "../authStyles";

export default function ForgotPasswordPage() {
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = useCallback(async () => {
    setError(null);
    const v = email.trim();
    if (!/^.+@.+\..+$/.test(v)) {
      setError("이메일 형식을 확인해 주세요.");
      return;
    }
    setBusy(true);
    try {
      await adultRequestPasswordReset(v);
      setSent(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "재설정 메일 전송에 실패했어요.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, [email]);

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

  return (
    <main className="au-page">
      <div className="au-topbar">
        <Link href="/login">← 로그인으로</Link>
        <Link href="/signup">새 교회 만들기</Link>
      </div>

      <div className="au-card">
        <p className="au-eyebrow">비밀번호 찾기</p>
        <h1>비밀번호 재설정 메일 보내기</h1>
        <p className="au-sub">
          가입할 때 사용한 이메일을 입력하시면, 비밀번호를 새로 정할 수 있는
          링크를 메일로 보내드려요. 링크는 받은 즉시 누르시는 게 좋아요
          (보안상 일정 시간이 지나면 만료됩니다).
        </p>

        {sent ? (
          <>
            <div className="au-info">
              <strong>{email.trim()}</strong> 로 재설정 메일을 보냈어요.
              <br />
              메일이 보이지 않으면 <em>스팸함</em>이나 <em>프로모션함</em>도
              꼭 확인해 주세요. 5분이 지나도 안 오면 다시 시도해 주세요.
            </div>
            <p className="au-foot">
              메일 인증을 마치셨다면 <Link href="/login">로그인 페이지</Link>로
              돌아가세요.
            </p>
          </>
        ) : (
          <>
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSubmit();
                }}
                placeholder="가입할 때 사용한 이메일"
              />
            </label>

            {error ? <div className="au-error">{error}</div> : null}

            <button
              type="button"
              className="au-primary"
              onClick={() => void handleSubmit()}
              disabled={busy || !email}
            >
              {busy ? "보내는 중…" : "재설정 메일 보내기"}
            </button>

            <p className="au-foot">
              가입한 이메일이 기억나지 않으시면 <strong>같은 교회 관리자</strong>
              에게 어떤 이메일로 등록됐는지 물어봐 주세요.
              <br />
              교사로 초대받은 경우 관리자가 보낸 카톡 초대 링크를 다시 눌러
              새 비밀번호로 가입하실 수도 있어요.
            </p>
          </>
        )}
      </div>
      <style jsx>{authStyles}</style>
    </main>
  );
}
