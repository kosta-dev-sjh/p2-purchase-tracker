/**
 * 역할: 각 쇼핑몰 플랫폼의 OCR 텍스트를 구조화된 주문 데이터로 변환하는 파서 모음입니다.
 * 위치: src/utils/ocrParsers.ts
 *
 * ─── 플랫폼별 투자 수준 정책 (2026-04-24 · Claude ↔ Codex 교차 검토 합의) ────────────
 *
 *   쿠팡 (parseCoupangOrderText)
 *     - 현재 샘플 23장 ground-truth harness(`.ocr-raw-cache/ground-truth.json`)
 *       기준 23/23 PASS 상태로 **회귀 대응 모드** 로 동결합니다.
 *     - "정확도 추가 상승" 을 노린 새 regex/후처리 튜닝은 금지. 회귀가 생기면 고치고,
 *       새 OCR 변형 패턴이 한 번 관찰되는 수준에서는 AI 보정(aiService) 에 위임합니다.
 *
 *   네이버쇼핑 (parseNaverOrderText)
 *     - **얕은 1차 파서** 로 유지. 편집 가능한 구조화 초안만 책임집니다:
 *         · 주문 단위 분리
 *         · 날짜/상태/상품명/가격의 대략적 추출
 *         · 명백한 쓰레기 문자열 제거
 *     - 세밀한 이름 복원, 분리배송, OCR 환각 복구 같은 예외 처리는 작성하지 않고
 *       `aiService.fallbackOcrProducts` 의 Vision 보정에 위임합니다.
 *     - 쿠팡 파서의 규칙을 복제하지 마세요. 투자 깊이는 쿠팡의 1/5 수준이면 충분.
 *
 *   신규 플랫폼 추가 시
 *     - 먼저 `docs/OCR_Architecture_Decision.md` §"의사결정 트리" 항목을 읽고 오세요.
 *     - 얕은 1차 파서 + `ocrQuality` bad 판정 → AI 보정 패턴이 기본 템플릿입니다.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 */

export interface PurchaseOCRResult {
  mall: string | null;
  itemName: string | null;
  price: number | null;
  date: string | null;
  rawText: string;
  /**
   * 상태 감지용 텍스트 조각. 이 주문과 관련된 상태 키워드(취소완료, 배송완료, 환불완료 등)가
   * 포함된 텍스트로, detectStatusFromOcrText가 정확한 상태를 추출할 수 있게 합니다.
   * 전체 이미지 rawText가 아닌 주문별 텍스트 조각을 담아야 합니다.
   */
  statusText?: string;
  /**
   * 상품 수량. "6,900 원 · 1개", "47,650 원 · 2개"처럼 가격 뒤에 찍히는 숫자를 잡습니다.
   * 파서가 못 찾았으면 undefined — caller가 기본값 1을 쓰도록 내버려 둡니다.
   */
  quantity?: number;
  /**
   * Tesseract 가 가격 라인을 아예 못 읽어서 soft-commit 된 카드 표시. `price` 필드가 0 이면
   * 두 가지 의미가 가능한데 (사은품·쿠폰으로 실제 0원 / OCR 이 `11,900 원` 을 `oo 장바구니 담기`
   * 같은 쓰레기로 읽어 가격 라인이 증발), 전자는 사용자가 그대로 저장하면 되고 후자는 AI
   * 보정 대상입니다. 이 플래그가 true 면 후자. priceLineRegex 매칭이 한 번도 안 일어났을 때만
   * 파서가 true 로 찍습니다.
   */
  priceOcrFailed?: boolean;
  /**
   * 네이버 "접힌 주문" 신호. 화면에 `포함 총 n건` 또는 `주문 펼쳐보기` 가 보일 때 파서가 true 로
   * 찍습니다. true 인 결과는 caller(buildFlatOrders) 가 OcrOrder.folded 메타와 sectionTotal 로
   * 변환하고, 대표 상품 가격에 sectionTotal 을 강제 주입하지 않습니다. 자세한 정책은
   * docs/Naver_OCR_Parsing_Strategy.md §6, §12-5 참고.
   *
   * 이번 1차 구현은 image 단위로 fold 여부만 일괄 감지하는 얕은 버전입니다. section-first 파서
   * 정밀화는 Codex 후속 작업(strategy doc §15)으로 남겨두고, 이 단계에서는 UI/스토어/타입 흐름만
   * 끊기지 않게 메타를 끌어옵니다.
   */
  folded?: boolean;
  /** "포함 총 n건" 에서 추출한 실제 상품 개수 힌트. folded 일 때만 의미 있습니다. */
  itemCountHint?: number;
  /**
   * 결제 섹션 합계("총 n원"). folded 일 때 totalAmount 계산 기준으로 사용됩니다.
   * folded 가 아니어도 OCR 이 읽었으면 정합성 점검용 메타로 그대로 보존합니다.
   */
  sectionTotal?: number;
  /**
   * "총 N건 주문 접기" 펼쳐진 fold 그룹의 멤버임을 표시. 같은 캡쳐 안의 모든 결과 카드가
   * 같은 결제(주문번호 1개) 로 묶여야 함을 의미. caller(buildFlatOrders) 가 이 플래그가
   * 한 번이라도 true 인 캡쳐는 모든 결과를 1개 OcrOrder 의 products[] 로 합칩니다.
   *
   * `folded` 와의 차이:
   *   - folded=true: 접힌 상태 (대표 상품만 보이고 sectionTotal 만 노출). products[] 1개.
   *   - expandedFoldGroup=true: 펼친 상태 (모든 카드 visible). products[] N개로 합쳐야.
   */
  expandedFoldGroup?: boolean;
  /**
   * 펼쳐진 fold 그룹의 마지막 카드에만 채우는 힌트.
   * 예: 마지막 카드 섹션 하단에 `총 3건 주문 접기` 가 보이면 3.
   * caller(buildFlatOrders)는 이 값을 보고 "직전 N개 카드 + 현재 카드"를 한 주문으로 합칩니다.
   */
  expandedFoldTailCount?: number;
  /**
   * 네이버 `추가상품` 카드처럼 "날짜가 없고, 바로 위 메인 상품의 결제에 붙어야 하는" 후보.
   * 현재 1차 파서는 화면의 배지를 항상 읽어내지 못하므로, 날짜 부재 + 배송조회-only 섹션 등
   * 구조 신호로 추정해 caller 가 이전 주문에 붙일 수 있게 힌트만 남깁니다.
   */
  addonCandidate?: boolean;
}

/**
 * 쿠팡 주문내역(데스크톱 주문상세 / 모바일 주문목록)을 파싱합니다.
 *
 * 관찰된 캡쳐 구조:
 *   [헤더]   "YYYY. M. DD 주문 [· 주문번호 ...]"
 *   [상품 블록 반복]
 *     상태 라인        "배송완료 · 4/17(금) 도착" / "상품준비중 · 4/25(토) 도착 예정"
 *     상품명 (1~2줄)  "🚀판매자로켓 새벽 코지엔비 곱창머리끈 5종, 1세트"
 *                     → 모바일은 종종 줄바꿈: "...캐리어 18 / 인치, 블랙..."
 *     가격 라인        "6,900 원 · 1개"
 *   [경계 섹션]  "받는사람 정보" / "결제 정보" / "결제영수증 정보" / "배송상품 주문상태 안내"
 *                → 여기부터 아래는 총 상품가격/할인금액/총 결제금액 등 집계라서 **상품으로 오인식하면 안 됨**
 *
 * 설계 요점:
 *   1) 블록 구조 기반 상태머신(name 누적 → price 만나면 emit).
 *   2) 섹션 경계("결제 정보" 등)를 만나면 즉시 중단.
 *   3) 상태 라인은 `currentStatus`에 저장만 하고 name으로 쓰지 않음.
 *   4) 쿠팡 태그(🚀, 판매자로켓, 로켓, 로켓직구, 로켓프레시, 새벽, 내일, 오늘)는 상품명 선두에서 제거.
 *   5) 가격 라인 정규식으로 `N개` 수량도 함께 추출 → PurchaseOCRResult.quantity로 노출.
 */
