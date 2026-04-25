/**
 * 역할: 가맹점명 + 사용자 카테고리 바인딩 + 학습 캐시를 조합해 TxCategory를 추정하는 순수 유틸.
 *       - 저장 경계(transactionsStore.addFromImport)에서 호출되고,
 *       - 입력 파싱 경로(CSV/OCR)와는 독립적이라 파싱 쪽 리팩터와 물리적으로 분리돼 있다.
 *
 * 위치: src/utils/categoryInference.ts
 *
 * 판단 우선순위:
 *   1) 사용자 학습 캐시 (merchant → TxCategory) — 사용자가 명시적으로 바꾼 기록이면 최우선
 *   2) 개념 매칭 → 사용자 카테고리 중 그 개념에 바인딩된 것 선택
 *   3) 개념 매칭 → 해당 개념의 fallbackStandard가 표준 5개 중 하나이고 사용자 카테고리 목록에 존재하면 그것
 *   4) null (호출부가 "etc"로 떨어뜨림)
 */

import type { TxCategory } from "../pages/Transactions/components/TransactionTable";
import {
  type ConceptId,
  CONCEPT_BY_ID,
  detectConcept,
} from "../data/categoryConcepts";

/** 카테고리 바인딩 스냅샷 — categoriesStore에서 읽어 순수 함수에 주입한다. */
export interface CategoryBinding {
  /** 사용자 카테고리 id (표준은 "food" | "fashion" | ... 또는 "custom_XXXX"). */
  categoryId: TxCategory;
  /** 이 카테고리가 빨아들이는 개념 id 목록. 비어 있으면 룰 적용 대상 아님. */
  conceptIds: ConceptId[];
}

export interface InferenceContext {
  /** 현재 사용자가 가지고 있는 카테고리 목록 + 각각의 개념 바인딩. */
  bindings: CategoryBinding[];
  /**
   * 사용자가 과거에 수정한 "정규화된 가맹점명 → 선택한 카테고리" 매핑.
   * 여기 있는 가맹점이 들어오면 룰보다 우선해서 그대로 쓴다.
   */
  learnedMap: Record<string, TxCategory>;
}

/** 가맹점명 정규화 — 학습 캐시 키 & 룰 매칭 모두에 같은 규칙을 쓴다. */
export function normalizeMerchantKey(merchant: string): string {
  return merchant
    .toLowerCase()
    .replace(/\(주\)|\(유\)|주식회사/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "이 거래의 카테고리가 자동추정 대상인가" 판정.
 * - 비어 있음 → 대상
 * - `["etc"]` 단일 → 대상 (CSV에서 카테고리 칸이 비어도, 카드사가 '기타'로 찍어도 똑같이 etc로 오므로 함께 처리)
 * - 그 외(사용자가 명시적으로 고른 값) → 건너뜀
 */
export function shouldInferCategory(current: TxCategory[] | undefined | null): boolean {
  if (!current || current.length === 0) return true;
  return current.length === 1 && current[0] === "etc";
}

/**
 * 순수 추정 함수. 가맹점명을 가지고 사용자 카테고리 하나를 고른다.
 *
 * @returns 추정된 TxCategory, 또는 아무 규칙에도 안 잡히면 null.
 */
export function inferCategory(
  merchant: string,
  ctx: InferenceContext
): TxCategory | null {
  const key = normalizeMerchantKey(merchant);
  if (!key) return null;

  // 1) 학습 캐시 최우선
  const learned = ctx.learnedMap[key];
  if (learned && ctx.bindings.some((b) => b.categoryId === learned)) {
    return learned;
  }

  // 2) 개념 매칭
  const conceptId = detectConcept(merchant);
  if (conceptId) {
    // 2-a) 해당 개념에 명시적으로 바인딩된 사용자 카테고리
    const bound = ctx.bindings.find((b) => b.conceptIds.includes(conceptId));
    if (bound) return bound.categoryId;

    // 2-b) 개념의 기본 표준 카테고리가 사용자 목록에 있으면 그걸로 폴백
    const concept = CONCEPT_BY_ID[conceptId];
    const standardFallback = concept.fallbackStandard as TxCategory;
    if (standardFallback !== "etc" && ctx.bindings.some((b) => b.categoryId === standardFallback)) {
      return standardFallback;
    }
  }

  // 3) 결정 불가 → 호출부가 etc로 두게 null
  return null;
}
