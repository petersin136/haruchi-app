"use client";

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
// 주의: 인증 chrome (.au-*) 및 /signup 시범 디자인 (.sg-*) 스타일은
// 모두 app/globals.css 에 글로벌 클래스로 정의되어 있다. styled-jsx 의
// <style jsx>{외부변수}</style> 패턴은 Next.js SWC 환경에서 스코프 hash 가
// undefined 가 되어 스타일이 주입되지 않으므로, 외부 변수 패턴을 쓰지 않는다.

// 약관 버전. 동의 항목 텍스트/구성이 바뀔 때마다 올린다.
//
// ❓ 검토 메모(v2.5): DPA(데이터 처리 위탁 계약) 동의 항목이 추가됐다.
//   엄밀히는 사용자에게 동의를 요구하는 약관이 변경된 셈이라 버전 문자열을
//   '2026-06-XX' 같은 새 날짜로 올리는 것이 정석. 다만 본 서비스는 아직
//   외부 출시 전 초안 단계이고, 가입된 교회가 없거나 적기 때문에 현 시점에서는
//   '2026-06-01' 을 그대로 두고, 정식 출시 직전에 일괄로 버전을 확정한다.
//   → 출시 시점에 이 문자열을 새 날짜로 바꾸고, schema.sql 의 동일 코멘트도 갱신.
const CONSENT_VERSION = "2026-06-01";

// 항목별 동의. 모두 true 여야 가입 가능.
type ConsentKey = keyof ConsentItems;

