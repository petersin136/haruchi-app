"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

// 배포 환경 변수에 사람이 실수로 끝에 슬래시(`https://xxx.supabase.co/`)나
// 앞뒤 공백/따옴표를 붙여놓는 경우가 잦다. 그대로 두면 supabase-js 가
// `https://xxx.supabase.co//auth/v1/token` 같은 잘못된 URL 로 요청을 보내고,
// CDN(에지) 단계에서 "Invalid path specified in request URL" 같은 영어 에러가
// 떨어진다. 클라이언트 생성 시점에 한 번 정리해서 그런 사고를 막는다.
function sanitizeSupabaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/g, "");
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
