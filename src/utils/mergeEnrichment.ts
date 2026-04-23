/**
 * 역할: "같은 거래"로 확인된 두 건(사용자의 새 입력 vs 이미 저장된 기존 거래) 사이에서
 *       어떤 필드를 기존 레코드에 옮겨 심을 수 있는지 계산합니다.
 *
 *       1) 기존이 "비어 있음"에 해당하면 새 값으로 자동 채움(auto-fill).
 *       2) 둘 다 값이 있는데 서로 다르면 "충돌"로 분류해 사용자에게 어느 쪽을 남길지 물어봅니다.
 *       3) 새 아이템(detail.items)은 기존에 없는 name만 골라 추가 제안합니다.
 *
 *       원칙적으로 "기존 값은 함부로 덮어쓰지 않는다"가 기본이고, 덮어쓰기는 사용자가 명시적으로
 *       선택할 때만 발생합니다. 덕분에 수동으로 세심하게 다듬어 둔 거래 기록이 나중 입력에 의해
 *       소리 없이 바뀌는 사고를 구조적으로 차단합니다.
 * 위치: src/utils/mergeEnrichment.ts
 */
import type {
  TxCategory,
  TxPlatform,
  TxRow,
} from "../pages/Transactions/components/TransactionTable";
import type { ItemDiffEntry } from "./duplicateCheck";

/** 충돌·보강 대상이 되는 필드 키. products는 별도 흐름으로 처리해서 제외. */
export type EnrichableField = "platform" | "memo" | "categories";

/** 기존 거래에 옮겨 심을 수 있는 "자동 보강" 항목. */
export interface AutoFill {
  field: EnrichableField;
  /** 기존에 저장돼 있던 값(비어 있음을 나타내는 값). */
  existingDisplay: string;
  /** 새 입력이 제안하는 값. */
  incomingDisplay: string;
  /** updateOne에 넘길 수 있는 패치 조각. */
  patch: Partial<TxRow>;
}

/** 사용자 개입이 필요한 충돌 항목. */
export interface ConflictItem {
  field: EnrichableField;
  existingDisplay: string;
  incomingDisplay: string;
  /** "새 값으로 교체" 선택 시 적용할 패치. */
  incomingPatch: Partial<TxRow>;
}

export interface EnrichmentPlan {
  autoFills: AutoFill[];
  conflicts: ConflictItem[];
  /** 기존 거래에 추가할 "새 아이템" 목록(existing에 같은 name이 없는 incoming.items). */
  newItems: ItemDiffEntry[];
  /** 아무것도 보강할 게 없음(완전 동일) → 단순 "이미 등록된 거래" 안내로 끝낼 수 있음. */
  isEmpty: boolean;
}

/** "unspecified"는 의도적 빈 값. mapPlatform이 이 값을 폴백으로 쓰기 때문에 "없음"으로 취급합니다. */
function isPlatformEmpty(platform: TxPlatform): boolean {
  return platform === "unspecified";
}

/** 사용자가 아무 것도 고르지 않았을 때의 기본값이 ["etc"]라 "의미 있는" 카테고리가 있는지 따로 검사합니다. */
function hasMeaningfulCategory(categories: TxCategory[]): boolean {
  return categories.some((cat) => cat !== "etc");
}

function sameCategorySet(a: TxCategory[], b: TxCategory[]): boolean {
  if (a.length !== b.length) return false;
  const aSorted = [...a].sort();
  const bSorted = [...b].sort();
  return aSorted.every((value, idx) => value === bSorted[idx]);
}

const PLATFORM_LABEL_MAP: Record<TxPlatform, string> = {
  coupang: "쿠팡",
  naver: "네이버쇼핑",
  musinsa: "무신사",
  unspecified: "미지정",
};

const CATEGORY_LABEL_MAP: Record<TxCategory, string> = {
  living: "생활용품",
  fashion: "패션/의류",
  digital: "전자기기",
  food: "식품/음료",
  etc: "기타",
};

function categoriesDisplay(categories: TxCategory[]): string {
  if (categories.length === 0) return "(없음)";
  return categories.map((c) => CATEGORY_LABEL_MAP[c]).join(", ");
}

/**
 * incoming(새 입력)과 existing(기존 거래)을 비교해 보강 가능한 필드를 분류합니다.
 * 호출부는 autoFills는 즉시 적용하고, conflicts만 모달에 넘기는 흐름을 씁니다.
 */
