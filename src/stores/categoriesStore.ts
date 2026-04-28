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
import { trackBackgroundSync } from "../lib/firebaseBackgroundSync";
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
  /*
   * 가계부 흐름 카테고리(2026-04-28):
   *  - utility:     공과금 concept 자체. 통신은 의도적으로 미바인딩(별도 추적 원하는 사용자 多).
   *  - maintenance: 관리비 concept.
   *  - education:   교육비 concept.
   * 한 개념이 여러 카테고리에 동시 묶이지 않도록 utility 의 통신은 빼두고, 사용자가 원할 때만
   * 설정에서 직접 바인딩하도록 둡니다(reassignConcepts 가 충돌 시 한쪽으로 정리).
   */
  utility: ["utility"],
  maintenance: ["maintenance"],
  education: ["education"],
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
  /*
   * 고정 카테고리(2026-04-28 잠금 정책 변경): utility/maintenance/education 은
   * EssentialStrip / 분석 / Home 인사이트 텍스트가 "이 키가 존재한다" 는 가정으로 합산
   * 키와 라벨을 박아두는 가계부 핵심 흐름이라, 사용자가 삭제하면 합계가 0 으로 떨어지고
   * "왜 공과금이 트래킹 안 되지?" 회귀가 발생합니다. etc 와 같은 정책으로 isLocked=true
   * 로 잠가 색·이름·삭제 모두 막습니다(설정 화면이 isLocked 행에서 수정/삭제 버튼을
   * 숨기고 LockBadge "기본" 을 노출).
   *
   * 색상 변경이 막히는 건 일부 사용자에게 약간의 제약이지만, "공과금 카테고리 색을 다른
   * 카테고리와 같은 톤으로 맞추고 싶다" 류의 요청이 있으면 그때 isLocked 정책을 다시
   * 검토. 지금은 회귀 차단을 우선합니다.
   */
  {
    id: "utility",
    name: CATEGORY_LABELS.utility,
    color: tokens.color.cat6,
    isStandard: true,
    isLocked: true,
    conceptIds: STANDARD_CONCEPT_BINDINGS.utility,
  },
  {
    id: "maintenance",
    name: CATEGORY_LABELS.maintenance,
    color: tokens.color.cat7,
    isStandard: true,
    isLocked: true,
    conceptIds: STANDARD_CONCEPT_BINDINGS.maintenance,
  },
  {
    id: "education",
    name: CATEGORY_LABELS.education,
    color: tokens.color.cat8,
    isStandard: true,
    isLocked: true,
    conceptIds: STANDARD_CONCEPT_BINDINGS.education,
  },
];

/**
 * v1 → v2 이행: 예전에는 conceptIds가 없던 시절의 localStorage 레코드를 표준 매핑으로 되살립니다.
 * 사용자 커스텀 카테고리는 conceptIds를 빈 배열로 남겨 두고, 모달에서 별도로 바인딩하게 둡니다.
 */
function migrateEntry(entry: CategoryEntry | (Omit<CategoryEntry, "conceptIds"> & Partial<Pick<CategoryEntry, "conceptIds">>)): CategoryEntry {
  let next: CategoryEntry;
  if (Array.isArray((entry as CategoryEntry).conceptIds)) {
    next = entry as CategoryEntry;
  } else {
    const fallback = STANDARD_CONCEPT_BINDINGS[entry.id] ?? [];
    next = { ...(entry as CategoryEntry), conceptIds: fallback };
  }
  /*
   * isLocked 보정(2026-04-28). 잠금 정책이 utility/maintenance/education 까지 확장되면서
   * 이미 1차 v2 마이그레이션을 거친 사용자는 isLocked=false 로 박혀있을 수 있습니다.
   * 표준 카테고리의 잠금 상태는 DEFAULT_CATEGORIES 가 단일 진실원이므로, 표준 키이면
   * 거기 정의된 isLocked 값으로 덮어씁니다(사용자 커스텀 카테고리는 미변동).
   */
  const standard = DEFAULT_CATEGORIES.find((d) => d.id === next.id);
  if (standard && next.isLocked !== standard.isLocked) {
    next = { ...next, isLocked: standard.isLocked, isStandard: true };
  }
  return next;
}

