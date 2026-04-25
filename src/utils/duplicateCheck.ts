/**
 * 역할: 모든 입력 경로(CSV, OCR, 수동입력)에서 공통으로 사용하는 중복 감지 유틸.
 *       2단계 지문(fingerprint) 비교로 완전 중복 / 아이템 차이 / 신규를 구분합니다.
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
  incoming: TxRow;
  existing: TxRow;
  newItems: ItemDiffEntry[];
  changedItems: ItemChanged[];
}

export interface DuplicateCheckResult {
  fresh: TxRow[];
  exactDup: TxRow[];
  itemDiff: TxItemDiff[];
}

// ─── 지문 생성 ────────────────────────────────────────────────

/**
 * 트랜잭션 1단계 키.
 */
export function generateTxFingerprint(row: TxRow): string {
  if (!row) return "empty-row";
  const date = row.date || "0000.00.00";
  const platform = row.platform || "unspecified";
  const amount = Math.abs(row.amount || 0);
  const title = (row.title || "알 수 없음").trim();
  
  return `${date}|${platform}|${amount}|${title}`;
}

/**
 * 아이템 셋 2단계 키. 
 * 객체 구조가 깨져있을 가능성에 대비해 매우 방어적으로 작성합니다.
 */
export function generateItemsFingerprint(row: TxRow): string {
  if (!row || !row.detail || !Array.isArray(row.detail.items)) return "";
  
  return row.detail.items
    .filter(item => item && typeof item === 'object') // 아이템이 유효한 객체인지 확인
    .map((item) => {
      const name = String(item.name || "상품명없음").trim();
      const price = Number(item.price || 0);
      return `${name}|${price}`;
    })
    .sort()
    .join(";");
}

// ─── 아이템 diff ──────────────────────────────────────────────

function diffItems(incoming: TxRow, existing: TxRow): Pick<TxItemDiff, "newItems" | "changedItems"> {
  const incomingItems = (incoming?.detail?.items || []) as ItemDiffEntry[];
  const existingItems = (existing?.detail?.items || []) as ItemDiffEntry[];

  const existingByName = new Map<string, ItemDiffEntry>();
  existingItems.forEach(item => {
    if (item && item.name) existingByName.set(item.name, item);
  });

  const newItems: ItemDiffEntry[] = [];
  const changedItems: ItemChanged[] = [];

  incomingItems.forEach(item => {
    if (!item) return;
    const existingItem = existingByName.get(item.name);
    if (!existingItem) {
      newItems.push({ name: item.name, price: item.price, link: item.link });
    } else if (Number(existingItem.price) !== Number(item.price)) {
      changedItems.push({
        before: { name: existingItem.name, price: existingItem.price, link: existingItem.link },
        after: { name: item.name, price: item.price, link: item.link },
      });
    }
  });

  return { newItems, changedItems };
}

function pickBestFingerprintMatch(incoming: TxRow, candidates: TxRow[]): TxRow {
  const incomingFp = generateItemsFingerprint(incoming);
  const exact = candidates.find(
    (candidate) => generateItemsFingerprint(candidate) === incomingFp
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

export function checkDuplicates(
  incoming: TxRow[],
  existing: TxRow[]
): DuplicateCheckResult {
  if (!Array.isArray(incoming)) return { fresh: [], exactDup: [], itemDiff: [] };
  const safeExisting = Array.isArray(existing) ? existing : [];

  const existingByFingerprint = new Map<string, TxRow[]>();
  for (const row of safeExisting) {
    if (!row) continue;
    const key = generateTxFingerprint(row);
    const bucket = existingByFingerprint.get(key) ?? [];
    bucket.push(row);
    existingByFingerprint.set(key, bucket);
  }

  const fresh: TxRow[] = [];
  const exactDup: TxRow[] = [];
  const itemDiff: TxItemDiff[] = [];

  for (const row of incoming) {
    if (!row) continue;
    const txKey = generateTxFingerprint(row);
    const matches = existingByFingerprint.get(txKey);

    if (!matches || matches.length === 0) {
      fresh.push(row);
      continue;
    }

    const match = pickBestFingerprintMatch(row, matches);
    const incomingItemsFp = generateItemsFingerprint(row);
    const existingItemsFp = generateItemsFingerprint(match);

    if (incomingItemsFp === existingItemsFp) {
      exactDup.push(row);
    } else {
      const { newItems, changedItems } = diffItems(row, match);
      itemDiff.push({ incoming: row, existing: match, newItems, changedItems });
    }
  }

  return { fresh, exactDup, itemDiff };
}

export interface SkippedItem {
  title: string;
  date: string;
  amount: number;
  reason: string;
}

export interface MergeAction {
  existingId: string;
  newItems: ItemDiffEntry[];
}

export interface AutoResolveResult {
  toSave: TxRow[];
  toMerge: MergeAction[];
  skipped: SkippedItem[];
}

export function autoResolveDuplicates(
  dupResult: DuplicateCheckResult,
  forceIncludeIds: ReadonlySet<string> = new Set(),
): AutoResolveResult {
  const toSave: TxRow[] = [...(dupResult?.fresh || [])];
  const toMerge: MergeAction[] = [];
  const skipped: SkippedItem[] = [];

  const exactDups = dupResult?.exactDup || [];
  for (const row of exactDups) {
    if (forceIncludeIds.has(row.id)) {
      toSave.push(row);
      continue;
    }
    skipped.push({
      title: row.title || "알 수 없음",
      date: row.date || "0000.00.00",
      amount: row.amount || 0,
      reason: "이미 동일한 내역이 등록되어 있어요",
    });
  }

  const itemDiffs = dupResult?.itemDiff || [];
  for (const diff of itemDiffs) {
    if (diff.changedItems.length > 0) {
      toSave.push(diff.incoming);
    } else if (diff.newItems.length > 0) {
      toMerge.push({
        existingId: diff.existing.id,
        newItems: diff.newItems,
      });
    } else {
      skipped.push({
        title: diff.incoming.title || "알 수 없음",
        date: diff.incoming.date || "0000.00.00",
        amount: diff.incoming.amount || 0,
        reason: "이미 동일한 내역이 등록되어 있어요",
      });
    }
  }

  return { toSave, toMerge, skipped };
}
