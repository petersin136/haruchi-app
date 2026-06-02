"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_SETTINGS,
  applySettingsToDOM,
  loadSettings,
  saveSettings,
  type UserSettings,
} from "../lib/userSettings";

type SettingsContextValue = {
  /** 현재 적용된 설정. SSR 단계에선 DEFAULT_SETTINGS 가 노출됨 (hydration mismatch 방지). */
  settings: UserSettings;
  /** 단일 키 업데이트. 부분 갱신 → DOM + localStorage 모두 반영. */
  update: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  /** 여러 키 동시 업데이트. */
  patch: (partial: Partial<UserSettings>) => void;
  /** 전체 초기화 — DEFAULT_SETTINGS 로 되돌림. */
  reset: () => void;
  /** hydration 이 끝나 localStorage 값이 반영됐는지. UI 진입 시점 가드용. */
  hydrated: boolean;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  // SSR 단계에선 DEFAULT 로 시작 → React 가 SSR markup 과 일치하는 markup 으로
  // 하이드레이션. 클라이언트에서 useEffect 가 localStorage 값을 끌어와
  // 실제 사용자 설정을 덮어쓴다.
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  // 첫 mount 에서 localStorage → state 동기화.
  // 인라인 init 스크립트가 이미 <html> 에 CSS 변수를 박아둔 상태라 깜빡임은 없다.
  // 여기서는 state 만 일치시킨다.
  useEffect(() => {
    const next = loadSettings();
    setSettings(next);
    // 혹시 init 스크립트가 누락된 환경(예: 광고차단/스니펫 차단)이면 여기서 한 번 더.
    applySettingsToDOM(next);
    setHydrated(true);
  }, []);

  const commit = useCallback((next: UserSettings) => {
    setSettings(next);
    applySettingsToDOM(next);
    saveSettings(next);
  }, []);

  const update = useCallback<SettingsContextValue["update"]>(
    (key, value) => {
      commit({ ...settings, [key]: value });
    },
    [commit, settings],
  );

  const patch = useCallback<SettingsContextValue["patch"]>(
    (partial) => {
      commit({ ...settings, ...partial });
    },
    [commit, settings],
  );

  const reset = useCallback(() => {
    commit(DEFAULT_SETTINGS);
  }, [commit]);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, update, patch, reset, hydrated }),
    [settings, update, patch, reset, hydrated],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used inside <SettingsProvider>");
  }
  return ctx;
}
