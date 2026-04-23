/**
 * 역할: 업로드된 이미지 배열을 Tesseract로 순차 분석해 OcrImageItem 배열로 변환하는
 *       공용 파이프라인입니다. OcrUpload/index.tsx 의 최초 분석 흐름과
 *       OcrEdit 의 "이미지 추가" 모달 흐름이 같은 OCR·파서·그룹화 로직을 공유하도록
 *       한 곳으로 묶어 두었습니다. 이 유틸을 거쳐 나온 결과는 그대로 ocrStore 에
 *       넣거나 기존 images 뒤에 append 해도 되는 형태입니다.
 *
 *       진행률은 onProgress 콜백으로 외부에 흘려 보냅니다. Tesseract logger가 주는
 *       {status, progress} 를 그대로 전달하지 않고, "현재 이미지의 메타(파일명/썸네일)"
 *       를 같이 묶어 모달이 한 번의 상태 업데이트로 모든 것을 갱신할 수 있게 만들었습니다.
 *
 * 위치: src/utils/ocrAnalyzeImages.ts
 */
import { createWorker } from "tesseract.js";
import type { UploadedImage } from "../pages/OcrUpload/data";
import type { Platform } from "../pages/OcrUpload/components/PlatformSelect";
import type { OcrImageItem, OcrOrder } from "../pages/OcrEdit/data";
import {
  parseCoupangOrderText,
  parseNaverOrderText,
  parseTemuOrderText,
  type PurchaseOCRResult,
} from "./ocrParsers";
import { detectStatusFromOcrText } from "./ocrParse";
import { preprocessImageForOcr } from "./ocrPreprocess";
import { applyOcrCorrections } from "./ocrCorrection";

/**
 * 분석 진행률 이벤트. AnalysisProgressModal 이 그대로 받아 두 개의 진행 바를 그립니다.
 * - currentIndex === totalCount 이면 모든 이미지 분석 완료(루프 직후 1회 발행).
 */
export interface OcrAnalysisProgress {
  currentIndex: number;
  totalCount: number;
  currentFileName: string;
  currentThumbUrl?: string;
  currentPlatform?: Platform;
  /** 현재 이미지의 Tesseract recognize 진행률 0..1. */
  currentProgress: number;
  /** Tesseract가 준 내부 단계 문자열 그대로. UI에서 한국어로 변환해 보여줍니다. */
  currentStatus: string;
}

/**
 * OCR 파서 결과 한 건을 OcrOrder.products 항목으로 변환합니다.
 * 가격만 잡히고 이름을 못 뽑은 경우엔 "상품명 입력 필요" 플레이스홀더로 남겨
 * 사용자가 OcrEdit 에서 이름만 채워 저장할 수 있게 합니다.
 */
function toProduct(
  res: PurchaseOCRResult,
  idx: number,
  imageId: string,
) {
  const unitPrice = res.price ?? 0;
  const qty = res.quantity && res.quantity > 0 ? res.quantity : 1;
  const hasItem = Boolean(res.itemName);
  const hasPrice = unitPrice > 0;
  if (!hasItem && !hasPrice) return null;
  return {
    id: `${imageId}-product-${idx}`,
    name: hasItem ? (res.itemName as string) : "상품명 입력 필요",
    price: unitPrice,
    quantity: qty,
  };
}

/**
 * 쿠팡 캡쳐 전용: 주문 헤더 날짜별로 그룹화해 각 날짜마다 OcrOrder 를 하나씩 만듭니다.
 * 헤더가 1개면 카드 1장(묶음 상품), N개면 N장이 생깁니다.
 */
function buildCoupangOrders(
  imageId: string,
  parsed: PurchaseOCRResult[],
): OcrOrder[] {
  const groupsByDate = new Map<string, PurchaseOCRResult[]>();
  for (const res of parsed) {
    const key = res.date ?? "";
    const arr = groupsByDate.get(key) ?? [];
    arr.push(res);
    groupsByDate.set(key, arr);
  }

  return Array.from(groupsByDate.entries()).map(([date, group], orderIdx) => {
    const resultStatuses = group.map((res) =>
      detectStatusFromOcrText(res.statusText ?? res.rawText) ?? "purchase",
    );
    const allCanceled = resultStatuses.every((s) => s === "cancel");
    const allRefunded = resultStatuses.every((s) => s === "refund");
    const orderStatusTag = allCanceled
      ? "cancel"
      : allRefunded
        ? "refund"
        : "purchase";

    const products = group
      .map((res, productIdx) => toProduct(res, orderIdx * 100 + productIdx, imageId))
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const totalAmount = products.reduce(
      (sum, p) => sum + p.price * (p.quantity ?? 1),
      0,
    );

    return {
      id: `${imageId}-order-${orderIdx}`,
      orderDate: date,
      statusTag: orderStatusTag,
      statusLabel: "자동 추출됨",
      totalAmount,
      rawText: group[0].rawText,
      products,
    };
  });
}

