/**
 * 역할: 월 선택 UI 가 참조하는 키/라벨/스탬프 유틸. 과거에는 1~4월만 하드코딩한 목업
 *       배열을 export 했지만 그 시점이 지났으므로, 이제는 다음 두 축을 모두 런타임에서
 *       계산합니다.
 *         1) "지금 시스템상 몇 년 몇 월인지" → getCurrentMonthKey / getLatestMonthKey
 *         2) "셀렉터에 노출할 가장 오래된 년도" → computeMinYear(rows.dates)
 *       데이터가 한 건도 없을 때도 셀렉터가 빈 채로 열리지 않도록 기본 5년치(현재년도−5)
 *       는 항상 보장하고, 실제 거래에 그보다 오래된 년도가 있으면 자동으로 확장됩니다.
 *       카드사·은행 등 금융권의 5년 보관 의무와도 정합합니다.
 * 위치: src\constants\months.ts
 */
import { todayAsDotDate } from "../utils/date";

export interface MonthOption {
  key: string;
  label: string;
  /**
   * MonthPicker 옆에 작게 붙어 "이 데이터가 어느 날짜 기준인지" 알리는 stamp.
   * 과거에는 월 별로 다른 더미 값이었지만, 사용자가 어느 월을 보든 "지금 본 시점이
   * 언제인지" 가 알고 싶은 정보이므로 항상 오늘 날짜(YYYY.MM.DD)로 통일합니다.
   */
  stamp: string;
}

/** 셀렉터에 보장해야 할 기본 과거 년도 깊이. 카드사·은행 보관 의무(5년)와 정합. */
const DEFAULT_MIN_YEARS_BACK = 5;

/** 정수 자릿수 보정. "YYYY-MM" 키 안전 조립용. */
const pad2 = (n: number) => String(n).padStart(2, "0");

/** 오늘 기준 "YYYY-MM" 키. 페이지 진입 시 디폴트 month state 로 사용합니다. */
export function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

/**
 * "현재 화면이 가리키는 가장 최신 월" 의미로 import 하던 LATEST_MONTH_KEY 의 후속.
 * 과거에는 모듈 로드 시점의 정적 상수였으나, 자정·월말 경계 동작까지 정확하려면
 * 호출 시점에 다시 계산하는 게 맞아 함수 형태로 노출합니다.
 */
export const getLatestMonthKey = getCurrentMonthKey;

/** "YYYY.MM.DD" 또는 "YYYY-MM-DD" / "YYYY/MM/DD" → "YYYY-MM" 키. 실패 시 빈 문자열. */
function dateStringToMonthKey(dateStr: string): string {
  const match = dateStr.match(/^(\d{4})[./-](\d{1,2})/);
  if (!match) return "";
  const [, year, month] = match;
  return `${year}-${pad2(Number(month))}`;
}

/**
 * 셀렉터에 노출할 가장 오래된 년도. 거래에 등장하는 가장 오래된 년도와
 * "현재년도 − 5" 중 더 작은 쪽(=더 옛날)을 채택합니다.
 *
 * 거래가 한 건도 없으면 현재년도 − 5 가 그대로 채택돼 빈 가계부에서도
 * 6년치(현재년도 포함) 옵션은 보장됩니다.
 */
export function computeMinYear(dates: ReadonlyArray<string>): number {
  const currentYear = new Date().getFullYear();
  const fallbackMin = currentYear - DEFAULT_MIN_YEARS_BACK;
  let earliest = currentYear;
  for (const d of dates) {
    const k = dateStringToMonthKey(d);
    if (!k) continue;
    const y = Number(k.slice(0, 4));
    if (y && y < earliest) earliest = y;
  }
  return Math.min(fallbackMin, earliest);
}

/**
 * "YYYY-MM" 키 → 화면 표시용 MonthOption.
 * 키가 비정상이면 오늘 기준 키로 폴백해 화면이 깨지지 않도록 합니다.
 * stamp 는 항상 오늘 날짜로 고정 — 화면 옆 작은 글씨가 "이 페이지를 본 시점"을
 * 표시하는 용도이기 때문입니다.
 */
export function getMonthOption(key: string): MonthOption {
  const match = key.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) {
    return getMonthOption(getCurrentMonthKey());
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || !month || month < 1 || month > 12) {
    return getMonthOption(getCurrentMonthKey());
  }
  return {
    key: `${year}-${pad2(month)}`,
    label: `${year}년 ${month}월`,
    stamp: todayAsDotDate(),
  };
}

/** "2026-04" → "2026-03" 처럼 한 달 앞 키. 1월은 전년도 12월로 넘어갑니다. */
export const getPrevMonthKey = (monthKey: string): string => {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) return monthKey;
  const prevMonthIdx = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${pad2(prevMonthIdx)}`;
};

/** "2026-04" → "2026-05" 처럼 한 달 뒤 키. 12월은 다음해 1월로 넘어갑니다. */
export const getNextMonthKey = (monthKey: string): string => {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) return monthKey;
  const nextMonthIdx = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${pad2(nextMonthIdx)}`;
};

/**
 * 과거 코드와의 호환성. 새 코드는 getLatestMonthKey() 를 직접 호출하세요.
 * 모듈 로드 시점의 값으로 굳어지지만 한 세션 내에서는 충분히 정확합니다.
 * @deprecated getLatestMonthKey() 사용을 권장합니다.
 */
export const LATEST_MONTH_KEY = getLatestMonthKey();
