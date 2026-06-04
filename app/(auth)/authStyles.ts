// /signup, /login, /invite, /privacy, /dpa 등 어른용 인증 화면 공통 스타일.
// 값은 모두 app/styles/tokens.ts (= globals.css :root) 의 CSS 변수를 참조.
// 페이지별 추가 톤은 각 파일 안의 <style jsx> 블록에서 따로 정의.
export const authStyles = `
  .au-page {
    min-height: 100vh;
    background: var(--bg);
    color: var(--ink);
    padding: 0 var(--space-4);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .au-topbar {
    width: 100%;
    max-width: 520px;
    margin: var(--space-4) auto 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
  }
  .au-topbar a {
    color: var(--ink-soft);
    font-size: 14px;
    line-height: 1.5;
    text-decoration: none;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    transition: color 0.15s ease, background 0.15s ease;
  }
  .au-topbar a:hover {
    color: var(--ink);
    background: var(--surface-alt);
  }
  .au-card {
    width: 100%;
    max-width: 520px;
    margin: var(--space-6) auto var(--space-7);
    padding: var(--space-6) var(--space-6);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-1);
    box-sizing: border-box;
  }
  .au-eyebrow {
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-soft);
    font-weight: 600;
    margin: 0 0 var(--space-2);
  }
  .au-card h1 {
    margin: 0 0 var(--space-3);
    font-size: 24px;
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  .au-sub {
    margin: 0 0 var(--space-5);
    color: var(--ink-soft);
    font-size: 15px;
    line-height: 1.6;
  }
  .au-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .au-field > span {
    font-size: 13px;
    color: var(--ink-soft);
    font-weight: 500;
  }
  .au-field input,
  .au-field textarea {
    height: var(--ctrl-h);
    padding: 0 var(--ctrl-px);
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    border-radius: var(--radius-md);
    font-size: 15px;
    outline: none;
    font-family: inherit;
    line-height: 1.4;
    box-sizing: border-box;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .au-field textarea {
    height: auto;
    padding: var(--space-3) var(--ctrl-px);
    min-height: 96px;
    resize: vertical;
  }
  .au-field input::placeholder,
  .au-field textarea::placeholder {
    color: var(--ink-faint);
  }
  .au-field input:focus,
  .au-field textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  /* 비밀번호 입력 + 눈 아이콘 토글 래퍼 */
  .au-password {
    position: relative;
    display: flex;
    align-items: stretch;
  }
  .au-password input {
    width: 100%;
    padding-right: 44px;
  }
  .au-password-toggle {
    position: absolute;
    top: 50%;
    right: 4px;
    transform: translateY(-50%);
    width: 40px;
    height: calc(var(--ctrl-h) - 8px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--ink-soft);
    cursor: pointer;
    padding: 0;
    font: inherit;
    transition: color 0.15s ease, background 0.15s ease;
  }
  .au-password-toggle:hover {
    color: var(--ink);
    background: var(--surface-alt);
  }
  .au-password-toggle:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .au-consent-list {
    margin: var(--space-3) 0 var(--space-4);
    padding: var(--space-4);
    background: var(--surface-alt);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .au-consent-intro {
    margin: 0 0 var(--space-2);
    font-size: 13px;
    color: var(--ink-soft);
    line-height: 1.65;
  }
  .au-consent-intro code {
    background: var(--surface);
    border: 1px solid var(--line);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    font-size: 12px;
  }
  .au-consent {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-3);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    align-items: flex-start;
  }
  .au-consent input {
    margin-top: 3px;
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
    flex-shrink: 0;
    cursor: pointer;
  }
  .au-consent label {
    font-size: 14px;
    color: var(--ink);
    line-height: 1.6;
    cursor: pointer;
  }
  .au-primary {
    width: 100%;
    height: var(--ctrl-h);
    padding: 0 var(--btn-px);
    background: var(--accent);
    color: var(--accent-ink);
    border: none;
    border-radius: var(--radius-md);
    font-weight: 600;
    cursor: pointer;
    font-size: 15px;
    margin-top: var(--space-2);
    font-family: inherit;
    transition: background 0.15s ease;
  }
  .au-primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .au-primary:disabled {
    background: var(--line);
    color: var(--ink-faint);
    cursor: not-allowed;
  }
  .au-secondary {
    width: 100%;
    margin-top: var(--space-3);
    height: var(--ctrl-h);
    padding: 0 var(--btn-px);
    background: transparent;
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    text-align: center;
    transition: background 0.15s ease;
  }
  .au-secondary:hover {
    background: var(--surface-alt);
  }
  .au-foot {
    text-align: center;
    margin-top: var(--space-4);
    font-size: 13px;
    color: var(--ink-soft);
  }
  .au-foot a {
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
  }
  .au-foot a:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .au-error {
    margin: var(--space-3) 0 var(--space-1);
    padding: var(--space-3);
    background: var(--danger-soft);
    border: 1px solid var(--danger);
    border-radius: var(--radius-md);
    color: var(--danger);
    font-size: 13.5px;
    line-height: 1.55;
    white-space: pre-line;
  }
  .au-info {
    margin: var(--space-3) 0 var(--space-1);
    padding: var(--space-3);
    background: var(--success-soft);
    border: 1px solid var(--success);
    border-radius: var(--radius-md);
    color: var(--success);
    font-size: 13.5px;
    line-height: 1.55;
  }
  .au-hint {
    margin-top: var(--space-4);
    font-size: 12.5px;
    color: var(--ink-soft);
    line-height: 1.7;
  }
  .au-hint code {
    background: var(--surface-alt);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    font-size: 12px;
    color: var(--ink);
  }
`;
