-- =============================================================================
-- 성경읽기(Bible Reading) Supabase 스키마 — 멀티테넌시 (확정본 v2)
-- =============================================================================
-- 여러 교회(church)가 한 인스턴스에서 격리되어 쓰는 SaaS 구조.
-- 두 번 이상 실행해도 안전. 기존 단일 교회용 테이블이 있으면 drop 후 재생성(새 DB 전제).
-- v2 변경점:
--   1) 학생 진도 기록을 PIN 검증 RPC(br_complete_chapter)로만 가능하게 → 위변조 차단
--      (anon 의 reading_logs 직접 insert/update 권한 제거)
--   2) 교회에 admin 이 최소 1명 남도록 보호 트리거 추가
-- =============================================================================

-- 1) 기존 객체 정리 ----------------------------------------------------------
drop table if exists public.br_reading_logs    cascade;
drop table if exists public.br_students        cascade;
drop table if exists public.br_teacher_classes cascade;
drop table if exists public.br_classes         cascade;
drop table if exists public.br_church_members  cascade;
drop table if exists public.br_churches        cascade;
drop table if exists public.br_teachers        cascade;  -- 단일 교회용 잔재

drop function if exists public.br_student_has_pin(uuid);
drop function if exists public.br_set_student_pin(uuid, text);
drop function if exists public.br_verify_student(uuid, text);
drop function if exists public.br_complete_chapter(uuid, text, text, integer, text);
drop function if exists public.br_list_student_chapters(uuid, text, text);
drop function if exists public.br_admin_add_teacher(text, text);
drop function if exists public.br_admin_reset_student_pin(uuid);
-- 옛 시그니처(v2): br_list_students(p_class_id uuid). v2.2 에서 church_id 동반 검증으로 교체.
drop function if exists public.br_list_students(uuid);
drop function if exists public.br_list_students(uuid, uuid);
-- 옛 시그니처(v2): br_signup_church(text, text, boolean).
-- v2.3 에서 항목별 동의(jsonb) + 약관 버전 + 서명자 이름을 받도록 교체.
drop function if exists public.br_signup_church(text, text, boolean);
drop function if exists public.br_signup_church(text, text, jsonb, text, text);

create extension if not exists pgcrypto;

-- =============================================================================
-- 2) 테이블
-- =============================================================================

-- 2-1) 교회(테넌트)
--   동의 증빙 컬럼(v2.3):
--     consent_confirmed     : 필수 항목이 모두 체크된 상태인지(가입 시점에 true 로 고정).
--     consent_confirmed_at  : 동의 타임스탬프.
--     consent_version       : 동의한 약관 버전 문자열 (예: '2026-06-01').
--     consent_items         : 항목별 체크 결과 jsonb. 예:
--                             { "controller_acknowledged": true,
--                               "minor_consent": true,
--                               "purpose_limited": true,
--                               "privacy_reviewed": true }
--     consent_admin_name    : 동의 시점에 입력한 관리자(서명자) 이름. 추후 분쟁 시 증빙.
create table public.br_churches (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  consent_confirmed     boolean not null default false,
  consent_confirmed_at  timestamptz,
  consent_version       text,
  consent_items         jsonb,
  consent_admin_name    text,
  created_at            timestamptz not null default now()
);

-- 2-2) 어른 사용자(admin / teacher)
create table public.br_church_members (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.br_churches(id) on delete cascade,
  user_id     uuid not null unique references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin','teacher')),
  name        text not null,
  created_at  timestamptz not null default now()
);
create index br_church_members_church_idx on public.br_church_members(church_id);

-- 2-3) 반(Class). member_label: 멤버 호칭('학생'/'청년'/'회원' 등)
create table public.br_classes (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references public.br_churches(id) on delete cascade,
  name          text not null,
  member_label  text not null default '학생',
  created_at    timestamptz not null default now(),
  unique (church_id, name)
);
create index br_classes_church_idx on public.br_classes(church_id);

