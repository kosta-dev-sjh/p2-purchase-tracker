import { create } from "zustand";
import type { User } from "firebase/auth";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthSyncIssue {
  code: string;
  message: string;
  retriable: boolean;
}

interface AuthState {
  status: AuthStatus;
  user: User | null;
  error: string | null;
  syncIssue: AuthSyncIssue | null;
  setLoading: () => void;
  setAuthenticated: (user: User) => void;
  setUnauthenticated: () => void;
  setError: (message: string | null) => void;
  clearError: () => void;
  setSyncIssue: (issue: AuthSyncIssue | null) => void;
  clearSyncIssue: () => void;
}

const useAuthStoreBase = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  error: null,
  syncIssue: null,
  setLoading: () => set({ status: "loading", error: null, syncIssue: null }),
  setAuthenticated: (user) => set({ status: "authenticated", user, error: null }),
  setUnauthenticated: () => set({ status: "unauthenticated", user: null, syncIssue: null }),
  setError: (message) => set({ error: message }),
  clearError: () => set({ error: null }),
  setSyncIssue: (issue) => set({ syncIssue: issue }),
  clearSyncIssue: () => set({ syncIssue: null }),
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
  setSyncIssue(issue: AuthSyncIssue | null): void {
    useAuthStoreBase.getState().setSyncIssue(issue);
  },
  clearSyncIssue(): void {
    useAuthStoreBase.getState().clearSyncIssue();
  },
  load(): Pick<AuthState, "status" | "user" | "error" | "syncIssue"> {
    const { status, user, error, syncIssue } = useAuthStoreBase.getState();
    return { status, user, error, syncIssue };
  },
};

export function useAuthSession(): AuthState {
  return useAuthStoreBase();
}
