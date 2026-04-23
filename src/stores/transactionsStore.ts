/**
 * 역할: Transactions 전역 상태를 Zustand + localStorage 기반으로 보관합니다.
 *       기존 transactionsStore API(loadAll/addOne/updateOne...)는 유지해 호출부 변경을 최소화합니다.
 * 위치: src\stores\transactionsStore.ts
 */
import { create } from "zustand";
import type { TxRow } from "../pages/Transactions/components/TransactionTable";
import { getTransactionsMockData } from "../pages/Transactions/data";

const STORAGE_KEY = "spendtrack:transactions:v3";
const LEGACY_STORAGE_KEY_V2 = "spendtrack:transactions:v2";
const SEED_MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04"];

type LegacyV2Row = Omit<TxRow, "categories"> & { category?: unknown };

function migrateRow(raw: LegacyV2Row): TxRow {
  const preserved = raw as unknown as TxRow;
  if (Array.isArray(preserved.categories) && preserved.categories.length > 0) {
    return preserved;
  }
  const legacy = raw.category;
  const single =
    legacy === "living" ||
    legacy === "fashion" ||
    legacy === "digital" ||
    legacy === "food" ||
    legacy === "etc"
      ? (legacy as TxRow["categories"][number])
      : "etc";
  const { category: _discarded, ...rest } = raw;
  void _discarded;
  return { ...(rest as unknown as TxRow), categories: [single] };
}

function buildSeed(): TxRow[] {
  return SEED_MONTHS.flatMap((month) =>
    getTransactionsMockData(month).rows.map((row) => ({
      ...row,
      source: row.source ?? "mock",
    }))
  );
}

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

function migrateFromV2IfAny(): TxRow[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY_V2);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const migrated = (parsed as LegacyV2Row[]).map(migrateRow);
    localStorage.removeItem(LEGACY_STORAGE_KEY_V2);
    return migrated;
  } catch {
    return null;
  }
}

function writeCurrent(rows: TxRow[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function ensureSeeded(): TxRow[] {
  const existing = readCurrent();
  if (existing) return existing;
  const migrated = migrateFromV2IfAny();
  if (migrated) {
    writeCurrent(migrated);
    return migrated;
  }
  const seed = buildSeed();
  writeCurrent(seed);
  return seed;
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
  resetToSeed: () => TxRow[];
}

const useTransactionsStoreBase = create<TransactionsState>((set, get) => ({
  rows: ensureSeeded(),
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
  resetToSeed: () => {
    const seed = buildSeed();
    writeCurrent(seed);
    set({ rows: seed });
    return seed;
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      useTransactionsStoreBase.setState({ rows: ensureSeeded() });
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
  resetToSeed(): TxRow[] {
    return useTransactionsStoreBase.getState().resetToSeed();
  },
  subscribe(listener: (rows: TxRow[]) => void): () => void {
    return useTransactionsStoreBase.subscribe((state) => listener(state.rows));
  },
};

export function useTransactionsStore(): TxRow[] {
  return useTransactionsStoreBase((state) => state.rows);
}
