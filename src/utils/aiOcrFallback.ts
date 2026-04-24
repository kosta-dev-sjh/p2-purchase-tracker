/**
 * 역할: Tesseract 파서가 복구 불가로 판정한 카드를 AI(LLM) 에게 넘겨 보정받는 모듈.
 *       파이프라인 상의 자리를 명확히 잡아 두고 — 실제 API 호출은 **스텁** 으로 둡니다.
 *       Anthropic Claude / OpenAI Vision 중 어느 쪽을 쓸지, 엔드포인트/키/비용 한도 정책은
 *       task #47 에서 확정되면 이 파일의 `callRealAi` 부분만 바꿔 끼우면 됩니다.
 *
 * 위치: src/utils/aiOcrFallback.ts
 *
 * 스텁 동작 (현재 구현):
 *   - 1.2 초 네트워크 지연을 시뮬레이션 (UX 상 loading 표시가 잠깐 뜨도록).
 *   - 입력받은 problem products 를 그대로 돌려주되 `aiApplied: true` 플래그를 찍어 반환.
 *   - provider 필드로 'stub' 을 표시. 실 엔드포인트 연결 후엔 'claude' / 'openai' 로 바뀜.
 *
 * 호출 규약:
 *   - 입력은 전체 이미지가 아닌 **문제 카드만** 넘기는 편이 토큰/비용을 아낄 수 있으나, 맥락
 *     보존을 위해 rawText 전체도 같이 전달합니다. 실 구현에서 system prompt 가 이 rawText 를
 *     읽고 문제 카드의 이름/가격을 재추출하도록 유도.
 *   - 반환은 입력 products 와 **같은 순서/같은 id** 를 보장. 일부만 복구됐다면 나머지는
 *     aiApplied: true 만 찍고 내용은 그대로.
 */

import type { OcrProduct } from "../pages/OcrEdit/data";
import { fallbackOcrProducts } from "./aiService";

export interface AiOcrFallbackRequest {
  /** 이미지 식별자 (디버깅/로깅 용, API 에는 전송 안 해도 됨). */
  imageId: string;
  /** 플랫폼 힌트 — system prompt 에 "쿠팡/네이버/테무 캡쳐" 라고 알려주는 용도. */
  platform: "coupang" | "naver" | "temu";
  /** 전체 rawText — 문제 카드의 맥락 보존용. */
  rawText: string;
  /**
   * 이 이미지의 **전체 카드 목록**. 이미지 input 비용은 이미 지불되므로, 한 번 호출 시 모든
   * 카드를 AI 에게 검증받는 게 비용 효율적(출력 토큰은 카드당 ~30토큰 × $0.3/M 수준).
   */
  allProducts: OcrProduct[];
  /**
   * 파서가 bad 로 분류한 카드 id 집합. AI 에게 "이 카드들은 특히 의심스러우니 주의" 힌트로 전달.
   */
  badIds: string[];
  /** 선택: 원본 이미지 File — Vision 모델에 직접 이미지 입력 시 사용 (Gemini 멀티모달). */
  imageFile?: File;
}

export interface AiOcrFallbackResult {
  /** 입력 problemProducts 와 같은 순서. aiApplied=true 로 마킹됩니다. */
  products: OcrProduct[];
  provider: "stub" | "gemini" | "claude" | "openai";
  /** AI 가 자체적으로 남긴 코멘트 (예: "이미지 해상도가 낮아 일부만 복구"). 디버깅용. */
  notes?: string;
  /** 호출이 완전히 실패했을 때 (네트워크 / 키 없음 / 타임아웃). caller 는 원본 상태로 진행. */
  failed?: boolean;
}

/**
 * 실제 LLM 호출 — Gemini 2.5 Flash Vision 을 사용해 문제 카드만 재추출합니다.
 * aiService.fallbackOcrProducts 에서 실제 API 호출과 프롬프트·파싱을 담당하고, 이 함수는
 * 그 결과를 AiOcrFallbackResult 포맷으로 래핑하며 aiApplied 플래그를 찍습니다.
 *
 * 반환:
 *   - 정상 복구 → `{ provider: "gemini", products: [...with aiApplied] }`
 *   - 키 없음 / 파싱 실패 / 예외 → null (caller 는 스텁 경로로 빠짐)
 */
async function callRealAi(
  request: AiOcrFallbackRequest,
): Promise<AiOcrFallbackResult | null> {
  const recovered = await fallbackOcrProducts({
    platform: request.platform,
    rawText: request.rawText,
    allProducts: request.allProducts.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      quantity: p.quantity,
    })),
    badIds: request.badIds,
    imageFile: request.imageFile,
  });
  if (!recovered) return null;
  // aiApplied 플래그는 **실제로 값이 변경된 카드에만** 찍습니다. AI 가 clean 카드를 그대로
  // 돌려줬다면 사용자 화면에 ✨ 배지가 뜨지 않도록 해 UI 소음을 최소화.
  return {
    provider: "gemini",
    products: recovered.products.map((p) => ({
      ...p,
      ...(recovered.changedIds.has(p.id) ? { aiApplied: true } : {}),
    })),
  };
}

/**
 * 메인 엔트리. caller 는 이 함수 하나만 쓰면 됨.
 *
 * 동작 순서:
 *   1. callRealAi 시도 — 실 API 가 연결돼 있으면 그 결과 반환.
 *   2. null 이면 스텁 경로: 1.2s 지연 후 입력을 그대로 돌려줌 (aiApplied 안 찍음 — 실제 변경
 *      없음을 정직하게 표시).
 *
 * UX 원칙:
 *   - 절대 throw 하지 않음. 실패해도 caller 의 파이프라인이 중단되지 않게 failed:true 로 반환.
 *   - 스텁도 지연을 시뮬레이션해 로딩 UI 가 정상 작동하는지 확인 가능.
 */
export async function runAiOcrFallback(
  request: AiOcrFallbackRequest,
): Promise<AiOcrFallbackResult> {
  try {
    const real = await callRealAi(request);
    if (real) return real;
  } catch (e) {
    // real API 에서 예외가 났어도 UX 를 끊지 않고 스텁으로 빠진다.
    console.warn("[aiOcrFallback] callRealAi failed, falling back to stub:", e);
  }

  // 스텁 경로: 1.2s 지연만 시뮬레이션하고 카드는 **변경 없이** 그대로 반환. 내용이 바뀌지
  // 않았으므로 aiApplied 플래그도 안 찍어, UI 에서 ✨ 배지가 거짓말하지 않게 합니다.
  await new Promise<void>((resolve) => setTimeout(resolve, 1200));
  return {
    provider: "stub",
    products: request.allProducts.map((p) => ({ ...p })),
    notes: "stub: 실 AI 엔드포인트 미연결 — 변경 사항 없음.",
  };
}
