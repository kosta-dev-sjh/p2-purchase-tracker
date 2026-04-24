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
import {
  detectStatusFromOcrText,
  detectCoupangStatusFromOcrText,
} from "./ocrParse";
import { preprocessImageForOcr } from "./ocrPreprocess";
import { applyOcrCorrections } from "./ocrCorrection";
import { pickBadProducts } from "./ocrQuality";
import { runAiOcrFallback } from "./aiOcrFallback";

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
  /**
   * 현재 파이프라인 단계. Tesseract 루프가 끝나면 'ai-fallback' 으로 전환돼 복구 불가 카드를
   * AI 에 넘기고 있음을 UI 에 알립니다. 기본값은 'tesseract'.
   */
  phase?: "tesseract" | "ai-fallback";
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
    // Tesseract 단에서 가격 라인을 못 읽은 경우만 플래그를 전파 — AI 자동 보정 트리거 용도.
    ...(res.priceOcrFailed ? { priceOcrFailed: true } : {}),
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
    // 쿠팡 한정: 반품완료 → cancel 매핑 (자세한 근거는 ocrParse.ts COUPANG_STATUS_KEYWORDS).
    // 사용자는 OcrEdit 화면에서 statusTag dropdown 으로 언제든 다시 바꿀 수 있고, 같은 이미지의
    // 여러 주문을 한 번에 바꾸려면 EditForm 의 일괄 적용 UI 사용 가능.
    const resultStatuses = group.map((res) =>
      detectCoupangStatusFromOcrText(res.statusText ?? res.rawText) ?? "purchase",
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
    // Tesseract 파라미터 튜닝은 OcrUpload 원본과 동일한 값으로 맞춥니다.
    //  - PSM=6 (Single uniform block of text): 쇼핑 캡쳐의 수직 블록에 안정적.
    //  - preserve_interword_spaces=1: 공백 보존으로 파서 토큰 분리 용이.
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: "6",
        preserve_interword_spaces: "1",
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

    // ───────── AI 자동 보정 단계 ─────────
    //
    // Tesseract 루프가 끝난 뒤 전체 처리 결과를 한 번 훑어, "파서로 복구 불가" 로 분류되는
    // bad 카드가 **하나라도 있는 이미지만** 뽑아 Gemini 2.5 Flash Vision 을 호출합니다.
    //
    // 1차 필터 (bad 0장인 이미지는 AI 호출 X) 로 비용을 절약하면서, 일단 AI 호출이 발동하면
    // 이미지 input 비용이 이미 지불되므로 그 이미지의 **전체 카드**를 한 번에 검증받습니다.
    //   - 이미지 input: ~$0.0002 (비용의 90%)
    //   - 카드당 출력 토큰: ~30 토큰 × $0.3/M ≈ $0.00001 (사실상 무시 가능)
    //   → 같은 호출 안에서 5 카드 검증 vs 1 카드 검증 비용 차이 $0.00004. Clean 카드도 AI 가
    //     미세 오류 발견하면 함께 고치고, 맞으면 원본 그대로 반환.
    //
    // aiApplied 플래그는 aiService 가 **실제 값이 바뀐 카드에만** 찍어 UI 배지(✨) 가 거짓말
    // 하지 않도록 합니다.
    const imagesNeedingAi = processed
      .map((img, idx) => ({
        img,
        // targetImages[idx] 는 처리 순서가 processed 와 동일하므로 안전하게 대응.
        file: targetImages[idx]?.file,
        badPerOrder: img.orders.map((o) => pickBadProducts(o.products, o.statusTag)),
      }))
      .filter((x) => x.badPerOrder.some((arr) => arr.length > 0));

    if (imagesNeedingAi.length > 0) {
      // AI phase 에서는 진행 지표를 **AI 대상 이미지 부분집합** 기준으로 보냅니다. 예: 업로드 5장
      // 중 3장만 AI 필요 → 모달에 "1/3장 · 2/3장 · 3/3장" 으로 노출. 전체 5장 기준으로 표시하면
      // "3번 이미지는 왜 건너뛰지?" 혼동이 생깁니다(사용자 실측 보고).
      const aiPhaseTotal = imagesNeedingAi.length;
      for (let i = 0; i < imagesNeedingAi.length; i += 1) {
        const { img, file, badPerOrder } = imagesNeedingAi[i];
        onProgress({
          // currentIndex / totalCount 둘 다 AI 부분집합 기준. Tesseract phase 와 의미가 달라지는
          // 것은 phase 플래그로 구분되므로 모달 단에서 헷갈리지 않습니다.
          currentIndex: i,
          totalCount: aiPhaseTotal,
          currentFileName: img.fileName,
          currentThumbUrl: img.thumbUrl,
          currentPlatform: img.platform,
          currentProgress: i / aiPhaseTotal,
          currentStatus: "ai-fallback",
          phase: "ai-fallback",
        });

        // 이 이미지의 **전체 카드**(bad 포함) 를 allProducts 로. bad 는 badIds 힌트로 AI 에게
        // "이 카드들은 특히 의심스러움" 을 알려줌. 토큰은 몇십 개 늘지만 비용은 무시 가능.
        const allProducts = img.orders.flatMap((o) => o.products);
        const badIds = badPerOrder.flat().map((p) => p.id);
        if (allProducts.length === 0) continue;

        const fallback = await runAiOcrFallback({
          imageId: img.id,
          platform: img.platform,
          rawText: img.rawText ?? "",
          allProducts,
          badIds,
          imageFile: file,
        });
        if (fallback.failed) continue;

        // 응답은 입력과 같은 id 순서로 온다는 가정 하에 id → 보정된 product 맵으로 치환.
        const byId = new Map(fallback.products.map((p) => [p.id, p]));
        img.orders = img.orders.map((o) => ({
          ...o,
          products: o.products.map((p) => byId.get(p.id) ?? p),
        }));
      }
    }

    // ───────── AI 변경 실효율 로깅 ─────────
    //
    // CLAUDE.md §9.4 에 명문화된 3개 지표를 콘솔에 찍습니다. 게이트 과민/둔감 판단 자료.
    // 개발자 도구에서 평소 업로드 시 수치가 쌓이도록 console.info 레벨로 출력.
    //
    //   - 게이트 발동율: 전체 중 AI 호출로 넘어간 이미지 비율
    //   - 카드 레벨 실효율: 전체 카드 중 실제로 aiApplied 찍힌 비율
    //   - 이미지 레벨 실효율: AI 호출된 이미지 중 최소 1카드 이상 수정된 비율
    //
    // 실효율이 지속적으로 낮으면 ocrQuality.classifyOcrCardQuality 의 bad 판정 기준을
    // 완화할 후보. 반대로 높으면 현재 게이트가 잘 조정된 것.
    try {
      const totalCards = processed.reduce(
        (acc, img) => acc + img.orders.reduce((a, o) => a + o.products.length, 0),
        0,
      );
      const aiAppliedCards = processed.reduce(
        (acc, img) =>
          acc + img.orders.reduce(
            (a, o) => a + o.products.filter((p) => p.aiApplied).length,
            0,
          ),
        0,
      );
      const aiChangedImages = processed.filter((img) =>
        img.orders.some((o) => o.products.some((p) => p.aiApplied)),
      ).length;
      const triggeredImages = imagesNeedingAi.length;
      const pct = (n: number, d: number) => (d > 0 ? ((n / d) * 100).toFixed(1) : "0.0");
      console.info(
        `[OCR] 완료 요약 · 이미지 ${processed.length}장 · 카드 ${totalCards}개\n` +
        `       게이트 발동율: ${triggeredImages}/${processed.length}장 (${pct(triggeredImages, processed.length)}%)\n` +
        `       카드 실효율  : ${aiAppliedCards}/${totalCards}카드 (${pct(aiAppliedCards, totalCards)}%) 가 AI 보정됨\n` +
        `       이미지 실효율: ${aiChangedImages}/${triggeredImages || 0}장 (${pct(aiChangedImages, triggeredImages)}%) 의 AI 호출에서 최소 1카드 수정`,
      );
    } catch (e) {
      console.warn("[OCR] 완료 요약 로깅 실패:", e);
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
