/**
 * 역할: 상품 링크가 없는 항목에 대해 플랫폼별 검색 URL 로 폴백을 만들어 주는 유틸.
 * 위치: src/utils/productSearchUrl.ts
 *
 * 같은 거래라도 사용자가 등록 시 링크를 붙이지 못한 상품이 있을 수 있어,
 * "링크가 없으면 플랫폼 검색창으로 이동" 이라는 일관된 UX 를 화면 곳곳(상세패널, 상품편집)에서
 * 동일하게 보장하기 위해 한 곳에서 URL 을 만듭니다.
 *
 * 정책:
 * - 거래 플랫폼이 coupang 이면 쿠팡 검색, naver 면 네이버쇼핑 검색.
 * - unspecified(수동입력 등) 또는 알 수 없는 값이면 가장 범용적인 네이버쇼핑으로 폴백.
 *   이는 "플랫폼 미지정 거래도 어딘가에 가서 그 상품을 찾아볼 수 있어야 한다" 는 원칙을 따르기 위함입니다.
 */
import type { TxPlatform } from "../pages/Transactions/components/TransactionTable";

export function buildPlatformSearchUrl(
  platform: TxPlatform | null | undefined,
  name: string
): string {
  const query = encodeURIComponent(name.trim());
  switch (platform) {
    case "coupang":
      return `https://www.coupang.com/np/search?q=${query}`;
    case "naver":
      return `https://search.shopping.naver.com/search/all?query=${query}`;
    default:
      return `https://search.shopping.naver.com/search/all?query=${query}`;
  }
}

/**
 * 상품 한 건의 "이동할 링크" 를 결정합니다.
 * - 사용자가 등록한 link 가 있으면 그대로 사용.
 * - 없으면 plaform/name 기반 검색 URL 로 폴백하고 isFallback=true 를 함께 알립니다.
 *   호출부는 isFallback 여부에 따라 버튼의 title/aria-label/시각 강도를 다르게 줄 수 있습니다.
 */
export function resolveProductLink(
  link: string | null | undefined,
  platform: TxPlatform | null | undefined,
  name: string
): { href: string; isFallback: boolean } {
  const trimmed = link?.trim();
  if (trimmed) {
    return { href: trimmed, isFallback: false };
  }
  return { href: buildPlatformSearchUrl(platform, name), isFallback: true };
}