-- 2-4) 교사↔반 다대다
create table public.br_teacher_classes (
  church_member_id uuid not null references public.br_church_members(id) on delete cascade,
  class_id         uuid not null references public.br_classes(id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (church_member_id, class_id)
);
create index br_teacher_classes_class_idx on public.br_teacher_classes(class_id);

-- 2-5) 멤버(학생). pin_hash 는 컬럼 권한으로 누구에게도 노출 안 함.
--   부모(법정대리인) 동의 증빙(v2.4):
--     guardian_consent     : 부모 동의 여부. 학생 추가 시 admin 이 체크.
--     guardian_consent_at  : 동의 기록 시각. 트리거가 서버에서 자동 채움(=now())
--                            → 클라이언트가 임의 날짜 설정 불가.
create table public.br_students (
  id                   uuid primary key default gen_random_uuid(),
  church_id            uuid not null references public.br_churches(id) on delete cascade,
  class_id             uuid not null references public.br_classes(id) on delete cascade,
  name                 text not null,
  pin_hash             text,
  guardian_consent     boolean not null default false,
  guardian_consent_at  timestamptz,
  created_at           timestamptz not null default now()
);
create index br_students_church_idx on public.br_students(church_id);
create index br_students_class_idx  on public.br_students(class_id);

-- 2-6) 읽기 기록
create table public.br_reading_logs (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references public.br_churches(id) on delete cascade,
  class_id      uuid not null references public.br_classes(id) on delete cascade,
  student_id    uuid not null references public.br_students(id) on delete cascade,
  book          text not null check (book in ('proverbs','matthew','mark','luke','john')),
  chapter       integer not null check (chapter >= 1),
  translation   text not null check (translation in ('krv','kids')),
  completed_at  timestamptz not null default now(),
  unique (student_id, book, chapter)
);
create index br_reading_logs_church_idx       on public.br_reading_logs(church_id);
create index br_reading_logs_student_book_idx on public.br_reading_logs(student_id, book);

-- =============================================================================
-- 3) 일관성 트리거
-- =============================================================================
create or replace function public.br_students_ensure_consistency()
returns trigger language plpgsql as $$
declare v_class_church uuid;
begin
  select church_id into v_class_church from public.br_classes where id = new.class_id;
  if v_class_church is null then
    raise exception 'class % not found', new.class_id;
  end if;
  if new.church_id is null then new.church_id := v_class_church;
  elsif new.church_id <> v_class_church then
    raise exception 'br_students.church_id mismatch';
  end if;
  return new;
end;

$$;
drop trigger if exists br_students_consistency on public.br_students;
create trigger br_students_consistency
  before insert or update on public.br_students
  for each row execute function public.br_students_ensure_consistency();

-- 3-1b) 부모(법정대리인) 동의 타임스탬프를 서버가 통제 (v2.4)
--   - INSERT: guardian_consent=true 면 now() 로 채움, 아니면 null.
--   - UPDATE: false→true 전이일 때만 now() 로 갱신.
--             true→false 전환 시 timestamp 폐기(다시 받으면 새 타임스탬프).
--             그 외(이름/반 변경 등)에는 기존 타임스탬프 유지.
--   - 클라이언트가 임의 timestamp 를 보내도 무시.
create or replace function public.br_students_consent_timestamp()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.guardian_consent is true then
      new.guardian_consent_at := now();
    else
      new.guardian_consent_at := null;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.guardian_consent is true and old.guardian_consent is not true then
      new.guardian_consent_at := now();
    elsif new.guardian_consent is not true then
      new.guardian_consent_at := null;
    else
      new.guardian_consent_at := old.guardian_consent_at;
    end if;
  end if;
  return new;
end;

$$;
drop trigger if exists br_students_consent_timestamp on public.br_students;
create trigger br_students_consent_timestamp
  before insert or update on public.br_students
  for each row execute function public.br_students_consent_timestamp();

