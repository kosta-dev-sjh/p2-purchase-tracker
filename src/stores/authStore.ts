import { create } from "zustand";
import type { User } from "firebase/auth";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  user: User | null;
  error: string | null;
  setLoading: () => void;
  setAuthenticated: (user: User) => void;
  setUnauthenticated: () => void;
  setError: (message: string | null) => void;
  clearError: () => void;
}

const useAuthStoreBase = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  error: null,
  setLoading: () => set({ status: "loading", error: null }),
  setAuthenticated: (user) => set({ status: "authenticated", user, error: null }),
  setUnauthenticated: () => set({ status: "unauthenticated", user: null }),
  setError: (message) => set({ error: message }),
  clearError: () => set({ error: null }),
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
  setError(message: string | null): void {
    useAuthStoreBase.getState().setError(message);
  },
  clearError(): void {
    useAuthStoreBase.getState().clearError();
  },
  load(): Pick<AuthState, "status" | "user" | "error"> {
    const { status, user, error } = useAuthStoreBase.getState();
    return { status, user, error };
  },
};

export function useAuthSession(): AuthState {
  return useAuthStoreBase();
}
