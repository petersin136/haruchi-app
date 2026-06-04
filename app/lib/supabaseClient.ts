"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

// 배포 환경 변수에 사람이 실수로 끝에 슬래시(`https://xxx.supabase.co/`),
// 앞뒤 공백/따옴표, 심지어 `https://https://` 같은 이중 프로토콜을 붙여
// 놓는 경우가 종종 있다. 그대로 두면 supabase-js 가
// `https://xxx.supabase.co//auth/v1/token` 같은 잘못된 URL 로 요청을 보내고,
// CDN(에지) 단계에서 "Invalid path specified in request URL" 같은 영어
// 에러가 떨어진다. 클라이언트 생성 시점에 한 번 정리해서 그런 사고를 막는다.
function sanitizeSupabaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  // 앞뒤 공백 + 따옴표 + 내부 공백/제어문자 제거.
  let v = raw.trim().replace(/^['"]|['"]$/g, "").replace(/\s+/g, "");
  if (!v) return null;
  // 이중 프로토콜 정리: `https://https://abc.supabase.co` → `https://abc.supabase.co`.
  v = v.replace(/^(https?:\/\/)+/i, "https://");
  // 프로토콜이 아예 없으면 https:// 를 강제로 붙여 줌.
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  // 끝 슬래시 제거.
  v = v.replace(/\/+$/g, "");
  // URL 로 한 번 파싱해서 유효성 검사. 깨졌으면 null.
  try {
    const u = new URL(v);
    if (!u.hostname) return null;
    // 호스트만 소문자로 정규화 (대소문자 차이로 인한 실패 방지).
    u.hostname = u.hostname.toLowerCase();
    // Supabase 프로젝트 URL 은 항상 origin 형태(`https://<ref>.supabase.co`)
    // 여야 한다. 사람이 호스팅 환경 변수에 실수로 Supabase 대시보드의
    // "REST URL"(예: `https://<ref>.supabase.co/rest/v1`) 이나 다른 서비스
    // 경로(`/auth/v1`, `/storage/v1`, `/realtime/v1`, `/functions/v1`,
    // `/graphql/v1`) 를 통째로 붙여 놓는 사고를 자주 본다. 이 경우
    // supabase-js 가 그 뒤에 자기 경로를 또 붙여서 `/rest/v1/auth/v1/token`
    // 같은 404 URL 이 만들어진다. 알려진 패턴이 보이면 잘라내서 origin 만
    // 사용한다.
    const isSupabaseHost = /\.supabase\.(co|in)$/i.test(u.hostname);
    const looksLikeServicePath =
      /^\/(rest|auth|storage|realtime|functions|graphql)\/v\d+\/?/i.test(
        u.pathname || "",
      );
    if (isSupabaseHost || looksLikeServicePath) {
      // Supabase 호스트면 무조건 path 무시 → 깨끗한 origin 만 반환.
      return `${u.protocol}//${u.host}`;
    }
    // 그 외에는 path 끝 슬래시만 정리해서 반환 (셀프 호스트 등 예외 대비).
    const path = (u.pathname || "").replace(/\/+$/g, "");
    return `${u.protocol}//${u.host}${path}`;
  } catch {
    return null;
  }
}

function sanitizeSupabaseKey(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
  return trimmed || null;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;

  const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = sanitizeSupabaseKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !key) return null;

  cachedClient = createClient(url, key, {
    auth: {
      persistSession: true,
      storageKey: "pbcs-bible-reading-auth",
      autoRefreshToken: true,
    },
    realtime: {
      params: { eventsPerSecond: 5 },
    },
  });
  return cachedClient;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      sanitizeSupabaseKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