create or replace function public.br_reading_logs_ensure_consistency()
returns trigger language plpgsql as $$
declare v_class uuid; v_church uuid;
begin
  select class_id, church_id into v_class, v_church
    from public.br_students where id = new.student_id;
  if v_class is null then raise exception 'student % not found', new.student_id; end if;
  if new.class_id is null then new.class_id := v_class;
  elsif new.class_id <> v_class then raise exception 'br_reading_logs.class_id mismatch'; end if;
  if new.church_id is null then new.church_id := v_church;
  elsif new.church_id <> v_church then raise exception 'br_reading_logs.church_id mismatch'; end if;
  return new;
end;

$$;
drop trigger if exists br_reading_logs_consistency on public.br_reading_logs;
create trigger br_reading_logs_consistency
  before insert or update on public.br_reading_logs
  for each row execute function public.br_reading_logs_ensure_consistency();

-- 3-3) 교회에 admin 이 최소 1명 남도록 보호 (마지막 admin 삭제/강등 차단)
create or replace function public.br_protect_last_admin()
returns trigger language plpgsql as $$
declare v_church uuid; v_remaining int;
begin
  -- 대상이 admin 이었던 경우에만 검사
  if (tg_op = 'DELETE' and old.role = 'admin')
     or (tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin') then
    v_church := old.church_id;
    select count(*) into v_remaining
      from public.br_church_members
      where church_id = v_church and role = 'admin' and id <> old.id;
    if v_remaining = 0 then
      raise exception '교회에는 관리자(admin)가 최소 1명 있어야 합니다';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;

$$;
drop trigger if exists br_protect_last_admin on public.br_church_members;
create trigger br_protect_last_admin
  before update or delete on public.br_church_members
  for each row execute function public.br_protect_last_admin();

-- =============================================================================
-- 4) 헬퍼 함수
-- =============================================================================
create or replace function public.br_current_church_id()
returns uuid language sql stable security definer set search_path = public as $$
  select church_id from public.br_church_members where user_id = auth.uid() limit 1;

$$;

create or replace function public.br_current_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.br_church_members where user_id = auth.uid() limit 1;

$$;

create or replace function public.br_can_access_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with me as (
    select id, church_id, role from public.br_church_members where user_id = auth.uid() limit 1
  ),
  cls as (select church_id from public.br_classes where id = p_class_id)
  select exists (
    select 1 from me, cls
    where me.church_id = cls.church_id
      and ( me.role = 'admin'
            or exists (select 1 from public.br_teacher_classes tc
                        where tc.church_member_id = me.id and tc.class_id = p_class_id) )
  );

$$;

-- =============================================================================
-- 5) RLS 활성화
-- =============================================================================
alter table public.br_churches        enable row level security;
alter table public.br_church_members  enable row level security;
alter table public.br_teacher_classes enable row level security;
alter table public.br_classes         enable row level security;
alter table public.br_students        enable row level security;
alter table public.br_reading_logs    enable row level security;

-- =============================================================================
-- 6) 컬럼/테이블 권한
--   ★ v2: anon 은 reading_logs 에 직접 insert/update 불가. RPC 로만 기록.
-- =============================================================================
revoke all on public.br_churches from anon, authenticated;
grant select (id, name)                                       on public.br_churches to anon;
grant select                                                  on public.br_churches to authenticated;
grant update (name, consent_confirmed, consent_confirmed_at,
              consent_version, consent_items, consent_admin_name)
  on public.br_churches to authenticated;

revoke all on public.br_church_members from anon, authenticated;
grant select, insert, update, delete on public.br_church_members to authenticated;

revoke all on public.br_teacher_classes from anon, authenticated;
grant select, insert, update, delete on public.br_teacher_classes to authenticated;

revoke all on public.br_classes from anon, authenticated;
grant select, insert, update, delete on public.br_classes to authenticated;

