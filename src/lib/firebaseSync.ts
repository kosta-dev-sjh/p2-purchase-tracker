import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./firebase";
import { authStore } from "../stores/authStore";
import { normalizeAuthError } from "./authError";
import { categoriesStore, DEFAULT_CATEGORIES } from "../stores/categoriesStore";
import { profileStore, DEFAULT_PROFILE } from "../stores/profileStore";
import { transactionsStore } from "../stores/transactionsStore";
import { aiInsightsStore } from "../stores/aiInsightsStore";
import {
  bootstrapCategories,
  bootstrapUserProfile,
  saveUserProfile,
  subscribeCategories,
  subscribeTransactions,
  subscribeUserProfile,
} from "./firebaseRepository";

let started = false;

export type AccountDeletionProvider = "password" | "google.com" | "session";

interface DeleteAccountRequest {
  reauthProvider?: string;
  reason?: string;
}

interface DeleteAccountResponse {
  ok: boolean;
  logId: string;
  status: "scheduled";
  purgeAt: string;
  graceDays: number;
}

interface RestorePendingDeletionResponse {
  status: "noop" | "restored" | "purged";
  logId?: string;
  purgeAt?: string | null;
  restoredAt?: string;
}

interface UpdateNicknameRequest {
  nickname: string;
}

interface UpdateNicknameResponse {
  ok: true;
  changed: boolean;
  nickname: string;
  nicknameChangedAt: string | null;
  cooldownHours: number;
}

const deleteAccountCallable = httpsCallable<DeleteAccountRequest, DeleteAccountResponse>(
  functions,
  "deleteAccount",
);
const restorePendingDeletionCallable = httpsCallable<Record<string, never>, RestorePendingDeletionResponse>(
  functions,
  "restorePendingDeletion",
);
const updateNicknameCallable = httpsCallable<UpdateNicknameRequest, UpdateNicknameResponse>(
  functions,
  "updateNickname",
);

function resetLocalState(): void {
  profileStore.hydrate({ ...DEFAULT_PROFILE });
  categoriesStore.hydrate([...DEFAULT_CATEGORIES]);
  transactionsStore.hydrate([]);
  // 직전 사용자의 거래 패턴이 함축된 AI 인사이트 캐시와 학습 캐시도 비웁니다.
  // 같은 단말에서 다른 계정으로 로그인하는 경우 이전 사용자 데이터가 새 화면에 새지 않게 하는 게 목적.
  aiInsightsStore.clear();
  transactionsStore.clearLearnedCaches();
}

async function ensureBootstrap(user: User): Promise<void> {
  await bootstrapUserProfile(user, {
    email: user.email ?? "",
    name: user.displayName ?? DEFAULT_PROFILE.name,
  });
  await bootstrapCategories(user.uid, DEFAULT_CATEGORIES);
}

function createCodedError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

export function getAccountDeletionProvider(
  user: User | null = auth.currentUser,
): AccountDeletionProvider {
  if (!user) return "session";
  const providerIds = user.providerData.map((item) => item.providerId);
  if (providerIds.includes("password")) return "password";
  if (providerIds.includes("google.com")) return "google.com";
  return "session";
}

async function reauthenticateForDeletion(
  user: User,
  password?: string,
): Promise<AccountDeletionProvider> {
  const provider = getAccountDeletionProvider(user);
  if (provider === "password") {
    if (!password) {
      throw createCodedError("auth/missing-password", "현재 비밀번호를 입력해 주세요.");
    }
    if (!user.email) {
      throw createCodedError("auth/missing-email", "이 계정에는 이메일 정보가 없습니다.");
    }
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
    return provider;
  }
  if (provider === "google.com") {
    await reauthenticateWithPopup(user, new GoogleAuthProvider());
    return provider;
  }
  return provider;
}

async function restorePendingDeletionIfNeeded(): Promise<RestorePendingDeletionResponse> {
  const result = await restorePendingDeletionCallable({});
  return result.data;
}

