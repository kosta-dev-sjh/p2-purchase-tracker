/**
 * 역할: 모든 입력 경로(CSV, OCR, 수동입력)에서 공통으로 사용하는 중복 감지 유틸.
 *       2단계 지문(fingerprint) 비교로 완전 중복 / 아이템 차이 / 신규를 구분합니다.
 *
 * 1단계 — 트랜잭션 키: `날짜|플랫폼||금액|`
 * 2단계 — 아이템 셋: detail.items의 `name|price` 조합을 정렬한 문자열
 *
 * 위치: src/utils/duplicateCheck.ts
 */
import type { TxRow } from "../pages/Transactions/components/TransactionTable";

export interface ItemDiffEntry {
  name: string;
  price: number;
  link?: string;
}

export interface ItemChanged {
  before: ItemDiffEntry;
  after: ItemDiffEntry;
}

export interface TxItemDiff {
  /** 새로 들어온 TxRow */
  incoming: TxRow;
  /** 스토어에 이미 있는 TxRow */
  existing: TxRow;
  /** incoming에만 있는 새 아이템 */
  newItems: ItemDiffEntry[];
  /** 같은 name이지만 price가 다른 아이템 */
  changedItems: ItemChanged[];
}

export interface DuplicateCheckResult {
  /** 스토어에 없는 완전 새 거래 */
  fresh: TxRow[];
  /** 트랜잭션 + 아이템 모두 동일 → 차단 대상 */
  exactDup: TxRow[];
  /** 트랜잭션 키는 같지만 아이템이 다름 → 사용자 확인 필요 */
  itemDiff: TxItemDiff[];
}

// ─── 지문 생성 ────────────────────────────────────────────────

/**
 * 트랜잭션 1단계 키. 날짜·플랫폼·|금액|·가맹점명(title) 네 값으로 "같은 결제 건"을 식별합니다.
 * 부호(income/expense)는 포함하지 않아 환불·취소 재업로드도 잡을 수 있습니다.
 *
 * title을 포함하는 이유:
 *   - 대부분의 가맹점은 normalizeMerchant에서 platform="unspecified"로 모이기 때문에,
 *     platform+amount+date만으로는 전혀 다른 가게의 같은 금액 결제를 모두 중복으로 오탐합니다.
 *   - title(cleaned merchant)을 지문에 넣으면 가게가 다르면 즉시 구분됩니다.
 */
export function generateTxFingerprint(row: TxRow): string {
  return `${row.date}|${row.platform}|${Math.abs(row.amount)}|${row.title.trim()}`;
}

/**
 * 아이템 셋 2단계 키. name|price 조합을 정렬해 순서와 무관하게 같은 셋이면 동일한 값이 나옵니다.
 * detail 없는 거래(CSV 등)는 빈 문자열을 반환해 "아이템 없음" 상태로 취급합니다.
 */
export function generateItemsFingerprint(row: TxRow): string {
  const items = row.detail?.items;
  if (!items || items.length === 0) return "";
  return items
    .map((item) => `${item.name}|${item.price}`)
    .sort()
    .join(";");
}

// ─── 아이템 diff ──────────────────────────────────────────────

/**
 * incoming과 existing의 아이템 차이를 계산합니다.
 * - newItems: incoming에만 있는 아이템
 * - changedItems: 같은 name인데 price가 다른 아이템
 */
function diffItems(incoming: TxRow, existing: TxRow): Pick<TxItemDiff, "newItems" | "changedItems"> {
  const incomingItems = incoming.detail?.items ?? [];
  const existingItems = existing.detail?.items ?? [];

  // name 기준으로 existing 아이템 맵 생성
  const existingByName = new Map(existingItems.map((item) => [item.name, item]));

  const newItems: ItemDiffEntry[] = [];
  const changedItems: ItemChanged[] = [];

  for (const item of incomingItems) {
    const existingItem = existingByName.get(item.name);
    if (!existingItem) {
      // 이름이 없으면 신규 아이템
      newItems.push({ name: item.name, price: item.price, link: item.link });
    } else if (existingItem.price !== item.price) {
      // 이름은 같고 금액이 다르면 변경된 아이템
      changedItems.push({
        before: { name: existingItem.name, price: existingItem.price, link: existingItem.link },
        after: { name: item.name, price: item.price, link: item.link },
      });
    }
    // 완전히 같으면 무시
  }

  return { newItems, changedItems };
}