revoke all on public.br_students from anon, authenticated;
-- pin_hash 는 select/insert/update grant 에서 빠진다(노출/조작 방지).
-- guardian_consent_at 은 select 만, insert/update 는 트리거가 통제.
grant select (id, church_id, class_id, name, guardian_consent, guardian_consent_at, created_at)
  on public.br_students to authenticated;
grant insert (church_id, class_id, name, guardian_consent)
  on public.br_students to authenticated;
grant update (name, class_id, guardian_consent)
  on public.br_students to authenticated;
grant delete
  on public.br_students to authenticated;

revoke all on public.br_reading_logs from anon, authenticated;
-- anon 직접 쓰기 권한 없음(RPC 전용). 교사/관리자는 직접 조회/관리 가능.
grant select               on public.br_reading_logs to authenticated;
grant insert, update, delete on public.br_reading_logs to authenticated;

-- =============================================================================
-- 7) RLS 정책
-- =============================================================================

-- 7-1) br_churches
drop policy if exists br_churches_anon_select on public.br_churches;
create policy br_churches_anon_select on public.br_churches for select to anon using (true);

drop policy if exists br_churches_member_select on public.br_churches;
create policy br_churches_member_select on public.br_churches for select to authenticated
  using (id = public.br_current_church_id());

drop policy if exists br_churches_admin_update on public.br_churches;
create policy br_churches_admin_update on public.br_churches for update to authenticated
  using      (id = public.br_current_church_id() and public.br_current_role() = 'admin')
  with check (id = public.br_current_church_id() and public.br_current_role() = 'admin');

-- 7-2) br_church_members
drop policy if exists br_church_members_same_church_select on public.br_church_members;
create policy br_church_members_same_church_select on public.br_church_members for select to authenticated
  using (church_id = public.br_current_church_id());

drop policy if exists br_church_members_admin_write on public.br_church_members;
create policy br_church_members_admin_write on public.br_church_members for all to authenticated
  using      (church_id = public.br_current_church_id() and public.br_current_role() = 'admin')
  with check (church_id = public.br_current_church_id() and public.br_current_role() = 'admin');

-- 7-3) br_teacher_classes
drop policy if exists br_teacher_classes_same_church_select on public.br_teacher_classes;
create policy br_teacher_classes_same_church_select on public.br_teacher_classes for select to authenticated
  using (exists (select 1 from public.br_church_members m
                  where m.id = church_member_id and m.church_id = public.br_current_church_id()));

drop policy if exists br_teacher_classes_admin_write on public.br_teacher_classes;
create policy br_teacher_classes_admin_write on public.br_teacher_classes for all to authenticated
  using (public.br_current_role() = 'admin'
         and exists (select 1 from public.br_church_members m
                      where m.id = church_member_id and m.church_id = public.br_current_church_id()))
  with check (public.br_current_role() = 'admin'
         and exists (select 1 from public.br_church_members m
                      where m.id = church_member_id and m.church_id = public.br_current_church_id())
         and exists (select 1 from public.br_classes c
                      where c.id = class_id and c.church_id = public.br_current_church_id()));

-- 7-4) br_classes
drop policy if exists br_classes_select on public.br_classes;
create policy br_classes_select on public.br_classes for select to authenticated
  using (church_id = public.br_current_church_id()
         and (public.br_current_role() = 'admin' or public.br_can_access_class(id)));

drop policy if exists br_classes_admin_write on public.br_classes;
create policy br_classes_admin_write on public.br_classes for all to authenticated
  using      (church_id = public.br_current_church_id() and public.br_current_role() = 'admin')
  with check (church_id = public.br_current_church_id() and public.br_current_role() = 'admin');

-- 7-5) br_students
drop policy if exists br_students_select on public.br_students;
create policy br_students_select on public.br_students for select to authenticated
  using (church_id = public.br_current_church_id()
         and (public.br_current_role() = 'admin' or public.br_can_access_class(class_id)));

