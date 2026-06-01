"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import {
  checkStudentHasPin,
  clearStoredStudent,
  fetchChurches,
  fetchClassesByChurch,
  fetchStudentsByClass,
  loadStoredStudent,
  setStudentPin,
  storeStudent,
  storeStudentPin,
  verifyStudentPin,
  type BibleChurch,
  type BibleClass,
  type BibleStudent,
  type IdentifiedStudent,
} from "../../lib/bibleReadingProgress";
import { isSupabaseConfigured } from "../../lib/supabaseClient";

type Props = {
  onChange: (student: IdentifiedStudent | null) => void;
};

export type StudentIdentityBarHandle = {
  // 외부(진도 저장 측)에서 "PIN 만료 → 다시 입력 받아줘" 요청.
  promptPin: () => void;
  // 외부(헤더 로그인 링크 등)에서 식별 흐름을 새로 시작하도록 요청.
  promptIdentify: () => void;
};

type Step = "church" | "class" | "student" | "pin" | "setup";

const StudentIdentityBar = forwardRef<StudentIdentityBarHandle, Props>(
  function StudentIdentityBar({ onChange }, ref) {
    const [student, setStudent] = useState<IdentifiedStudent | null>(null);
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<Step>("church");

    const [churches, setChurches] = useState<BibleChurch[]>([]);
    const [classes, setClasses] = useState<BibleClass[]>([]);
    const [students, setStudents] = useState<BibleStudent[]>([]);

    const [selectedChurch, setSelectedChurch] = useState<BibleChurch | null>(null);
    const [selectedClass, setSelectedClass] = useState<BibleClass | null>(null);
    const [selectedStudent, setSelectedStudent] = useState<BibleStudent | null>(null);

    const [pin, setPin] = useState("");
    const [newPin, setNewPin] = useState("");
    const [confirmPin, setConfirmPin] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const configured = useMemo(() => isSupabaseConfigured(), []);

    useEffect(() => {
      const stored = loadStoredStudent();
      if (stored) {
        setStudent(stored);
        onChange(stored);
      }
    }, [onChange]);

    const resetWizard = useCallback(() => {
      setStep("church");
      setSelectedChurch(null);
      setSelectedClass(null);
      setSelectedStudent(null);
      setPin("");
      setNewPin("");
      setConfirmPin("");
      setError(null);
      setClasses([]);
      setStudents([]);
    }, []);

    const completeLogin = useCallback(
      (church: BibleChurch, cls: BibleClass, s: BibleStudent, enteredPin: string) => {
        const identified: IdentifiedStudent = {
          id: s.id,
          name: s.name,
          classId: cls.id,
          className: cls.name,
          churchId: church.id,
          churchName: church.name,
          memberLabel: cls.member_label,
        };
        storeStudent(identified);
        storeStudentPin(enteredPin);
        setStudent(identified);
        setOpen(false);
        onChange(identified);
      },
      [onChange],
    );

    const beginIdentify = useCallback(async () => {
      if (!configured) {
        setError(
          "서버 연결이 설정되지 않았어요. 진도는 이 기기에만 저장됩니다.",
        );
        return;
      }
      setOpen(true);
      resetWizard();
      setLoading(true);
      try {
        const list = await fetchChurches();
        setChurches(list);
        // 비어 있어도 error 로 띄우지 않고 모달 안의 빈 상태 UI 로 안내.
      } catch (e) {
        console.warn(e);
        setError("교회 목록을 불러오지 못했어요.");
      } finally {
        setLoading(false);
      }
    }, [configured, resetWizard]);

    const pickChurch = useCallback(async (ch: BibleChurch) => {
      setSelectedChurch(ch);
      setStep("class");
      setError(null);
      setLoading(true);
      try {
        const list = await fetchClassesByChurch(ch.id);
        setClasses(list);
        if (list.length === 0) {
          setError("이 교회에 아직 반이 없어요. 선생님께 알려 주세요.");
        }
      } catch (e) {
        console.warn(e);
        setError("반 목록을 불러오지 못했어요.");
      } finally {
        setLoading(false);
      }
    }, []);

    const pickClass = useCallback(
      async (cls: BibleClass) => {
        // 선택된 교회가 없으면(이론상 발생 X) 막는다.
        if (!selectedChurch) {
          setError("먼저 교회를 골라 주세요.");
          setStep("church");
          return;
        }
        setSelectedClass(cls);
        setStep("student");
        setError(null);
        setLoading(true);
        try {
          // v2.2: church_id 와 함께 호출. RPC 가 반-교회 일치를 내부에서 검증한다.
          const list = await fetchStudentsByClass({
            churchId: selectedChurch.id,
            classId: cls.id,
          });
          setStudents(list);
          if (list.length === 0) {
            setError(
              `이 반에 등록된 ${cls.member_label}이 없어요. 선생님께 알려 주세요.`,
            );
          }
        } catch (e) {
          console.warn(e);
          setError("이름 목록을 불러오지 못했어요.");
        } finally {
          setLoading(false);
        }
      },
      [selectedChurch],
    );

    const pickStudent = useCallback(async (s: BibleStudent) => {
      setSelectedStudent(s);
      setPin("");
      setNewPin("");
      setConfirmPin("");
      setError(null);
      setLoading(true);
      try {
        // br_list_students 가 이미 has_pin 을 알려주지만, 한 번 더 확인.
        const has = s.has_pin ?? (await checkStudentHasPin(s.id));
        setStep(has ? "pin" : "setup");
      } catch (e) {
        console.warn(e);
        setStep("pin");
      } finally {
        setLoading(false);
      }
    }, []);

    const confirmLoginPin = useCallback(async () => {
      if (!selectedStudent || !selectedClass || !selectedChurch) return;
      if (!/^\d{4}$/.test(pin)) {
        setError("비밀번호는 숫자 4자리여야 해요.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const ok = await verifyStudentPin(selectedStudent.id, pin);
        if (!ok) {
          setError("비밀번호가 달라요. 다시 한 번 입력해 봐.");
          setPin("");
          setLoading(false);
          return;
        }
        completeLogin(selectedChurch, selectedClass, selectedStudent, pin);
      } catch (e) {
        console.warn(e);
        setError("로그인에 실패했어요. 잠시 후에 다시 해 봐.");
      } finally {
        setLoading(false);
      }
    }, [completeLogin, pin, selectedChurch, selectedClass, selectedStudent]);

    const confirmSetupPin = useCallback(async () => {
      if (!selectedStudent || !selectedClass || !selectedChurch) return;
      if (!/^\d{4}$/.test(newPin) || !/^\d{4}$/.test(confirmPin)) {
        setError("비밀번호는 숫자 4자리여야 해요.");
        return;
      }
      if (newPin !== confirmPin) {
        setError("두 번 입력한 비밀번호가 달라요. 다시 해볼까?");
        setConfirmPin("");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await setStudentPin(selectedStudent.id, newPin);
        if (!result.ok) {
          if (result.reason === "already_set") {
            setError(
              "이미 비밀번호가 있어. 아래 '이미 비밀번호가 있어요'를 눌러서 들어가 봐.",
            );
          } else if (result.reason === "not_configured") {
            setError("서버 연결이 설정되지 않았어요.");
          } else {
            setError(
              `서버 오류가 났어. 선생님께 보여줘.\n(${result.message ?? "unknown"})`,
            );
          }
          setLoading(false);
          return;
        }
        completeLogin(selectedChurch, selectedClass, selectedStudent, newPin);
      } catch (e) {
        console.warn(e);
        setError("문제가 생겼어. 잠시 후에 다시 해 봐.");
      } finally {
        setLoading(false);
      }
    }, [
      completeLogin,
      confirmPin,
      newPin,
      selectedChurch,
      selectedClass,
      selectedStudent,
    ]);

    const logout = useCallback(() => {
      clearStoredStudent();
      setStudent(null);
      onChange(null);
    }, [onChange]);

    const switchToLogin = useCallback(() => {
      setStep("pin");
      setPin("");
      setError(null);
    }, []);

    // 외부에서 "PIN 만료 → 다시 받아줘" 호출.
    useImperativeHandle(
      ref,
      () => ({
        promptPin: () => {
          const cur = loadStoredStudent();
          if (!cur) {
            void beginIdentify();
            return;
          }
          setSelectedChurch({ id: cur.churchId, name: cur.churchName ?? "" });
          setSelectedClass({
            id: cur.classId,
            name: cur.className ?? "",
            member_label: cur.memberLabel ?? "학생",
          });
          setSelectedStudent({ id: cur.id, name: cur.name, has_pin: true });
          setPin("");
          setError("진도를 저장하려면 비밀번호 4자리를 다시 입력해 줘.");
          setStep("pin");
          setOpen(true);
        },
        promptIdentify: () => {
          void beginIdentify();
        },
      }),
      [beginIdentify],
    );

    return (
      <>
        {student ? (
          /* 식별 완료 — 작고 차분한 인라인 상태 표시. 회색 카드 없음.
             식별 전 / 서버 미설정 시엔 본문에 아무것도 안 그림(헤더 링크로 처리). */
          <div className="bri-status">
            <span className="bri-status-eyebrow">읽기 진도 저장 중</span>
            <span className="bri-status-name">
              {student.churchName ? `${student.churchName} · ` : ""}
              {student.className ? `${student.className} · ` : ""}
              {student.name}
            </span>
            <button type="button" className="bri-link" onClick={logout}>
              다른 사람이에요
            </button>
          </div>
        ) : null}

        {open ? (
          <div
            className="bri-overlay"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div className="bri-modal">
              <header className="bri-modal-head">
                <h2>
                  {step === "church"
                    ? "교회를 골라 주세요"
                    : step === "class"
                    ? "반을 골라 주세요"
                    : step === "student"
                    ? "내 이름을 골라 주세요"
                    : step === "setup"
                    ? "처음이구나! 나만의 비밀번호를 정해줘"
                    : "비밀번호 4자리를 입력해줘"}
                </h2>
                <button
                  type="button"
                  className="bri-close"
                  aria-label="닫기"
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </header>

              {loading ? (
                <div className="bri-loading">잠깐만 기다려 줘…</div>
              ) : null}

              {step === "church" && !loading ? (
                churches.length > 0 ? (
                  <div className="bri-list">
                    {churches.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="bri-list-item"
                        onClick={() => void pickChurch(c)}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="bri-empty">
                    <p>아직 등록된 교회가 없어요.</p>
                    <p>
                      이 앱을 처음 쓰는 거라면 관리자 한 분이 먼저
                      <br />
                      <a className="bri-empty-link" href="/signup">
                        우리 교회 가입하러 가기 →
                      </a>
                    </p>
                  </div>
                )
              ) : null}

              {step === "class" && !loading ? (
                <>
                  <div className="bri-crumb">
                    {selectedChurch?.name}
                    <button
                      type="button"
                      className="bri-back"
                      onClick={() => setStep("church")}
                    >
                      ← 교회 다시 고르기
                    </button>
                  </div>
                  <div className="bri-list">
                    {classes.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="bri-list-item"
                        onClick={() => void pickClass(c)}
                      >
                        <span>{c.name}</span>
                        <span className="bri-list-meta">{c.member_label}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {step === "student" && !loading ? (
                <>
                  <div className="bri-crumb">
                    {selectedChurch?.name} · {selectedClass?.name}
                    <button
                      type="button"
                      className="bri-back"
                      onClick={() => setStep("class")}
                    >
                      ← 반 다시 고르기
                    </button>
                  </div>
                  <div className="bri-list bri-list-grid">
                    {students.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="bri-list-item"
                        onClick={() => void pickStudent(s)}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {step === "setup" && !loading ? (
                <>
                  <div className="bri-crumb">
                    {selectedChurch?.name} · {selectedClass?.name} ·{" "}
                    {selectedStudent?.name}
                    <button
                      type="button"
                      className="bri-back"
                      onClick={() => setStep("student")}
                    >
                      ← 이름 다시 고르기
                    </button>
                  </div>
                  <p className="bri-pin-note">
                    나만 아는 숫자 4자리로 비밀번호를 만들어 봐.
                    <br />
                    다음에 들어올 때는 이 비밀번호로 들어와야 해.
                  </p>

                  <label className="bri-field-label" htmlFor="bri-new-pin">
                    새 비밀번호 (숫자 4자리)
                  </label>
                  <input
                    id="bri-new-pin"
                    className="bri-pin-input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={4}
                    value={newPin}
                    onChange={(e) =>
                      setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder="••••"
                    autoFocus
                  />

                  <label className="bri-field-label" htmlFor="bri-confirm-pin">
                    한 번 더 입력
                  </label>
                  <input
                    id="bri-confirm-pin"
                    className="bri-pin-input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={4}
                    value={confirmPin}
                    onChange={(e) =>
                      setConfirmPin(
                        e.target.value.replace(/\D/g, "").slice(0, 4),
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void confirmSetupPin();
                    }}
                    placeholder="••••"
                  />

                  <button
                    type="button"
                    className="bri-cta bri-cta-full"
                    onClick={() => void confirmSetupPin()}
                    disabled={newPin.length !== 4 || confirmPin.length !== 4}
                  >
                    비밀번호 정하기
                  </button>
                  <button
                    type="button"
                    className="bri-secondary"
                    onClick={switchToLogin}
                  >
                    이미 비밀번호가 있어요
                  </button>
                </>
              ) : null}

              {step === "pin" && !loading ? (
                <>
                  <div className="bri-crumb">
                    {selectedChurch?.name} · {selectedClass?.name} ·{" "}
                    {selectedStudent?.name}
                    <button
                      type="button"
                      className="bri-back"
                      onClick={() => setStep("student")}
                    >
                      ← 이름 다시 고르기
                    </button>
                  </div>
                  <p className="bri-pin-note">
                    내가 정한 비밀번호 4자리를 입력해줘.
                  </p>
                  <input
                    className="bri-pin-input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="current-password"
                    maxLength={4}
                    value={pin}
                    onChange={(e) =>
                      setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void confirmLoginPin();
                    }}
                    placeholder="••••"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="bri-cta bri-cta-full"
                    onClick={() => void confirmLoginPin()}
                    disabled={pin.length !== 4}
                  >
                    들어가기
                  </button>
                </>
              ) : null}

              {error ? <div className="bri-error">{error}</div> : null}
            </div>
          </div>
        ) : null}

        <style jsx>{`
          /* 식별 완료 시만 표시: 본문 상단의 작은 인라인 상태 한 줄. */
          .bri-status {
            max-width: var(--container-reading);
            margin: 14px auto 0;
            padding: 0 16px;
            display: flex;
            align-items: baseline;
            justify-content: center;
            flex-wrap: wrap;
            gap: 4px 10px;
            font-size: 13.5px;
            color: var(--ink-soft);
            box-sizing: border-box;
          }
          .bri-status-eyebrow {
            font-size: 11px;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--ink-mute);
            font-weight: 600;
          }
          .bri-status-name {
            font-size: 14px;
            font-weight: 600;
            color: var(--ink);
            overflow: hidden;
            text-overflow: ellipsis;
          }

          /* 모달 내부 CTA — 1차 액션. 그린 채움. */
          .bri-cta {
            padding: 12px 22px;
            border-radius: var(--radius-pill);
            border: 1px solid var(--accent);
            background: var(--accent);
            color: var(--accent-ink);
            font-size: 14.5px;
            font-weight: 600;
            cursor: pointer;
            white-space: nowrap;
            font-family: inherit;
            transition: background 0.18s ease, border-color 0.18s ease;
          }
          .bri-cta:hover:not(:disabled) {
            background: var(--accent-hover);
            border-color: var(--accent-hover);
          }
          .bri-link {
            background: transparent;
            border: none;
            color: var(--ink-soft);
            font-size: 12.5px;
            cursor: pointer;
            text-decoration: underline;
            text-underline-offset: 2px;
            padding: 4px 6px;
            font-family: inherit;
            margin-left: 4px;
          }
          .bri-link:hover {
            color: var(--ink);
          }
          .bri-overlay {
            position: fixed;
            inset: 0;
            background: rgba(22, 22, 26, 0.42);
            backdrop-filter: saturate(180%) blur(8px);
            -webkit-backdrop-filter: saturate(180%) blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100;
            padding: 16px;
          }
          .bri-modal {
            background: var(--surface);
            width: 100%;
            max-width: 480px;
            max-height: 84vh;
            overflow-y: auto;
            border-radius: var(--radius-lg);
            padding: 24px 24px 26px;
            border: 1px solid var(--line);
            box-shadow: var(--shadow-2);
            box-sizing: border-box;
          }
          .bri-modal-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            gap: 12px;
          }
          .bri-modal-head h2 {
            margin: 0;
            font-size: 18px;
            font-weight: 700;
            letter-spacing: -0.01em;
            color: var(--ink);
            line-height: 1.35;
          }
          .bri-close {
            background: transparent;
            border: none;
            font-size: 22px;
            color: var(--ink-soft);
            cursor: pointer;
            line-height: 1;
            padding: 0 4px;
            font-family: inherit;
          }
          .bri-close:hover {
            color: var(--ink);
          }
          .bri-crumb {
            font-size: 12.5px;
            color: var(--ink-soft);
            margin-bottom: 14px;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
          }
          .bri-back {
            background: transparent;
            border: none;
            color: var(--ink-soft);
            font-size: 12.5px;
            font-weight: 600;
            cursor: pointer;
            padding: 2px 4px;
            font-family: inherit;
          }
          .bri-back:hover {
            color: var(--ink);
            text-decoration: underline;
            text-underline-offset: 2px;
          }
          .bri-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .bri-list-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
            gap: 8px;
          }
          .bri-list-item {
            padding: 14px 16px;
            background: var(--surface);
            border: 1px solid var(--line);
            border-radius: var(--radius-md);
            font-size: 15px;
            font-weight: 600;
            color: var(--ink);
            cursor: pointer;
            text-align: left;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            font-family: inherit;
            transition: background 0.15s ease, border-color 0.15s ease;
          }
          .bri-list-grid .bri-list-item {
            text-align: center;
            justify-content: center;
          }
          .bri-list-item:hover {
            background: var(--surface-alt);
            border-color: var(--line-strong);
          }
          .bri-list-meta {
            font-size: 12px;
            color: var(--ink-soft);
            font-weight: 500;
          }
          .bri-loading {
            padding: 24px;
            text-align: center;
            color: var(--ink-soft);
            font-size: 14px;
          }
          .bri-empty {
            padding: 22px 18px;
            text-align: center;
            background: var(--surface-alt);
            border: 1px dashed var(--line-strong);
            border-radius: var(--radius-md);
            color: var(--ink-soft);
            font-size: 14px;
            line-height: 1.7;
          }
          .bri-empty p {
            margin: 0 0 10px;
          }
          .bri-empty p:last-child {
            margin-bottom: 0;
          }
          /* 안내 박스 안의 보조 액션 — ghost 톤. 1차 액션 아님. */
          .bri-empty-link {
            display: inline-block;
            margin-top: 8px;
            padding: 10px 16px;
            background: transparent;
            color: var(--ink);
            border: 1px solid var(--line);
            border-radius: var(--radius-pill);
            font-weight: 600;
            font-size: 13px;
            text-decoration: none;
            transition: background 0.18s ease, border-color 0.18s ease;
          }
          .bri-empty-link:hover {
            background: var(--surface-alt);
            border-color: var(--line-strong);
          }
          .bri-pin-note {
            margin: 6px 0 16px;
            font-size: 14px;
            color: var(--ink-soft);
            line-height: 1.6;
          }
          .bri-field-label {
            display: block;
            font-size: 13px;
            color: var(--ink-soft);
            margin-bottom: 6px;
            margin-top: 6px;
            font-weight: 600;
          }
          .bri-pin-input {
            width: 100%;
            padding: 14px 16px;
            font-size: 24px;
            letter-spacing: 14px;
            text-align: center;
            font-weight: 700;
            background: var(--surface);
            border: 1px solid var(--line);
            border-radius: var(--radius-lg);
            outline: none;
            margin-bottom: 12px;
            color: var(--ink);
            font-family: inherit;
            box-sizing: border-box;
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
          }
          .bri-pin-input:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px var(--accent-soft);
          }
          .bri-cta-full {
            width: 100%;
            padding: 13px;
            font-size: 15px;
          }
          .bri-cta-full:disabled {
            background: var(--surface-alt);
            color: var(--ink-mute);
            border-color: var(--line);
            cursor: not-allowed;
          }
          .bri-secondary {
            width: 100%;
            margin-top: 10px;
            padding: 11px;
            background: transparent;
            color: var(--ink);
            border: 1px solid var(--line);
            border-radius: var(--radius-pill);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            font-family: inherit;
            transition: background 0.15s ease;
          }
          .bri-secondary:hover {
            background: var(--surface-alt);
          }
          .bri-error {
            margin-top: 12px;
            padding: 11px 13px;
            background: var(--danger-soft);
            border: 1px solid var(--danger);
            border-radius: var(--radius-md);
            color: var(--danger);
            font-size: 13.5px;
            line-height: 1.55;
            white-space: pre-line;
          }
        `}</style>
      </>
    );
  },
);

export default StudentIdentityBar;
