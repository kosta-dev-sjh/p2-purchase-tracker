/**
 * 역할: 해당 페이지에서 사용하는 목업 데이터와 화면 표시용 가공 함수를 모아둔 파일입니다.
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

export interface OcrUploadMockData {
  guide: string[];
  images: UploadedImage[];
}

export const ocrUploadMockData: OcrUploadMockData = {
  guide: [
    "주문 완료 화면을 캡처해 주세요. 상품명, 금액, 날짜가 보이도록 맞추면 좋아요.",
    "한 이미지에 여러 상품이 있어도 자동으로 분리해 보여줄 수 있어요.",
    "쿠팡·네이버·무신사 캡쳐를 섞어 올려도 괜찮아요. 각 이미지별로 플랫폼 태그가 따로 붙습니다.",
  ],
  // 시드 데이터는 서로 다른 플랫폼을 섞어 "이미지별 태그"가 어떻게 보이는지 한눈에 확인할 수 있게 둡니다.
  images: [
    {
      id: "u1",
      thumbUrl: "",
      fileName: "coupang-order-04-14.png",
      sizeLabel: "1.2 MB",
      status: "ready",
      platform: "coupang",
    },
    {
      id: "u2",
      thumbUrl: "",
      fileName: "coupang-order-04-12.png",
      sizeLabel: "980 KB",
      status: "ready",
      platform: "coupang",
    },
    {
      id: "u3",
      thumbUrl: "",
      fileName: "naver-order-04-10.png",
      sizeLabel: "1.4 MB",
      status: "ready",
      platform: "naver",
    },
  ],
};
