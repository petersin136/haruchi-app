"use client";

import Link from "next/link";
import "./bottom-tab.css";

export type BottomTabId = "bible" | "plan" | "prayer";

const TABS = [
  { id: "bible" as const, href: "/bible-reading", label: "성경", Icon: BibleIcon },
  { id: "plan" as const, href: "/plan", label: "읽기표", Icon: PlanIcon },
  { id: "prayer" as const, href: "/prayer", label: "기도", Icon: PrayerIcon },
];

const iconProps = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function BibleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...iconProps}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
      <path d="M4 5.5V21.5" />
      <path d="M8 8h8" />
      <path d="M8 12h6" />
    </svg>
  );
}

function PlanIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...iconProps}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3.5v3" />
      <path d="M16 3.5v3" />
      <path d="M3.5 10h17" />
      <path d="M8 14h3" />
      <path d="M13 14h3" />
      <path d="M8 17h3" />
    </svg>
  );
}

function PrayerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...iconProps}>
      <path d="M12 4v7" />
      <path d="M9 7.5c0-1.8 1.3-3.5 3-3.5s3 1.7 3 3.5" />
      <path d="M7 14c0-2.2 2.2-4 5-4s5 1.8 5 4v5H7z" />
      <path d="M9.5 19v1.5" />
      <path d="M14.5 19v1.5" />
    </svg>
  );
}

export default function BottomTabBar({ active }: { active: BottomTabId }) {
  return (
    <nav className="brp-tabbar" aria-label="주요 메뉴">
      {TABS.map((tab) => {
        const on = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`brp-tabbar-item${on ? " is-active" : ""}`}
            aria-current={on ? "page" : undefined}
          >
            <tab.Icon />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
