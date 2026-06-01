# 성경 읽기 프로젝트 (Bible Reading App)

하루 한 장씩 성경(잠언·마태·마가·누가·요한)을 읽고 학생별 진도를 기록하는 Next.js + Supabase 웹앱입니다.

- 학생용: `/` (= `/bible-reading` 으로 redirect)
- 담임 선생님용: `/teacher`

## 빠른 시작

```bash
# 1) 의존성 설치
npm install

# 2) 새 Supabase 프로젝트 만들기 (https://supabase.com → New project)
#    Region 은 Northeast Asia (Seoul) 추천.

# 3) Supabase 대시보드 → SQL Editor → New query 에
#    supabase/schema.sql 의 전체 내용을 붙여넣고 Run.
#    (이 한 번에 br_classes, br_students, br_reading_logs, br_teachers 가 모두 생성됨)

# 4) Supabase 대시보드 → Settings → API 에서 Project URL 과 anon public key 를 복사해서
#    .env.local 에 채워 넣기:
#      NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
#      NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...

# 5) 개발 서버
npm run dev
# → http://localhost:3000
```

상세 셋업 (반/학생/선생님 등록, RLS, 자주 묻는 질문)은 [`BIBLE_READING_SETUP.md`](./BIBLE_READING_SETUP.md) 를 참고하세요.

## 디렉터리

```
bible-reading-app/
├── app/
│   ├── layout.tsx              # 루트 layout (lang=ko, Noto Sans KR + Pretendard)
│   ├── globals.css             # 최소 CSS 리셋
│   ├── page.tsx                # / → /bible-reading 으로 redirect
│   ├── bible-reading/          # 학생용 페이지 (메인 기능)
│   │   ├── page.tsx
│   │   ├── books.ts
│   │   ├── components/StudentIdentityBar.tsx
│   │   ├── proverbs.json / matthew.json / mark.json / luke.json / john.json
│   │   └── prayers.json
│   ├── teacher/page.tsx        # 담임 선생님 대시보드 (실시간 진도 모니터링)
│   └── lib/
│       ├── supabaseClient.ts
│       └── bibleReadingProgress.ts
├── public/
│   ├── logo.svg                # 헤더 로고 placeholder (교체 가능)
│   ├── manifest.json           # PWA manifest
│   ├── sw.js                   # PWA service worker (자동 등록 X, 필요 시 register)
│   └── icons/                  # PWA 아이콘 placeholder (SVG) — PNG 로 교체 권장
├── supabase/
│   └── schema.sql              # DB 스키마 + RPC + RLS + br_teachers
├── BIBLE_READING_SETUP.md      # 상세 셋업 가이드
└── .env.local                  # Supabase URL/anon key (gitignore 됨)
```

## 교체 권장 항목

| 항목 | 위치 | 비고 |
|---|---|---|
| 헤더 로고 | `public/logo.svg` | placeholder SVG. 원하는 이미지로 교체 (`<img src="/logo.svg">` 그대로 사용 가능) |
| PWA 아이콘 | `public/icons/*.svg` | iOS 호환성을 위해 PNG(192/512/180) 로 교체 권장 |
| 메타데이터 | `app/layout.tsx` | title / description / appleWebApp.title 등 조직명에 맞게 |
| 헤더 문구 | `app/bible-reading/page.tsx` (hero eyebrow 등) | 조직명/안내 문구는 그대로 둔 채 옮겼습니다. 필요 시 직접 수정 |

## 사용 기술

- Next.js 14 (App Router)
- React 18
- TypeScript 5
- Supabase (Database, Auth, Realtime, Storage)
- 스타일: `<style jsx>` 인라인 (Tailwind 미사용)
