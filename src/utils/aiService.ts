/**
 * 역할: Gemini API를 호출하여 프론트엔드에서 AI 기능을 수행하는 헬퍼 함수입니다.
 * 위치: src/utils/aiService.ts
 *
 * 속도 최적화 정책 (fallbackCsv 기준):
 *  1) 출력 포맷을 JSON이 아닌 파이프(|) 구분 라인으로 강제 → 출력 토큰 수 대폭 축소.
 *  2) Gemini 2.5 Flash의 thinking 토큰 예산을 0으로 눌러 내부 추론 시간 제거.
 *  3) temperature/topP/topK를 딱딱하게 잠가 샘플링을 가장 기계적인 경로로 유도.
 *  4) generateContentStream으로 받아 라인이 도착하는 즉시 파싱 → 마지막 토큰 직전까지 기다릴 필요 없음.
 *  5) 입력 텍스트는 BOM/중복 공백/빈 줄을 정리하고 상한선을 적용.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { CsvRow } from "./csvParse";
import type { Status, OcrProduct, Platform } from "../pages/OcrEdit/data";
import { PLATFORM_LABELS } from "../constants/labels";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

// thinkingConfig는 현 @google/generative-ai(0.24.x) 타입 정의에 없으나, SDK는 generationConfig를
// REST로 그대로 포워딩하므로 서버 단에서는 유효하게 해석됩니다. 타입 우회를 위해 별도 상수로 둡니다.
const FAST_GENERATION_CONFIG = {
  temperature: 0,
  topP: 0.1,
  topK: 1,
  responseMimeType: "text/plain",
  // Gemini 2.5 Flash에서 내부 추론 토큰을 끄는 설정. 일반 추출 작업이라 thinking이 없어도 결과 품질 차이는 미미.
  thinkingConfig: { thinkingBudget: 0 },
} as unknown as Record<string, unknown>;

/**
 * 1. 규칙 기반 소비 요약을 받아서 자연스러운 1~2문장의 인사이트로 변환합니다.
 */
export async function generateInsight(rulesText: string): Promise<string> {
  if (!API_KEY) return "설정된 AI API 키가 없습니다. 키를 등록하시면 AI 요약이 활성화됩니다.";

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: FAST_GENERATION_CONFIG as never,
    });
    const prompt = `다음은 이번 달 사용자의 소비 패턴을 규칙 기반으로 요약한 데이터입니다:\n\n${rulesText}\n\n위 내용을 바탕으로 사용자에게 도움이 되는 1~2문장의 친근하고 짧은 소비 인사이트를 만들어주세요.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error("AI Insight Generation Failed:", error);
    return "AI 분석을 불러오는 중 오류가 발생했습니다.";
  }
}

/**
 * 2. 영수증 원문 텍스트가 일반 파서에서 실패했을 때 거래 상태를 추출합니다.
 */
export async function fallbackOcr(text: string): Promise<Status | undefined> {
  if (!API_KEY) return undefined;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: FAST_GENERATION_CONFIG as never,
    });
    const prompt = `다음 영수증 텍스트를 보고 거래 상태를 유추해줘. 무조건 'purchase', 'refund', 'cancel', 'sub' 중 하나만 대답해. 텍스트: ${text}`;

    const result = await model.generateContent(prompt);
    const answer = (await result.response.text()).trim().toLowerCase();

    if (["purchase", "refund", "cancel", "sub"].includes(answer)) {
      return answer as Status;
    }
    return undefined;
  } catch (error) {
    console.error("OCR Fallback Failed:", error);
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────
// fallbackCsv 지원 유틸
// ─────────────────────────────────────────────────────────────

/** 파이프 포맷 한 라인 → CsvRow. 필드 수/값이 비정상이면 null로 스킵. */
function parsePipeLine(line: string): CsvRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // 코드펜스/주석/안내문이 라인 단위로 섞여 와도 무시.
  if (trimmed.startsWith("```") || trimmed.startsWith("//") || trimmed.startsWith("#")) return null;

  const parts = trimmed.split("|").map((p) => p.trim());
  if (parts.length < 4) return null;

  const [date, merchant, amount, category] = parts;

  // 진짜 데이터 헤더 라인(예: "이용일|가맹점명|이용금액|카테고리")은 스킵.
  if (/[가-힣]/.test(date) && /[가-힣]/.test(amount)) return null;
  // 가맹점 라벨 자체가 헤더일 경우도 방어.
  if (date === "이용일" && merchant === "가맹점명") return null;
  if (!date || !merchant) return null;

  return {
    이용일: date,
    가맹점명: merchant,
    이용금액: amount,
    카테고리: category || "",
  };
}

