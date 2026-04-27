import { GoogleGenerativeAI } from "@google/generative-ai";
import { initializeApp } from "firebase-admin/app";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

initializeApp();

const geminiApiKey = defineSecret("GEMINI_API_KEY");

type Status = "purchase" | "refund" | "cancel" | "sub";
type Platform = "coupang" | "naver";

interface CsvRow {
  이용일: string;
  가맹점명: string;
  이용금액: string;
  카테고리: string;
}

interface OcrProduct {
  id: string;
  name: string;
  price: number;
  quantity?: number;
}

interface FallbackOcrProductsInput {
  platform: Platform;
  rawText: string;
  allProducts: OcrProduct[];
  badIds?: string[];
  imageBase64?: string;
  imageMimeType?: string;
}

type GeminiProxyRequest =
  | { action: "generateInsight"; payload: { rulesText: string } }
  | { action: "fallbackOcr"; payload: { text: string } }
  | { action: "fallbackCsv"; payload: { text: string } }
  | { action: "fallbackOcrProducts"; payload: FallbackOcrProductsInput };

const FAST_GENERATION_CONFIG = {
  temperature: 0,
  topP: 0.1,
  topK: 1,
  responseMimeType: "text/plain",
  thinkingConfig: { thinkingBudget: 0 },
} as unknown as Record<string, unknown>;

const PLATFORM_LABELS: Record<Platform, string> = {
  coupang: "쿠팡",
  naver: "네이버",
};

function getGenAI(): GoogleGenerativeAI {
  const apiKey = geminiApiKey.value();
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "GEMINI_API_KEY secret is not configured.");
  }
  return new GoogleGenerativeAI(apiKey);
}

function createModel() {
  return getGenAI().getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: FAST_GENERATION_CONFIG as never,
  });
}

function parsePipeLine(line: string): CsvRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("```") || trimmed.startsWith("//") || trimmed.startsWith("#")) return null;

  const parts = trimmed.split("|").map((p) => p.trim());
  if (parts.length < 4) return null;

  const [date, merchant, amount, category] = parts;
  if (/[가-힣]/.test(date) && /[가-힣]/.test(amount)) return null;
  if (date === "이용일" && merchant === "가맹점명") return null;
  if (!date || !merchant) return null;

  return {
    이용일: date,
    가맹점명: merchant,
    이용금액: amount,
    카테고리: category || "",
  };
}

function compressInputText(text: string, maxChars = 60_000): string {
  const cleaned = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");

  if (cleaned.length <= maxChars) return cleaned;

  const head = Math.floor(maxChars * 0.3);
  const tail = maxChars - head;
  return cleaned.slice(0, head) + "\n...[생략]...\n" + cleaned.slice(cleaned.length - tail);
}

function normalizeInsightText(text: string): string {
  const singleLine = text
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!singleLine) return "";

  const sentenceMatches = singleLine.match(/[^.!?]+[.!?]?/g) ?? [singleLine];
  const firstTwoSentences = sentenceMatches
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");

  const clipped = firstTwoSentences || singleLine;
  return clipped.length <= 120 ? clipped : clipped.slice(0, 120).trimEnd() + "...";
}

async function runGenerateInsight(rulesText: string): Promise<{ text: string }> {
  const model = createModel();
  const prompt = `다음은 이번 달 사용자의 소비 패턴을 규칙 기반으로 요약한 데이터입니다:

${rulesText}

아래 규칙을 반드시 지켜 사용자에게 보여줄 소비 인사이트를 작성하세요.
- 한국어로만 작성합니다.
- 정확히 1~2문장만 작성합니다.
- 문장은 짧고 친근하게 씁니다.
- 불릿, 번호, 제목, 줄바꿈, 따옴표를 쓰지 않습니다.
- 120자 안팎으로 끝냅니다.
- 입력에 없는 수치나 사실은 만들지 않습니다.`;
  const result = await model.generateContent(prompt);
  return { text: normalizeInsightText(await result.response.text()) };
}

