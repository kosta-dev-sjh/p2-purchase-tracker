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
import { detectConcept } from "../data/categoryConcepts";
import {
  normalizeTransactionRow,
  normalizeTransactionRows,
} from "../utils/transactionNormalize";
import { auth } from "../lib/firebase";
import { trackBackgroundSync } from "../lib/firebaseBackgroundSync";
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
const LEARNED_TEMPLATE_STORAGE_KEY = "spendtrack:merchant-template:v1";

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

interface LearnedMerchantTemplate {
  title?: string;
  memo?: string;
  categories?: TxCategory[];
  status?: TxRow["status"];
}

function readLearnedTemplates(): Record<string, LearnedMerchantTemplate> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LEARNED_TEMPLATE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, LearnedMerchantTemplate>;
    }
    return {};
  } catch {
    return {};
  }
}

function writeLearnedTemplates(map: Record<string, LearnedMerchantTemplate>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LEARNED_TEMPLATE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* 템플릿 학습은 보조 기능이므로 저장 실패 시 조용히 무시합니다. */
  }
}

function isMeaningfulCategories(categories: TxCategory[] | undefined): categories is TxCategory[] {
  return Array.isArray(categories) && categories.length > 0 && !(categories.length === 1 && categories[0] === "etc");
}

function buildLearnedTemplate(row: TxRow): LearnedMerchantTemplate {
  const memo = row.memo?.trim();
  return {
    ...(row.title.trim() ? { title: row.title.trim() } : {}),
    ...(memo ? { memo } : {}),
    ...(isMeaningfulCategories(row.categories) ? { categories: [...row.categories] } : {}),
    ...(row.status ? { status: row.status } : {}),
  };
}

function deriveMerchantTemplateKeys(row: TxRow): string[] {
  const keys = [row.title];
  const originalMerchant = row.detail?.cardImport?.originalMerchant;
  if (originalMerchant) keys.push(originalMerchant);
  return Array.from(new Set(keys.map((item) => item.trim()).filter(Boolean)));
}

function learnMerchantTemplate(keys: string[], row: TxRow): void {
  const template = buildLearnedTemplate(row);
  if (
    !template.title &&
    !template.memo &&
    !template.categories &&
    !template.status
  ) {
    return;
  }

  const map = readLearnedTemplates();
  keys
    .map((key) => normalizeMerchantKey(key))
    .filter(Boolean)
    .forEach((key) => {
      map[key] = template;
    });
  writeLearnedTemplates(map);
}

/**
 * 주어진 row 배열을 "저장 직전" 시점에 카테고리 자동추정으로 보강합니다.
 * - `categories`가 비었거나 `["etc"]`인 경우에만 건드립니다. 사용자가 명시적으로 고른 값은 그대로.
 * - 추정에 실패한 행은 그대로 두어, 호출부가 이미 붙여둔 `etc` 기본값이 유지됩니다.
 */
function enrichCategories(rows: TxRow[]): TxRow[] {
  const bindings = categoriesStore.getBindings();
  const learned = readLearned();
  const learnedTemplates = readLearnedTemplates();
  return rows.map((row) => {
    const template = deriveMerchantTemplateKeys(row)
      .map((key) => learnedTemplates[normalizeMerchantKey(key)])
      .find(Boolean);
    const nextCategories = shouldInferCategory(row.categories)
      ? (() => {
          const guess = inferCategory(row.title, { bindings, learnedMap: learned });
          return guess ? [guess] : row.categories;
        })()
      : row.categories;

    const hasTemplateCategories = isMeaningfulCategories(template?.categories);
    const templateCategories = hasTemplateCategories ? template.categories : undefined;
    const memo = template?.memo?.trim();
    const title = template?.title?.trim();

    /*
     * 정기결제 자동 status 전환(2026-04-28).
     *
     * 가맹점이 "subscription" concept(넷플릭스/유튜브 프리미엄/통신 자동납부 등) 으로
     * 잡히면 거래 상태를 자동으로 "sub" 로 올려줍니다. 이전엔 csvImport 가 default
     * "purchase" 를 박아 거래내역 상세에서는 일반 구매로 보이는데, 분석/반복결제 카드는
     * subscription 으로 잡혀 일관성이 깨지는 회귀가 있었습니다.
     *
     * 안전 가드:
     *  - 사용자가 명시적으로 status 를 골라 저장한 행(refund/cancel/sub/etc) 은 안 건드림.
     *    csv 는 default purchase 만 고쳐 주고, 그 외 사용자 의도 status 는 보존.
     *  - templateStatus 가 있으면 그걸 우선 — 사용자가 같은 가맹점에 대해 학습시킨 의도 유지.
     */
    const conceptStatusUpgrade =
      row.status === "purchase" &&
      detectConcept(row.detail?.cardImport?.originalMerchant || row.title) ===
        "subscription"
        ? "sub"
        : undefined;

    return {
      ...row,
      ...(title ? { title } : {}),
      ...(memo ? { memo } : {}),
      ...(template?.status
        ? { status: template.status }
        : conceptStatusUpgrade
          ? { status: conceptStatusUpgrade }
          : {}),
      categories: templateCategories ? [...templateCategories] : nextCategories,
    };
  });
}

