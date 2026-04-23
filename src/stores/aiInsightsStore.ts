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
}));
