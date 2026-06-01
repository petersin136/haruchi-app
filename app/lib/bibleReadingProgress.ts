"use client";

// =============================================================================
// 학생(anon) 영역.
// v2 schema 변경점 반영:
//   1) 학생 로그인 흐름: 교회(anon SELECT) → br_list_classes RPC → br_list_students RPC
//      → 기존 PIN 함수(br_student_has_pin/br_set_student_pin/br_verify_student)
//   2) 진도 기록은 반드시 br_complete_chapter RPC (PIN 필요)
//   3) 진도 조회는 br_list_student_chapters RPC (PIN 필요)
//   4) PIN 은 sessionStorage + 메모리 (localStorage 에 절대 저장하지 않음)
// =============================================================================

import { getSupabaseClient } from "./supabaseClient";
import type { BookId } from "../bible-reading/books";

export type BibleChurch = {
  id: string;
  name: string;
};

export type BibleClass = {
  id: string;
  name: string;
  member_label: string;
};

export type BibleStudent = {
  id: string;
  name: string;
  has_pin: boolean;
};

export type ReadingLogRow = {
  student_id: string;
  class_id: string;
  book: BookId;
  chapter: number;
  translation: "krv" | "kids";
  completed_at: string;
};

export type IdentifiedStudent = {
  id: string;
  name: string;
  classId: string;
  className?: string;
  churchId: string;
  churchName?: string;
  memberLabel?: string;
};

const STUDENT_STORAGE_KEY = "pbcs_bible_student_v2";
const PENDING_LOGS_KEY = "pbcs_bible_pending_logs_v2";
const PIN_SESSION_KEY = "pbcs_bible_student_pin_v2";

// -----------------------------------------------------------------------------
// 학생 식별 정보 보관 (localStorage)
// -----------------------------------------------------------------------------
export function loadStoredStudent(): IdentifiedStudent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STUDENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IdentifiedStudent;
    if (parsed && parsed.id && parsed.name && parsed.classId && parsed.churchId) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function storeStudent(student: IdentifiedStudent) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(student));
}

export function clearStoredStudent() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STUDENT_STORAGE_KEY);
  clearStudentPin();
  // 오프라인 큐도 비운다(다른 학생 PIN 으로 보낼 수 없도록).
  window.localStorage.removeItem(PENDING_LOGS_KEY);
}

// -----------------------------------------------------------------------------
// PIN 보관 — sessionStorage (탭 닫으면 사라짐) + 메모리 캐시
//   * localStorage 에 저장하지 않는다.
// -----------------------------------------------------------------------------
let memoryPin: string | null = null;

export function storeStudentPin(pin: string) {
  memoryPin = pin;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PIN_SESSION_KEY, pin);
  } catch {
    // ignore (private mode 등)
  }
}

export function loadStudentPin(): string | null {
  if (memoryPin) return memoryPin;
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(PIN_SESSION_KEY);
    if (v) memoryPin = v;
    return v;
  } catch {
    return null;
  }
}

export function clearStudentPin() {
  memoryPin = null;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PIN_SESSION_KEY);
  } catch {
    // ignore
  }
}

// -----------------------------------------------------------------------------
// 교회/반/학생 목록 (학생 로그인 흐름)
// -----------------------------------------------------------------------------
export async function fetchChurches(): Promise<BibleChurch[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("br_churches")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BibleChurch[];
}

export async function fetchClassesByChurch(
  churchId: string,
): Promise<BibleClass[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("br_list_classes", {
    p_church_id: churchId,
  });
  if (error) throw error;
  return (data ?? []) as BibleClass[];
}

export async function fetchStudentsByClass(args: {
  churchId: string;
  classId: string;
}): Promise<BibleStudent[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  // v2.2: 학생 이름은 개인정보. RPC 가 (p_church_id, p_class_id) 두 값을 받아
  // 반의 소속 교회와 호출자가 주장한 교회가 일치할 때만 결과를 돌려준다.
  const { data, error } = await supabase.rpc("br_list_students", {
    p_church_id: args.churchId,
    p_class_id: args.classId,
  });
  if (error) throw error;
  return (data ?? []) as BibleStudent[];
}

// -----------------------------------------------------------------------------
// PIN 함수들 (기존 시그니처 유지)
// -----------------------------------------------------------------------------
export async function verifyStudentPin(
  studentId: string,
  pin: string,
): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("br_verify_student", {
    p_student_id: studentId,
    p_pin: pin,
  });
  if (error) {
    console.warn("verifyStudentPin failed", error);
    return false;
  }
  return data === true;
}

export async function checkStudentHasPin(studentId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("br_student_has_pin", {
    p_student_id: studentId,
  });
  if (error) {
    console.warn("checkStudentHasPin failed", error);
    return false;
  }
  return data === true;
}

export type SetPinResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_configured" | "already_set" | "server_error";
      message?: string;
    };

