import { GoogleGenerativeAI } from "@google/generative-ai";
import { initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth, type UserRecord } from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type CollectionReference,
  type DocumentReference,
} from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { createHash } from "node:crypto";

initializeApp();

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const adminDb = getFirestore();
const RECENT_AUTH_MAX_AGE_SECONDS = 10 * 60;
const ACCOUNT_DELETION_GRACE_DAYS = 7;
const ACCOUNT_DELETION_GRACE_MS = ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;
// 닉네임 변경 쿨다운(서버 강제). 빈번한 변경(임퍼소네이션, 봇 어뷰즈) 방어가 목적이라
// 클라이언트 disable 만으로는 부족합니다. 모든 nickname 쓰기는 updateNickname callable
// 을 통해서만 통과시키고, Firestore users/{uid}.nicknameChangedAt 와 비교해 실패시킵니다.
const NICKNAME_COOLDOWN_HOURS = 24;
const NICKNAME_COOLDOWN_MS = NICKNAME_COOLDOWN_HOURS * 60 * 60 * 1000;
const NICKNAME_MIN_LENGTH = 1;
const NICKNAME_MAX_LENGTH = 20;

type Status = "purchase" | "refund" | "cancel" | "sub";
type Platform = "coupang" | "naver";

interface CsvRow {
  이용일: string;
  가맹점명: string;
  이용금액: string;
  카테고리: string;
  이용구분?: string;
  할부개월?: string;
  할부회차?: string;
  결제금액?: string;
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

/**
 * 카드 CSV/XLSX 임포트의 AI 폴백 입력. 카드사 헤더가 표준 양식(일시불할부구분/
 * 할부개월/할부회차) 과 달라 자동 매핑이 0건인 시트에 한해 발동합니다(클라이언트의
 * gate 가 결정). 비용·rate limit 영향을 통제하려고 시트당 1회만 호출되며, 한 호출에
 * 해당 시트의 모든 행을 같이 보냅니다.
 */
interface ClassifyCardRowSnippet {
  /** 클라이언트가 결과를 row 에 다시 매핑하기 위한 키. __sheetName/__rowIndex 조합 */
  id: string;
  date?: string;
  merchant?: string;
  amount?: string;
  /** 그 외 카드사가 보낸 컬럼들(요약). AI 가 단서로 활용 — "할부", "무이자할부", "분할" 등 */
  extras?: Record<string, string>;
}

interface ClassifyCardRowsInput {
  rows: ClassifyCardRowSnippet[];
}

type GeminiProxyRequest =
  | { action: "generateInsight"; payload: { rulesText: string } }
  | { action: "fallbackOcr"; payload: { text: string } }
  | { action: "fallbackCsv"; payload: { text: string } }
  | { action: "fallbackOcrProducts"; payload: FallbackOcrProductsInput }
  | { action: "classifyCardRows"; payload: ClassifyCardRowsInput };

interface DeleteAccountRequest {
  reauthProvider?: string;
  reason?: string;
}

interface DeleteAccountResponse {
  ok: true;
  logId: string;
  status: "scheduled";
  purgeAt: string;
  graceDays: number;
}

interface RestoreAccountResponse {
  status: "noop" | "restored" | "purged";
  logId?: string;
  purgeAt?: string | null;
  restoredAt?: string;
}

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

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "";
  const safeLocal =
    localPart.length <= 2 ? `${localPart[0] ?? "*"}*` : `${localPart.slice(0, 2)}***`;
  return `${safeLocal}@${domain}`;
}

function requireRecentAuth(authTime: unknown): number {
  const seconds = typeof authTime === "number" ? authTime : Number(authTime);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new HttpsError("failed-precondition", "최근 로그인 확인이 필요합니다.");
  }
  const age = Math.floor(Date.now() / 1000) - seconds;
  if (age > RECENT_AUTH_MAX_AGE_SECONDS) {
    throw new HttpsError("failed-precondition", "최근 로그인 확인이 필요합니다.");
  }
  return seconds;
}

