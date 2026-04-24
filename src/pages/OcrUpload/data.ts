/**
 * 역할: OCR 업로드 페이지에서 사용하는 타입 정의와 안내 문구 상수입니다.
 *
 *       과거에는 "이미 몇 장이 올라간 것처럼" 보이는 시드 이미지 목업이 함께 있었지만,
 *       이제 실제 파일 업로드 흐름이 동작하므로 시드는 제거했고, GuideCard에 노출되는
 *       안내 문구만 정적 상수로 남겨 두었습니다.
 *
 * 위치: src\pages\OcrUpload\data.ts
 */
import type { Platform } from "./components/PlatformSelect";

export interface UploadedImage {
  id: string;
  thumbUrl: string;
  fileName: string;
  sizeLabel: string;
  status: "ready" | "analyzing" | "done";
  /**
   * 원본 파일 객체 (실제 파일 업로드 후 OCR 처리에 사용)
   */
  file?: File;
  /**
   * 이 이미지를 올릴 때 선택돼 있던 플랫폼. 한 배치 안의 모든 이미지가 같은 값을 갖지만,
   * 사용자가 중간에 플랫폼을 바꿔 다른 배치를 올리면 이미지마다 값이 달라집니다.
   * 나중에 OcrEdit 단계에서 이 값이 각 OcrImageItem.platform으로 승격됩니다.
   */
  platform: Platform;
}

/**
 * GuideCard에 표시되는 업로드 안내 문구. 이미지 시드와 달리 이 값은 실제로 사용자에게
 * 보여 주는 카피이므로 그대로 유지합니다.
 */
export const OCR_UPLOAD_GUIDE: string[] = [
  "주문 완료 화면을 캡처해 주세요. 상품명, 금액, 날짜가 보이도록 맞추면 좋아요.",
  "한 이미지에 여러 상품이 있어도 자동으로 분리해 보여줄 수 있어요.",
  "쿠팡·네이버 캡쳐를 섞어 올려도 괜찮아요. 각 이미지별로 플랫폼 태그가 따로 붙습니다.",
  "긴 스크롤 캡쳐(한 화면에 주문 10건 이상)나 주변 채팅·알림 영역이 같이 잘린 이미지는 인식률이 떨어질 수 있어요. 가능하면 주문 1~3건씩 끊어 올려 주세요.",
  "흐릿한 항목은 자동으로 한 번 더 확인하는 2차 인식이 돌아갑니다. 결과가 어색하면 편집 화면에서 바로 고칠 수 있어요.",
];
