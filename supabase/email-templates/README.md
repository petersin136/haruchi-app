# 하루치 — Supabase 이메일 템플릿 (한국어 + 브랜딩)

Supabase 가 보내는 인증/재설정 메일을 영어 "Supabase Auth" 가 아닌
**한국어 + 하루치 브랜드**로 바꾸는 가이드입니다.

두 단계로 나뉩니다:

1. **이메일 본문/제목 한국어화** — Supabase Dashboard 에서 5분이면 적용.
   _발신자 이름은 여전히 `Supabase Auth` 로 보일 수 있음 (기본 SMTP 한계)._
2. **발신자 이름 "하루치" 로 변경** — 커스텀 SMTP(Resend 권장) 연결.

본문만 한국어로 바꿔도 사용자가 알아보기 훨씬 쉬워지니, 1번부터 먼저 적용하는 걸 추천합니다.

---

## 1. 메일 본문/제목 한국어화 (필수)

### 적용 위치

[Supabase Dashboard](https://supabase.com/dashboard) → 프로젝트 선택 →
**Authentication** → **Email Templates**

총 5개 템플릿을 우리가 폴더에 만들어 뒀습니다. 각 파일의 내용을
**그대로 복사**해 Dashboard 의 해당 템플릿 칸에 붙여넣고 저장하면 됩니다.

| Supabase 템플릿 이름           | 우리 파일                                  | 추천 Subject (제목)            |
| ------------------------------ | ------------------------------------------ | ------------------------------ |
| `Confirm signup`               | [`confirm-signup.html`](./confirm-signup.html) | `[하루치] 이메일 인증을 마쳐 주세요` |
| `Reset password`               | [`recovery.html`](./recovery.html)         | `[하루치] 비밀번호 재설정 안내`     |
| `Magic Link`                   | [`magic-link.html`](./magic-link.html)     | `[하루치] 로그인 링크가 도착했어요` |
| `Change Email Address`         | [`change-email.html`](./change-email.html) | `[하루치] 이메일 변경 확인`         |
| `Reauthentication`             | [`reauthentication.html`](./reauthentication.html) | `[하루치] 본인 확인 인증 코드`   |

> 💡 우리 앱이 실제로 사용하는 건 **Confirm signup** 과 **Reset password**
> 두 개뿐입니다. 나머지 3개는 Supabase 가 다른 흐름으로 트리거할 수도
> 있으니 함께 한국어화 해두는 게 안전합니다.

### 사용 가능한 템플릿 변수 (Supabase 표준)

| 변수                  | 의미                                                |
| --------------------- | --------------------------------------------------- |
| `{{ .ConfirmationURL }}` | 사용자가 눌러야 하는 확인 링크 (가장 자주 씀)        |
| `{{ .Token }}`        | 6자리 OTP 코드 (Reauthentication 템플릿에서 사용)    |
| `{{ .TokenHash }}`    | 해시된 토큰                                          |
| `{{ .Email }}`        | 받는 사람 이메일                                     |
| `{{ .SiteURL }}`      | Project Settings 의 Site URL                         |
| `{{ .RedirectTo }}`   | 클라이언트가 지정한 redirect_to                      |

본문 안의 `{{ .ConfirmationURL }}` 자리에 Supabase 가 실제 링크를 자동으로
끼워 넣어줍니다. **변수 표기는 절대로 바꾸지 마세요.**

### 적용 순서 (스크린샷 없이도 따라 하기)

1. Supabase Dashboard → Authentication → Email Templates.
2. 왼쪽 사이드에서 **Confirm signup** 클릭.
3. **Subject** 칸: `[하루치] 이메일 인증을 마쳐 주세요` 입력.
4. **Body** 칸: 본 폴더의 `confirm-signup.html` 파일 내용을 통째로 복사 →
   기존 내용을 지우고 붙여넣기 → **Save**.
5. **Reset password**, **Magic Link**, **Change Email Address**,
   **Reauthentication** 도 동일하게 반복.
6. 본 폴더의 `/forgot-password` 페이지에서 한 번 테스트 → 한국어 메일이
   오는지 확인.

### Redirect URL 화이트리스트 (필수)

`{{ .ConfirmationURL }}` 가 우리 사이트의 페이지로 돌아오려면 Supabase
Dashboard 의 화이트리스트에 미리 등록돼 있어야 합니다.

Dashboard → Authentication → **URL Configuration** → **Redirect URLs** 에
다음을 추가해 주세요 (배포 도메인 기준):

```
https://<배포-도메인>/reset-password
https://<배포-도메인>/signup
https://<배포-도메인>/login
```

`Site URL` 도 배포 도메인(`https://<배포-도메인>`) 으로 맞춰 두면 메일의
링크가 정상적으로 만들어집니다.

---

## 2. 발신자 이름을 "하루치" 로 (선택 — 권장)

Supabase 의 **기본 내장 SMTP** 를 그대로 쓰면, 받은 사람 메일함에서
발신자가 `Supabase Auth <noreply@mail.app.supabase.io>` 처럼 보입니다.
"우리 이름으로 가게 해줘" 요청을 처리하려면, 사용자가 직접 보내는 SMTP
서버를 연결해야 합니다.

선택지가 두 가지입니다.

### 2-A. Gmail SMTP — 도메인 없이 즉시 시작 (출시 초기 추천)

본인 Gmail 계정 하나만 있으면 5분 안에 끝납니다. 일일 500통 한도이지만
초기 운영(교회 50개 미만 수준)에는 충분합니다.

1. **Google 앱 비밀번호 만들기**

   - https://myaccount.google.com/security → "2단계 인증"이 꺼져 있으면
     먼저 켜기 (앱 비밀번호 발급 조건).
   - https://myaccount.google.com/apppasswords → 앱 이름을
     `하루치 Supabase` 등으로 만든 뒤 **만들기**.
   - 화면에 표시되는 **16자리 비밀번호**(예: `abcd efgh ijkl mnop`) 를
     복사해 둠. _이 화면을 닫으면 다시 볼 수 없으니 한 번에 메모장에 저장._

2. **Supabase Dashboard → Project Settings → Auth → SMTP Settings 에서
   Custom SMTP 토글 ON 후 입력**

   | 항목                      | 값                                                |
   | ------------------------- | ------------------------------------------------- |
   | Sender email address      | 본인 Gmail 주소 (예: `you@gmail.com`)              |
   | Sender name               | `하루치`                                           |
   | Host                      | `smtp.gmail.com`                                   |
   | Port number               | `465`                                              |
   | Minimum interval per user | `60`                                               |
   | Username                  | 본인 Gmail 주소 (Sender email 과 동일)              |
   | Password                  | 위 1단계에서 만든 **16자리 앱 비밀번호**            |

3. **Save changes** → `/forgot-password` 로 본인 Gmail 에 한 번 보내 봄.
   받은 메일의 발신자가 `하루치 <you@gmail.com>` 으로 보이면 성공.

   - 가끔 "보낸 사람: `you@gmail.com via xxxx.supabase.co`" 로 표시되는데
     Gmail 의 정상 동작이라 신경 안 써도 됨.
   - 스팸함 들어가면 "스팸 아님" 한 번 표시해 주면 다음부터 정상함.

> 💡 단체 수가 늘어나거나 더 프로페셔널해 보이고 싶을 때 아래 Resend
> 옵션으로 옮기시면 됩니다.

### 2-B. Resend + 본인 도메인 — 정식 운영용

본인 소유 도메인(예: `haruchi.app`) 이 있다면 가장 깔끔한 선택입니다.
무료 한도가 하루 100통이라 Gmail 보다 더 여유롭게 늘리기도 좋습니다.

#### Resend 로 셋업하는 5단계

1. **Resend 가입** → Dashboard → **Domains** → **Add Domain** 으로
   본인이 소유한 도메인(예: `haruchi.app`) 추가.
2. Resend 가 요구하는 **SPF / DKIM / DMARC DNS 레코드**를 도메인 등록
   업체(Cloudflare 등) 에서 추가 → Resend 화면이 "Verified" 로 바뀔 때까지
   대기 (보통 몇 분).
3. Resend Dashboard → **API Keys** → 새 키 발급 → 값 복사.
4. Supabase Dashboard → **Project Settings** → **Auth** → **SMTP Settings**
   → `Enable Custom SMTP` 토글 ON 후 다음과 같이 입력:

   | 항목                | 값                                                              |
   | ------------------- | --------------------------------------------------------------- |
   | Sender email        | `noreply@haruchi.app` (본인 도메인의 임의 주소)                 |
   | Sender name         | `하루치`                                                        |
   | Host                | `smtp.resend.com`                                               |
   | Port                | `465`                                                            |
   | Username            | `resend`                                                         |
   | Password            | (3단계에서 받은 API Key 전체)                                    |
   | Minimum interval    | `60` (초당 발송 제한 — 기본값 유지)                              |

5. **Save** → 우측 상단의 **Send test email** 로 본인 메일에 한 번
   보내본 뒤 정상 도착 확인 → 끝.

이후 보내지는 모든 인증/재설정 메일은:

- 발신자: **하루치 \<noreply@haruchi.app\>**
- 본문/제목: 우리가 등록한 한국어 템플릿

으로 도착합니다.

> ⚠️ 도메인이 아직 없으면 Resend 의 기본 `onboarding@resend.dev` 주소로도
> 임시 발송이 됩니다. 다만 발신자 이름이 "하루치" 로 보이긴 하지만 메일
> 주소가 `@resend.dev` 라 스팸 판정될 가능성이 높습니다. 정식 운영
> 시에는 반드시 본인 도메인을 인증해 두세요.

---

## 확인 체크리스트

- [ ] Confirm signup / Reset password 템플릿이 한국어로 보임
- [ ] Subject 가 `[하루치] …` 로 시작
- [ ] Redirect URLs 에 `/reset-password`, `/signup`, `/login` 등록됨
- [ ] (선택) 커스텀 SMTP 적용 → 발신자 이름이 "하루치" 로 표시
- [ ] 본인 이메일로 실제 회원가입 / 비밀번호 재설정 한 번씩 테스트해 봄

체크리스트를 모두 통과하면 모바일에서도 사용자가 의심 없이 메일을
열고 인증을 마칠 수 있습니다.
