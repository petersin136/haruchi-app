# 성경읽기 진도 서버 저장 — Supabase 셋업 가이드

`/bible-reading` 페이지의 학생별 진도 저장(서버 동기화) 기능을 켜려면 아래 절차를 따라 주세요. **5분이면 끝납니다.**

미설정 상태라면 페이지는 그대로 작동하지만 진도가 브라우저 `localStorage` 에만 저장되고, 페이지에는 "서버 미설정 — 이 기기에만 저장됩니다" 안내가 뜹니다.

---

## 1. Supabase 프로젝트 만들기 (이미 있으면 건너뛰기)

1. [supabase.com](https://supabase.com) 접속 → **Start your project** 로 가입/로그인
2. **New project** 클릭 → 이름 자유롭게 (예: `pbcs-school`), 리전은 `Northeast Asia (Seoul)` 추천
3. Database password 메모 (이번 셋업에 직접 쓰진 않지만 추후 관리자 도구에서 필요)
4. 프로젝트가 프로비저닝될 때까지 1~2분 대기

## 2. 데이터베이스 스키마 설치

1. Supabase 대시보드 좌측 메뉴 → **SQL Editor**
2. **New query** 버튼 클릭
3. 이 저장소의 [`supabase/schema.sql`](./supabase/schema.sql) 파일 전체 내용을 복사해서 SQL Editor에 붙여넣기
4. 우측 하단 **Run** (또는 ⌘+Enter) 실행
5. `Success. No rows returned` 가 뜨면 OK

이 한 번의 실행으로 다음이 만들어집니다.

| 종류 | 이름 | 역할 |
|---|---|---|
| 테이블 | `br_classes` | 반(1학년, 2학년 …) |
| 테이블 | `br_students` | 학생(이름 + bcrypt 해시 PIN) |
| 테이블 | `br_reading_logs` | 학생별·장별 읽기 완료 기록 |
| RPC 함수 | `br_student_has_pin(p_student_id)` | 이 학생이 PIN을 설정했는지 |
| RPC 함수 | `br_set_student_pin(p_student_id, p_pin)` | 처음 1회 PIN 설정 |
| RPC 함수 | `br_verify_student(p_student_id, p_pin)` | PIN 검증 (로그인) |

PIN(비밀번호 4자리)은 **bcrypt 해시**로 저장되며 클라이언트에는 절대 노출되지 않습니다.

## 3. URL / anon key 가져오기

1. Supabase 대시보드 좌측 메뉴 → **Settings** → **API**
2. **Project URL** (`https://xxxxx.supabase.co`) 복사
3. **Project API keys** 섹션의 **anon public** 키 복사 (절대 `service_role` 키는 클라이언트에 쓰지 마세요)

## 4. `.env.local` 만들기

저장소 루트(`package.json` 있는 폴더)에 `.env.local` 파일을 만들고 다음을 입력합니다.

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...붙여넣은_anon_key
```

> `.env.local` 은 `.gitignore` 에 이미 포함되어 있어 git 에 올라가지 않습니다.

## 5. 개발 서버 재시작

환경변수는 빌드 시점에 주입되므로, Next.js dev 서버를 한 번 끄고 다시 켜야 반영됩니다.

```bash
# Ctrl+C 로 dev 서버 종료 후
npm run dev
```

`/bible-reading` 페이지를 새로고침하면 안내 문구가
- "내 이름으로 들어가면 선생님이 진도를 볼 수 있어요"
로 바뀌고, 우측에 **"내 이름으로 시작"** 버튼이 보입니다.

## 6. 반/학생 데이터 채우기

스키마는 만들었지만 처음에는 반과 학생이 비어 있습니다. 두 가지 방법 중 하나를 선택하세요.

### A. SQL Editor 에서 직접 입력 (가장 빠름)

```sql
-- 반 만들기
insert into public.br_classes (name) values
  ('1학년'), ('2학년'), ('3학년'),
  ('4학년'), ('5학년'), ('6학년')
on conflict do nothing;

-- 1학년 학생 일괄 추가 예시
insert into public.br_students (class_id, name)
select c.id, n
from public.br_classes c,
     unnest(array['홍길동','김철수','이영희','박민수']) as n
where c.name = '1학년';
```

### B. Table Editor 에서 GUI 로 입력

1. 좌측 메뉴 → **Table Editor**
2. `br_classes` 선택 → `Insert row` 로 반 이름 입력
3. `br_students` 선택 → `Insert row` 로 학생 추가 (class_id 는 위에서 만든 반의 id 를 골라 연결)

## 7. 동작 확인

1. `/bible-reading` 페이지 새로고침
2. **"내 이름으로 시작"** 클릭 → 반 → 이름 → PIN 4자리 설정
3. 한 장을 읽고 완료 처리
4. Supabase 대시보드 → **Table Editor** → `br_reading_logs` 에 행이 추가되었는지 확인

---

## 자주 묻는 질문

**Q. PIN을 잊어버린 학생이 있어요.**
A. 선생님이 SQL Editor 에서 해당 학생의 `pin_hash` 를 `null` 로 비우면 다음 로그인 시 PIN 재설정 화면이 뜹니다.
```sql
update public.br_students set pin_hash = null where name = '홍길동';
```

**Q. 학생이 다른 학생 이름으로 진도를 조작할 수 있지 않나요?**
A. PIN 검증은 서버 측 `security definer` RPC 에서만 일어나고, 학생 행의 `pin_hash` 컬럼은 anon 권한으로는 읽을 수 없습니다(`grant select (id, class_id, name)` 으로 컬럼 제한). 즉, 다른 학생의 PIN 을 알아낼 수 없습니다. 단, 진도 자체(`br_reading_logs`)의 INSERT 는 정책상 누구나 가능하므로, 필요시 RPC 한 단계를 더 끼워 student_id 위조를 막을 수 있습니다(현재는 아동 앱 단순화 기조).

**Q. Vercel 배포 환경에는 어떻게 적용하나요?**
A. Vercel 프로젝트 Settings → **Environment Variables** 에 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` 두 값을 그대로 추가한 뒤 재배포하면 됩니다.

**Q. 이 기능을 끄고 싶어요.**
A. `.env.local` 의 두 값을 비우거나 파일을 지우면 자동으로 "서버 미설정" 모드로 돌아갑니다.
