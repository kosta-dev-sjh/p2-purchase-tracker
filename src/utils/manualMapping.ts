/**
 * 역할: 수동 입력 폼(수동/수정 모두)에서 공용으로 쓰는 값 매핑 유틸.
 *       사용자가 입력한 자유 텍스트/체크박스 값을 TxRow가 요구하는
 *       TxPlatform / TxCategory[] enum 형태로 수렴시킵니다.
 * 위치: src\utils\manualMapping.ts
 */
import type {
  TxCategory,
  TxPlatform,
} from "../pages/Transactions/components/TransactionTable";
import { MAX_CATEGORIES_PER_TX } from "../constants/labels";

/**
 * 입력한 플랫폼 텍스트를 TxRow 타입에 맞는 키로 매핑합니다.
 * - "쿠팡 위클리" 같은 변형도 contains 기반으로 잡아냅니다.
 * - "미지정" 라벨(또는 빈 문자열)은 그대로 "unspecified"로 수렴시킵니다.
 * - 예전에는 알 수 없는 입력을 "coupang"으로 수렴시켰지만, 수동 입력에서 플랫폼을
 *   선택사항으로 열어 둔 이후로는 엉뚱하게 쿠팡 데이터로 태깅되는 문제가 있어
 *   "unspecified"로 떨어뜨려 집계가 왜곡되지 않게 했습니다.
 */
export function mapPlatform(input: string): TxPlatform {
  const normalized = input.replace(/\s/g, "");
  if (!normalized || normalized === "미지정" || normalized.toLowerCase() === "unspecified") {
    return "unspecified";
  }
  if (normalized.includes("쿠팡") || normalized.toLowerCase().includes("coupang")) {
    return "coupang";
  }
  if (normalized.includes("네이버") || normalized.toLowerCase().includes("naver")) {
    return "naver";
  }
  return "unspecified";
}

/**
 * 체크박스로 선택한 카테고리 키 배열을 TxRow.categories 배열로 매핑합니다.
 * - 비어 있지 않은 문자열이면 표준·커스텀 구분 없이 모두 유효로 취급합니다.
 *   (categoriesStore가 유효 ID의 단일 진실원이며, 저장 시점에 별도 재검증을 하지 않습니다.)
 * - 아무 것도 선택하지 않았으면 ["etc"]로 수렴시킵니다(빈 배열 금지).
 * - 상한은 MAX_CATEGORIES_PER_TX로 잘라냅니다.
 */
export function mapCategories(keys: string[]): TxCategory[] {
  const picked: TxCategory[] = [];
  for (const key of keys) {
    if (!key || !key.trim()) continue;
    if (picked.includes(key)) continue;
    picked.push(key);
    if (picked.length >= MAX_CATEGORIES_PER_TX) break;
  }
  if (picked.length === 0) return ["etc"];
  return picked;
}