function pickBestFingerprintMatch(incoming: TxRow, candidates: TxRow[]): TxRow {
  const exact = candidates.find(
    (candidate) => generateItemsFingerprint(candidate) === generateItemsFingerprint(incoming)
  );
  if (exact) return exact;

  let best = candidates[0];
  let bestScore: [number, number, number] | null = null;

  for (const candidate of candidates) {
    const { changedItems, newItems } = diffItems(incoming, candidate);
    const score: [number, number, number] = [
      changedItems.length > 0 ? 1 : 0,
      changedItems.length,
      newItems.length,
    ];
    if (
      !bestScore ||
      score[0] < bestScore[0] ||
      (score[0] === bestScore[0] && score[1] < bestScore[1]) ||
      (score[0] === bestScore[0] && score[1] === bestScore[1] && score[2] < bestScore[2])
    ) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

// ─── 메인 함수 ────────────────────────────────────────────────

/**
 * 신규로 들어오는 TxRow 배열을 기존 스토어 데이터와 비교해 세 가지로 분류합니다.
 *
 * @param incoming - 저장 예정인 신규 거래 목록
 * @param existing - 현재 스토어의 전체 거래 목록
 */
export function checkDuplicates(
  incoming: TxRow[],
  existing: TxRow[]
): DuplicateCheckResult {
  // 빠른 조회를 위해 기존 거래를 트랜잭션 지문 기준으로 인덱싱합니다.
  const existingByFingerprint = new Map<string, TxRow[]>();
  for (const row of existing) {
    const key = generateTxFingerprint(row);
    const bucket = existingByFingerprint.get(key) ?? [];
    bucket.push(row);
    existingByFingerprint.set(key, bucket);
  }

  const fresh: TxRow[] = [];
  const exactDup: TxRow[] = [];
  const itemDiff: TxItemDiff[] = [];

  for (const row of incoming) {
    const txKey = generateTxFingerprint(row);
    const matches = existingByFingerprint.get(txKey);

    if (!matches || matches.length === 0) {
      // 1단계 키 자체가 없으면 완전 신규
      fresh.push(row);
      continue;
    }

    const match = pickBestFingerprintMatch(row, matches);

    // 1단계 키가 일치 → 2단계 아이템 셋 비교
    const incomingItemsFp = generateItemsFingerprint(row);
    const existingItemsFp = generateItemsFingerprint(match);

    if (incomingItemsFp === existingItemsFp) {
      // 트랜잭션 키 + 아이템 셋 모두 동일 → 완전 중복
      exactDup.push(row);
    } else {
      // 아이템이 다름 → diff 계산
      const { newItems, changedItems } = diffItems(row, match);
      itemDiff.push({ incoming: row, existing: match, newItems, changedItems });
    }
  }

  return { fresh, exactDup, itemDiff };
}

// ─── 자동 해결 ────────────────────────────────────────────────

export interface SkippedItem {
  title: string;
  date: string;
  amount: number;
  /** 사용자에게 보여 줄 건너뜀 사유 */
  reason: string;
}

export interface MergeAction {
  /** 기존 거래의 ID */
  existingId: string;
  /** 기존 거래에 새로 추가할 아이템 목록 */
  newItems: ItemDiffEntry[];
}

export interface AutoResolveResult {
  /** 새로 저장할 거래 (신규 + 가격 변경된 itemDiff) */
  toSave: TxRow[];
  /** 기존 거래에 아이템을 병합할 액션 (신규 아이템만 있는 itemDiff) */
  toMerge: MergeAction[];
  /** 완전 중복이라 건너뛴 거래 목록 */
  skipped: SkippedItem[];
}

/**
 * checkDuplicates 결과를 받아 사용자 개입 없이 자동으로 처리 방식을 결정합니다.
 *
 * - exactDup  → skipped (사유: "이미 동일한 내역이 등록되어 있어요")
 *   단, `forceIncludeIds`에 포함된 id는 사용자가 "중복 아님"으로 오버라이드한 것으로 보고 toSave로 이동.
 * - itemDiff, changedItems 없음 → toMerge (신규 아이템만 기존 거래에 추가)
 * - itemDiff, changedItems 있음 → toSave (가격이 달라 새 거래로 저장)
 * - fresh     → toSave
 */
export function autoResolveDuplicates(
  dupResult: DuplicateCheckResult,
  forceIncludeIds: ReadonlySet<string> = new Set(),
): AutoResolveResult {
  const toSave: TxRow[] = [...dupResult.fresh];
  const toMerge: MergeAction[] = [];
  const skipped: SkippedItem[] = [];

  // 완전 중복 → 사용자가 "그래도 저장" 체크한 건은 toSave로, 나머지는 skipped.
  for (const row of dupResult.exactDup) {
    if (forceIncludeIds.has(row.id)) {
      toSave.push(row);
      continue;
    }
    skipped.push({
      title: row.title,
      date: row.date,
      amount: row.amount,
      reason: "이미 동일한 내역이 등록되어 있어요",
    });
  }

  // 아이템 차이 → 변경 여부에 따라 분기
  for (const diff of dupResult.itemDiff) {
    if (diff.changedItems.length > 0) {
      // 가격이 달라진 아이템이 있으면 다른 구매로 보고 새 거래로 저장
      toSave.push(diff.incoming);
    } else if (diff.newItems.length > 0) {
      // 신규 아이템만 추가됐으면 기존 거래에 병합
      toMerge.push({
        existingId: diff.existing.id,
        newItems: diff.newItems,
      });
    } else {
      // newItems도 changedItems도 없으면 사실상 완전 중복
      skipped.push({
        title: diff.incoming.title,
        date: diff.incoming.date,
        amount: diff.incoming.amount,
        reason: "이미 동일한 내역이 등록되어 있어요",
      });
    }
  }

  return { toSave, toMerge, skipped };
}
