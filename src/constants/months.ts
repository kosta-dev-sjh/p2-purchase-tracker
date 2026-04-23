/**
 * 역할: 여러 화면이 함께 참조하는 상수 데이터를 정의합니다.
 * 위치: src\constants\months.ts
 */
export interface MonthOption {
  key: string;
  label: string;
  stamp: string;
}

/*
 * stamp 는 MonthPicker 오른쪽에 작은 글씨로 붙는 "이 데이터가 어느 날짜 기준인지" 힌트입니다.
 * "기준"이라는 꼬리말 없이도 사용자가 '오늘 날짜와 같네, 이게 최신이구나' 하고 바로 읽히도록
 * `YYYY.MM.DD` 형태의 짧은 포맷으로만 유지합니다(불필요한 서술 제거로 가로폭 부담도 줄어듭니다).
 */
export const MONTH_OPTIONS: MonthOption[] = [
  { key: "2026-01", label: "2026년 1월", stamp: "2026.01.20" },
  { key: "2026-02", label: "2026년 2월", stamp: "2026.02.20" },
  { key: "2026-03", label: "2026년 3월", stamp: "2026.03.20" },
  { key: "2026-04", label: "2026년 4월", stamp: "2026.04.20" },
];

export const LATEST_MONTH_KEY = MONTH_OPTIONS[MONTH_OPTIONS.length - 1].key;

export const getMonthOption = (key: string) =>
  MONTH_OPTIONS.find((option) => option.key === key) ?? MONTH_OPTIONS[MONTH_OPTIONS.length - 1];

/** "2026-04" → "2026-03"처럼 한 달 앞 키를 반환합니다. 연초(1월)는 전년도 12월로 넘어갑니다. */
export const getPrevMonthKey = (monthKey: string): string => {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) return monthKey;
  const prevMonthIdx = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonthIdx).padStart(2, "0")}`;
};