async function countCollectionDocsDeep(collectionRef: CollectionReference): Promise<number> {
  const snap = await collectionRef.get();
  let total = snap.size;
  for (const docSnap of snap.docs) {
    const nestedCollections = await docSnap.ref.listCollections();
    for (const nestedCollection of nestedCollections) {
      total += await countCollectionDocsDeep(nestedCollection);
    }
  }
  return total;
}

async function deleteCollectionDeep(collectionRef: CollectionReference): Promise<void> {
  const snap = await collectionRef.get();
  for (const docSnap of snap.docs) {
    const nestedCollections = await docSnap.ref.listCollections();
    for (const nestedCollection of nestedCollections) {
      await deleteCollectionDeep(nestedCollection);
    }
    await docSnap.ref.delete();
  }
}

async function collectDeletionSummary(userRef: DocumentReference): Promise<{
  userDocExisted: boolean;
  topLevelCounts: Record<string, number>;
  totalDocsDeleted: number;
}> {
  const [userSnap, topLevelCollections] = await Promise.all([userRef.get(), userRef.listCollections()]);
  const topLevelCounts: Record<string, number> = {};
  let totalDocsDeleted = 0;
  for (const collectionRef of topLevelCollections) {
    const count = await countCollectionDocsDeep(collectionRef);
    topLevelCounts[collectionRef.id] = count;
    totalDocsDeleted += count;
  }
  return {
    userDocExisted: userSnap.exists,
    topLevelCounts,
    totalDocsDeleted,
  };
}

async function deleteUserDataTree(userRef: DocumentReference): Promise<void> {
  const topLevelCollections = await userRef.listCollections();
  for (const collectionRef of topLevelCollections) {
    await deleteCollectionDeep(collectionRef);
  }
  await userRef.delete();
}

function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function lifecycleLogCollection() {
  return adminDb.collection("accountLifecycleLogs");
}

async function loadUserRecordOrNull(uid: string): Promise<UserRecord | null> {
  try {
    return await getAdminAuth().getUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") {
      return null;
    }
    throw error;
  }
}

function buildIdentityPayload(uid: string, userRecord: UserRecord | null) {
  const normalizedEmail = (userRecord?.email ?? "").trim().toLowerCase();
  return {
    uid,
    providerIds: userRecord?.providerData.map((item) => item.providerId).filter(Boolean) ?? [],
    emailMasked: normalizedEmail ? maskEmail(normalizedEmail) : null,
    emailHash: normalizedEmail ? sha256Hex(normalizedEmail) : null,
  };
}

async function writeLifecycleLog(
  uid: string,
  userRecord: UserRecord | null,
  payload: Record<string, unknown>,
): Promise<DocumentReference> {
  const ref = lifecycleLogCollection().doc();
  await ref.set({
    ...buildIdentityPayload(uid, userRecord),
    ...payload,
  });
  return ref;
}

