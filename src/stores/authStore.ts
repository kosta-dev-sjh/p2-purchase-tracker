import { create } from "zustand";
import type { User } from "firebase/auth";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  user: User | null;
  setLoading: () => void;
  setAuthenticated: (user: User) => void;
  setUnauthenticated: () => void;
}

const useAuthStoreBase = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  setLoading: () => set({ status: "loading" }),
  setAuthenticated: (user) => set({ status: "authenticated", user }),
  setUnauthenticated: () => set({ status: "unauthenticated", user: null }),
}));

export const authStore = {
  setLoading(): void {
    useAuthStoreBase.getState().setLoading();
  },
  setAuthenticated(user: User): void {
    useAuthStoreBase.getState().setAuthenticated(user);
  },
  setUnauthenticated(): void {
    useAuthStoreBase.getState().setUnauthenticated();
  },
  load(): Pick<AuthState, "status" | "user"> {
    const { status, user } = useAuthStoreBase.getState();
    return { status, user };
  },
};

export function useAuthSession(): AuthState {
  return useAuthStoreBase();
}