/**
 * 네이버/테무용: "이미지 1장 = 주문 N건(목록형)" 형식이라 결과 1개당 OcrOrder 1개.
 */
function buildFlatOrders(
  imageId: string,
  platform: Platform,
  parsed: PurchaseOCRResult[],
): OcrOrder[] {
  return parsed.map((res, idx) => {
    const statusTag =
      platform === "temu"
        ? res.statusText
          ? (detectStatusFromOcrText(res.statusText) ?? "purchase")
          : "purchase"
        : (detectStatusFromOcrText(res.statusText ?? res.rawText) ?? "purchase");
    const product = toProduct(res, idx, imageId);
    const unitPrice = res.price ?? 0;
    const qty = res.quantity && res.quantity > 0 ? res.quantity : 1;
    return {
      id: `${imageId}-order-${idx}`,
      orderDate: res.date ?? "",
      statusTag,
      statusLabel: "자동 추출됨",
      totalAmount: product ? unitPrice * qty : 0,
      rawText: res.rawText,
      products: product ? [product] : [],
    };
  });
}

/**
 * 업로드된 이미지 배열을 순차적으로 OCR 분석합니다.
 *
 * Tesseract 워커는 파이프라인 안에서 1회 생성/종료됩니다. 이미지 간 워커 재사용으로
 * 언어 데이터 로딩 비용을 아끼고, 루프가 끝나면 finally 에서 반드시 terminate 합니다.
 *
 * @param targetImages 분석 대상 UploadedImage 배열. file 객체가 없는 항목은 빈 orders로 통과시킵니다.
 * @param onProgress  진행률 콜백. 이미지 진입 시점마다 currentIndex/파일메타 갱신, Tesseract
 *                    recognize 구간에서 currentProgress 갱신, 마지막엔 `{currentIndex: totalCount,
 *                    currentProgress: 1, currentStatus: "done"}` 로 한 번 더 불립니다.
 */
