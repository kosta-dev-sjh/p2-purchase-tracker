/**
 * 역할: Transactions 전역 상태를 Zustand + localStorage 기반으로 보관합니다.
 *       기존 transactionsStore API(loadAll/addOne/updateOne...)는 유지해 호출부 변경을 최소화합니다.
 *
 *       이전 버전에는 화면을 비워 두지 않으려고 월별 랜덤 시드 거래(무신사·쿠팡 등)를
 *       자동으로 채워 넣던 buildSeed()가 있었지만, 실제 입력 경로(수동/OCR/CSV)가 모두
 *       동작하는 현재는 "사용자가 넣은 데이터만 보인다"로 정책을 바꿨습니다. 시드를
 *       제거한 이후에도 구버전 localStorage에는 musinsa 같은 더 이상 지원하지 않는
 *       플랫폼 값이 남아 있어, STORAGE_KEY를 v4로 bump 해 자동으로 깨끗한 상태에서
 *       시작하도록 했습니다.
 * 위치: src\stores\transactionsStore.ts
 */
import { create } from "zustand";
import type { TxCategory, TxRow } from "../pages/Transactions/components/TransactionTable";
import { categoriesStore } from "./categoriesStore";
import {
  inferCategory,
  normalizeMerchantKey,
  shouldInferCategory,
} from "../utils/categoryInference";
import { auth } from "../lib/firebase";
import {
  addTransactions,
  removeTransaction,
  replaceTransactions,
  updateTransaction,
} from "../lib/firebaseRepository";

/**
 * 저장 경계에서 참조하는 "가맹점명 → 사용자 선택 카테고리" 학습 캐시.
 * 사용자가 거래 수정으로 카테고리를 바꾸면 여기에 기록되고, 다음 import에서 룰보다 우선 적용됩니다.
 */
const LEARNED_STORAGE_KEY = "spendtrack:category-learned:v1";

function readLearned(): Record<string, TxCategory> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LEARNED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, TxCategory>;
    }
    return {};
  } catch {
    return {};
  }
}

function writeLearned(map: Record<string, TxCategory>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LEARNED_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* localStorage 용량 초과 등은 조용히 무시 — 학습 캐시는 보조 신호라서 실패해도 기능 회귀 없음. */
  }
}

/**
 * 주어진 row 배열을 "저장 직전" 시점에 카테고리 자동추정으로 보강합니다.
 * - `categories`가 비었거나 `["etc"]`인 경우에만 건드립니다. 사용자가 명시적으로 고른 값은 그대로.
 * - 추정에 실패한 행은 그대로 두어, 호출부가 이미 붙여둔 `etc` 기본값이 유지됩니다.
 */
function enrichCategories(rows: TxRow[]): TxRow[] {
  const bindings = categoriesStore.getBindings();
  const learned = readLearned();
  return rows.map((row) => {
    if (!shouldInferCategory(row.categories)) return row;
    // TxRow에는 별도의 merchant 필드가 없고 가맹점명은 title에 정규화돼 담깁니다(csvImport 참조).
    const guess = inferCategory(row.title, { bindings, learnedMap: learned });
    if (!guess) return row;
    return { ...row, categories: [guess] };
  });
}

/**
 * localStorage 키. 가짜 시드를 제거하면서 v3 → v4 로 올렸습니다.
 * v3에는 "musinsa" 플랫폼의 랜덤 시드 행이 들어 있어 현재 타입(TxPlatform)에서
 * undefined 참조로 크래시가 났기 때문에, v4부터는 무조건 빈 상태로 시작합니다.
 */
const STORAGE_KEY = "spendtrack:transactions:v4";

function readCurrent(): TxRow[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TxRow[]) : null;
  } catch {
    return null;
  }
}

