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

  // 상태 라인 감지(한 줄에 상태 키워드가 하나라도 들어 있으면 상태 라인으로 취급).
  // OCR 특성상 "배송완료 · 4/17(금) 도착"처럼 날짜/요일이 뒤따르는 경우가 많아 키워드 포함 여부만 확인.
  const statusLineRegex = /(배송완료|배송 완료|배송중|상품준비중|상품 준비중|결제완료|결제 완료|주문완료|주문 완료|주문취소|취소완료|취소 완료|환불완료|환불 완료|반품완료|반품 완료|구매확정|구매 확정|정기결제|구독)/;

  // 섹션 경계 — 이 라인 이후는 주문 집계 영역이라 상품으로 보지 않음.
  const sectionBoundaryRegex = /(결제\s*정보|결제영수증\s*정보|받는사람\s*정보|배송(?:상품)?\s*주문상태\s*안내|배송지\s*정보)/;

  // 상품 블록 내부에서도 무조건 건너뛸 라인 패턴.
  // 주의:
  //   - "도착 예정", "무인 택배함" 등은 **상태 라인의 꼬리표**로 자주 붙기 때문에 여기서 매칭하면 상태 라인 전체를 잃습니다.
  //     그래서 이 noise 검사는 반드시 statusLine 검사보다 **뒤**에서 수행돼야 합니다.
  //   - "주문취소"/"주문 취소"는 버튼 라벨인 경우도 있고 실제 상태인 경우도 있어,
  //     라인이 "주문취소"만 **단독**으로 있을 때만 UI 버튼으로 간주합니다(앵커 ^…$).
  //   - "· 4/17(금) 도착" 식 날짜 조각이 상태 라인에서 줄바꿈돼 단독으로 떨어진 경우만 제거합니다.
  const noiseLineRegex = /(^[\s·•\-*]*\d{1,2}\/\d{1,2}\s*\(?[월화수목금토일]?\)?\s*도착\s*$)|(^주문\s*상세보기\s*>?\s*$)|(^장바구니\s*담기\s*$)|(^배송\s*조회\s*$)|(^리뷰(?:\s*작성(?:하기)?|\s*쓰기)\s*$)|(^교환[,\s]*반품\s*신청\s*$)|(^판매자\s*문의\s*$)|(^주문\s*취소\s*>?\s*$)|(^더보기\s*$)|(^상세보기\s*>?\s*$)/;

  // 가격 라인: `6,900 원 · 1개` / `17,270 원 · 1개` / OCR로 · 가 ./-/* 로 변형돼도 수량이 잡히게 관대한 구분자.
  // NOTE: "원" 뒤에 \b 를 쓰지 않는 이유 — 한글은 JS 정규식의 단어문자에 포함되지 않아
  //       "원 " 경계가 word-boundary로 성립하지 않습니다. 대신 "원" 뒤 공백/구분자/EOL 을 직접 허용합니다.
  const priceLineRegex = /([\d]{1,3}(?:,\d{3})+|\d{3,})\s*원(?=$|[\s·•.\-*,)])(?:[^\d\n]{0,6}(\d{1,3})\s*개)?/;

  // 주문일(YYYY. M. DD 주문)
  const orderDateRegex = /(20\d{2})\s*[.\s]\s*(\d{1,2})\s*[.\s]\s*(\d{1,2})\s*(?:주\s*문)?/;

  // 상품명 앞에 붙는 쿠팡 전용 태그/아이콘. 여러 개가 겹쳐 붙을 수 있어 while로 반복 제거.
  const leadingTagRegex = /^(?:[🚀↑↓▲▼★☆·•\-\|ㅣ<=_*©]+\s*|판매자로켓|로켓직구|로켓프레시|로켓배송|로켓|새벽|내일|오늘|무료배송)\s*/;

  // ───────── 1차 라인 분리 ─────────
  const allLines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  // ───────── 주문일자 캡쳐 ─────────
  // 파일 상단에서 한 번 찾아두면 모든 상품에 공통 적용.
  let orderDate: string | null = null;
  for (const line of allLines) {
    // 섹션 경계 지나면 멈춤(결제영수증 날짜 등 오인식 방지)
    if (sectionBoundaryRegex.test(line)) break;
    const m = line.match(orderDateRegex);
    if (m) {
      // "2026. 4. 16 주문" 같은 헤더 근처에서만 잡히도록, "주문" 단어가 동일 라인에 있는지 한 번 더 확인
      if (/주\s*문/.test(line)) {
        const mm = m[2].padStart(2, '0');
        const dd = m[3].padStart(2, '0');
        orderDate = `${m[1]}-${mm}-${dd}`;
        break;
      }
    }
  }
  // 폴백: "주문" 단어가 없어도 파일 맨 위쪽 날짜를 쓰겠다는 최후의 시도
  if (!orderDate) {
    for (const line of allLines.slice(0, 10)) {
      if (sectionBoundaryRegex.test(line)) break;
      const m = line.match(orderDateRegex);
      if (m) {
        const mm = m[2].padStart(2, '0');
        const dd = m[3].padStart(2, '0');
        orderDate = `${m[1]}-${mm}-${dd}`;
        break;
      }
    }
  }

  // ───────── 상태머신 주행 ─────────
  const results: PurchaseOCRResult[] = [];
  let currentStatus: string | undefined;
  let nameBuffer: string[] = [];
  let inPaymentSection = false;

  const stripTags = (line: string): string => {
    let cleaned = line;
    // 선두 태그를 반복 제거. 예: "🚀판매자로켓 새벽 코지엔비..." → "코지엔비..."
    let prev = '';
    while (cleaned !== prev) {
      prev = cleaned;
      cleaned = cleaned.replace(leadingTagRegex, '');
    }
    // 꼬리 구분자 정리
    cleaned = cleaned.replace(/[>:]\s*$/, '').trim();
    return cleaned;
  };

  const flushNameAndPrice = (priceNum: number, quantity: number | undefined) => {
    const joined = nameBuffer.join(' ').replace(/\s+/g, ' ').trim();
    const itemName = joined.length > 0 ? joined : null;
    // 이름 없이 가격만 뜬 라인(총계 잔존 등)은 조용히 버림.
    if (!itemName) {
      nameBuffer = [];
      return;
    }
    results.push({
      mall,
      itemName,
      price: priceNum,
      date: orderDate,
      rawText,
      statusText: currentStatus ?? undefined,
      quantity,
    });
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

    // 헤더(주문일·주문번호) 라인은 이미 orderDate로 캡쳐했으니 이름 버퍼에 넣지 않도록 스킵.
    if (/주문번호\s*[\d]+/.test(line) || /^20\d{2}\s*[.\s]\s*\d{1,2}\s*[.\s]\s*\d{1,2}/.test(line)) {
      continue;
    }

    // 상태 라인: 노이즈 검사보다 먼저 처리.
    //   "상품준비중 · 4/25(토) 도착 예정", "배송완료 · 오늘(목) 도착 (무인 택배함)"처럼
    //   noise에 포함될 법한 꼬리표가 함께 붙는 라인을 상태로 올바로 잡기 위해서입니다.
    if (statusLineRegex.test(line)) {
      currentStatus = line;
      nameBuffer = [];
      continue;
    }

    // 액션/노이즈 라인 스킵 (UI 버튼 단독 라인, 꼬리에 떨어진 날짜 조각)
    if (noiseLineRegex.test(line)) continue;

    // 가격 라인: "원" 뒤에 optional "N개"
    const pm = line.match(priceLineRegex);
    if (pm) {
      const priceStr = pm[1].replace(/,/g, '');
      const price = Number(priceStr);
      // 너무 작거나(쿠폰 "300원" 등은 통과 OK), 너무 큰 값은 방어적으로 버리지 않음 — 사용자가 OcrEdit에서 바로잡을 수 있음.
      if (Number.isFinite(price) && price > 0) {
        const quantity = pm[2] ? Number(pm[2]) : undefined;
        flushNameAndPrice(price, quantity);
        continue;
      }
      // 가격 매치되었지만 숫자 파싱 실패 → 아래 이름 후보 처리로 폴백하지 말고 그냥 스킵.
      continue;
    }

    // 이름 후보: 한글/영문 글자가 하나라도 있고, 너무 짧지 않은 라인
    const stripped = stripTags(line);
    if (stripped.length >= 2 && /[가-힣a-zA-Z]/.test(stripped)) {
      nameBuffer.push(stripped);
    }
  }

  // 끝까지 가격을 못 만났지만 이름만 남은 케이스는 상품가 0으로 흘려보내지 않고 버립니다.
  // (가격 없이 상품을 만들면 가계부에서 0원 상품이 생겨 더 혼란스러움)

  if (results.length === 0) {
    return [{ mall, itemName: null, price: null, date: orderDate, rawText, statusText: rawText }];
  }

  return results;
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

