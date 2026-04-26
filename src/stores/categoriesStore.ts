/**
 * 역할: 설정 화면의 카테고리 상태를 Zustand + localStorage 기반으로 보관합니다.
 *       기존 categoriesStore API와 훅 형태를 유지해 호출부 변경을 최소화합니다.
 *
 *       v2에서 conceptIds 필드를 추가해 가맹점명 기반 카테고리 자동추정과 연결합니다.
 *       표준 카테고리는 seed에서 적절한 개념에 기본 바인딩되고, 사용자가 새 카테고리를
 *       추가할 때도 이름 유사도로 후보 개념을 제안해 연결할 수 있게 해뒀습니다.
 * 위치: src\stores\categoriesStore.ts
 */
import { create } from "zustand";
import { tokens } from "../styles/tokens";
import { CATEGORY_LABELS, DEFAULT_CATEGORY_KEY } from "../constants/labels";
import type { ConceptId } from "../data/categoryConcepts";
import { auth } from "../lib/firebase";
import { addCategory, removeCategory, updateCategory } from "../lib/firebaseRepository";

export interface CategoryEntry {
  id: string;
  name: string;
  color: string;
  isStandard: boolean;
  isLocked: boolean;
  /**
   * 이 카테고리가 "빨아들이는" 개념 id 목록. 가맹점이 여기 명시된 개념에 매칭되면
   * 저장 경계에서 이 카테고리로 자동 분류됩니다. 비어 있으면 자동추정 대상이 아님.
   */
  conceptIds: ConceptId[];
}

// conceptIds 도입으로 스키마가 바뀌어 v2로 bump. 구버전(v1) 데이터는 자동 마이그레이션하여
// 표준 카테고리에 기본 바인딩을 채워 넣습니다.
const STORAGE_KEY = "spendtrack:categories:v2";
const LEGACY_STORAGE_KEY = "spendtrack:categories:v1";

/**
 * 표준 카테고리 기본 개념 바인딩. 사용자가 따로 손대기 전까지 이 매핑으로 자동 분류됩니다.
 * - food:    카페/배달/외식/편의점 (기존 "식품/음료" 의미에 가까운 개념들)
 * - living:  마트 (생활용품 장보기 중심)
 * - fashion: 의류 브랜드
 * - digital: 전자기기/애플스토어
 * - etc:     아무 개념도 안 묶음 (자동추정 대상 아님)
 */
const STANDARD_CONCEPT_BINDINGS: Record<string, ConceptId[]> = {
  food: ["cafe", "delivery", "restaurant", "convenience"],
  living: ["mart"],
  fashion: ["fashion"],
  digital: ["digital"],
  etc: [],
};

export const DEFAULT_CATEGORIES: CategoryEntry[] = [
  {
    id: DEFAULT_CATEGORY_KEY,
    name: CATEGORY_LABELS.etc,
    color: tokens.color.cat5,
    isStandard: true,
    isLocked: true,
    conceptIds: STANDARD_CONCEPT_BINDINGS.etc,
  },
  {
    id: "living",
    name: CATEGORY_LABELS.living,
    color: tokens.color.cat2,
    isStandard: true,
    isLocked: false,
    conceptIds: STANDARD_CONCEPT_BINDINGS.living,
  },
  {
    id: "fashion",
    name: CATEGORY_LABELS.fashion,
    color: tokens.color.cat1,
    isStandard: true,
    isLocked: false,
    conceptIds: STANDARD_CONCEPT_BINDINGS.fashion,
  },
  {
    id: "digital",
    name: CATEGORY_LABELS.digital,
    color: tokens.color.cat4,
    isStandard: true,
    isLocked: false,
    conceptIds: STANDARD_CONCEPT_BINDINGS.digital,
  },
  {
    id: "food",
    name: CATEGORY_LABELS.food,
    color: tokens.color.cat3,
    isStandard: true,
    isLocked: false,
    conceptIds: STANDARD_CONCEPT_BINDINGS.food,
  },
];

/**
 * v1 → v2 이행: 예전에는 conceptIds가 없던 시절의 localStorage 레코드를 표준 매핑으로 되살립니다.
 * 사용자 커스텀 카테고리는 conceptIds를 빈 배열로 남겨 두고, 모달에서 별도로 바인딩하게 둡니다.
 */
function migrateEntry(entry: CategoryEntry | (Omit<CategoryEntry, "conceptIds"> & Partial<Pick<CategoryEntry, "conceptIds">>)): CategoryEntry {
  if (Array.isArray((entry as CategoryEntry).conceptIds)) {
    return entry as CategoryEntry;
  }
  const fallback = STANDARD_CONCEPT_BINDINGS[entry.id] ?? [];
  return { ...(entry as CategoryEntry), conceptIds: fallback };
}

