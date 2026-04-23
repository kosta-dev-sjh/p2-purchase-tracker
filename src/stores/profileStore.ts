/**
 * 역할: 사용자 프로필 상태를 Zustand + localStorage 기반으로 관리합니다.
 *       기존 profileStore API(load/save/reset)와 useProfile 훅 형태를 유지합니다.
 * 위치: src\stores\profileStore.ts
 */
import { create } from "zustand";

export interface UserProfile {
  name: string;
  nickname: string;
  email: string;
  passwordChangedAt: string;
  avatarDataUrl: string | null;
}

const STORAGE_KEY = "spendtrack:profile:v1";

const DEFAULT_PROFILE: UserProfile = {
  name: "홍길동",
  nickname: "길동님",
  email: "hong@example.com",
  passwordChangedAt: "2025.02.10",
  avatarDataUrl: null,
};

function readCurrent(): UserProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return { ...DEFAULT_PROFILE, ...parsed };
  } catch {
    return null;
  }
}

function writeCurrent(profile: UserProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

function ensureSeeded(): UserProfile {
  const existing = readCurrent();
  if (existing) return existing;
  writeCurrent(DEFAULT_PROFILE);
  return DEFAULT_PROFILE;
}

interface ProfileState {
  profile: UserProfile;
  save: (partial: Partial<UserProfile>) => UserProfile;
  reset: () => UserProfile;
}

const useProfileStoreBase = create<ProfileState>((set, get) => ({
  profile: ensureSeeded(),
  save: (partial) => {
    const next = { ...get().profile, ...partial };
    writeCurrent(next);
    set({ profile: next });
    return next;
  },
  reset: () => {
    writeCurrent(DEFAULT_PROFILE);
    set({ profile: DEFAULT_PROFILE });
    return DEFAULT_PROFILE;
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      useProfileStoreBase.setState({ profile: ensureSeeded() });
    }
  });
}

export const profileStore = {
  load(): UserProfile {
    return useProfileStoreBase.getState().profile;
  },
  save(partial: Partial<UserProfile>): UserProfile {
    return useProfileStoreBase.getState().save(partial);
  },
  reset(): UserProfile {
    return useProfileStoreBase.getState().reset();
  },
  subscribe(listener: (profile: UserProfile) => void): () => void {
    return useProfileStoreBase.subscribe((state) => listener(state.profile));
  },
};

export function useProfile(): UserProfile {
  return useProfileStoreBase((state) => state.profile);
}
