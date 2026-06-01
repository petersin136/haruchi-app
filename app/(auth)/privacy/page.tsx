/*
  ⚠️ INTERNAL NOTE (not shown to users):
  본 방침은 초안이며 법률 검토 후 확정됩니다.
  - 회사/대표자/연락처는 실제 값으로 채움(마라나타 스튜디오 / 신승용 / petersin136@gmail.com).
  - 시행일은 임시로 2026-06-01 → 정식 외부 출시일 확정 시 갱신 필요.
  - [클라우드 제공자명] / [메일 서비스 제공자명] / [직책] 등 일부 placeholder 는 아직 미정.
  - 변호사/법무 검토 후 최종 확정.
*/
"use client";

import Link from "next/link";
import { authStyles } from "../authStyles";

const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "general",
    title: "1. 총칙",
    body: (
      <>
        <p>
          본 개인정보처리방침은 마라나타 스튜디오 (이하 "당사")이 제공하는
          <strong> 성경 읽기 진도 관리 서비스</strong>(이하 "본 서비스")에
          적용됩니다. 본 서비스는 여러 교회가 한 인스턴스에서 격리되어 사용하는
          멀티테넌시 SaaS 구조로 운영됩니다.
        </p>
        <p>
          개인정보 보호 관련 책임은 다음과 같이 분담됩니다.
        </p>
        <ul>
          <li>
            <strong>개인정보 컨트롤러(controller)</strong>: 본 서비스를 이용하는
            각 교회. 교회는 소속 이용자(학생/청년/회원 등) 및 어른 사용자(교사)의
            개인정보 수집·이용에 대한 동의 확보의 1차 책임을 집니다.
          </li>
          <li>
            <strong>개인정보 처리자(processor, 수탁자)</strong>: 당사. 각 교회를
            대신해 데이터를 저장·관리·제공할 뿐, 교회 간 데이터는 기술적으로
            격리되어 다른 교회 데이터에 접근할 수 없습니다.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "items",
    title: "2. 수집하는 개인정보 항목",
    body: (
      <>
        <p>본 서비스는 아래 항목만 수집합니다.</p>
        <h3>가. 이용자(학생/청년 등)</h3>
        <ul>
          <li>이름 (각 교회가 직접 입력)</li>
          <li>
            4자리 PIN — <strong>단방향 암호화 해시(bcrypt) 로만 저장</strong>하며,
            평문 PIN 은 어떤 저장소에도 보관하지 않습니다.
          </li>
          <li>성경 읽기 진도 기록 (어떤 책의 어느 장을 언제 완료했는지)</li>
        </ul>
        <h3>나. 어른 사용자(관리자/교사)</h3>
        <ul>
          <li>이메일 주소</li>
          <li>이름 (본인 또는 관리자가 입력)</li>
        </ul>
        <p className="prv-note">
          그 밖의 식별정보(주민등록번호, 생년월일, 연락처, 주소 등)는 수집하지
          않습니다.
        </p>
      </>
    ),
  },
  {
    id: "purpose",
    title: "3. 수집 및 이용 목적",
    body: (
      <>
        <p>수집한 개인정보는 다음 목적에만 이용됩니다.</p>
        <ul>
          <li>성경 읽기 진도 관리 및 통계 제공</li>
          <li>이용자 본인 확인 및 로그인 인증 (PIN, 이메일/비밀번호)</li>
          <li>관리자·교사의 권한 분리(자기 교회/배정 반에 한정한 접근 통제)</li>
        </ul>
        <p>
          위 목적을 벗어난 마케팅, 광고, 외부 분석, 프로파일링 등의 용도로는
          이용하지 않습니다.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "4. 보유 및 이용 기간",
    body: (
      <>
        <p>
          본 서비스는 수집한 개인정보를 다음 기간 동안 보유합니다.
        </p>
        <ul>
          <li>이용자(학생/청년 등): 해당 이용자가 교회에서 삭제되는 시점까지</li>
          <li>
            어른 사용자(관리자/교사): 본인이 탈퇴를 요청하거나 소속 교회에서
            해당 사용자를 제거하는 시점까지
          </li>
          <li>
            교회(테넌트): 해당 교회의 서비스 해지 또는 삭제 요청 시점까지
          </li>
        </ul>
        <p>
          위 기간 도래 시 또는 정보주체의 파기 요청 시,
          <strong> 지체 없이 복구할 수 없는 방법으로 파기</strong>합니다. 다만
          관련 법령에 따라 보존이 요구되는 경우 해당 법령이 정한 기간 동안만
          별도로 분리 보관합니다.
        </p>
      </>
    ),
  },
  {
    id: "minor",
    title: "5. 만 14세 미만 아동의 개인정보",
    body: (
      <>
        <p>
          본 서비스는 교회의 아동·청소년 부서에서 사용될 수 있으므로,
          <strong> 만 14세 미만 아동의 개인정보 수집·이용에는 법정대리인의
          동의가 필요</strong>합니다.
        </p>
        <ul>
          <li>
            <strong>법정대리인 동의 확보의 책임</strong>은 해당 아동을 등록하는
            각 교회에 있습니다. 교회는 가입 시 동의 항목을 통해 이 책임을
            서면(전자적 동의)으로 확인합니다.
          </li>
          <li>
            당사는 각 학생 추가 시 교회 관리자가 입력한
            <em> "부모(법정대리인) 동의를 받았다"</em> 여부와 그 기록 시각만
            보관하며, 실제 동의서 자체는 보관하지 않습니다.
          </li>
          <li>
            법정대리인은 언제든지 자녀의 개인정보 열람·정정·삭제·처리정지를
            소속 교회에 요청할 수 있습니다.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "third-party",
    title: "6. 개인정보의 제3자 제공",
    body: (
      <>
        <p>
          당사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다음
          경우에는 예외적으로 제공될 수 있습니다.
        </p>
        <ul>
          <li>정보주체로부터 별도의 동의를 받은 경우</li>
          <li>
            법령에 의해 제공이 요구되거나 수사기관이 적법한 절차에 따라 요청한
            경우
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "processor",
    title: "7. 개인정보 처리의 위탁",
    body: (
      <>
        <p>
          본 서비스의 안정적 운영을 위해 다음과 같이 일부 처리를 외부에
          위탁합니다.
        </p>
        <ul>
          <li>
            <strong>클라우드 인프라 및 데이터베이스</strong>: [클라우드 제공자명]
            — 데이터 저장, 인증 토큰 발급, 백업
          </li>
          <li>
            <strong>이메일 발송</strong>(필요한 경우): [메일 서비스 제공자명] —
            가입 인증 메일 등
          </li>
        </ul>
        <p>
          위탁 계약 시 개인정보 보호 관련 법규 준수, 위탁 목적 외 처리 금지,
          기술적·관리적 보호 조치, 재위탁 제한, 사고 발생 시 책임 등을
          명시합니다.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "8. 정보주체의 권리",
    body: (
      <>
        <p>
          정보주체(이용자 또는 그 법정대리인)는 언제든지 자신의 개인정보에
          대하여 다음 권리를 행사할 수 있습니다.
        </p>
        <ul>
          <li>개인정보 처리 현황 열람 요구</li>
          <li>오류 등이 있을 경우 정정 요구</li>
          <li>삭제 요구 (관련 법령에 따라 제한될 수 있음)</li>
          <li>처리정지 요구</li>
        </ul>
        <p>
          행사 방법은 다음과 같습니다.
        </p>
        <ul>
          <li>
            <strong>1차 창구</strong>: 소속 교회의 관리자(컨트롤러)에게 요청.
            교회 관리자는 본 서비스의 관리자 대시보드에서 해당 처리를 즉시
            수행할 수 있습니다.
          </li>
          <li>
            <strong>2차 창구</strong>: 교회를 통해 해결되지 않거나 당사에 직접
            요청해야 하는 경우 petersin136@gmail.com 로 연락 주시기 바랍니다.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "safety",
    title: "9. 안전성 확보 조치",
    body: (
      <>
        <p>
          당사는 개인정보의 안전한 처리를 위해 다음과 같은
          기술적·관리적·물리적 조치를 취하고 있습니다.
        </p>
        <ul>
          <li>
            <strong>접근 통제</strong> — 모든 데이터 접근에 Row Level Security
            (RLS) 정책을 적용. 교회 간 데이터는 기술적으로 격리되어 다른 교회의
            데이터에 접근할 수 없습니다.
          </li>
          <li>
            <strong>PIN 보호</strong> — 이용자 4자리 PIN 은 bcrypt 단방향
            해시로만 저장되며, 평문 PIN 은 서버·DB·로그 어디에도 남지
            않습니다.
          </li>
          <li>
            <strong>역할 기반 권한</strong> — 관리자(admin)와 교사(teacher)의
            권한이 분리되어 있고, 교사는 자기에게 배정된 반의 데이터에만
            접근할 수 있습니다.
          </li>
          <li>
            <strong>전송 구간 암호화</strong> — 클라이언트와 서버 간 모든 통신은
            HTTPS 로 암호화됩니다.
          </li>
          <li>
            <strong>최소 수집</strong> — 서비스 목적에 필수적인 정보(이름, PIN,
            진도)만 수집합니다.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "officer",
    title: "10. 개인정보 보호책임자",
    body: (
      <>
        <p>
          당사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와
          관련한 정보주체의 불만 처리 및 피해 구제를 위해 아래와 같이
          개인정보 보호책임자를 지정하고 있습니다.
        </p>
        <ul>
          <li>책임자: 신승용</li>
          <li>소속·직책: 마라나타 스튜디오 / [직책]</li>
          <li>이메일: petersin136@gmail.com</li>
        </ul>
        <p>
          정보주체는 본 서비스를 이용하면서 발생한 모든 개인정보 보호 관련
          문의, 불만 처리, 피해 구제 등에 관한 사항을 위 담당자에게 문의하실 수
          있습니다. 당사는 정보주체의 문의에 대해 지체 없이 답변 및 처리해
          드릴 것입니다.
        </p>
      </>
    ),
  },
  {
    id: "history",
    title: "11. 시행일 및 변경 이력",
    body: (
      <>
        <p>
          {/* 시행일: 임시 2026-06-01. 정식 외부 출시일 확정 시 갱신 필요. */}
          본 방침은 <strong>2026-06-01</strong>부터 시행됩니다. 법령, 정책,
          서비스 운영상 필요한 사유로 본 방침이 변경되는 경우, 변경 사항은 본
          페이지 또는 서비스 내 공지를 통해 시행 7일 전(이용자에게 불리한
          변경의 경우 30일 전)부터 안내합니다.
        </p>
        <ul>
          <li>약관 버전: <code>2026-06-01</code> (가입 시점에 각 교회별 동의 증빙으로 저장)</li>
        </ul>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main className="au-page">
      <div className="au-topbar">
        <Link href="/bible-reading">← 학생 페이지</Link>
        <Link href="/signup">회원가입으로</Link>
      </div>

      <article className="au-card prv-card">
        <p className="au-eyebrow">법적 고지</p>
        <h1>개인정보처리방침</h1>
        <p className="au-sub">
          본 서비스는 이용자(특히 미성년자)의 개인정보를 가장 작은 범위로
          수집하고, 교회 단위로 엄격히 격리하여 보관합니다. 본 방침은 그
          처리 원칙을 설명합니다.
        </p>

        <nav className="prv-toc" aria-label="목차">
          <p className="prv-toc-title">목차</p>
          <ol>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="prv-section">
            <h2>{s.title}</h2>
            <div className="prv-body">{s.body}</div>
          </section>
        ))}
      </article>

      <style jsx>{authStyles}</style>
      <style jsx>{`
        .prv-card {
          max-width: 760px;
        }
        .prv-toc {
          margin: 8px 0 18px;
          padding: 14px 16px;
          background: #f6f1e6;
          border: 1px solid #e0d5bb;
          border-radius: 12px;
        }
        .prv-toc-title {
          margin: 0 0 6px;
          font-size: 11.5px;
          letter-spacing: 0.8px;
          color: #8a7c61;
          font-weight: 700;
          text-transform: uppercase;
        }
        .prv-toc ol {
          margin: 0;
          padding-left: 20px;
          color: #4f4530;
          font-size: 13px;
          line-height: 1.95;
        }
        .prv-toc a {
          color: #1e3a5f;
          text-decoration: none;
        }
        .prv-toc a:hover {
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .prv-section {
          padding-top: 14px;
          margin-top: 14px;
          border-top: 1px solid #ede4cf;
        }
        .prv-section:first-of-type {
          border-top: none;
        }
        .prv-section h2 {
          margin: 0 0 10px;
          font-size: 16px;
          color: #2c2417;
          font-weight: 700;
        }
        .prv-section :global(h3) {
          margin: 12px 0 6px;
          font-size: 13.5px;
          color: #4f4530;
          font-weight: 700;
        }
        .prv-body :global(p) {
          margin: 0 0 10px;
          font-size: 13.5px;
          line-height: 1.85;
          color: #2c2417;
        }
        .prv-body :global(ul) {
          margin: 0 0 12px;
          padding-left: 20px;
        }
        .prv-body :global(li) {
          font-size: 13.5px;
          line-height: 1.85;
          color: #2c2417;
          margin-bottom: 4px;
        }
        .prv-body :global(strong) {
          color: #1a1a1a;
        }
        .prv-body :global(em) {
          color: #4f4530;
          font-style: normal;
          background: #f6f1e6;
          padding: 0 4px;
          border-radius: 4px;
        }
        .prv-body :global(code) {
          background: #f6f1e6;
          padding: 1px 6px;
          border-radius: 4px;
          font-size: 12.5px;
          color: #4f4530;
        }
        .prv-body :global(.prv-note) {
          margin-top: 6px;
          padding: 8px 12px;
          background: #f6f1e6;
          border-left: 3px solid #1e3a5f;
          color: #4f4530;
          font-size: 12.5px;
          line-height: 1.7;
          border-radius: 0 6px 6px 0;
        }
      `}</style>
    </main>
  );
}
