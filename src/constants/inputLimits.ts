/**
 * 역할: 사용자 입력 필드의 길이/타입 제한 단일 진실원.
 *       프론트엔드 검증의 1차 방어선이며, 같은 값을 여러 화면이 공유해 정책이 한 곳에서 일관됩니다.
 *       Firebase Functions 측 server-side validation 이 추가될 때 이 파일의 값을 참조해 동일 한도를 두면 됩니다.
 *
 * 위치: src/constants/inputLimits.ts
 *
 * 정책 배경:
 *   - 한도 자체는 "악의적 입력 차단" + "Firestore 문서 크기 보호" 두 목적입니다.
 *   - 너무 빡빡하면 정상 사용자가 막히므로, 평균 사용 패턴의 4~10배 정도로 여유 있게 잡습니다.
 *   - 한도 도달 시 인풋의 maxLength 속성으로 1차 차단하고, submit 시점 검증에서 한 번 더 잡습니다.
 */

/** 거래명/상품명 등 짧은 자유 텍스트의 최대 길이. 한 줄 제목 용도. */
export const MAX_TITLE_LENGTH = 200;

/** 메모/설명 등 긴 자유 텍스트의 최대 길이. 거래 메모, 카테고리 설명 등. */
export const MAX_MEMO_LENGTH = 1000;

/** 한 거래의 절대값 금액 상한. 1조 원. 가계부 도메인에서 사실상 무한대로 봐도 무방한 값. */
export const MAX_AMOUNT_VALUE = 1_000_000_000_000;

/** 한 상품의 가격 상한. 거래 금액과 동일 한도. */
export const MAX_PRODUCT_PRICE = MAX_AMOUNT_VALUE;

/** 상품 링크 URL 의 최대 길이. RFC 한도(2083) 보다 보수적으로 잡음. */
export const MAX_URL_LENGTH = 2000;

/** 닉네임/이름의 최대 길이. */
export const MAX_NAME_LENGTH = 60;

/** 카테고리 이름의 최대 길이. */
export const MAX_CATEGORY_NAME_LENGTH = 30;

/** OCR 업로드 이미지 1장의 최대 사이즈 (10 MB). 대부분의 휴대폰 캡쳐는 5MB 이하. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** 한 번에 업로드 가능한 이미지 매수. UX/메모리 보호 차원. */
export const MAX_IMAGES_PER_BATCH = 30;

/** OCR 업로드에서 허용하는 이미지 MIME 타입 화이트리스트. */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/** CSV/XLSX 업로드 1 파일의 최대 사이즈 (5 MB). 카드사 한 달 이용내역은 보통 100KB 미만. */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

/** CSV/XLSX 한 번에 처리할 행 수 상한. 메모리 보호. */
export const MAX_IMPORT_ROW_COUNT = 10_000;