drop policy if exists br_students_write on public.br_students;
create policy br_students_write on public.br_students for all to authenticated
  using (church_id = public.br_current_church_id()
         and (public.br_current_role() = 'admin' or public.br_can_access_class(class_id)))
  with check (church_id = public.br_current_church_id()
         and (public.br_current_role() = 'admin' or public.br_can_access_class(class_id)));

-- 7-6) br_reading_logs (교사/관리자만 직접 접근. 학생은 RPC 경유)
drop policy if exists br_reading_logs_select on public.br_reading_logs;
create policy br_reading_logs_select on public.br_reading_logs for select to authenticated
  using (church_id = public.br_current_church_id()
         and (public.br_current_role() = 'admin' or public.br_can_access_class(class_id)));

drop policy if exists br_reading_logs_write on public.br_reading_logs;
create policy br_reading_logs_write on public.br_reading_logs for all to authenticated
  using (church_id = public.br_current_church_id()
         and (public.br_current_role() = 'admin' or public.br_can_access_class(class_id)))
  with check (church_id = public.br_current_church_id()
         and (public.br_current_role() = 'admin' or public.br_can_access_class(class_id)));

-- =============================================================================
-- 8) 학생 PIN RPC
-- =============================================================================
create or replace function public.br_student_has_pin(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.br_students where id = p_student_id and pin_hash is not null);

$$;

