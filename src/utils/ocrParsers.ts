/**
 * 역할: 각 쇼핑몰 플랫폼의 OCR 텍스트를 구조화된 주문 데이터로 변환하는 파서 모음입니다.
 * 위치: src/utils/ocrParsers.ts
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
    /[🚀↑↓▲▼★☆·•»«‹›<>;:,."'”“‘’\-\|ㅣ=_*©!?~@#&]+\s*/,
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
    /교환[,\s]*반품\s*신청/,
    /판매자\s*문의/,
    /장바구니\s*담기/,
  ];
  const COUPANG_MOBILE_BUTTONS = [
    /배송\s*[·•\-]?\s*주문\s*관리/,
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
    /^배송\s*[·•\-]?\s*주문\s*관리\s*$/,
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
  // leading OCR junk (`@`, `"`, `'`, bullet, dot 등) 은 흡수해서, `@ 일부 상품이 분리되어...`
  // 같은 실제 캡쳐 케이스에서도 마커가 떨어지지 않도록 합니다 (222053, 222127 회귀 방지).
  const COUPANG_SPLIT_MARKERS = [
    /^[\s@"'`·•▪\-*ㆍ]*일부\s*상품이\s*분리되어\s*배송됩니다[.…]?\s*$/,
    /^[\s@"'`·•▪\-*ㆍ]*분리배송된\s*상품입니다[.…]?\s*$/,
    /^[\s@"'`·•▪\-*ㆍ]*분리\s*배송\s*$/,
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
  const statusLineRegex = /^[\s·•▪\-\*\|ㅣ]*(배송\s*완료|배송\s*중|상품\s*준비\s*중|결제\s*완료|주문\s*완료|주문\s*취소|취소\s*완료|환불\s*완료|환불\s*처리|반품\s*완료|구매\s*확정|정기\s*결제|구독)/;

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
  const priceLineRegex = /([\d]{1,3}(?:,\d{3})+|\d+)\s*원(?=$|[\s·•.\-*,)가-힣])(?:[^\d\n]{0,6}(\d{1,3})\s*개)?/;

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
  const priceLineFallbackRegex = /(?:^|\D)(\d{1,3}(?:,\d{3})+|\d{3,6})[^\d\n]{0,10}장바구니\s*담기/;

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
  const trailingButtonRegex = new RegExp(
    '\\s+(?:' + joinRegex([...COUPANG_DESKTOP_BUTTONS, ...COUPANG_MOBILE_BUTTONS]) + ')\\s*>?\\s*$'
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
    const hasNoise = /[A-Za-z0-9=|\[\]#\+\^~ㄱ-ㅎㅏ-ㅣ]/.test(prefix);
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

  const flushNameAndPrice = (priceNum: number, quantity: number | undefined) => {
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
    const joined = stripTags(nameBuffer.join('').replace(/\s+/g, ' ').trim());
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
    };
    if (pendingSplit) {
      entry._splitDelivery = true;
      pendingSplit = false;
    }
    results.push(entry);
    nameBuffer = [];
  };

  for (const rawLine of allLines) {
    const line = rawLine.trim();
    if (!line) continue;

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
        flushNameAndPrice(0, undefined);
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
        flushNameAndPrice(0, undefined);
      }
      currentStatus = line;
      nameBuffer = [];
      statusCardsStarted += 1;
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
      const hasKorean = /[가-힣]/.test(stripped);
      const letterCount = (stripped.match(/[A-Za-z]/g) || []).length;
      // 2026-04-24: 디지트 비율 가드 추가.
      //   "로 2121" 같이 1글자 한글 + 숫자만 뭉친 OCR 잔류가 nameBuffer 에 들어가 soft-commit
      //   단계에서 price=0 placeholder 카드로 emit 되는 회귀(004) 가 있어, 전체 글자 중 숫자가
      //   절반 이상이면 noise 로 버립니다. 정상 상품명은 한글이 주를 이뤄 ratio 가 낮습니다.
      const nonSpaceLen = stripped.replace(/\s+/g, '').length;
      const digitCount = (stripped.match(/\d/g) || []).length;
      const mostlyDigits = nonSpaceLen > 0 && digitCount / nonSpaceLen >= 0.5;
      if (!mostlyDigits && (hasKorean || letterCount >= 3)) {
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
  if (statusCardsStarted > 0 && nameBuffer.length > 0) {
    flushNameAndPrice(0, undefined);
  }

  if (results.length === 0) {
    return [{ mall, itemName: null, price: null, date: orderDate, rawText, statusText: rawText }];
  }

  // ───────── 분리배송 후처리 병합 ─────────
  //
  // `_splitDelivery` 가 붙은 항목 중 (date, itemName, price) 가 같은 그룹은 **첫 항목에**
  // quantity 를 합산해 하나로 줄입니다. 쿠팡 데스크톱/모바일 모두에서 동일 상품이 창고 분리
  // 발송으로 카드 3장으로 찍히는 경우, 사용자가 실제로 주문한 수량(예: 3박스)은 카드별 1개의
  // **합**입니다. 만약 capture 가 일부만 잡아서 같은 그룹이 1장만 보이면 병합 없이 그대로 둡니다.
  //
  // 주의: "원본"(일부 상품이 분리되어 배송됩니다) / "복사"(분리배송된 상품입니다) 구분 없이
  // 모두 `_splitDelivery=true` 로 들어오므로, 둘 중 아무거나 먼저 나온 항목이 대표 항목이 됩니다.
  // 이는 파서 입력 순서(capture 순서) = 사용자가 화면에서 본 순서에 가까우므로 자연스럽습니다.
  const merged: PurchaseOCRResult[] = [];
  const groupIndex = new Map<string, number>(); // key → merged[] 의 인덱스
  for (const r of results) {
    if (r._splitDelivery) {
      const key = `${r.date ?? ''}|${r.itemName ?? ''}|${r.price ?? ''}`;
      const existingIdx = groupIndex.get(key);
      if (existingIdx !== undefined) {
        // 같은 (date, name, price) 가 이미 들어가 있음 → 수량만 합쳐서 버림
        const prev = merged[existingIdx];
        prev.quantity = (prev.quantity ?? 1) + (r.quantity ?? 1);
        continue;
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

export function parseNaverOrderText(rawText: string): PurchaseOCRResult[] {
  // 상태 감지용 키워드
  const statusKeywords = ['취소완료', '취소 완료', '주문취소완료',
                          '환불완료', '환불처리', '환불 완료', '반품완료', '반품 완료',
                          '결제완료', '결제 확인 완료', '결제 확인', '주문완료', '배송완료', '배송 완료', '배송중',
                          '구매확정완료', '구매확정', '구매 확정', '정기결제', '구독'];

  // 제외할 안내 문구
  const excludePatterns = ['환불 가능', '환불가능', '반품 가능', '반품가능', '취소 가능', '취소가능',
                           '환불 정책', '반품 정책', '환불/반품', '환불·반품'];

  // 원본 텍스트에서 상태 키워드가 포함된 라인 추출 (안내 문구 제외)
  const originalLines = rawText.split('\n');
  const statusTexts: string[] = [];
  for (const line of originalLines) {
    const isExcluded = excludePatterns.some(pattern => line.includes(pattern));
    if (!isExcluded && statusKeywords.some(kw => line.includes(kw))) {
      statusTexts.push(line.trim());
    }
  }

  let lines = rawText
    .split('\n')
    .map(line => line.replace(/^[\s\|ㅣ<\-—©]+/, '').trim())
    .filter(line => line.length > 0);

  const mall = '네이버';
  const nameLines = lines.filter(line => line.endsWith('>'));
  const dpLines = lines.filter(line => /202\d/.test(line));

  const maxLen = Math.max(nameLines.length, dpLines.length);
  const results: PurchaseOCRResult[] = [];

  for (let i = 0; i < maxLen; i++) {
    let itemName = nameLines[i] ? nameLines[i].replace(/>$/, '').trim() : null;
    let price: number | null = null;
    let date: string | null = null;

    const targetLine = dpLines[i];
    if (targetLine) {
      const dateMatch = targetLine.match(/(202\d)[^\d]*(1[0-2]|[1-9])[^\d]*(3[01]|[12][0-9]|[1-9])/);
      if (dateMatch) {
        const mm = dateMatch[2].padStart(2, '0');
        const dd = dateMatch[3].padStart(2, '0');
        date = `${dateMatch[1]}-${mm}-${dd}`;
      }

      let priceStr = targetLine.split(/202\d/)[0];
      priceStr = priceStr.replace(/[^\d,]/g, '');
      priceStr = priceStr.replace(/81$/, '').replace(/8$/, '');

      if (priceStr) {
        price = Number(priceStr.replace(/,/g, ''));
      }
    }

    const statusIdx = Math.min(i, statusTexts.length - 1);
    results.push({
      mall,
      itemName,
      price,
      date,
      rawText,
      statusText: statusTexts[statusIdx] || rawText
    });
  }

  if (results.length === 0) {
    return [{ mall, itemName: null, price: null, date: null, rawText, statusText: rawText }];
  }

  return results;
}

export function parseTemuOrderText(rawText: string): PurchaseOCRResult[] {
  // 상태 감지용 키워드 - 완료 상태만 정확하게 매칭
  const statusKeywords = ['취소완료', '취소 완료', '주문취소완료',
                          '환불완료', '환불 완료', '환불처리완료',
                          '반품완료', '반품 완료', '반품처리완료',
                          '결제완료', '결제 완료', '주문완료', '주문 완료',
                          '배송완료', '배송 완료', '배송중',
                          '구매확정완료', '구매확정', '구매 확정',
                          '정기결제', '구독'];

  // 제외할 안내 문구 (실제 상태가 아닌 것들)
  const excludePatterns = ['환불 가능', '환불가능', '반품 가능', '반품가능', '취소 가능', '취소가능',
                           '환불 정책', '반품 정책', '환불/반품', '환불·반품'];

  // 원본 텍스트에서 상태 키워드가 포함된 라인 추출 (안내 문구 제외)
  const originalLines = rawText.split('\n');
  const statusTexts: string[] = [];
  for (const line of originalLines) {
    // 안내 문구가 포함된 라인은 제외
    const isExcluded = excludePatterns.some(pattern => line.includes(pattern));
    if (!isExcluded && statusKeywords.some(kw => line.includes(kw))) {
      statusTexts.push(line.trim());
    }
  }

  const lines = rawText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const mall = '테무';
  const results: PurchaseOCRResult[] = [];
  let orderDate: string | null = null;

  const dateRegex = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/;
  for (const line of lines) {
    const match = line.match(dateRegex);
    if (match) {
      const yyyy = match[1];
      const mm = match[2].padStart(2, '0');
      const dd = match[3].padStart(2, '0');
      orderDate = `${yyyy}-${mm}-${dd}`;
      break;
    }
  }

  let isProductSection = false;
  for (const line of lines) {
    if (line.includes('상품 세부 내용')) {
      isProductSection = true;
      continue;
    }
    
    if (isProductSection) {
      const promoRegex = /(?:프로모|적용\s*후?)[^\d]*([\d,]+)/;
      const promoMatch = line.match(promoRegex);
      if (promoMatch && results.length > 0) {
        results[results.length - 1].price = Number(promoMatch[1].replace(/[^\d]/g, ''));
        continue;
      }

      const productRegex = /(.*?)[\.\…]+?\s*([\d,]+)[원¥89]*$/i;
      const match = line.match(productRegex);
      
      if (match) {
        let itemName = match[1].replace(/^[^가-힣a-zA-Z0-9]+/, '').trim();
        let priceStr = match[2].replace(/[^\d]/g, '');
        
        if (priceStr.length >= 5 && (priceStr.endsWith('9') || priceStr.endsWith('8'))) {
          if (!match[2].includes(',')) {
            priceStr = priceStr.slice(0, -1);
          }
        }
        
        if (itemName.length > 2) {
          results.push({
            mall,
            itemName,
            price: priceStr ? Number(priceStr) : null,
            date: orderDate,
            rawText,
            // 테무는 안내 문구가 많아 상태 자동 인식이 부정확하므로 기본값(purchase) 사용
            statusText: undefined
          });
        }
      } else {
        const excludeKeywords = ['합계', '할인', '소계', '배송', 'Temu', '판매자', '프로모션', '환불', '적용'];
        const isExcluded = excludeKeywords.some(kw => line.includes(kw));

        if (!isExcluded) {
           const directPriceRegex = /(.*)\s+([\d,]+)[원¥89]*$/i;
           const match2 = line.match(directPriceRegex);
           if (match2) {
             let itemName = match2[1].replace(/^[^가-힣a-zA-Z0-9]+/, '').trim();
             let priceStr = match2[2].replace(/[^\d]/g, '');

             if (priceStr.length >= 5 && (priceStr.endsWith('9') || priceStr.endsWith('8'))) {
               if (!match2[2].includes(',')) {
                 priceStr = priceStr.slice(0, -1);
               }
             }

             if (itemName.length > 2) {
               results.push({
                 mall,
                 itemName,
                 price: priceStr ? Number(priceStr) : null,
                 date: orderDate,
                 rawText,
                 // 테무는 안내 문구가 많아 상태 자동 인식이 부정확하므로 기본값(purchase) 사용
                 statusText: undefined
               });
             }
           }
        }
      }
    }
  }

  if (results.length === 0) {
    return [{ mall, itemName: null, price: null, date: orderDate, rawText, statusText: undefined }];
  }

  return results;
}