/**
 * localStorage 키. 가짜 시드를 제거하면서 v3 → v4 로 올렸습니다.
 * v3에는 "musinsa" 플랫폼의 랜덤 시드 행이 들어 있어 현재 타입(TxPlatform)에서
 * undefined 참조로 크래시가 났기 때문에, v4부터는 무조건 빈 상태로 시작합니다.
 */
const STORAGE_KEY = "spendtrack:transactions:v5";

/**
 * 정기결제 자동 status 정규화(2026-04-28).
 *
 * 신규 import 는 enrichCategories 가 처리하지만, 그 정책이 도입되기 전 import 한 거래는
 * status="purchase" 인 채로 store 에 남아 있어 거래내역 "정기결제" 필터·DetailPanel
 * 표시가 EssentialStrip(concept 기반 합산) 와 일관되지 않았습니다.
 *
 * 정책: subscription concept 매칭 + status="purchase" 행만 한 번에 "sub" 로 정규화.
 *  - 사용자가 명시 변경한 status(refund/cancel/sub/etc) 는 안 건드림.
 *  - 비용은 저장 행 N 에 대해 정규식 매칭 N 회. 200행 기준 ms 단위.
 *  - 호출 시점은 readCurrent / writeCurrent / hydrate 진입 — store 라이프사이클 1회.
 *    매 거래 변경마다 돌지 않으므로 렉/호출 폭발 없음.
 */
function normalizeStatusByConcept(rows: TxRow[]): TxRow[] {
  let changed = false;
  const next = rows.map((row) => {
    if (row.type !== "expense") return row;
    if (row.status !== "purchase") return row;
    const merchant = row.detail?.cardImport?.originalMerchant || row.title;
    if (detectConcept(merchant) !== "subscription") return row;
    changed = true;
    return { ...row, status: "sub" as const };
  });
  return changed ? next : rows;
}

function readCurrent(): TxRow[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const normalized = normalizeStatusByConcept(
      normalizeTransactionRows(parsed as TxRow[]),
    );
    return normalized;
  } catch {
    return null;
  }
}

function writeCurrent(rows: TxRow[]): void {
  // writeCurrent 도 sweep 거치게 — store 가 들고 있는 메모리와 storage 를 동시에 일관시켜
  // 같은 사용자 다음 진입 시 redundant sweep 없이 즉시 일치된 상태로 시작합니다.
  const normalized = normalizeStatusByConcept(normalizeTransactionRows(rows));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
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
    source?: "OCR" | "MANUAL" | "CARD"
  ) => void;
  /** 저장된 거래를 모두 지워 "빈 계정" 상태로 돌립니다. */
  clearAll: () => TxRow[];
  hydrate: (rows: TxRow[]) => TxRow[];
}