create or replace function public.br_set_student_pin(p_student_id uuid, p_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare existing text;
begin
  if p_pin is null or p_pin !~ '^\d{4}$' then return false; end if;
  select pin_hash into existing from public.br_students where id = p_student_id;
  if existing is not null then return false; end if;
  update public.br_students set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_student_id;
  return true;
end;

$$;

create or replace function public.br_verify_student(p_student_id uuid, p_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare stored text;
begin
  if p_pin is null then return false; end if;
  select pin_hash into stored from public.br_students where id = p_student_id;
  if stored is null then return false; end if;
  return stored = crypt(p_pin, stored);
end;

$$;

-- =============================================================================
-- 9) 학생 로그인 화면용 RPC (anon, church 범위 제한)
-- =============================================================================
create or replace function public.br_list_classes(p_church_id uuid)
returns table (id uuid, name text, member_label text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.member_label from public.br_classes c
   where c.church_id = p_church_id order by c.name;

$$;

-- v2.2: 다른 교회의 class_id 만 알면 학생 이름이 노출되던 보안 구멍을 막기 위해
--       반드시 p_church_id 도 함께 받고, p_class_id 가 그 교회 소속인지 검증한 뒤에만
--       학생 목록을 반환한다. 불일치 시 빈 결과(0 rows) 반환 (에러 throw 아님).
--       반환 컬럼은 기존과 동일: id, name, has_pin. pin_hash 는 절대 노출하지 않는다.
create or replace function public.br_list_students(
  p_church_id uuid,
  p_class_id  uuid
)
returns table (id uuid, name text, has_pin boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, (s.pin_hash is not null) as has_pin
    from public.br_students s
    where s.class_id = p_class_id
      and s.church_id = p_church_id
      -- 반의 church_id 가 호출자가 보낸 church_id 와 일치할 때만 결과 노출.
      and exists (
        select 1 from public.br_classes c
        where c.id = p_class_id
          and c.church_id = p_church_id
      )
    order by s.name;

$$;

-- =============================================================================
-- 10) ★ v2 핵심: 학생 진도 기록 RPC (PIN 검증 필수, 위변조 차단)
--   anon 은 이 함수로만 진도를 기록할 수 있다. PIN 이 틀리면 거부.
-- =============================================================================
create or replace function public.br_complete_chapter(
  p_student_id  uuid,
  p_pin         text,
  p_book        text,
  p_chapter     integer,
  p_translation text
) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_class uuid; v_church uuid; v_ok boolean;
begin
  -- PIN 검증
  v_ok := public.br_verify_student(p_student_id, p_pin);
  if not v_ok then return false; end if;

  -- 입력값 검증
  if p_book not in ('proverbs','matthew','mark','luke','john') then return false; end if;
  if p_translation not in ('krv','kids') then return false; end if;
  if p_chapter is null or p_chapter < 1 then return false; end if;

  select class_id, church_id into v_class, v_church
    from public.br_students where id = p_student_id;
  if v_class is null then return false; end if;

  insert into public.br_reading_logs (church_id, class_id, student_id, book, chapter, translation)
    values (v_church, v_class, p_student_id, p_book, p_chapter, p_translation)
  on conflict (student_id, book, chapter)
    do update set completed_at = now(), translation = excluded.translation;

  return true;
end;

$$;

-- =============================================================================
-- 11) 셀프가입 RPC (v2.5)
--   항목별 동의(jsonb) + 약관 버전 + 서명자 이름을 받아 증빙으로 br_churches 에 저장.
--   필수 항목 5개가 모두 true 가 아니면 가입 거부.
--   필수 키:
--     controller_acknowledged  : 우리 교회가 컨트롤러이며 동의 수집 책임 있음
--     minor_consent            : 만 14세 미만 시 법정대리인 동의 우리가 받음
--     purpose_limited          : 이름은 목적(성경 진도) 외 사용 안 함
--     privacy_reviewed         : 개인정보처리방침 확인함
--     dpa_agreed               : 데이터 처리 위탁 계약(DPA) 동의함 (v2.5 추가)
--   ❓ 검토 메모: DPA 항목 추가로 약관이 실질 변경됐다. 정식 출시 시점에는
--      consent_version 도 새 날짜로 올리는 게 맞다. signup/page.tsx 의 동일
--      코멘트와 일치시킬 것.
-- =============================================================================
create or replace function public.br_signup_church(
  p_church_name        text,
  p_admin_name         text,
  p_consent_items      jsonb,
  p_consent_version    text,
  p_consent_admin_name text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_church_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_church_name is null or btrim(p_church_name) = '' then
    raise exception 'church name required';
  end if;
  if p_admin_name  is null or btrim(p_admin_name)  = '' then
    raise exception 'admin name required';
  end if;
  if p_consent_version is null or btrim(p_consent_version) = '' then
    raise exception 'consent version required';
  end if;
  if p_consent_admin_name is null or btrim(p_consent_admin_name) = '' then
    raise exception 'consent admin name required';
  end if;
  if p_consent_items is null then
    raise exception 'consent items required';
  end if;

  -- 필수 동의 항목 5개가 모두 true 여야 함 (v2.5: dpa_agreed 추가).
  if not (
        coalesce((p_consent_items->>'controller_acknowledged')::boolean, false)
    and coalesce((p_consent_items->>'minor_consent')::boolean,           false)
    and coalesce((p_consent_items->>'purpose_limited')::boolean,         false)
    and coalesce((p_consent_items->>'privacy_reviewed')::boolean,        false)
    and coalesce((p_consent_items->>'dpa_agreed')::boolean,              false)
  ) then
    raise exception '필수 동의 항목 5개를 모두 체크해야 가입할 수 있습니다.';
  end if;

  if exists (select 1 from public.br_church_members where user_id = v_uid) then
    raise exception 'this user already belongs to a church';
  end if;

  insert into public.br_churches (
    name, consent_confirmed, consent_confirmed_at,
    consent_version, consent_items, consent_admin_name
  ) values (
    btrim(p_church_name), true, now(),
    btrim(p_consent_version), p_consent_items, btrim(p_consent_admin_name)
  ) returning id into v_church_id;

  insert into public.br_church_members (church_id, user_id, role, name)
    values (v_church_id, v_uid, 'admin', btrim(p_admin_name));

  return v_church_id;
end;

$$;

-- =============================================================================
-- 12) 화면 보조 RPC (v2.1 추가)
--   (A) br_list_student_chapters: 학생 본인이 읽은 장 목록 (PIN 검증)
--   (B) br_admin_add_teacher    : 관리자가 이메일로 교사 연결
--   (C) br_admin_reset_student_pin: 관리자가 학생 PIN 초기화 (잊은 경우)
--   세 함수 모두 security definer + 호출자 권한/같은 교회 여부 내부 검증.
-- =============================================================================

-- (A) 학생 본인 진도 조회 - anon 은 br_reading_logs 권한이 없으므로 RPC 로만.
--     PIN 검증 후 본인 진도만 반환. PIN 틀리면 빈 결과.
create or replace function public.br_list_student_chapters(
  p_student_id uuid,
  p_pin        text,
  p_book       text
) returns table (chapter integer, translation text, completed_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if p_book is null
     or p_book not in ('proverbs','matthew','mark','luke','john') then
    return;
  end if;
  if not public.br_verify_student(p_student_id, p_pin) then
    return;
  end if;
  return query
    select l.chapter, l.translation, l.completed_at
      from public.br_reading_logs l
      where l.student_id = p_student_id and l.book = p_book
      order by l.chapter;
end;

$$;

-- (B) 관리자가 이메일로 교사를 자기 교회에 연결.
--     사전 조건: 교사 본인이 /teacher-signup 으로 auth.users 행을 먼저 만들어 둠.
create or replace function public.br_admin_add_teacher(
  p_email text,
  p_name  text
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_church  uuid := public.br_current_church_id();
  v_role    text := public.br_current_role();
  v_uid     uuid;
  v_new_id  uuid;
begin
  if v_church is null then raise exception 'not in a church'; end if;
  if v_role   <> 'admin' then raise exception 'admin only'; end if;
  if p_email is null or btrim(p_email) = '' then raise exception 'email required'; end if;
  if p_name  is null or btrim(p_name)  = '' then raise exception 'name required';  end if;

  select id into v_uid
    from auth.users
    where lower(email) = lower(btrim(p_email))
    limit 1;

  if v_uid is null then
    raise exception '해당 이메일로 가입된 사용자가 없습니다. 먼저 /teacher-signup 에서 가입을 부탁해 주세요.';
  end if;

  if exists (select 1 from public.br_church_members where user_id = v_uid) then
    raise exception '이미 교회에 소속된 사용자입니다.';
  end if;

  insert into public.br_church_members (church_id, user_id, role, name)
    values (v_church, v_uid, 'teacher', btrim(p_name))
    returning id into v_new_id;
  return v_new_id;
end;

$$;

-- (C) 관리자가 자기 교회 학생의 PIN 을 초기화 (pin_hash := null).
--     pin_hash 컬럼은 authenticated 의 update grant 에 빠져 있으므로 RPC 필수.
create or replace function public.br_admin_reset_student_pin(p_student_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_church uuid := public.br_current_church_id();
  v_role   text := public.br_current_role();
begin
  if v_church is null then raise exception 'not in a church'; end if;
  if v_role   <> 'admin' then raise exception 'admin only'; end if;
  update public.br_students
     set pin_hash = null
   where id = p_student_id
     and church_id = v_church;
  return found;
end;

$$;

-- =============================================================================
-- 13) 함수 실행 권한
-- =============================================================================
grant execute on function public.br_student_has_pin(uuid)                                to anon, authenticated;
grant execute on function public.br_set_student_pin(uuid, text)                          to anon, authenticated;
grant execute on function public.br_verify_student(uuid, text)                           to anon, authenticated;
grant execute on function public.br_list_classes(uuid)                                   to anon, authenticated;
grant execute on function public.br_list_students(uuid, uuid)                            to anon, authenticated;
grant execute on function public.br_complete_chapter(uuid, text, text, integer, text)    to anon, authenticated;
grant execute on function public.br_list_student_chapters(uuid, text, text)              to anon, authenticated;
grant execute on function public.br_signup_church(text, text, jsonb, text, text)         to authenticated;
grant execute on function public.br_admin_add_teacher(text, text)                        to authenticated;
grant execute on function public.br_admin_reset_student_pin(uuid)                        to authenticated;