export function startFirebaseSync(): void {
  if (started) return;
  started = true;
  authStore.setLoading();

  let stopProfile: (() => void) | null = null;
  let stopCategories: (() => void) | null = null;
  let stopTransactions: (() => void) | null = null;

  onAuthStateChanged(auth, async (user) => {
    stopProfile?.();
    stopCategories?.();
    stopTransactions?.();
    stopProfile = null;
    stopCategories = null;
    stopTransactions = null;

    try {
      if (!user) {
        authStore.setUnauthenticated();
        authStore.clearError();
        resetLocalState();
        return;
      }

      authStore.setAuthenticated(user);
      await ensureBootstrap(user);
      const restoreResult = await restorePendingDeletionIfNeeded();
      if (restoreResult.status === "purged") {
        await signOut(auth);
        return;
      }

      stopProfile = subscribeUserProfile(user.uid, (partial) => {
        profileStore.hydrate({ ...DEFAULT_PROFILE, ...partial });
      });
      stopCategories = subscribeCategories(user.uid, (items) => {
        categoriesStore.hydrate(items.length > 0 ? items : [...DEFAULT_CATEGORIES]);
      });
      stopTransactions = subscribeTransactions(user.uid, (rows) => {
        transactionsStore.hydrate(rows);
      });
    } catch (error) {
      const normalized = normalizeAuthError(error, "auth-session");
      authStore.setError(normalized.message);
      authStore.setUnauthenticated();
      resetLocalState();
      try {
        await signOut(auth);
      } catch {
        // 이미 세션이 정리된 경우는 무시합니다.
      }
    }
  });
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signInWithGoogle(): Promise<void> {
  // popup 방식 사용. signInWithRedirect 는 시장 표준이지만 localhost 개발 환경처럼
  // authDomain 과 origin 이 다른 환경에선 third-party storage 격리 때문에 redirect
  // 결과가 픽업 안 되는 케이스가 있어, 안정성을 위해 popup 으로 유지합니다.
  // (참고: COOP 콘솔 경고는 Firebase JS SDK known issue #8061 — 동작에 영향 없음)
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
}

export async function registerAccount(payload: {
  name: string;
  email: string;
  password: string;
}): Promise<void> {
  const cred = await createUserWithEmailAndPassword(auth, payload.email, payload.password);
  if (payload.name.trim()) {
    await updateProfile(cred.user, { displayName: payload.name.trim() });
  }
  await bootstrapUserProfile(cred.user, {
    name: payload.name.trim() || DEFAULT_PROFILE.name,
    nickname: payload.name.trim() || DEFAULT_PROFILE.nickname,
    email: payload.email.trim(),
    passwordChangedAt: DEFAULT_PROFILE.passwordChangedAt,
    avatarDataUrl: null,
  });
  // onAuthStateChanged가 displayName=null 상태에서 먼저 실행되면 bootstrapUserProfile이
  // DEFAULT_PROFILE("홍길동")로 문서를 쓰고, 이후 호출은 문서가 존재해 스킵됩니다.
  // saveUserProfile(merge:true)로 올바른 이름을 항상 덮어씁니다.
  await saveUserProfile(cred.user.uid, {
    name: payload.name.trim() || DEFAULT_PROFILE.name,
    nickname: payload.name.trim() || DEFAULT_PROFILE.nickname,
  });
  await bootstrapCategories(cred.user.uid, DEFAULT_CATEGORIES);
  transactionsStore.hydrate([]);
}

export async function logOut(): Promise<void> {
  await signOut(auth);
}

/**
 * 입력한 이메일 주소로 Firebase 가 비밀번호 재설정 메일을 발송하도록 요청합니다.
 *
 * - Firebase 콘솔의 Authentication > Templates 에서 한국어 템플릿을 사용 중이라면
 *   `auth.languageCode = "ko"` 를 지정해 주는 편이 안정적입니다(브라우저 언어와 무관하게
 *   사용자에게 한국어 메일이 전달되도록 하는 보호장치).
 * - 보안을 위해 가입되지 않은 이메일이어도 이 함수는 동일하게 성공으로 보이도록
 *   `auth/user-not-found` 를 호출하는 쪽(폼)에서 흡수합니다.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  auth.languageCode = "ko";
  await sendPasswordResetEmail(auth, email);
}

export async function changeCurrentPassword(
  nextPassword: string,
  currentPassword?: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw createCodedError("auth/no-current-user", "로그인 상태가 아니어서 비밀번호를 변경할 수 없습니다.");
  }

  const provider = getAccountDeletionProvider(user);
  if (provider === "password") {
    if (!currentPassword) {
      throw createCodedError("auth/missing-password", "현재 비밀번호를 입력해 주세요.");
    }
    if (!user.email) {
      throw createCodedError("auth/missing-email", "이 계정에는 이메일 정보가 없습니다.");
    }
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
  } else if (provider === "google.com") {
    await reauthenticateWithPopup(user, new GoogleAuthProvider());
  } else {
    throw createCodedError(
      "auth/unsupported-provider",
      "이 로그인 방식에서는 비밀번호를 직접 변경할 수 없습니다.",
    );
  }

  await updatePassword(user, nextPassword);
}

/**
 * 닉네임 변경. 서버 callable `updateNickname` 만이 nickname 필드를 갱신할 수 있고,
 * 그 함수가 24시간 쿨다운을 트랜잭션으로 검사합니다.
 *
 * - 성공 시 onSnapshot 이 곧바로 새 nickname/nicknameChangedAt 을 흘려보내 store 를 갱신.
 * - 쿨다운 위반은 `functions/resource-exhausted` 코드로 던져집니다. 호출부가 catch 해서
 *   사용자에게 남은 시간을 보여 줍니다.
 */
export interface ChangeNicknameError extends Error {
  code?: string;
  retryAfterMs?: number;
  nextAvailableAt?: string;
}

export async function changeNicknameWithCooldown(
  nickname: string,
): Promise<UpdateNicknameResponse> {
  try {
    const result = await updateNicknameCallable({ nickname });
    return result.data;
  } catch (error) {
    const err = error as { code?: string; message?: string; details?: unknown };
    const wrapped = new Error(err.message ?? "닉네임을 변경하지 못했어요.") as ChangeNicknameError;
    wrapped.code = err.code;
    if (err.details && typeof err.details === "object") {
      const details = err.details as { retryAfterMs?: number; nextAvailableAt?: string };
      if (typeof details.retryAfterMs === "number") wrapped.retryAfterMs = details.retryAfterMs;
      if (typeof details.nextAvailableAt === "string") wrapped.nextAvailableAt = details.nextAvailableAt;
    }
    throw wrapped;
  }
}

export async function deleteCurrentAccount(password?: string): Promise<DeleteAccountResponse> {
  const user = auth.currentUser;
  if (!user) {
    throw createCodedError("auth/no-current-user", "로그인 상태가 아니어서 계정을 삭제할 수 없습니다.");
  }

  const reauthProvider = await reauthenticateForDeletion(user, password);
  const result = await deleteAccountCallable({
    reauthProvider,
    reason: "self-service",
  });
  await signOut(auth);
  return result.data;
}
