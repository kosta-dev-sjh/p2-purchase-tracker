/**
 * 역할: 프로젝트에서 사용하는 데이터 형태를 타입으로 정의합니다.
 * 위치: src\types\transaction.ts
 */
export type TransactionType = "expense" | "income";

export type StatusTag =
  | "purchase"
  | "refund"
  | "cancel"
  | "return"
  | "recurring"
  | "sub";

export type PlatformId = "coupang" | "naver" | "temu" | "other";

export type InputSource = "ocr" | "manual";

// 상품 정보는 OCR 결과 보정과 수동 입력 화면에서 함께 재사용합니다.
export interface Product {
  id: string;
  name: string;
  price: number;
  link?: string;
}

// Transaction은 Home, Transactions, Analysis 화면이 공통으로 바라보는 핵심 데이터 단위입니다.
export interface Transaction {
  id: string;
  type: TransactionType;
  title: string;
  amount: number;
  date: string;
  platform: PlatformId;
  statusTag: StatusTag;
  source: InputSource;
  memo?: string;
  products?: Product[];
}

