"use client";

/**
 * EnglishOnlyView — "성경 공부" 모드의 단일 역본(영어 WEB) 읽기 뷰.
 *
 * 기존 한국어 reader 가 책별 데이터(BOOK_DATA) 에서 영어를 지원하지 않기 때문에,
 * 영어 모드만 본 파일이 직접 app/bible-study/romans1.json 의 english 레이어를
 * 한 줄씩 렌더링한다. 범위는 로마서 1장만(요구사항).
 *
 * 디자인:
 *   - 부모 .brp-reader 카드 안에 임베드되어 동일한 폭/여백/폰트를 상속.
 *   - 절 번호(.brp-verse-number 톤) + 본문 한 줄. 절별 복사 버튼.
 *   - 라이선스 푸터 한 줄.
 */

import { useCallback, useEffect, useState } from "react";
import rawData from "../romans1.json";

type StudyDataMinimal = {
  book: string;
  chapter: number;
  verses: Array<{
    ref: string;
    layers: {
      english?: { type: "text"; content: string };
    };
  }>;
};

const data = rawData as unknown as StudyDataMinimal;

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 15V5a2 2 0 0 1 2-2h8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function EnglishOnlyView() {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const handleCopy = useCallback(async (ref: string, text: string) => {
    const ok = await writeClipboard(`${ref}\n${text}`);
    setToast(ok ? `${ref} 복사됨` : "복사에 실패했어요");
  }, []);

  const verses = data.verses
    .map((v) => ({
      n: parseInt(v.ref.split(":").pop() || "0", 10),
      ref: v.ref,
      text: (v.layers.english?.content || "").trim(),
    }))
    .filter((v) => v.text);

  return (
    <section className="eov" aria-label="로마서 1장 영어(WEB)">
      <ol className="eov-verses">
        {verses.map((v) => (
          <li key={v.n} className="eov-verse">
            <div className="eov-row">
              <span className="eov-num" aria-hidden="true">
                {v.n}
              </span>
              <p className="eov-text" lang="en">
                {v.text}
              </p>
              <button
                type="button"
                className="eov-copy"
                onClick={() => handleCopy(v.ref, v.text)}
                aria-label={`${v.ref} 복사`}
                title="복사"
              >
                <CopyIcon />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <footer className="eov-footer">
        <small>
          영어 World English Bible (WEB, 퍼블릭 도메인) — 다른 번역으로 바꾸려면
          오른쪽 메뉴의 드롭다운을 사용하세요.
        </small>
      </footer>

      {toast && (
        <div className="eov-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      <style jsx>{`
        .eov {
          color: var(--ink, #16161a);
          font-family: var(--reader-font-family, inherit);
          font-size: 16px;
        }
        .eov-verses {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
        }
        .eov-verse {
          padding: 10px 0;
          border-bottom: 1px solid var(--line, #e6e6e2);
        }
        .eov-verse:last-child {
          border-bottom: none;
        }
        .eov-row {
          display: grid;
          grid-template-columns: 2em minmax(0, 1fr) 30px;
          column-gap: clamp(8px, 1vw, 12px);
          align-items: baseline;
        }
        .eov-num {
          color: var(--ink-mute, #9a9aa0);
          font-size: 0.92em;
          font-weight: 400;
          line-height: inherit;
          text-align: center;
          font-variant-numeric: tabular-nums;
        }
        .eov-text {
          margin: 0;
          font: inherit;
          line-height: 1.62;
          word-break: normal;
          overflow-wrap: break-word;
        }
        .eov-copy {
          appearance: none;
          align-self: center;
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid transparent;
          border-radius: 7px;
          background: transparent;
          color: var(--ink-mute, #9a9aa0);
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.15s ease, background 0.15s ease,
            border-color 0.15s ease, color 0.15s ease;
        }
        .eov-verse:hover .eov-copy,
        .eov-copy:focus-visible {
          opacity: 1;
        }
        .eov-copy:hover {
          color: var(--accent, #2e5d4b);
          background: color-mix(in srgb, var(--accent, #2e5d4b) 7%, transparent);
          border-color: color-mix(in srgb, var(--accent, #2e5d4b) 35%, transparent);
        }
        /* 모바일 — hover 가 없으므로 복사 버튼은 항상 옅게 표시. */
        @media (hover: none) {
          .eov-copy {
            opacity: 0.55;
          }
        }
        .eov-footer {
          margin-top: 18px;
          padding-top: 12px;
          border-top: 1px dashed var(--line, #e6e6e2);
          color: var(--ink-mute, #9a9aa0);
          font-size: 11.5px;
          line-height: 1.6;
        }
        .eov-toast {
          position: fixed;
          left: 50%;
          bottom: 40px;
          transform: translateX(-50%);
          z-index: 60;
          background: var(--ink, #16161a);
          color: var(--bg, #fff);
          padding: 9px 18px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22);
          pointer-events: none;
          white-space: nowrap;
        }
      `}</style>
    </section>
  );
}
