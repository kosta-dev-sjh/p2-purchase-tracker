import type { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import type { TxRow } from "../pages/Transactions/components/TransactionTable";
import type { UserProfile } from "../stores/profileStore";
import type { CategoryEntry } from "../stores/categoriesStore";
import { db } from "./firebase";

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)]),
    ) as T;
  }
  return value;
}

const usersCol = collection(db, "users");

function userDoc(uid: string) {
  return doc(usersCol, uid);
}

function transactionsCol(uid: string) {
  return collection(db, "users", uid, "transactions");
}

function categoriesCol(uid: string) {
  return collection(db, "users", uid, "categories");
}

export async function bootstrapUserProfile(
  user: User,
  seed?: Partial<UserProfile>,
): Promise<void> {
  const ref = userDoc(user.uid);
  const snap = await getDoc(ref);
  // 이미 문서가 있으면 사용자가 수정한 필드(nickname, avatarDataUrl 등)를 덮어쓰지 않습니다.
  // 최초 1회만 초기값을 씁니다.
  if (snap.exists()) return;
  await setDoc(ref, {
    displayName: seed?.name ?? user.displayName ?? "사용자",
    nickname: seed?.nickname ?? "새 사용자",
    email: seed?.email ?? user.email ?? "",
    avatarDataUrl: seed?.avatarDataUrl ?? null,
    passwordChangedAt: seed?.passwordChangedAt ?? "",
    onboardingSeen: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function bootstrapCategories(
  uid: string,
  seed: CategoryEntry[],
): Promise<void> {
  const colRef = categoriesCol(uid);
  const snap = await getDocs(colRef);
  if (!snap.empty) return;
  const batch = writeBatch(db);
  for (const item of seed) {
    batch.set(doc(colRef, item.id), {
      ...stripUndefined(item),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export function subscribeUserProfile(
  uid: string,
  onValue: (profile: Partial<UserProfile>) => void,
): () => void {
  return onSnapshot(userDoc(uid), (snap) => {
    const data = snap.data();
    if (!data) return;
    onValue({
      name: typeof data.displayName === "string" ? data.displayName : undefined,
      nickname: typeof data.nickname === "string" ? data.nickname : undefined,
      email: typeof data.email === "string" ? data.email : undefined,
      avatarDataUrl:
        typeof data.avatarDataUrl === "string" || data.avatarDataUrl === null
          ? data.avatarDataUrl
          : undefined,
      passwordChangedAt:
        typeof data.passwordChangedAt === "string" ? data.passwordChangedAt : undefined,
    });
  });
}

export function subscribeTransactions(
  uid: string,
  onValue: (rows: TxRow[]) => void,
): () => void {
  return onSnapshot(transactionsCol(uid), (snap) => {
    const rows = snap.docs
      .map((item) => {
        const data = item.data();
        const row = { id: item.id, ...data } as TxRow;
        return stripUndefined(row);
      })
      .sort((a, b) => {
        if (a.date === b.date) return b.id.localeCompare(a.id);
        return String(b.date).localeCompare(String(a.date));
      });
    onValue(rows);
  });
}

export function subscribeCategories(
  uid: string,
  onValue: (items: CategoryEntry[]) => void,
): () => void {
  return onSnapshot(categoriesCol(uid), (snap) => {
    const items = snap.docs
      .map((item) => ({ id: item.id, ...item.data() } as CategoryEntry))
      .sort((a, b) => a.id.localeCompare(b.id));
    onValue(items);
  });
}

export async function saveUserProfile(
  uid: string,
  partial: Partial<UserProfile>,
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (partial.name !== undefined) payload.displayName = partial.name;
  if (partial.nickname !== undefined) payload.nickname = partial.nickname;
  if (partial.email !== undefined) payload.email = partial.email;
  if (partial.avatarDataUrl !== undefined) payload.avatarDataUrl = partial.avatarDataUrl;
  if (partial.passwordChangedAt !== undefined) {
    payload.passwordChangedAt = partial.passwordChangedAt;
  }
  await setDoc(userDoc(uid), payload, { merge: true });
}

export async function addTransactions(uid: string, rows: TxRow[]): Promise<void> {
  if (rows.length === 0) return;
  const batch = writeBatch(db);
  const colRef = transactionsCol(uid);
  for (const row of rows) {
    batch.set(doc(colRef, row.id), {
      ...stripUndefined(row),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
}

export async function replaceTransactions(uid: string, rows: TxRow[]): Promise<void> {
  const colRef = transactionsCol(uid);
  const snap = await getDocs(colRef);
  const keepIds = new Set(rows.map((row) => row.id));
  const batch = writeBatch(db);
  for (const rowDoc of snap.docs) {
    if (!keepIds.has(rowDoc.id)) batch.delete(rowDoc.ref);
  }
  for (const row of rows) {
    batch.set(doc(colRef, row.id), {
      ...stripUndefined(row),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
}

export async function updateTransaction(
  uid: string,
  id: string,
  patch: Partial<TxRow>,
): Promise<void> {
  await setDoc(
    doc(transactionsCol(uid), id),
    { ...stripUndefined(patch), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function removeTransaction(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(transactionsCol(uid), id));
}

export async function addCategory(uid: string, entry: CategoryEntry): Promise<void> {
  await setDoc(doc(categoriesCol(uid), entry.id), {
    ...stripUndefined(entry),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function updateCategory(
  uid: string,
  id: string,
  patch: Partial<CategoryEntry>,
): Promise<void> {
  await setDoc(doc(categoriesCol(uid), id), {
    ...stripUndefined(patch),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function removeCategory(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(categoriesCol(uid), id));
}