const useTransactionsStoreBase = create<TransactionsState>((set, get) => ({
  rows: loadInitial(),
  replaceAll: (rows) => {
    const normalized = normalizeTransactionRows(rows);
    writeCurrent(normalized);
    set({ rows: normalized });
    const uid = auth.currentUser?.uid;
    if (uid) {
      trackBackgroundSync(replaceTransactions(uid, normalized));
    }
  },
  addFromImport: (rows) => {
    const enriched = normalizeTransactionRows(enrichCategories(rows));
    const next = [...enriched, ...get().rows];
    writeCurrent(next);
    set({ rows: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      trackBackgroundSync(addTransactions(uid, enriched));
    }
  },
  addFromManual: (row) => {
    const normalized = normalizeTransactionRow(row);
    const next = [normalized, ...get().rows];
    writeCurrent(next);
    set({ rows: next });
    learnMerchantTemplate(deriveMerchantTemplateKeys(normalized), normalized);
    const uid = auth.currentUser?.uid;
    if (uid) {
      trackBackgroundSync(addTransactions(uid, [normalized]));
    }
  },
  addMany: (rows) => {
    const enriched = normalizeTransactionRows(enrichCategories(rows));
    const next = [...enriched, ...get().rows];
    writeCurrent(next);
    set({ rows: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      trackBackgroundSync(addTransactions(uid, enriched));
    }
  },
  addOne: (row) => {
    const normalized = normalizeTransactionRow(row);
    const next = [normalized, ...get().rows];
    writeCurrent(next);
    set({ rows: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      trackBackgroundSync(addTransactions(uid, [normalized]));
    }
  },
  updateOne: (id, patch) => {
    const prev = get().rows.find((row) => row.id === id);
    const next = get().rows.map((row) =>
      row.id === id ? normalizeTransactionRow({ ...row, ...patch }) : row,
    );
    writeCurrent(next);
    set({ rows: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      trackBackgroundSync(updateTransaction(uid, id, patch));
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

    if (prev) {
      const updated = next.find((row) => row.id === id);
      if (updated) {
        learnMerchantTemplate(
          Array.from(new Set([...deriveMerchantTemplateKeys(prev), ...deriveMerchantTemplateKeys(updated)])),
          updated,
        );
      }
    }
  },
  removeOne: (id) => {
    const next = get().rows.filter((row) => row.id !== id);
    writeCurrent(next);
    set({ rows: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      trackBackgroundSync(removeTransaction(uid, id));
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
        trackBackgroundSync(updateTransaction(uid, id, updated));
      }
    }
  },
  clearAll: () => {
    writeCurrent([]);
    set({ rows: [] });
    const uid = auth.currentUser?.uid;
    if (uid) {
      trackBackgroundSync(replaceTransactions(uid, []));
    }
    return [];
  },
  hydrate: (rows) => {
    // Firebase 에서 받아온 외부 데이터도 sweep 거치게 — 이전에 저장된 status="purchase"
    // 라도 subscription concept 매칭 행은 자동으로 "sub" 로 정규화. 매 변경마다 도는
    // 게 아니라 firebaseSync 의 onAuthStateChanged 직후 hydrate 호출 시 1회.
    const normalized = normalizeStatusByConcept(normalizeTransactionRows(rows));
    writeCurrent(normalized);
    set({ rows: normalized });
    return normalized;
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
    source: "OCR" | "MANUAL" | "CARD" = "OCR"
  ): void {
    useTransactionsStoreBase.getState().appendItemsToTransaction(id, items, source);
  },
  clearAll(): TxRow[] {
    return useTransactionsStoreBase.getState().clearAll();
  },
  /**
   * 로그아웃/계정 전환 시 호출. 가맹점→카테고리 학습 캐시와 가맹점 템플릿 캐시는
   * 직전 사용자의 거래 패턴이 함축돼 있어 다음 사용자에게 그대로 노출되면 의도치 않은
   * 자동 분류/자동 채우기가 발생합니다. 인메모리 캐시는 없고 localStorage 만 비우면 됩니다.
   */
  clearLearnedCaches(): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(LEARNED_STORAGE_KEY);
      window.localStorage.removeItem(LEARNED_TEMPLATE_STORAGE_KEY);
    } catch {
      /* localStorage 접근 거부는 보안 차원에서 무시 가능 */
    }
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
