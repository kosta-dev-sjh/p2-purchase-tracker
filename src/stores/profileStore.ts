/**
 * 역할: 사용자 프로필(이름/닉네임/이메일/비밀번호 변경시각/아바타)을 localStorage에
 *       보관하는 간이 스토어. transactionsStore와 동일한 pub/sub 패턴을 써서
 *       Settings 페이지 어느 섹션에서든 동기적으로 최신 값을 읽고 바꿀 수 있게 합니다.
 *       Firestore 연동 시 이 모듈만 교체하면 되도록 API 표면을 단순하게 유지합니다.
 * 위치: src\stores\profileStore.ts
 */
import { useEffect, useState } from "react";

export interface UserProfile {
  name: string;
  nickname: string;
  email: string;
  passwordChangedAt: string; // 표시용 문자열. 실제 비밀번호는 저장하지 않습니다.
  avatarDataUrl: string | null; // base64 data URL. 데모 단계라 파일 서버 없이 브라우저 안에서 완결되도록 함.
}

const STORAGE_KEY = "spendtrack:profile:v1";

const DEFAULT_PROFILE: UserProfile = {
  name: "홍길동",
  nickname: "길동님",
  email: "hong@example.com",
  passwordChangedAt: "2025.02.10",
  avatarDataUrl: null,
};

type Listener = (profile: UserProfile) => void;
const listeners = new Set<Listener>();

function readRaw(): UserProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    // 누락된 필드는 기본값으로 채웁니다. 스키마를 추가해도 이전 저장본이 깨지지 않도록.
    return { ...DEFAULT_PROFILE, ...parsed };
  } catch {
    return null;
  }
}

function writeRaw(profile: UserProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  listeners.forEach((listener) => listener(profile));
}

function ensureSeeded(): UserProfile {
  const existing = readRaw();
  if (existing) return existing;
  writeRaw(DEFAULT_PROFILE);
  return DEFAULT_PROFILE;
}

export const profileStore = {
  load(): UserProfile {
    return ensureSeeded();
  },
  save(partial: Partial<UserProfile>): UserProfile {
    const current = ensureSeeded();
    const next = { ...current, ...partial };
    writeRaw(next);
    return next;
  },
  reset(): UserProfile {
    writeRaw(DEFAULT_PROFILE);
    return DEFAULT_PROFILE;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/**
 * React 훅. 컴포넌트가 마운트되는 동안 프로필을 구독해서
 * 다른 섹션에서의 변경을 자동으로 반영합니다.
 */
export function useProfile(): UserProfile {
  const [profile, setProfile] = useState<UserProfile>(() => profileStore.load());
  useEffect(() => profileStore.subscribe(setProfile), []);
  return profile;
}
