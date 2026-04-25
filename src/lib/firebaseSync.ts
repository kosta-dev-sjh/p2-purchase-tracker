import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
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
  await bootstrapCategories(cred.user.uid, DEFAULT_CATEGORIES);
  transactionsStore.hydrate([]);
}

export async function logOut(): Promise<void> {
  await signOut(auth);
}
