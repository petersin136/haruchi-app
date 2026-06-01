import type { Metadata } from "next";
import Link from "next/link";
import Wordmark from "../components/Wordmark";

export const metadata: Metadata = {
  title: "하루치 — 어른용",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="au-shell">
      <div className="au-wordmark-bar">
        <Link href="/bible-reading" className="au-wordmark-link" aria-label="하루치 홈으로">
          <Wordmark size="md" />
        </Link>
      </div>
      <div className="au-shell-body">{children}</div>
    </div>
  );
}
