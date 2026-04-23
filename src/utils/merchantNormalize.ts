/**
 * 역할: 카드 CSV의 가맹점명 문자열을 SpendTrack 내부 플랫폼 키로 정규화합니다.
 *       "쿠팡(주)", "COUPANG CORP" 같은 표기 차이를 하나의 플랫폼으로 모읍니다.
 * 위치: src\utils\merchantNormalize.ts
 */
import type { TxPlatform } from "../pages/Transactions/components/TransactionTable";

const RULES: Array<{ pattern: RegExp; platform: TxPlatform }> = [
  { pattern: /쿠팡|coupang/i, platform: "coupang" },
  { pattern: /네이버|naver|npay|n[- ]?pay|스마트스토어/i, platform: "naver" },
  { pattern: /테무|temu/i, platform: "temu" },
];

export interface MerchantNormalizeResult {
  platform: TxPlatform | null;
  cleaned: string;
}

export function normalizeMerchant(raw: string): MerchantNormalizeResult {
  const cleaned = raw
    .replace(/\(주\)|\(유\)|주식회사/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  for (const rule of RULES) {
    if (rule.pattern.test(cleaned)) {
      return { platform: rule.platform, cleaned };
    }
  }
  return { platform: null, cleaned };
}