const CONSENT_ITEMS: { key: ConsentKey; label: React.ReactNode }[] = [
  {
    key: "controller_acknowledged",
    label: (
      <>
        우리 교회가 이 서비스의 <strong>개인정보 컨트롤러</strong>이며,
        이용자(특히 미성년자)의 개인정보 수집·이용에 대한 동의를 받을 책임이
        우리 교회에 있음을 이해합니다.
      </>
    ),
  },
  {
    key: "minor_consent",
    label: (
      <>
        만 14세 미만 아동이 이용할 경우, 해당 아동의{" "}
        <strong>법정대리인(부모) 동의</strong>를 우리 교회가 직접 받겠습니다.
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
        본 교회는{" "}
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

type Step = "auth" | "church";

export default function SignupPage() {
  const router = useRouter();
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const { state, refresh } = useAdultSession();

  const [step, setStep] = useState<Step>("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [churchName, setChurchName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [consent, setConsent] = useState<ConsentItems>({
    controller_acknowledged: false,
    minor_consent: false,
    purpose_limited: false,
    privacy_reviewed: false,
    dpa_agreed: false,
  });
  const allConsentChecked =
    consent.controller_acknowledged &&
    consent.minor_consent &&
    consent.purpose_limited &&
    consent.privacy_reviewed &&
    consent.dpa_agreed;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // 약관 자세히 보기 — 기본은 접힘. 펼치면 5개 항목을 개별로 볼 수 있다.
  const [consentExpanded, setConsentExpanded] = useState(false);

  const toggleAllConsent = useCallback(() => {
    setConsent((prev) => {
      const allOn =
        prev.controller_acknowledged &&
        prev.minor_consent &&
        prev.purpose_limited &&
        prev.privacy_reviewed &&
        prev.dpa_agreed;
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

  // 이미 로그인되어 있고 멤버십까지 있으면 바로 대시보드로.
  useEffect(() => {
    if (state.status === "signed_in") {
      if (state.session.membership) {
        router.replace(state.session.membership.role === "admin" ? "/admin" : "/teacher");
      } else {
        setStep("church");
      }
    }
  }, [router, state]);

  const handleSignUp = useCallback(async () => {
    setError(null);
    setInfo(null);
    if (!/^.+@.+\..+$/.test(email)) {
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
    setBusy(true);
    try {
      await adultSignUp(email.trim(), password);
      // signUp 직후 일부 Supabase 프로젝트는 confirm 메일을 요구. 일단 곧장 로그인 시도.
      try {
        await adultSignIn(email.trim(), password);
      } catch {
        setInfo(
          "가입 메일이 전송됐어요. 메일에서 이메일 인증을 완료한 뒤 다시 로그인해 주세요.",
        );
        setBusy(false);
        return;
      }
      await refresh();
      setStep("church");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "회원가입에 실패했어요.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, [email, password, passwordConfirm, refresh]);

  const handleCreateChurch = useCallback(async () => {
    setError(null);
    if (!churchName.trim()) {
      setError("교회 이름을 입력해 주세요.");
      return;
    }
    if (!adminName.trim()) {
      setError("관리자(본인) 이름을 입력해 주세요.");
      return;
    }
    if (!allConsentChecked) {
      setError("5개 동의 항목에 모두 체크해 주세요.");
      return;
    }
    setBusy(true);
    try {
      await signupChurch({
        churchName: churchName.trim(),
        adminName: adminName.trim(),
        consentItems: consent,
        consentVersion: CONSENT_VERSION,
        consentAdminName: adminName.trim(),
      });
      await refresh();
      router.replace("/admin");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "교회 생성에 실패했어요.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, [adminName, allConsentChecked, churchName, consent, refresh, router]);

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

  return (
    <main className="au-page sg-page">
      <div className="au-topbar sg-topbar">
        <Link href="/bible-reading">← 학생 페이지</Link>
        <Link href="/login">이미 계정이 있어요</Link>
      </div>

      <div className="au-card sg-card">
        <div className="sg-stepper" aria-label={`회원가입 단계 ${step === "auth" ? 1 : 2} / 2`}>
          <span className={`sg-stepper-dot ${step === "auth" ? "is-active" : "is-done"}`} />
          <span className={`sg-stepper-dot ${step === "church" ? "is-active" : ""}`} />
          <span className="sg-stepper-label">
            STEP {step === "auth" ? "1" : "2"} OF 2
          </span>
        </div>

        {step === "auth" ? (
          <>
            <h1 className="sg-title">교회 관리자 계정 만들기</h1>
            <p className="sg-sub">
              먼저 이메일과 비밀번호로 계정을 만들어요. 다음 단계에서 교회를 만들고
              관리자(본인) 이름을 등록합니다.
            </p>

            <div className="sg-form">
              <label className="au-field sg-field">
                <span>이메일</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@church.example"
                />
              </label>
              <label className="au-field sg-field">
                <span>비밀번호 (8자 이상)</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label className="au-field sg-field">
                <span>비밀번호 확인</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSignUp();
                  }}
                />
              </label>
            </div>

            {error ? <div className="au-error">{error}</div> : null}
            {info ? <div className="au-info">{info}</div> : null}

            <button
              type="button"
              className="au-primary sg-primary"
              onClick={() => void handleSignUp()}
              disabled={busy || !email || !password || !passwordConfirm}
            >
              {busy ? "잠시만요…" : "계정 만들기"}
            </button>

            <p className="au-foot sg-foot">
              교사는 관리자가 보낸 초대 링크로 가입하세요.
            </p>
          </>
        ) : (
          <>
            <h1 className="sg-title">우리 교회 만들기</h1>
            <p className="sg-sub">
              교회 이름과 관리자(본인) 이름을 입력하고 아래 동의 항목에 체크해 주세요.
              생성이 끝나면 곧바로 관리자 대시보드로 이동합니다.
            </p>

            <div className="sg-form">
              <label className="au-field sg-field">
                <span>교회 이름</span>
                <input
                  type="text"
                  value={churchName}
                  onChange={(e) => setChurchName(e.target.value)}
                  placeholder="예: 가나안교회"
                />
              </label>
              <label className="au-field sg-field">
                <span>관리자(본인) 이름</span>
                <input
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="예: 김관리자"
                />
              </label>
            </div>

            <section className="sg-consent">
              <header className="sg-consent-head">
                <h2 className="sg-consent-title">개인정보 동의</h2>
                <p className="sg-consent-intro">
                  우리 교회가 이용자(특히 어린이)의 개인정보 수집·이용 동의를
                  확보할 책임자이며, 본 서비스 제공자에게 데이터 처리를
                  위탁한다는 사실을 확인해 주세요. 동의 사실은 가입 시점에
                  증빙으로 기록됩니다.
                </p>
              </header>

              <div
                className={`sg-consent-master ${allConsentChecked ? "is-checked" : ""}`}
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
                  checked={allConsentChecked}
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

            <button
              type="button"
              className="au-primary sg-primary"
              onClick={() => void handleCreateChurch()}
              disabled={busy || !churchName || !adminName || !allConsentChecked}
            >
              {busy ? "만드는 중…" : "교회 만들고 시작하기"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
