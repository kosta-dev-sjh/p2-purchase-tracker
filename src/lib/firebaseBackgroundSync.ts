import { normalizeSessionSyncError } from "./authError";
import { authStore } from "../stores/authStore";

export function reportBackgroundSyncIssue(error: unknown): void {
  authStore.setSyncIssue(normalizeSessionSyncError(error));
}

export function clearBackgroundSyncIssue(): void {
  authStore.clearSyncIssue();
}

export function trackBackgroundSync(task: Promise<unknown>): void {
  void task.catch((error) => {
    reportBackgroundSyncIssue(error);
  });
}