/** 입력 원문을 압축: BOM/빈 줄/탭·공백 중복을 제거해 입력 토큰을 줄입니다. */
function compressInputText(text: string, maxChars = 60_000): string {
  const cleaned = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
  if (cleaned.length <= maxChars) return cleaned;
  // 상한을 초과하면 앞부분만. 카드사 CSV는 보통 앞쪽에 안내가 있고 본문이 이어지므로
  // 머리 30% + 꼬리 70% 비중으로 잘라 본문 손실을 최소화.
  const head = Math.floor(maxChars * 0.3);
  const tail = maxChars - head;
  return cleaned.slice(0, head) + "\n...[생략]...\n" + cleaned.slice(cleaned.length - tail);
}

/**
 * 3. CSV나 Excel 텍스트가 깨졌을 때 AI가 표 형태의 객체 배열로 복구합니다.
 *    - 출력은 파이프(|) 포맷, 스트리밍으로 받아 라인 단위 즉시 파싱.
 */
export async function fallbackCsv(text: string): Promise<CsvRow[]> {
  if (!API_KEY) return [];

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: FAST_GENERATION_CONFIG as never,
    });

    const compressed = compressInputText(text);

    const prompt = `너는 한국 카드사/쇼핑몰 명세서에서 거래 행만 뽑아내는 추출기다.
다음 규칙을 엄격히 지켜라:
- 출력은 오직 파이프(|) 구분 라인이다. JSON/코드펜스/설명/머리말/꼬리말 금지.
- 각 라인 형식: \`이용일|가맹점명|이용금액|카테고리\`
- 이용일은 \`YYYY.MM.DD\` 형식(하이픈/슬래시 금지).
- 이용금액은 쉼표 없이 정수 숫자만(예: 4500). 환불/취소면 금액 앞에 '-'를 붙이지 말고 양수로 적되, 카테고리 뒤에는 쓰지 마라.
- 가맹점명 안에 '|' 문자가 있으면 공백으로 치환하라.
- '총 합계', '소계', '누계' 같은 요약 행은 절대 출력하지 마라.
- 가맹점명이 비거나 알 수 없으면 '알 수 없음'으로 적는다.
- 카테고리는 가능하면 한 단어(예: 카페, 식당, 교통, 쇼핑, 구독, 기타). 모르면 '기타'.
- 헤더 라인을 출력하지 마라. 첫 라인부터 바로 데이터다.

데이터:
${compressed}`;

    const stream = await model.generateContentStream(prompt);

    const rows: CsvRow[] = [];
    let buffer = "";

    for await (const chunk of stream.stream) {
      // text()는 청크 텍스트. 누적 버퍼에 붙인 뒤 개행 기준으로 잘라 즉시 파싱.
      const piece = typeof chunk.text === "function" ? chunk.text() : "";
      if (!piece) continue;
      buffer += piece;

      let nlIdx = buffer.indexOf("\n");
      while (nlIdx !== -1) {
        const line = buffer.slice(0, nlIdx);
        buffer = buffer.slice(nlIdx + 1);
        const parsed = parsePipeLine(line);
        if (parsed) rows.push(parsed);
        nlIdx = buffer.indexOf("\n");
      }
    }

    // 스트림이 끝났을 때 버퍼에 남아있던 마지막 라인도 처리.
    const last = parsePipeLine(buffer);
    if (last) rows.push(last);

    // 파이프 파싱이 한 건도 못 건졌다면, 모델이 포맷을 무시하고 JSON을 뱉었을 가능성을 대비해
    // 예비로 JSON 배열 파싱을 한 번 더 시도합니다(코드펜스도 벗겨서).
    if (rows.length === 0 && buffer.trim()) {
      try {
        const cleaned = buffer
          .replace(/^```json/i, "")
          .replace(/^```/i, "")
          .replace(/```$/i, "")
          .trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          for (const obj of parsed) {
            if (obj && typeof obj === "object") {
              rows.push({
                이용일: String((obj as Record<string, unknown>).이용일 ?? "").trim(),
                가맹점명: String((obj as Record<string, unknown>).가맹점명 ?? "").trim(),
                이용금액: String((obj as Record<string, unknown>).이용금액 ?? "").trim(),
                카테고리: String((obj as Record<string, unknown>).카테고리 ?? "").trim(),
              });
            }
          }
        }
      } catch {
        // JSON도 아니면 그냥 빈 배열로 둠.
      }
    }

    return rows;
  } catch (error) {
    console.error("CSV Fallback Failed:", error);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// fallbackOcrProducts — Tesseract 가 복구 못 한 상품 카드를 Gemini Vision 으로 재추출
// ─────────────────────────────────────────────────────────────
//
// 동작: 파서가 'bad' 로 분류한 카드의 id 를 유지한 채 name/price/quantity 만 이미지와 rawText
// 를 근거로 재추출. 출력은 기존 aiService 컨벤션(파이프 포맷, JSON/코드펜스 금지, temperature
// 0) 을 그대로 따라 파싱 실패 위험을 최소화합니다.
//
// 호출 규약:
//   - 입력 id 와 출력 id 가 1:1 로 매칭돼야 합니다. 매칭 안 되면 caller 가 원본을 유지.
//   - 이미지(File) 가 있으면 Vision 으로 같이 넘깁니다(훨씬 정확). 없으면 rawText 만으로 추측.
//   - 실패(키 없음/네트워크/파싱 0건) 시 null 반환. Caller 는 graceful fallback.

/** File → base64 (data URL 의 뒤쪽만). Gemini SDK 의 inlineData.data 규격. */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // "data:image/png;base64,iVBOR..." → "iVBOR..." 만 추출.
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export interface FallbackOcrProductsInput {
  platform: Platform;
  /** 이미지 전체 Tesseract rawText — 파서 후처리 적용된 상태. */
  rawText: string;
  /** AI 가 보정할 카드들. id 유지, name/price 가 현재 값(참고용). */
  problemProducts: Pick<OcrProduct, "id" | "name" | "price" | "quantity">[];
  /** 원본 이미지(있으면 Vision 활성화). 브라우저에서 업로드한 File 객체 그대로. */
  imageFile?: File;
}

export interface FallbackOcrProductsResult {
  /** 입력 problemProducts 와 같은 순서·id. name/price/quantity 는 보정된 값. */
  products: OcrProduct[];
}

/**
 * Gemini 2.5 Flash 로 문제 카드의 이름/가격을 복구합니다.
 *
 * - API_KEY 없음 → null
 * - 파싱 결과 0건 → null
 * - 예외 → null (caller 는 원본 유지)
 */
export async function fallbackOcrProducts(
  input: FallbackOcrProductsInput,
): Promise<FallbackOcrProductsResult | null> {
  if (!API_KEY) return null;
  if (input.problemProducts.length === 0) return { products: [] };

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: FAST_GENERATION_CONFIG as never,
    });

    const platformKor = PLATFORM_LABELS[input.platform] ?? "쇼핑몰";

    // problemProducts 를 한 블록으로 넘겨 각 id 별로 한 라인씩 받습니다.
    const problemsBlock = input.problemProducts
      .map((p, i) =>
        `${i + 1}. id=${p.id} · 현재이름="${p.name ?? ""}" · 현재가격=${p.price ?? 0}`,
      )
      .join("\n");

    const prompt = `너는 ${platformKor} 주문내역 캡쳐에서 OCR 파서가 복구 못 한 상품 카드만 다시 읽어내는 추출기다.
입력에는 (1) OCR 로 뽑힌 rawText, (2) 문제 카드 목록(id · 현재 이름 · 현재 가격) 이 들어온다.
원본 이미지가 함께 주어지면 이미지를 우선 참조하고, 없으면 rawText 만으로 유추해라.

규칙을 엄격히 지킨다:
- 출력은 오직 파이프(|) 구분 라인. JSON / 코드펜스 / 머리말 / 꼬리말 금지.
- 각 라인 형식: \`id|name|price|quantity\`
- id 는 입력과 글자 단위로 정확히 같게 복사한다(재생성 금지).
- name 은 ${platformKor} 에서 검색 가능한 자연스러운 상품명. 브랜드+품목이 드러나게. 판독 불가면 현재 이름을 정리만 해서 반환.
- price 는 쉼표·원 기호 없는 정수(예: 11900). 정말 판독 불가면 0.
- quantity 는 정수. 수량을 찾을 수 없으면 1.
- 입력된 문제 카드 수만큼 정확히 그만큼의 라인을 출력한다. 새 카드 추가·빠뜨리기 금지.
- 설명 문장 추가 금지. 첫 라인부터 데이터다.

rawText:
${input.rawText.slice(0, 8000)}

문제 카드 목록:
${problemsBlock}`;

    // Gemini 멀티모달: parts 배열 [text, inlineData?]
    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [{ text: prompt }];
    if (input.imageFile) {
      try {
        const base64 = await fileToBase64(input.imageFile);
        parts.push({
          inlineData: {
            mimeType: input.imageFile.type || "image/png",
            data: base64,
          },
        });
      } catch (e) {
        console.warn("[fallbackOcrProducts] 이미지 base64 변환 실패, 텍스트로만 진행:", e);
      }
    }

    const result = await model.generateContent(parts as never);
    const text = (await result.response.text()).trim();

    // 파이프 파싱. id 가 입력과 매칭되는 것만 받아들임.
    const inputIds = new Set(input.problemProducts.map((p) => p.id));
    const idToInput = new Map(input.problemProducts.map((p) => [p.id, p]));
    const recovered = new Map<string, OcrProduct>();

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("```") || line.startsWith("#")) continue;
      const cols = line.split("|").map((c) => c.trim());
      if (cols.length < 3) continue;
      const [id, name, priceStr, qtyStr] = cols;
      if (!inputIds.has(id)) continue;
      const price = parseInt(priceStr.replace(/[^0-9-]/g, ""), 10);
      if (!Number.isFinite(price)) continue;
      const orig = idToInput.get(id)!;
      const quantity = qtyStr ? parseInt(qtyStr.replace(/[^0-9]/g, ""), 10) : undefined;
      recovered.set(id, {
        id,
        name: name || orig.name || "",
        price: Math.max(0, price),
        ...(quantity && quantity > 0 ? { quantity } : {}),
      });
    }

    if (recovered.size === 0) return null;

    // 입력 순서 유지. 응답에 빠진 id 는 현재 값을 유지하되 호출 실패로 간주하지 않음.
    const products: OcrProduct[] = input.problemProducts.map((p) => {
      const r = recovered.get(p.id);
      if (r) return r;
      return {
        id: p.id,
        name: p.name,
        price: p.price,
        ...(p.quantity !== undefined ? { quantity: p.quantity } : {}),
      };
    });

    return { products };
  } catch (error) {
    console.error("OCR Products Fallback Failed:", error);
    return null;
  }
}