async function runFallbackOcr(text: string): Promise<{ status: Status | null }> {
  const model = createModel();
  const prompt = `다음 영수증 텍스트를 보고 거래 상태를 유추해줘. 무조건 'purchase', 'refund', 'cancel', 'sub' 중 하나만 대답해. 텍스트: ${text}`;
  const result = await model.generateContent(prompt);
  const answer = (await result.response.text()).trim().toLowerCase();
  return {
    status: ["purchase", "refund", "cancel", "sub"].includes(answer)
      ? (answer as Status)
      : null,
  };
}

async function runFallbackCsv(text: string): Promise<{ rows: CsvRow[] }> {
  const model = createModel();
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

  const last = parsePipeLine(buffer);
  if (last) rows.push(last);

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
            const record = obj as Record<string, unknown>;
            rows.push({
              이용일: String(record.이용일 ?? "").trim(),
              가맹점명: String(record.가맹점명 ?? "").trim(),
              이용금액: String(record.이용금액 ?? "").trim(),
              카테고리: String(record.카테고리 ?? "").trim(),
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return { rows };
}

async function runFallbackOcrProducts(input: FallbackOcrProductsInput) {
  if (input.allProducts.length === 0) {
    return { products: [], changedIds: [] as string[] };
  }

  const model = createModel();
  const badIdSet = new Set(input.badIds ?? []);
  const productsBlock = input.allProducts
    .map((p, i) => {
      const flag = badIdSet.has(p.id) ? " (의심)" : "";
      const currentDate = (p as OcrProduct & { date?: string }).date;
      const dateHint = currentDate ? ` · 현재날짜=${currentDate}` : " · 현재날짜=(없음)";
      return `${i + 1}. id=${p.id}${flag} · 현재이름="${p.name ?? ""}" · 현재가격=${p.price ?? 0}${dateHint}`;
    })
    .join("\n");

  const platformKor = PLATFORM_LABELS[input.platform] ?? "쇼핑몰";
  const prompt = `너는 ${platformKor} 주문내역 캡쳐에서 상품 카드의 이름·가격·날짜를 이미지와 rawText 로 검증·보정하는 추출기다.
입력에는 (1) OCR 로 뽑힌 rawText, (2) 이 이미지의 **전체 카드 목록**(id · 현재 이름 · 현재 가격 · 현재 날짜) 이 들어온다.
"(의심)" 이 붙은 카드는 Tesseract 파서가 복구 못 한 카드라 특히 신경 써서 이미지에서 다시 읽어내라.
그렇지 않은 카드도 이미지를 확인해 **분명한 오류**가 있으면 고치되, 맞으면 현재 값을 **그대로** 반환하라.

규칙을 엄격히 지킨다:
- 출력은 오직 파이프(|) 구분 라인. JSON / 코드펜스 / 머리말 / 꼬리말 금지.
- 각 라인 형식: \`id|name|price|quantity|date\`
- id 는 입력과 글자 단위로 정확히 같게 복사한다(재생성 금지).
- name 은 ${platformKor} 에서 검색 가능한 자연스러운 상품명. 브랜드+품목이 드러나게.
- **변경은 필요할 때만**: 현재 값이 이미지와 일치하면 그대로 두라. 애매하면 그대로 두라.
  오버라이드는 "확실히 틀린 경우(OCR 환각, 버튼 잔류, 가격 0 인데 이미지엔 숫자 보임, 날짜 비었는데 이미지엔 보임 등)" 에만.
- price 는 쉼표·원 기호 없는 정수(예: 11900). 정말 판독 불가면 0.
- quantity 는 정수, 찾을 수 없으면 1.
- **date** 는 ISO 형식 \`YYYY-MM-DD\`. 이미지의 "주문/결제" 라벨 옆 날짜를 읽는다.
  - ${platformKor} 에서 흔한 형식: \`2025.7.3. 19:04 주문\`, \`4. 7. 11:29 결제\`, \`1.26. 15:09 주문\`.
  - 단축 형식(연도 누락) 이면 현재 연도를 가정하되, 추출 월이 현재 월보다 크면 작년으로.
  - 정말 안 보이면 빈 문자열(\`\`).
  - 같은 결제(같은 카드 그룹)의 다른 카드와 다르면 그쪽을 따라가라(같은 결제 → 같은 날짜).
- 입력된 카드 수만큼 정확히 그만큼의 라인을 출력한다. 새 카드 추가·빠뜨리기 금지.
- 설명 문장 추가 금지. 첫 라인부터 데이터다.

rawText:
${input.rawText.slice(0, 8000)}

이 이미지의 상품 카드 전체:
${productsBlock}`;

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ text: prompt }];
  if (input.imageBase64) {
    parts.push({
      inlineData: {
        mimeType: input.imageMimeType || "image/png",
        data: input.imageBase64,
      },
    });
  }

  const result = await model.generateContent(parts as never);
  const text = (await result.response.text()).trim();

  const inputIds = new Set(input.allProducts.map((p) => p.id));
  const idToInput = new Map(input.allProducts.map((p) => [p.id, p]));
  const recovered = new Map<string, OcrProduct>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("```") || line.startsWith("#")) continue;
    const cols = line.split("|").map((c) => c.trim());
    if (cols.length < 3) continue;
    const [id, name, priceStr, qtyStr, dateStr] = cols;
    if (!inputIds.has(id)) continue;
    const price = parseInt(priceStr.replace(/[^0-9-]/g, ""), 10);
    if (!Number.isFinite(price)) continue;
    const orig = idToInput.get(id);
    if (!orig) continue;
    const quantity = qtyStr ? parseInt(qtyStr.replace(/[^0-9]/g, ""), 10) : undefined;
    // date — ISO YYYY-MM-DD. 빈 문자열이면 미상으로 간주. 형식 검증 후 통과한 것만 보존.
    const date = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : undefined;
    recovered.set(id, {
      id,
      name: name || orig.name || "",
      price: Math.max(0, price),
      ...(quantity && quantity > 0 ? { quantity } : {}),
      ...(date ? { date } : {}),
    } as OcrProduct & { date?: string });
  }

  if (recovered.size === 0) {
    return null;
  }

  const changedIds = new Set<string>();
  const products = input.allProducts.map((p) => {
    const r = recovered.get(p.id);
    if (!r) return p;
    const pDate = (p as OcrProduct & { date?: string }).date;
    const rDate = (r as OcrProduct & { date?: string }).date;
    const changed =
      (p.name ?? "").trim() !== r.name.trim() ||
      (p.price ?? 0) !== r.price ||
      (p.quantity ?? 1) !== (r.quantity ?? 1) ||
      (pDate ?? "") !== (rDate ?? "");
    if (changed) changedIds.add(p.id);
    return r;
  });

  return { products, changedIds: [...changedIds] };
}

export const geminiProxy = onCall(
  {
    region: "asia-northeast3",
    timeoutSeconds: 120,
    memory: "1GiB",
    invoker: "public",
    cors: true,
    secrets: [geminiApiKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인된 사용자만 AI 기능을 사용할 수 있습니다.");
    }

    const data = request.data as GeminiProxyRequest | undefined;
    if (!data || typeof data !== "object" || !("action" in data)) {
      throw new HttpsError("invalid-argument", "유효하지 않은 AI 요청입니다.");
    }

    switch (data.action) {
      case "generateInsight":
        return await runGenerateInsight(data.payload.rulesText);
      case "fallbackOcr":
        return await runFallbackOcr(data.payload.text);
      case "fallbackCsv":
        return await runFallbackCsv(data.payload.text);
      case "fallbackOcrProducts":
        return await runFallbackOcrProducts(data.payload);
      default:
        throw new HttpsError("invalid-argument", "지원하지 않는 AI action 입니다.");
    }
  },
);
