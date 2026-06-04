"use client";

// =============================================================================
// 비밀번호 찾기 (재설정 메일 발송) — /forgot-password
// -----------------------------------------------------------------------------
// 입력한 이메일로 Supabase 가 recovery 메일을 보낸다. 메일의 링크를 누르면
// /reset-password 페이지로 돌아와 새 비밀번호를 설정할 수 있다.
// =============================================================================

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adultRequestPasswordReset } from "../../lib/multitenancy";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { authStyles } from "../authStyles";

// 한글 에러 메시지에서 "약 N초/분 뒤에" 부분을 뽑아내 남은 초로 환산.
// translateAuthError 가 "보안을 위해 약 50초 뒤에 다시 시도해 주세요…"
// 또는 "약 2분 뒤에…" 형태로 메시지를 만들기 때문에 둘 다 잡는다.
function extractWaitSeconds(message: string): number | null {
  const sec = message.match(/약\s*(\d+)\s*초/);
  if (sec) {
    const n = parseInt(sec[1] ?? "0", 10);
    if (n > 0) return n;
  }
  const min = message.match(/약\s*(\d+)\s*분/);
  if (min) {
    const n = parseInt(min[1] ?? "0", 10);
    if (n > 0) return n * 60;
  }
  return null;
}

export default function ForgotPasswordPage() {
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // 재시도까지 남은 초. 0 보다 크면 버튼 비활성 + 카운트다운 표시.
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  const startCooldown = useCallback((seconds: number) => {
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    setCooldown(seconds);
    cooldownTimer.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

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
      // 성공해도 보안 정책상 같은 이메일로 짧은 시간 내 재전송이 막히므로
      // 60초 쿨다운을 걸어 사용자가 의미 없는 재시도를 하지 않게 한다.
      startCooldown(60);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "재설정 메일 전송에 실패했어요.";
      setError(msg);
      const wait = extractWaitSeconds(msg);
      if (wait && wait > 0) startCooldown(wait);
    } finally {
      setBusy(false);
    }
  }, [email, startCooldown]);

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
              꼭 확인해 주세요. 5분이 지나도 안 오면 아래 버튼으로 다시
              시도해 주세요.
            </div>

            <button
              type="button"
              className="au-primary"
              onClick={() => void handleSubmit()}
              disabled={busy || cooldown > 0}
            >
              {busy
                ? "보내는 중…"
                : cooldown > 0
                  ? `${cooldown}초 뒤 재전송 가능`
                  : "재설정 메일 다시 보내기"}
            </button>

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
                  if (e.key === "Enter" && cooldown === 0) void handleSubmit();
                }}
                placeholder="가입할 때 사용한 이메일"
              />
            </label>

            {error ? <div className="au-error">{error}</div> : null}

            <button
              type="button"
              className="au-primary"
              onClick={() => void handleSubmit()}
              disabled={busy || !email || cooldown > 0}
            >
              {busy
                ? "보내는 중…"
                : cooldown > 0
                  ? `${cooldown}초 뒤 다시 시도 가능`
                  : "재설정 메일 보내기"}
            </button>

            {cooldown > 0 ? (
              <p
                className="au-foot"
                style={{ marginTop: 8, color: "var(--ink-soft)" }}
              >
                보안을 위해 같은 이메일로는 짧은 시간 내 여러 번 보낼 수 없어요.
                <br />
                혹시 직전에 보낸 메일이 이미 도착했을 수 있으니{" "}
                <strong>메일함(스팸함 포함)</strong>을 먼저 확인해 주세요.
              </p>
            ) : (
              <p className="au-foot">
                가입한 이메일이 기억나지 않으시면 <strong>같은 교회/단체
                관리자</strong>에게 어떤 이메일로 등록됐는지 물어봐 주세요.
                <br />
                교사로 초대받은 경우 관리자가 보낸 카톡 초대 링크를 다시 눌러
                새 비밀번호로 가입하실 수도 있어요.
              </p>
            )}
          </>
        )}
      </div>
      <style jsx>{authStyles}</style>
    </main>
  );
}
