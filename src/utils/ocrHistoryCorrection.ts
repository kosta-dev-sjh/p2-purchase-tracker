/**
 * 역할: 사용자가 이전에 저장한 거래 title 을 cache 로 활용해 OCR itemName 의 변형을 자체적으로
 *       보정. AI 호출 0, wordlist 하드코딩 0 — 사용자별 동적 학습.
 *
 * 정책 근거:
 *   - CLAUDE.md §9.1: 신규 플랫폼은 얕은 1차 파서 + 이른 보정. AI 호출 비용 최소화 목표.
 *   - 사용자 지시 (2026-04-27): "API 호출 적도록 자체적인 기능을 개발하는 것이 목표".
 *   - §5 정책: "OCR 변형 wordlist 하드코딩 금지" — 본 모듈은 wordlist 가 아니라 사용자별 거래
 *     title 의 동적 cache 임. 같은 사용자가 이전에 정정한 상품명을 다시 학습.
 *
 * 동작:
 *   1. 사용자의 transactionsStore.rows 에서 OCR/manual/csv 모든 source 의 title 을 모음
 *   2. 이름 캐시는 정규화된 형태로 저장 (공백 제거, 한영숫자 추출, 소문자)
 *   3. 새 OCR itemName 이 들어오면 cache 의 각 entry 와 fuzzy 매칭 (Levenshtein)
 *   4. 임계값(0.7) 이상이면 cache 의 원본 title 로 보정. 0.7 미만이면 OCR 결과 유지
 *
 * 비용 모델:
 *   - 메모리: cache 크기 = 거래 수. 1000 거래 ≈ 50 KB. 매 OCR 분석마다 1회 빌드 → memoize OK.
 *   - CPU: 카드당 fuzzy 매칭 = O(N × max(len)). 117 GT 카드 × 1000 cache = ~12만 회 lev. <50ms 예상.
 *   - 네트워크: 0 (전적으로 client-side).
 *
 * 위치: src/utils/ocrHistoryCorrection.ts
 */

import type { TxRow } from "../pages/Transactions/components/TransactionTable";

export interface HistoryCacheEntry {
  /** 사용자 거래의 원본 title (보정 결과로 사용) */
  original: string;
  /** 정규화된 형태 — fuzzy 매칭 시 비교 대상 */
  normalized: string;
}

/**
 * 정규화: 한글/영문/숫자만 남기고 소문자화. 공백/구두점/이모지 제거.
 * 같은 형태로 OCR itemName 도 정규화한 뒤 levenshtein 비교.
 */
function normalize(s: string): string {
  return String(s ?? "").replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/**
 * transactionsStore.rows 에서 history cache 를 빌드합니다.
 *
 * 추출 대상:
 *   - row.title (메인 거래명)
 *   - row.detail.items[].name (각 상품명)
 * 둘 다 정규화 ≥ 4 char 만 cache 등록 (너무 짧으면 false positive 위험).
 */
export function buildHistoryCache(rows: TxRow[]): HistoryCacheEntry[] {
  const seen = new Set<string>();
  const out: HistoryCacheEntry[] = [];

  const add = (original: string) => {
    const trimmed = (original ?? "").trim();
    if (!trimmed) return;
    const normalized = normalize(trimmed);
    if (normalized.length < 4) return; // 너무 짧으면 매칭 노이즈
    if (seen.has(normalized)) return;
    seen.add(normalized);
    out.push({ original: trimmed, normalized });
  };

  for (const row of rows) {
    add(row.title);
    if (row.detail?.items) {
      for (const item of row.detail.items) add(item.name);
    }
  }

  return out;
}

/**
 * itemName 후보를 cache 와 fuzzy 매칭해 보정.
 *
 * @param itemName OCR 파서가 추출한 원시 itemName
 * @param cache buildHistoryCache 결과
 * @param threshold 보정 임계값 (default 0.7) — 이 이상이면 cache 의 original 로 교체
 * @returns 보정 결과 + 메타 (matched 여부, sim, 원본/매칭 cache entry)
 *
 * 동작:
 *   - itemName 정규화 후 cache 의 모든 entry 와 sim 계산
 *   - sim 가장 높은 entry 의 sim 이 threshold 이상이면 보정
 *   - 그 외에는 원본 유지
 *
 * 보호 정책:
 *   - itemName 자체가 너무 짧으면 (정규화 < 4) 매칭 시도 안 함 — false positive 위험
 *   - cache 가 비어 있으면 noop
 *   - sim ≥ 0.95 인 매칭은 "거의 동일" 이라 보정해도 시각적 차이 거의 없음 (대소문자/공백 정도)
 */
export interface HistoryCorrectionResult {
  /** 보정된 (또는 원본) itemName */
  corrected: string;
  /** 보정 적용 여부 */
  matched: boolean;
  /** 가장 높은 sim 값 (보정 안 된 경우 < threshold) */
  bestSim: number;
  /** 매칭된 cache entry (matched true 일 때만 의미) */
  match: HistoryCacheEntry | null;
}

export function correctItemNameWithHistory(
  itemName: string | null | undefined,
  cache: HistoryCacheEntry[],
  threshold: number = 0.7,
): HistoryCorrectionResult {
  const original = (itemName ?? "").trim();
  if (!original || cache.length === 0) {
    return { corrected: original, matched: false, bestSim: 0, match: null };
  }
  const norm = normalize(original);
  if (norm.length < 4) {
    return { corrected: original, matched: false, bestSim: 0, match: null };
  }

  let best: HistoryCacheEntry | null = null;
  let bestSim = 0;
  for (const entry of cache) {
    const s = similarity(norm, entry.normalized);
    if (s > bestSim) {
      bestSim = s;
      best = entry;
    }
  }

  if (best && bestSim >= threshold) {
    return { corrected: best.original, matched: true, bestSim, match: best };
  }
  return { corrected: original, matched: false, bestSim, match: best };
}

/**
 * OCR 분석 후 처리 단계에서 한 번에 모든 카드의 itemName 을 cache 보정.
 *
 * @param products 원본 OcrProduct 배열 (또는 itemName 만 있는 객체 배열)
 * @param cache buildHistoryCache 결과
 * @param threshold 보정 임계값
 * @returns 보정된 배열 + 보정 수
 *
 * 사용 예 (ocrAnalyzeImages.ts 통합):
 *   const cache = buildHistoryCache(transactionsStore.loadAll());
 *   imageItem.orders = imageItem.orders.map((o) => ({
 *     ...o,
 *     products: applyHistoryCorrectionToProducts(o.products, cache).products,
 *   }));
 */
export function applyHistoryCorrectionToProducts<T extends { name: string | null }>(
  products: T[],
  cache: HistoryCacheEntry[],
  threshold: number = 0.7,
): { products: T[]; correctedCount: number } {
  if (cache.length === 0 || products.length === 0) {
    return { products, correctedCount: 0 };
  }
  let correctedCount = 0;
  const out = products.map((p) => {
    const result = correctItemNameWithHistory(p.name, cache, threshold);
    if (result.matched) {
      correctedCount += 1;
      return { ...p, name: result.corrected };
    }
    return p;
  });
  return { products: out, correctedCount };
}