export function planEnrichment(incoming: TxRow, existing: TxRow): EnrichmentPlan {
  const autoFills: AutoFill[] = [];
  const conflicts: ConflictItem[] = [];

  // ── platform ─────────────────────────────────────────────
  if (incoming.platform !== existing.platform) {
    if (isPlatformEmpty(existing.platform) && !isPlatformEmpty(incoming.platform)) {
      // 기존이 "미지정" → 새 값으로 채움.
      autoFills.push({
        field: "platform",
        existingDisplay: PLATFORM_LABEL_MAP.unspecified,
        incomingDisplay: PLATFORM_LABEL_MAP[incoming.platform],
        patch: { platform: incoming.platform },
      });
    } else if (
      !isPlatformEmpty(existing.platform) &&
      !isPlatformEmpty(incoming.platform)
    ) {
      // 둘 다 구체적인 플랫폼인데 서로 다름 → 충돌.
      conflicts.push({
        field: "platform",
        existingDisplay: PLATFORM_LABEL_MAP[existing.platform],
        incomingDisplay: PLATFORM_LABEL_MAP[incoming.platform],
        incomingPatch: { platform: incoming.platform },
      });
    }
    // incoming이 unspecified인데 existing이 구체적 → existing이 더 풍부하므로 변화 없음.
  }

  // ── memo ─────────────────────────────────────────────────
  const existingMemo = (existing.memo ?? "").trim();
  const incomingMemo = (incoming.memo ?? "").trim();
  if (incomingMemo && incomingMemo !== existingMemo) {
    if (!existingMemo) {
      autoFills.push({
        field: "memo",
        existingDisplay: "(비어 있음)",
        incomingDisplay: incomingMemo,
        patch: { memo: incomingMemo },
      });
    } else {
      conflicts.push({
        field: "memo",
        existingDisplay: existingMemo,
        incomingDisplay: incomingMemo,
        incomingPatch: { memo: incomingMemo },
      });
    }
  }

  // ── categories ───────────────────────────────────────────
  if (!sameCategorySet(existing.categories, incoming.categories)) {
    const existingHasMeaningful = hasMeaningfulCategory(existing.categories);
    const incomingHasMeaningful = hasMeaningfulCategory(incoming.categories);
    if (!existingHasMeaningful && incomingHasMeaningful) {
      // 기존은 ["etc"]뿐 → 새 입력의 의미 있는 카테고리로 교체.
      autoFills.push({
        field: "categories",
        existingDisplay: categoriesDisplay(existing.categories),
        incomingDisplay: categoriesDisplay(incoming.categories),
        patch: { categories: [...incoming.categories] },
      });
    } else if (existingHasMeaningful && incomingHasMeaningful) {
      // 둘 다 구체적인데 다름 → 충돌.
      conflicts.push({
        field: "categories",
        existingDisplay: categoriesDisplay(existing.categories),
        incomingDisplay: categoriesDisplay(incoming.categories),
        incomingPatch: { categories: [...incoming.categories] },
      });
    }
    // incoming이 덜 구체적이면 변화 없음.
  }

  // ── detail.items ────────────────────────────────────────
  const existingItems = existing.detail?.items ?? [];
  const existingNames = new Set(existingItems.map((item) => item.name));
  const newItems: ItemDiffEntry[] = (incoming.detail?.items ?? [])
    .filter((item) => !existingNames.has(item.name))
    .map((item) => ({ name: item.name, price: item.price, link: item.link }));

  return {
    autoFills,
    conflicts,
    newItems,
    isEmpty:
      autoFills.length === 0 && conflicts.length === 0 && newItems.length === 0,
  };
}

/**
 * 여러 patch 조각을 합쳐 하나의 Partial<TxRow>로 반환합니다.
 * 같은 필드가 겹치면 뒤에 오는 패치가 이깁니다.
 */
export function combinePatches(patches: Array<Partial<TxRow>>): Partial<TxRow> {
  return patches.reduce((acc, patch) => ({ ...acc, ...patch }), {} as Partial<TxRow>);
}

export const ENRICHABLE_FIELD_LABEL: Record<EnrichableField, string> = {
  platform: "플랫폼",
  memo: "메모",
  categories: "카테고리",
};
