/**
 * 역할: 사용자 프로필 상태를 Zustand + localStorage 기반으로 관리합니다.
 *       기존 profileStore API(load/save/reset)와 useProfile 훅 형태를 유지합니다.
 * 위치: src\stores\profileStore.ts
 */
import { create } from "zustand";
import { auth } from "../lib/firebase";
import { trackBackgroundSync } from "../lib/firebaseBackgroundSync";
import { saveUserProfile } from "../lib/firebaseRepository";

export interface UserProfile {
  name: string;
  nickname: string;
  email: string;
  passwordChangedAt: string;
  avatarDataUrl: string | null;
  // 마지막 닉네임 변경 시각(ISO). 서버 callable updateNickname 가 갱신하며,
  // 24시간 쿨다운 UI 표시에 사용합니다. null/빈값이면 "한 번도 변경한 적 없음".
  nicknameChangedAt: string | null;
}

const STORAGE_KEY = "spendtrack:profile:v1";

export const DEFAULT_PROFILE: UserProfile = {
  name: "홍길동",
  nickname: "길동님",
  email: "hong@example.com",
  passwordChangedAt: "2025.02.10",
  avatarDataUrl: null,
  nicknameChangedAt: null,
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
  hydrate: (profile: UserProfile) => UserProfile;
}

const useProfileStoreBase = create<ProfileState>((set, get) => ({
  profile: ensureSeeded(),
  save: (partial) => {
    const next = { ...get().profile, ...partial };
    writeCurrent(next);
    set({ profile: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      // saveUserProfile 은 nickname 을 무시하도록 막혀 있습니다(정책: 닉네임은 callable 만).
      // 이 store 의 save 가 nickname 만 단독으로 호출되는 경우 Firestore 가 갱신되지 않아도
      // 의도된 동작입니다. 닉네임 변경은 changeNicknameWithCooldown(firebaseSync) 를 통해서만.
      trackBackgroundSync(saveUserProfile(uid, partial));
    }
    return next;
  },
  reset: () => {
    writeCurrent(DEFAULT_PROFILE);
    set({ profile: DEFAULT_PROFILE });
    const uid = auth.currentUser?.uid;
    if (uid) {
      trackBackgroundSync(saveUserProfile(uid, DEFAULT_PROFILE));
    }
    return DEFAULT_PROFILE;
  },
  hydrate: (profile) => {
    writeCurrent(profile);
    set({ profile });
    return profile;
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
  hydrate(profile: UserProfile): UserProfile {
    return useProfileStoreBase.getState().hydrate(profile);
  },
  subscribe(listener: (profile: UserProfile) => void): () => void {
    return useProfileStoreBase.subscribe((state) => listener(state.profile));
  },
};

export function useProfile(): UserProfile {
  return useProfileStoreBase((state) => state.profile);
}
