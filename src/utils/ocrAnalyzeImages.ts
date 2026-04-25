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
 * 이름에서 끝까지 살아남은 쿠팡 우측 액션 버튼 잔류("판매자 문의", "장바구니 담기" 등) 를
 * 마지막에 한 번 더 컷합니다.
 *
 * ocrParsers.ts 의 trailingButtonRegex / PHANTOM_BUTTON_PHRASES 가 1차 방어선이지만,
 * 사용자 보고(2026-04-25) 로 OCR 이 상품명과 버튼을 한 라인에 뭉치고 그 사이에 공백/쉼표
 * 변형을 끼워 넣을 때 1차 방어선이 비틀어진 잔류("..., 판매자 문의", "...· 판 매 자 문 의")
 * 까지는 못 잡고 컬럼에 통째로 들어오는 케이스가 있었습니다. 마지막 단계에서 substring
 * 으로 한 번 더 정리하면 ocrEdit 화면에서 이런 잔류가 사용자에게 노출되지 않습니다.
 *
 * 안전성: 정상 한국 쇼핑 상품명에 "판매자 문의", "장바구니 담기" 같은 합성어가 포함될 일이
 * 사실상 없어, substring 컷이 정상 이름을 갉아먹을 위험이 매우 낮습니다.
 */
function stripResidualButtonText(name: string): string {
  if (!name) return name;
  let cleaned = name;
  const PATTERNS: RegExp[] = [
    /[\s,·.>\-|]*판\s*매\s*자\s*문\s*의\s*[\s,·.>\-|]*/g,
    /[\s,·.>\-|]*장\s*바\s*구\s*니\s*담\s*기\s*[\s,·.>\-|]*/g,
    /[\s,·.>\-|]*배\s*송\s*조\s*회\s*[\s,·.>\-|]*/g,
    /[\s,·.>\-|]*[교고]\s*환\s*[,.·]?\s*반\s*품\s*신\s*청\s*[\s,·.>\-|]*/g,
    /[\s,·.>\-|]*반\s*품\s*신\s*청\s*[\s,·.>\-|]*/g,
    /[\s,·.>\-|]*주\s*문\s*취\s*소\s*[\s,·.>\-|]*/g,
    /[\s,·.>\-|]*주\s*문\s*상\s*세\s*보\s*기\s*[\s,·.>\-|]*/g,
    /[\s,·.>\-|]*리\s*뷰\s*(?:작\s*성(?:하기)?|쓰기)\s*[\s,·.>\-|]*/g,
    /[\s,·.>\-|]*바\s*로\s*구\s*매\s*[\s,·.>\-|]*/g,
  ];
  for (const re of PATTERNS) {
    cleaned = cleaned.replace(re, " ");
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  // 컷 뒤에 꼬리 구두점이 단독으로 남으면 정리.
  cleaned = cleaned.replace(/^[\s,·.>\-|]+|[\s,·.>\-|]+$/g, "").trim();
  return cleaned;
}

/**
 * 가격·수량 입력값을 안전한 number 로 강제합니다.
 *
 * 2026-04-25: 사용자 보고로 "긴 이미지에서 전체 거래금액이 0 으로 뜬다" 회귀를 받고, AI 응답
 * deserialization / sessionStorage rehydrate 등 외부 경로에서 price 가 "11,900" 같은 콤마
 * 들어간 문자열로 들어와 `Number(...)` 가 NaN 으로 떨어지는 점이 직접 원인으로 좁혀졌습니다.
 * 이 곳에서 한 번 정규화해서 OcrProduct 로 넘기면 OcrEdit/ProductTable 어느 쪽에서 봐도
 * 항상 finite number 가 보장됩니다.
 */
function toFiniteAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const digits = value.replace(/[^\d.\-]/g, "");
    if (!digits) return 0;
    const n = Number(digits);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
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
  const unitPrice = toFiniteAmount(res.price ?? 0);
  const rawQty = toFiniteAmount(res.quantity);
  const qty = rawQty > 0 ? rawQty : 1;
  // 이름이 비-문자열로 들어와도 toString 으로 흡수한 뒤 잔류 버튼 텍스트를 컷합니다.
  const cleanedName = res.itemName != null
    ? stripResidualButtonText(String(res.itemName))
    : "";
  const hasItem = cleanedName.length > 0;
  const hasPrice = unitPrice > 0;
  if (!hasItem && !hasPrice) return null;
  return {
    id: `${imageId}-product-${idx}`,
    name: hasItem ? cleanedName : "상품명 입력 필요",
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

    // 합계도 toFiniteAmount 로 한 번 더 정규화. toProduct 가 이미 정상화하지만, 추후 다른
    // 경로에서 product 객체가 직접 합쳐질 가능성에 대비한 이중 방어선입니다.
    const totalAmount = products.reduce(
      (sum, p) => sum + toFiniteAmount(p.price) * (toFiniteAmount(p.quantity) || 1),
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
 * 네이버용: "이미지 1장 = 주문 N건(목록형)" 형식이라 결과 1개당 OcrOrder 1개.
 */
function buildFlatOrders(
  imageId: string,
  parsed: PurchaseOCRResult[],
): OcrOrder[] {
  return parsed.map((res, idx) => {
    const statusTag = detectStatusFromOcrText(res.statusText ?? res.rawText) ?? "purchase";
    const product = toProduct(res, idx, imageId);
    // toProduct 가 이미 toFiniteAmount 로 가격/수량을 정규화한 결과를 그대로 사용합니다.
    // 외부 res.price 를 다시 곱하면 string 으로 들어온 경우 NaN 이 생길 수 있으니,
    // product.price·product.quantity 만 신뢰합니다.
    return {
      id: `${imageId}-order-${idx}`,
      orderDate: res.date ?? "",
      statusTag,
      statusLabel: "자동 추출됨",
      totalAmount: product
        ? toFiniteAmount(product.price) * (toFiniteAmount(product.quantity) || 1)
        : 0,
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
  //
  // 2026-04-24 진행률 재설계: 모달이 Tesseract/AI 를 **단일 바** 로 보여주도록 이미지 한 장의
  // 진행률을 `0..1` 내부 좌표로 통일합니다.
  //   - Tesseract 단계: `0.0 → 0.5`  (recognize 진행률을 2로 나눠 스케일)
  //   - AI 단계:        `0.5 → 1.0`  (AI 필요하면 호출 끝날 때 1.0, 없으면 바로 1.0)
  //   - 모달 전체 진행률 = `(currentIndex + currentProgress) / totalCount`
  // 이 방식이면 AI 필요 없는 이미지는 0 → 0.5 → 1.0 으로 "쭉쭉 차서" 다음 이미지로 넘어가고,
  // AI 필요한 이미지는 0.5 에서 잠시 머문 뒤 1.0 으로 차오릅니다.
  const worker = await createWorker("kor+eng", 1, {
    logger: (message) => {
      // recognize 단계에서는 progress 를 이미지 슬롯의 전반부(0→0.5) 에 매핑합니다.
      if (message.status === "recognizing text") {
        onProgress({
          currentIndex: currentImageMeta.index,
          totalCount,
          currentFileName: currentImageMeta.fileName,
          currentThumbUrl: currentImageMeta.thumbUrl,
          currentPlatform: currentImageMeta.platform,
          currentProgress: message.progress * 0.5,
          currentStatus: message.status,
          phase: "tesseract",
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
          phase: "tesseract",
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
    // AI 호출 통계 누적 — 아래 완료 요약 로깅에 사용.
    let triggeredImages = 0;

    // ───────── 이미지별 단일 파이프라인 (Tesseract → 파싱 → 필요 시 AI) ─────────
    //
    // 2026-04-24 구조 변경: Tesseract 전체 끝내고 AI 전체 돌리는 두 루프 → 이미지 한 장을
    // 처음부터 끝까지(파싱·AI) 완결하고 다음 장으로 넘어가는 단일 루프. 이유:
    //   (1) UX: 모달 진행 바가 "전체 0→100" 을 한 번만 그림. 두 번 리셋되며 "어디까지 왔지?"
    //       혼동이 사라짐.
    //   (2) 상관 없는 이미지(= AI 불필요) 는 `0.0→0.5→1.0` 으로 즉시 슬롯을 차고 지나감.
    //       AI 필요한 이미지는 `0.5` 에 잠깐 머물고 `1.0` 으로 마무리.
    //   (3) 코드: imagesNeedingAi 별도 배열 불필요, targetImages[idx] 매칭도 즉시.
    for (let i = 0; i < targetImages.length; i += 1) {
      const image = targetImages[i];

      // 이미지 진입 — 슬롯 시작 0.0
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
        phase: "tesseract",
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

      // ── Tesseract ── 진행률은 logger 가 0→0.5 스케일로 자동 흘려보냄.
      const preprocessed = await preprocessImageForOcr(image.file);
      const result = await worker.recognize(preprocessed);
      const rawText = applyOcrCorrections(result.data.text);

      // Tesseract 완료 시점 명시적 0.5 마크 (logger 가 마지막 0.5 를 쏴줄 수도 있지만 보장 목적).
      onProgress({
        currentIndex: i,
        totalCount,
        currentFileName: image.fileName,
        currentThumbUrl: image.thumbUrl,
        currentPlatform: image.platform,
        currentProgress: 0.5,
        currentStatus: "parsing",
        phase: "tesseract",
      });

      let parsedData: PurchaseOCRResult[] = [];
      if (image.platform === "coupang") {
        parsedData = parseCoupangOrderText(rawText);
      } else if (image.platform === "naver") {
        parsedData = parseNaverOrderText(rawText);
      }

      const orders =
        image.platform === "coupang" && parsedData.length > 0
          ? buildCoupangOrders(image.id, parsedData)
          : buildFlatOrders(image.id, parsedData);

      const imageItem: OcrImageItem = {
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
      };

      // ── AI 필요 여부 판단 후 호출 ──
      //
      // 1차 필터: bad 카드가 하나라도 있어야 AI 호출. 비용 절약 목적 유지.
      // 호출 시에는 이미지 전체 카드(clean 포함) 를 넘겨 clean 카드도 AI 가 미세 오류 발견 시
      // 함께 보정. aiService 가 changedIds 로 실제 변경된 카드만 aiApplied 플래그를 찍음.
      const badPerOrder = imageItem.orders.map((o) =>
        pickBadProducts(o.products, o.statusTag),
      );
      const flatBad = badPerOrder.flat();
      const allProducts = imageItem.orders.flatMap((o) => o.products);

      if (flatBad.length > 0 && allProducts.length > 0) {
        triggeredImages += 1;
        // 이 이미지가 AI 2차 확인을 거친다는 사실을 imageItem 에 기록. EditForm 의 debug
        // chip("🛠 DEBUG: AI 인식됨") 만 이 값을 읽습니다. DEBUG_OCR_AI 가 false 인 배포
        // 빌드에서는 읽는 쪽이 tree-shake 돼 사용자에게는 노출되지 않습니다.
        imageItem.aiInvoked = true;
        // AI 시작 — progress 0.5 유지, phase "ai-fallback" 으로 전환해 모달이 subtext 를 바꿈.
        onProgress({
          currentIndex: i,
          totalCount,
          currentFileName: image.fileName,
          currentThumbUrl: image.thumbUrl,
          currentPlatform: image.platform,
          currentProgress: 0.5,
          currentStatus: "ai-fallback",
          phase: "ai-fallback",
        });

        const fallback = await runAiOcrFallback({
          imageId: imageItem.id,
          platform: imageItem.platform,
          rawText: imageItem.rawText ?? "",
          allProducts,
          badIds: flatBad.map((p) => p.id),
          imageFile: image.file,
        });
        if (!fallback.failed) {
          const byId = new Map(fallback.products.map((p) => [p.id, p]));
          imageItem.orders = imageItem.orders.map((o) => ({
            ...o,
            products: o.products.map((p) => byId.get(p.id) ?? p),
          }));
        }
      }

      // 이 이미지 슬롯 완료 — progress 1.0. AI 필요 없었던 이미지는 여기서 "쭉쭉 차버리는" 느낌.
      onProgress({
        currentIndex: i,
        totalCount,
        currentFileName: image.fileName,
        currentThumbUrl: image.thumbUrl,
        currentPlatform: image.platform,
        currentProgress: 1.0,
        currentStatus: "done",
        phase: flatBad.length > 0 ? "ai-fallback" : "tesseract",
      });

      processed.push(imageItem);
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
      // triggeredImages 는 루프 중 AI 호출이 발동한 이미지 수(위에서 누적).
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
