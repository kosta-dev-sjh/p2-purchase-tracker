/**
 * 역할: 설정 화면의 카테고리(이름 + 색상) 상태를 localStorage 기반으로 보관하는 간이 스토어.
 *       - 설정 · 카테고리 섹션이 편집 주체이고, 분석/거래 내역 등 다른 화면은 여기서 색상을 읽어
 *         사용자가 고른 색이 전역에 반영되도록 합니다.
 *       - 표준 5종(living/fashion/digital/food/etc) 키는 TxCategory와 1:1 대응되며,
 *         기타(etc)는 isLocked=true로 잠겨 삭제되지 않습니다.
 *       - 사용자 정의 카테고리는 `custom_` 접두사 id로 구분되고, 표준 카테고리는 아니기 때문에
 *         실제 거래 집계에는 아직 포함되지 않습니다(데모 범위).
 *       - transactionsStore와 동일한 리스너 패턴을 써서 훅 구독자에게 즉시 반영합니다.
 * 위치: src\stores\categoriesStore.ts
 */
import { useEffect, useState } from "react";
import { tokens } from "../styles/tokens";
import {
  CATEGORY_LABELS,
  DEFAULT_CATEGORY_KEY,
} from "../constants/labels";
import type { TxCategory } from "../pages/Transactions/components/TransactionTable";

/**
 * 한 카테고리 엔트리의 스키마. id가 TxCategory union에 속하면 표준 카테고리이고,
 * 그 외(custom_로 시작)는 사용자가 추가한 카테고리입니다.
 */
export interface CategoryEntry {
  id: string;
  name: string;
  color: string;
  isStandard: boolean;
  /** true면 UI에서 삭제 버튼을 숨기고 행 자체를 잠금 처리합니다. 현재는 "기타"만 해당. */
  isLocked: boolean;
}

// v1: 카테고리 스토어 초기 버전. 스키마가 바뀌면 버전 접미사를 올려 기존 캐시를 자연스럽게 재시드합니다.
const STORAGE_KEY = "spendtrack:categories:v1";

/**
 * 초기 카테고리 집합. 기타(etc)는 목록 상단에 고정해 "기본값"이라는 정체성을
 * 설정 UI 첫 줄에서 바로 인지할 수 있게 배치합니다.
 */
const SEED: CategoryEntry[] = [
  {
    id: DEFAULT_CATEGORY_KEY,
    name: CATEGORY_LABELS.etc,
    color: tokens.color.cat5,
    isStandard: true,
    isLocked: true,
  },
  {
    id: "living",
    name: CATEGORY_LABELS.living,
    color: tokens.color.cat2,
    isStandard: true,
    isLocked: false,
  },
  {
    id: "fashion",
    name: CATEGORY_LABELS.fashion,
    color: tokens.color.cat1,
    isStandard: true,
    isLocked: false,
  },
  {
    id: "digital",
    name: CATEGORY_LABELS.digital,
    color: tokens.color.cat4,
    isStandard: true,
    isLocked: false,
  },
  {
    id: "food",
    name: CATEGORY_LABELS.food,
    color: tokens.color.cat3,
    isStandard: true,
    isLocked: false,
  },
];

type Listener = (items: CategoryEntry[]) => void;
const listeners = new Set<Listener>();

function readRaw(): CategoryEntry[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CategoryEntry[]) : null;
  } catch {
    return null;
  }
}

function writeRaw(items: CategoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  listeners.forEach((listener) => listener(items));
}

function ensureSeeded(): CategoryEntry[] {
  const existing = readRaw();
  if (existing && existing.length > 0) return existing;
  writeRaw(SEED);
  return SEED;
}

export const categoriesStore = {
  loadAll(): CategoryEntry[] {
    return ensureSeeded();
  },
  /**
   * 새 카테고리를 추가합니다. id 충돌이 없도록 타임스탬프를 섞어 만듭니다.
   * 사용자 정의 카테고리이므로 isStandard=false, isLocked=false로 고정합니다.
   */
  addCustom(payload: { name: string; color: string }): CategoryEntry {
    const current = ensureSeeded();
    const entry: CategoryEntry = {
      id: `custom_${Date.now()}`,
      name: payload.name,
      color: payload.color,
      isStandard: false,
      isLocked: false,
    };
    writeRaw([...current, entry]);
    return entry;
  },
  /**
   * 특정 카테고리를 제거합니다. 잠긴(isLocked) 항목은 보호되어 변경 없이 반환합니다.
   */
  remove(id: string): void {
    const current = ensureSeeded();
    const target = current.find((entry) => entry.id === id);
    if (!target || target.isLocked) return;
    writeRaw(current.filter((entry) => entry.id !== id));
  },
  /**
   * 카테고리의 이름과 색상을 업데이트합니다.
   * - 잠긴(기타) 항목은 색상만 바꾸고 이름은 유지해 시스템 라벨을 보호합니다.
   * - 표준 카테고리(living/fashion/...)는 이름과 색 모두 자유롭게 바꿀 수 있습니다.
   *   이름이 바뀌어도 거래는 키(id)로 묶여 있어 데이터 무결성에 영향이 없습니다.
   */
  update(id: string, patch: { name?: string; color?: string }): void {
    const current = ensureSeeded();
    const target = current.find((entry) => entry.id === id);
    if (!target) return;
    const next: CategoryEntry = {
      ...target,
      // 잠긴 항목은 시스템 라벨이라 이름 변경을 막습니다.
      name: target.isLocked ? target.name : (patch.name ?? target.name),
      color: patch.color ?? target.color,
    };
    writeRaw(current.map((entry) => (entry.id === id ? next : entry)));
  },
  /**
   * 표준 카테고리 키로부터 현재 색상을 조회합니다. 표준 키가 없으면 기타 색을 폴백으로 반환합니다.
   */
  getColor(key: TxCategory): string {
    const current = ensureSeeded();
    const entry = current.find((item) => item.id === key);
    if (entry) return entry.color;
    const fallback = current.find((item) => item.id === DEFAULT_CATEGORY_KEY);
    return fallback?.color ?? tokens.color.cat5;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/**
 * 전체 카테고리 목록을 구독하는 훅. 다른 탭의 변경은 storage 이벤트로 반영됩니다.
 */
export function useCategoriesStore(): CategoryEntry[] {
  const [items, setItems] = useState<CategoryEntry[]>(() => categoriesStore.loadAll());

  useEffect(() => {
    const unsubscribe = categoriesStore.subscribe(setItems);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setItems(categoriesStore.loadAll());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return items;
}

/**
 * 표준 카테고리 키 → 색상 맵을 반환하는 훅.
 * 분석 · 거래 내역 화면이 모든 거래에 대해 색을 상수처럼 조회할 수 있도록 Record 형태로 제공합니다.
 */
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