export function parseAuctionOrderText(rawText: string): PurchaseOCRResult[] {
  // 상태 감지용 키워드
  const statusKeywords = ['취소완료', '취소 완료', '주문취소완료',
                          '환불완료', '환불처리', '환불 완료', '반품완료', '반품 완료',
                          '결제완료', '주문완료', '배송완료', '배송 완료', '배송중',
                          '구매확정완료', '구매확정', '정기결제', '구독'];

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

  const lines = rawText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const mall = '옥션';
  const results: PurchaseOCRResult[] = [];

  let currentItem: { date: string | null, names: string[], price: number | null } = {
    date: null,
    names: [],
    price: null
  };

  const dateRegex = /(\d{4}-\d{2}-\d{2})\s*\(\d+\)/;
  const priceRegex = /결제금[가-힣]*\s*:\s*([\d,A-Za-z]+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      if (currentItem.date || currentItem.names.length > 0 || currentItem.price !== null) {
        if (currentItem.names.length > 0 || currentItem.price !== null) {
          const statusIdx = Math.min(results.length, statusTexts.length - 1);
          results.push({
            mall,
            itemName: currentItem.names.join(' ').trim() || null,
            price: currentItem.price,
            date: currentItem.date,
            rawText,
            statusText: statusTexts[statusIdx] || rawText
          });
        }
        currentItem = { date: null, names: [], price: null };
      }
      currentItem.date = dateMatch[1];

      const restOfLine = line.replace(dateMatch[0], '').trim();
      let cleanedName = restOfLine.replace(/['`]*com/g, '').replace(/환불완료|배송완료|주문취소/g, '').trim();
      if (cleanedName.length > 0) {
        currentItem.names.push(cleanedName);
      }
      continue;
    }

    const priceMatch = line.match(priceRegex);
    if (priceMatch) {
      let numStr = priceMatch[1].replace(/[^\d]/g, '');
      if (priceMatch[1].includes(',')) {
         const parts = priceMatch[1].split(',');
         if(parts.length >= 2) {
             const lastPart = parts[parts.length - 1].replace(/[^\d]/g, '');
             const validNumStr = parts.slice(0, -1).map(p => p.replace(/[^\d]/g, '')).join('') + lastPart.substring(0, 3);
             numStr = validNumStr;
         }
      } else {
         numStr = numStr.replace(/8$/, '').replace(/1$/, '');
      }

      if (numStr) {
        currentItem.price = Number(numStr);
      }

      const statusIdx = Math.min(results.length, statusTexts.length - 1);
      results.push({
        mall,
        itemName: currentItem.names.join(' ').trim() || null,
        price: currentItem.price,
        date: currentItem.date,
        rawText,
        statusText: statusTexts[statusIdx] || rawText
      });
      currentItem = { date: null, names: [], price: null };
      continue;
    }

    const ignoreKeywords = ['주문밀', '결제번호', '상품명', '주문돕션', '판매자', '주문슴태', '수량', '주문번호', '개더보기', '다운로드', '내용필독'];
    const isIgnore = ignoreKeywords.some(kw => line.includes(kw));
    
    if (!isIgnore && currentItem.date) {
       const hasKoreanOrAlnum = /[가-힣a-zA-Z0-9]/.test(line);
       if (hasKoreanOrAlnum && line.length > 2) {
         currentItem.names.push(line);
       }
    }
  }

  if (currentItem.names.length > 0 || currentItem.price !== null) {
    const statusIdx = Math.min(results.length, statusTexts.length - 1);
    results.push({
      mall,
      itemName: currentItem.names.join(' ').trim() || null,
      price: currentItem.price,
      date: currentItem.date,
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