export async function setStudentPin(
  studentId: string,
  pin: string,
): Promise<SetPinResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, reason: "not_configured" };
  const { data, error } = await supabase.rpc("br_set_student_pin", {
    p_student_id: studentId,
    p_pin: pin,
  });
  if (error) {
    console.warn("setStudentPin failed", error);
    return { ok: false, reason: "server_error", message: error.message };
  }
  if (data === true) return { ok: true };
  return { ok: false, reason: "already_set" };
}

// -----------------------------------------------------------------------------
// 진도 조회 — anon 은 br_reading_logs 직접 권한이 없으므로 RPC 사용.
// -----------------------------------------------------------------------------
export async function fetchCompletedChapters(
  studentId: string,
  book: BookId,
): Promise<ReadingLogRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const pin = loadStudentPin();
  if (!pin) return []; // PIN 없으면 동기화 생략 (다음 진도 기록 시 PIN 요청됨)
  const { data, error } = await supabase.rpc("br_list_student_chapters", {
    p_student_id: studentId,
    p_pin: pin,
    p_book: book,
  });
  if (error) {
    console.warn("fetchCompletedChapters failed", error);
    return [];
  }
  const rows = (data ?? []) as Array<{
    chapter: number;
    translation: "krv" | "kids";
    completed_at: string;
  }>;
  return rows.map((r) => ({
    student_id: studentId,
    class_id: "",
    book,
    chapter: r.chapter,
    translation: r.translation,
    completed_at: r.completed_at,
  }));
}

// -----------------------------------------------------------------------------
// 진도 기록 — 반드시 br_complete_chapter RPC.
// PIN 미보유면 'needs_pin' 반환하여 호출 측에서 PIN 모달을 띄우게 한다.
// 오프라인이면 PIN 포함해 큐에 적재.
// -----------------------------------------------------------------------------
type PendingLog = {
  studentId: string;
  pin: string;
  book: BookId;
  chapter: number;
  translation: "krv" | "kids";
  completedAt: string;
};

function readPendingLogs(): PendingLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_LOGS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as PendingLog[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writePendingLogs(rows: PendingLog[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify(rows));
}

function queueLog(log: PendingLog) {
  const list = readPendingLogs();
  const exists = list.some(
    (l) =>
      l.studentId === log.studentId &&
      l.book === log.book &&
      l.chapter === log.chapter &&
      l.translation === log.translation,
  );
  if (!exists) {
    list.push(log);
    writePendingLogs(list);
  }
}

async function callCompleteChapter(log: PendingLog): Promise<"ok" | "bad_pin" | "fail"> {
  const supabase = getSupabaseClient();
  if (!supabase) return "fail";
  const { data, error } = await supabase.rpc("br_complete_chapter", {
    p_student_id: log.studentId,
    p_pin: log.pin,
    p_book: log.book,
    p_chapter: log.chapter,
    p_translation: log.translation,
  });
  if (error) {
    console.warn("br_complete_chapter failed", error);
    return "fail";
  }
  if (data === true) return "ok";
  // RPC 는 PIN 불일치 / 잘못된 입력 시 false 를 돌려줌.
  return "bad_pin";
}

export type RecordChapterResult =
  | "ok"
  | "queued"
  | "needs_pin"
  | "bad_pin";

export async function recordChapterCompletion(args: {
  student: IdentifiedStudent;
  book: BookId;
  chapter: number;
  translation: "krv" | "kids";
}): Promise<RecordChapterResult> {
  const pin = loadStudentPin();
  if (!pin) return "needs_pin";

  const log: PendingLog = {
    studentId: args.student.id,
    pin,
    book: args.book,
    chapter: args.chapter,
    translation: args.translation,
    completedAt: new Date().toISOString(),
  };

  const supabase = getSupabaseClient();
  if (!supabase) {
    queueLog(log);
    return "queued";
  }

  const result = await callCompleteChapter(log);
  if (result === "ok") return "ok";
  if (result === "bad_pin") {
    // PIN 이 만료/변경됐을 수 있다. 보관 PIN 폐기 후 재요청 신호.
    clearStudentPin();
    return "bad_pin";
  }
  queueLog(log);
  return "queued";
}

export async function flushPendingLogs(): Promise<number> {
  const supabase = getSupabaseClient();
  if (!supabase) return 0;
  const list = readPendingLogs();
  if (list.length === 0) return 0;

  const remaining: PendingLog[] = [];
  let sent = 0;
  for (const log of list) {
    const result = await callCompleteChapter(log);
    if (result === "ok") {
      sent += 1;
    } else if (result === "bad_pin") {
      // PIN 이 더 이상 유효하지 않으면 그 큐 항목은 의미가 없다 → 버림.
      // (다음 로그인에서 새 PIN 으로 다시 기록될 것)
    } else {
      remaining.push(log);
    }
  }
  writePendingLogs(remaining);
  return sent;
}
