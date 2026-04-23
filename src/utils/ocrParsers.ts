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
}

export function parseCoupangOrderText(rawText: string): PurchaseOCRResult[] {
  const ignoredKeywords = [
    '쿠팡', '마이쿠팡', '주문완료', '결제', '무료배송', '배송중', '상세보기', '리뷰쓰기',
    '주문목록', '주문한상품', '검색할수', '자주산상품', '더보기', '배송완료', '도착',
    '장바구니', '담기', '문의하기', '구매후기', '업체직접배송', '판매자에게',
    '교환', '반품', '신청', '고환', '주문 상세보기', '주문', '판매자 문의', '노착', 'sees'
  ];

  let lines = rawText.split('\n').map(line => {
    let cleaned = line;
    ignoredKeywords.forEach(kw => {
      cleaned = cleaned.split(kw).join(' ');
    });
    cleaned = cleaned.replace(/^[\s\|ㅣ<\-—©=_]+/g, '');
    cleaned = cleaned.replace(/[>:]\s*$/, '');
    return cleaned.trim();
  }).filter(line => line.length > 0);

  const mall = rawText.includes('쿠팡') ? '쿠팡' : '쿠팡(추정)';
  const priceRegex = /([0-9][\d\s,A-Za-z]{0,10})\s*원/; 
  const dateRegex = /(\d{4})[.\s-]+(\d{1,2})[.\s-]+(\d{1,2})/;

  const results: PurchaseOCRResult[] = [];
  
  let currentItem: { date: string | null, names: string[], price: number | null } = {
    date: null,
    names: [],
    price: null
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      if (currentItem.names.length > 0 || currentItem.price !== null) {
        results.push({
          mall,
          itemName: currentItem.names.join(' ').trim() || null,
          price: currentItem.price,
          date: currentItem.date,
          rawText
        });
        currentItem = { date: null, names: [], price: null };
      }
      const mm = dateMatch[2].padStart(2, '0');
      const dd = dateMatch[3].padStart(2, '0');
      currentItem.date = `${dateMatch[1]}-${mm}-${dd}`;
      continue;
    }

    const priceMatch = line.match(priceRegex);
    if (priceMatch) {
      const numStr = priceMatch[1].replace(/[^\d]/g, '');
      if (numStr) {
        currentItem.price = Number(numStr);
      }
      results.push({
        mall,
        itemName: currentItem.names.join(' ').trim() || null,
        price: currentItem.price,
        date: currentItem.date,
        rawText
      });
      const lastDate = currentItem.date;
      currentItem = { date: lastDate, names: [], price: null };
      continue;
    }

    const hasKorean = /[가-힣]/.test(line);
    if (hasKorean && line.length > 2) {
      currentItem.names.push(line);
    }
  }

  if (currentItem.names.length > 0 || currentItem.price !== null) {
    results.push({
      mall,
      itemName: currentItem.names.join(' ').trim() || null,
      price: currentItem.price,
      date: currentItem.date,
      rawText
    });
  }

  if (results.length === 0) {
    return [{ mall, itemName: null, price: null, date: null, rawText }];
  }

  return results;
}

export function parseNaverOrderText(rawText: string): PurchaseOCRResult[] {
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

    results.push({
      mall,
      itemName,
      price,
      date,
      rawText
    });
  }

  if (results.length === 0) {
    return [{ mall, itemName: null, price: null, date: null, rawText }];
  }

  return results;
}

export function parseAuctionOrderText(rawText: string): PurchaseOCRResult[] {
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
          results.push({
            mall,
            itemName: currentItem.names.join(' ').trim() || null,
            price: currentItem.price,
            date: currentItem.date,
            rawText
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

      results.push({
        mall,
        itemName: currentItem.names.join(' ').trim() || null,
        price: currentItem.price,
        date: currentItem.date,
        rawText
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
    results.push({
      mall,
      itemName: currentItem.names.join(' ').trim() || null,
      price: currentItem.price,
      date: currentItem.date,
      rawText
    });
  }

  if (results.length === 0) {
    return [{ mall, itemName: null, price: null, date: null, rawText }];
  }

  return results;
}

export function parseTemuOrderText(rawText: string): PurchaseOCRResult[] {
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
            rawText
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
                 rawText
               });
             }
           }
        }
      }
    }
  }

  if (results.length === 0) {
    return [{ mall, itemName: null, price: null, date: orderDate, rawText }];
  }

  return results;
}
