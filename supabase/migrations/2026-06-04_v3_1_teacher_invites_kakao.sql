-- =============================================================================
-- v3.1 — 교사 초대를 "카톡 공유 링크" 모델로 단순화
-- =============================================================================
-- 배경: v3 에서는 관리자가 교사 이메일까지 정확히 알고 미리 입력해야 했는데,
--       실제로는 카톡으로 링크를 보내는 게 일반적이라 이메일을 미리 받는 단계가
--       어색하고 번거롭다. v3.1 에서는:
--         - 관리자: 교사 "이름"만 입력 → 링크 발급
--         - 교사:   링크 열어서 "이메일 + 비밀번호" 직접 정해 가입
--       함으로써 카톡 등 외부 채널로 링크만 던지면 끝나는 흐름으로 정리.
--
-- 변경:
--   1) br_teacher_invites.email → nullable (관리자 발급 시점에는 비어 있을 수 있음)
--   2) 부분 unique 인덱스 (church_id, lower(email)) where accepted_at is null → 삭제
--      (이메일이 없을 수 있어 dedup 기준이 안 맞음. dedup 은 응용 계층에서 처리.)
--   3) br_admin_create_teacher_invite(p_name) — 시그니처에서 email 제거.
--   4) br_accept_teacher_invite(p_token)      — 이메일 매칭 검사 제거.
--      대신, 수락 시점에 호출자의 auth.users.email 을 br_teacher_invites.email 에
--      "기록"으로 저장하여 사후 추적 가능하게 한다.
--
-- 멱등: 두 번 실행해도 안전.
-- =============================================================================

-- 0) 컬럼/인덱스 정리 -------------------------------------------------------
alter table public.br_teacher_invites alter column email drop not null;
drop index if exists public.br_teacher_invites_pending_unique;

-- 1) 기존 함수 정리 ----------------------------------------------------------
drop function if exists public.br_admin_create_teacher_invite(text, text);
drop function if exists public.br_accept_teacher_invite(text);

-- 2) RPC: 초대 발급 (이름만 받음) -----------------------------------------
create or replace function public.br_admin_create_teacher_invite(
  p_name text
) returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_church uuid := public.br_current_church_id();
  v_role   text := public.br_current_role();
  v_me     uuid;
  v_token  text;
  v_id     uuid;
  v_exp    timestamptz;
begin
  if v_church is null then raise exception 'not in a church'; end if;
  if v_role   <> 'admin' then raise exception 'admin only'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'name required'; end if;

  select id into v_me from public.br_church_members
   where user_id = auth.uid() and church_id = v_church limit 1;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_exp   := now() + interval '14 days';

  insert into public.br_teacher_invites
      (church_id, token, email, name, created_by, expires_at)
    values
      (v_church, v_token, null, btrim(p_name), v_me, v_exp)
    returning id into v_id;

  return query select v_id, v_token, v_exp;
end;
$$;

-- 3) RPC: 초대 수락 (이메일 매칭 없음) -------------------------------------
-- 호출자의 auth.uid() 가 어느 교회에도 속하지 않은 상태여야 한다.
-- 호출자의 이메일은 사후 추적용으로 br_teacher_invites.email 에 기록.
create or replace function public.br_accept_teacher_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid    uuid := auth.uid();
  v_inv    record;
  v_email  text;
  v_member uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_token is null or btrim(p_token) = '' then raise exception 'token required'; end if;

  select * into v_inv from public.br_teacher_invites where token = p_token for update;
  if not found then raise exception '유효하지 않은 초대 링크입니다.'; end if;
  if v_inv.accepted_at is not null then raise exception '이미 사용된 초대 링크입니다.'; end if;
  if v_inv.expires_at <= now() then raise exception '만료된 초대 링크입니다.'; end if;

  if exists (select 1 from public.br_church_members where user_id = v_uid) then
    raise exception '이미 교회에 소속된 사용자입니다.';
  end if;

  -- 가입자의 실제 이메일을 기록(사후 추적용 — 어떤 계정이 이 초대를 사용했는지).
  select lower(email) into v_email from auth.users where id = v_uid;

  insert into public.br_church_members (church_id, user_id, role, name)
    values (v_inv.church_id, v_uid, 'teacher', v_inv.name)
    returning id into v_member;

  update public.br_teacher_invites
     set accepted_at = now(),
         accepted_by = v_uid,
         email = coalesce(v_email, v_inv.email)
   where id = v_inv.id;

  return v_member;
end;
$$;

-- 4) 실행 권한 (시그니처 바뀌었으므로 다시 부여) ---------------------------
grant execute on function public.br_admin_create_teacher_invite(text)        to authenticated;
grant execute on function public.br_accept_teacher_invite(text)              to authenticated;
