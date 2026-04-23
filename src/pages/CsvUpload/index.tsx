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
import { importFile, detectFileKind, UnsupportedFileTypeError } from "../../utils/fileImport";
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

const SummaryRow = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
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

const SkippedBlock = styled.div`
  padding: 14px 16px;
  border-top: 1px solid ${tokens.color.line2};
  background: ${tokens.color.foot};

  .head {
    color: ${tokens.color.warn};
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  ul {
    margin: 0;
    padding-left: 18px;
    color: ${tokens.color.ink3};
    font-size: 12px;
    line-height: 1.7;
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

  // fresh가 없어도 itemDiff가 있으면 모달 확인 흐름이 필요하므로 저장 버튼을 활성화합니다.
  const hasValidRows = Boolean(
    dupCheck && (dupCheck.fresh.length > 0 || dupCheck.itemDiff.length > 0)
  );

  const handleAiFallback = async (file: File) => {
    setIsAiFallbackLoading(true);
    setError(null);
    try {
      console.log("[AI Fallback] 시작: ", file.name);
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

      console.log("[AI Fallback] 원문 추출 완료, 길이:", rawText.length);
      const aiRows = await fallbackCsv(rawText);
      console.log("[AI Fallback] Gemini 결과:", aiRows);
      
      const finalResult = importRows(aiRows);
      console.log("[AI Fallback] 최종 파싱 결과:", finalResult);

      if (finalResult.imported.length === 0) {
         const debugMsg = JSON.stringify(aiRows).substring(0, 150);
         setError(`[개발자 디버그용] AI 복구는 되었으나 시스템 인식이 실패했습니다. 반환데이터: ${debugMsg}...`);
         setResult(null);
      } else {
         setResult(finalResult);
      }
    } catch (err) {
       setError("AI 데이터 복구 중 문제가 발생했습니다.");
       setResult(null);
    } finally {
       setIsAiFallbackLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    try {
      const parsed = await importFile(file);
      if (parsed.imported.length === 0) {
        await handleAiFallback(file);
      } else {
        setResult(parsed);
      }
    } catch (cause) {
      if (cause instanceof UnsupportedFileTypeError) {
        setError(cause.message);
        setResult(null);
      } else {
        await handleAiFallback(file);
      }
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
    const resolved = autoResolveDuplicates(dupCheck);

    if (resolved.toSave.length > 0) {
      transactionsStore.addMany(resolved.toSave);
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
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  /** 저장 버튼 레이블 */
  const confirmLabel = (() => {
    if (!dupCheck) return "파일을 먼저 올려주세요";
    const { fresh, exactDup, itemDiff } = dupCheck;
    if (fresh.length === 0 && itemDiff.length === 0 && exactDup.length > 0)
      return "저장할 새 거래가 없어요";
    if (fresh.length === 0 && itemDiff.length > 0)
      return `${itemDiff.length}건 자동 처리`;
    if (itemDiff.length > 0)
      return `${fresh.length}건 저장 · ${itemDiff.length}건 자동 처리`;
    return `${fresh.length}건 거래 저장`;
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
              onDragEnter={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
            >
              <div className="title">
                {fileName ? fileName : "카드사 이용내역 파일을 올려주세요"}
              </div>
              {isAiFallbackLoading ? (
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

            {/* 5개 집계: 총 행 / 신규 / 완전중복 / 아이템차이 / 건너뜀 */}
            <SummaryRow>
              <div className="item">
                <div className="label">총 행</div>
                <div className="value">{result.total}</div>
              </div>
              <div className="item">
                <div className="label">신규 거래</div>
                <div className="value" style={{ color: tokens.color.pos }}>
                  {dupCheck.fresh.length}
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
              <div className="item">
                <div className="label">건너뛴 행</div>
                <div
                  className="value"
                  style={{
                    color:
                      result.skipped.length > 0
                        ? tokens.color.warn
                        : tokens.color.ink4,
                  }}
                >
                  {result.skipped.length}
                </div>
              </div>
            </SummaryRow>

            {/* 신규 거래 미리보기 테이블 */}
            {dupCheck.fresh.length > 0 && (
              <PreviewTable rows={dupCheck.fresh} />
            )}

            {/* 완전 중복 안내 */}
            {dupCheck.exactDup.length > 0 && (
              <DupBlock $variant="exact">
                <div className="head">
                  이미 등록된 거래 {dupCheck.exactDup.length}건 — 저장에서 제외됩니다
                </div>
                <ul>
                  {dupCheck.exactDup.slice(0, 6).map((row) => (
                    <li key={row.id}>
                      {row.date} · {row.title} · {formatKRW(Math.abs(row.amount))}
                    </li>
                  ))}
                  {dupCheck.exactDup.length > 6 && (
                    <li>… 외 {dupCheck.exactDup.length - 6}건</li>
                  )}
                </ul>
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

            {/* 건너뛴 행 사유 */}
            {result.skipped.length > 0 && (
              <SkippedBlock>
                <div className="head">건너뛴 행 사유</div>
                <ul>
                  {result.skipped.slice(0, 8).map((item) => (
                    <li key={item.index}>
                      {item.index + 1}행: {item.reason}
                    </li>
                  ))}
                  {result.skipped.length > 8 && (
                    <li>… 외 {result.skipped.length - 8}건</li>
                  )}
                </ul>
              </SkippedBlock>
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
          onConfirm={() => navigate("/transactions")}
        />
      )}
    </AppShell>
  );
};
