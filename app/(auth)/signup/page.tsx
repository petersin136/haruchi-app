"use client";

// =============================================================================
// 새 교회/단체 만들기 — /signup
// -----------------------------------------------------------------------------
// v3.2 (2026-06-04): 두 단계로 나눠 두었던 폼을 한 화면으로 합쳤다.
//   - 사용자가 step 1 에서 이메일/비번만 보이는 바람에 "단체 이름은 어디서
//     적나" 하고 혼란을 겪는 사례가 있었다.
//   - 또 "교회" 단어가 미니스트리/청년부/단체 운영자에게는 좁게 느껴진다는
//     피드백을 받아 라벨을 "교회/단체" 로 통일했다.
//
// 흐름:
//   1. 비로그인 상태에서 들어오면 "collect" 모드. 단체 이름·관리자 이름·
//      이메일·비번·동의를 한 화면에서 다 받는다.
//   2. 제출하면 adultSignUp → adultSignIn → signupChurch 를 순서대로 호출한다.
//   3. signIn 이 "이메일 인증 필요" 로 실패하면 sessionStorage 에 폼 값을
//      잠시 보관하고, 사용자에게 메일 인증을 안내한다. 사용자가 메일 링크를
//      누르고 돌아오면 페이지가 자동으로 그 값을 복원해 signupChurch 를
//      마저 실행한다.
//   4. 이미 로그인되어 있고 멤버십이 없는 사용자가 들어오면 "finalize"
//      모드로, 단체 이름·관리자 이름·동의만 받는다 (이메일/비번 입력은 숨김).
//   5. 멤버십이 있는 사용자는 곧장 /admin 으로 보낸다.
// =============================================================================

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adultSignIn,
  adultSignUp,
  signupChurch,
  useAdultSession,
  type ConsentItems,
} from "../../lib/multitenancy";
import { isSupabaseConfigured } from "../../lib/supabaseClient";

// 약관 버전. 동의 항목 텍스트/구성이 바뀔 때마다 올린다.
//
// ❓ 검토 메모(v2.5): DPA(데이터 처리 위탁 계약) 동의 항목이 추가됐다.
//   엄밀히는 사용자에게 동의를 요구하는 약관이 변경된 셈이라 버전 문자열을
//   '2026-06-XX' 같은 새 날짜로 올리는 것이 정석. 다만 본 서비스는 아직
//   외부 출시 전 초안 단계이고, 가입된 교회가 없거나 적기 때문에 현 시점에서는
//   '2026-06-01' 을 그대로 두고, 정식 출시 직전에 일괄로 버전을 확정한다.
//   → 출시 시점에 이 문자열을 새 날짜로 바꾸고, schema.sql 의 동일 코멘트도 갱신.
const CONSENT_VERSION = "2026-06-01";

// 이메일 인증이 걸려 있어 signIn 이 실패할 때, 인증 후 돌아온 사용자에게
// 폼을 다시 채워 보여주기 위한 임시 저장 키.
const PENDING_KEY = "haruchi:pending-signup";

type ConsentKey = keyof ConsentItems;

const CONSENT_ITEMS: { key: ConsentKey; label: React.ReactNode }[] = [
  {
    key: "controller_acknowledged",
    label: (
      <>
        우리 교회/단체가 이 서비스의 <strong>개인정보 컨트롤러</strong>이며,
        이용자(특히 미성년자)의 개인정보 수집·이용에 대한 동의를 받을 책임이
        우리 교회/단체에 있음을 이해합니다.
      </>
    ),
  },
  {
    key: "minor_consent",
    label: (
      <>
        만 14세 미만 아동이 이용할 경우, 해당 아동의{" "}
        <strong>법정대리인(부모) 동의</strong>를 우리 교회/단체가 직접
        받겠습니다.
      </>
    ),
  },
  {
    key: "purpose_limited",
    label: (
      <>
        수집하는 이용자 이름은 개인정보이며, 본 서비스의 목적
        (<strong>성경 읽기 진도 관리</strong>) 외로 사용하지 않겠습니다.
      </>
    ),
  },
  {
    key: "privacy_reviewed",
    label: (
      <>
        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="sg-inline-link"
        >
          개인정보처리방침
        </a>
        {" "}내용을 확인하였습니다.
      </>
    ),
  },
  {
    key: "dpa_agreed",
    label: (
      <>
        본 교회/단체는{" "}
        <a
          href="/dpa"
          target="_blank"
          rel="noreferrer"
          className="sg-inline-link"
        >
          데이터 처리 위탁 계약(DPA)
        </a>
        {" "}내용에 동의합니다.
      </>
    ),
  },
];

