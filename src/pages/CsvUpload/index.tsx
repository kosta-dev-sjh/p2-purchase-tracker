/**
 * 역할: 카드사 이용내역 파일(CSV/XLSX)을 읽어 거래 스토어에 결제내역을 벌크 등록하는 화면입니다.
 *       업로드 → 파싱 프리뷰 → 중복 감지 → 사용자 확정 → 스토어 저장의 흐름을 가집니다.
 *       확장자를 감지해 CSV/XLSX 파서를 자동으로 선택합니다.
 * 위치: src\pages\CsvUpload\index.tsx
 */
import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { AppShell } from "../../components/layout/AppShell";
import { Button } from "../../components/primitives/Button";
import { Card, CardBd, CardHd, CardTitle } from "../../components/primitives/Card";
import { tokens } from "../../styles/tokens";
import { media } from "../../tokens/breakpoints";
import { transactionsStore, useTransactionsStore } from "../../stores/transactionsStore";
import type { CsvImportResult } from "../../utils/csvImport";
import { importFile, detectFileKind } from "../../utils/fileImport";
import { checkDuplicates, autoResolveDuplicates, type TxItemDiff, type MergeAction } from "../../utils/duplicateCheck";
import { formatKRW } from "../../utils/format";
import { decodeCsvBuffer } from "../../utils/csvParse";
import { readXlsxAsCsvText } from "../../utils/xlsxImport";
import { fallbackCsv } from "../../utils/aiService";
import { importRows } from "../../utils/csvImport";
import { PreviewTable } from "./components/PreviewTable";
import { AiLoadingIndicator } from "./components/AiLoadingIndicator";
import { SaveResultModal } from "../../components/modal/SaveResultModal";
import type { TxRow } from "../Transactions/components/TransactionTable";

/**
 * 1차 파서가 이 비율 미만으로 인식했을 때만 AI fallback을 시도합니다.
 * 카드사 양식이 살짝 어긋나도 일부만 잡히는 케이스를 잡기 위해 50%로 둡니다.
 */
const AI_FALLBACK_PICKUP_RATIO = 0.5;

const Body = styled.div`
  display: grid;
  gap: 16px;
`;

const Dropzone = styled.label<{ $active?: boolean }>`
  display: block;
  padding: 36px 24px;
  border: 2px dashed
    ${({ $active }) => ($active ? tokens.color.accent : tokens.color.line)};
  border-radius: ${tokens.radius.card};
  background: ${({ $active }) =>
    $active ? tokens.color.accentSubtle : tokens.color.panel};
  color: ${tokens.color.ink2};
  text-align: center;
  cursor: pointer;
  transition:
    border-color ${tokens.motion.fast} ease,
    background ${tokens.motion.fast} ease;

  &:hover {
    border-color: ${tokens.color.accent};
  }

  .title {
    margin-bottom: 4px;
    color: ${tokens.color.ink1};
    font-size: 14px;
    font-weight: 600;
  }

  .hint {
    color: ${tokens.color.ink4};
    font-size: 12px;
    line-height: 1.6;
  }

  input {
    display: none;
  }
`;

