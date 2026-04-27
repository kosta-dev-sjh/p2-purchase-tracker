/**
 * 역할: 프론트에서 직접 Gemini SDK를 호출하지 않고 Firebase Functions 경유로 AI 기능을 사용합니다.
 * 위치: src/utils/aiService.ts
 */
import { httpsCallable } from "firebase/functions";
import type { CsvRow } from "./csvParse";
import type { Status, Platform } from "../pages/OcrEdit/data";
import { functions } from "../lib/firebase";

const geminiProxy = httpsCallable(functions, "geminiProxy");

async function fileToBase64(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 성공 시 인사이트 텍스트, 실패/빈 응답 시 null 을 돌려줍니다.
 * 호출부에서 null 을 캐시에 쓰지 않아야 에러 메시지가 그 달의 인사이트로
 * 영구히 박히는 사고를 막을 수 있습니다.
 */
export async function generateInsight(rulesText: string): Promise<string | null> {
  try {
    const result = await geminiProxy({
      action: "generateInsight",
      payload: { rulesText },
    });
    const data = result.data as { text?: string };
    const text = data.text?.trim();
    return text ? text : null;
  } catch {
    // 인사이트 생성 실패는 사용자 흐름을 막지 않습니다. null 반환으로 호출부가 폴백을 그립니다.
    return null;
  }
}

export async function fallbackOcr(text: string): Promise<Status | undefined> {
  try {
    const result = await geminiProxy({
      action: "fallbackOcr",
      payload: { text },
    });
    const data = result.data as { status?: Status | null };
    return data.status ?? undefined;
  } catch {
    // OCR 보정 실패 시 undefined 반환 — 호출부가 1차 파서 결과를 그대로 사용합니다.
    return undefined;
  }
}

export async function fallbackCsv(text: string): Promise<CsvRow[]> {
  try {
    const result = await geminiProxy({
      action: "fallbackCsv",
      payload: { text },
    });
    const data = result.data as { rows?: CsvRow[] };
    return Array.isArray(data.rows) ? data.rows : [];
  } catch {
    // CSV 보정 실패 시 빈 배열을 돌려 호출부가 친화적인 메시지로 사용자에게 알립니다.
    return [];
  }
}

/**
 * AI fallback 입력에 들어가는 product 의 부분 형태. OcrProduct 의 핵심 필드에 더해 현재 추출된
 * 날짜(date, ISO YYYY-MM-DD)를 같이 넘겨 Gemini 가 검증·보정할 수 있게 합니다.
 *
 * 2026-04-27: 사용자 보고 — AI 보정이 itemName/price 만 다루고 date 컬럼은 비워두는 회귀.
 * Functions 의 prompt 와 응답 파싱이 date 를 흡수하도록 동기 보강(서버측)되었고, 클라이언트도
 * input/output 에 date 를 일관 전달하도록 확장.
 */
export interface AiOcrProductInput {
  id: string;
  name: string | null;
  price: number;
  quantity?: number;
  /** 이미지에서 읽은 ISO 날짜 — 1차 파서가 채우지 못했으면 비워둠. AI 가 이미지에서 회복. */
  date?: string;
}

export interface AiOcrProductOutput {
  id: string;
  name: string;
  price: number;
  quantity?: number;
  /** Gemini 가 이미지에서 회복한 날짜. 형식 검증(YYYY-MM-DD) 통과한 것만 들어옴. */
  date?: string;
}

export interface FallbackOcrProductsInput {
  platform: Platform;
  rawText: string;
  allProducts: AiOcrProductInput[];
  badIds?: string[];
  imageFile?: File;
}

export interface FallbackOcrProductsResult {
  products: AiOcrProductOutput[];
  changedIds: Set<string>;
}

export async function fallbackOcrProducts(
  input: FallbackOcrProductsInput,
): Promise<FallbackOcrProductsResult | null> {
  try {
    const payload: {
      platform: Platform;
      rawText: string;
      allProducts: AiOcrProductInput[];
      badIds?: string[];
      imageBase64?: string;
      imageMimeType?: string;
    } = {
      platform: input.platform,
      rawText: input.rawText,
      allProducts: input.allProducts,
      badIds: input.badIds,
    };

    if (input.imageFile) {
      payload.imageBase64 = await fileToBase64(input.imageFile);
      payload.imageMimeType = input.imageFile.type || "image/png";
    }

    const result = await geminiProxy({
      action: "fallbackOcrProducts",
      payload,
    });
    const data = result.data as { products?: AiOcrProductOutput[]; changedIds?: string[] } | null;

    if (!data || !Array.isArray(data.products)) return null;
    return {
      products: data.products,
      changedIds: new Set(Array.isArray(data.changedIds) ? data.changedIds : []),
    };
  } catch {
    // 상품 단위 AI 보정 실패 시 null 반환 — 호출부가 1차 파서 결과를 그대로 유지합니다.
    return null;
  }
}
