"use client";

// =============================================================================
// 로그인/Supabase 통신 진단 — /debug-auth
// -----------------------------------------------------------------------------
// 모바일/배포에서 로그인이 안 될 때 정확한 원인을 한 번에 보기 위한 페이지.
// 보안 민감 정보(anon key 등)는 가려서 표시.
//   - 현재 클라이언트가 들고 있는 NEXT_PUBLIC_SUPABASE_URL 의 정규화 결과.
//   - /auth/v1/health 호출 결과 (호스트가 살아있는지).
//   - /auth/v1/settings 호출 결과 (anon key 가 받아들여지는지).
//   - 마지막 로그인 시 받은 raw 에러 (sessionStorage 에 저장된 것).
// 이 페이지는 anon 도 볼 수 있도록 RLS 우회 호출만 사용한다.
// =============================================================================

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "../lib/supabaseClient";

type ProbeResult = {
  ok: boolean;
  status: number | null;
  bodyPreview: string;
  errorMessage: string | null;
};

const LAST_AUTH_ERROR_KEY = "haruchi:last-auth-error";

function normalizeSupabaseUrlForDisplay(raw: string): string {
  if (!raw) return "";
  let v = raw.trim().replace(/^['"]|['"]$/g, "").replace(/\s+/g, "");
  v = v.replace(/^(https?:\/\/)+/i, "https://");
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  v = v.replace(/\/+$/g, "");
  try {
    const u = new URL(v);
    if (/\.supabase\.(co|in)$/i.test(u.hostname)) {
      return `${u.protocol}//${u.host.toLowerCase()}`;
    }
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/g, "")}`;
  } catch {
    return "(파싱 실패)";
  }
}

function rawUrlHasServicePath(raw: string): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw.trim().replace(/^['"]|['"]$/g, ""));
    return /^\/(rest|auth|storage|realtime|functions|graphql)\/v\d+\/?/i.test(
      u.pathname || "",
    );
  } catch {
    return false;
  }
}

function maskKey(key: string | undefined | null): string {
  if (!key) return "(없음)";
  const trimmed = key.trim();
  if (trimmed.length <= 12) return "***";
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)} (length=${trimmed.length})`;
}

async function probe(url: string, init?: RequestInit): Promise<ProbeResult> {
  try {
    const res = await fetch(url, init);
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {
      bodyText = "(본문을 읽을 수 없음)";
    }
    return {
      ok: res.ok,
      status: res.status,
      bodyPreview: bodyText.slice(0, 400),
      errorMessage: null,
    };
  } catch (e) {
    return {
      ok: false,
      status: null,
      bodyPreview: "",
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }
}

export default function DebugAuthPage() {
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  const [health, setHealth] = useState<ProbeResult | null>(null);
  const [settings, setSettings] = useState<ProbeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastAuthError, setLastAuthError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(LAST_AUTH_ERROR_KEY);
      if (stored) setLastAuthError(stored);
    } catch {
      // sessionStorage 차단된 환경은 그냥 무시.
    }
  }, []);

  const runProbes = useCallback(async () => {
    if (!rawUrl) return;
    setBusy(true);
    // URL 정규화는 표시만 보여주고, 실제 호출은 트림한 값으로.
    const base = rawUrl.trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/g, "");
    const h = await probe(`${base}/auth/v1/health`);
    const s = await probe(`${base}/auth/v1/settings`, {
      headers: { apikey: rawKey.trim() },
    });
    setHealth(h);
    setSettings(s);
    setBusy(false);
  }, [rawKey, rawUrl]);

  useEffect(() => {
    void runProbes();
  }, [runProbes]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        padding: "24px 16px",
        color: "var(--ink)",
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <header style={{ marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            로그인 진단
          </h1>
          <p style={{ marginTop: 6, color: "var(--ink-soft)", fontSize: 14 }}>
            이 페이지는 화면 그대로 캡쳐해서 보내 주시면 원인을 바로 알 수
            있어요. <Link href="/login">← 로그인 페이지로</Link>
          </p>
        </header>

        <Section title="환경 변수 (브라우저에 노출된 값)">
          <Row label="설정 완료" value={configured ? "예" : "아니오"} />
          <Row label="원본 SUPABASE_URL" value={rawUrl || "(빈 값)"} mono />
          <Row
            label="정규화된 URL"
            value={normalizeSupabaseUrlForDisplay(rawUrl) || "(빈 값)"}
            mono
          />
          {rawUrlHasServicePath(rawUrl) ? (
            <Row
              label="⚠️ 경고"
              value={
                "환경 변수에 /rest/v1, /auth/v1 같은 경로가 붙어 있어요. " +
                "Supabase 의 'Project URL' (origin) 만 넣어야 해요. " +
                "예: https://xxxx.supabase.co"
              }
            />
          ) : null}
          <Row label="ANON KEY (마스킹)" value={maskKey(rawKey)} mono />
        </Section>

        <Section
          title={`/auth/v1/health — 호스트 살아있는지${health ? ` · HTTP ${health.status ?? "ERR"}` : ""}`}
        >
          {health ? (
            <>
              <Row
                label="결과"
                value={health.ok ? "정상" : `실패 (${health.status ?? health.errorMessage})`}
              />
              {health.errorMessage ? (
                <Row label="네트워크 에러" value={health.errorMessage} mono />
              ) : null}
              <Row label="응답 본문" value={health.bodyPreview || "(본문 없음)"} mono multiline />
            </>
          ) : (
            <p style={{ color: "var(--ink-soft)", fontSize: 13, margin: 0 }}>
              요청 중…
            </p>
          )}
        </Section>

        <Section
          title={`/auth/v1/settings — anon key 통과 여부${settings ? ` · HTTP ${settings.status ?? "ERR"}` : ""}`}
        >
          {settings ? (
            <>
              <Row
                label="결과"
                value={settings.ok ? "정상 (anon key 유효)" : `실패 (${settings.status ?? settings.errorMessage})`}
              />
              {settings.errorMessage ? (
                <Row label="네트워크 에러" value={settings.errorMessage} mono />
              ) : null}
              <Row label="응답 본문" value={settings.bodyPreview || "(본문 없음)"} mono multiline />
            </>
          ) : (
            <p style={{ color: "var(--ink-soft)", fontSize: 13, margin: 0 }}>
              요청 중…
            </p>
          )}
        </Section>

        <Section title="마지막 로그인 시도 에러 (직전 시도가 있을 때)">
          {lastAuthError ? (
            <Row label="raw 메시지" value={lastAuthError} mono multiline />
          ) : (
            <p style={{ color: "var(--ink-soft)", fontSize: 13, margin: 0 }}>
              아직 기록된 에러가 없어요. <Link href="/login">로그인</Link>을
              한 번 시도해 본 뒤 이 페이지를 새로고침 해 주세요.
            </p>
          )}
        </Section>

        <button
          type="button"
          onClick={() => void runProbes()}
          disabled={busy}
          style={{
            height: 44,
            borderRadius: 10,
            border: "1px solid var(--line)",
            background: "var(--surface)",
            color: "var(--ink)",
            fontWeight: 600,
            fontSize: 14,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "다시 확인 중…" : "다시 확인"}
        </button>

        <details style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            결과 해석 가이드
          </summary>
          <ul style={{ marginTop: 8, lineHeight: 1.7 }}>
            <li>
              <b>health 가 HTTP 401</b> 또는 <b>200</b> → 호스트는 정상.
            </li>
            <li>
              <b>health 가 네트워크 에러 / DNS / 404</b> → SUPABASE_URL 값이
              잘못된 것. 호스팅 환경변수 확인.
            </li>
            <li>
              <b>settings 가 HTTP 200</b> → anon key 도 유효. 로그인은 거의
              확실히 됨.
            </li>
            <li>
              <b>settings 가 HTTP 401/403</b> → anon key 가 틀린 것. 호스팅
              환경변수에서 ANON KEY 다시 복사.
            </li>
            <li>
              <b>마지막 raw 메시지가 "Invalid path…"</b> → URL 에 보이지 않는
              공백/슬래시/이중 프로토콜이 포함됐을 가능성. "정규화된 URL"
              값을 보고 이상한지 확인.
            </li>
          </ul>
        </details>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
  multiline,
}: {
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: 12,
        fontSize: 13,
        alignItems: multiline ? "flex-start" : "center",
      }}
    >
      <div style={{ color: "var(--ink-soft)", fontWeight: 500 }}>{label}</div>
      <div
        style={{
          color: "var(--ink)",
          fontFamily: mono
            ? "ui-monospace, SFMono-Regular, Menlo, monospace"
            : "inherit",
          fontSize: mono ? 12.5 : 13,
          wordBreak: "break-all",
          whiteSpace: multiline ? "pre-wrap" : "normal",
          background: mono ? "var(--surface-alt)" : "transparent",
          padding: mono ? "6px 8px" : 0,
          borderRadius: 6,
        }}
      >
        {value}
      </div>
    </div>
  );
}