const SummaryRow = styled.div<{ $cols?: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols ?? 5}, 1fr);
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid ${tokens.color.line2};

  ${media.mobile} {
    grid-template-columns: repeat(2, 1fr);
  }

  .item {
    .label {
      color: ${tokens.color.ink4};
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .value {
      margin-top: 4px;
      color: ${tokens.color.ink1};
      font-size: 18px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
  }
`;

/** 완전 중복 / 아이템 차이 안내 블록 */
const DupBlock = styled.div<{ $variant: "exact" | "diff" }>`
  padding: 14px 16px;
  border-top: 1px solid ${tokens.color.line2};
  background: ${({ $variant }) =>
    $variant === "exact" ? tokens.color.negBg : tokens.color.warnBg ?? tokens.color.foot};

  .head {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 8px;
    color: ${({ $variant }) =>
      $variant === "exact" ? tokens.color.neg : tokens.color.warn};
  }

  ul {
    margin: 0;
    padding-left: 18px;
    color: ${tokens.color.ink3};
    font-size: 12px;
    line-height: 1.7;
  }
`;

/** itemDiff 한 건 행: 기존↔신규 아이템 변화를 한눈에 보여 줍니다 */
const DiffRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid ${tokens.color.line2};
  font-size: 12px;
  color: ${tokens.color.ink2};

  &:last-child {
    border-bottom: none;
  }

  .tx-title {
    flex: 1;
    font-weight: 600;
    color: ${tokens.color.ink1};
  }

  .badge-new {
    padding: 2px 6px;
    border-radius: 4px;
    background: ${tokens.color.accentSubtle};
    color: ${tokens.color.accent};
    font-size: 11px;
    font-weight: 600;
  }

  .badge-changed {
    padding: 2px 6px;
    border-radius: 4px;
    background: ${tokens.color.warnBg ?? "#fff8e1"};
    color: ${tokens.color.warn};
    font-size: 11px;
    font-weight: 600;
  }
`;

/** exactDup 체크 리스트 컨테이너: 긴 목록은 스크롤로 감쌉니다 */
const ExactDupList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 260px;
  overflow-y: auto;
  margin-top: 4px;
  padding-right: 4px;
`;

const DupCheckItem = styled.label<{ $checked: boolean }>`
  display: grid;
  grid-template-columns: auto 92px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 6px;
  background: ${({ $checked }) => ($checked ? tokens.color.accentSubtle : "transparent")};
  color: ${tokens.color.ink2};
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: ${({ $checked }) =>
      $checked ? tokens.color.accentSubtle : tokens.color.line2};
  }

  input[type="checkbox"] {
    width: 14px;
    height: 14px;
    cursor: pointer;
  }

  .date {
    color: ${tokens.color.ink3};
    font-variant-numeric: tabular-nums;
  }

  .title {
    color: ${tokens.color.ink1};
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .amount {
    color: ${tokens.color.ink1};
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;

  ${media.mobile} {
    flex-direction: column-reverse;
  }
`;

const Hint = styled.div`
  padding: 14px 16px;
  color: ${tokens.color.ink4};
  font-size: 12px;
  line-height: 1.6;
  background: ${tokens.color.foot};
  border-top: 1px solid ${tokens.color.line2};
`;

export const CsvUploadPage: React.FC = () => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const allRows = useTransactionsStore();

  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isAiFallbackLoading, setIsAiFallbackLoading] = useState(false);
  // 1차 파서(SheetJS XLSX 디코드 + importRows) 단계의 로딩 상태입니다.
  // 큰 엑셀 파일은 디코드만으로도 수 초가 걸려, 이전엔 이 구간에서 로딩 인디케이터도 안 뜨고
  // 결과/에러도 안 뜨는 "프리즈된 것처럼 보이는" 버그가 있었습니다.
  // AI fallback 과 별도 상태로 분리해, 사용자에게 항상 "분석 중" 시그널을 줍니다.
  const [isPrimaryParsing, setIsPrimaryParsing] = useState(false);

  /** 어떤 종류든 진행 중이면 dropzone 을 새 파일 입력에 잠급니다 (이중 업로드 방지). */
  const isAnyLoading = isPrimaryParsing || isAiFallbackLoading;

  // 사용자가 "이건 중복 아님, 그래도 저장"으로 체크한 exactDup 거래들의 id 집합.
  // 확정 시 autoResolveDuplicates에 전달해 skipped 대신 toSave로 넣습니다.
  const [forceIncludeIds, setForceIncludeIds] = useState<Set<string>>(new Set());

  const toggleForceInclude = (id: string) => {
    setForceIncludeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** autoResolve 실행 후 결과. 이 값이 세팅되면 결과 모달이 열립니다. */
  const [saveResult, setSaveResult] = useState<{
    savedRows: TxRow[];
    mergedActions: MergeAction[];
    skipped: ReturnType<typeof autoResolveDuplicates>["skipped"];
  } | null>(null);

  /**
   * 파싱 결과를 기존 스토어와 비교해 fresh / exactDup / itemDiff 로 분류합니다.
   * result가 없으면 null을 반환해 미리보기 카드 전체를 숨깁니다.
   */
  const dupCheck = useMemo(() => {
    if (!result || result.imported.length === 0) return null;
    return checkDuplicates(result.imported, allRows);
  }, [result, allRows]);

  /**
   * 파싱된 거래 중 할부/청구내역(billing)으로 분류된 건수를 집계합니다.
   * 사용자에게 "이 파일에 할부가 N건 들어 있다" 는 사실을 결과 카드 상단에서 즉시 알리기 위함.
   * 이전엔 PreviewTable 첫 20행만 봐야 알 수 있었고, 일시불 위주 파일에서 할부가 묻혀버렸습니다.
   */
  const installmentCount = useMemo(() => {
    if (!result) return 0;
    return result.imported.reduce((acc, row) => {
      const mode = row.detail?.cardImport?.paymentMode;
      const kind = row.detail?.cardImport?.recordKind;
      if (mode === "installment" || kind === "billing") return acc + 1;
      return acc;
    }, 0);
  }, [result]);

  // fresh/itemDiff가 없어도 사용자가 exactDup을 "그래도 저장"으로 오버라이드했다면 저장 흐름 활성화.
  const hasValidRows = Boolean(
    dupCheck &&
      (dupCheck.fresh.length > 0 ||
        dupCheck.itemDiff.length > 0 ||
        forceIncludeIds.size > 0)
  );

  const handleAiFallback = async (file: File) => {
    setIsAiFallbackLoading(true);
    setError(null);
    try {
      let rawText = "";
      const kind = detectFileKind(file.name);
      if (kind === "csv") {
        rawText = decodeCsvBuffer(await file.arrayBuffer());
      } else if (kind === "xlsx") {
        rawText = await readXlsxAsCsvText(file);
      }

      if (!rawText) {
        throw new Error("파일을 읽을 수 없습니다.");
      }

      const aiRows = await fallbackCsv(rawText);
      const finalResult = importRows(aiRows);

      if (finalResult.imported.length === 0) {
        setError(
          "파일에서 거래 내역을 찾지 못했어요. 다른 양식으로 저장해 다시 시도해 주세요.",
        );
        setResult(null);
      } else {
        setResult(finalResult);
      }
    } catch {
      setError("AI 데이터 복구 중 문제가 발생했습니다.");
      setResult(null);
    } finally {
      setIsAiFallbackLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    // 이전 파일에 대한 결과·에러·"그래도 저장" 선택을 모두 초기화해야 다음 파일 결과가
    // 깨끗한 상태에서 보입니다. (이전엔 결과만 남고 에러가 안 지워져 표시가 꼬였음.)
    setError(null);
    setResult(null);
    setForceIncludeIds(new Set());
    setFileName(file.name);

    // ─── 1차 파서 단계 진입: 로딩 시그널 ON ─────────────────────────
    // XLSX 디코드가 동기적으로 끝나지 않아도 사용자에게 "분석 중" 메시지가 즉시 보입니다.
    setIsPrimaryParsing(true);
    try {
      const parsed = await importFile(file);

      // 인식률(imported/total)이 AI_FALLBACK_PICKUP_RATIO 미만이면 AI로 보강.
      // 카드사 양식이 살짝 달라져 일부만 잡히는 케이스를 함께 커버합니다.
      const pickup =
        parsed.total > 0 ? parsed.imported.length / parsed.total : 0;
      const shouldFallback =
        parsed.imported.length === 0 || pickup < AI_FALLBACK_PICKUP_RATIO;

      if (shouldFallback) {
        // AI fallback 으로 넘어갈 때는 1차 로딩 플래그를 먼저 내려, 인디케이터 메시지가
        // "AI 가 분석 중" 쪽으로 이어지게 합니다 (handleAiFallback 이 자체 플래그를 켭니다).
        setIsPrimaryParsing(false);
        await handleAiFallback(file);
      } else {
        setResult(parsed);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `파일을 읽는 중 오류가 발생했습니다: ${err.message}`
          : "파일 처리 중 알 수 없는 오류가 발생했습니다."
      );
      setResult(null);
    } finally {
      // try 안에서 이미 false 로 내렸어도 finally 에서 한 번 더 보정 — 어떤 경로로 빠져나가도
      // dropzone 이 영구 잠기지 않도록 보장합니다.
      setIsPrimaryParsing(false);
    }
  };

  /**
   * autoResolveDuplicates로 전체 케이스를 자동 처리합니다.
   * - exactDup → 건너뜀 (skipped에 기록)
   * - itemDiff 신규 아이템만 → 기존 거래에 병합 (toMerge)
   * - itemDiff 금액 변경 → 새 거래로 저장 (toSave)
   * - fresh → 그대로 저장 (toSave)
   */
  const handleConfirm = () => {
    if (!dupCheck) return;
    const resolved = autoResolveDuplicates(dupCheck, forceIncludeIds);

    if (resolved.toSave.length > 0) {
      // CSV 경로: 가맹점명 기반 카테고리 자동추정을 저장 경계에서 태운다.
      transactionsStore.addFromImport(resolved.toSave);
    }
    for (const action of resolved.toMerge) {
      transactionsStore.appendItemsToTransaction(action.existingId, action.newItems, "MANUAL");
    }

    setSaveResult({
      savedRows: resolved.toSave,
      mergedActions: resolved.toMerge,
      skipped: resolved.skipped,
    });
  };

  const handleReset = () => {
    setFileName(null);
    setResult(null);
    setError(null);
    setSaveResult(null);
    setForceIncludeIds(new Set());
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  /** 저장 버튼 레이블 */
  const confirmLabel = (() => {
    if (!dupCheck) return "파일을 먼저 올려주세요";
    const { fresh, exactDup, itemDiff } = dupCheck;
    const forced = forceIncludeIds.size;
    const saveCount = fresh.length + forced;
    if (saveCount === 0 && itemDiff.length === 0 && exactDup.length > 0)
      return "저장할 새 거래가 없어요";
    if (saveCount === 0 && itemDiff.length > 0)
      return `${itemDiff.length}건 자동 처리`;
    if (itemDiff.length > 0)
      return `${saveCount}건 저장 · ${itemDiff.length}건 자동 처리`;
    return `${saveCount}건 거래 저장`;
  })();

  return (
    <AppShell
      activeNav="upload"
      crumb="입력 · 카드 내역"
      title="카드 내역 가져오기"
    >
      <Body>
        <Card padding={0}>
          <CardHd>
            <CardTitle>CSV 또는 엑셀 업로드</CardTitle>
          </CardHd>
          <CardBd>
            <Dropzone
              data-tour="csv-zone"
              $active={dragActive}
              // 로딩 중에는 dropzone 자체가 새 입력을 받지 않도록 잠궈, 동일 파일을 두 번
              // 처리하거나 1차 파싱 중에 새 파일이 끼어드는 race 를 막습니다.
              aria-busy={isAnyLoading}
              style={isAnyLoading ? { pointerEvents: "none", opacity: 0.85 } : undefined}
              onDragEnter={(e) => {
                e.preventDefault();
                if (isAnyLoading) return;
                setDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (isAnyLoading) return;
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (isAnyLoading) return;
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
            >
              <div className="title">
                {fileName ? fileName : "카드사 이용내역 파일을 올려주세요"}
              </div>
              {/*
                로딩 인디케이터 노출 규칙:
                - 1차 파서 진행 중(isPrimaryParsing): "엑셀을 스캔" 카피로 즉시 시그널.
                - AI fallback 진행 중(isAiFallbackLoading): 동일 컴포넌트로 메시지를 이어서 회전.
                둘 다 아니면 정적 hint 텍스트.
                이전 버전은 isAiFallbackLoading 만 보고 있어, 1차 파서가 큰 XLSX 를 디코드하는
                구간에서 dropzone 이 hint 를 그대로 보여주는 "정적 프리즈" 버그를 일으켰습니다.
              */}
              {isAnyLoading ? (
                <AiLoadingIndicator />
              ) : (
                <div className="hint">
                  CSV, XLSX, XLS 모두 지원합니다. 클릭하거나 파일을 끌어다 놓으세요.
                  <br />
                  헤더는 이용일 / 가맹점명 / 이용금액 / (선택)카테고리 형식을 따르며, 상단 안내 행이 있어도 자동으로 건너뜁니다.
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                disabled={isAnyLoading}
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </Dropzone>
            {error && (
              <div
                style={{
                  marginTop: 12,
                  color: tokens.color.neg,
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            )}
          </CardBd>
        </Card>

        {result && dupCheck && (
          <Card padding={0}>
            <CardHd>
              <CardTitle>파싱 결과 미리보기</CardTitle>
            </CardHd>

            {/*
              집계 타일: 신규 / 할부 / 완전중복 / 아이템차이
              "총 행"은 카드사 파일에 섞인 안내·합계 행까지 포함한 raw 카운트라
              유저 입장에서는 의미가 약하고, 신규 거래 수와 차이가 나면 오히려 "왜 다르지?"라는
              불안감을 주기 쉬워서 표시하지 않습니다(QA 피드백 반영).
            */}
            <SummaryRow $cols={4}>
              <div className="item">
                <div className="label">신규 거래</div>
                <div className="value" style={{ color: tokens.color.pos }}>
                  {dupCheck.fresh.length}
                </div>
              </div>
              <div className="item">
                <div className="label">할부</div>
                <div
                  className="value"
                  style={{
                    color:
                      installmentCount > 0
                        ? tokens.color.tag.installment.fg
                        : tokens.color.ink4,
                  }}
                >
                  {installmentCount}
                </div>
              </div>
              <div className="item">
                <div className="label">완전 중복</div>
                <div
                  className="value"
                  style={{
                    color:
                      dupCheck.exactDup.length > 0
                        ? tokens.color.neg
                        : tokens.color.ink4,
                  }}
                >
                  {dupCheck.exactDup.length}
                </div>
              </div>
              <div className="item">
                <div className="label">아이템 차이</div>
                <div
                  className="value"
                  style={{
                    color:
                      dupCheck.itemDiff.length > 0
                        ? tokens.color.warn
                        : tokens.color.ink4,
                  }}
                >
                  {dupCheck.itemDiff.length}
                </div>
              </div>
            </SummaryRow>

            {/* 신규 거래 미리보기 테이블 */}
            {dupCheck.fresh.length > 0 && (
              <PreviewTable rows={dupCheck.fresh} />
            )}

            {/* 완전 중복 안내 — 체크박스로 "그래도 저장" 오버라이드 가능 */}
            {dupCheck.exactDup.length > 0 && (
              <DupBlock $variant="exact">
                <div className="head">
                  이미 등록된 듯한 거래 {dupCheck.exactDup.length}건 — 기본은 저장에서 제외됩니다.
                  같은 가게·같은 날·같은 금액이지만 실제로 별개 결제면 체크해서 "그래도 저장"하세요.
                </div>
                <ExactDupList>
                  {dupCheck.exactDup.map((row) => {
                    const checked = forceIncludeIds.has(row.id);
                    return (
                      <DupCheckItem key={row.id} $checked={checked}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleForceInclude(row.id)}
                        />
                        <span className="date">{row.date}</span>
                        <span className="title">{row.title}</span>
                        <span className="amount">{formatKRW(Math.abs(row.amount))}</span>
                      </DupCheckItem>
                    );
                  })}
                </ExactDupList>
              </DupBlock>
            )}

            {/* 아이템 차이 안내 */}
            {dupCheck.itemDiff.length > 0 && (
              <DupBlock $variant="diff">
                <div className="head">
                  아이템이 다른 거래 {dupCheck.itemDiff.length}건 — 신규 아이템은 기존 거래에 병합, 금액 변경은 새 거래로 자동 저장됩니다
                </div>
                {dupCheck.itemDiff.slice(0, 5).map((diff: TxItemDiff) => (
                  <DiffRow key={diff.existing.id}>
                    <span className="tx-title">
                      {diff.existing.date} · {diff.existing.title}
                    </span>
                    {diff.newItems.length > 0 && (
                      <span className="badge-new">
                        +{diff.newItems.length}개 추가
                      </span>
                    )}
                    {diff.changedItems.length > 0 && (
                      <span className="badge-changed">
                        {diff.changedItems.length}개 금액 변경
                      </span>
                    )}
                  </DiffRow>
                ))}
                {dupCheck.itemDiff.length > 5 && (
                  <div style={{ fontSize: 12, color: tokens.color.ink4, marginTop: 6 }}>
                    … 외 {dupCheck.itemDiff.length - 5}건
                  </div>
                )}
              </DupBlock>
            )}

            <Hint>
              카드사 이용내역 파일은 상품 상세를 포함하지 않아, 여기서는 플랫폼·금액·날짜 중심으로 등록됩니다.
              상품 정보는 이후 OCR 업로드 또는 수동 입력에서 해당 거래에 덧붙일 수 있습니다.
            </Hint>
          </Card>
        )}

        <Actions>
          <Button variant="ghost" size="lg" onClick={handleReset}>
            다시 선택
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={handleConfirm}
            disabled={!hasValidRows}
          >
            {confirmLabel}
          </Button>
        </Actions>
      </Body>

      {saveResult && (
        <SaveResultModal
          isOpen
          savedRows={saveResult.savedRows}
          mergedActions={saveResult.mergedActions}
          allRows={allRows}
          skipped={saveResult.skipped}
          onConfirm={() => {
            // 저장된 거래 중 가장 많은 년월의 대표 날짜를 targetDate로 전달합니다.
            const source = result?.imported ?? saveResult.savedRows;
            const counts: Record<string, { count: number; date: string }> = {};
            for (const row of source) {
              const match = row.date.match(/(\d{4})[./-](\d{1,2})/);
              if (!match) continue;
              const key = `${match[1]}-${match[2].padStart(2, "0")}`;
              if (!counts[key]) counts[key] = { count: 0, date: row.date };
              counts[key].count += 1;
            }
            const dominant = Object.values(counts).sort((a, b) => b.count - a.count)[0];
            navigate("/transactions", dominant ? { state: { targetDate: dominant.date } } : undefined);
          }}
        />
      )}
    </AppShell>
  );
};