export async function analyzeUploadedImages(
  targetImages: UploadedImage[],
  onProgress: (event: OcrAnalysisProgress) => void,
): Promise<OcrImageItem[]> {
  if (targetImages.length === 0) return [];

  const totalCount = targetImages.length;

  // 초기 상태: 첫 이미지 준비 중. 외부(모달)가 "0/N, 0%"를 그릴 수 있게 한 번 흘려 줍니다.
  onProgress({
    currentIndex: 0,
    totalCount,
    currentFileName: targetImages[0]?.fileName ?? "",
    currentThumbUrl: targetImages[0]?.thumbUrl,
    currentPlatform: targetImages[0]?.platform,
    currentProgress: 0,
    currentStatus: "initializing",
  });

  /**
   * 루프 진입 시 확정해 둔 현재 이미지 메타를 Tesseract logger가 쏘는 이벤트와 합쳐
   * onProgress 한 번으로 모든 필드를 채워 보내기 위한 보관함.
   */
  let currentImageMeta: {
    index: number;
    fileName: string;
    thumbUrl?: string;
    platform?: Platform;
  } = {
    index: 0,
    fileName: targetImages[0]?.fileName ?? "",
    thumbUrl: targetImages[0]?.thumbUrl,
    platform: targetImages[0]?.platform,
  };

  // createWorker 시그니처는 (langs, oem, options) 순. OEM=1 은 LSTM_ONLY — tesseract.js v7 기본.
  const worker = await createWorker("kor+eng", 1, {
    logger: (message) => {
      // recognize 단계에서는 progress 를 진행률로, 그 외 단계에서는 status만 갱신합니다.
      if (message.status === "recognizing text") {
        onProgress({
          currentIndex: currentImageMeta.index,
          totalCount,
          currentFileName: currentImageMeta.fileName,
          currentThumbUrl: currentImageMeta.thumbUrl,
          currentPlatform: currentImageMeta.platform,
          currentProgress: message.progress,
          currentStatus: message.status,
        });
      } else {
        onProgress({
          currentIndex: currentImageMeta.index,
          totalCount,
          currentFileName: currentImageMeta.fileName,
          currentThumbUrl: currentImageMeta.thumbUrl,
          currentPlatform: currentImageMeta.platform,
          currentProgress: 0,
          currentStatus: message.status,
        });
      }
    },
  });

  try {
    // Tesseract 파라미터 튜닝.
    //
    //  - PSM=6 (Single uniform block of text): 쇼핑 캡쳐의 수직 블록에 안정적.
    //    PSM=4 (Single column variable sizes) 로도 테스트해 봤지만, 쿠팡 주문 카드처럼
    //    상태 배지 · 상품명 · 가격 각각 크기가 다른 라인들이 섞인 경우 PSM=6 이 오히려
    //    "한 덩어리로 보고 순서대로 뽑아내는" 쪽이 결과가 안정적이었습니다.
    //  - preserve_interword_spaces=1: 공백 보존으로 파서 토큰 분리 용이.
    //  - user_defined_dpi=300: 전처리에서 2400px 로 업스케일 한 이미지를 기준으로 DPI 힌트를
    //    명시. Tesseract 가 내부적으로 글자 크기 → x-height 추정을 DPI 에 의존하는데,
    //    힌트가 없으면 70 이하로 추정해 작은 글씨를 자주 놓칩니다.
    //  - textord_heavy_nr=1: 얇은 노이즈(1~2픽셀 점/선) 제거를 강하게. 업스케일 + 샤픈 후
    //    남아 있을 수 있는 하프톤 잔여물을 한 번 더 훑어 줍니다.
    //  - tessedit_do_invert=0: 이미 흑백/그레이로 전처리 한 입력에 인버스 후보를 따로
    //    시도하지 않게 막아 처리 시간도 약간 단축됩니다.
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: "6",
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
        textord_heavy_nr: "1",
        tessedit_do_invert: "0",
      } as unknown as never);
    } catch {
      console.warn("[ocrAnalyzeImages] tesseract.setParameters 실패 — 기본값으로 진행");
    }

    const processed: OcrImageItem[] = [];

    for (let i = 0; i < targetImages.length; i += 1) {
      const image = targetImages[i];

      // 이미지 진입 시점 메타 갱신 + progress 0 리셋.
      currentImageMeta = {
        index: i,
        fileName: image.fileName,
        thumbUrl: image.thumbUrl,
        platform: image.platform,
      };
      onProgress({
        currentIndex: i,
        totalCount,
        currentFileName: image.fileName,
        currentThumbUrl: image.thumbUrl,
        currentPlatform: image.platform,
        currentProgress: 0,
        currentStatus: "preprocessing",
      });

      if (!image.file) {
        // 방어적 폴백. 정상 업로드 흐름에서는 File 객체가 반드시 있지만,
        // 예외 케이스에서도 파이프라인이 터지지 않도록 빈 orders로 통과시킵니다.
        processed.push({
          id: image.id,
          fileName: image.fileName,
          thumbUrl: image.thumbUrl,
          status: "analyzed",
          platform: image.platform,
          orders: [],
        });
        continue;
      }

      const preprocessed = await preprocessImageForOcr(image.file);
      const result = await worker.recognize(preprocessed);
      const rawText = applyOcrCorrections(result.data.text);

      let parsedData: PurchaseOCRResult[] = [];
      if (image.platform === "coupang") {
        parsedData = parseCoupangOrderText(rawText);
      } else if (image.platform === "naver") {
        parsedData = parseNaverOrderText(rawText);
      } else if (image.platform === "temu") {
        parsedData = parseTemuOrderText(rawText);
      }

      const orders =
        image.platform === "coupang" && parsedData.length > 0
          ? buildCoupangOrders(image.id, parsedData)
          : buildFlatOrders(image.id, image.platform, parsedData);

      processed.push({
        id: image.id,
        fileName: image.fileName,
        thumbUrl: image.thumbUrl,
        status: "analyzed",
        platform: image.platform,
        rawText,
        orders:
          orders.length > 0
            ? orders
            : [
                {
                  id: `${image.id}-empty`,
                  orderDate: "",
                  statusTag: "purchase",
                  totalAmount: 0,
                  rawText,
                  products: [],
                },
              ],
      });
    }

    // 모든 이미지 완료. 100%로 한 번 더 찍어 줍니다.
    onProgress({
      currentIndex: totalCount,
      totalCount,
      currentFileName: targetImages[totalCount - 1]?.fileName ?? "",
      currentThumbUrl: targetImages[totalCount - 1]?.thumbUrl,
      currentPlatform: targetImages[totalCount - 1]?.platform,
      currentProgress: 1,
      currentStatus: "done",
    });

    return processed;
  } finally {
    await worker.terminate();
  }
}
