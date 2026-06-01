-- =============================================================================
-- v2.5 migration: br_signup_church 검증 항목에 dpa_agreed 추가.
-- 사용 방법:
--   Supabase 대시보드 → SQL Editor → 새 쿼리에 이 파일 전체 붙여넣고 Run.
--   schema.sql 을 통째로 다시 Run 하지 않아도 됩니다(데이터 보존됨).
--
-- 적용 대상:
--   - public.br_signup_church(text, text, jsonb, text, text) 함수 본문 교체
--   - 시그니처가 동일하므로 drop function 필요 없음. create or replace 로 안전.
--   - 컬럼/테이블 변경 없음.
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

  -- v2.5: dpa_agreed 추가.
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

-- 권한은 시그니처 동일이라 별도 재부여 불필요. 만약을 위해 명시:
grant execute on function public.br_signup_church(text, text, jsonb, text, text) to authenticated;
