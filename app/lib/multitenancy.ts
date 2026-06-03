"use client";

// =============================================================================
// 멀티테넌시 어른(관리자/교사) 영역 헬퍼.
// - Supabase Auth 세션 위에서 br_church_members 의 role/church_id 를 조회한다.
// - schema.sql v2 의 RPC 들을 호출한다.
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "./supabaseClient";

export type AdultRole = "admin" | "teacher";

export type AdultSession = {
  userId: string;
  email: string | null;
  // br_church_members 에 매칭되는 행이 아직 없는 신규 가입자는 null.
  membership: {
    id: string;
    churchId: string;
    role: AdultRole;
    name: string;
    churchName: string;
  } | null;
};

export type AdultSessionState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "signed_in"; session: AdultSession };

export type ChurchRow = {
  id: string;
  name: string;
};

export type ClassRow = {
  id: string;
  church_id: string;
  name: string;
  member_label: string;
  created_at: string;
};

export type StudentRow = {
  id: string;
  church_id: string;
  class_id: string;
  name: string;
  guardian_consent: boolean;
  guardian_consent_at: string | null;
  created_at: string;
};

export type MemberRow = {
  id: string;
  church_id: string;
  user_id: string;
  role: AdultRole;
  name: string;
  created_at: string;
};

export type TeacherClassRow = {
  church_member_id: string;
  class_id: string;
};

export type TeacherInviteStatus = "pending" | "expired" | "used";

export type TeacherInviteRow = {
  id: string;
  // v3.1: 발급 시점엔 null, 수락 후 교사가 입력한 이메일이 채워짐.
  email: string | null;
  name: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  status: TeacherInviteStatus;
};

export type TeacherInvitePeek = {
  church_name: string | null;
  // v3.1: 카톡 모델에서는 발급 시점에 null 이므로 항상 null 가능.
  email: string | null;
  name: string | null;
  valid: boolean;
  reason: string | null;
};

export type ReadingLogRow = {
  id: string;
  church_id: string;
  class_id: string;
  student_id: string;
  book: string;
  chapter: number;
  translation: "krv" | "kids";
  completed_at: string;
};

// -----------------------------------------------------------------------------
// 세션 훅: auth 변화에 반응해 membership 까지 같이 들고 다님.
// -----------------------------------------------------------------------------
export function useAdultSession(): {
  state: AdultSessionState;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
} {
  const [state, setState] = useState<AdultSessionState>({ status: "loading" });

  const resolve = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setState({ status: "signed_out" });
      return;
    }
    const { data } = await supabase.auth.getSession();
    const auth = data.session;
    if (!auth) {
      setState({ status: "signed_out" });
      return;
    }
    const session: AdultSession = {
      userId: auth.user.id,
      email: auth.user.email ?? null,
      membership: null,
    };
    // 같은 교회 멤버만 select 가능한 RLS 라 본인 user_id 로 자기 행을 찾는다.
    const { data: memRows } = await supabase
      .from("br_church_members")
      .select("id, church_id, user_id, role, name, created_at")
      .eq("user_id", auth.user.id)
      .limit(1);
    const mem = memRows?.[0] as MemberRow | undefined;
    if (mem) {
      const { data: chRows } = await supabase
        .from("br_churches")
        .select("id, name")
        .eq("id", mem.church_id)
        .limit(1);
      const ch = chRows?.[0] as ChurchRow | undefined;
      session.membership = {
        id: mem.id,
        churchId: mem.church_id,
        role: mem.role,
        name: mem.name,
        churchName: ch?.name ?? "",
      };
    }
    setState({ status: "signed_in", session });
  }, []);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    void resolve();
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange(() => {
        void resolve();
      });
      unsub = () => data.subscription.unsubscribe();
    }
    return () => {
      if (unsub) unsub();
    };
  }, [resolve]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setState({ status: "signed_out" });
  }, []);

  return { state, refresh: resolve, signOut };
}

