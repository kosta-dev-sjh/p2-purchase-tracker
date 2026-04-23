/**
 * 역할: 화면 컴포넌트 밖으로 분리한 공통 계산 또는 포맷팅 로직입니다.
 * 위치: src\utils\format.ts
 */
export const formatKRW = (value: number): string => {
  return `₩${Math.round(value).toLocaleString("ko-KR")}`;
};

export const formatNumber = (value: number): string => {
  return value.toLocaleString("ko-KR");
};

export const formatPercent = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

export const formatDateDot = (value: string): string => {
  return value.replaceAll("-", ".");
};

export const parsePrice = (value: string): number => {
  return Number(value.replace(/[^\d]/g, ""));
};

