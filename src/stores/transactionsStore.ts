/**
 * 역할: Transactions 전역 상태를 localStorage 기반으로 보관하는 간이 스토어.
 *       MVP 단계에서는 Firestore를 연결하지 않고 이 모듈을 통해서만 거래 데이터를 읽고 씁니다.
 *       추후 원격 저장소 연동으로 교체할 수 있도록 API 표면을 단순하게 유지합니다.
 * 위치: src\stores\transactionsStore.ts
 */
import { useEffect, useState } from "react";
import type { TxRow } from "../pages/Transactions/components/TransactionTable";
import { getTransactionsMockData } from "../pages/Transactions/data";

// v3: 카테고리를 단수 category에서 다중 categories[]로 전환.
//     이전 버전(v2) 캐시가 남아 있으면 한 번만 읽어들여 변환한 뒤 v3 키로 저장합니다.
const STORAGE_KEY = "spendtrack:transactions:v3";
const LEGACY_STORAGE_KEY_V2 = "spendtrack:transactions:v2";
const SEED_MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04"];

/**
 * 단일 카테고리만 저장하던 v2 스키마. 마이그레이션 입력 타입으로만 사용합니다.
 * 런타임에 존재할 수 있는 필드만 최소한 적어둡니다.
 */
type LegacyV2Row = Omit<TxRow, "categories"> & { category?: unknown };

/**
 * v2 행 하나를 v3로 변환합니다. category가 있으면 배열로 감싸고, 없거나 이상한 값이면 "etc" 기본값을 넣습니다.
 * 이미 categories 배열이 있으면 그대로 넘겨(중복 실행에도 안전).
 */
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

type Listener = (rows: TxRow[]) => void;
const listeners = new Set<Listener>();

function buildSeed(): TxRow[] {
  return SEED_MONTHS.flatMap((month) =>
    getTransactionsMockData(month).rows.map((row) => ({
      ...row,
      source: row.source ?? "mock",
    }))
  );
}

function readRaw(): TxRow[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TxRow[]) : null;
  } catch {
    return null;
  }
}

/**
 * v2 캐시가 있으면 한 번만 읽어 v3 포맷으로 변환합니다.
 * 변환 후에는 원본 v2 키를 지워 다음 세션부터는 v3 루트만 보도록 정리합니다.
 */
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

function writeRaw(rows: TxRow[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  listeners.forEach((listener) => listener(rows));
}

function ensureSeeded(): TxRow[] {
  const existing = readRaw();
  if (existing) return existing;
  // 먼저 v2 캐시 마이그레이션을 시도하고, 없으면 새 시드로 초기화합니다.
  const migrated = migrateFromV2IfAny();
  if (migrated) {
    writeRaw(migrated);
    return migrated;
  }
  const seed = buildSeed();
  writeRaw(seed);
  return seed;
}

export const transactionsStore = {
  loadAll(): TxRow[] {
    return ensureSeeded();
  },
  replaceAll(rows: TxRow[]): void {
    writeRaw(rows);
  },
  addMany(rows: TxRow[]): void {
    const current = ensureSeeded();
    writeRaw([...rows, ...current]);
  },
  addOne(row: TxRow): void {
    const current = ensureSeeded();
    writeRaw([row, ...current]);
  },
  updateOne(id: string, patch: Partial<TxRow>): void {
    const current = ensureSeeded();
    writeRaw(current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  },
  removeOne(id: string): void {
    const current = ensureSeeded();
    writeRaw(current.filter((row) => row.id !== id));
  },
  appendItemsToTransaction(
    id: string,
    items: { name: string; price: number; link?: string }[],
    source: "OCR" | "MANUAL" = "OCR"
  ): void {
    const current = ensureSeeded();
    writeRaw(
      current.map((row) => {
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
      })
    );
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /**
   * 개발/테스트용으로 스토어를 초기 시드 상태로 되돌립니다.
   * UI에서는 Settings 위험 구역 등 향후 확장 시점에 연결할 수 있습니다.
   */
  resetToSeed(): TxRow[] {
    const seed = buildSeed();
    writeRaw(seed);
    return seed;
  },
};

/**
 * 컴포넌트에서 스토어 상태를 구독하기 위한 훅.
 * 다른 탭의 변경은 storage 이벤트로, 같은 탭 내 변경은 내부 리스너로 반영됩니다.
 */
export function useTransactionsStore(): TxRow[] {
  const [rows, setRows] = useState<TxRow[]>(() => transactionsStore.loadAll());

  useEffect(() => {
    const unsubscribe = transactionsStore.subscribe(setRows);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setRows(transactionsStore.loadAll());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return rows;
}