// -----------------------------------------------------------------------------
// Auth wrappers
// -----------------------------------------------------------------------------
export async function adultSignUp(email: string, password: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function adultSignIn(email: string, password: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// -----------------------------------------------------------------------------
// 셀프 가입: 교회 생성 + 본인을 admin 으로 등록.
// v2.3: 항목별 동의 + 약관 버전 + 서명자 이름 증빙 저장.
// -----------------------------------------------------------------------------
export type ConsentItems = {
  controller_acknowledged: boolean;
  minor_consent: boolean;
  purpose_limited: boolean;
  privacy_reviewed: boolean;
  // v2.5: 데이터 처리 위탁 계약(DPA) 동의. /dpa 약관 페이지에 대응.
  dpa_agreed: boolean;
};

export async function signupChurch(args: {
  churchName: string;
  adminName: string;
  consentItems: ConsentItems;
  consentVersion: string;
  consentAdminName: string;
}): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  const { data, error } = await supabase.rpc("br_signup_church", {
    p_church_name: args.churchName,
    p_admin_name: args.adminName,
    p_consent_items: args.consentItems,
    p_consent_version: args.consentVersion,
    p_consent_admin_name: args.consentAdminName,
  });
  if (error) throw error;
  return data as string;
}

// -----------------------------------------------------------------------------
// 반 CRUD
// -----------------------------------------------------------------------------
export async function listClasses(): Promise<ClassRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("br_classes")
    .select("id, church_id, name, member_label, created_at")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ClassRow[];
}

export async function createClass(args: {
  churchId: string;
  name: string;
  memberLabel: string;
}): Promise<ClassRow> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  const { data, error } = await supabase
    .from("br_classes")
    .insert({
      church_id: args.churchId,
      name: args.name.trim(),
      member_label: args.memberLabel.trim() || "학생",
    })
    .select("id, church_id, name, member_label, created_at")
    .single();
  if (error) throw error;
  return data as ClassRow;
}

export async function updateClass(args: {
  id: string;
  name: string;
  memberLabel: string;
}): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  const { error } = await supabase
    .from("br_classes")
    .update({ name: args.name.trim(), member_label: args.memberLabel.trim() || "학생" })
    .eq("id", args.id);
  if (error) throw error;
}

export async function deleteClass(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  const { error } = await supabase.from("br_classes").delete().eq("id", id);
  if (error) throw error;
}

// -----------------------------------------------------------------------------
// 학생 CRUD (어른용. PIN 은 학생이 직접 정함)
// -----------------------------------------------------------------------------
const STUDENT_COLUMNS =
  "id, church_id, class_id, name, guardian_consent, guardian_consent_at, created_at";

export async function listStudentsByClass(classId: string): Promise<StudentRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("br_students")
    .select(STUDENT_COLUMNS)
    .eq("class_id", classId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StudentRow[];
}

export async function listStudentsByChurch(): Promise<StudentRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("br_students")
    .select(STUDENT_COLUMNS)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StudentRow[];
}

export async function createStudent(args: {
  churchId: string;
  classId: string;
  name: string;
  guardianConsent: boolean;
}): Promise<StudentRow> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  // guardian_consent_at 은 트리거(br_students_consent_timestamp)가 서버에서 자동으로 채움.
  const { data, error } = await supabase
    .from("br_students")
    .insert({
      church_id: args.churchId,
      class_id: args.classId,
      name: args.name.trim(),
      guardian_consent: args.guardianConsent,
    })
    .select(STUDENT_COLUMNS)
    .single();
  if (error) throw error;
  return data as StudentRow;
}

export async function updateStudent(args: {
  id: string;
  name?: string;
  classId?: string;
  guardianConsent?: boolean;
}): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  const patch: Record<string, unknown> = {};
  if (args.name !== undefined) patch.name = args.name.trim();
  if (args.classId !== undefined) patch.class_id = args.classId;
  if (args.guardianConsent !== undefined) patch.guardian_consent = args.guardianConsent;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase
    .from("br_students")
    .update(patch)
    .eq("id", args.id);
  if (error) throw error;
}

export async function deleteStudent(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  const { error } = await supabase.from("br_students").delete().eq("id", id);
  if (error) throw error;
}

export async function adminResetStudentPin(studentId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  const { data, error } = await supabase.rpc("br_admin_reset_student_pin", {
    p_student_id: studentId,
  });
  if (error) throw error;
  return data === true;
}

// -----------------------------------------------------------------------------
// 교사 / 교사-반 배정
// -----------------------------------------------------------------------------
export async function listChurchMembers(): Promise<MemberRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("br_church_members")
    .select("id, church_id, user_id, role, name, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MemberRow[];
}