async function purgeUserAccount(
  uid: string,
  options: {
    userRecord: UserRecord | null;
    reason: string;
    purgeSource: "scheduler" | "restore-check";
    reauthProvider?: string | null;
    authTime?: string | null;
  },
): Promise<{ logId: string; dataSummary: Awaited<ReturnType<typeof collectDeletionSummary>> }> {
  const userRef = adminDb.collection("users").doc(uid);
  const summary = await collectDeletionSummary(userRef);
  await deleteUserDataTree(userRef);
  if (options.userRecord) {
    await getAdminAuth().deleteUser(uid);
  }
  const logRef = await writeLifecycleLog(uid, options.userRecord, {
    eventType: "deletion_purged",
    status: "completed",
    reason: options.reason,
    purgeSource: options.purgeSource,
    reauthProvider: options.reauthProvider ?? null,
    authTime: options.authTime ?? null,
    dataSummary: summary,
    purgedAt: FieldValue.serverTimestamp(),
  });
  return { logId: logRef.id, dataSummary: summary };
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

  const [
    date,
    merchant,
    amount,
    category,
    paymentMode,
    installmentMonths,
    installmentCycle,
    billedAmount,
  ] = parts;
  if (/[가-힣]/.test(date) && /[가-힣]/.test(amount)) return null;
  if (date === "이용일" && merchant === "가맹점명") return null;
  if (!date || !merchant) return null;

  return {
    이용일: date,
    가맹점명: merchant,
    이용금액: amount,
    카테고리: category || "",
    ...(paymentMode ? { 이용구분: paymentMode } : {}),
    ...(installmentMonths ? { 할부개월: installmentMonths } : {}),
    ...(installmentCycle ? { 할부회차: installmentCycle } : {}),
    ...(billedAmount ? { 결제금액: billedAmount } : {}),
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
- 각 라인 형식: \`이용일|가맹점명|이용금액|카테고리|이용구분|할부개월|할부회차|결제금액\`
- 이용일은 \`YYYY.MM.DD\` 형식(하이픈/슬래시 금지).
- 이용금액은 쉼표 없이 정수 숫자만(예: 4500). 환불/취소면 금액 앞에 '-'를 붙이지 말고 양수로 적되, 카테고리 뒤에는 쓰지 마라.
- 가맹점명 안에 '|' 문자가 있으면 공백으로 치환하라.
- '총 합계', '소계', '누계' 같은 요약 행은 절대 출력하지 마라.
- 가맹점명이 비거나 알 수 없으면 '알 수 없음'으로 적는다.
- 카테고리는 가능하면 한 단어(예: 카페, 식당, 교통, 쇼핑, 구독, 기타). 모르면 '기타'.
- 이용구분은 가능하면 \`일시불\`, \`할부\`, \`취소\`, \`환불\` 중 하나를 적고, 없으면 빈칸으로 둔다.
- 할부개월은 총 할부 개월 수만 숫자로 적는다(예: \`3\`). 없으면 빈칸.
- 할부회차는 월 청구형 데이터일 때만 \`현재/전체\` 형식으로 적는다(예: \`2/5\`). 없으면 빈칸.
- 결제금액은 월 청구형 파일에서 보이는 실제 이번 달 청구금액이 있으면 숫자로 적고, 없으면 빈칸.
- 승인형 상세 파일이면 이용금액에는 원 승인금액을 적고, 결제금액은 비워 둔다.
- 청구형/회차형 파일이면 이용금액에는 원 승인금액이 보일 때만 적고, 이번 달 청구액은 결제금액에 적는다.
- 같은 카드사의 요약 시트와 상세 시트가 함께 있을 수 있다. 상세 거래행만 뽑고 요약/집계 시트는 무시한다.
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
              이용구분: String(record.이용구분 ?? "").trim(),
              할부개월: String(record.할부개월 ?? "").trim(),
              할부회차: String(record.할부회차 ?? "").trim(),
              결제금액: String(record.결제금액 ?? "").trim(),
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

이름 정리 규칙:
- 한글 1글자 + 공백 으로 시작하는 OCR 잔류 prefix 는 제거 (예: "개 체크미..." → "체크미...", "을 띠테르..." → "띠테르...", "에 강블리..." → "강블리...", "를 독거미..." → "독거미...", "이 헬스프랜드..." → "헬스프랜드...", "까 비닐봉투..." → "비닐봉투...").
- UI 라벨이 이름에 섞이면 제거: "판매자정보/문의", "상세보기", "장바구니 담기", "바로 구매하기", "한달리뷰쓰기", "다시 담기", "한달사용리뷰", "정기구독", "추가상품", "내일배송", "오늘배송", "리뷰 작성".
- 한글 사이 영문 잔류는 의미 있는 모델명만 남기고 OCR 노이즈는 제거 (예: "리아나 카본히터 2 BH 전기히터" 의 "BH" 같이 의미 없는 약자가 끼면 빼거나 정확한 토큰으로 복원).
- 띄어쓰기가 과하게 붙어 있으면 한국 쇼핑몰 검색어처럼 자연스럽게 복원한다.

가격·수량:
- price 는 쉼표·원 기호 없는 정수(예: 11900). 정말 판독 불가면 0.
  - "원" 이 OCR 에서 "8" 또는 "0" 으로 깨질 수 있음 — 마지막 자리가 부자연스러우면 (예: "5,008" 같은 4자리 마지막 그룹) 원래 가격을 추정해 보정.
- quantity 는 정수, 찾을 수 없으면 1.

날짜 (가장 중요):
- ISO 형식 \`YYYY-MM-DD\`. 이미지의 "주문/결제" 라벨 옆 날짜를 읽는다.
- ${platformKor} 에서 흔한 형식 (그리고 OCR 깨짐 변형):
  · \`2025.7.3. 19:04 주문\` / \`2025.7.3 19:04 결제\` (full year)
  · \`4. 7. 11:29 결제\` / \`1.26. 15:09 주문\` (short)
  · \`4900원 210 1202긍제\` (압축 — \`긍제\`는 \`결제\` OCR 변형, \`210\`은 \`2.10\`, \`1202\`는 12:02)
  · \`13,9008 3 24 1526 글제\` (\`글제\`=\`결제\` 변형, \`3 24\`=3.24, \`1526\`=15:26)
  · \`17.000원 2 6 045 27\` (\`2 6\`=2.6, \`045 27\`=04:54:27 — 결제 키워드 자체 증발)
- 결제·주문 OCR 변형: \`결제\`→\`결재/즐제/글제/긍제/금지/결자\`, \`주문\`→\`주묘/수문/우문/주둔/주몬\`.
- 4자리 시각(HHMM) 앞 토큰이 날짜다. 예: \`47 1129\` 에서 \`47\` 이 4.7, \`1129\` 가 11:29.
- 단축 형식(연도 누락) 이면 현재 연도를 가정하되, 추출 월이 현재 월보다 크면 작년으로.
- 정말 안 보이면 빈 문자열(\`\`).
- **같은 결제 묶음**(같은 fold 그룹 / "추가상품" / "총 N건 주문 접기") 의 다른 카드와 날짜가 다르면 일관성을 맞춰라 — 같은 결제는 무조건 같은 날짜.
- "추가상품" 카드는 위에 있는 본 상품과 같은 결제이므로 같은 날짜.

기타:
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

/**
 * 카드 행 결제 방식 분류(시트당 1회 호출).
 *
 * 정책(2026-04-28):
 * - 클라이언트의 gate 가 일시불/할부 헤더 미매칭 시트에서만 호출.
 * - paymentMode 는 lump_sum / installment 둘 중 하나로 강제 (불확실하면 lump_sum).
 *   카드사 헤더가 빠진 케이스라도 사용자에게 "수상한 미분류" 가 남지 않게 폴백.
 * - installmentMonths 는 installment 행에만 정수로(>=2). 그 외엔 미설정.
 * - 5만원 미만 + 단서 없음 → lump_sum (한국 카드사 정책 — 할부 불가).
 * - 단서 종류: 행 본문에 "할부", "무이자할부", "분할", "회차", "N개월" 등.
 */
async function runClassifyCardRows(
  input: ClassifyCardRowsInput,
): Promise<{ rows: Array<{ id: string; paymentMode: "lump_sum" | "installment"; installmentMonths?: number }> }> {
  if (!Array.isArray(input.rows) || input.rows.length === 0) return { rows: [] };

  const model = createModel();
  const block = input.rows
    .map((r, i) => {
      const ext = r.extras
        ? Object.entries(r.extras)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")
        : "";
      return `${i + 1}. id=${r.id} | date=${r.date ?? ""} | merchant=${r.merchant ?? ""} | amount=${r.amount ?? ""}${
        ext ? " | " + ext : ""
      }`;
    })
    .join("\n");

  const prompt = `너는 한국 카드사 이용내역 행을 보고 결제 방식을 분류하는 추출기다.
헤더가 표준 양식과 달라 일시불/할부 컬럼이 자동 매핑되지 않은 파일이라, 행마다 단서로 추론한다.

규칙(엄격히 준수):
- 출력은 오직 파이프(|) 구분 라인. JSON / 코드펜스 / 머리말 / 꼬리말 금지.
- 각 라인 형식: \`id|paymentMode|installmentMonths\`
- id 는 입력과 글자 단위로 정확히 같게 복사한다.
- paymentMode 는 정확히 \`lump_sum\` 또는 \`installment\` 중 하나. 확신 없으면 \`lump_sum\`.
- installmentMonths 는 할부일 때만 총 개월 수 정수(>=2). 일시불이면 빈칸.
- "할부", "무이자할부", "분할", "리볼빙", "회차", "N개월" 같은 단서가 있으면 installment.
- amount(쉼표 제거 후) 가 50000 미만이고 단서 없으면 lump_sum (한국 카드사 정책 — 할부 불가).
- 단서가 전혀 없으면 lump_sum.
- 입력된 행 수만큼 정확히 그만큼의 라인을 출력한다(추가/누락 금지).
- 헤더 라인 출력 금지. 첫 라인부터 데이터.

행:
${block}`;

  const result = await model.generateContent(prompt);
  const text = (await result.response.text()).trim();
  const out: Array<{ id: string; paymentMode: "lump_sum" | "installment"; installmentMonths?: number }> = [];
  const inputIds = new Set(input.rows.map((r) => r.id));

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("```") || line.startsWith("#")) continue;
    const cols = line.split("|").map((c) => c.trim());
    if (cols.length < 2) continue;
    const [id, modeRaw, monthsStr] = cols;
    if (!inputIds.has(id)) continue;
    const paymentMode = modeRaw === "installment" ? "installment" : "lump_sum";
    let installmentMonths: number | undefined;
    if (paymentMode === "installment" && monthsStr) {
      const m = monthsStr.match(/\d+/);
      const n = m ? Number(m[0]) : NaN;
      if (Number.isFinite(n) && n >= 2) installmentMonths = n;
    }
    out.push({ id, paymentMode, ...(installmentMonths ? { installmentMonths } : {}) });
  }

  return { rows: out };
}