function writeCurrent(rows: TxRow[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

/**
 * 초기 로드. 저장된 rows가 있으면 그대로 사용하고, 없으면 빈 배열로 시작합니다.
 * (과거에는 여기서 월별 시드 거래를 자동 생성했지만 제거했습니다.)
 */
function loadInitial(): TxRow[] {
  const existing = readCurrent();
  if (existing) return existing;
  writeCurrent([]);
  return [];
}

interface TransactionsState {
  rows: TxRow[];
  replaceAll: (rows: TxRow[]) => void;
  /**
   * CSV/OCR 등 자동 입력 경로에서 사용합니다. 저장 직전에 카테고리 자동추정이 돌아
   * `etc`로 들어온 행들을 가맹점명 룰에 맞춰 재분류합니다.
   */
  addFromImport: (rows: TxRow[]) => void;
  /**
   * 수동 입력 경로에서 사용합니다. 사용자가 화면에서 직접 카테고리를 고른 값이므로
   * 자동추정을 돌리지 않고 그대로 저장합니다.
   */
  addFromManual: (row: TxRow) => void;
  /** @deprecated `addFromImport`를 쓰세요. 하위 호환을 위해 자동추정을 그대로 태워줍니다. */
  addMany: (rows: TxRow[]) => void;
  /** @deprecated `addFromManual` 또는 `addFromImport`를 쓰세요. 지금은 자동추정 없이 저장합니다. */
  addOne: (row: TxRow) => void;
  updateOne: (id: string, patch: Partial<TxRow>) => void;
  removeOne: (id: string) => void;
  appendItemsToTransaction: (
    id: string,
    items: { name: string; price: number; link?: string }[],
    source?: "OCR" | "MANUAL"
  ) => void;
  /** 저장된 거래를 모두 지워 "빈 계정" 상태로 돌립니다. */
  clearAll: () => TxRow[];
  hydrate: (rows: TxRow[]) => TxRow[];
}

const useTransactionsStoreBase = create<TransactionsState>((set, get) => ({
  rows: loadInitial(),
  replaceAll: (rows) => {
    writeCurrent(rows);
    set({ rows });
    const uid = auth.currentUser?.uid;
    if (uid) {
      void replaceTransactions(uid, rows);
    }
  },
  addFromImport: (rows) => {
    const enriched = enrichCategories(rows);
    const next = [...enriched, ...get().rows];
    writeCurrent(next);
    set({ rows: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      void addTransactions(uid, enriched);
    }
  },
  addFromManual: (row) => {
    const next = [row, ...get().rows];
    writeCurrent(next);
    set({ rows: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      void addTransactions(uid, [row]);
    }
  },
  addMany: (rows) => {
    const enriched = enrichCategories(rows);
    const next = [...enriched, ...get().rows];
    writeCurrent(next);
    set({ rows: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      void addTransactions(uid, enriched);
    }
  },
  addOne: (row) => {
    const next = [row, ...get().rows];
    writeCurrent(next);
    set({ rows: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      void addTransactions(uid, [row]);
    }
  },
  updateOne: (id, patch) => {
    const prev = get().rows.find((row) => row.id === id);
    const next = get().rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
    writeCurrent(next);
    set({ rows: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      void updateTransaction(uid, id, patch);
    }

    // 사용자가 카테고리를 명시적으로 바꾼 경우만 학습 캐시에 기록합니다.
    // - patch.categories가 포함돼 있고
    // - 이전 값과 다르고
    // - `etc`가 아닌 실질적인 선택일 때
    // 가맹점명(title) 변경까지 포함하려면 복잡해지므로, 키는 patch에 title이 오면 그것을, 아니면 이전 title을 씁니다.
    if (prev && Array.isArray(patch.categories) && patch.categories.length > 0) {
      const nextCat = patch.categories[0];
      const prevCat = prev.categories?.[0];
      const titleForKey = typeof patch.title === "string" ? patch.title : prev.title;
      if (nextCat && nextCat !== "etc" && nextCat !== prevCat && titleForKey) {
        const key = normalizeMerchantKey(titleForKey);
        if (key) {
          const learned = readLearned();
          learned[key] = nextCat;
          writeLearned(learned);
        }
      }
    }
  },
  removeOne: (id) => {
    const next = get().rows.filter((row) => row.id !== id);
    writeCurrent(next);
    set({ rows: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      void removeTransaction(uid, id);
    }
  },
  appendItemsToTransaction: (id, items, source = "OCR") => {
    const next = get().rows.map((row) => {
      if (row.id !== id) return row;
      const existingItems = row.detail?.items ?? [];
      return {
        ...row,
        detail: {
          ...(row.detail ?? {}),
          items: [...existingItems, ...items],
          source: row.detail?.source ?? source,
        },
      };
    });
    writeCurrent(next);
    set({ rows: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      const updated = next.find((row) => row.id === id);
      if (updated) {
        void updateTransaction(uid, id, updated);
      }
    }
  },
  clearAll: () => {
    writeCurrent([]);
    set({ rows: [] });
    const uid = auth.currentUser?.uid;
    if (uid) {
      void replaceTransactions(uid, []);
    }
    return [];
  },
  hydrate: (rows) => {
    writeCurrent(rows);
    set({ rows });
    return rows;
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      useTransactionsStoreBase.setState({ rows: loadInitial() });
    }
  });
}

export const transactionsStore = {
  loadAll(): TxRow[] {
    return useTransactionsStoreBase.getState().rows;
  },
  replaceAll(rows: TxRow[]): void {
    useTransactionsStoreBase.getState().replaceAll(rows);
  },
  addFromImport(rows: TxRow[]): void {
    useTransactionsStoreBase.getState().addFromImport(rows);
  },
  addFromManual(row: TxRow): void {
    useTransactionsStoreBase.getState().addFromManual(row);
  },
  /** @deprecated 새 호출부는 addFromImport를 쓰세요. */
  addMany(rows: TxRow[]): void {
    useTransactionsStoreBase.getState().addMany(rows);
  },
  /** @deprecated 새 호출부는 addFromManual 또는 addFromImport를 쓰세요. */
  addOne(row: TxRow): void {
    useTransactionsStoreBase.getState().addOne(row);
  },
  updateOne(id: string, patch: Partial<TxRow>): void {
    useTransactionsStoreBase.getState().updateOne(id, patch);
  },
  removeOne(id: string): void {
    useTransactionsStoreBase.getState().removeOne(id);
  },
  appendItemsToTransaction(
    id: string,
    items: { name: string; price: number; link?: string }[],
    source: "OCR" | "MANUAL" = "OCR"
  ): void {
    useTransactionsStoreBase.getState().appendItemsToTransaction(id, items, source);
  },
  clearAll(): TxRow[] {
    return useTransactionsStoreBase.getState().clearAll();
  },
  hydrate(rows: TxRow[]): TxRow[] {
    return useTransactionsStoreBase.getState().hydrate(rows);
  },
  subscribe(listener: (rows: TxRow[]) => void): () => void {
    return useTransactionsStoreBase.subscribe((state) => listener(state.rows));
  },
};

export function useTransactionsStore(): TxRow[] {
  return useTransactionsStoreBase((state) => state.rows);
}