export async function listTeacherAssignments(): Promise<TeacherClassRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("br_teacher_classes")
    .select("church_member_id, class_id");
  if (error) throw error;
  return (data ?? []) as TeacherClassRow[];
}

// [DEPRECATED v3] 교사 초대 링크(adminCreateTeacherInvite) 로 대체됨.
// 호환을 위해 남겨두지만 새 UI 에서는 호출하지 않는다.
export async function adminAddTeacher(args: {
  email: string;
  name: string;
}): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  const { data, error } = await supabase.rpc("br_admin_add_teacher", {
    p_email: args.email.trim(),
    p_name: args.name.trim(),
  });
  if (error) throw error;
  return data as string;
}

// -----------------------------------------------------------------------------
// v3: 교사 초대 링크 — 관리자가 발급 → 교사가 /invite/[token] 으로 한 번에 가입+연결.
// -----------------------------------------------------------------------------
export type CreatedTeacherInvite = {
  invite_id: string;
  token: string;
  expires_at: string;
};

// v3.1 (카톡 공유 모델): 이름만 받아 링크를 발급. 이메일은 교사가 수락 시 자기 것 입력.
export async function adminCreateTeacherInvite(args: {
  name: string;
}): Promise<CreatedTeacherInvite> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  const { data, error } = await supabase.rpc("br_admin_create_teacher_invite", {
    p_name: args.name.trim(),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("초대 발급 응답이 비었어요.");
  return row as CreatedTeacherInvite;
}

export async function adminListTeacherInvites(): Promise<TeacherInviteRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("br_admin_list_teacher_invites");
  if (error) throw error;
  return (data ?? []) as TeacherInviteRow[];
}

export async function adminRevokeTeacherInvite(inviteId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  const { data, error } = await supabase.rpc("br_admin_revoke_teacher_invite", {
    p_invite_id: inviteId,
  });
  if (error) throw error;
  return data === true;
}

// /invite/[token] 페이지가 SSR 환경에서도 호출할 수 있도록 익명 안전.
export async function peekTeacherInvite(token: string): Promise<TeacherInvitePeek | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("br_peek_teacher_invite", { p_token: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as TeacherInvitePeek | null;
}

export async function acceptTeacherInvite(token: string): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  const { data, error } = await supabase.rpc("br_accept_teacher_invite", { p_token: token });
  if (error) throw error;
  return data as string;
}

export async function removeChurchMember(memberId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  const { error } = await supabase
    .from("br_church_members")
    .delete()
    .eq("id", memberId);
  if (error) throw error;
}

// 본인 또는 같은 교회 멤버의 표시 이름 변경 (admin 권한 필요 — RLS 가 강제).
export async function updateMemberName(args: {
  memberId: string;
  name: string;
}): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  const trimmed = args.name.trim();
  if (!trimmed) throw new Error("이름을 입력해 주세요.");
  const { error } = await supabase
    .from("br_church_members")
    .update({ name: trimmed })
    .eq("id", args.memberId);
  if (error) throw error;
}

export async function assignTeacherToClass(args: {
  churchMemberId: string;
  classId: string;
}): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  const { error } = await supabase.from("br_teacher_classes").insert({
    church_member_id: args.churchMemberId,
    class_id: args.classId,
  });
  if (error) throw error;
}

export async function unassignTeacherFromClass(args: {
  churchMemberId: string;
  classId: string;
}): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 가 설정되지 않았어요.");
  const { error } = await supabase
    .from("br_teacher_classes")
    .delete()
    .eq("church_member_id", args.churchMemberId)
    .eq("class_id", args.classId);
  if (error) throw error;
}

// -----------------------------------------------------------------------------
// 진도(어른용 직접 조회) - RLS 가 같은 교회 + 접근 가능한 반으로 한정.
// -----------------------------------------------------------------------------
export async function listReadingLogsByClass(args: {
  classId: string;
  book?: string;
}): Promise<ReadingLogRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  let q = supabase
    .from("br_reading_logs")
    .select(
      "id, church_id, class_id, student_id, book, chapter, translation, completed_at",
    )
    .eq("class_id", args.classId);
  if (args.book) q = q.eq("book", args.book);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ReadingLogRow[];
}
