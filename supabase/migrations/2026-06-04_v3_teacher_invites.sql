-- =============================================================================
-- v3 — 교사 초대 링크 (Teacher Invites)
-- =============================================================================
-- 변경 의도:
--   기존: 교사 본인이 /teacher-signup 에서 self-signup → 관리자에게 이메일 알려줌
--         → 관리자가 /admin 의 br_admin_add_teacher 로 그 이메일을 연결.
--         (수동·왕복·이메일을 외부 채널로 전달해야 함)
--   변경: 관리자가 교사 정보를 입력하면 토큰이 들어간 초대 링크가 발급되고,
--         교사는 그 링크를 열어 비밀번호만 정하면 가입+연결까지 한 번에 완료.
--
-- 추가 객체:
--   - table public.br_teacher_invites
--   - rpc br_admin_create_teacher_invite(email, name) → 초대 링크 발급
--   - rpc br_peek_teacher_invite(token)              → 익명이 토큰 유효성 + 표시정보 조회
--   - rpc br_accept_teacher_invite(token)            → 로그인된 사용자를 교사로 연결
--   - rpc br_admin_revoke_teacher_invite(invite_id)  → 미사용 초대 폐기
--   - rpc br_admin_list_teacher_invites()            → 우리 교회의 초대 목록(대기/만료/사용됨)
--
-- 본 마이그레이션은 멱등(idempotent): 두 번 실행해도 안전.
-- =============================================================================

-- 0) 정리 — 함수 시그니처 변경에 대비해 미리 drop.
drop function if exists public.br_admin_create_teacher_invite(text, text);
drop function if exists public.br_peek_teacher_invite(text);
drop function if exists public.br_accept_teacher_invite(text);
drop function if exists public.br_admin_revoke_teacher_invite(uuid);
drop function if exists public.br_admin_list_teacher_invites();

-- 1) 테이블 ----------------------------------------------------------------
create table if not exists public.br_teacher_invites (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.br_churches(id) on delete cascade,
  token        text not null unique,
  email        text not null,
  name         text not null,
  created_by   uuid not null references public.br_church_members(id) on delete cascade,
  expires_at   timestamptz not null default (now() + interval '14 days'),
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists br_teacher_invites_church_idx on public.br_teacher_invites(church_id);
create index if not exists br_teacher_invites_token_idx  on public.br_teacher_invites(token);

-- 같은 교회에서 같은 이메일에 대해 '대기 중'(accepted_at is null + 만료 전) 초대가
-- 두 개 이상 생기지 않도록 부분 unique. 이미 가입한(used) 초대는 영구 기록으로 남김.
create unique index if not exists br_teacher_invites_pending_unique
  on public.br_teacher_invites (church_id, lower(email))
  where accepted_at is null;

-- 2) RLS 활성화 + 권한 ------------------------------------------------------
alter table public.br_teacher_invites enable row level security;
revoke all on public.br_teacher_invites from anon, authenticated;
-- 직접 select 는 admin 만 (목록 화면용). insert/update/delete 는 모두 RPC 경유.
grant select on public.br_teacher_invites to authenticated;

drop policy if exists br_teacher_invites_admin_select on public.br_teacher_invites;
create policy br_teacher_invites_admin_select on public.br_teacher_invites for select to authenticated
  using (church_id = public.br_current_church_id() and public.br_current_role() = 'admin');

