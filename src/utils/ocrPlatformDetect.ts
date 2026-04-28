/**
 * 역할: OCR rawText 의 platform-specific literal 시그널을 카운트해 네이버/쿠팡 자동 감지.
 *
 * 사용 흐름 (`OcrUpload`):
 *   1. 사용자가 PlatformSelect 에서 "쿠팡" 선택 + 이미지 업로드
 *   2. 분석 시작 → Tesseract rawText 추출
 *   3. detectPlatformFromRawText 로 추정 platform 계산
 *   4. 사용자 선택과 mismatch + 추정 confidence 가 충분히 높으면 confirm 모달
 *      → "이 이미지는 네이버 같아 보입니다. 정말 쿠팡으로 분석할까요?"
 *
 * 정책 (CLAUDE.md §9.1, docs/Naver_OCR_Pattern_Catalog §11):
 *   - **literal UI 라벨/배지** 시그널만 사용 — wordlist 하드코딩(상품명 변형) 아님
 *   - 양 platform 모두 정직하게 시그널 카운트, 우세도 계산
 *   - 약한 우세는 모달 안 띄움 (false alarm 방지)
 *   - rawText 가 짧거나 시그널이 너무 적으면 "확인 불가" 반환
 *
 * 위치: src/utils/ocrPlatformDetect.ts
 */

import type { Platform } from "../pages/OcrUpload/components/PlatformSelect";

export interface PlatformDetectionResult {
  /** 추정 platform — confidence 가 낮으면 null */
  detected: Platform | null;
  /** 0 ~ 1. 1 에 가까울수록 확신. < 0.55 면 detected = null. */
  confidence: number;
  /** 디버깅용: 양쪽 시그널 매치 카운트와 매칭된 키워드들 */
  scores: {
    coupang: number;
    naver: number;
    coupangHits: string[];
    naverHits: string[];
  };
}

/**
 * 쿠팡 캡쳐의 전용 literal 시그널.
 * - 🚀 / 로켓배송 / 로켓프레시 — 쿠팡 전용 배지
 * - 판매자 문의 / 교환, 반품 신청 / 리뷰 작성하기 / 주문 상세보기 — 데스크톱 카드 액션 버튼
 * - 상품준비중 — 쿠팡 전용 status (네이버는 "결제완료" 사용)
 * - "도착" — 배송 라벨 (쿠팡: "4/23(목) 도착")
 *
 * 네이버 캡쳐에 우연히 들어갈 일이 거의 없는 단어들로 골랐습니다.
 */
const COUPANG_SIGNALS: Array<{ pattern: RegExp; label: string; weight: number }> = [
  { pattern: /🚀/, label: "🚀", weight: 3 },
  { pattern: /로켓\s*배송/, label: "로켓배송", weight: 3 },
  { pattern: /로켓\s*프레시/, label: "로켓프레시", weight: 3 },
  { pattern: /판매자\s*로켓/, label: "판매자로켓", weight: 3 },
  { pattern: /판매자\s*문의/, label: "판매자 문의", weight: 2 },
  { pattern: /교환[,\s]*반품\s*신청/, label: "교환,반품 신청", weight: 2 },
  { pattern: /리뷰\s*작성하기/, label: "리뷰 작성하기", weight: 2 },
  { pattern: /주문\s*상세보기/, label: "주문 상세보기", weight: 1 },
  { pattern: /상품\s*준비\s*중/, label: "상품준비중", weight: 2 },
  { pattern: /\d+\/\d+\([월화수목금토일]\)\s*도착/, label: "M/D(요일) 도착", weight: 2 },
  { pattern: /바로\s*구매/, label: "바로구매", weight: 1 }, // 양쪽에서 나오지만 쿠팡이 더 자주
];

/**
 * 네이버쇼핑 캡쳐의 전용 literal 시그널.
 * - Npay / npay / N pay — 네이버 전용 결제 배지
 * - 적립 완료 — 네이버 전용 (쿠팡은 다른 표현)
 * - 한달(사용)리뷰 / 한달리뷰쓰기 — 네이버 전용 보상 문구
 * - 판매자정보/문의 — 네이버 데스크톱 슬래시 형태 (쿠팡은 "판매자 문의")
 * - 상세보기 (단독, ">" 포함) — 네이버 카드 링크
 * - 정기구독 N회차 / 정기구독 재신청 — 네이버 정기결제 전용
 * - 영수증조회 — 네이버 전용 액션
 * - 관심 있을만한 상품 — 네이버 모바일 광고 섹션
 */
