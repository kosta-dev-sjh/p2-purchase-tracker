/**
 * 역할: 한국어 조사를 받침 유무에 따라 자동 선택해 주는 작은 유틸 모음입니다.
 *       인사이트 메시지처럼 사용자에게 보이는 동적 문장에 쓰입니다.
 *
 *       하드코딩된 `~를 사셨어요` / `~이 가장 높아요` 같은 표현은 거래명·플랫폼명에 따라
 *       어색해질 수 있어(예: "쿠팡를 사셨어요"), 종성 유무로 분기해야 합니다.
 *
 * 위치: src/utils/koreanParticle.ts
 */

const HANGUL_BASE = 0xac00; // 가
const HANGUL_LAST = 0xd7a3; // 힣

/**
 * 마지막 한글 음절의 종성(받침) 유무를 반환합니다.
 * - 한글 음절이 아니거나 빈 문자열이면 null. 호출부에서 폴백 처리하기 쉽도록 boolean 대신 null 을 돌려줍니다.
 * - "쿠팡" → true (받침 ㅇ), "네이버" → false, "쿠팡 " → "쿠팡" 으로 보고 true.
 */
export function hasJongseong(input: string | null | undefined): boolean | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // 괄호·따옴표 등 비문자 끝꼬리는 제거하고 앞쪽으로 이동하며 마지막 한글을 찾습니다.
  // 영문/숫자만 있는 이름(`GS25`)은 보수적으로 false 로 떨어뜨려 호출부 폴백을 유도합니다.
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const code = trimmed.charCodeAt(i);
    if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
      return ((code - HANGUL_BASE) % 28) !== 0;
    }
  }
  return null;
}

/**
 * 목적격 조사 — 받침 있으면 "을", 없으면 "를".
 * 한글이 없는 토큰("GS25" 등)은 "을/를" 로 폴백해 둘 다 어색하지 않게 합니다.
 */
export function objectParticle(noun: string | null | undefined): string {
  const has = hasJongseong(noun);
  if (has === true) return "을";
  if (has === false) return "를";
  return "을/를";
}

/**
 * 주격 조사 — 받침 있으면 "이", 없으면 "가".
 * 폴백은 "이/가".
 */
export function subjectParticle(noun: string | null | undefined): string {
  const has = hasJongseong(noun);
  if (has === true) return "이";
  if (has === false) return "가";
  return "이/가";
}

/**
 * 보조사 "은/는" — 받침 있으면 "은", 없으면 "는".
 * 폴백은 "은/는".
 */
export function topicParticle(noun: string | null | undefined): string {
  const has = hasJongseong(noun);
  if (has === true) return "은";
  if (has === false) return "는";
  return "은/는";
}

/**
 * 명사 + 조사를 한 번에 잇는 헬퍼. 호출부 가독성을 위한 sugar.
 *   withParticle("쿠팡", "object")   // "쿠팡을"
 *   withParticle("네이버", "topic")  // "네이버는"
 */
export function withParticle(
  noun: string,
  kind: "object" | "subject" | "topic",
): string {
  const trimmed = noun?.trim() ?? "";
  switch (kind) {
    case "object":
      return `${trimmed}${objectParticle(trimmed)}`;
    case "subject":
      return `${trimmed}${subjectParticle(trimmed)}`;
    case "topic":
      return `${trimmed}${topicParticle(trimmed)}`;
  }
}