export const deleteAccount = onCall(
  {
    region: "asia-northeast3",
    timeoutSeconds: 120,
    memory: "1GiB",
    invoker: "public",
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인된 사용자만 계정을 삭제할 수 있습니다.");
    }

    const authTimeSeconds = requireRecentAuth(request.auth.token.auth_time);
    const uid = request.auth.uid;
    const userRef = adminDb.collection("users").doc(uid);
    const userRecord = await getAdminAuth().getUser(uid);
    const data = (request.data ?? {}) as DeleteAccountRequest;
    const reason =
      typeof data.reason === "string" && data.reason.trim() ? data.reason.trim() : "self-service";
    const reauthProvider =
      typeof data.reauthProvider === "string" && data.reauthProvider.trim()
        ? data.reauthProvider.trim()
        : null;
    const purgeAt = new Date(Date.now() + ACCOUNT_DELETION_GRACE_MS);

    try {
      await userRef.set(
        {
          accountStatus: "pending_deletion",
          deletionRequestedAt: FieldValue.serverTimestamp(),
          purgeAt: Timestamp.fromDate(purgeAt),
          restoredAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      const logRef = await writeLifecycleLog(uid, userRecord, {
        eventType: "deletion_requested",
        status: "scheduled",
        reason,
        reauthProvider,
        authTime: new Date(authTimeSeconds * 1000).toISOString(),
        requestedAt: FieldValue.serverTimestamp(),
        purgeAt: Timestamp.fromDate(purgeAt),
        graceDays: ACCOUNT_DELETION_GRACE_DAYS,
      });
      return {
        ok: true,
        logId: logRef.id,
        status: "scheduled",
        purgeAt: purgeAt.toISOString(),
        graceDays: ACCOUNT_DELETION_GRACE_DAYS,
      } satisfies DeleteAccountResponse;
    } catch (error) {
      await writeLifecycleLog(uid, userRecord, {
        eventType: "deletion_request_failed",
        status: "failed",
        reason,
        reauthProvider,
        authTime: new Date(authTimeSeconds * 1000).toISOString(),
        failedAt: FieldValue.serverTimestamp(),
        errorCode: error instanceof HttpsError ? error.code : error instanceof Error ? error.name : "unknown",
        errorMessage: error instanceof Error ? error.message : "unknown error",
      });
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "계정 삭제 예약 중 오류가 발생했습니다.");
    }
  },
);