const NAVER_SIGNALS: Array<{ pattern: RegExp; label: string; weight: number }> = [
  { pattern: /[Nn]\s*pay\s*\+?/i, label: "Npay+", weight: 3 },
  { pattern: /[\d,]+\s*원\s*적립\s*완료/, label: "N원 적립 완료", weight: 3 },
  { pattern: /한달\s*(?:사용)?\s*리뷰/, label: "한달(사용)리뷰", weight: 2 },
  { pattern: /한달\s*리뷰\s*쓰기/, label: "한달리뷰쓰기", weight: 2 },
  { pattern: /판매자\s*정보\s*\/\s*문의/, label: "판매자정보/문의", weight: 2 },
  { pattern: /상세\s*보기\s*>/, label: "상세보기 >", weight: 2 },
  { pattern: /구매확정\s*완료/, label: "구매확정완료", weight: 2 },
  { pattern: /결제\s*완료/, label: "결제완료", weight: 1 }, // 네이버에서만 status 로 등장 (쿠팡엔 없음)
  { pattern: /결제\s*취소/, label: "결제취소", weight: 2 },
  { pattern: /정기\s*구독\s*\d+\s*회차/, label: "정기구독 N회차", weight: 3 },
  { pattern: /정기\s*구독\s*재신청/, label: "정기구독 재신청", weight: 3 },
  { pattern: /영수증\s*조회/, label: "영수증조회", weight: 3 },
  { pattern: /관심\s*있(?:을|는)\s*만?한\s*상품/, label: "관심 있을만한 상품", weight: 3 },
  { pattern: /총\s*\d+\s*건\s*(?:주문\s*)?(?:펼쳐보기|주문\s*접기)/, label: "총 N건 펼쳐/접기", weight: 3 },
  { pattern: /추가\s*상품/, label: "추가상품 배지", weight: 2 },
  { pattern: /다시\s*담기/, label: "다시 담기", weight: 1 }, // 양쪽 가능하지만 네이버에서 더 빈번
];

/**
 * rawText 에서 platform 시그널을 카운트하고 추정 platform 을 반환합니다.
 *
 * 알고리즘:
 *   1. 양쪽 시그널 패턴을 라인별이 아닌 전체 텍스트에 대해 매칭, weight 합산
 *   2. 각 시그널은 1회 매칭만 카운트 (중복 카운트 방지)
 *   3. 우세 점수와 우세 비율로 confidence 계산
 *   4. confidence < 0.55 면 detected = null (애매한 경우 사용자 선택 유지)
 *
 * 임계 0.55 의 의미: 우세 platform 점수 / 전체 점수 ≥ 0.55. 즉 한 쪽이 다른 쪽의 1.22배 이상.
 */
export function detectPlatformFromRawText(rawText: string): PlatformDetectionResult {
  if (!rawText || rawText.length < 20) {
    return {
      detected: null,
      confidence: 0,
      scores: { coupang: 0, naver: 0, coupangHits: [], naverHits: [] },
    };
  }

  // Tesseract 가 한글 글자 사이마다 공백을 끼우는 모드("주 문 상 세 보 기")가 있어, 매칭 전
  // 모든 공백을 일단 제거한 합성 텍스트도 함께 검사. 양쪽 모두에서 매칭되면 한 번만 카운트.
  const collapsed = rawText.replace(/\s+/g, "");

  let coupangScore = 0;
  let naverScore = 0;
  const coupangHits: string[] = [];
  const naverHits: string[] = [];

  const stripWs = (re: RegExp): RegExp => {
    // 패턴 source 의 \s* / \s+ 를 비활성화하고 literal 한글/영문/숫자만 남긴 대안.
    // 공백 압축 텍스트(collapsed) 에 매칭하기 위함.
    const src = re.source.replace(/\\s\*/g, "").replace(/\\s\+/g, "");
    return new RegExp(src, re.flags);
  };

  for (const sig of COUPANG_SIGNALS) {
    if (sig.pattern.test(rawText) || stripWs(sig.pattern).test(collapsed)) {
      coupangScore += sig.weight;
      coupangHits.push(sig.label);
    }
  }
  for (const sig of NAVER_SIGNALS) {
    if (sig.pattern.test(rawText) || stripWs(sig.pattern).test(collapsed)) {
      naverScore += sig.weight;
      naverHits.push(sig.label);
    }
  }

  const total = coupangScore + naverScore;
  if (total < 3) {
    // 시그널이 너무 적음 — 텍스트 자체가 OCR 으로 거의 깨졌거나 다른 platform 캡쳐
    return {
      detected: null,
      confidence: 0,
      scores: { coupang: coupangScore, naver: naverScore, coupangHits, naverHits },
    };
  }

  const dominantScore = Math.max(coupangScore, naverScore);
  const confidence = dominantScore / total;
  const detected: Platform | null =
    confidence < 0.55
      ? null
      : coupangScore > naverScore
        ? "coupang"
        : "naver";

  return {
    detected,
    confidence,
    scores: { coupang: coupangScore, naver: naverScore, coupangHits, naverHits },
  };
}
