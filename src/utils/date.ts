/**
 * 역할: 앱 전반에서 쓰는 날짜 문자열 변환 유틸.
 *       TxRow.date는 "YYYY.MM.DD" 형식으로 저장되고, 네이티브 <input type="date">는
 *       ISO(YYYY-MM-DD)를 요구하기 때문에 UI 경계에서 양방향 변환이 필요합니다.
 *       Firebase로 확장할 경우 이 파일의 함수만 Timestamp 변환으로 바꾸면 되도록
 *       변환 로직을 한 곳에 모았습니다.
 * 위치: src\utils\date.ts
 */

/** 내부에서 쓰는 공통 date 정규식. YYYY(.|-|/)MM(.|-|/)DD 변형을 모두 허용합니다. */
const DATE_REGEX = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/;

/**
 * 저장 포맷(YYYY.MM.DD) → ISO(YYYY-MM-DD).
 * <input type="date">의 value에 넣기 위한 변환. 파싱에 실패하면 빈 문자열을 돌려
 * 컨트롤드 input이 "빈 값"으로 안전하게 그려지게 합니다.
 */
export function toIsoDate(dotDate: string): string {
  if (!dotDate) return "";
  const match = dotDate.trim().match(DATE_REGEX);
  if (!match) return "";
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * ISO(YYYY-MM-DD) → 저장 포맷(YYYY.MM.DD).
 * <input type="date">의 onChange 값은 항상 ISO이므로 바로 이 함수로 정규화합니다.
 */
export function fromIsoDate(isoDate: string): string {
  if (!isoDate) return "";
  const match = isoDate.trim().match(DATE_REGEX);
  if (!match) return "";
  const [, y, m, d] = match;
  return `${y}.${m.padStart(2, "0")}.${d.padStart(2, "0")}`;
}

/**
 * 오늘 날짜를 저장 포맷(YYYY.MM.DD)으로 반환. 수동 입력 폼의 디폴트 등
 * 여러 곳에서 반복되는 '오늘' 조합을 한 곳으로 모읍니다.
 */
export function todayAsDotDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

/**
 * 저장 포맷 문자열의 유효성 검사. 형식이 맞을 뿐 아니라 실제 캘린더에 존재하는
 * 날짜인지까지 확인합니다(예: 2026.02.30은 거부).
 */
export function isValidDotDate(value: string): boolean {
  const match = value.trim().match(DATE_REGEX);
  if (!match) return false;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const probe = new Date(year, month - 1, day);
  return (
    probe.getFullYear() === year &&
    probe.getMonth() === month - 1 &&
    probe.getDate() === day
  );
}
