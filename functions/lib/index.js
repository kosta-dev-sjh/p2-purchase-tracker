"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.geminiProxy = void 0;
const generative_ai_1 = require("@google/generative-ai");
const app_1 = require("firebase-admin/app");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
(0, app_1.initializeApp)();
const geminiApiKey = (0, params_1.defineSecret)("GEMINI_API_KEY");
const FAST_GENERATION_CONFIG = {
    temperature: 0,
    topP: 0.1,
    topK: 1,
    responseMimeType: "text/plain",
    thinkingConfig: { thinkingBudget: 0 },
};
const PLATFORM_LABELS = {
    coupang: "쿠팡",
    naver: "네이버",
    temu: "테무",
};
function getGenAI() {
    const apiKey = geminiApiKey.value();
    if (!apiKey) {
        throw new https_1.HttpsError("failed-precondition", "GEMINI_API_KEY secret is not configured.");
    }
    return new generative_ai_1.GoogleGenerativeAI(apiKey);
}
function createModel() {
    return getGenAI().getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: FAST_GENERATION_CONFIG,
    });
}
function parsePipeLine(line) {
    const trimmed = line.trim();
    if (!trimmed)
        return null;
    if (trimmed.startsWith("```") || trimmed.startsWith("//") || trimmed.startsWith("#"))
        return null;
    const parts = trimmed.split("|").map((p) => p.trim());
    if (parts.length < 4)
        return null;
    const [date, merchant, amount, category] = parts;
    if (/[가-힣]/.test(date) && /[가-힣]/.test(amount))
        return null;
    if (date === "이용일" && merchant === "가맹점명")
        return null;
    if (!date || !merchant)
        return null;
    return {
        이용일: date,
        가맹점명: merchant,
        이용금액: amount,
        카테고리: category || "",
    };
}
function compressInputText(text, maxChars = 60_000) {
    const cleaned = text
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .map((line) => line.replace(/[\t ]+/g, " ").trim())
        .filter((line) => line.length > 0)
        .join("\n");
    if (cleaned.length <= maxChars)
        return cleaned;
    const head = Math.floor(maxChars * 0.3);
    const tail = maxChars - head;
    return cleaned.slice(0, head) + "\n...[생략]...\n" + cleaned.slice(cleaned.length - tail);
}
async function runGenerateInsight(rulesText) {
    const model = createModel();
    const prompt = `다음은 이번 달 사용자의 소비 패턴을 규칙 기반으로 요약한 데이터입니다:\n\n${rulesText}\n\n위 내용을 바탕으로 사용자에게 도움이 되는 1~2문장의 친근하고 짧은 소비 인사이트를 만들어주세요.`;
    const result = await model.generateContent(prompt);
    return { text: (await result.response.text()).trim() };
}
async function runFallbackOcr(text) {
    const model = createModel();
    const prompt = `다음 영수증 텍스트를 보고 거래 상태를 유추해줘. 무조건 'purchase', 'refund', 'cancel', 'sub' 중 하나만 대답해. 텍스트: ${text}`;
    const result = await model.generateContent(prompt);
    const answer = (await result.response.text()).trim().toLowerCase();
    return {
        status: ["purchase", "refund", "cancel", "sub"].includes(answer)
            ? answer
            : null,
    };
}
async function runFallbackCsv(text) {
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
    const rows = [];
    let buffer = "";
    for await (const chunk of stream.stream) {
        const piece = typeof chunk.text === "function" ? chunk.text() : "";
        if (!piece)
            continue;
        buffer += piece;
        let nlIdx = buffer.indexOf("\n");
        while (nlIdx !== -1) {
            const line = buffer.slice(0, nlIdx);
            buffer = buffer.slice(nlIdx + 1);
            const parsed = parsePipeLine(line);
            if (parsed)
                rows.push(parsed);
            nlIdx = buffer.indexOf("\n");
        }
    }
    const last = parsePipeLine(buffer);
    if (last)
        rows.push(last);
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
                        const record = obj;
                        rows.push({
                            이용일: String(record.이용일 ?? "").trim(),
                            가맹점명: String(record.가맹점명 ?? "").trim(),
                            이용금액: String(record.이용금액 ?? "").trim(),
                            카테고리: String(record.카테고리 ?? "").trim(),
                        });
                    }
                }
            }
        }
        catch {
            // ignore
        }
    }
    return { rows };
}
async function runFallbackOcrProducts(input) {
    if (input.allProducts.length === 0) {
        return { products: [], changedIds: [] };
    }
    const model = createModel();
    const badIdSet = new Set(input.badIds ?? []);
    const productsBlock = input.allProducts
        .map((p, i) => {
        const flag = badIdSet.has(p.id) ? " (의심)" : "";
        return `${i + 1}. id=${p.id}${flag} · 현재이름="${p.name ?? ""}" · 현재가격=${p.price ?? 0}`;
    })
        .join("\n");
    const platformKor = PLATFORM_LABELS[input.platform] ?? "쇼핑몰";
    const prompt = `너는 ${platformKor} 주문내역 캡쳐에서 상품 카드의 이름·가격을 이미지와 rawText 로 검증·보정하는 추출기다.
입력에는 (1) OCR 로 뽑힌 rawText, (2) 이 이미지의 전체 카드 목록(id · 현재 이름 · 현재 가격)이 들어온다.
"(의심)" 이 붙은 카드는 특히 주의해 이미지에서 다시 읽어내라.

규칙을 엄격히 지킨다:
- 출력은 오직 파이프(|) 구분 라인. JSON / 코드펜스 / 머리말 / 꼬리말 금지.
- 각 라인 형식: \`id|name|price|quantity\`
- id 는 입력과 정확히 같아야 한다.
- name 은 자연스러운 상품명으로 복원하되, 현재 값이 맞으면 그대로 둔다.
- price 는 쉼표·원 기호 없는 정수.
- quantity 는 정수, 찾을 수 없으면 1.
- 입력된 카드 수만큼만 출력한다.

rawText:
${input.rawText.slice(0, 8000)}

이 이미지의 상품 카드 전체:
${productsBlock}`;
    const parts = [{ text: prompt }];
    if (input.imageBase64) {
        parts.push({
            inlineData: {
                mimeType: input.imageMimeType || "image/png",
                data: input.imageBase64,
            },
        });
    }
    const result = await model.generateContent(parts);
    const text = (await result.response.text()).trim();
    const inputIds = new Set(input.allProducts.map((p) => p.id));
    const idToInput = new Map(input.allProducts.map((p) => [p.id, p]));
    const recovered = new Map();
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("```") || line.startsWith("#"))
            continue;
        const cols = line.split("|").map((c) => c.trim());
        if (cols.length < 3)
            continue;
        const [id, name, priceStr, qtyStr] = cols;
        if (!inputIds.has(id))
            continue;
        const price = parseInt(priceStr.replace(/[^0-9-]/g, ""), 10);
        if (!Number.isFinite(price))
            continue;
        const orig = idToInput.get(id);
        if (!orig)
            continue;
        const quantity = qtyStr ? parseInt(qtyStr.replace(/[^0-9]/g, ""), 10) : undefined;
        recovered.set(id, {
            id,
            name: name || orig.name || "",
            price: Math.max(0, price),
            ...(quantity && quantity > 0 ? { quantity } : {}),
        });
    }
    if (recovered.size === 0) {
        return null;
    }
    const changedIds = new Set();
    const products = input.allProducts.map((p) => {
        const r = recovered.get(p.id);
        if (!r)
            return p;
        const changed = (p.name ?? "").trim() !== r.name.trim() ||
            (p.price ?? 0) !== r.price ||
            (p.quantity ?? 1) !== (r.quantity ?? 1);
        if (changed)
            changedIds.add(p.id);
        return r;
    });
    return { products, changedIds: [...changedIds] };
}
exports.geminiProxy = (0, https_1.onCall)({
    region: "asia-northeast3",
    timeoutSeconds: 120,
    memory: "1GiB",
    secrets: [geminiApiKey],
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "로그인된 사용자만 AI 기능을 사용할 수 있습니다.");
    }
    const data = request.data;
    if (!data || typeof data !== "object" || !("action" in data)) {
        throw new https_1.HttpsError("invalid-argument", "유효하지 않은 AI 요청입니다.");
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
            throw new https_1.HttpsError("invalid-argument", "지원하지 않는 AI action 입니다.");
    }
});
//# sourceMappingURL=index.js.map