/**
 * 역할: 프로젝트에서 사용하는 데이터 형태를 타입으로 정의합니다.
 * 위치: src\types\product.ts
 */
import type { Platform } from "./platform";

export type Category =
  | "식품"
  | "패션"
  | "생활"
  | "디지털"
  | "뷰티"
  | "기타";

export interface Product {
  id: string;
  name: string;
  platform: Platform;
  category: Category;
  price: number;
  quantity: number;
}

export interface OcrExtractedProduct {
  name: string;
  price: number;
  quantity: number;
  platform: Platform;
  category: Category;
}

export interface EditableProductDraft extends OcrExtractedProduct {
  editable: boolean;
}

export interface RepeatProduct {
  name: string;
  count: number;
  totalAmount: number;
  platform: Platform;
  category: Category;
}
