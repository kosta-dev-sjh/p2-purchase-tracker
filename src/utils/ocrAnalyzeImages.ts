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
import type { OcrImageItem, OcrOrder, OcrProduct } from "../pages/OcrEdit/data";
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
import { detectPlatformFromRawText } from "./ocrPlatformDetect";
import { buildHistoryCache, applyHistoryCorrectionToProducts } from "./ocrHistoryCorrection";
import { transactionsStore } from "../stores/transactionsStore";

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
    const digits = value.replace(/[^\d.-]/g, "");
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
    ...(res.date ? { date: res.date } : {}),
    quantity: qty,
    // Tesseract 단에서 가격 라인을 못 읽은 경우만 플래그를 전파 — AI 자동 보정 트리거 용도.
    ...(res.priceOcrFailed ? { priceOcrFailed: true } : {}),
  };
}

/**
 * 쿠팡 캡쳐 전용: 주문 헤더 날짜별로 그룹화해 각 날짜마다 OcrOrder 를 하나씩 만듭니다.
 * 헤더가 1개면 카드 1장(묶음 상품), N개면 N장이 생깁니다.
 */
export function buildCoupangOrders(
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
 * 네이버용: 결과 1개당 OcrOrder 1개. 단 두 가지 예외:
 *
 *   1) folded(접힌 주문, "주문 펼쳐보기"/"총 N건 펼쳐보기") 메타:
 *      - products[] 는 대표 상품 1개로 유지하되 가격은 0/미확정 (toProduct 가 흡수)
 *      - totalAmount 는 product 합계 대신 sectionTotal 을 우선 사용 — 정책 §6.
 *      - folded/itemCountHint/sectionTotal 메타를 그대로 OcrOrder 에 보존해
 *        OrderCard / DetailPanel 이 "접힌 주문 · 외 n건 숨김" 안내를 띄울 수 있게 합니다.
 *
 *   2) **expandedFoldGroup** ("총 N건 주문 접기" 펼쳐진 fold 묶음):
 *      같은 결제(주문번호 1개) 로 묶인 N개 카드가 모두 visible 인 상태. 1차 파서가 status
 *      anchor 단위로 N개 OcrOrder 를 만들면 거래내역에 N건으로 분리되는데, 사용자 실제 결제는
 *      1건이라 정합성 어긋남(2026-04-27 사용자 보고). 모든 결과 카드를 1개 OcrOrder 의
 *      products[] 로 합쳐 저장. orderDate/statusTag 는 첫 카드 기준. totalAmount 는 모든
 *      products price 합계.
 */
