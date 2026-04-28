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
import {
  normalizeTransactionRow,
  normalizeTransactionRows,
} from "../utils/transactionNormalize";

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

/*
 * AI 소비 인사이트 캐시(2026-04-28). Home 의 ✨ 한 줄 요약을 매번 재호출하지 않고
 * 월별로 Firestore 에 저장해 모든 디바이스/브라우저가 같은 캐시를 공유합니다.
 * 키는 monthKey("YYYY-MM"), 값은 { hash, insightText } — 거래 데이터 hash 가 같으면
 * 캐시 hit 라 호출 자체가 발동하지 않습니다.
 */
function aiInsightsCol(uid: string) {
  return collection(db, "users", uid, "aiInsights");
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
    // 최초 부트스트랩 시점에는 변경 이력이 없는 상태로 두어, 사용자가 첫 변경을
    // 시도할 때 쿨다운에 걸리지 않게 합니다. updateNickname callable 가 첫 변경 시
    // serverTimestamp 로 채워 줍니다.
    nicknameChangedAt: null,
    accountStatus: "active",
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
  onError?: (error: unknown) => void,
): () => void {
  return onSnapshot(
    userDoc(uid),
    (snap) => {
      const data = snap.data();
      if (!data) return;
      // Firestore Timestamp -> ISO 문자열 변환. 클라이언트(profileStore/ProfileSection)는
      // ISO 문자열만 다루도록 통일해서, 쿨다운 계산도 일관됩니다.
      // 기존 사용자(필드 없음)와 신규 사용자(null), 변경 이력 있음(Timestamp) 셋 다 다룹니다.
      const rawNickAt = data.nicknameChangedAt;
      let nicknameChangedAtPatch: { nicknameChangedAt: string | null } | object = {};
      if (rawNickAt === null) {
        nicknameChangedAtPatch = { nicknameChangedAt: null };
      } else if (rawNickAt && typeof rawNickAt.toDate === "function") {
        nicknameChangedAtPatch = {
          nicknameChangedAt: (rawNickAt.toDate() as Date).toISOString(),
        };
      } else if (typeof rawNickAt === "string") {
        nicknameChangedAtPatch = { nicknameChangedAt: rawNickAt };
      }
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
        ...nicknameChangedAtPatch,
      });
    },
    onError,
  );
}

export function subscribeTransactions(
  uid: string,
  onValue: (rows: TxRow[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  return onSnapshot(
    transactionsCol(uid),
    (snap) => {
      const rows = normalizeTransactionRows(
        snap.docs
        .map((item) => {
          const data = item.data();
          const row = { id: item.id, ...data } as TxRow;
          return stripUndefined(row);
        })
      )
        .sort((a, b) => {
          if (a.date === b.date) return b.id.localeCompare(a.id);
          return String(b.date).localeCompare(String(a.date));
        });
      onValue(rows);
    },
    onError,
  );
}

export function subscribeCategories(
  uid: string,
  onValue: (items: CategoryEntry[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  return onSnapshot(
    categoriesCol(uid),
    (snap) => {
      const items = snap.docs
        .map((item) => ({ id: item.id, ...item.data() } as CategoryEntry))
        .sort((a, b) => a.id.localeCompare(b.id));
      onValue(items);
    },
    onError,
  );
}

export async function saveUserProfile(
  uid: string,
  partial: Partial<UserProfile>,
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (partial.name !== undefined) payload.displayName = partial.name;
  // 닉네임은 보안 정책상 이 직접 쓰기 경로로 저장하지 않습니다.
  // 모든 변경은 Cloud Function `updateNickname` 을 통해서만 통과시키고,
  // 그 함수가 nicknameChangedAt 와 함께 트랜잭션으로 갱신합니다.
  // (정책: 임퍼소네이션/봇 어뷰즈 방어, 클라이언트 disable 만으로는 부족)
  if (partial.email !== undefined) payload.email = partial.email;
  if (partial.avatarDataUrl !== undefined) payload.avatarDataUrl = partial.avatarDataUrl;
  if (partial.passwordChangedAt !== undefined) {
    payload.passwordChangedAt = partial.passwordChangedAt;
  }
  if (Object.keys(payload).length === 1) {
    // updatedAt 만 있으면 굳이 쓸 필요 없음(불필요한 listener 알림 방지).
    return;
  }
  await setDoc(userDoc(uid), payload, { merge: true });
}

export async function addTransactions(uid: string, rows: TxRow[]): Promise<void> {
  if (rows.length === 0) return;
  const batch = writeBatch(db);
  const colRef = transactionsCol(uid);
  for (const row of normalizeTransactionRows(rows)) {
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
  const normalizedRows = normalizeTransactionRows(rows);
  const keepIds = new Set(normalizedRows.map((row) => row.id));
  const batch = writeBatch(db);
  for (const rowDoc of snap.docs) {
    if (!keepIds.has(rowDoc.id)) batch.delete(rowDoc.ref);
  }
  for (const row of normalizedRows) {
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
  const normalizedPatch = normalizeTransactionRow({
    id,
    type: patch.type ?? "expense",
    date: patch.date ?? "",
    platform: patch.platform ?? "unspecified",
    categories: patch.categories ?? ["etc"],
    title: patch.title ?? "",
    amount: patch.amount ?? 0,
    status: patch.status ?? "purchase",
    source: patch.source,
    memo: patch.memo,
    detail: patch.detail,
  });
  await setDoc(
    doc(transactionsCol(uid), id),
    {
      ...stripUndefined({
        ...patch,
        ...(normalizedPatch.detail ? { detail: normalizedPatch.detail } : {}),
        ...(normalizedPatch.categories ? { categories: normalizedPatch.categories } : {}),
      }),
      updatedAt: serverTimestamp(),
    },
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

/**
 * AI 인사이트 캐시 한 건 저장. setInsight 호출 시 백그라운드 sync 로 호출됩니다.
 * 같은 monthKey 에 hash 가 다른 새 인사이트가 생기면 그대로 덮어씁니다.
 */
export async function saveAiInsight(
  uid: string,
  monthKey: string,
  payload: { hash: string; insightText: string },
): Promise<void> {
  await setDoc(
    doc(aiInsightsCol(uid), monthKey),
    {
      hash: payload.hash,
      insightText: payload.insightText,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * 사용자의 모든 AI 인사이트 캐시 로드. 로그인 직후 hydrate 흐름에서 호출 →
 * 모든 디바이스에서 같은 캐시 공유. Firestore 가 비어 있으면 빈 객체.
 */
export async function loadAiInsights(
  uid: string,
): Promise<Record<string, { hash: string; insightText: string }>> {
  const snap = await getDocs(aiInsightsCol(uid));
  const out: Record<string, { hash: string; insightText: string }> = {};
  snap.forEach((d) => {
    const data = d.data() as { hash?: unknown; insightText?: unknown };
    if (typeof data.hash === "string" && typeof data.insightText === "string") {
      out[d.id] = { hash: data.hash, insightText: data.insightText };
    }
  });
  return out;
}
