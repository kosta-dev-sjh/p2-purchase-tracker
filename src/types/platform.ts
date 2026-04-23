/**
 * 역할: 프로젝트에서 사용하는 데이터 형태를 타입으로 정의합니다.
 * 위치: src\types\platform.ts
 */
export const PLATFORMS = ["쿠팡", "네이버쇼핑", "무신사", "테무"] as const;

export type Platform = (typeof PLATFORMS)[number];

export interface PlatformPalette {
  bg: string;
  fg: string;
  border: string;
  dot: string;
}

export interface PlatformSummary {
  platform: Platform;
  amount: number;
  count: number;
}

export const isPlatform = (value: string): value is Platform => {
  return PLATFORMS.includes(value as Platform);
};