type Mode = "loading" | "collect" | "verify_email" | "finalize" | "submitting";

type PendingSnapshot = {
  orgName: string;
  adminName: string;
  consent: ConsentItems;
  email: string;
};

function emptyConsent(): ConsentItems {
  return {
    controller_acknowledged: false,
    minor_consent: false,
    purpose_limited: false,
    privacy_reviewed: false,
    dpa_agreed: false,
  };
}

function allConsentChecked(c: ConsentItems): boolean {
  return (
    c.controller_acknowledged &&
    c.minor_consent &&
    c.purpose_limited &&
    c.privacy_reviewed &&
    c.dpa_agreed
  );
}

function readPending(): PendingSnapshot | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingSnapshot;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.orgName !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePending(snapshot: PendingSnapshot) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(snapshot));
  } catch {
    // 무시.
  }
}

function clearPending() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // 무시.
  }
}

export default function SignupPage() {
  const router = useRouter();
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const { state, refresh } = useAdultSession();

  const [mode, setMode] = useState<Mode>("loading");
  const [orgName, setOrgName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState<ConsentItems>(emptyConsent);
  const [consentExpanded, setConsentExpanded] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const toggleAllConsent = useCallback(() => {
    setConsent((prev) => {
      const allOn = allConsentChecked(prev);
      const next = !allOn;
      return {
        controller_acknowledged: next,
        minor_consent: next,
        purpose_limited: next,
        privacy_reviewed: next,
        dpa_agreed: next,
      };
    });
  }, []);

  // 세션 상태에 따라 mode 결정 + pending 복원.
  useEffect(() => {
    if (state.status === "loading") return;
    if (state.status === "signed_in") {
      if (state.session.membership) {
        router.replace(
          state.session.membership.role === "admin" ? "/admin" : "/teacher",
        );
        return;
      }
      // 로그인은 됐지만 멤버십 없음 → finalize 모드. pending 이 있으면 복원.
      const pending = readPending();
      if (pending) {
        setOrgName(pending.orgName);
        setAdminName(pending.adminName);
        setConsent(pending.consent);
      }
      setMode("finalize");
      return;
    }
    // signed_out: 새 가입 흐름.
    setMode("collect");
  }, [router, state]);

  // 실제로 단체 생성 RPC 를 호출한다. collect / finalize 양쪽에서 모두 호출 가능.
  const createOrg = useCallback(async () => {
    const consentName = adminName.trim();
    await signupChurch({
      churchName: orgName.trim(),
      adminName: consentName,
      consentItems: consent,
      consentVersion: CONSENT_VERSION,
      consentAdminName: consentName,
    });
    clearPending();
    await refresh();
    router.replace("/admin");
  }, [adminName, consent, orgName, refresh, router]);

  // 메인 제출 (collect 모드): 가입 → 로그인 → 단체 생성.
  const handleSubmitCollect = useCallback(async () => {
    setError(null);
    setInfo(null);
    const trimmedOrg = orgName.trim();
    const trimmedAdmin = adminName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedOrg) {
      setError("교회/단체 이름을 입력해 주세요.");
      return;
    }
    if (!trimmedAdmin) {
      setError("관리자(본인) 이름을 입력해 주세요.");
      return;
    }
    if (!/^.+@.+\..+$/.test(trimmedEmail)) {
      setError("이메일 형식을 확인해 주세요.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상으로 정해주세요.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호 확인이 일치하지 않아요.");
      return;
    }
    if (!allConsentChecked(consent)) {
      setError("5개 동의 항목에 모두 체크해 주세요.");
      return;
    }

    setMode("submitting");
    // 인증 흐름 중간에 끊겨도 복구할 수 있도록 폼 값을 먼저 저장.
    writePending({
      orgName: trimmedOrg,
      adminName: trimmedAdmin,
      consent,
      email: trimmedEmail,
    });

    try {
      await adultSignUp(trimmedEmail, password);
      try {
        await adultSignIn(trimmedEmail, password);
      } catch {
        // 이메일 인증이 켜진 프로젝트는 signUp 직후 signIn 이 실패할 수 있다.
        setInfo(
          "확인 메일을 보냈어요. 받은 메일에서 이메일 인증을 완료하신 뒤 이 페이지로 다시 돌아오시면, 단체 생성이 자동으로 마무리됩니다. 메일이 안 보이면 스팸함도 확인해 주세요.",
        );
        setMode("verify_email");
        return;
      }
      await createOrg();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "가입에 실패했어요.";
      setError(msg);
      setMode("collect");
    }
  }, [
    adminName,
    consent,
    createOrg,
    email,
    orgName,
    password,
    passwordConfirm,
  ]);

  // finalize 모드 제출: 이미 로그인된 상태라 곧장 단체만 만들면 된다.
  const handleSubmitFinalize = useCallback(async () => {
    setError(null);
    setInfo(null);
    if (!orgName.trim()) {
      setError("교회/단체 이름을 입력해 주세요.");
      return;
    }
    if (!adminName.trim()) {
      setError("관리자(본인) 이름을 입력해 주세요.");
      return;
    }
    if (!allConsentChecked(consent)) {
      setError("5개 동의 항목에 모두 체크해 주세요.");
      return;
    }
    setMode("submitting");
    try {
      await createOrg();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "단체 생성에 실패했어요.";
      setError(msg);
      setMode("finalize");
    }
  }, [adminName, consent, createOrg, orgName]);

  // ---------- 화면 ----------
  if (!configured) {
    return (
      <main className="au-page sg-page">
        <div className="au-card sg-card">
          <p className="au-eyebrow">설정 필요</p>
          <h1 className="sg-title">Supabase 연결이 필요해요</h1>
          <p className="au-sub sg-sub">
            <code>.env.local</code> 에 <code>NEXT_PUBLIC_SUPABASE_URL</code>,
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> 를 채워 주세요.
          </p>
        </div>
      </main>
    );
  }

  if (mode === "loading") {
    return (
      <main className="au-page sg-page">
        <div className="au-card sg-card">
          <p className="au-eyebrow">잠시만요</p>
          <h1 className="sg-title">상태를 확인하는 중…</h1>
        </div>
      </main>
    );
  }

  const isFinalize = mode === "finalize" || mode === "submitting";
  const submitting = mode === "submitting";
  const isVerify = mode === "verify_email";

  return (
    <main className="au-page sg-page">
      <div className="au-topbar sg-topbar">
        <Link href="/bible-reading">← 학생 페이지</Link>
        <Link href="/login">이미 계정이 있어요</Link>
      </div>

      <div className="au-card sg-card">
        <p className="au-eyebrow">새 교회/단체 만들기</p>
        <h1 className="sg-title">
          {isFinalize
            ? "단체 생성 마무리하기"
            : "교회/단체 만들기"}
        </h1>
        <p className="sg-sub">
          {isFinalize
            ? "이메일 인증이 완료됐어요. 아래 정보를 확인하고 단체를 생성해 주세요."
            : "교회, 미니스트리, 청년부 등 어떤 단체든 사용하실 수 있어요. 한 화면에서 정보를 입력하면 단체가 만들어지고 바로 관리자 대시보드로 이동합니다."}
        </p>

        {isVerify ? (
          <>
            {info ? <div className="au-info">{info}</div> : null}
            <p className="au-foot">
              메일 인증을 마치셨다면 이 페이지를 한 번 새로고침 해 주세요.
              <br />
              메일이 오지 않으면{" "}
              <Link href="/forgot-password">비밀번호 찾기</Link>로 재전송을
              시도하거나 다른 이메일로 다시 가입해 주세요.
            </p>
          </>
        ) : (
          <>
            <div className="sg-form">
              <label className="au-field sg-field">
                <span>교회/단체 이름</span>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="예: 가나안교회, OO 미니스트리, △△ 청년부"
                  autoComplete="organization"
                  spellCheck={false}
                  maxLength={60}
                />
              </label>
              <label className="au-field sg-field">
                <span>관리자(본인) 이름</span>
                <input
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="예: 김관리자"
                  autoComplete="name"
                  spellCheck={false}
                  maxLength={30}
                />
                <small
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: "var(--ink-faint)",
                  }}
                >
                  표시용 이름이에요. 비밀번호와 다른 값을 입력해 주세요.
                </small>
              </label>

              {!isFinalize && (
                <>
                  <label className="au-field sg-field">
                    <span>이메일</span>
                    <input
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@church.example"
                    />
                  </label>
                  <label className="au-field sg-field">
                    <span>비밀번호 (8자 이상)</span>
                    <div className="au-password">
                      <input
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="au-password-toggle"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                        aria-pressed={showPassword}
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.84 19.84 0 0 1 4.06-5.16" />
                            <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.86 19.86 0 0 1-3.17 4.19" />
                            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                            <line x1="2" y1="2" x2="22" y2="22" />
                          </svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </label>
                  <label className="au-field sg-field">
                    <span>비밀번호 확인</span>
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                    />
                  </label>
                </>
              )}
            </div>

            <section className="sg-consent">
              <header className="sg-consent-head">
                <h2 className="sg-consent-title">개인정보 동의</h2>
                <p className="sg-consent-intro">
                  우리 교회/단체가 이용자(특히 어린이)의 개인정보 수집·이용
                  동의를 확보할 책임자이며, 본 서비스 제공자에게 데이터
                  처리를 위탁한다는 사실을 확인해 주세요. 동의 사실은 가입
                  시점에 증빙으로 기록됩니다.
                </p>
              </header>

              <div
                className={`sg-consent-master ${allConsentChecked(consent) ? "is-checked" : ""}`}
                onClick={toggleAllConsent}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    toggleAllConsent();
                  }
                }}
              >
                <input
                  type="checkbox"
                  checked={allConsentChecked(consent)}
                  onChange={toggleAllConsent}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="모든 필수 동의 항목에 동의합니다"
                />
                <div className="sg-consent-master-body">
                  <span className="sg-consent-master-title">
                    5개 필수 항목에 모두 동의합니다
                  </span>
                  <span className="sg-consent-master-sub">
                    개인정보 컨트롤러 책임 · 미성년자 보호자 동의 · 목적 한정 ·
                    개인정보처리방침 · DPA (약관 v{CONSENT_VERSION})
                  </span>
                </div>
              </div>

              <button
                type="button"
                className={`sg-consent-toggle ${consentExpanded ? "is-open" : ""}`}
                onClick={() => setConsentExpanded((v) => !v)}
                aria-expanded={consentExpanded}
              >
                <span>{consentExpanded ? "자세한 항목 접기" : "5개 항목 자세히 보기"}</span>
                <span className="sg-consent-toggle-chevron" aria-hidden="true">▾</span>
              </button>

              {consentExpanded ? (
                <div className="sg-consent-details">
                  <ol className="sg-consent-list">
                    {CONSENT_ITEMS.map((item, idx) => {
                      const id = `signup-consent-${item.key}`;
                      const checked = consent[item.key];
                      return (
                        <li
                          key={item.key}
                          className={`sg-consent-item ${checked ? "is-checked" : ""}`}
                        >
                          <span className="sg-consent-num">{idx + 1}</span>
                          <input
                            id={id}
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setConsent((prev) => ({
                                ...prev,
                                [item.key]: e.target.checked,
                              }))
                            }
                          />
                          <label htmlFor={id}>{item.label}</label>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ) : null}
            </section>

            {error ? <div className="au-error">{error}</div> : null}
            {info ? <div className="au-info">{info}</div> : null}

            <button
              type="button"
              className="au-primary sg-primary"
              onClick={() => {
                if (isFinalize) void handleSubmitFinalize();
                else void handleSubmitCollect();
              }}
              disabled={
                submitting ||
                !orgName.trim() ||
                !adminName.trim() ||
                !allConsentChecked(consent) ||
                (!isFinalize &&
                  (!email.trim() || !password || !passwordConfirm))
              }
            >
              {submitting
                ? "만드는 중…"
                : isFinalize
                  ? "단체 만들기"
                  : "교회/단체 만들고 시작하기"}
            </button>

            <p className="au-foot sg-foot">
              교사로 가입하시는 분은 관리자가 보낸 카톡 초대 링크를 사용해
              주세요. 이미 계정이 있으면{" "}
              <Link href="/login">로그인 페이지</Link>로 이동하세요.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
