/**
 * 역할: AI 관련 UI(✨ "AI 보정됨" 배지, 요약 칩, 로딩창의 "AI" 언급 등)를 **개발 중에만**
 *       보이도록 토글하는 단일 플래그 유틸. 실사용자는 파이프라인에 AI 가 끼어 있다는 사실을
 *       알 필요가 없고 결과 품질만 관심사라는 UX 원칙을 지키기 위해 도입했습니다.
 *
 * 위치: src/utils/aiDebug.ts
 *
 * ── 활성화 방법 ──────────────────────────────────────────────────
 *   1) URL 쿼리: `?debug-ai=1` 가 붙으면 on (개발 URL 에 즉시 토글)
 *   2) localStorage: `localStorage.setItem('spendtrack-ai-debug', '1')` 영구 on
 *   3) 둘 중 하나라도 참이면 debug 모드
 *
 * ── 나중에 통째로 제거하는 방법 ───────────────────────────────────
 *   이 파일 하나가 **모든 AI-specific UI** 의 입구입니다. 단계:
 *     (a) 프로젝트에서 `isAiDebugMode` 전역 검색 → 조건부 JSX 블록을 통째로 삭제
 *         (대부분 `{isAiDebugMode() && <XxxBadge />}` 패턴이라 grep 후 기계적으로 제거 가능)
 *     (b) 이 파일 삭제
 *     (c) aiDebug 로부터 import 한 줄 제거
 *   3분 작업. "debug 흔적이 프로덕션 번들에 남을까" 걱정 안 해도 됩니다 — 사용자 관점에선
 *   애초에 안 보였고, 번들 크기 영향도 미미(이 파일 ~30 LOC).
 */

/**
 * AI debug UI 를 노출할지 여부. SSR/non-browser 환경에서는 항상 false.
 * URL 쿼리 > localStorage 우선순위. 매 호출마다 새로 읽기 때문에 devtools 에서 값을 바꾸면
 * 리렌더 시 즉시 반영됩니다.
 */
export function isAiDebugMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.location?.search?.includes("debug-ai=1")) return true;
    return window.localStorage?.getItem("spendtrack-ai-debug") === "1";
  } catch {
    // localStorage 접근이 막힌 샌드박스 환경 — 조용히 off 로.
    return false;
  }
}
