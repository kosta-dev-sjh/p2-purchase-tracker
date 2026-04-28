/**
 * 역할: AI 소비 인사이트를 월별로 캐싱하는 Zustand 스토어입니다.
 * 위치: src/stores/aiInsightsStore.ts
 */
import { create } from "zustand";

const STORAGE_KEY = "spendtrack:ai_insights";

export interface InsightCacheEntry {
  hash: string;
  insightText: string;
}

interface AiInsightsState {
  cache: Record<string, InsightCacheEntry>;
  getInsight: (monthKey: string) => InsightCacheEntry | undefined;
  setInsight: (monthKey: string, hash: string, insightText: string) => void;
  /**
   * 로그아웃/계정 전환 시 호출. 인사이트 텍스트에 직전 사용자의 거래 패턴이 함축돼 있으므로
   * 다음 사용자에게 노출되지 않도록 인메모리 + localStorage 양쪽을 모두 비웁니다.
   */
  clear: () => void;
}

function readCache(): Record<string, InsightCacheEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, InsightCacheEntry>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

export const useAiInsightsStore = create<AiInsightsState>((set, get) => ({
  cache: readCache(),
  getInsight: (monthKey) => get().cache[monthKey],
  setInsight: (monthKey, hash, insightText) => {
    const nextCache = { ...get().cache, [monthKey]: { hash, insightText } };
    writeCache(nextCache);
    set({ cache: nextCache });
  },
  clear: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* localStorage 접근이 막힌 환경(시크릿 모드 일부)은 조용히 무시 */
    }
    set({ cache: {} });
  },
}));

/**
 * 비-React 코드(예: firebaseSync 의 onAuthStateChanged 콜백)에서 캐시를 비울 수 있는 진입점.
 */
export const aiInsightsStore = {
  clear(): void {
    useAiInsightsStore.getState().clear();
  },
};