export function buildFlatOrders(
  imageId: string,
  parsed: PurchaseOCRResult[],
): OcrOrder[] {
  const buildSingleOrder = (res: PurchaseOCRResult, idx: number): OcrOrder => {
    const statusTag = detectStatusFromOcrText(res.statusText ?? res.rawText) ?? "purchase";
    const product = toProduct(res, idx, imageId);
    // toProduct 가 이미 toFiniteAmount 로 가격/수량을 정규화한 결과를 그대로 사용합니다.
    // 외부 res.price 를 다시 곱하면 string 으로 들어온 경우 NaN 이 생길 수 있으니,
    // product.price·product.quantity 만 신뢰합니다.
    const productSum = product
      ? toFiniteAmount(product.price) * (toFiniteAmount(product.quantity) || 1)
      : 0;
    const sectionTotal = toFiniteAmount(res.sectionTotal);
    const folded = res.folded === true;
    // folded 일 때만 sectionTotal 을 totalAmount 로 끌어옵니다. 펼친 주문은 products 합계를
    // 신뢰하고, sectionTotal 은 메타로만 보존(정합성 점검용).
    const totalAmount = folded && sectionTotal > 0 ? sectionTotal : productSum;

    return {
      id: `${imageId}-order-${idx}`,
      orderDate: res.date ?? "",
      statusTag,
      statusLabel: "자동 추출됨",
      totalAmount,
      rawText: res.rawText,
      products: product ? [product] : [],
      ...(folded ? { folded: true } : {}),
      ...(res.itemCountHint !== undefined ? { itemCountHint: res.itemCountHint } : {}),
      ...(sectionTotal > 0 ? { sectionTotal } : {}),
    };
  };

  const mergeOrders = (orders: OcrOrder[], label: string): OcrOrder => {
    const first = orders[0];
    const products = orders.flatMap((order) => order.products);
    const totalAmount = products.reduce(
      (sum, p) => sum + toFiniteAmount(p.price) * (toFiniteAmount(p.quantity) || 1),
      0,
    );
    const orderDate =
      orders.map((order) => order.orderDate).find((date) => date && date.trim()) ?? "";
    const itemCountHint = orders.find((order) => typeof order.itemCountHint === "number")?.itemCountHint;
    const sectionTotal = orders.reduce(
      (max, order) => Math.max(max, toFiniteAmount(order.sectionTotal)),
      0,
    );
    return {
      id: first.id,
      orderDate,
      statusTag: first.statusTag,
      statusLabel: label,
      totalAmount,
      rawText: orders.map((order) => order.rawText ?? "").filter(Boolean).join("\n"),
      products,
      ...(itemCountHint !== undefined ? { itemCountHint } : {}),
      ...(sectionTotal > 0 ? { sectionTotal } : {}),
    };
  };

  const orders: OcrOrder[] = [];
  for (let idx = 0; idx < parsed.length; idx += 1) {
    const res = parsed[idx];
    const currentOrder = buildSingleOrder(res, idx);

    if (res.addonCandidate && orders.length > 0) {
      const prev = orders[orders.length - 1];
      orders[orders.length - 1] = mergeOrders([prev, currentOrder], "자동 추출됨 (추가상품 묶음)");
      continue;
    }

    const foldTailCount = res.expandedFoldTailCount ?? 0;
    if (foldTailCount > 1 && orders.length >= foldTailCount - 1) {
      const previousGroup = orders.splice(orders.length - (foldTailCount - 1), foldTailCount - 1);
      orders.push(mergeOrders([...previousGroup, currentOrder], "자동 추출됨 (펼쳐진 묶음)"));
      continue;
    }

    orders.push(currentOrder);
  }

  return orders;
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

  // 사용자 history-based 자체 보정 cache 빌드 (1회). transactionsStore 의 기존 거래 title/items 를
  // 정규화해서 fuzzy 매칭 후보로 사용. AI 호출 0, wordlist 하드코딩 0 — 사용자별 동적 학습.
  // 자세한 정책/알고리즘은 src/utils/ocrHistoryCorrection.ts 참고.
  const historyCache = buildHistoryCache(transactionsStore.loadAll());

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
      // setParameters 실패는 기본값으로 진행해도 무방하므로 조용히 흘립니다.
    }

    const processed: OcrImageItem[] = [];

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
          sourceDataUrl: image.sourceDataUrl,
          status: "analyzed",
          platform: image.platform,
          orders: [],
        });
        continue;
      }

      // ── Tesseract ── 진행률은 logger 가 0→0.5 스케일로 자동 흘려보냄.
      const preprocessed = await preprocessImageForOcr(image.file, { platform: image.platform });
      const result = await worker.recognize(preprocessed);
      // 후처리는 platform-aware. Coupang 전용 ribbon noise 제거가 네이버 결제 라인을 잘못
      // 떨어뜨릴 위험 때문에 platform 을 같이 넘겨줍니다(ocrCorrection.applyOcrCorrections 분기).
      const rawText = applyOcrCorrections(result.data.text, image.platform);

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

      // Platform auto-detection: rawText 기반으로 사용자가 선택한 platform 이 맞는지 확인.
      // mismatch 면 OcrUpload 가 confirm 모달을 띄워 재선택 권유. 자세한 알고리즘은
      // src/utils/ocrPlatformDetect.ts 참고. literal UI 라벨/배지 시그널만 사용.
      const detection = detectPlatformFromRawText(rawText);

      const imageItem: OcrImageItem = {
        id: image.id,
        fileName: image.fileName,
        thumbUrl: image.thumbUrl,
        sourceDataUrl: image.sourceDataUrl,
        status: "analyzed",
        platform: image.platform,
        rawText,
        detectedPlatform: detection.detected,
        detectionConfidence: detection.confidence,
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

      // ── 사용자 history-based 자체 보정 ──
      //
      // AI 게이트 전에 history cache 매칭으로 OCR itemName 변형을 자체 회복. 이전에 같은
      // 사용자가 정정/저장한 거래 title 과 fuzzy 매칭(임계 0.7) 되면 cache 의 깨끗한 이름으로 교체.
      // 이렇게 보정된 카드는 ocrQuality 의 bad 분류에 영향을 주어 일부 AI 호출이 자연 회피됨.
      const totalCardCountForCorrection = imageItem.orders.reduce((a, o) => a + o.products.length, 0);
      if (historyCache.length > 0 && totalCardCountForCorrection > 0) {
        imageItem.orders = imageItem.orders.map((o) => {
          const { products: corrected } = applyHistoryCorrectionToProducts(
            o.products,
            historyCache,
          );
          return { ...o, products: corrected };
        });
      }

      // ── AI 필요 여부 판단 후 호출 ──
      //
      // 1차 필터: bad 카드가 하나라도 있어야 AI 호출. 비용 절약 목적 유지.
      // 호출 시에는 이미지 전체 카드(clean 포함) 를 넘겨 clean 카드도 AI 가 미세 오류 발견 시
      // 함께 보정. aiService 가 changedIds 로 실제 변경된 카드만 aiApplied 플래그를 찍음.
      //
      // 정책 (CLAUDE.md §9.1): pickBadProducts 는 platform-agnostic 으로 유지. 네이버 전용
      // 게이트 분기를 여기에 추가하면 ocrQuality 책임 경계가 흐려져 회귀 추적이 어려워진다.
      // 네이버 캡쳐의 OCR 실패(가격 0 원, 날짜 결측 등) 를 게이트가 못 잡으면 그건 ocrQuality
      // 의 bad 룰 자체가 부족하다는 측정 신호 — Phase D harness 결과 보고 platform 무관 룰로
      // 글로벌 임계값을 조정한다 (네이버 한정 우회로 만들지 않는다).
      const badPerOrder = imageItem.orders.map((o) =>
        pickBadProducts(o.products, o.statusTag),
      );
      const flatBad = badPerOrder.flat();
      const allProducts = imageItem.orders.flatMap((o) => o.products);

      if (flatBad.length > 0 && allProducts.length > 0) {
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

        // AI 에 현재 날짜 hint 같이 넘김 — 각 product 가 속한 OcrOrder 의 orderDate 를 임시 attach.
        // Functions 의 prompt 가 "현재날짜=..." 컨텍스트로 활용. 응답에서 product 마다 보정된
        // date 가 돌아오면 caller 가 OcrOrder.orderDate 빈 곳을 채움(2026-04-27 사용자 보고).
        const productOrderMap = new Map<string, string>();
        const allProductsWithDate = imageItem.orders.flatMap((o) =>
          o.products.map((p) => {
            productOrderMap.set(p.id, o.id);
            return o.orderDate
              ? ({ ...p, date: o.orderDate } as OcrProduct & { date?: string })
              : p;
          }),
        );

        const fallback = await runAiOcrFallback({
          imageId: imageItem.id,
          platform: imageItem.platform,
          rawText: imageItem.rawText ?? "",
          allProducts: allProductsWithDate,
          badIds: flatBad.map((p) => p.id),
          imageFile: image.file,
        });
        if (!fallback.failed) {
          const byId = new Map(fallback.products.map((p) => [p.id, p]));
          imageItem.orders = imageItem.orders.map((o) => {
            const updatedProducts = o.products.map((p) => byId.get(p.id) ?? p);
            // AI 가 회복한 date 가 있고 OcrOrder.orderDate 가 비었으면 product 의 date 를
            // 끌어다 채움. 같은 결제(같은 OcrOrder) 의 product 들은 같은 date 가 정상이라
            // 첫 번째 non-empty 를 사용.
            let nextOrderDate = o.orderDate;
            if (!nextOrderDate || !nextOrderDate.trim()) {
              for (const p of updatedProducts) {
                const d = (p as OcrProduct & { date?: string }).date;
                if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
                  nextOrderDate = d;
                  break;
                }
              }
            }
            return { ...o, orderDate: nextOrderDate, products: updatedProducts };
          });
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