/**
 * 모든 store mutation 진입점에서 한 번 거치는 normalize 단계(2026-04-28 추가).
 *
 * 회귀 배경: migrateEntry 는 readCurrent 첫 진입에서만 적용되고 hydrate(Firebase sync) /
 * update / addCustom 경로는 거치지 않았습니다. 그 결과 표준 카테고리(utility/maintenance/
 * education) 가 isLocked=false 로 박힌 v2 storage 가 hydrate 로 들어오면 회색 처리·수정
 * 잠금이 안 걸리는 회귀가 발생.
 *
 * 정책: 표준 키(DEFAULT_CATEGORIES 의 id) 이면 isStandard=true / isLocked 도 DEFAULT 의
 * 값으로 강제. 사용자 커스텀 카테고리(custom_*) 는 건드리지 않습니다.
 */
function normalizeStandardLockState(items: CategoryEntry[]): CategoryEntry[] {
  let changed = false;
  const next = items.map((entry) => {
    const standard = DEFAULT_CATEGORIES.find((d) => d.id === entry.id);
    if (!standard) return entry;
    if (entry.isLocked === standard.isLocked && entry.isStandard === true) return entry;
    changed = true;
    return { ...entry, isStandard: true, isLocked: standard.isLocked };
  });
  return changed ? next : items;
}

/**
 * 기존 사용자에게 신규 표준 카테고리(2026-04-28: utility/maintenance/education) 를
 * 자동 보충합니다. 이미 들어 있으면 noop. v2 storage 자체를 다시 bump 하지 않고
 * "결과 배열에 누락된 표준만 끼워 넣는" 식 — 사용자가 직접 만든 custom_* 항목은
 * 건드리지 않고 표준 행 사이에만 안전하게 삽입.
 */
function ensureNewStandards(items: CategoryEntry[]): CategoryEntry[] {
  const existingIds = new Set(items.map((e) => e.id));
  const missing = DEFAULT_CATEGORIES.filter((d) => !existingIds.has(d.id));
  if (missing.length === 0) return items;
  // 표준 그룹은 STANDARD_CATEGORY_ORDER 순으로 위쪽에 모이니, 그 뒤에 custom 이 이어지도록
  // missing 을 표준 그룹 끝(첫 custom 등장 직전) 에 삽입.
  const firstCustomIdx = items.findIndex((e) => !e.isStandard);
  if (firstCustomIdx === -1) return [...items, ...missing];
  return [...items.slice(0, firstCustomIdx), ...missing, ...items.slice(firstCustomIdx)];
}

function readCurrent(): CategoryEntry[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const migrated = (parsed as CategoryEntry[]).map(migrateEntry);
        const enriched = normalizeStandardLockState(ensureNewStandards(migrated));
        // 변경(추가/잠금 보정) 이 발생했으면 storage 도 같이 새로 써서 다음 로드 때 일관.
        if (enriched !== migrated) writeCurrent(enriched);
        return enriched;
      }
      return null;
    }
    // v2가 비어 있으면 v1을 탐색해 옮겨 담는다.
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (Array.isArray(legacy)) {
        const migrated = (legacy as CategoryEntry[]).map(migrateEntry);
        const enriched = normalizeStandardLockState(ensureNewStandards(migrated));
        writeCurrent(enriched);
        return enriched;
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
    const next = normalizeStandardLockState(reassignConcepts(get().items, entry));
    writeCurrent(next);
    set({ items: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      trackBackgroundSync(addCategory(uid, entry));
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
      trackBackgroundSync(removeCategory(uid, id));
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
    const next = normalizeStandardLockState(
      needsReassign ? reassignConcepts(base, nextEntry) : base,
    );
    writeCurrent(next);
    set({ items: next });
    const uid = auth.currentUser?.uid;
    if (uid) {
      trackBackgroundSync(updateCategory(uid, id, nextEntry));
    }
  },
  hydrate: (items) => {
    /*
     * Firebase sync 등 외부 경로에서 들어오는 items 도 표준 키 잠금 상태를 한 번 더
     * 보정합니다(2026-04-28). 이전에는 hydrate 가 입력값을 그대로 setState 해서
     * 표준 카테고리(utility/maintenance/education) 가 isLocked=false 로 박힌 외부
     * 데이터에 그대로 덮여 회색 잠금 처리가 풀리는 회귀가 있었습니다.
     */
    const normalized = normalizeStandardLockState(items);
    writeCurrent(normalized);
    set({ items: normalized });
    return normalized;
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

export function useCategoryNameMap(): Record<string, string> {
  const items = useCategoriesStore();
  const map: Record<string, string> = {};
  for (const entry of items) {
    map[entry.id] = entry.name;
  }
  return map;
}
