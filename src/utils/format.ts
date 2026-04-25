/**
 * 역할: 화면 컴포넌트 밖으로 분리한 공통 계산 또는 포맷팅 로직입니다.
 * 위치: src\utils\format.ts
 */
export const formatKRW = (value: number): string => {
  if (!Number.isFinite(value)) return "₩0";
  return `₩${Math.round(value).toLocaleString("ko-KR")}`;
};

export const formatNumber = (value: number): string => {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("ko-KR");
};

export const formatPercent = (value: number): string => {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
};

export const formatDateDot = (value: string): string => {
  if (!value) return "";
  return value.replaceAll("-", ".");
};

export const parsePrice = (value: string): number => {
  if (!value) return 0;
  const num = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(num) ? num : 0;
};