-- 3) RPC: 초대 발급 (관리자) -----------------------------------------------
create or replace function public.br_admin_create_teacher_invite(
  p_email text,
  p_name  text
) returns table (invite_id uuid, token text, expires_at timestamptz, email text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_church  uuid := public.br_current_church_id();
  v_role    text := public.br_current_role();
  v_me      uuid;
  v_email   text;
  v_token   text;
  v_id      uuid;
  v_exp     timestamptz;
begin
  if v_church is null then raise exception 'not in a church'; end if;
  if v_role   <> 'admin' then raise exception 'admin only'; end if;
  if p_email is null or btrim(p_email) = '' then raise exception 'email required'; end if;
  if p_name  is null or btrim(p_name)  = '' then raise exception 'name required';  end if;

  v_email := lower(btrim(p_email));

  -- 이미 우리 교회 멤버라면 거부.
  if exists (
    select 1 from public.br_church_members m
      join auth.users u on u.id = m.user_id
     where m.church_id = v_church and lower(u.email) = v_email
  ) then
    raise exception '이미 우리 교회 멤버로 등록된 이메일입니다.';
  end if;

  select id into v_me from public.br_church_members
   where user_id = auth.uid() and church_id = v_church
   limit 1;

  -- 같은 이메일의 '대기 중' 초대가 있으면 갱신(연장+새 토큰). 부분 unique 인덱스 충돌 방지.
  v_token := encode(gen_random_bytes(24), 'hex');
  v_exp   := now() + interval '14 days';

  if exists (
    select 1 from public.br_teacher_invites
     where church_id = v_church
       and lower(email) = v_email
       and accepted_at is null
  ) then
    update public.br_teacher_invites
       set token = v_token,
           name  = btrim(p_name),
           created_by = v_me,
           expires_at = v_exp,
           created_at = now()
     where church_id = v_church
       and lower(email) = v_email
       and accepted_at is null
     returning id into v_id;
  else
    insert into public.br_teacher_invites
        (church_id, token, email, name, created_by, expires_at)
      values
        (v_church, v_token, v_email, btrim(p_name), v_me, v_exp)
      returning id into v_id;
  end if;

  return query select v_id, v_token, v_exp, v_email;
end;
$$;

-- 4) RPC: 익명 토큰 조회 ----------------------------------------------------
-- 초대 페이지에서 토큰만으로 "어느 교회 / 어떤 이메일 / 유효 여부" 만 노출.
-- 토큰이 없거나 만료/사용됐으면 valid=false 와 함께 빈 값 반환.
create or replace function public.br_peek_teacher_invite(p_token text)
returns table (church_name text, email text, name text, valid boolean, reason text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_inv record;
  v_church_name text;
begin
  if p_token is null or btrim(p_token) = '' then
    return query select null::text, null::text, null::text, false, 'invalid'::text;
    return;
  end if;
  select * into v_inv from public.br_teacher_invites where token = p_token;
  if not found then
    return query select null::text, null::text, null::text, false, 'invalid'::text;
    return;
  end if;
  if v_inv.accepted_at is not null then
    return query select null::text, v_inv.email, v_inv.name, false, 'used'::text;
    return;
  end if;
  if v_inv.expires_at <= now() then
    return query select null::text, v_inv.email, v_inv.name, false, 'expired'::text;
    return;
  end if;
  select c.name into v_church_name from public.br_churches c where c.id = v_inv.church_id;
  return query select v_church_name, v_inv.email, v_inv.name, true, null::text;
end;
$$;

-- 5) RPC: 초대 수락 (이미 로그인된 사용자) --------------------------------
-- 호출자의 auth.uid() 이메일이 초대 이메일과 일치해야만 수락. 이메일 위변조 차단.
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

  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null or v_email <> lower(v_inv.email) then
    raise exception '로그인된 이메일이 초대받은 이메일과 달라요.';
  end if;

  if exists (select 1 from public.br_church_members where user_id = v_uid) then
    raise exception '이미 교회에 소속된 사용자입니다.';
  end if;

  insert into public.br_church_members (church_id, user_id, role, name)
    values (v_inv.church_id, v_uid, 'teacher', v_inv.name)
    returning id into v_member;

  update public.br_teacher_invites
     set accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  return v_member;
end;
$$;

-- 6) RPC: 초대 폐기 (관리자) -----------------------------------------------
create or replace function public.br_admin_revoke_teacher_invite(p_invite_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_church uuid := public.br_current_church_id();
  v_role   text := public.br_current_role();
begin
  if v_church is null then raise exception 'not in a church'; end if;
  if v_role   <> 'admin' then raise exception 'admin only'; end if;
  delete from public.br_teacher_invites
    where id = p_invite_id
      and church_id = v_church
      and accepted_at is null;
  return found;
end;
$$;

-- 7) RPC: 초대 목록 (관리자) -----------------------------------------------
-- token 은 노출. (RLS 의 select 정책으로도 admin 만 보지만, 관리자 화면이 '복사 가능한
-- 링크'를 한 번 더 보여줘야 하므로 RPC 로 통일된 반환을 제공.)
create or replace function public.br_admin_list_teacher_invites()
returns table (
  id          uuid,
  email       text,
  name        text,
  token       text,
  expires_at  timestamptz,
  accepted_at timestamptz,
  created_at  timestamptz,
  status      text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_church uuid := public.br_current_church_id();
  v_role   text := public.br_current_role();
begin
  if v_church is null then return; end if;
  if v_role   <> 'admin' then return; end if;
  return query
    select i.id, i.email, i.name, i.token, i.expires_at, i.accepted_at, i.created_at,
           case
             when i.accepted_at is not null then 'used'
             when i.expires_at <= now()    then 'expired'
             else 'pending'
           end as status
      from public.br_teacher_invites i
     where i.church_id = v_church
     order by i.created_at desc;
end;
$$;

-- 8) 실행 권한 --------------------------------------------------------------
grant execute on function public.br_admin_create_teacher_invite(text, text) to authenticated;
grant execute on function public.br_peek_teacher_invite(text)               to anon, authenticated;
grant execute on function public.br_accept_teacher_invite(text)             to authenticated;
grant execute on function public.br_admin_revoke_teacher_invite(uuid)       to authenticated;
grant execute on function public.br_admin_list_teacher_invites()            to authenticated;
