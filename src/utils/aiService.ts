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
import type { Status } from "../pages/OcrEdit/data";

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
