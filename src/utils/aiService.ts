/**
 * 역할: 프론트에서 직접 Gemini SDK를 호출하지 않고 Firebase Functions 경유로 AI 기능을 사용합니다.
 * 위치: src/utils/aiService.ts
 */
import { httpsCallable } from "firebase/functions";
import type { CsvRow } from "./csvParse";
import type { Status, OcrProduct, Platform } from "../pages/OcrEdit/data";
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

export async function generateInsight(rulesText: string): Promise<string> {
  try {
    const result = await geminiProxy({
      action: "generateInsight",
      payload: { rulesText },
    });
    const data = result.data as { text?: string };
    return data.text?.trim() || "AI 분석을 불러오는 중 오류가 발생했습니다.";
  } catch (error) {
    console.error("AI Insight Generation Failed:", error);
    return "AI 분석을 불러오는 중 오류가 발생했습니다.";
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
  } catch (error) {
    console.error("OCR Fallback Failed:", error);
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
  } catch (error) {
    console.error("CSV Fallback Failed:", error);
    return [];
  }
}

export interface FallbackOcrProductsInput {
  platform: Platform;
  rawText: string;
  allProducts: Pick<OcrProduct, "id" | "name" | "price" | "quantity">[];
  badIds?: string[];
  imageFile?: File;
}

export interface FallbackOcrProductsResult {
  products: OcrProduct[];
  changedIds: Set<string>;
}

export async function fallbackOcrProducts(
  input: FallbackOcrProductsInput,
): Promise<FallbackOcrProductsResult | null> {
  try {
    const payload: {
      platform: Platform;
      rawText: string;
      allProducts: Pick<OcrProduct, "id" | "name" | "price" | "quantity">[];
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
    const data = result.data as { products?: OcrProduct[]; changedIds?: string[] } | null;

    if (!data || !Array.isArray(data.products)) return null;
    return {
      products: data.products,
      changedIds: new Set(Array.isArray(data.changedIds) ? data.changedIds : []),
    };
  } catch (error) {
    console.error("OCR Products Fallback Failed:", error);
    return null;
  }
}
