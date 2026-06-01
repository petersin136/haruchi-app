/*
  ⚠️ INTERNAL NOTE (not shown to users):
  본 데이터 처리 위탁 계약(DPA) 약관은 초안이며 법률 검토 후 확정됩니다.
  - 회사/대표자/연락처는 실제 값으로 채움(마라나타 스튜디오 / 신승용 / petersin136@gmail.com).
  - [클라우드 제공자명] / [메일 서비스 제공자명] 등 일부 placeholder 는 아직 미정.
  - 약관 버전(consent_version) 변경 여부는 signup/page.tsx 상단 주석 참고.
  - 변호사/법무 검토 후 최종 확정.
*/
"use client";

import Link from "next/link";
import { authStyles } from "../authStyles";

const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "purpose",
    title: "1. 목적",
    body: (
      <>
        <p>
          본 데이터 처리 위탁 계약(이하 "본 계약")은 본 서비스를 이용하는 교회
          (이하 "위탁자")가 그 소속 이용자(학생/청년/회원 및 교사)의 개인정보 처리를
          마라나타 스튜디오(이하 "수탁자")에게 위탁하는 것에 관한 권리·의무를
          정합니다.
        </p>
        <p>
          본 계약은 위탁자가 본 서비스에 회원가입할 때 동의함으로써 체결되며,
          수탁자의 <Link href="/privacy">개인정보처리방침</Link> 과 함께 적용됩니다.
        </p>
      </>
    ),
  },
  {
    id: "scope",
    title: "2. 위탁 업무의 내용",
    body: (
      <>
        <p>위탁자가 수탁자에게 위탁하는 업무의 범위는 다음과 같습니다.</p>
        <ul>
          <li>
            <strong>처리 목적</strong>: 위탁자 교회의
            <em> 성경 읽기 진도 관리 </em>를 위한 이용자 정보 저장·조회·관리
          </li>
          <li>
            <strong>처리 항목</strong>: 이용자 이름, 4자리 PIN(단방향 해시),
            성경 읽기 진도 기록, 어른 사용자(관리자/교사)의 이메일과 이름
          </li>
          <li>
            <strong>처리 방법</strong>: 본 서비스의 데이터베이스에 저장하고
            웹 클라이언트의 요청에 따라 조회·갱신
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "controller-duty",
    title: "3. 위탁자(교회)의 의무",
    body: (
      <>
        <p>위탁자는 본 서비스 이용과 관련하여 다음의 의무를 부담합니다.</p>
        <ul>
          <li>
            <strong>동의 확보</strong>: 모든 이용자(및 어른 사용자)로부터
            개인정보 수집·이용에 대한 동의를 본인이 직접 확보합니다.
          </li>
          <li>
            <strong>만 14세 미만 아동</strong>: 만 14세 미만 아동이 이용하는 경우
            반드시 그 법정대리인(부모)의 동의를 위탁자가 직접 받습니다. 본
            서비스의 학생 추가 화면에서 그 동의 사실을 체크하여 기록합니다.
          </li>
          <li>
            <strong>수집 항목의 적법성</strong>: 본 서비스에 입력하는 정보가
            관련 법령에 부합하며, 위탁자가 적법하게 수집·보유한 정보임을
            보장합니다.
          </li>
          <li>
            <strong>정확성</strong>: 이용자 이름, 반 배정 등 정보를 정확하게
            입력·관리합니다. 잘못된 정보로 인해 발생한 책임은 위탁자에게
            있습니다.
          </li>
          <li>
            <strong>접근 계정 관리</strong>: 관리자/교사 계정의 비밀번호를
            안전하게 관리하고, 권한이 없는 자에게 노출되지 않도록 합니다.
          </li>
          <li>
            <strong>정보주체 권리 대응의 1차 책임</strong>: 이용자 또는
            법정대리인의 열람·정정·삭제·처리정지 요청에 대해 위탁자가 1차
            창구로서 대응합니다.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "processor-duty",
    title: "4. 수탁자(당사)의 의무",
    body: (
      <>
        <p>수탁자는 본 위탁 업무 수행과 관련하여 다음 의무를 준수합니다.</p>
        <ul>
          <li>
            <strong>목적 외 이용 금지</strong>: 위탁받은 개인정보를 본 계약에
            정한 목적(성경 읽기 진도 관리) 외의 용도로 처리하지 않습니다.
            마케팅·광고·외부 분석·프로파일링 등의 용도로 이용하지 않습니다.
          </li>
          <li>
            <strong>안전성 확보 조치</strong>:
            <ul>
              <li>교회 단위 데이터 격리(Row Level Security)로 다른 교회 데이터에 접근 불가</li>
              <li>이용자 PIN 은 bcrypt 단방향 해시로만 저장(평문 미보관)</li>
              <li>관리자/교사 역할 분리 및 반 단위 접근 통제</li>
              <li>HTTPS 전송 구간 암호화</li>
              <li>접근 권한 최소화 원칙</li>
            </ul>
          </li>
          <li>
            <strong>재위탁 시 사전 통지</strong>: 본 계약 제5조에 명시된 인프라
            외 새로운 재위탁이 필요한 경우, 위탁자에게 사전 통지하고 안전성
            확보 조치를 적용합니다.
          </li>
          <li>
            <strong>유출 통지</strong>: 개인정보 유출이 발생하거나 발생 우려가
            확인된 경우, 위탁자에게 <strong>지체 없이</strong> 통지하며 피해
            확산 방지 조치를 취합니다. 관련 법령상 신고 의무가 있는 경우 신고도
            수행합니다.
          </li>
          <li>
            <strong>계약 종료 시 데이터 처리</strong>: 본 계약이 종료되거나
            위탁자가 서비스 이용을 해지한 경우, 위탁자의 요청에 따라 위탁받은
            개인정보를 <strong>지체 없이 파기 또는 반환</strong>합니다.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "subprocessor",
    title: "5. 재위탁",
    body: (
      <>
        <p>
          수탁자는 본 서비스의 안정적 운영을 위해 다음 인프라 제공자를 재위탁자로
          이용합니다. 위탁자는 본 계약에 동의함으로써 아래 재위탁 관계에 동의한
          것으로 봅니다.
        </p>
        <ul>
          <li>
            <strong>클라우드 인프라 및 데이터베이스</strong>: [클라우드 제공자명]
            — 데이터 저장, 인증 토큰 발급, 백업, 네트워크 전송
          </li>
          <li>
            <strong>이메일 발송 서비스</strong>(필요 시): [메일 서비스 제공자명]
            — 가입 인증 메일 등
          </li>
        </ul>
        <p>
          수탁자는 위 재위탁자와 본 계약에 준하는 수준의 개인정보 보호 의무를
          포함하는 계약을 체결하며, 추가 재위탁이 필요한 경우 위탁자에게 사전
          통지합니다.
        </p>
      </>
    ),
  },
  {
    id: "safety",
    title: "6. 안전성 확보 조치 (요약)",
    body: (
      <>
        <p>수탁자는 다음의 기술적·관리적 조치를 시행합니다.</p>
        <ul>
          <li>
            <strong>교회 간 데이터 격리</strong> — DB 레벨 RLS(Row Level Security)
            정책으로 다른 교회의 row 에는 어떤 사용자도 접근할 수 없습니다.
          </li>
          <li>
            <strong>PIN 저장</strong> — 4자리 PIN 은 bcrypt 단방향 해시로만
            저장. 서버·DB·로그 어디에도 평문이 남지 않습니다.
          </li>
          <li>
            <strong>역할 기반 접근</strong> — 관리자(admin) 와 교사(teacher) 의
            권한을 분리. 교사는 자기에게 배정된 반의 데이터에만 접근 가능.
          </li>
          <li>
            <strong>최소 수집</strong> — 서비스 목적상 불필요한 식별정보는
            수집하지 않습니다.
          </li>
          <li>
            <strong>전송 구간 암호화</strong> — 모든 클라이언트–서버 통신을
            HTTPS 로 보호.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "liability",
    title: "7. 책임",
    body: (
      <>
        <p>
          본 계약상 의무 위반으로 인해 발생한 손해는 그 위반에 책임이 있는
          당사자가 부담합니다.
        </p>
        <ul>
          <li>
            위탁자의 부적절한 동의 확보, 잘못된 정보 입력, 계정 관리 부주의
            등으로 발생한 손해는 위탁자가 책임집니다.
          </li>
          <li>
            수탁자의 안전성 확보 조치 미흡, 목적 외 이용 등으로 발생한 손해는
            수탁자가 책임집니다.
          </li>
          <li>
            각 당사자는 자신의 귀책사유 없이 발생한 사고(예: 재위탁자 측의
            장애·사고)에 대해 그 한도에서 책임을 면합니다.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "term",
    title: "8. 계약 기간 및 종료",
    body: (
      <>
        <ul>
          <li>
            본 계약은 위탁자가 본 서비스에 가입하여 동의한 시점부터 효력이
            발생하며, 위탁자가 본 서비스를 이용하는 동안 유효합니다.
          </li>
          <li>
            위탁자가 본 서비스를 해지하거나 회원 탈퇴를 한 경우, 본 계약은
            자동으로 종료됩니다.
          </li>
          <li>
            계약 종료 시 수탁자는 <strong>지체 없이 위탁받은 개인정보를
            파기</strong>합니다. 위탁자의 요청이 있는 경우 안전한 방법으로
            데이터를 반환한 후 파기합니다.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "law",
    title: "9. 준거법 및 분쟁 해결",
    body: (
      <>
        <p>
          본 계약은 <strong>대한민국 법</strong>에 따라 해석되고 집행됩니다. 본
          계약과 관련하여 분쟁이 발생하는 경우, 당사자 간 협의로 해결하며,
          협의가 이루어지지 않을 때에는 민사소송법상 관할법원에 소를 제기할 수
          있습니다.
        </p>
        <p className="dpa-note">
          본 계약은 <code>2026-06-01</code> 버전의 동의 항목으로 가입 시 위탁자
          교회별로 체결 사실이 증빙으로 저장됩니다.
        </p>
      </>
    ),
  },
];

export default function DpaPage() {
  return (
    <main className="au-page">
      <div className="au-topbar">
        <Link href="/bible-reading">← 학생 페이지</Link>
        <Link href="/signup">회원가입으로</Link>
      </div>

      <article className="au-card dpa-card">
        <p className="au-eyebrow">법적 고지</p>
        <h1>데이터 처리 위탁 계약 (DPA)</h1>
        <p className="au-sub">
          본 계약은 본 서비스를 이용하는 교회(위탁자)와 당사(수탁자) 간
          개인정보 처리 위탁 관계를 정합니다. 가입 시 동의 항목을 통해 체결되며,
          당사의 <Link href="/privacy">개인정보처리방침</Link> 과 함께
          적용됩니다.
        </p>

        <nav className="dpa-toc" aria-label="목차">
          <p className="dpa-toc-title">목차</p>
          <ol>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="dpa-section">
            <h2>{s.title}</h2>
            <div className="dpa-body">{s.body}</div>
          </section>
        ))}

        <footer className="dpa-foot">
          <p>위탁자: 본 서비스에 가입한 교회</p>
          <p>
            수탁자: 마라나타 스튜디오 (대표 신승용) · 문의 petersin136@gmail.com
          </p>
        </footer>
      </article>

      <style jsx>{authStyles}</style>
      <style jsx>{`
        .dpa-card {
          max-width: 760px;
        }
        .dpa-toc {
          margin: 8px 0 18px;
          padding: 14px 16px;
          background: #f6f1e6;
          border: 1px solid #e0d5bb;
          border-radius: 12px;
        }
        .dpa-toc-title {
          margin: 0 0 6px;
          font-size: 11.5px;
          letter-spacing: 0.8px;
          color: #8a7c61;
          font-weight: 700;
          text-transform: uppercase;
        }
        .dpa-toc ol {
          margin: 0;
          padding-left: 20px;
          color: #4f4530;
          font-size: 13px;
          line-height: 1.95;
        }
        .dpa-toc a {
          color: #1e3a5f;
          text-decoration: none;
        }
        .dpa-toc a:hover {
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .dpa-section {
          padding-top: 14px;
          margin-top: 14px;
          border-top: 1px solid #ede4cf;
        }
        .dpa-section:first-of-type {
          border-top: none;
        }
        .dpa-section h2 {
          margin: 0 0 10px;
          font-size: 16px;
          color: #2c2417;
          font-weight: 700;
        }
        .dpa-body :global(p) {
          margin: 0 0 10px;
          font-size: 13.5px;
          line-height: 1.85;
          color: #2c2417;
        }
        .dpa-body :global(ul) {
          margin: 0 0 12px;
          padding-left: 20px;
        }
        .dpa-body :global(ul ul) {
          margin-top: 4px;
        }
        .dpa-body :global(li) {
          font-size: 13.5px;
          line-height: 1.85;
          color: #2c2417;
          margin-bottom: 4px;
        }
        .dpa-body :global(strong) {
          color: #1a1a1a;
        }
        .dpa-body :global(em) {
          color: #4f4530;
          font-style: normal;
          background: #f6f1e6;
          padding: 0 4px;
          border-radius: 4px;
        }
        .dpa-body :global(code) {
          background: #f6f1e6;
          padding: 1px 6px;
          border-radius: 4px;
          font-size: 12.5px;
          color: #4f4530;
        }
        .dpa-body :global(a) {
          color: #1e3a5f;
          text-decoration: underline;
          text-underline-offset: 2px;
          font-weight: 600;
        }
        .dpa-body :global(.dpa-note) {
          margin-top: 6px;
          padding: 8px 12px;
          background: #f6f1e6;
          border-left: 3px solid #1e3a5f;
          color: #4f4530;
          font-size: 12.5px;
          line-height: 1.7;
          border-radius: 0 6px 6px 0;
        }

        .dpa-foot {
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px solid #ede4cf;
          color: #6b5f47;
          font-size: 12.5px;
          line-height: 1.7;
        }
        .dpa-foot p {
          margin: 0;
        }
      `}</style>
    </main>
  );
}