function readCurrent(): CategoryEntry[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return (parsed as CategoryEntry[]).map(migrateEntry);
      return null;
    }
    // v2가 비어 있으면 v1을 탐색해 옮겨 담는다.
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (Array.isArray(legacy)) {
        const migrated = (legacy as CategoryEntry[]).map(migrateEntry);
        writeCurrent(migrated);
        return migrated;
      }
    }
    return null;
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
  writeCurrent(DEFAULT_CATEGORIES);
  return DEFAULT_CATEGORIES;
}

interface CategoriesState {
  items: CategoryEntry[];
  addCustom: (payload: { name: string; color: string; conceptIds?: ConceptId[] }) => CategoryEntry;
  remove: (id: string) => void;
  update: (
    id: string,
    patch: { name?: string; color?: string; conceptIds?: ConceptId[] }
  ) => void;
  hydrate: (items: CategoryEntry[]) => CategoryEntry[];
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
      conceptIds: payload.conceptIds ?? [],
    };
    // 같은 개념이 기존 카테고리에 이미 바인딩돼 있으면 중복을 피하기 위해 기존에서 떼어낸다.
    // (한 개념은 한 카테고리에만 쓰여야 자동 분류가 결정적이다.)
    const next = reassignConcepts(get().items, entry);
    writeCurrent(next);
    set({ items: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      void addCategory(uid, entry);
    }
    return entry;
  },
  remove: (id) => {
    const target = get().items.find((entry) => entry.id === id);
    if (!target || target.isLocked) return;
    const next = get().items.filter((entry) => entry.id !== id);
    writeCurrent(next);
    set({ items: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      void removeCategory(uid, id);
    }
  },
  update: (id, patch) => {
    const target = get().items.find((entry) => entry.id === id);
    if (!target) return;
    const nextEntry: CategoryEntry = {
      ...target,
      name: target.isLocked ? target.name : (patch.name ?? target.name),
      color: patch.color ?? target.color,
      conceptIds: patch.conceptIds ?? target.conceptIds,
    };
    // conceptIds가 바뀌었으면 충돌 해소를 돌린다.
    const needsReassign = patch.conceptIds !== undefined;
    const base = get().items.map((entry) => (entry.id === id ? nextEntry : entry));
    const next = needsReassign ? reassignConcepts(base, nextEntry) : base;
    writeCurrent(next);
    set({ items: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      void updateCategory(uid, id, nextEntry);
    }
  },
  hydrate: (items) => {
    writeCurrent(items);
    set({ items });
    return items;
  },
}));

/**
 * 한 개념이 여러 카테고리에 동시에 묶이지 않도록 보정합니다.
 * `target`이 주장하는 conceptIds는 그대로 두고, 다른 카테고리에서는 같은 개념을 제거합니다.
 */
function reassignConcepts(
  items: CategoryEntry[],
  target: CategoryEntry
): CategoryEntry[] {
  const claimed = new Set(target.conceptIds);
  return items.map((entry) => {
    if (entry.id === target.id) return target;
    if (entry.conceptIds.length === 0) return entry;
    const filtered = entry.conceptIds.filter((cid) => !claimed.has(cid));
    if (filtered.length === entry.conceptIds.length) return entry;
    return { ...entry, conceptIds: filtered };
  });
}

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
  addCustom(payload: { name: string; color: string; conceptIds?: ConceptId[] }): CategoryEntry {
    return useCategoriesStoreBase.getState().addCustom(payload);
  },
  remove(id: string): void {
    useCategoriesStoreBase.getState().remove(id);
  },
  update(
    id: string,
    patch: { name?: string; color?: string; conceptIds?: ConceptId[] }
  ): void {
    useCategoriesStoreBase.getState().update(id, patch);
  },
  hydrate(items: CategoryEntry[]): CategoryEntry[] {
    return useCategoriesStoreBase.getState().hydrate(items);
  },
  /**
   * 추정 유틸에 주입할 바인딩 스냅샷. CategoryEntry 전체를 흘리지 않고 필요한 필드만.
   */
  getBindings(): Array<{ categoryId: string; conceptIds: ConceptId[] }> {
    return useCategoriesStoreBase.getState().items.map((entry) => ({
      categoryId: entry.id,
      conceptIds: entry.conceptIds,
    }));
  },
  getColor(key: string): string {
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

export function useCategoryColorMap(): Record<string, string> {
  const items = useCategoriesStore();
  const map: Record<string, string> = {};
  for (const entry of items) {
    map[entry.id] = entry.color;
  }
  return map;
}
