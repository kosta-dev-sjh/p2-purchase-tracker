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
import type { TxRow } from "../pages/Transactions/components/TransactionTable";

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
  addMany: (rows: TxRow[]) => void;
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
}

const useTransactionsStoreBase = create<TransactionsState>((set, get) => ({
  rows: loadInitial(),
  replaceAll: (rows) => {
    writeCurrent(rows);
    set({ rows });
  },
  addMany: (rows) => {
    const next = [...rows, ...get().rows];
    writeCurrent(next);
    set({ rows: next });
  },
  addOne: (row) => {
    const next = [row, ...get().rows];
    writeCurrent(next);
    set({ rows: next });
  },
  updateOne: (id, patch) => {
    const next = get().rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
    writeCurrent(next);
    set({ rows: next });
  },
  removeOne: (id) => {
    const next = get().rows.filter((row) => row.id !== id);
    writeCurrent(next);
    set({ rows: next });
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
  },
  clearAll: () => {
    writeCurrent([]);
    set({ rows: [] });
    return [];
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
  addMany(rows: TxRow[]): void {
    useTransactionsStoreBase.getState().addMany(rows);
  },
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
  subscribe(listener: (rows: TxRow[]) => void): () => void {
    return useTransactionsStoreBase.subscribe((state) => listener(state.rows));
  },
};

export function useTransactionsStore(): TxRow[] {
  return useTransactionsStoreBase((state) => state.rows);
}
