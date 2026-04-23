/**
 * 역할: 설정 화면의 카테고리 상태를 Zustand + localStorage 기반으로 보관합니다.
 *       기존 categoriesStore API와 훅 형태를 유지해 호출부 변경을 최소화합니다.
 * 위치: src\stores\categoriesStore.ts
 */
import { create } from "zustand";
import { tokens } from "../styles/tokens";
import { CATEGORY_LABELS, DEFAULT_CATEGORY_KEY } from "../constants/labels";
import type { TxCategory } from "../pages/Transactions/components/TransactionTable";

export interface CategoryEntry {
  id: string;
  name: string;
  color: string;
  isStandard: boolean;
  isLocked: boolean;
}

const STORAGE_KEY = "spendtrack:categories:v1";

const SEED: CategoryEntry[] = [
  { id: DEFAULT_CATEGORY_KEY, name: CATEGORY_LABELS.etc, color: tokens.color.cat5, isStandard: true, isLocked: true },
  { id: "living", name: CATEGORY_LABELS.living, color: tokens.color.cat2, isStandard: true, isLocked: false },
  { id: "fashion", name: CATEGORY_LABELS.fashion, color: tokens.color.cat1, isStandard: true, isLocked: false },
  { id: "digital", name: CATEGORY_LABELS.digital, color: tokens.color.cat4, isStandard: true, isLocked: false },
  { id: "food", name: CATEGORY_LABELS.food, color: tokens.color.cat3, isStandard: true, isLocked: false },
];

function readCurrent(): CategoryEntry[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CategoryEntry[]) : null;
  } catch {
    return null;
  }
}

function writeCurrent(items: CategoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function ensureSeeded(): CategoryEntry[] {
  const existing = readCurrent();
  if (existing && existing.length > 0) return existing;
  writeCurrent(SEED);
  return SEED;
}

interface CategoriesState {
  items: CategoryEntry[];
  addCustom: (payload: { name: string; color: string }) => CategoryEntry;
  remove: (id: string) => void;
  update: (id: string, patch: { name?: string; color?: string }) => void;
}

const useCategoriesStoreBase = create<CategoriesState>((set, get) => ({
  items: ensureSeeded(),
  addCustom: (payload) => {
    const entry: CategoryEntry = {
      id: `custom_${Date.now()}`,
      name: payload.name,
      color: payload.color,
      isStandard: false,
      isLocked: false,
    };
    const next = [...get().items, entry];
    writeCurrent(next);
    set({ items: next });
    return entry;
  },
  remove: (id) => {
    const target = get().items.find((entry) => entry.id === id);
    if (!target || target.isLocked) return;
    const next = get().items.filter((entry) => entry.id !== id);
    writeCurrent(next);
    set({ items: next });
  },
  update: (id, patch) => {
    const target = get().items.find((entry) => entry.id === id);
    if (!target) return;
    const nextEntry: CategoryEntry = {
      ...target,
      name: target.isLocked ? target.name : (patch.name ?? target.name),
      color: patch.color ?? target.color,
    };
    const next = get().items.map((entry) => (entry.id === id ? nextEntry : entry));
    writeCurrent(next);
    set({ items: next });
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      useCategoriesStoreBase.setState({ items: ensureSeeded() });
    }
  });
}

export const categoriesStore = {
  loadAll(): CategoryEntry[] {
    return useCategoriesStoreBase.getState().items;
  },
  addCustom(payload: { name: string; color: string }): CategoryEntry {
    return useCategoriesStoreBase.getState().addCustom(payload);
  },
  remove(id: string): void {
    useCategoriesStoreBase.getState().remove(id);
  },
  update(id: string, patch: { name?: string; color?: string }): void {
    useCategoriesStoreBase.getState().update(id, patch);
  },
  getColor(key: TxCategory): string {
    const entry = useCategoriesStoreBase.getState().items.find((item) => item.id === key);
    if (entry) return entry.color;
    const fallback = useCategoriesStoreBase.getState().items.find((item) => item.id === DEFAULT_CATEGORY_KEY);
    return fallback?.color ?? tokens.color.cat5;
  },
  subscribe(listener: (items: CategoryEntry[]) => void): () => void {
    return useCategoriesStoreBase.subscribe((state) => listener(state.items));
  },
};

export function useCategoriesStore(): CategoryEntry[] {
  return useCategoriesStoreBase((state) => state.items);
}

export function useCategoryColorMap(): Record<TxCategory, string> {
  const items = useCategoriesStore();
  const map: Record<TxCategory, string> = {
    living: tokens.color.cat2,
    fashion: tokens.color.cat1,
    digital: tokens.color.cat4,
    food: tokens.color.cat3,
    etc: tokens.color.cat5,
  };
  for (const entry of items) {
    if (entry.id === "living" || entry.id === "fashion" || entry.id === "digital" || entry.id === "food" || entry.id === "etc") {
      map[entry.id] = entry.color;
    }
  }
  return map;
}
