import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";
import { authStore } from "../stores/authStore";
import { categoriesStore, DEFAULT_CATEGORIES } from "../stores/categoriesStore";
import { profileStore, DEFAULT_PROFILE } from "../stores/profileStore";
import { transactionsStore } from "../stores/transactionsStore";
import {
  bootstrapCategories,
  bootstrapUserProfile,
  saveUserProfile,
  subscribeCategories,
  subscribeTransactions,
  subscribeUserProfile,
} from "./firebaseRepository";

let started = false;

function resetLocalState(): void {
  profileStore.hydrate({ ...DEFAULT_PROFILE });
  categoriesStore.hydrate([...DEFAULT_CATEGORIES]);
  transactionsStore.hydrate([]);
}

async function ensureBootstrap(user: User): Promise<void> {
  await bootstrapUserProfile(user, {
    email: user.email ?? "",
    name: user.displayName ?? DEFAULT_PROFILE.name,
  });
  await bootstrapCategories(user.uid, DEFAULT_CATEGORIES);
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

    if (!user) {
      authStore.setUnauthenticated();
      resetLocalState();
      return;
    }

    authStore.setAuthenticated(user);
    await ensureBootstrap(user);

    stopProfile = subscribeUserProfile(user.uid, (partial) => {
      profileStore.hydrate({ ...DEFAULT_PROFILE, ...partial });
    });
    stopCategories = subscribeCategories(user.uid, (items) => {
      categoriesStore.hydrate(items.length > 0 ? items : [...DEFAULT_CATEGORIES]);
    });
    stopTransactions = subscribeTransactions(user.uid, (rows) => {
      transactionsStore.hydrate(rows);
    });
  });
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signInWithGoogle(): Promise<void> {
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

