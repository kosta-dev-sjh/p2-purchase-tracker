/**
 * 역할: 반응형 기준이나 플랫폼 정의처럼 공통 토큰 값을 관리합니다.
 * 위치: src\tokens\breakpoints.ts
 */
export const breakpoints = {
  tablet: "1024px",
  mobile: "768px",
};

export const media = {
  tablet: `@media (max-width: ${breakpoints.tablet})`,
  mobile: `@media (max-width: ${breakpoints.mobile})`,
};

