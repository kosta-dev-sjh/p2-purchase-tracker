/**
 * 역할: AI 소비 인사이트를 월별로 캐싱하는 Zustand 스토어입니다.
 *       localStorage(빠른 읽기) + Firestore(디바이스 간 공유) 두 단으로 캐시해
 *       같은 사용자가 다른 브라우저로 로그인해도 AI 호출이 다시 발동되지 않게 합니다.
 *
 * 위치: src/stores/aiInsightsStore.ts
 */
import { create } from "zustand";
import { auth } from "../lib/firebase";
import { trackBackgroundSync } from "../lib/firebaseBackgroundSync";
import { saveAiInsight } from "../lib/firebaseRepository";

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
   * 로그인 직후 firebaseSync 가 Firestore 에서 받아온 인사이트 캐시를 인메모리 + localStorage
   * 에 합성합니다. 같은 monthKey 에 더 최신(=다른 hash) 가 들어오면 덮어쓰고, 그 외엔 그대로.
   */
  hydrate: (remote: Record<string, InsightCacheEntry>) => void;
  /**
   * 로그아웃/계정 전환 시 호출. 인사이트 텍스트에 직전 사용자의 거래 패턴이 함축돼 있으므로
   * 다음 사용자에게 노출되지 않도록 인메모리 + localStorage 양쪽을 모두 비웁니다.
   * Firestore 자체는 비우지 않습니다(같은 사용자 재로그인 시 다시 hydrate 로 복구).
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
    // Firestore 백그라운드 sync — 실패해도 인메모리/localStorage 는 이미 갱신.
    const uid = auth.currentUser?.uid;
    if (uid) {
      trackBackgroundSync(saveAiInsight(uid, monthKey, { hash, insightText }));
    }
  },
  hydrate: (remote) => {
    const local = get().cache;
    /*
     * 머지 정책: monthKey 별로 hash 가 다른 쪽이 더 최신이라고 보장할 수 없으므로,
     * "어느 한쪽에 있으면 살림" 정책으로 합칩니다. local 쪽 우선(같은 키면 local 유지)
     * — Home 의 setInsight 호출이 먼저 Firestore 에 저장되고 hydrate 가 늦게 돌아도
     * local 의 최신 값이 덮이지 않게.
     */
    const merged: Record<string, InsightCacheEntry> = { ...remote, ...local };
    writeCache(merged);
    set({ cache: merged });
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
  hydrate(remote: Record<string, InsightCacheEntry>): void {
    useAiInsightsStore.getState().hydrate(remote);
  },
};