export const restorePendingDeletion = onCall(
  {
    region: "asia-northeast3",
    timeoutSeconds: 120,
    memory: "1GiB",
    invoker: "public",
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인된 사용자만 계정 상태를 확인할 수 있습니다.");
    }

    const uid = request.auth.uid;
    const userRef = adminDb.collection("users").doc(uid);
    const [userSnap, userRecord] = await Promise.all([userRef.get(), loadUserRecordOrNull(uid)]);
    if (!userSnap.exists) {
      return { status: "noop" } satisfies RestoreAccountResponse;
    }

    const data = userSnap.data() ?? {};
    const accountStatus = typeof data.accountStatus === "string" ? data.accountStatus : "active";
    const purgeAt = toDateOrNull(data.purgeAt);
    if (accountStatus !== "pending_deletion" || !purgeAt) {
      return { status: "noop" } satisfies RestoreAccountResponse;
    }

    if (purgeAt.getTime() <= Date.now()) {
      const result = await purgeUserAccount(uid, {
        userRecord,
        reason: "deletion-window-expired",
        purgeSource: "restore-check",
      });
      return {
        status: "purged",
        logId: result.logId,
        purgeAt: purgeAt.toISOString(),
      } satisfies RestoreAccountResponse;
    }

    await userRef.set(
      {
        accountStatus: "active",
        deletionRequestedAt: FieldValue.delete(),
        purgeAt: FieldValue.delete(),
        restoredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    const restoredAt = new Date();
    const logRef = await writeLifecycleLog(uid, userRecord, {
      eventType: "deletion_restored",
      status: "completed",
      restoredAt: FieldValue.serverTimestamp(),
      purgeAt: Timestamp.fromDate(purgeAt),
      restoreSource: "login",
    });
    return {
      status: "restored",
      logId: logRef.id,
      purgeAt: purgeAt.toISOString(),
      restoredAt: restoredAt.toISOString(),
    } satisfies RestoreAccountResponse;
  },
);

/**
 * 닉네임 변경 callable.
 *
 * 정책(2026-04-28 합의):
 * - 클라이언트의 nickname 직접 쓰기를 막고, 모든 변경은 이 함수만 통과합니다.
 * - 같은 사용자가 24시간 안에 다시 변경할 수 없습니다(쿨다운).
 * - 트리밍 후 길이 1~20자만 허용하고, 그 외 입력은 invalid-argument 로 반려합니다.
 * - 동일 닉네임으로의 "변경"은 쿨다운을 갱신하지 않고 noop 으로 둡니다(공격용 더미
 *   업데이트로 쿨다운을 리셋시키는 우회를 방지).
 * - 트랜잭션 안에서 nicknameChangedAt 와 비교 + 갱신을 한 번에 수행해, 동시 호출에서도
 *   하나만 통과합니다.
 */
export const updateNickname = onCall<{ nickname?: unknown }>(
  {
    region: "asia-northeast3",
    timeoutSeconds: 30,
    memory: "256MiB",
    invoker: "public",
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인된 사용자만 닉네임을 변경할 수 있습니다.");
    }

    const raw = request.data?.nickname;
    if (typeof raw !== "string") {
      throw new HttpsError("invalid-argument", "닉네임 값이 올바르지 않습니다.");
    }
    const next = raw.trim();
    if (next.length < NICKNAME_MIN_LENGTH || next.length > NICKNAME_MAX_LENGTH) {
      throw new HttpsError(
        "invalid-argument",
        `닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자 사이여야 합니다.`,
      );
    }
    // 줄바꿈/제어문자 차단. 닉네임에 들어갈 이유가 없고, UI 에서 표시 깨짐의 원인이 됩니다.
    if (/[\x00-\x1f\x7f]/.test(next)) {
      throw new HttpsError("invalid-argument", "닉네임에 사용할 수 없는 문자가 포함돼 있어요.");
    }

    const uid = request.auth.uid;
    const userRef = adminDb.collection("users").doc(uid);
    const now = Date.now();

    // 트랜잭션으로 cooldown 검사 + 쓰기를 원자화해, 동시에 들어온 두 요청 중 하나만 성공.
    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) {
        // 정상 흐름이면 bootstrap 이 끝난 뒤이므로 doc 이 있어야 합니다.
        throw new HttpsError("failed-precondition", "사용자 프로필이 아직 준비되지 않았어요.");
      }
      const data = snap.data() ?? {};
      const currentNickname = typeof data.nickname === "string" ? data.nickname : "";
      const lastChangedAt = toDateOrNull(data.nicknameChangedAt);

      // 같은 값이면 cooldown 도 안 건드리고 그냥 끝냅니다(어뷰즈 방지 + 무의미한 쓰기 절약).
      if (currentNickname === next) {
        return {
          changed: false,
          nicknameChangedAt: lastChangedAt ? lastChangedAt.toISOString() : null,
        };
      }

      if (lastChangedAt) {
        const elapsed = now - lastChangedAt.getTime();
        if (elapsed < NICKNAME_COOLDOWN_MS) {
          const retryAfterMs = NICKNAME_COOLDOWN_MS - elapsed;
          throw new HttpsError(
            "resource-exhausted",
            `닉네임은 ${NICKNAME_COOLDOWN_HOURS}시간에 한 번만 변경할 수 있어요.`,
            {
              retryAfterMs,
              nextAvailableAt: new Date(lastChangedAt.getTime() + NICKNAME_COOLDOWN_MS).toISOString(),
            },
          );
        }
      }

      tx.set(
        userRef,
        {
          nickname: next,
          nicknameChangedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return {
        changed: true,
        // 클라이언트에 즉시 보여줄 ISO. serverTimestamp 는 응답에는 안 실리니 now 를 씁니다.
        nicknameChangedAt: new Date(now).toISOString(),
      };
    });

    return {
      ok: true,
      changed: result.changed,
      nickname: next,
      nicknameChangedAt: result.nicknameChangedAt,
      cooldownHours: NICKNAME_COOLDOWN_HOURS,
    };
  },
);

export const purgeExpiredDeletedAccounts = onSchedule(
  {
    region: "asia-northeast3",
    schedule: "every 60 minutes",
    timeZone: "Asia/Seoul",
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async () => {
    const snap = await adminDb.collection("users").where("purgeAt", "<=", new Date()).get();
    for (const userSnap of snap.docs) {
      const data = userSnap.data();
      if (data.accountStatus !== "pending_deletion") continue;
      const userRecord = await loadUserRecordOrNull(userSnap.id);
      await purgeUserAccount(userSnap.id, {
        userRecord,
        reason: "deletion-window-expired",
        purgeSource: "scheduler",
      });
    }
  },
);

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
      case "classifyCardRows":
        return await runClassifyCardRows(data.payload);
      default:
        throw new HttpsError("invalid-argument", "지원하지 않는 AI action 입니다.");
    }
  },
);