export function parseCoupangOrderText(rawText: string): PurchaseOCRResult[] {
  // ───────── 사전 정의 ─────────
  const mall = rawText.includes('쿠팡') || rawText.toLowerCase().includes('coupang') ? '쿠팡' : '쿠팡(추정)';

  // ── Vocabulary (2026-04-24 재정규화) ──────────────────────────────────
  //
  // 쿠팡 캡쳐에서 반복해 마주치는 어휘(배지/버튼/노이즈/날짜)를 **카테고리별 상수 목록**
  // 으로 관리합니다. 이전에는 동일한 배지/버튼 어휘가 `leadingTagRegex` 내부 alternation,
  // `stripLeadingGarbagePrefix` 의 BADGE_WORDS, `noiseLineRegex`/`trailingButtonRegex` 세
  // 곳에 각자 문자열 리스트로 박혀 있어 새 캡쳐에서 배지/버튼이 발견될 때마다 세 곳을
  // 수동 동기화해야 했습니다. 실제로 모바일 앱 버튼("배송 · 주문 관리", "바로구매") 을
  // 추가할 때 꼬리 정리(trailingButtonRegex) 만 반영되고 단독 라인(noiseLineRegex) 은
  // 빠지는 식으로 엇박이 생긴 적이 있습니다.
  //
  // 이번 재정규화는 어휘 목록 자체를 "한 번만" 정의하고, 각 regex 는 그 목록의 `.source`
  // 를 `.join('|')` 해서 조립하도록 바꿨습니다. 유지 보수는 해당 배열 하나만 수정하면
  // 되고, **생성된 regex 문자열 자체는 리팩터 전과 완전 동치** 입니다 (기존 alternation
  // 순서와 내용을 모두 보존).

  // 배지 — 상품명 앞에 붙는 쿠팡 공식 라벨. 카테고리별로 4+1 그룹으로 분해.
  const COUPANG_ROCKET_BADGES = [
    /판매자\s*로켓/,
    // 판매자 의 "판" 이 OCR 에서 편/란/환/만/잣 으로 변형되고 "로켓" 도 로컷/로킷/로겟/로케
    // 까지 번지는 조합을 한 번에 소화. 실제 캡쳐 예:
    //   "란매자로켓 [4 및와니즈김나영..." → 란매자로켓 선두 컷
    //   "환매자로켓 ( 내일 ) 녹스게이밍..." → 환매자로켓 선두 컷
    /(?:편|란|환|만|잣|자)매?자?\s*로[켓컷킷겟케]/,
    // "판매" 전체가 뭉개져 "계" 한 글자(또는 "곳계" 두 글자) 로만 남는 변형:
    //   "6 계로켓 14 일 | 코코도르...", "곳계로켓 1 일 . 닥터포헤어..."
    // `(?:곳\s*)?` 로 앞 "곳" 유무를 허용. "계로켓" 은 한국어 일반 단어로 존재하지 않아 `^`
    // 앵커(leadingTagRegex) 와 합쳐 보호되는 편.
    /(?:곳\s*)?계\s*로[켓컷킷겟케]/,
    /로켓\s*(?:그로스|직구|프레시|프레쉬|배송|설치|와우|\+\s*2|플러스)/,
  ];
  const COUPANG_TIMING_BADGES = [
    /내일\s*(?:도착|배송)/,
    /오늘\s*(?:도착|배송)/,
    /새벽\s*(?:도착|배송)/,
    /당일\s*(?:도착|배송)/,
  ];
  const COUPANG_MEMBERSHIP_BADGES = [
    /무료\s*배송/,
    /해외\s*직구/,
    /와우\s*(?:멤버십|할인가|할인)/,
  ];
  const COUPANG_PROMO_BADGES = [
    /쿠팡\s*(?:추천|카드|캐시)/,
    /쿠폰\s*할인/,
    /쿠팡\s*캐시\s*적립/,
    /\d{1,2}\s*%\s*(?:추가)?\s*적립/,
  ];
  // bare badge — 위 compound 에 포함되지 않는 **단독 단어** 배지. leadingTagRegex 조립 시
  // 뒤에 공백/EOL lookahead `(?=\s|$)` 가 붙어 "당일발송" 같은 다음 단어와 말려들지 않도록
  // 합니다(2026-04-23 회귀 수정). `/i` 플래그가 leadingTagRegex 에 걸려 있으므로
  // BEST/NEW/HOT/SALE 은 소문자 변형도 흡수됩니다.
  //
  // 로[켓컷킷겟케] : Tesseract 가 "로켓" 의 받침 ㅅ 을 자주 흘려 "로컷/로킷/로겟/로케" 로
  //   뱉는 실제-이미지 변형. 어휘가 "로" + 한 글자 조합이라 일반 한글 단어에 걸릴 위험은
  //   낮고, 뒤에 `(?=\s|$)` lookahead 가 붙어 "로컷XX" 같은 합성어는 안 먹습니다.
  // 편매자 : 판매자 의 "판" 윗 획이 흐리게 찍혀 "편" 으로 읽히는 케이스. 한국어 일반
  //   단어로는 거의 쓰이지 않아 안전.
  const COUPANG_BARE_BADGES = /로[켓컷킷겟케]|판매자|편매자|란매자|환매자|만매자|잣매자|새벽|내일|대일|오늘|당일|도착|배송|와우|광고|쿠폰|추천|적립|할인|BEST|NEW|HOT|SALE/;

  // 🚀 OCR 가비지 / 선두 장식. 배지와 달리 의미가 아니라 "모양" 으로 잡는 패턴들.
  //   - 기호 뭉치 / 짧은 영문 + 화살표 / 한글 자모 / 짧은 한글+파이프 / "+ N%" 프로모.
  //   - 세 번째 알테르나티브(lookahead)의 배지 앵커 토큰은 의도적으로 짧은 집합입니다:
  //     "짧은 영문 뒤에 로켓/내일/새벽 같은 핵심 배지가 오는" 특수 구조를 소비하는 용도라
  //     COUPANG_BARE_BADGES 전체가 아니라 배지 시작 앵커가 될 만한 9개만 필요합니다.
  //
  // 마지막 알테르나티브(배지 2+ 연쇄)는 applyOcrCorrections 의 rejoinSplitKoreanWords 가
  // 한글 글자 사이 공백을 제거한 뒤 "판매자 로켓 내일" 같은 원래 공백 분리 배지가 "판매자
  // 로켓내일" 로 뭉치면서 bare badge lookahead `(?=\s|$)` 가 못 잡게 된 케이스를 복구합니다.
  //   - {2,4} 로 2 개 이상 연쇄만 매치 → "배송" 하나만 있는 정상 텍스트("배송용 박스") 는 안 건드립니다.
  //   - 단어 경계/컨텍스트가 없어도 배지 연쇄 자체가 쿠팡 선두 가비지의 충분한 신호.
  //   - 예: "로켓내일마이싹" → "마이싹", "판매자로켓새벽코지엔비" → "코지엔비",
  //         "판매자로켓내일BFL" → "BFL".
  const COUPANG_GARBAGE_HEAD_PATTERNS = [
    /[🚀↑↓▲▼★☆·•»«‹›<>;:,."'”“‘’\-|ㅣ=_*©!?~@#&]+\s*/u,
    /[a-zA-Zㄱ-ㅎㅏ-ㅣ0-9]{1,4}\s*[>»‹<]+\s*/,
    /[A-Za-z0-9]{1,4}(?=\s+(?:로[켓컷킷겟케]|판매자|편매자|란매자|환매자|만매자|새벽|내일|대일|오늘|당일|와우|무료|해외))\s+/,
    /[A-Za-z]{1,3}\s+[ㄱ-ㅎㅏ-ㅣ]\s+/,
    /[ㄱ-ㅎㅏ-ㅣ]\s+/,
    /[가-힣]{1,2}\s*[|│ㅣ]\s*/,
    /\+\s*\d{1,2}\s*%\s*\d{0,3}\s*[.,]?\s*/,
    // "[4 ", "[49 ", "[1401 " 처럼 대괄호 + 숫자 + 공백이 상품명 앞에 남는 경우 —
    // "[4 및음스모르맥세이프..." 실측. "[최신형]" / "[NEW]" 같은 정상 프로모 태그는
    // `[` 뒤가 문자라서 영향 없음.
    /\[\d{1,3}\s+/,
    // 쿠팡 "N일" 반환 보증 배지 잔류 — rejoin 이 "로 켓 14 일" 을 "로켓 14 일" 로 만들고
    // leadingTagRegex 가 "로켓" 만 컷한 뒤 "14 일 | …" 가 상품명 앞에 남는다. 뒤에 명백한
    // 구분자(`|`, `,`, `.`) 가 있을 때만 매치해 "1일 특가 치약" 같은 정상 문구를 보호.
    /\d{1,3}\s*일\s*[|│ㅣ,.]\s*/,
    // 배지 바로 뒤에 "로 켓 149 수 니 베…" 식으로 OCR 숫자 노이즈가 낀 잔류 패턴. 앞쪽
    // 배지/로켓 컷이 끝난 상태에서 "149 수니베빅사이즈…" / "199 뷰센 28 …" 같이
    // `^숫자 + 공백 + 한글 2+` 로 시작하면 그 숫자 묶음은 OCR 가비지(내일/14일/포인트 등
    // 배지를 숫자로 흘린 결과) 로 판단해 컷. `(?=[가-힣]{2,})` 룩어헤드로 "10 팩", "5 종
    // 세트" 같이 뒤 한글이 **1자** 인 정상 수량/단위 표기는 건드리지 않는다. 2+ 는 "뷰센"
    // (브랜드) 도 잡아내기 위한 최소치.
    /\d{1,4}\s+(?=[가-힣]{2,})/,
    /(?:로[켓컷킷겟케]|판매자|편매자|란매자|환매자|만매자|새벽|내일|대일|오늘|당일|도착|배송|와우|광고|쿠폰|추천|적립|할인){2,4}\s*/,
  ];

  // stripLeadingGarbagePrefix 의 residual 계산용 원자 — prefix 안에서 **낱개 단어** 로 섞여
  // 있을 수 있는 배지들을 모아 공백 치환해 residual 을 만드는 용도. leadingTagRegex 의
  // compound 들을 원자 단위로 분해한 + 쿠팡 고유 명사(쿠팡/카드/멤버십/캐시 등) 를 합친 목록.
  // `/g` 플래그로 `.replace` 시 전체 치환을 보장합니다.
  const COUPANG_BADGE_ATOMS = /로[켓컷킷겟케]|판매자|편매자|란매자|환매자|만매자|잣매자|새벽|내일|대일|오늘|당일|와우|무료|해외|쿠팡|쿠폰|도착|배송|광고|추천|적립|할인|프레시|프레쉬|그로스|직구|설치|플러스|멤버십|캐시|카드/g;

  // 버튼/UI 라벨 — noiseLineRegex(단독 라인) + trailingButtonRegex(상품명 꼬리) 가 공유합니다.
  //   - DESKTOP: 쿠팡 PC 주문상세 우측 컬럼의 액션 버튼 묶음.
  //   - MOBILE : 앱 주문내역의 통합 버튼.
  // 꼬리 regex 에서는 두 묶음을 합쳐 한 번에 매치하고, 단독 라인 regex 는 각 버튼이 `^…$` 에서
  // `>?` 허용 여부가 달라 아래 COUPANG_NOISE_LINES 에 개별로 등재합니다.
  const COUPANG_DESKTOP_BUTTONS = [
    /주문\s*취소/,
    /주문\s*상세보기/,
    /리뷰\s*(?:작성(?:하기)?|쓰기)/,
    /배송\s*조회/,
    // 교환의 '교' 가 OCR 에서 '고' 로 떨어지는 케이스가 실측 캡쳐(222035·222043·222049·222122
    // 등) 에서 과반으로 나와 `[교고]` 로 흡수. 사이에 쉼표/온점/중간점이 들어오는 변형도 허용.
    /[교고]환\s*[,.·]?\s*반품\s*신청/,
    // '반품 신청' 단독으로 꼬리에 남은 잔류 (222018 코코도르의 "... 1 개반품신청" 처럼 앞 공백이
    // 없거나 '교환' 이 통째로 날아간 케이스) 도 함께 컷. 한국 쇼핑 상품명에 '반품신청' 이 등장할
    // 일이 거의 없으므로 꼬리 매칭에 한해 안전.
    /반품\s*신청/,
    /판매자\s*문의/,
    /장바구니\s*담기/,
  ];
  const COUPANG_MOBILE_BUTTONS = [
    /배송\s*[·•-]?\s*주문\s*관리/,
    /바로\s*구매/,
    /더보기/,
    /상세보기/,
  ];

  // 단독 라인으로 떨어지는 노이즈. 날짜 꼬리 / 버튼 / 화면 헤더 / 페이징.
  //   - `^…$` 를 alternation 마다 붙이는 이유: 각 항목이 자기 고유의 leading/trailing 기호
  //     (예: `[\s·•\-*]*` 날짜 꼬리, `[\s<>«»]*` 이전 페이징) 를 허용해 통일 불가.
  //   - 데스크톱/모바일 버튼 중 `>?` 를 꼬리에 허용하는 건 실측(주문 상세보기 >, 주문 취소 >,
  //     상세보기 >, 다음 >) 을 근거로 개별 등록. 나머지는 `\s*$` 로만 닫습니다.
  const COUPANG_NOISE_LINES = [
    // 상태 라인에서 줄바꿈으로 떨어진 "· 4/17(금) 도착" 꼬리.
    /^[\s·•\-*]*\d{1,2}\/\d{1,2}\s*\(?[월화수목금토일]?\)?\s*도착\s*$/,
    // 데스크톱 버튼.
    /^주문\s*상세보기\s*>?\s*$/,
    /^장바구니\s*담기\s*$/,
    /^배송\s*조회\s*$/,
    /^리뷰(?:\s*작성(?:하기)?|\s*쓰기)\s*$/,
    /^교환[,\s]*반품\s*신청\s*$/,
    // 2026-04-24: 실측 캡쳐에서 "판매자 문의" 행 앞에 `@` 아이콘 OCR 잔류가 자주 붙습니다.
    //   예: 222111 의 "@ 판매자문의" → 이전 정확 매칭 패턴은 anchor 로 거부되어 nameBuffer 로
    //   떨어지고 end-of-loop 소프트 커밋에서 price=0 phantom 카드가 발생했습니다. leading 허용.
    /^[\s@·•\-*]*판매자\s*문의\s*$/,
    /^주문\s*취소\s*>?\s*$/,
    // 모바일 버튼.
    /^더보기\s*$/,
    /^상세보기\s*>?\s*$/,
    /^배송\s*[·•-]?\s*주문\s*관리\s*$/,
    /^바로\s*구매\s*$/,
    // 모바일 버튼 OCR 잔류 — 쿠팡 앱의 "배송 · 주문 관리 | 바로구매 | [장바구니아이콘]" 버튼 행이
    //   Tesseract 에서 "배송" 접두가 붙기도/빠지기도 하고, 중간점이 `ㆍ` 로 떨어지며 꼬리에
    //   `번`/`벌`/`낼`/`드래` 같은 아이콘 오인식 파편이 이어지는 케이스가 9장 중 5장에서
    //   관찰됐습니다. 또한 앞쪽에 "배송" 버튼 텍스트가 붙어 `배송 ㆍ 주문관리...` 가 되거나,
    //   같은 행의 좌측 상품 스펙 꼬리(`패이 56배속`)가 `ㆍ 주문관리...` 앞에 붙어 섞여 나오기도
    //   합니다. prefix 를 정확히 잡기 어려워, **"주문관리" / "바로구매" 중 하나라도 포함된
    //   길이 ≤ 60 의 라인** 은 통째로 버튼 노이즈로 간주합니다. 쿠팡 상품명에는 두 phrase 가
    //   등장하지 않아(button UI 전용 문구) 안전합니다. 가격/상태/분리배송 검사가 이미 이 라인
    //   보다 앞서 도는 덕에 숫자가 섞인 진짜 가격 라인은 여기까지 오지 않습니다.
    //
    //   예: "ㆍ 주문관리바로구매 `", "배송 ㆍ 주문관리바로구매벌", "패이 56배속 ㆍ 주문관리으소묘"
    //       → 모두 "주문관리" 포함 · 길이 ≤ 60 → 버튼 노이즈로 컷.
    /^.{0,60}주문\s*관리.*$/,
    /^.{0,60}바로\s*구매.*$/,
    // 장바구니 아이콘 OCR 부스러기 (쿠팡 앱 우측 하단 carts 아이콘을 한 글자씩 읽어 `으스묘`,
    //   `으스뇨`, `으소묘`, `미의슬뇨`, `스뇨` 로 뱉는 실측 케이스). "0 20 으스묘" 처럼 디지트/
    //   공백이 앞에 섞여 들어오는 변이까지 잡도록 prefix 를 짧은 임의 문자열로 엽니다.
    /^.{0,10}(?:으스묘|으스뇨|으소묘|미의슬뇨|스뇨)\s*$/,
    // 화면 헤더 / 검색창 placeholder / 목록 타이틀.
    /^주문한\s*상품을\s*검색할\s*수\s*있어요[!！]?\s*$/,
    /^주문\s*목록\s*$/,
    /^주문내역\s*$/,
    /^반품\s*상세\s*보기\s*$/,
    /^반품\s*안내\s*$/,
    // 페이징 / 푸터.
    /^[\s<>«»]*\s*이전\s*$/,
    /^다음\s*>?\s*$/,
    /^쿠팡\s*only\s*$/,
  ];

  // 분리배송 마커 — "일부 상품이 분리되어 배송됩니다" / "분리배송된 상품입니다" / 단독 "• 분리 배송".
  //
  // leading OCR junk (`@`, `"`, `'`, bullet, dot 등) 은 흡수해서, `@ 일부 상품이 분리되어...`
  // 같은 실제 캡쳐 케이스에서도 마커가 떨어지지 않도록 합니다 (222053, 222127 회귀 방지).
  //
  // 2026-04-24 (사용자 버그 리포트 수정): Tesseract 가 `배` 를 `바`·`버` 로 섞어 읽는 케이스
  // (`분리바송`, `분리버송`) 와, 마커와 상품명이 한 줄로 합쳐져 나오는 케이스(`일부 상품이
  // 분리되어 배송됩니다분리 배송 _ASI S...`) 가 관찰돼 대응. `[배바버]` 문자 클래스로 변형
  // 흡수하고, **line 전체 anchored** 가 아니라 아래 splitMarkerSubstringRegex 로 **substring**
  // 매치 후 마커 텍스트만 떼어내고 뒤에 붙은 상품명은 nameBuffer 로 보냅니다.
  // 변형 위치는 `배송` 의 **배** 글자 (OCR 이 `바`·`버`·`베` 로 오인). `되어` 쪽은 실측상
  // 변형이 거의 없어 유지. `송` 도 거의 변형 없음.
  const COUPANG_SPLIT_MARKERS = [
    /^[\s@"'`·•▪\-*ㆍ]*일부\s*상품이\s*분리되어\s*[배바버베]송됩니다[.…]?\s*$/,
    /^[\s@"'`·•▪\-*ㆍ]*분리[배바버베]송된\s*상품입니다[.…]?\s*$/,
    /^[\s@"'`·•▪\-*ㆍ]*분리\s*[배바버베]송\s*$/,
  ];

  // 같은 마커들을 **substring** 으로 찾아 라인 중간/끝에 섞여 있는 케이스도 잡습니다.
  // 매칭 시 `line.replace(MARKER, '')` 로 제거하면 앞/뒤 붙어 있던 상품명은 그대로 유지됩니다.
  //
  // 예: `OQ 분리바송된 상품입니다분리 배송 _ASI S...` → 마커 2개(분리바송된 상품입니다 +
  // 분리 배송) 를 떼어내면 `OQ  _ASI S...` 가 남고, 이후 leadingTag/가비지 처리에서 정리됩니다.
  //
  // 주의: 긴 패턴이 먼저 매칭되도록 **배열 순서 중요**. "분리 배송" 만 먼저 지우면 "분리배송된
  // 상품입니다" 의 "된 상품입니다" 가 나머지로 떨어져 오히려 이름 오염을 악화시킵니다.
  const COUPANG_SPLIT_MARKER_SUBSTRINGS: RegExp[] = [
    /일부\s*상품이\s*분리되어\s*[배바버베]송됩니다[.…]?/g,
    /분리[배바버베]송된\s*상품입니다[.…]?/g,
    /분리\s*[배바버베]송(?=\s|$|[가-힣])/g,
  ];

  // 주문일 코어 패턴 — `2026. 4. 22` 처럼 "YYYY. M. DD" 세 숫자를 뽑아냅니다. pre-scan 용은
  // 라인 어디에 있어도 찾고 `주문` 단어가 꼬리에 붙든 말든 허용하는 반면, 헤더 판정용은 라인
  // 맨 앞에 위치할 때만 인정합니다(모바일은 "주문" 없음). 둘 다 이 코어를 재사용합니다.
  const COUPANG_DATE_CORE = /(20\d{2})\s*[.\s]\s*(\d{1,2})\s*[.\s]\s*(\d{1,2})/;

  // 어휘 배열을 `.source` 기반으로 alternation 문자열로 연결하는 헬퍼.
  const joinRegex = (items: RegExp[]) => items.map(r => r.source).join('|');

  // ── 조립된 regex ─────────────────────────────────────────────
  //
  // 상태 라인: 라인 맨 앞(가벼운 leading bullet/whitespace 정도만 허용)에서만 매칭합니다. 앵커
  // 없이 전역 매칭을 쓰면 쿠팡 우측 컬럼 버튼("주문취소", "리뷰 작성하기" 등)이 Tesseract 에서
  // 상품명 라인 꼬리에 붙어 나왔을 때 상태 라인으로 오인되어 상품이 통째로 증발하는 회귀가
  // 있었습니다. 앵커로 막으면 버튼 꼬리는 이름 처리 경로로 넘어가 leadingTagRegex / 이름 수집
  // 에서 자연스럽게 정리됩니다. 한편 한글 사이 공백 변형("배송 완료", "상품 준비 중") 은 `\s*`
  // 로 흡수해 한 줄 regex 를 유지합니다.
  const statusLineRegex = /^[\s·•▪\-*|ㅣ]*(배송\s*완료|배송\s*중|상품\s*준비\s*중|결제\s*완료|주문\s*완료|주문\s*취소|취소\s*완료|환불\s*완료|환불\s*처리|반품\s*완료|구매\s*확정|정기\s*결제|구독)/;

  // 섹션 경계 — 이 라인 이후는 주문 집계 영역이라 상품으로 보지 않음.
  const sectionBoundaryRegex = /(결제\s*정보|결제영수증\s*정보|받는사람\s*정보|배송(?:상품)?\s*주문상태\s*안내|배송지\s*정보)/;

  // 노이즈 라인: COUPANG_NOISE_LINES 의 각 alternation 이 이미 `^…$` 로 닫혀 있어 join 만으로
  // 동치 regex 가 조립됩니다. `/i` 는 "쿠팡 only" 같은 영문 케이스 흡수용.
  const noiseLineRegex = new RegExp(joinRegex(COUPANG_NOISE_LINES), 'i');

  // 분리배송 마커.
  const splitMarkerRegex = new RegExp(joinRegex(COUPANG_SPLIT_MARKERS));

  // 가격 라인: `6,900 원 · 1개` / `17,270 원 · 1개` / `0 원 · 1개` (무료/포인트 결제).
  // 숫자를 `\d+` 로 완화해 "0 원" 사은품 케이스도 잡으며, "원" 뒤에는 한글 `\b` 가 무효라서
  // word-boundary 대신 공백/구분자/EOL lookahead 로 경계를 잡습니다.
  //
  // 2026-04-24 (한글 룩어헤드 추가): rejoinSplitKoreanWords 가 한글 단일-런을 결합하며
  // "5290 원 가 장 바 구 니 담 기..." 같이 `원` 이 뒤 버튼 한글과 한 덩어리로 뭉치는
  // 케이스에서, 기존 lookahead 가 `원` 뒤 한글을 거부해 가격을 놓치는 회귀가 있었습니다.
  // `\d+` 앵커가 앞에 확실해 "대원/고원" 같은 일반 명사 매칭은 일어나지 않으므로 lookahead
  // 에 `[가-힣]` 을 추가해 `5290원가장바구니...` 같은 OCR 잔류도 흡수합니다.
  const priceLineRegex = /([\d]{1,3}(?:,\d{3})+|\d+)\s*원(?=$|[\s·•.\-*,)가-힣\d])(?:[^\d\n]{0,6}(\d{1,3})\s*개)?/;

  // 가격 라인 (보조): `원` 키워드가 OCR 에서 완전히 증발했을 때 사용하는 fallback.
  //
  // 실측 예 (222018.png, 2026-04-24):
  //   "SS 5208 :가 장바구니 담기 판매자 문의"  ← 실제 상품가 5,290원인데 "원" 이 통째로 깨짐
  //   → priceLineRegex 는 `원` 을 요구해 실패 → 가격 미인식 → 해당 상품 카드 통째로 누락.
  //
  // 쿠팡 PC/모바일 UI 는 상품 우측 하단에 "장바구니 담기" 버튼이 늘 붙어 있어, **가격 바로 뒤에
  // 장바구니 담기 버튼 문구** 가 오는 구조가 매우 강한 신호입니다. 이 구조를 앵커로 삼으면
  // `원` 글자가 OCR 에서 깨져도 가격 숫자를 회수할 수 있습니다.
  //
  // 안전성:
  //   - `\d{3,6}` (또는 콤마 표기) 로 최소 3자리를 요구 → 수량 표기 "1개", "2개" 가 trigger 되지 않음.
  //   - 숫자와 "장바구니 담기" 사이 최대 10자 허용 → ": 가 ", ": 개 " 같은 잔여 OCR 토큰 흡수.
  //   - 숫자 앞은 공백/라인 시작 또는 non-digit (\D) 요구 → 긴 숫자 열 일부가 매치되지 않도록 막음.
  //   - priceLineRegex 가 먼저 시도되고 match 하면 `continue` — 정상적인 "원" 가격 라인은
  //     여기 도달하지 않아 기존 경로와 충돌이 없습니다.
  const priceLineFallbackRegex = /(?:^|\D)(\d{1,3}(?:,\d{3})+|\d{3,6})[^\n]{0,20}장바구니\s*담기/;

  // 주문일 (pre-scan): 라인 어디에 있든 날짜를 찾고, `주문` 단어는 optional.
  const orderDateRegex = new RegExp(COUPANG_DATE_CORE.source + /\s*(?:주\s*문)?/.source);

  // 주문 헤더 (inline): 라인 맨 앞에서 날짜로 시작할 때만 헤더로 인정. `주문` 단어 요구 없음.
  const orderHeaderRegex = new RegExp('^' + COUPANG_DATE_CORE.source);
  // 주문 헤더 (inline with numeric prefix): 데스크톱 full-page 스크롤 캡쳐에서 order-count 배지가
  // 같은 시각 행에 `236368 2025. 12. 17 주문 상세보기 >` 처럼 앞에 붙어 나오는 케이스를 커버합니다.
  // 오탐 방지를 위해 **`주문` 단어가 같은 라인에 함께 있어야만** 헤더로 인정합니다.
  const orderHeaderPrefixedRegex = new RegExp(
    '^\\s*\\d+\\s+' + COUPANG_DATE_CORE.source + '.*주\\s*문'
  );

  // 상품명 앞에 붙는 쿠팡 전용 태그/아이콘. 선두 장식·가비지 → 로켓/시간/멤버십/프로모 compound →
  // bare badge 순으로 alternation 을 쌓습니다. 여러 개가 겹쳐 붙을 수 있어 caller 에서 while 로
  // 반복 제거합니다. `/i` 로 bare 배지의 영문(BEST/NEW/HOT/SALE) 을 소문자 변형까지 흡수.
  //
  // 📌 주의: "도착"/"배송"/"적립"/"할인"/"쿠폰"/"추천" 같은 원자 단어는 쿠팡 상품명 선두에 실제로
  //   거의 등장하지 않아 false-positive 위험이 낮다고 판단해 포함했습니다. 만약 사용자가 "할인
  //   쿠폰" 이라는 이름의 상품을 판다 해도 꼬리 이름이 2자 이상 남기 때문에 placeholder 정책
  //   (상품명 null → OcrEdit 에서 직접 입력) 으로 안전하게 회복할 수 있습니다.
  //
  // 2026-04-23 (bare badge lookahead): 단어 경계가 없으면 "당일발송" 에서 "당일" 만 먹고 "발송"
  //   이 상품명으로 남는 버그가 있어 bare 배지 뒤에 `(?=\s|$)` 룩어헤드를 추가했습니다.
  const leadingTagAlternations = [
    ...COUPANG_GARBAGE_HEAD_PATTERNS,
    ...COUPANG_ROCKET_BADGES,
    ...COUPANG_TIMING_BADGES,
    ...COUPANG_MEMBERSHIP_BADGES,
    ...COUPANG_PROMO_BADGES,
  ].map(r => r.source);
  const leadingTagRegex = new RegExp(
    '^(?:' + leadingTagAlternations.join('|') + '|(?:' + COUPANG_BARE_BADGES.source + ')(?=\\s|$))\\s*',
    'i'
  );

  // ───────── 1차 라인 분리 ─────────
  const allLines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  // ───────── 상태머신 주행 ─────────
  //
  // orderDate는 이제 **루프 안에서** 실시간 갱신됩니다. 한 이미지에 `2026. 4. 7 주문` + `2026. 4. 1 주문`처럼
  // 여러 주문 헤더가 섞여 있는 목록형 캡쳐에서, 이전에는 pre-scan이 첫 헤더 하나만 잡고 메인 루프가
  // 나머지 헤더를 단순 스킵해 **모든 상품이 첫 헤더 날짜로 찍히는** 회귀가 있었습니다. 이제는 헤더 라인을
  // 만날 때마다 orderDate를 새 값으로 바꾸고, 남아 있던 nameBuffer는 섹션 경계 관점에서 버려
  // 이전 주문의 "이름만 남은 상품"이 새 주문의 첫 가격과 합쳐지지 않도록 합니다.
  // 내부 플래그: 파서가 자체적으로 분리배송 병합 시 사용. 최종 결과에는 노출되지 않음.
  type InternalResult = PurchaseOCRResult & { _splitDelivery?: boolean };
  const results: InternalResult[] = [];
  let orderDate: string | null = null;
  let currentStatus: string | undefined;
  let nameBuffer: string[] = [];
  let inPaymentSection = false;
  // 분리배송 마커가 직전에 활성화됐는지. 다음 flush 한 번만 플래그를 전파하고 리셋합니다.
  let pendingSplit = false;
  // 지금까지 본 status 라인 개수. "status 카드" 가 한 번이라도 열렸는지 여부를 판단해
  // 가격이 OCR 에서 통째로 깨진 카드 (예: "oo 장바구니 담기" 처럼 숫자조차 안 잡히는 케이스)
  // 의 nameBuffer 를 placeholder 가격 (0원) 으로 살릴지 결정하는 용도로 씁니다.
  // 파서가 아직 첫 status 를 만나기 전이라면 pre-amble 잔존물이 nameBuffer 에 들어 있을 수
  // 있어 soft-commit 하지 않습니다.
  let statusCardsStarted = 0;
  // 2026-04-25: end-of-loop phantom 방지용 두 플래그.
  //   lastStatusHadPrice : 직전 status-reset 이후 priceLine 이 한 번이라도 매칭됐는지.
  //   bufferReopenedAfterPrice : priceLine 매칭 이후에 **새로** name 라인이 nameBuffer 에
  //     push 되어 "다음 카드" 가 쌓이기 시작했는지. 이게 true 이면 end-of-loop 에 도달한
  //     buffer 는 "price 없이 쌓다 만 다음 카드" 로 phantom 확정.
  //
  //   phantom 판정 조건 (end-of-loop 에서 drop):
  //     · lastStatusHadPrice=false  → status 안에서 price 한 번도 없음 + buffer 만 남음
  //       (예: 002 벨로티 — 화면 맨 아래 잘린 fragment / 추천 섹션)
  //     · lastStatusHadPrice=true && bufferReopenedAfterPrice=true → price 이후 새로 쌓은 buffer
  //       (예: 003 의슬뇨 — 화장지 price flush 뒤 icon OCR 이 나타남)
  //   legit emit (= 기존 복구 정책) 조건:
  //     · lastStatusHadPrice=false && bufferReopenedAfterPrice=false
  //       → 이 status 의 첫 카드가 price OCR 실패 (222018 aroma 오일 스타일)
  let lastStatusHadPrice = false;
  let bufferReopenedAfterPrice = false;

  // 맨 앞의 "2026. 4. 16" 처럼 "주문" 단어 없이 날짜만 뜨는 최후의 폴백 용도로 스캔해 둡니다.
  // 메인 루프가 진짜 주문 헤더("주문" 단어 포함)를 만나면 이 값은 덮어씌워집니다.
  //
  // **첫 상태 라인(배송완료/취소완료 등) 이전의 날짜만** 초기값으로 허용합니다. 모바일 쿠팡
  // 캡쳐에서는 date 헤더가 카드 *사이에* 오면서 앞쪽에 date 가 없는 "orphan" 카드가 먼저
  // 등장하는 케이스(006, 007, 004 등)가 있는데, 이전에는 pre-scan 이 먼 뒤쪽 헤더를 집어
  // 와서 orphan 카드에도 잘못된 date 가 붙었습니다. 상태 라인을 만나면 break 해서 orphan 은
  // 그대로 date="" 로 남기고, 메인 루프가 실제 헤더를 만날 때 비로소 orderDate 를 갱신하도록
  // 했습니다. 범위 자체는 30 라인으로 넉넉히 두되, status 게이트가 선행합니다.
  for (const line of allLines.slice(0, 30)) {
    if (sectionBoundaryRegex.test(line)) break;
    if (statusLineRegex.test(line)) break;
    const m = line.match(orderDateRegex);
    if (m) {
      const mm = m[2].padStart(2, '0');
      const dd = m[3].padStart(2, '0');
      orderDate = `${m[1]}-${mm}-${dd}`;
      break;
    }
  }

  // Tesseract 가 쿠팡 우측 컬럼 버튼("주문취소", "리뷰 작성하기", "교환, 반품 신청" 등)을
  // 같은 시각적 행으로 합쳐 주면 상품명 라인 끝에 버튼 텍스트가 붙어 나오는 경우가 있습니다.
  //   예) "원더풀피스타치오 ... 200g, 3개 주문취소"
  //        "코지엔비 곱창머리끈 5종, 1세트 장바구니 담기"
  // 선두 태그만 정리하고 끝내면 상품명에 버튼 텍스트가 영구히 남으니, 꼬리에서 한 번 더 패스를
  // 돌려 **알려진 액션/네비 버튼 문구** 만 제거합니다. 버튼 목록 자체는 위 vocabulary 블록의
  // COUPANG_DESKTOP_BUTTONS + COUPANG_MOBILE_BUTTONS 에서 공유해, 단독 라인 노이즈(noiseLineRegex) 와
  // 꼬리 컷(trailingButtonRegex) 이 동일한 어휘 집합을 보도록 정규화했습니다.
  // 2026-04-24: prefix 를 `\s+` → `[\s,·.]*` 로 완화.
  //   "1 개반품신청" (코코도르), "교환반품신청" (크리스마), "...고환. 반품신청" (여러 건) 같이
  //   공백이 없거나 쉼표/온점이 끼어든 꼬리를 기존 `\s+` 은 못 잡고 nameBuffer 에 그대로 남겼습니다.
  //   버튼 어휘 자체에는 `주문 취소`, `장바구니 담기` 등 의미상 상품명 꼬리에 올 수 없는 문구만
  //   있으므로 prefix 0 글자를 허용해도 정상 이름을 갉아먹지 않습니다.
  const trailingButtonRegex = new RegExp(
    '[\\s,·.]*(?:' + joinRegex([...COUPANG_DESKTOP_BUTTONS, ...COUPANG_MOBILE_BUTTONS]) + ')\\s*>?\\s*$'
  );

  /**
   * 🚀 배지 오인식으로 생긴 라인 선두 가비지를 한 번에 컷 합니다.
   *
   * leadingTagRegex 는 "판매자로켓", "로켓 내일" 같이 **정확한 키워드**가 남아 있는 배지만
   * 인식합니다. 하지만 Tesseract 가 🚀 아이콘과 배지 텍스트를 통째로 뭉개 "AED 는 프",
   * "Hess we) = [waza |A Me", "LL ㅋ", "48S 4/25(도 도착 ", "로 #로켓 4 " 같은 **알아볼 수
   * 없는 가비지**로 뱉는 경우가 harness 검증에서 다수 발견됐습니다.
   *
   * 관찰된 공통 구조: [가비지(ASCII/숫자/특수문자/자모 포함)] + [공백] + [실제 한글 상품명].
   * 따라서 "선두에서 첫 3+ 연속 가-힣 직전까지를 prefix 로 보고, prefix 가 ASCII/숫자/특수문자/
   * 자모 중 하나라도 포함하면 통째로 컷" 이라는 규칙이 안전합니다.
   *
   * 안전성 (false-positive 방지):
   *   - "코지엔비 곱창머리끈 5종" → 선두가 바로 4자 가-힣이라 prefix 길이 0, 규칙 미발동.
   *   - "탐사 체리블라썸 전연펄프" → prefix "탐사 " 는 가-힣+공백뿐이라 노이즈 마커 없음 → 보존.
   *   - "CJ 햇반 300g" → "햇반" 은 2자뿐이라 {3,} lookahead 실패 → prefix 정의 자체가 안 됨 → 보존.
   *   - "HFS-900 체온계 사용설명서" 처럼 3+ 한글이 후속하는 영문 모델명도 컷될 위험이 있지만,
   *     쇼핑 상품명이 영문 모델명으로 시작하는 경우가 드물고 OcrEdit 에서 복구 가능 → 수용.
   */
  const stripLeadingGarbagePrefix = (line: string): string => {
    // 최소 매칭으로 첫 [가-힣]{3,} 바로 앞까지 스캔.
    const m = line.match(/^(.*?)(?=[가-힣]{3,})/);
    if (!m) return line; // 3+ 연속 한글이 없으면 우리가 아는 상품명 패턴이 아님 — 건드리지 않음
    const prefix = m[0];
    if (prefix.length === 0) return line; // 이미 선두가 깨끗한 한글
    // 노이즈 마커: ASCII 영문/숫자, 특수 연산/괄호류, 한글 자모(ㄱ-ㅎㅏ-ㅣ)
    const hasNoise = /[A-Za-z0-9=|[\]#+^~ㄱ-ㅎㅏ-ㅣ]/.test(prefix);
    if (!hasNoise) return line; // 순수 한글+공백 prefix 는 합법 브랜드("탐사 ", "초록 " 등)로 간주
    // 2026-04-23 (3차 보정, 모바일 캡쳐):
    //   "샤넬 루쥬 코코 밤 3g 무료선물포장..." 처럼 2글자 한글 덩어리가 공백으로 이어진 뒤
    //   마지막에 "3g" 같은 단위가 붙는 **합법 상품명**까지 "3g 때문에 hasNoise=true" 로 컷되는
    //   false-positive 가 발견됐습니다. 가격 태그 배지 OCR 가비지 ("로 #로켓 4 ", "48S 4/25...",
    //   "AED 는 프") 에서는 2글자 한글 덩어리가 거의 안 나타나는 반면 합법 상품명은
    //   "샤넬 루쥬 코코", "아이폰 맥세이프 스탠드" 처럼 2+ 글자 덩어리가 **2개 이상** 줄줄이
    //   등장하는 경향이 강합니다.
    //
    //   단, 쿠팡 배지 키워드("로켓", "내일", "새벽", ...) 는 prefix 에 그대로 남아 있어도
    //   합법 브랜드 신호로 봐선 안 됩니다. 실제로 "Hess GE = | 08개 로켓 내일 삼성전자 ..."
    //   같은 데스크톱 OCR 가비지가 "로켓" + "내일" 두 덩어리로 카운트되며 보호돼 회귀(삼성전자
    //   충전기가 Hess 가비지 포함 이름으로 남음)가 발생했습니다. 먼저 배지 어휘를 지운 뒤
    //   남은 **residual** 로 판정합니다.
    //
    // 2026-04-23 (4차 보정, 데스크톱 추가 캡쳐):
    //   배지만 붙는 정상 상품명 ("🚀 판매자로켓 내일 BFL 빅사이즈 ...", "🚀 로켓 내일 뷰센 28
    //   어드밴스드 ...", "🚀 판매자로켓 내일 HANYO 여성용 ...", "1+1 천연 유기농 아로마오일 ...",
    //   "R312 슬라이드 지퍼백 ...", "[최신형] 차이슨 무선 청소기 ...") 이 prefix 에서 전부 컷되는
    //   회귀 발견. 기존 "Korean chunk 2 개 이상" 규칙은 "뷰센"(1 chunk) 같은 2자 한글 브랜드나
    //   "BFL"(0 chunk) 같은 영문 브랜드를 걸러내지 못함.
    //
    //   추가 규칙:
    //     (a) 배지 제거 후 residual 이 "짧은 영문+숫자 브랜드" (≤8자, [A-Za-z0-9+] 만) 이면 보존.
    //         → "BFL", "HANYO", "R312", "1+1" 등.
    //     (b) residual 에 **분명한 가비지 마커**(=, |, #, ^, ~, {, }) 가 없고 한글 덩어리가 1 개
    //         이상이면 보존. 대괄호 [ ] 는 "[최신형]" 같은 정상 프로모 태그에 쓰이므로 가비지 마커
    //         목록에서 제외.
    // 배지 원자 어휘는 위 vocabulary 블록의 COUPANG_BADGE_ATOMS (/g) 를 공유. 새 배지가 생기면
    // 그 리스트만 수정하면 됩니다.
    const residual = prefix
      .replace(COUPANG_BADGE_ATOMS, ' ')
      .replace(/🚀/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Rule (a): "BFL", "HANYO", "R312", "1+1" 같은 짧은 영문/숫자(+) 브랜드는 보존.
    //
    // 2026-04-24 (순수 숫자 거부): 실제 캡쳐(`로 켓 149 마 이 쌍 골 지…`, `6 계로켓 14 일 |…`,
    //   `087 빅사이즈…`, `199 삼성전자…`) 에서 Tesseract 가 "로켓"/"내일"/"판매자" 배지를
    //   흘리고 남긴 **순수 숫자 residual** 이 Rule (a) 에 걸려 전체 prefix 가 보존되는
    //   회귀가 관찰됐습니다. 실제 브랜드 코드는 거의 항상 영문 또는 `+` 를 동반하므로
    //   (BFL·HANYO·R312·1+1) 숫자만 남은 residual 은 Rule (a) 대상에서 제외해 뒤 rule
    //   들로 위임합니다. 이 경우 rule (c,d) 실패 → `line.slice(prefix.length)` 로 선두 컷.
    if (
      residual.length > 0 &&
      residual.length <= 8 &&
      /^[A-Za-z0-9+\s]+$/.test(residual) &&
      /[A-Za-z+]/.test(residual)
    ) {
      return line;
    }
    // Rule (b): 가비지 마커 없고 Korean chunk 1 개 이상 → 보존.
    const hardGarbageMarkers = /[=|#^~{}]/.test(residual);
    const residualChunks = residual.match(/[가-힣]{2,}/g);
    if (!hardGarbageMarkers && residualChunks && residualChunks.length >= 1) {
      return line;
    }
    // Rule (c, 기존): prefix 전체에서 2+ chunks → 합법 상품명.
    const koreanChunks = prefix.replace(COUPANG_BADGE_ATOMS, ' ').match(/[가-힣]{2,}/g);
    if (koreanChunks && koreanChunks.length >= 2) return line;
    // Rule (d): "[최신형]", "[NEW]", "[공식정품]", "[쇼핑백 샘플1종]" 같은 대괄호 프로모 태그가
    // prefix 안에 있으면 대괄호부터는 상품명의 일부로 보존. "🚀 판매자로켓 내일 [최신형] 차이슨"
    // 처럼 배지 + 프로모 태그가 prefix 에 뭉쳐있는 케이스에서 `[` 이후를 살려줍니다.
    //
    // 단, residual 에 하드 가비지 마커(=, |, #, ^, ~, {, }) 가 있으면 OCR 가비지
    // ("Hess we) = [waza |A Me" 등) 안에 우연히 포함된 `[` 이므로 보존하지 않습니다.
    if (!hardGarbageMarkers) {
      const bracketIdx = prefix.lastIndexOf('[');
      if (bracketIdx >= 0) return line.slice(bracketIdx);
    }
    return line.slice(prefix.length);
  };

  const stripTags = (line: string): string => {
    let cleaned = line;
    // 1차: 🚀 OCR 가비지 prefix 한 번에 컷 (아래 leadingTagRegex 로 못 잡는 뭉개진 배지 처리).
    cleaned = stripLeadingGarbagePrefix(cleaned);
    // 선두 태그를 반복 제거. 예: "🚀판매자로켓 새벽 코지엔비..." → "코지엔비..."
    let prev = '';
    while (cleaned !== prev) {
      prev = cleaned;
      cleaned = cleaned.replace(leadingTagRegex, '');
    }
    // 꼬리 버튼/구분자 정리. 버튼 키워드도 여러 개가 연속 붙을 수 있어 반복합니다.
    prev = '';
    while (cleaned !== prev) {
      prev = cleaned;
      cleaned = cleaned.replace(trailingButtonRegex, '');
    }
    cleaned = cleaned.replace(/[>:]\s*$/, '').trim();
    return cleaned;
  };

  // 2026-04-24: 라인-단위 stripTags 가 끝난 뒤 **전체 join** 결과에 한 번만 돌리는 꼬리 정리.
  //   라인 단위에서 쉼표 꼬리를 컷하면 "... 내의세트 ," + "밝브랙 ..." 처럼 줄바꿈 신호용 쉼표가
  //   사라져 join 시 "세트밝브랙" 처럼 붙어 버리는 회귀가 생김(222011 케이스). 라인 단위에서는
  //   경계를 보존하고, 최종 name 에만 OCR 꼬리 부스러기(truncation `…`·`.…`, 단독 자모 ㅇㄴㅁㄱ)
  //   를 한 번 컷합니다. 쇼핑몰 상품명이 자모/truncation 으로 끝날 일이 없어 과적합 없이 안전.
  const stripTrailingOcrResidue = (name: string): string => {
    let prev = '';
    let cleaned = name;
    while (cleaned !== prev) {
      prev = cleaned;
      cleaned = cleaned
        .replace(/[\s,·.…-]*[ㄱ-ㅎㅏ-ㅣ]+\s*$/, '')
        .replace(/\s*[…]+\s*\.?\s*$/, '')
        .replace(/\s*\.…\s*$/, '')
        // 꼬리 ` .` (공백+온점) 컷 — OCR 이 상품명 뒤 truncation 을 온점 1개로 떨군 케이스.
        // 공백이 앞에 있어야만 매칭해 "Dr." 같은 붙은 약어는 보존.
        .replace(/\s+\.\s*$/, '');
    }
    return cleaned.trim();
  };

  // priceOcrFailed: soft-commit 경로에서만 true 로 넘어옵니다. 정상 priceLineRegex 매칭 시 false/undefined.
  const flushNameAndPrice = (
    priceNum: number,
    quantity: number | undefined,
    opts: { priceOcrFailed?: boolean } = {},
  ) => {
    // 라인 단위로 한 번 stripTags 를 했어도, 쿠팡이 상품 박스를 여러 줄로 쪼개 뱉어
    // 첫 줄에 "판매자 로켓" 같은 태그 조각, 둘째 줄에 실제 상품명이 오는 경우가 있습니다.
    // 이때는 join 뒤 선두에 다시 태그가 모여 올라오므로, 마지막에 한 번 더 돌려 꼬리를 정리합니다.
    //
    // 2026-04-23: join 구분자를 **공백 없음(빈 문자열)** 으로 바꿨습니다. 쿠팡 상품명 라인은
    // Tesseract 가 시각적 줄바꿈을 기준으로 쪼개 뱉는데, 이때 원본 이미지에 실제 공백이 있었다면
    // 라인 끝/시작에 공백이 이미 포함돼 나옵니다. 그런데 `allLines` 단계에서 `line.trim()`으로
    // 줄 끝 공백을 다 지우기 때문에 원본 공백 유무 정보가 소실된 상태에서 다시 " " 로 join 하면
    // "오리지널" + "탐사" 가 단어 중간에서 잘린 경우까지 강제로 공백이 들어가 "오리지널 탐사"
    // 처럼 원본에 없던 공백이 찍힙니다(사용자 보고: "줄바꿈된 곳이 저장 시 공백으로 박힌다").
    // 대부분의 제품명은 실제로는 공백이 없거나 라인 내부에 이미 정확히 들어가 있어서,
    // 라인 간 경계에는 공백을 넣지 않는 편이 원본 복원에 더 가깝습니다.
    //
    // 한편 라인 **내부**에 이미 존재하는 자연스러운 공백(예: "코지엔비 곱창머리끈 5종")은
    // nameBuffer 항목 자체에 그대로 있으므로 이 변경에 영향받지 않습니다.
    //
    // stripTags 는 멱등이라 태그가 이미 깨끗한 이름에 돌려도 no-op 입니다.
    const joined = stripTrailingOcrResidue(
      stripTags(nameBuffer.join('').replace(/\s+/g, ' ').trim())
    );

    // 2026-04-25 phantom guard: 이름이 결국 **버튼 문구 그 자체** 로 정리되면 카드로 emit 하지
    // 말고 조용히 폐기. 원인: Tesseract 가 "판매자 문의" / "배송조회" 같은 우측 액션 버튼 라인을
    // noiseLineRegex 가 못 잡는 변형(예: "판 매 자  문 의") 로 뱉고, 단일-자모 rejoin 이 "판매자
    // 문의" 로 복원한 뒤 nameBuffer 로 흘러 들어가 soft-commit 경로에서 price=0 phantom 카드로
    // emit 되는 실사용 버그 리포트. 공백을 제거한 비교로 OCR 변형까지 한꺼번에 흡수합니다.
    const PHANTOM_BUTTON_PHRASES = new Set([
      "판매자문의",
      "장바구니담기",
      "배송조회",
      "교환반품신청",
      "고환반품신청",
      "반품신청",
      "주문취소",
      "주문상세보기",
      "배송주문관리",
      "주문관리",
      "바로구매",
    ]);
    const joinedNoSpace = joined.replace(/\s+/g, "");
    if (PHANTOM_BUTTON_PHRASES.has(joinedNoSpace)) {
      nameBuffer = [];
      return; // phantom skip
    }

    const itemName = joined.length > 0 ? joined : null;
    // 정책 변경(2026-04-23): 이름 없이 가격만 잡힌 주문도 더 이상 조용히 버리지 않습니다.
    //
    // 이전에는 "총계 잔존 등"의 오검출을 우려해 null이면 drop했는데, 섹션 경계
    // (결제 정보/받는사람 정보 등)를 만나면 이미 inPaymentSection으로 전체가 차단되기 때문에
    // 이 지점까지 도달한 가격은 "상품 블록 내부의 가격"이 사실상 확정된 상태입니다.
    //
    // 실제로 Tesseract가 저해상도 캡쳐에서 상품명 라인을 놓치는 케이스가 관찰됐고
    // (예: "원더풀피스타치오..." 라인 누락으로 47,650원 주문 카드가 통째로 사라짐),
    // 그 경우 사용자는 OCR 결과 화면에서 "이 주문이 어디 갔지?"라고 헤매게 됩니다.
    // itemName을 null로 그대로 보내면 OcrUpload에서 placeholder 이름을 붙여 주문 카드를
    // 살려주고, 사용자는 OcrEdit의 상품명 칸을 채우기만 하면 정상 저장할 수 있습니다.
    //
    // 한편 상태 라인 바로 뒤에 nameBuffer가 비어 있는 상태로 가격이 오는 경우도 있어서
    // (상태 라인을 처리할 때 nameBuffer를 초기화함), itemName이 null이어도 statusText는
    // currentStatus를 그대로 물려 주어 구매/환불 구분이 유지되도록 합니다.
    const entry: InternalResult = {
      mall,
      itemName,
      price: priceNum,
      date: orderDate,
      rawText,
      statusText: currentStatus ?? undefined,
      quantity,
      ...(opts.priceOcrFailed ? { priceOcrFailed: true } : {}),
    };
    if (pendingSplit) {
      entry._splitDelivery = true;
      pendingSplit = false;
    }
    results.push(entry);
    nameBuffer = [];
  };

  for (const rawLine of allLines) {
    // 2026-04-24: `line` 을 let 으로 바꿔 분리배송 마커 substring 제거 후에도 같은 이터레이션
    // 에서 나머지 텍스트(실제 상품명) 를 계속 처리할 수 있게 합니다.
    let line = rawLine.trim();
    if (!line) continue;

    // 분리배송 마커 substring 선처리 — 마커가 상품명과 한 줄로 합쳐진 케이스 대응.
    //   예: `OQ 분리바송된 상품입니다분리 배송 _ASI S...` 처럼 마커 문구와 상품명이 붙은 경우,
    //   마커 텍스트만 떼어낸 뒤 남는 부분은 아래의 status/noise/name 파이프라인으로 계속 흘려
    //   나머지를 상품명 조각으로 살립니다. 마커가 한 번이라도 히트하면 pendingSplit 플래그를
    //   세워 flush 시 _splitDelivery=true 로 표식.
    for (const markerRe of COUPANG_SPLIT_MARKER_SUBSTRINGS) {
      if (markerRe.test(line)) {
        pendingSplit = true;
        line = line.replace(markerRe, " ").replace(/\s+/g, " ").trim();
        // markerRe 는 global 플래그라 .test 후 lastIndex 가 이동하므로 다음 루프에서 꼬이지
        // 않게 명시적으로 리셋.
        markerRe.lastIndex = 0;
      }
    }
    if (!line) continue; // 마커 제거 뒤 남는 게 없으면 단독 마커 라인이었던 것.

    // 섹션 경계를 한 번이라도 보면 그 뒤는 전부 무시(총계 오인식 방지).
    if (inPaymentSection) continue;
    if (sectionBoundaryRegex.test(line)) {
      inPaymentSection = true;
      continue;
    }

    // 주문번호 라인은 장식이니 스킵.
    if (/주문번호\s*[\d]+/.test(line)) continue;

    // 주문 헤더 라인(YYYY. M. DD [주문]?) — 이 시점부터 flush되는 상품들의 주문일자를 갱신합니다.
    //
    // 2026-04-23: 쿠팡 **모바일 앱** 주문내역은 헤더에 "주문" 단어가 없이 `2026. 3. 29` 만
    // 표시됩니다(데스크톱 주문상세는 `2026. 4. 22 주문`). 이전 구현은 `/주\s*문/` 이 포함된
    // 라인만 헤더로 인정해 모바일 캡쳐에서 **pre-scan 이 잡은 첫 헤더 하나만** 적용되고
    // 그 아래의 모든 날짜 헤더가 무시되는 회귀가 있었습니다(예: M#6 이미지의 "2026. 4. 8"
    // 헤더 뒤 에스트라가 null 로 찍힘).
    //
    // 안전성: 섹션 경계(결제 정보 등) 이후는 `inPaymentSection` 가드로 이미 차단되므로,
    // "결제영수증 날짜" 처럼 결제 정보 안쪽의 날짜 라인이 헤더로 오인될 위험은 없습니다.
    // 또한 가격/상태/노이즈 라인이 `priceLineRegex` → `statusLineRegex` → `noiseLineRegex`
    // 순으로 **이 헤더 검사보다 앞서** 매치되므로 숫자가 섞인 실제 가격 라인이 헤더로
    // 잘못 잡힐 위험도 낮습니다.
    const headerMatch =
      line.match(orderHeaderRegex) ?? line.match(orderHeaderPrefixedRegex);
    if (headerMatch) {
      // 2026-04-24: 헤더가 **카드 뒤에** 오는 모바일 쿠팡 캡쳐(004/006/007 등 orphan 카드
      // 바로 아래에 date 가 오는 레이아웃) 에서는 이전까지 쌓인 nameBuffer 를 먼저 soft-commit
      // 해야 합니다. 이전에는 곧바로 `nameBuffer = []` 로 리셋하면서 "이름만 잡혔고 가격이
      // OCR 에서 증발한 카드"(예: 004의 덴티본, price=0) 가 통째 증발했습니다. 가격 없이 flush
      // 될 때의 orderDate 는 **새 header 적용 이전 값** 이어야 해서 update 보다 먼저 soft-commit
      // 합니다. 웹 캡쳐는 header 가 화면 최상단(statusCardsStarted===0)에 오니 guard 에 걸려
      // 회귀하지 않습니다.
      if (statusCardsStarted > 0 && nameBuffer.length > 0) {
        flushNameAndPrice(0, undefined, { priceOcrFailed: true });
      }
      const mm = headerMatch[2].padStart(2, '0');
      const dd = headerMatch[3].padStart(2, '0');
      orderDate = `${headerMatch[1]}-${mm}-${dd}`;
      nameBuffer = [];
      currentStatus = undefined;
      continue;
    }

    // "주문취소" 단독 버튼은 상태 라인과 글자가 겹치므로, 상태 검사보다 먼저 걸러냅니다.
    // (단독 "주문취소"/"주문취소 >"는 우측 컬럼의 액션 버튼이지 상태 변경이 아닙니다.
    //  상태로 간주되면 바로 뒤에 오는 가격이 실제로 상품준비중/배송완료인 상품인데도 cancel 태그가
    //  잘못 찍히는 회귀가 관찰됐습니다.)
    if (/^주문\s*취소\s*>?\s*$/.test(line)) {
      continue;
    }

    // 가격 라인: "원" 뒤에 optional "N개"
    // 상태 라인 검사보다 **먼저** 수행해, "47,650 원 · 1개 주문취소"처럼 가격과 버튼 텍스트가 한 줄에
    // 합쳐져 나온 경우에도 가격이 우선 처리되도록 합니다(뒤의 "주문취소" 꼬리는 상태로 오인되지 않음).
    const pm = line.match(priceLineRegex);
    if (pm) {
      const priceStr = pm[1].replace(/,/g, '');
      const price = Number(priceStr);
      // 0원도 유효 가격으로 받습니다 — 쿠팡 사은품/쿠폰/포인트 결제 케이스. 필터링하면 상품 이름이
      // nameBuffer에 남아 다음 주문 첫 가격과 함께 flush되는 오염이 발생합니다.
      if (Number.isFinite(price) && price >= 0) {
        const quantity = pm[2] ? Number(pm[2]) : undefined;
        flushNameAndPrice(price, quantity);
        lastStatusHadPrice = true;
        bufferReopenedAfterPrice = false;
        continue;
      }
      // 가격 매치되었지만 숫자 파싱 실패 → 아래 이름 후보 처리로 폴백하지 말고 그냥 스킵.
      continue;
    }

    // 가격 라인 (보조): priceLineRegex 가 "원" 을 요구해 실패한 뒤, "숫자 + 장바구니 담기" 앵커로
    // 한 번 더 시도합니다. priceLineFallbackRegex 설명 참조. OCR 이 "원" 글자 자체를 통째로
    // 깨먹은 카드가 이 단계에서 회수됩니다. 예: "SS 5208 :가 장바구니 담기 판매자 문의" → 5208원.
    const pfm = line.match(priceLineFallbackRegex);
    if (pfm) {
      const priceStr = pfm[1].replace(/,/g, '');
      const price = Number(priceStr);
      if (Number.isFinite(price) && price > 0) {
        flushNameAndPrice(price, undefined);
        lastStatusHadPrice = true;
        bufferReopenedAfterPrice = false;
        continue;
      }
      continue;
    }

    // 상태 라인: 노이즈 검사보다 먼저 처리.
    //   "상품준비중 · 4/25(토) 도착 예정", "배송완료 · 오늘(목) 도착 (무인 택배함)"처럼
    //   noise에 포함될 법한 꼬리표가 함께 붙는 라인을 상태로 올바로 잡기 위해서입니다.
    //   statusLineRegex는 이제 ^ 앵커를 사용하므로 버튼 꼬리는 자연스럽게 제외됩니다.
    if (statusLineRegex.test(line)) {
      // Soft-commit 정책 (2026-04-24): 새 status 카드가 시작되는데 직전 카드의 nameBuffer 가
      // 비어있지 않으면, 해당 카드는 "이름은 잡혔지만 가격이 OCR 에서 증발한 카드" 일 가능성이
      // 높습니다. 예: 222018.png 의 "코코도르 스톤 디퓨저" 는 "11,900원" 가격 라인이
      // "oo 장바구니 담기" 로 깨져 가격 trigger 가 한 번도 발생하지 않습니다. 이전 정책은
      // nameBuffer 를 통째로 버렸지만(= 카드 통째로 누락), 이제는 price=0 placeholder 로
      // emit 해 OcrEdit 화면에서 사용자가 가격만 채워 넣으면 복구할 수 있게 합니다.
      // (statusCardsStarted===0 이면 pre-amble 잔존물 — 주문 헤더 위의 화면 제목 등 — 이라
      //  soft-commit 하지 않습니다.)
      if (statusCardsStarted > 0 && nameBuffer.length > 0) {
        flushNameAndPrice(0, undefined, { priceOcrFailed: true });
      }
      currentStatus = line;
      nameBuffer = [];
      statusCardsStarted += 1;
      // 새 status 구간 시작 — 플래그 리셋. 이 status 에서 priceLine 매칭 여부를 새로 추적.
      lastStatusHadPrice = false;
      bufferReopenedAfterPrice = false;
      // 새 카드가 시작됐으니 직전 카드에서 못 소비한 pendingSplit 플래그는 폐기합니다.
      // (정상 플로우에서는 flush 시점에 이미 소비됐을 것이지만, name 라인이 누락된 경우
      // 다음 무관한 카드까지 split 으로 오염되는 걸 막기 위한 안전장치.)
      pendingSplit = false;
      continue;
    }

    // 분리배송 마커: status 검사 뒤, noise 검사 앞.
    // 같은 라인이 noiseLineRegex 에는 없지만, "분리 배송" 단독 라인이 nameBuffer 에 들어가면
    // 다음 상품 이름 앞에 "분리 배송" 이 붙어 나올 수 있으니 반드시 continue 로 흘려버립니다.
    if (splitMarkerRegex.test(line)) {
      pendingSplit = true;
      continue;
    }

    // 액션/노이즈 라인 스킵 (UI 버튼 단독 라인, 꼬리에 떨어진 날짜 조각)
    if (noiseLineRegex.test(line)) continue;

    // 이름 후보: 한글이 있거나 영문 알파벳이 3자 이상 있는 라인.
    //
    // 2026-04-24 (필터 강화): 기존 조건 `길이 ≥ 2 && 한글/영문 1자 이상` 은
    //   "oo 장바구니 담기" → trailingButton 제거 후 "oo" (영문 2자) → nameBuffer 에 오염 투입
    //   "a8 202"         → 그대로 통과 → nameBuffer 에 가비지 투입
    // 같은 OCR 부스러기까지 상품명 조각으로 받아들이는 문제가 있었습니다. 쿠팡 실제 상품명은
    // 거의 항상 한글이 포함되거나, 순수 영문 브랜드라면 3자 이상("BFL", "HANYO", "PUMA")
    // 이기 때문에 `한글이 있거나 || 영문 3자+` 로 좁혀도 정상 상품명은 모두 보존됩니다.
    const stripped = stripTags(line);
    if (stripped.length >= 2) {
      const koreanCount = (stripped.match(/[가-힣]/g) || []).length;
      const letterCount = (stripped.match(/[A-Za-z]/g) || []).length;
      // 2026-04-24: 디지트 비율 가드.
      //   "로 2121" 같이 1글자 한글 + 숫자만 뭉친 OCR 잔류가 nameBuffer 에 들어가 soft-commit
      //   단계에서 price=0 placeholder 카드로 emit 되는 회귀(004) 가 있어, 전체 글자 중 숫자가
      //   절반 이상이면 noise 로 버립니다.
      const nonSpaceLen = stripped.replace(/\s+/g, '').length;
      const digitCount = (stripped.match(/\d/g) || []).length;
      const mostlyDigits = nonSpaceLen > 0 && digitCount / nonSpaceLen >= 0.5;
      // 2026-04-25: 단일 한글(1 글자) 만 포함한 라인은 icon OCR 노이즈일 확률이 압도적.
      //   실측 케이스: 002의 "구0 ? ~", 일반 쿠팡 앱 하단 아이콘이 `구`/`무` 한 글자로 찍힘.
      //   정상 한국 상품명 라인은 2+ 한글 어휘가 포함됨 (브랜드·단위 어휘 제외 시에도).
      //   순수 영문 브랜드(BFL, HANYO) 3자+는 letterCount 로 별도 허용.
      const qualifies = koreanCount >= 2 || letterCount >= 3;
      if (!mostlyDigits && qualifies) {
        // priceLine 매칭 후 첫 name push 는 "다음 카드 시작" 의 신호. end-of-loop phantom
        // 가드에서 사용. buffer 가 비었다가 채워지는 transition 만 추적.
        if (nameBuffer.length === 0 && lastStatusHadPrice) {
          bufferReopenedAfterPrice = true;
        }
        nameBuffer.push(stripped);
      }
    }
  }

  // 끝까지 가격을 못 만났지만 이름만 남은 케이스: 이전에는 "가격 없이 상품을 만들면 가계부에
  // 0원 상품이 생겨 더 혼란스러움" 이라는 이유로 버렸는데, 실제-이미지 검증에서 이 drop 정책이
  // **가격이 OCR 에서 증발한 카드를 통째로 잃어버리는 가장 큰 원인** 으로 확인됐습니다.
  // (예: 222018.png 의 마지막 카드 "천연 유기농 아로마오일" → OCR 이 "5290원" 을 "5208" 로
  // 인식하고 "원" 을 빠뜨려 priceLineRegex 실패 → nameBuffer 만 남은 채 루프 종료 → 통째 drop).
  //
  // 루프 안의 status 라인 soft-commit 정책 (위 참조) 과 동일한 근거로 마지막 카드도 동일하게
  // price=0 placeholder 로 살려 냅니다. statusCardsStarted 가드로 pre-amble (아직 첫 status
  // 가 나오기 전 단계) 의 잔존 nameBuffer 까지 부풀리지 않도록 방어합니다.
  //
  // 2026-04-25 phantom 방지 — **end-of-loop soft-commit 자체를 제거**.
  //
  // 배경: 쌓였던 두 가지 시나리오가 모두 phantom 으로 확인:
  //   · status 안에서 price 한 번도 없이 buffer 만 쌓임 → 잘린 fragment/추천 섹션 (002 "벨로티")
  //   · price flush 이후 새로 쌓인 buffer → icon OCR 노이즈 (003 "의슬뇨")
  // legit 해 보였던 "첫 카드 price 실패" 케이스 (222018 aroma) 는 실측상 priceLineFallback 이
  // "장바구니 담기" 앵커로 5290원을 이미 잡아주기 때문에 end-of-loop 에 도달하지 않음.
  //
  // 즉 현재 샘플 23장 기준 end-of-loop soft-commit 은 **항상 phantom**. 완전 제거해 phantom 0.
  // 만약 미래에 legit cut-off 마지막 카드가 발견되면, priceLineFallback 앵커 어휘를 넓히거나
  // AI 보정 경로로 회수하는 쪽이 더 정확 (phantom 비용 > 복구 이득).
  //
  // ※ lastStatusHadPrice / bufferReopenedAfterPrice 플래그는 현재 소비처가 없어졌지만 디버깅
  //   추적용으로 남겨둘지 여부는 차후 판단. 지금은 변수 선언만 남기고 조건문은 제거.
  void lastStatusHadPrice;
  void bufferReopenedAfterPrice;

  if (results.length === 0) {
    return [{ mall, itemName: null, price: null, date: orderDate, rawText, statusText: rawText }];
  }

  // ───────── 분리배송 후처리 병합 ─────────
  //
  // `_splitDelivery` 가 붙은 항목들은 **(date, price) 기준으로 묶어** 대표 1건만 남깁니다.
  //
  // ── 2026-04-24 정책 변경 (사용자 실사용 버그 리포트) ──────────────────────────────────
  //
  // 이전 정책: 같은 (date, name, price) 인 split-delivery 카드들을 찾아 quantity 를 합산.
  //           예: 29,490 원 × qty 1 카드 3개 → 29,490 원 × qty 3 로 병합 → 총액 88,470 원.
  //
  // 새 정책:  중복 카드를 **drop 만** 하고 quantity 는 **합산하지 않음**.
  //           예: 29,490 원 × qty 1 카드 3개 → 29,490 원 × qty 1 로 1건만 남김. 총액 29,490 원.
  //
  // 변경 이유 (사용자 피드백):
  //   "분리배송은 29,400원 안에 포함되어있는거거든? 각각 따로따로가 아니라 29,400원 딱 이
  //    가격에 저거 세개를 보내는 거라서"
  //   → 쿠팡 분리배송 카드에 표시되는 가격은 **주문 총액** 을 각 배송 카드에 반복 노출한
  //     것이지 카드당 별도 결제가 아님. 합산하면 실제 결제 금액의 N 배로 부풀어 오름.
  //
  // 그룹 키를 (date, name, price) 가 아닌 (date, price) 로 바꾼 이유:
  //   OCR 에서 상품명이 배송 카드별로 조금씩 달리 인식(분리배송 마커 substring 이 다르게
  //   찍힘, 이름 꼬리 잘림 등) 돼 이름 기준 그룹핑이 자주 실패합니다. 같은 날짜 + 같은 가격의
  //   _splitDelivery 카드는 쿠팡 실사용 맥락에서 동일 주문일 확률이 압도적입니다.
  //   이름은 **가장 긴(= 가장 많이 살아남은) 쪽** 을 대표로 채택해 정보 유실을 최소화.
  const merged: PurchaseOCRResult[] = [];
  const groupIndex = new Map<string, number>(); // key → merged[] 의 인덱스
  for (const r of results) {
    if (r._splitDelivery) {
      const key = `${r.date ?? ''}|${r.price ?? ''}`;
      const existingIdx = groupIndex.get(key);
      if (existingIdx !== undefined) {
        const prev = merged[existingIdx];
        // 더 긴(정보 살아남은) 이름으로 대표 카드의 이름을 교체. quantity 는 유지.
        if ((r.itemName ?? '').length > (prev.itemName ?? '').length) {
          prev.itemName = r.itemName;
        }
        continue; // 중복 drop — 합산 X.
      }
      groupIndex.set(key, merged.length);
    }
    // 내부 플래그 제거 후 공개 결과로 push
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _splitDelivery, ...clean } = r;
    merged.push(clean);
  }

  return merged;
}

/**
 * 네이버쇼핑 주문내역 캡쳐의 1차 파서. 쿠팡 파서와 의도적으로 깊이가 다릅니다.
 *
 * 정책 (CLAUDE.md §9.1, docs/OCR_Architecture_Decision.md, docs/Naver_OCR_Parsing_Strategy.md §3):
 *   - 신규 플랫폼은 **얕은 1차 파서 + 이른 AI 보정** 조합으로 간다.
 *   - 1차 파서 책임: 카드 단위 분리 / 날짜·상태·상품명·가격의 **대략적** 추출 /
 *     명백한 쓰레기 라인 제거. 여기까지.
 *   - 책임지지 않는 것: OCR 단위 복원, 분리배송, 상품명 정교 정정, 부수금액 정밀 분류,
 *     fold 그룹핑, 광고 섹션 깊은 필터링. 모두 Gemini Vision 보정에 위임한다.
 *   - 쿠팡 파서의 어휘 리스트/regex 묶음을 복제하지 않는다 — 회귀 가능성과 유지비 모두 손해.
 *
 * 출력 (PurchaseOCRResult):
 *   - itemName / price / date / statusText 의 best-effort 값
 *   - priceOcrFailed: name 후보가 있는데 가격을 못 잡으면 true → ocrQuality 가 bad 분류 → AI 호출
 *   - folded / itemCountHint / sectionTotal: 화면에 명시된 fold 신호가 있을 때만 표면화 (UI 가
 *     "접힌 주문 / 외 N건 숨김" 안내를 띄우는 정직성 메타. 추정 X.)
 *
 * 의도적으로 안 한 것 (Codex 후속 §15 작업으로 분리):
 *   - section-first per-card 정확 분리. 현재는 status anchor 기반 평면 추출.
 *   - 같은 결제로 묶인 다중 카드 ("총 N건 주문 접기") 그룹핑.
 *   - "추가상품" 배지의 add-on 합산.
 *   - 광고 섹션 ("관심 있을만한 상품 AD") 정확 식별.
 */
export function parseNaverOrderText(rawText: string): PurchaseOCRResult[] {
  const mall = '네이버';

  // 카드 시작 신호 — 네이버 주문 카드 상단의 상태 라벨.
  //
  // 기본은 literal 라벨을 우선 신뢰하되, 실측에서 반복된 **안전한 OCR 변형**만 제한적으로
  // 흡수한다. 목적은 "카드 자체를 못 잡아 parser missed 로 빠지는" 케이스 완화이지,
  // 임의의 한글 문장을 status 로 과감히 추정하는 것이 아니다.
  //
  // 허용 기준:
  // - 실제 GT/console 에서 반복 관찰된 변형만
  // - 길고 특이한 status ("구매확정완료", "반품환불완료", "상품준비중") 위주
  // - 일반 상품명/설명 문장에서 우연히 나올 가능성이 낮은 조합만
  const STATUS_KEYWORDS = [
    '구매확정완료', '결제완료', '결제취소', '취소완료', '환불완료',
    '반품완료', '반품환불완료', // 2026-04-27 — web/184818 GT 관찰 (한일의료기 전기매트). docs/Naver_OCR_Pattern_Catalog §3.
    '교환완료', // 2026-04-27 — web3/2.59.31 GT 관찰 (아유아유 페이스 제모기). literal 추가.
    '배송완료', '배송중', '주문완료', '상품준비중',
  ];
  const STATUS_VARIANT_REGEXES = [
    /구\s*매\s*확\s*정\s*완\s*료/,
    /구\s*확정\s*완료/,
    /구\s*매확정\s*완료/,
    /매화정오/, // docs/Naver_OCR_Pattern_Catalog §3 실측
    /상품\s*준비\s*중/,
  ];
  const hasStatusKeyword = (line: string): boolean =>
    STATUS_KEYWORDS.some((keyword) => line.includes(keyword)) ||
    STATUS_VARIANT_REGEXES.some((regex) => regex.test(line));

  // 라인 정규화 — 쿠팡과 같은 가벼운 전처리
  let lines = rawText
    .split('\n')
    .map((line) => line.replace(/^[\s|ㅣ<\-—©]+/, '').trim())
    .filter((line) => line.length > 0);

  // ── 광고 섹션 제거 (모바일 캡쳐 한정 명시적 마커) ──────────────────────────
  //
  // 모바일 네이버 앱은 사용자 주문 사이에 "관심 있을만한 상품 AD" 광고 섹션을 끼워 넣음.
  // 광고 카드의 가격이 "30% 21,000원" 형태로 보여 메인 가격 매칭에 새 들어가면 가짜 카드가
  // 생긴다. literal 마커("관심 있을만한 상품" / "관심 있는만한 상품") ~ 다음 카드의 status
  // 키워드 사이를 통째로 컷.
  //
  // 정책: 명시적 UI 라벨이라 §5 "OCR 변형 wordlist 하드코딩"에 해당하지 않음. 광고 섹션 안의
  // 카드 정확도 측정도 무의미하므로(어차피 사용자 거래 아님) 컷이 안전.
  const AD_START_REGEX = /관심\s*있(?:을|는)\s*만?한\s*상품/;
  const filtered: string[] = [];
  let inAd = false;
  for (const line of lines) {
    if (!inAd) {
      if (AD_START_REGEX.test(line)) { inAd = true; continue; }
      filtered.push(line);
    } else if (hasStatusKeyword(line)) {
      inAd = false;
      filtered.push(line);
    }
    // inAd === true 이고 status 키워드가 아니면 그냥 버림.
  }
  lines = filtered;

  // 부수금액 라인 — 메인 가격으로 오인하면 안 되는 명백한 쓰레기. 컨텍스트 키워드로만 매칭.
  // 2026-04-27: "최대 N원" 의 끝 "원" 의무 제거. OCR 가 "원" 을 "8" 로 변형해 "최대 2508" 형태로
  // 들어오는 케이스(web2/10.01.50)도 aux 로 인식되어야 가짜 itemName "최대 2508" 누수 방지.
  // 컨텍스트 키워드 "최대 " 가 선두에 있으면 단위가 "원" 이든 "8" 이든 거의 확실히 보상 안내.
  // 2026-04-27: 사용자/사이트 보상 라인 추가:
  //   "@72원 적립 완료", "@1.685원 적립 완료", "@72 적립" 형태가 web/web2 에서 반복 출현.
  //   `@` 기호 + 숫자 + 적립 anchor 를 가진 라인은 메인 가격이 아니라 적립 보상이라
  //   `extractPrice` 에서 메인 가격으로 새지 않게 컷.
  const isAuxLine = (line: string): boolean =>
    /적립|리뷰\s*쓰|한달(?:사용)?리뷰|다시\s*(?:담기|묶기|구매)|^\s*\+\s*[\d,]+|^\s*최대\s+[\d,]+|^\s*@/.test(line);

  // ── UI 라인 식별 (literal 라벨 — name 후보에서 제외) ─────────────────────
  //
  // 네이버 캡쳐의 카드 안 버튼/UI 텍스트는 한글이 충분히 들어 있어 thin 파서의 "한글 ≥ 2"
  // 조건을 그대로 통과해 상품명으로 빨려들어가는 회귀가 있음 (예: "상세보기", "장바구니
  // 담기", "바로 구매하기"). 이 라인들은 모두 **고정 UI 라벨** — OCR 변형이 아니라 화면에
  // 항상 같은 단어로 찍히므로 literal 매칭으로 식별 가능.
  //
  // §5 정책: "OCR 변형 wordlist 하드코딩 금지" — 이 정책은 "포켓커피" 같은 상품명/브랜드
  // 변형 사전을 막는 것. UI 라벨은 OCR 변형과 다른 범주이고, 사전적인 단어가 아니라 네이버
  // UI 내부 고정 텍스트라 회귀 부담이 없음. 단, 새 라벨 추가는 신중히.
  const UI_LABEL_REGEX = new RegExp('^(?:' + [
    '상세\\s*보기',
    '장바구니\\s*담기?',
    '바로\\s*구매(?:하기)?',
    '판매자\\s*정보',
    '판매자\\s*/\\s*문의',
    '문의(?:\\s*하기)?',
    '배송\\s*조회',
    '리뷰\\s*쓰기',
    '한달\\s*리뷰\\s*쓰기',
    '한달\\s*사용\\s*리뷰',
    '구매\\s*하기',
    '내일\\s*배송',
    '오늘\\s*배송',
    '추가\\s*상품',
    '정기\\s*구독(?:\\s*재신청)?', // 2026-04-27 — web3/3.01.16, 16_59_51 (정기구독 자체가 sub-badge)
    '영수증\\s*조회',         // 2026-04-27 — web3/3.01.16 (선물하기 카드의 액션 버튼)
    '교환\\s*정보',           // 2026-04-27 — web3/2.59.31 (교환완료 카드의 액션 버튼)
    '주문\\s*상세\\s*보기',   // 2026-04-27 — web3 다수 페이지 우측 상단 링크
    '구매\\s*후기',           // 2026-04-27 — web3 long page 의 섹션 헤더
    '뷰\\s*작성',             // 2026-04-27 — web3/16_59_51 ("리뷰 작성" 의 "리" 깨진 변형)
    '리뷰\\s*작시',           // 2026-04-27 — web3/16_59_51 ("리뷰 작성" 의 "성" 깨진 변형)
    '무료\\s*체험',           // 2026-04-27 — web3/16_59_51 (정기구독 카드 sub-badge)
    '쇼핑학개론',             // 2026-04-27 — mobile/09:46-06 (광고 섹션 제목)
  ].join('|') + ')\\s*>?\\s*$');

  const isUiLabelLine = (line: string): boolean => UI_LABEL_REGEX.test(line);

  // UI 통합 라인 — OCR 가 두 UI 링크를 한 줄로 합쳐 뱉는 케이스 (anchored UI_LABEL_REGEX 가 못 잡음).
  // 측정 결과 다수 발견된 패턴: "상세보기 > 판매자정보/문의", "상세보기 > 판매자정보 / 문의",
  //   "는 상세보기 > 판매자정보/문의" (선두 OCR garbage 동반), "장바구니 담기 바로 구매하기" (모바일).
  //
  // 2026-04-27 측정 보강:
  //   `a7 per                 판매자정보/문의 >` 처럼 선두 OCR 가비지 + 단일 UI 토큰만 있는 케이스.
  //   compound 가 아니라도 라인의 의미 있는 한글 부분이 사실상 UI 토큰뿐인 라인은 컷한다.
  //   기준: 한글을 모두 모았을 때 "판매자정보문의" / "장바구니담기" / "바로구매하기" 와 정확 일치.
  const isUiCompoundLine = (line: string): boolean => {
    const cleaned = line.replace(/\s/g, "");
    if (
      /(상세보기|상세\s*보기).*(판매자|문의|배송조회)/.test(cleaned)
      || /(판매자|문의|배송조회).*(상세보기|상세\s*보기)/.test(cleaned)
      || /(장바구니).*(바로\s*구매)/.test(cleaned)
      || /(바로\s*구매).*(장바구니)/.test(cleaned)
    ) return true;
    // 선두 OCR 가비지 동반 단일 UI 토큰 — 한글만 추출해 정확 매칭.
    const hangulOnly = (line.match(/[가-힣]/g) ?? []).join("");
    const UI_HANGUL_ONLY = new Set([
      "판매자정보문의",
      "판매자문의",
      "장바구니담기",
      "바로구매하기",
      "상세보기",
      "배송조회",
      "한달리뷰쓰기",
      "한달사용리뷰",
      "리뷰쓰기",
      "주문상세보기",
    ]);
    if (UI_HANGUL_ONLY.has(hangulOnly)) return true;
    return false;
  };

  // ── itemName leading garbage 제거 (2026-04-27 측정 기반) ────────────────────
  //
  // OCR 이 상품 썸네일 / 배지 / 옵션 prefix 를 짧은 라틴/숫자/기호로 변환해 상품명 앞에 붙이는
  // 케이스가 측정에서 다수 관찰됨:
  //   "= 이 헬스프랜드 슈퍼 비타민..."   → "= 이 " 가비지
  //   "% 샘물웰빙 지리산..."             → "% " 가비지
  //   "ooooooD 신명"                     → "ooooooD " 가비지 (Megabox 로고 OCR 잔류)
  //   "ditryx' 영화예매-..."             → "ditryx' " 가비지 (브랜드 로고 OCR 잔류)
  //   "1g, 오늘좋은 초코칩쿠키..."       → "1g, " 가비지 (이미지 옵션 잔류)
  //   "[5] 고왕이슈 = (30캔)"            → "[5] " 가비지
  //   "\"Wy 게임파드 <0>컨트롤러..."     → "\"Wy " + symbol garbage
  //
  // 정책: 한글이 본문 핵심이라 가정. 라인 선두에서 한글까지 도달하기 전의 짧은 (≤8자)
  //   라틴/숫자/기호 토큰을 컷. 컷 후 본문이 한글 ≥ 2 살아있으면 OK, 아니면 원본 유지.
  //
  // §5 "OCR 변형 wordlist 하드코딩 금지" 와의 관계: 이 함수는 단어 사전이 아니라 "한글 시작 전
  //   까지의 짧은 garbage 컷" 이라는 구조적 규칙. 특정 상품명/브랜드를 하드코딩하지 않음.
  const stripLeadingGarbage = (name: string): string => {
    if (!name) return name;
    let cleaned = name;
    // 1단계: 비-한글 선두 가비지 컷 (12자 이내, 본문 한글 ≥ 2 검증).
    //   2026-04-27 한도 8 → 12 완화: "LS i015 " (8자) 보더 케이스 + 모바일 썸네일이 더 긴
    //   라틴/숫자 잔류로 OCR 되는 변형 ("ER Sm 도자A 220UY ...") 까지 흡수. 정상 영문 브랜드
    //   ("DORIS RT 4007", "AMD 라이젠5 5600") 는 이미 한글이 시작 위치에 없어 첫 한글 거리가
    //   12자 넘으므로 영향 없음.
    const m = cleaned.match(/[가-힣]/);
    if (m && m.index !== undefined && m.index > 0 && m.index <= 12) {
      const after = cleaned.slice(m.index).trim();
      const hangulCount = (after.match(/[가-힣]/g) ?? []).length;
      if (hangulCount >= 2) cleaned = after;
    }
    // 2단계: 모바일/web2 sub-badge 잔류 제거. OCR 가 "N내일배송" 을 "30때일배송",
    //   "대 30때일배송", "갤 국배배송" 같이 한글-라틴 혼합 변형으로 뱉는 케이스가 측정에서
    //   반복 관찰됨. literal sub-badge + 흔한 OCR 변형까지 컷:
    //     "내일배송"/"오늘배송"/"국내배송"/"내일배송"/"이른배송"/"30때일배송"/"국배배송"
    //   배지 키워드 + 그 직전의 1~3자 잔류까지 함께 제거.
    cleaned = cleaned.replace(
      /^[^가-힣]{0,3}(?:[가-힣]{1,3}\s+)?(?:내일배송|오늘배송|국내배송|이른배송|국배배송|당일출고|국내배송\s*pack|당일배송|새벽배송|30때일배송|때일배송)\s*/u,
      "",
    ).trim();
    // 3단계 (2026-04-27 측정 기반 추가): 한글 1글자 + 공백 + 본문 패턴.
    //   네이버 list view 에서 OCR 가 상품 옵션/배지/썸네일 잔류를 1글자 한글 토큰으로
    //   상품명 앞에 흘리는 케이스가 매우 빈번 (49장 중 14장 관찰):
    //     "을 띠테르마그네틱 독서대..."  → "띠테르마그네틱 독서대..."
    //     "개 체크미 다이어트 피팅..."   → "체크미 다이어트 피팅..."
    //     "에 강블리 블링 휴..."         → "강블리 블링 휴..."
    //     "를 독거미 Aula 1108..."       → "독거미 Aula 1108..."
    //     "이 헬스프랜드 슈퍼..."        → "헬스프랜드 슈퍼..."
    //     "까 비닐봉투 재활용..."        → "비닐봉투 재활용..."
    //     "는 상세보기..."               → 이미 UI label 컷에서 처리
    //     "주 1 아유아유 콜링턴..."      → "1 아유아유 콜링턴..." (다음 단계에서 숫자 prefix)
    //
    // 안전장치:
    //   - **공백으로 분리된** 1글자 한글만 (붙어 있으면 합법 단어 일부)
    //   - 본문 한글 ≥ 4 — 짧은 정상 상품명을 갉아먹지 않음
    //   - "휴 무형광 롤화장지" 같이 정상 1글자 시작은 GT 에 거의 없으므로 false positive 위험 낮음.
    //     ("휴 무형광"·"개 별 포장" 처럼 첫 한글이 의미를 갖는 경우는 GT 에 있다면 회귀가 측정으로
    //     드러나므로 임계 보수적으로 4 한글 유지)
    cleaned = cleaned
      .replace(/^[가-힣]\s+(?=[가-힣]{2,})/u, "")
      .trim();
    // 4단계 (2026-04-27): trailing UI 잔류 + trailing 라틴/숫자 짧은 토큰 컷.
    //   사용자 보고 "상세보기 > 판매자정보/문의" 가 itemName 끝에 합쳐진 라인. isUiCompoundLine
    //   은 라인 전체가 UI 일 때만 컷하고 합성된 라인은 itemName 으로 흘러가서 sim 손실.
    //   여기서 끝부분에 붙어 있으면 잘라내. 한글 본문은 보존.
    cleaned = cleaned
      .replace(/\s*상세\s*보기\s*>?\s*[|\\/·:_-]?\s*판매자\s*정보\s*\/?\s*문의\s*>?\s*$/u, "")
      .replace(/\s*상세\s*보기\s*>?\s*$/u, "")
      .replace(/\s*판매자\s*정보\s*\/?\s*문의\s*>?\s*$/u, "")
      .trim();
    // 5단계 (2026-04-27): 끝 trailing 짧은 라틴/숫자/기호 잔류 (3~6자) 정리.
    //   예: "...스위치 RIG25" 의 "RIG25", "...피팅기 ew" 의 " ew", "...250\\/00 초고…" 의 꼬리
    //   안전장치:
    //     - 모델명 (`CRP-HFT0611FR`, `xbox컨트롤러 PC게임패드`) 같이 한글에 인접한 정상 라틴은
    //       보호하기 위해 **마지막 토큰이 공백으로 분리**되고 길이 ≤ 6 일 때만 컷.
    //     - 정상 모델명은 보통 한글 단어와 하이픈 / 붙여쓰기 형태라 공백으로 분리된 짧은 라틴
    //       꼬리는 거의 OCR 잔류로 봄. 그래도 본문 한글 ≥ 4 보호선 유지.
    const trailing = cleaned.match(/\s+([A-Za-z][A-Za-z0-9]{2,5})\s*$/);
    if (trailing) {
      const head = cleaned.slice(0, trailing.index).trim();
      if ((head.match(/[가-힣]/g) ?? []).length >= 4) {
        cleaned = head;
      }
    }
    // 컷 후 본문이 너무 짧으면 원본 유지
    if ((cleaned.match(/[가-힣]/g) ?? []).length < 2) return name;
    return cleaned;
  };

  // 메인 가격: "X,XXX원" 패턴. 부수금액 라인은 제외하지만 그 이상의 정밀도는 시도하지 않는다.
  const extractPrice = (line: string): number | null => {
    if (isAuxLine(line)) return null;
    const m = line.match(/([\d,]+)\s*원/);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  // 날짜: 풀(YYYY.M.D) 또는 단축(M.D) 형식. 단축은 결제/주문 키워드 (또는 그 OCR 변형) 동반 시에만.
  //
  // 2026-04-27 측정 기반 보강 (49장 / 223 카드 / missing_date 74건 분석):
  //
  //   네이버 list view 의 가격+날짜는 같은 라인에 합쳐져 출력되며, Tesseract 가 dot/콜론을 거의
  //   대부분 공백·숫자로 흘려서 raw text 가 다음과 같이 매우 압축된 형태로 도착한다 (실측):
  //
  //     `4900원 210 1202긍제`            → 4,900원 · 2.10 12:02 결제
  //     `13,9008 3 24 1526 글제`         → 13,900원 · 3.24 15:26 결제 (`원→8`)
  //     `2025 8 10 1011 즐제`            → 2025.8.10 10:11 결제 (full year)
  //     `38,700원 2025 7.30 16:19 글제`  → 38,700원 · 2025.7.30 16:19 결제
  //     `47 1129 즐제`                   → 4.7 11:29 결제
  //     `17.000원 2 6 045 27`            → 17,000원 · 2.6 04:54:27 (키워드 자체가 증발)
  //     `5,000원 21211527`               → 5,000원 · 2.12 11:52:7 (모두 한 덩어리로 압축)
  //
  // 결제·주문 OCR 변형 어휘:
  //   결제 → 결재 / 즐제 / 글제 / 긍제 / 금지 / 결자
  //   주문 → 주묘 / 수문 / 우문 / 주둔 / 주몬 / 주의
  //
  //   문자 클래스로 흡수: `[결즐글긍금기][제재지자]` / `[주수우][문묘몬둔의]`
  //   고정 literal 보다 정밀하지만, "지자제" 같은 시사 단어가 가격 라인에 섞일 가능성 거의 0
  //   이라 false positive 위험은 낮다. 게다가 가격 + 숫자 패턴 컨텍스트 안에서만 매칭한다.
  //
  // §5 "OCR 변형 wordlist 하드코딩 금지" 와의 관계: 어휘 자체의 의미 패턴이 아니라 "결제·주문
  //   2글자 한글 단어의 전형적 OCR 깨짐 변형 집합" 이라 구조적 신호. 새 변형이 자주 보이면
  //   위 char class 한 곳만 확장하면 된다.
  const today = new Date();
  const inferYear = (m: number): number =>
    m > today.getMonth() + 1 ? today.getFullYear() - 1 : today.getFullYear();

  // 결제·주문 키워드의 OCR 변형까지 흡수하는 anchor.
  // - 한글 결제: 결자/즐제/글제/긍제/금지/결재/검제/걸제/갈제
  // - 한글 주문: 주문/주묘/수문/우문/주둔/주몬/주의
  // 2026-04-27: 첫 글자 클래스에 검/걸/갈 추가 (모바일 OCR 변형 다수 관찰).
  const PAY_KEYWORD_REGEX = /(?:[결즐글긍금검걸갈][제재지자]|[주수우][문묘몬둔의])/;

  const extractDate = (line: string): string | null => {
    if (isAuxLine(line)) return null;
    // 풀 날짜 — YYYY.M.D 형식 (separator 는 점/공백/한글 모두 허용)
    const full = line.match(/(20\d{2})[^\d]+(1[0-2]|[1-9])[^\d]+(3[01]|[12]\d|[1-9])/);
    if (full) {
      return `${full[1]}-${full[2].padStart(2, '0')}-${full[3].padStart(2, '0')}`;
    }
    // 압축 풀 날짜 — "2025728", "202521", "2025.73.19:04" 처럼 구분점 일부가 증발한 형태.
    const packedFull = line.match(/(20\d{2})\s*(1[0-2]|0?[1-9])\s*(3[01]|[12]\d|0?[1-9])(?=[^\d]|$)/);
    if (packedFull) {
      return `${packedFull[1]}-${packedFull[2].padStart(2, "0")}-${packedFull[3].padStart(2, "0")}`;
    }

    // Y-anchored 패턴들 (hasPayKeyword 무관) — `20\d{2}` 풀 연도 + 구조적 시각 (`\d{1,2}[:.]\d{2}` 또는
    // `\d{4}` HHMM) anchor 가 있어 false positive 위험이 매우 낮다. 키워드 변형이 OCR 에서 완전히
    // 깨진 케이스 (예: "주문" → "210850" 같은 숫자 잡음) 도 잡기 위해 키워드 체크 밖에 둔다.
    const hhmmValid = (hh: number, mn: number) => hh >= 0 && hh <= 23 && mn >= 0 && mn <= 59;

    // 0a. Y.MD.HH:MM — 풀 연도 + M+D 압축 + 시각.
    //     예: "2025.73.19:04 주문" = 2025-07-03, "2023.16.16:23 주문" = 2023-01-06.
    //     MD 길이별로 split: 2자리=M(1)+D(1), 3자리=M(1)+D(2) 또는 M(2)+D(1), 4자리=M(2)+D(2).
    const ymdCompact = line.match(/(?:^|[^\d])(20\d{2})\s*\.\s*(\d{2,4})\s*\.\s*\d{1,2}[:.]\d{2}/);
    if (ymdCompact) {
      const yyyy = ymdCompact[1];
      const md = ymdCompact[2];
      const tries: Array<[number, number]> = [];
      if (md.length === 2) tries.push([Number(md[0]), Number(md[1])]);
      else if (md.length === 3) {
        tries.push([Number(md[0]), Number(md.slice(1))]);
        tries.push([Number(md.slice(0, 2)), Number(md[2])]);
      } else if (md.length === 4) {
        tries.push([Number(md.slice(0, 2)), Number(md.slice(2))]);
        tries.push([Number(md[0]), Number(md.slice(1, 3))]);
      }
      for (const [m, d] of tries) {
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          return `${yyyy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        }
      }
    }

    // 0b. YM.D.HH:MM — 풀 연도와 M 이 압축 + . + D + . + 시각.
    //     예: "20256.26.09:48 주문" = 2025-06-26, "20219.4.06:38 주문" = 2021-09-04.
    const ymCompact = line.match(/(?:^|[^\d])(20\d{2})(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*\d{1,2}[:.]\d{2}/);
    if (ymCompact) {
      const yyyy = ymCompact[1];
      const m = Number(ymCompact[2]);
      const d = Number(ymCompact[3]);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${yyyy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }

    // 0c. Y+MD 압축 (Y 와 M.D 사이 dot 둘 다 누락) + dot + HH:MM.
    //     예: "2025513.17:156 주문" = 2025-05-13, "2025728.11:02주문" 도 같이 매치.
    const ymdNoDot = line.match(/(?:^|[^\d])(20\d{2})(\d{2,4})\s*\.\s*\d{1,2}[:.]\d{2}/);
    if (ymdNoDot) {
      const yyyy = ymdNoDot[1];
      const md = ymdNoDot[2];
      const tries: Array<[number, number]> = [];
      if (md.length === 2) tries.push([Number(md[0]), Number(md[1])]);
      else if (md.length === 3) {
        tries.push([Number(md[0]), Number(md.slice(1))]);
        tries.push([Number(md.slice(0, 2)), Number(md[2])]);
      } else if (md.length === 4) {
        tries.push([Number(md.slice(0, 2)), Number(md.slice(2))]);
        tries.push([Number(md[0]), Number(md.slice(1, 3))]);
      }
      for (const [m, d] of tries) {
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          return `${yyyy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        }
      }
    }

    // 0d. YM.DHHMM — 키워드 OCR 깨진 케이스. Y + M + . + D + HHMM (시간 앵커가 시각 검증 통과하면).
    //     예: "20257. 210850" = 2025-07-21 08:50.  HHMM 검증 (0000-2359) 으로 false positive 방어.
    const ymDotDHm = line.match(/(?:^|[^\d])(20\d{2})(\d{1,2})\s*\.\s*(\d{1,2})(\d{4})(?=[^\d]|$)/);
    if (ymDotDHm) {
      const yyyy = ymDotDHm[1];
      const m = Number(ymDotDHm[2]);
      const d = Number(ymDotDHm[3]);
      const hh = Number(ymDotDHm[4].slice(0, 2));
      const mn = Number(ymDotDHm[4].slice(2));
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && hhmmValid(hh, mn)) {
        return `${yyyy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }

    // 0d2. 가격원 + 압축 MD + HHMMSS — pay keyword 가 OCR 에서 완전히 잡음으로 깨진 케이스.
    //     예: "18,300원 120 000027" = 18,300원 + 1.20 00:00:27, "39,800 원! 122 211227" = 1.22.
    //     가격 anchor (`[\d,]+\s*[원8]`) + 시간 검증 (HH<24, MM<60) 으로 false positive 방어.
    const priceMdHm = line.match(/[\d,]+\s*[원8][^\d]+(\d{2,4})\s+(\d{4,6})\s*$/);
    if (priceMdHm) {
      const md = priceMdHm[1];
      const hhmmss = priceMdHm[2];
      const hh = Number(hhmmss.slice(0, 2));
      const mn = Number(hhmmss.slice(2, 4));
      if (hhmmValid(hh, mn)) {
        const tries: Array<[number, number]> = [];
        if (md.length === 2) tries.push([Number(md[0]), Number(md[1])]);
        else if (md.length === 3) {
          tries.push([Number(md[0]), Number(md.slice(1))]);
          tries.push([Number(md.slice(0, 2)), Number(md[2])]);
        } else if (md.length === 4) {
          tries.push([Number(md.slice(0, 2)), Number(md.slice(2))]);
          tries.push([Number(md[0]), Number(md.slice(1, 3))]);
        }
        for (const [m, d] of tries) {
          if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            return `${inferYear(m)}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          }
        }
      }
    }

    // 0e. YMDHHMM 완전 압축 — 키워드 OCR 깨진 + 모든 separator 누락. 11~12 자리 통째.
    //     예: "20255131716 58" = 2025-05-13 17:16, "20255101555" = 2025-05-10 15:55.
    //     Y(4) + M(1-2) + D(1-2) + HH(2) + MM(2). MD 분할 모호하므로 모든 가능 split 시도 + HHMM 검증.
    const yFullPack = line.match(/(?:^|[^\d])(20\d{2})(\d{7,8})(?=[^\d]|$)/);
    if (yFullPack) {
      const yyyy = yFullPack[1];
      const tail = yFullPack[2];
      // tail 끝 4자리는 HHMM 으로 가정. 앞 3-4자리가 MD.
      const hhmmStr = tail.slice(-4);
      const mdStr = tail.slice(0, -4);
      const hh = Number(hhmmStr.slice(0, 2));
      const mn = Number(hhmmStr.slice(2));
      if (hhmmValid(hh, mn)) {
        const tries: Array<[number, number]> = [];
        if (mdStr.length === 3) {
          tries.push([Number(mdStr[0]), Number(mdStr.slice(1))]);
          tries.push([Number(mdStr.slice(0, 2)), Number(mdStr[2])]);
        } else if (mdStr.length === 4) {
          tries.push([Number(mdStr.slice(0, 2)), Number(mdStr.slice(2))]);
          tries.push([Number(mdStr[0]), Number(mdStr.slice(1, 3))]);
        }
        for (const [m, d] of tries) {
          if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            return `${yyyy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          }
        }
      }
    }

    const hasPayKeyword = PAY_KEYWORD_REGEX.test(line);

    // 단축 — `결제` / `주문` (또는 OCR 변형) 키워드가 같은 라인에 있어야 함 (false positive 방어).
    //
    // 매칭 우선순위 (정확도 ↓ 순):
    //   1. 점 분리 (M.D) — 명확한 separator
    //   2. M D HHMM (3토큰 분리) — 시각이 별도 토큰
    //   3. M+D 압축 + HHMM (2토큰) — `210 1202`, `47 1129`
    //   4. 완전 압축 (1토큰 6~8자리)
    //   5. packedShort 단일 토큰 — fallback
    //
    // 형태 4·5 (MMDD/HHMM 모호) 보다 형태 2·3 (HHMM 분리) 가 정확하므로 먼저 시도한다.
    if (hasPayKeyword) {
      // 1. 점 분리 단축
      const dotShort = line.match(/(?:^|[^\d])(\d{1,2})\s*\.\s*(\d{1,2})/);
      if (dotShort) {
        const mm = Number(dotShort[1]);
        const dd = Number(dotShort[2]);
        if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
          return `${inferYear(mm)}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
        }
      }
      // 키워드 앞부분 추출
      const beforeKeyword = line
        .slice(0, line.search(PAY_KEYWORD_REGEX))
        .trim();
      // 2. 분리되어 있음 — `M D HHMM` 3 토큰. HHMM 4자리가 시각 앵커.
      //    예: `2 14 2242 글제` → 2.14, `47 1129 즐제` 는 토큰 2 개라 여기 미매칭
      const split = beforeKeyword.match(/(?:^|\s)(\d{1,2})\s+(\d{1,2})\s+(\d{4})\s*$/);
      if (split) {
        const month = Number(split[1]);
        const day = Number(split[2]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return `${inferYear(month)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
      }
      // 3. M+D 가 한 토큰으로 압축 + HHMM — `210 1202` = `2.10 12:02`, `47 1129` = `4.7 11:29`
      //    HHMM 4자리가 anchor — 그 앞 토큰을 M+D 로 분해.
      const compactMD = beforeKeyword.match(/(?:^|\s)(\d{2,4})\s+(\d{4})\s*$/);
      if (compactMD) {
        const md = compactMD[1];
        const tries: Array<[number, number]> = [];
        if (md.length === 2) tries.push([Number(md[0]), Number(md[1])]);
        else if (md.length === 3) tries.push([Number(md[0]), Number(md.slice(1))]);
        else if (md.length === 4) {
          tries.push([Number(md.slice(0, 2)), Number(md.slice(2))]);
          tries.push([Number(md[0]), Number(md.slice(1, 3))]); // MDDX → M+DD
        }
        for (const [m, d] of tries) {
          if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            return `${inferYear(m)}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          }
        }
      }
      // 3b. MD.HHMM — 연도/공백 없이 "MD.HHMM 주문/결제" 만 보일 때.
      //     예: "325.1522 주문" = 3.25 15:22, "22.1734 주문" = 2.2 17:34.
      //     dotShort 가 잘못된 경계로 잡힐 수 있는 (e.g. "22.17" → mm=22 invalid) 케이스를
      //     HHMM 시간 검증으로 정확히 잡는다. dotShort/compactMD 다음에 둬서 우선순위를 낮춤
      //     ("3.28.1141주문" 같은 케이스에서 dotShort 가 먼저 잡도록).
      const mdHhmm = line.match(/(?:^|[^\d])(\d{2,4})\s*\.\s*(\d{4})(?=[^\d]|$)/);
      if (mdHhmm) {
        const md = mdHhmm[1];
        const hhmm = mdHhmm[2];
        const hh = Number(hhmm.slice(0, 2));
        const mn = Number(hhmm.slice(2));
        if (hh <= 23 && mn <= 59) {
          const tries: Array<[number, number]> = [];
          if (md.length === 2) tries.push([Number(md[0]), Number(md[1])]);
          else if (md.length === 3) {
            tries.push([Number(md[0]), Number(md.slice(1))]);
            tries.push([Number(md.slice(0, 2)), Number(md[2])]);
          } else if (md.length === 4) {
            tries.push([Number(md.slice(0, 2)), Number(md.slice(2))]);
            tries.push([Number(md[0]), Number(md.slice(1, 3))]);
          }
          for (const [m, d] of tries) {
            if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
              return `${inferYear(m)}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            }
          }
        }
      }

      // 3c. MD 압축 + dot + 시각 — "33.11:56 주문" 같이 dotShort 가 mm=33 invalid 로 실패한
      //     케이스를 시각 anchor (`\d{1,2}[:.]\d{2}`) 로 정확히 잡는다. 2-digit 첫 그룹만 허용해서
      //     dotShort 가 정상 매치되는 케이스 (e.g. "3.28...")에 영향 안 주게 함.
      const compMd2 = line.match(/(?:^|[^\d])(\d{2})\s*\.\s*\d{1,2}[:.]\d{2}/);
      if (compMd2) {
        const md = compMd2[1];
        const mm = Number(md);
        const m1 = Number(md[0]);
        const d1 = Number(md[1]);
        // dotShort 가 이미 시도했을 mm in [1,12] 범위는 건너뛰고 (그건 dotShort 가 처리),
        // 여기서는 mm > 12 인 케이스만 MD 압축으로 재해석.
        if (mm > 12 && m1 >= 1 && m1 <= 9 && d1 >= 1 && d1 <= 9) {
          return `${inferYear(m1)}-${String(m1).padStart(2, "0")}-${String(d1).padStart(2, "0")}`;
        }
      }

      // 4. 완전 압축 — `MDHHMM` 6자리 또는 `MDHHMMSS` 7~8자리.
      //   안전: 가격 라인은 거의 항상 "N원" 또는 "N,NNN원" 으로 시작하므로 그 뒤의 잔여 숫자
      //   덩어리만 본다. 라인 전체를 anchor 로 보면 가격 자체를 날짜로 오인할 위험이 큼.
      const packedTrail = beforeKeyword.match(/(\d{6,8})\s*$/);
      if (packedTrail) {
        const t = packedTrail[1];
        // 우선 M(1)D(1)HH(2)MM(2) 6자리 — `211527` = 2.1
        // 다음 M(1)D(2) 또는 M(2)D(1) 등 가능성 시도
        const tries: Array<[number, number]> = [];
        if (t.length === 6) {
          tries.push([Number(t[0]), Number(t.slice(1, 3))]); // M D HH MM (1+2+...)
          tries.push([Number(t.slice(0, 2)), Number(t[2])]); // MM D HH MM (2+1+...)
        } else if (t.length === 7) {
          tries.push([Number(t[0]), Number(t.slice(1, 3))]); // M DD HH MM SS or so
          tries.push([Number(t.slice(0, 2)), Number(t[2])]);
        } else if (t.length === 8) {
          tries.push([Number(t.slice(0, 2)), Number(t.slice(2, 4))]); // MM DD HH MM
          tries.push([Number(t[0]), Number(t.slice(1, 3))]);
        }
        for (const [m, d] of tries) {
          if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            return `${inferYear(m)}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          }
        }
      }
      // 5. 단일 토큰 fallback — "126.15:09 주문" = 1.26, "728.11:02주문" = 7.28.
      //    위 패턴들이 모두 실패한 경우만. 4-digit 토큰의 모호성(MMDD vs HHMM)을 피하려고 마지막에 둠.
      const packedShort = line.match(
        /(?:^|[^\d])(\d{3,4})[.\s]*(?:\d{1,2}[:.]\d{2})?\s*(?:[결즐글긍금][제재지자]|[주수우][문묘몬둔의])/,
      );
      if (packedShort) {
        const token = packedShort[1];
        const month = token.length === 3 ? Number(token.slice(0, 1)) : Number(token.slice(0, 2));
        const day = Number(token.slice(-2));
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return `${inferYear(month)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
      }
    }

    // 키워드가 없는 경우 — 메인 라인이 가격으로 시작하고 그 뒤가 분리된 숫자 시퀀스인 패턴만 인정.
    //   "17.000원 2 6 045 27"  → 2.6 04:54:27 (키워드 누락)
    //   "23,1008 2 6 0454 27"  → 2.6
    // 가드:
    //   - 라인이 "원" 또는 "8" (원의 OCR 변형) 으로 끝나는 가격 토큰을 포함해야 함
    //   - "원" 다음부터 라인 끝까지가 `\d{1,2} \d{1,2} \d+ \d+` 형식인 경우만 매칭
    //   - 매칭된 M/D 가 1..12 / 1..31 범위
    const trailing = line.match(/[\d,]+\s*[원8](?:\s|$)([^가-힣\n]*?)$/);
    if (trailing) {
      const tail = trailing[1].trim();
      // tail 이 분리된 숫자 시퀀스인지 확인 — "2 6 045 27" / "2 6 0454 27" / "2 14 2242 27"
      const m = tail.match(/^(\d{1,2})\s+(\d{1,2})\s+\d+(?:\s+\d+)*\s*$/);
      if (m) {
        const month = Number(m[1]);
        const day = Number(m[2]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return `${inferYear(month)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
      }
    }
    return null;
  };

  // 라인 자체가 "거의 날짜 라인"인지 판정 — itemName 후보에서 제외하기 위함.
  // extractDate 가 null 을 돌려줘도 (regex 가 못 잡아도) "주문" / "결제" 또는 그 OCR 변형 +
  // 숫자 비율이 높으면 itemName 으로 가져가지 않는다.
  //
  // 변형 어휘 — extractDate 와 동기화:
  //   결제 → 결자 / 즐제 / 글제 / 긍제 / 금지 / 결재 / 검제 / 걸제 / 갈제
  //   주문 → 주묘 / 수문 / 우문 / 주둔 / 주몬 / 주의 / 주8 / 주둔
  // 2026-04-27 추가: 모바일 캡쳐 mobile/09:46-06 에서 "검제", 184545 에서 "즐제"/"금지" 등이
  // 반복 관찰. 단일 글자 변형은 char class 가 아닌 literal 로 추가해 false positive 방어.
  const ORDER_OR_PAYMENT_KW = /결제|주문|결재|즐제|글제|긍제|금지|결자|검제|걸제|갈제|수문|수묘|우문|주묘|주둔|주몬|주의/;
  const looksLikeDateLine = (line: string): boolean => {
    if (!ORDER_OR_PAYMENT_KW.test(line)) return false;
    // 라인의 60% 이상이 숫자/구두점/공백이면 날짜 라인으로 간주.
    const nonHangul = (line.match(/[\d.\s:\-,()]/g) ?? []).length;
    return nonHangul / Math.max(1, line.length) >= 0.6;
  };

  // ── fold 신호 (모두 화면에 literal 로 찍히는 명시적 CTA) ─────────────────
  //
  // 사용자 보고로 추가된 변형들 — 모두 화면에 보이는 그대로의 라벨이라 추정 X, literal 매칭.
  //   - "주문 펼쳐보기" : 접힌 상태 CTA (web)
  //   - "총 N건 펼쳐보기" : 접힌 상태 CTA (mobile, "주문" 단어 누락 변형)
  //   - "총 N건 주문 접기" : 펼쳐진 상태 CTA (web2 — 이미 펼쳐 본 fold 묶음)
  //   - "포함 총 N건" : 인라인 itemCount 힌트
  //   - "총 N원" : sectionTotal
  // N 은 itemCountHint 로 보존. UI 가 "외 N건 숨김" 안내에 사용.
  const FOLD_OPEN_CTA = /주문\s*펼쳐\s*보기/; // 접힌 상태
  const FOLD_TOTAL_OPEN_CTA = /총\s*(\d+)\s*건\s*펼쳐\s*보기/; // 접힌 상태 + N
  const FOLD_CLOSE_CTA = /총\s*(\d+)\s*건\s*주문\s*접기/; // 펼쳐진 fold 묶음 + N
  const FOLD_BARE_CLOSE = /주문\s*접기/; // 단축 변형 방어

  // 카드 추출 — status 라인을 anchor 로, 다음 status 까지 또는 LOOKAHEAD 윈도 안에서 name/price/date 1쌍.
  const LOOKAHEAD = 12;
  const results: PurchaseOCRResult[] = [];
  let cursor = -1;
  for (let i = 0; i < lines.length; i++) {
    if (i <= cursor) continue;
    if (!hasStatusKeyword(lines[i])) continue;

    const end = Math.min(lines.length, i + 1 + LOOKAHEAD);
    let name: string | null = null;
    let price: number | null = null;
    let date: string | null = null;
    let cardEnd = end;
    for (let j = i + 1; j < end; j++) {
      if (hasStatusKeyword(lines[j])) { cardEnd = j; break; }
      if (price === null) {
        const c = extractPrice(lines[j]);
        if (c !== null) price = c;
      }
      if (date === null) {
        const c = extractDate(lines[j]);
        if (c !== null) date = c;
      }
      if (name === null) {
        const t = lines[j];
        // name 후보 — UI 라벨/UI 통합/aux/price/거의-날짜/status/fold CTA 가 아닌 한글 ≥ 2 글자 라인.
        // > 가 끝에 붙어 있으면 정리.
        //
        // 날짜 처리 정책 (2026-04-27 사용자 보고):
        //   OCR 가 "1.26.15:09 주문 매지청소청소봇솔브러쉬" 처럼 날짜와 상품명을 한 라인에 합칠 수
        //   있어, extractDate(t) !== null 만으로 name 차단하면 정상 상품명까지 잃음.
        //   대신 looksLikeDateLine 으로 "라인 거의 전부가 날짜" 인 경우만 차단 (한글 비율 검사).
        //   날짜 부분은 extractDate 가 별도로 추출하므로 동일 라인이 name + date 양쪽에 사용돼도 OK.
        if (
          !isUiLabelLine(t) &&
          !isUiCompoundLine(t) &&
          !isAuxLine(t) &&
          extractPrice(t) === null &&
          !looksLikeDateLine(t) &&
          !FOLD_OPEN_CTA.test(t) &&
          !FOLD_TOTAL_OPEN_CTA.test(t) &&
          !FOLD_CLOSE_CTA.test(t) &&
          !FOLD_BARE_CLOSE.test(t) &&
          (t.match(/[가-힣]/g) ?? []).length >= 2 &&
          t.length >= 4
        ) {
          // 날짜가 같은 라인에 끼어 있으면 날짜 부분을 제거하고 나머지를 name 으로.
          let candidate = t.replace(/>$/, '').trim();
          if (extractDate(candidate) !== null) {
            // M.D HH:MM 결제/주문 / 풀 날짜 부분을 라인에서 제거
            candidate = candidate
              .replace(/(?:^|\s)(?:20\d{2}[^\d]+)?(\d{1,2})[.\s]+(\d{1,2})[.\s]*(?:\d{1,2}[:.]\d{2})?\s*(?:결제|주문|수문|수묘|우문|주묘)/, ' ')
              .trim();
          }
          name = stripLeadingGarbage(candidate);
        }
      }
    }

    const sectionLines = lines.slice(i, cardEnd);
    const folded = sectionLines.some((l) => FOLD_OPEN_CTA.test(l) || FOLD_TOTAL_OPEN_CTA.test(l));
    const expandedFoldGroup = sectionLines.some((l) => FOLD_CLOSE_CTA.test(l) || FOLD_BARE_CLOSE.test(l));
    let itemCountHint: number | undefined;
    for (const l of sectionLines) {
      for (const re of [/포함\s*총\s*(\d+)\s*건/, FOLD_TOTAL_OPEN_CTA, FOLD_CLOSE_CTA]) {
        const m = l.match(re);
        if (!m) continue;
        const n = Number(m[1]);
        if (n > 1) itemCountHint = Math.max(itemCountHint ?? 0, n);
      }
    }
    let sectionTotal: number | undefined;
    for (const l of sectionLines) {
      const m = l.match(/총\s*([\d,]+)\s*원/);
      if (!m) continue;
      const n = Number(m[1].replace(/,/g, ""));
      if (n > 0) sectionTotal = Math.max(sectionTotal ?? 0, n);
    }
    const expandedFoldTailCount = (() => {
      for (const l of sectionLines) {
        const m = l.match(FOLD_CLOSE_CTA);
        if (!m) continue;
        const n = Number(m[1]);
        if (n > 1) return n;
      }
      return undefined;
    })();
    const hasShippingOnly =
      sectionLines.some((l) => /배송조회/.test(l)) &&
      !sectionLines.some((l) => /장바구니|바로\s*구매|바로구매|한달사용리뷰/.test(l));
    const addonCandidate = !folded && !date && hasShippingOnly;
    if (addonCandidate && results.length > 0) {
      const prevDate = results[results.length - 1]?.date;
      if (prevDate) date = prevDate;
    }

    results.push({
      mall,
      itemName: name,
      // folded(접힘) 일 때만 가격을 null 로 — 펼쳐진 fold 그룹은 각 카드의 실제 가격을 그대로 보존.
      price: folded ? null : price,
      date,
      rawText,
      statusText: lines[i],
      // priceOcrFailed: name 후보는 잡혔는데 가격이 없으면 OCR 가 가격 라인을 놓친 신호. ocrQuality
      // 가 이걸 보고 bad → AI gate 발동.
      ...(name !== null && price === null && !folded ? { priceOcrFailed: true } : {}),
      ...(folded ? { folded: true } : {}),
      ...(expandedFoldGroup ? { expandedFoldGroup: true } : {}),
      ...(expandedFoldTailCount ? { expandedFoldTailCount } : {}),
      ...((folded || expandedFoldGroup) && itemCountHint !== undefined ? { itemCountHint } : {}),
      ...(sectionTotal !== undefined && sectionTotal > 0 ? { sectionTotal } : {}),
      ...(addonCandidate ? { addonCandidate: true } : {}),
    });
    cursor = cardEnd - 1;
  }

  if (results.length === 0) {
    // 안전망: status 키워드를 한 번도 못 잡았어도 빈 결과 대신 placeholder 1건. ocrQuality 가
    // bad 로 분류해 AI fallback 이 작동하게 한다.
    return [{
      mall,
      itemName: null,
      price: null,
      date: null,
      rawText,
      statusText: rawText,
      priceOcrFailed: true,
    }];
  }

  // ── 동일 결제 묶음 날짜 전파 (2026-04-27 측정 기반 추가) ────────────────
  //
  // 네이버 펼쳐진 fold 묶음("총 N건 주문 접기") + 추가상품 묶음은 같은 결제 = 같은 날짜.
  // 1차 파서가 라인 단위로 카드를 자르면서 일부 카드의 date 만 잡고 일부는 놓치는 케이스가
  // 흔하다 (예: web2/10.01.50 — 1번 카드만 1.26 잡히고 2번/3번 카드는 missing_date 인데
  // expandedFoldGroup 으로 묶일 예정). 같은 묶음 내에서 한 카드라도 날짜가 있으면 다른
  // 카드들에 propagate 한다.
  //
  // 정책 §6 "정직성" 위반 우려: fold 메타가 sectionTotal 만 보존하고 가격은 추정 안 함과
  // 같은 결의 정직성. 다만 **같은 결제** 라는 사실은 expandedFoldGroup/addonCandidate 신호로
  // 이미 확정이라, 결제 일자 propagate 는 추정이 아니라 동일 사실의 복제. 안전.
  //
  // 그룹 backfill: "총 N건 주문 접기" 라벨은 fold group 의 **마지막 카드 섹션 안에만**
  // 들어있어 앞쪽 (N-1) 장은 expandedFoldGroup=false 로 빠짐. tail 카드의
  // expandedFoldTailCount=N 을 보고 앞 (N-1) 카드도 같은 그룹 멤버로 표시한다.
  // (이건 추정이 아니라 UI 상 명시된 그룹 사실의 backfill — 안전.)
  //
  // 그룹 ID 로 분리해야 인접한 두 fold group 이 하나로 합쳐지는 사고를 막을 수 있다.
  // (예: [그룹A 4장][그룹B 3장] 처럼 연속되면 expandedFoldGroup boolean 만으로는 경계 구분 불가.)
  const foldGroupIds = new Array<number | undefined>(results.length).fill(undefined);
  let nextGroupId = 0;
  for (let i = 0; i < results.length; i += 1) {
    const tailCount = results[i].expandedFoldTailCount;
    if (!tailCount || tailCount <= 1) continue;
    const groupStart = Math.max(0, i - (tailCount - 1));
    nextGroupId += 1;
    for (let k = groupStart; k <= i; k += 1) {
      // 이미 다른 group 에 속하면 덮어쓰지 않음 (앞 그룹 침범 방지).
      if (foldGroupIds[k] !== undefined) continue;
      foldGroupIds[k] = nextGroupId;
      if (!results[k].expandedFoldGroup) {
        results[k] = { ...results[k], expandedFoldGroup: true };
      }
    }
  }

  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    if (r.date) continue;
    // 추가상품 candidate — 직전 카드 date 가 있으면 따라가기. (이미 위 루프에서도 처리하지만,
    // status anchor 시점에 prev date 가 비어 있다가 후속 카드에서 채워지는 경우를 한 번 더 잡음.)
    if (r.addonCandidate && i > 0) {
      const prevDate = results[i - 1]?.date;
      if (prevDate) {
        results[i] = { ...r, date: prevDate };
        continue;
      }
    }
    // 펼쳐진 fold 묶음 — 같은 묶음 내 다른 카드의 date 로 채움.
    // foldGroupIds 가 있으면 그걸 우선 (정확한 그룹 경계). 없으면 fallback 으로 인접 expandedFoldGroup
    // 스캔 (legacy — 단일 그룹 케이스에선 동일 동작).
    const myGroupId = foldGroupIds[i];
    if (myGroupId !== undefined) {
      for (let k = 0; k < results.length; k += 1) {
        if (foldGroupIds[k] !== myGroupId) continue;
        if (results[k].date) {
          results[i] = { ...r, date: results[k].date };
          break;
        }
      }
    } else if (r.expandedFoldGroup) {
      let groupStart = i;
      while (groupStart > 0 && results[groupStart - 1].expandedFoldGroup) groupStart -= 1;
      let groupEnd = i;
      while (groupEnd + 1 < results.length && results[groupEnd + 1].expandedFoldGroup) groupEnd += 1;
      for (let k = groupStart; k <= groupEnd; k += 1) {
        if (results[k].date) {
          results[i] = { ...r, date: results[k].date };
          break;
        }
      }
    }
  }

  return results;
}
