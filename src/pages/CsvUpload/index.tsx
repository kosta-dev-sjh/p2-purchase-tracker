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

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                          ⚠ 디버그 전용 영역 ⚠                            ║
// ║   DEBUG_CSV_UPLOAD 는 배포 전에 반드시 false 로 되돌려 주세요.            ║
// ║   true 일 때 노출되는 것:                                                ║
// ║     • 파서 전략 토글 버튼 (자동 / 1차 파서만 / AI만)                     ║
// ║     • "건너뛴 행 사유" 블록                                              ║
// ║     • [AI Fallback] 콘솔 로그                                            ║
// ║   false 로 두면 유저 UI는 완전히 깔끔해집니다.                           ║
// ║   TODO(pfe-24): 1차 파서가 안정화되고 임계치가 확정되면 이 스위치 제거.  ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const DEBUG_CSV_UPLOAD = true;

/**
 * 1차 파서가 이 비율 미만으로 인식했을 때만 AI fallback을 시도합니다.
 * - 기존엔 `imported.length === 0`일 때만 넘어갔으나, 카드사 양식이 조금만 어긋나도
 *   일부만 잡히고 대다수는 "날짜 형식 읽을 수 없음"으로 떨어지는 케이스가 있어 확장.
 * - 실제 카드사 데이터로 튜닝 전까지는 50%를 기본값으로 둡니다.
 *   TODO(pfe-24): 신한/KB/삼성/현대 등 양식별 실측 후 조정.
 */
const AI_FALLBACK_PICKUP_RATIO = 0.5;

type ParserStrategy = "auto" | "parserOnly" | "aiOnly";

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

/* ───── 디버그 전용 스타일 (DEBUG_CSV_UPLOAD=true 일 때만 렌더됨) ───── */
const DebugToolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 10px 12px;
  margin-bottom: 12px;
  border: 1px dashed ${tokens.color.warn};
  border-radius: ${tokens.radius.card};
  background: ${tokens.color.warnBg ?? "#fff8e1"};
  color: ${tokens.color.ink2};
  font-size: 12px;

  .tag {
    font-weight: 700;
    color: ${tokens.color.warn};
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .spacer {
    flex: 1;
  }
`;

const DebugPill = styled.button<{ $active: boolean }>`
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid
    ${({ $active }) => ($active ? tokens.color.warn : tokens.color.line)};
  background: ${({ $active }) =>
    $active ? tokens.color.warn : tokens.color.panel};
  color: ${({ $active }) => ($active ? "#fff" : tokens.color.ink2)};
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    border-color: ${tokens.color.warn};
  }
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

  // ─── DEBUG 전용 상태: 파서 전략 토글 ─────────────────────────────
  //   "auto"       → 기본 동작. 1차 파서 → 인식률 낮으면 AI fallback.
  //   "parserOnly" → 1차 파서만 돌림. AI 호출 완전 차단(네트워크/비용 검증용).
  //   "aiOnly"     → 1차 파서 건너뛰고 바로 AI로 보냄(프롬프트 품질 비교용).
  //   DEBUG_CSV_UPLOAD=false 로 두면 화면에는 선택지가 뜨지 않고 항상 "auto".
  const [parserStrategy, setParserStrategy] = useState<ParserStrategy>("auto");

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
      // DEBUG_CSV_UPLOAD=true 일 때만 상세 로그를 찍습니다.
      // TODO(pfe-24): 정식 로깅(Sentry breadcrumb 등) 도입 후 이 라인들을 제거.
      if (DEBUG_CSV_UPLOAD) console.log("[AI Fallback] 시작:", file.name);

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

      if (DEBUG_CSV_UPLOAD)
        console.log("[AI Fallback] 원문 추출 완료, 길이:", rawText.length);

      const aiRows = await fallbackCsv(rawText);
      if (DEBUG_CSV_UPLOAD) console.log("[AI Fallback] Gemini 결과:", aiRows);

      const finalResult = importRows(aiRows);
      if (DEBUG_CSV_UPLOAD)
        console.log("[AI Fallback] 최종 파싱 결과:", finalResult);

      if (finalResult.imported.length === 0) {
        if (DEBUG_CSV_UPLOAD) {
          const debugMsg = JSON.stringify(aiRows).substring(0, 150);
          setError(
            `[개발자 디버그용] AI 복구는 되었으나 시스템 인식이 실패했습니다. 반환데이터: ${debugMsg}...`,
          );
        } else {
          setError(
            "파일에서 거래 내역을 찾지 못했어요. 다른 양식으로 저장해 다시 시도해 주세요.",
          );
        }
        setResult(null);
      } else {
        setResult(finalResult);
      }
    } catch (err) {
      if (DEBUG_CSV_UPLOAD) console.error("[AI Fallback] 실패:", err);
      setError("AI 데이터 복구 중 문제가 발생했습니다.");
      setResult(null);
    } finally {
      setIsAiFallbackLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    // 새 파일을 올리면 이전 파일의 "그래도 저장" 선택은 더 이상 의미 없으므로 초기화.
    setForceIncludeIds(new Set());

    // ─── DEBUG 전용 분기 ─────────────────────────────────────────────
    // DEBUG_CSV_UPLOAD=false 일 때는 항상 "auto"로 강제해 유저 경험을 고정합니다.
    const effectiveStrategy: ParserStrategy = DEBUG_CSV_UPLOAD
      ? parserStrategy
      : "auto";

    if (effectiveStrategy === "aiOnly") {
      // 1차 파서 건너뛰고 바로 Gemini로. 프롬프트 품질을 순수 비교할 때 사용.
      await handleAiFallback(file);
      return;
    }

    try {
      const parsed = await importFile(file);

      // "1차 파서만" 모드에서는 결과를 그대로 노출해, 실제 파서 인식률이 얼마인지
      // 디버깅할 수 있게 합니다. (인식률 낮아도 AI로 안 넘어감)
      if (effectiveStrategy === "parserOnly") {
        setResult(parsed);
        return;
      }

      // ─── AUTO 모드 기본 흐름 ──────────────────────────────────────
      // 기존: imported === 0 일 때만 AI fallback.
      // 변경: 인식률(imported/total)이 AI_FALLBACK_PICKUP_RATIO 미만이면 AI로 보강.
      //       카드사 양식이 살짝만 달라져도 일부만 잡히는 케이스를 잡기 위함.
      // TODO(pfe-24): 합계/광고 행이 많은 파일에서는 비율만으로 과호출 가능.
      //               카드사별 최소 인식 건수 하한 같은 2차 조건을 추가 검토.
      const pickup =
        parsed.total > 0 ? parsed.imported.length / parsed.total : 0;
      const shouldFallback =
        parsed.imported.length === 0 || pickup < AI_FALLBACK_PICKUP_RATIO;

      if (shouldFallback) {
        if (DEBUG_CSV_UPLOAD) {
          console.log(
            `[CsvUpload] 1차 파서 인식률 ${(pickup * 100).toFixed(1)}% — AI fallback 실행`,
            { imported: parsed.imported.length, total: parsed.total },
          );
        }
        await handleAiFallback(file);
      } else {
        setResult(parsed);
      }
    } catch (err) {
      console.error("[CsvUpload] 파일 처리 중 오류:", err);
      setError(
        err instanceof Error
          ? `파일을 읽는 중 오류가 발생했습니다: ${err.message}`
          : "파일 처리 중 알 수 없는 오류가 발생했습니다."
      );
      setResult(null);
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
            {/* ══════════════════════════════════════════════════════════════
                ⚠ 디버그 툴바 — DEBUG_CSV_UPLOAD=false 로 바꾸면 통째로 사라짐
                TODO(pfe-24): QA 끝나면 이 블록과 DEBUG_CSV_UPLOAD 스위치 삭제.
                ══════════════════════════════════════════════════════════════ */}
            {DEBUG_CSV_UPLOAD && (
              <DebugToolbar>
                <span className="tag">DEBUG</span>
                <span>파서 전략:</span>
                <DebugPill
                  type="button"
                  $active={parserStrategy === "auto"}
                  onClick={() => setParserStrategy("auto")}
                >
                  자동 (파서 → AI)
                </DebugPill>
                <DebugPill
                  type="button"
                  $active={parserStrategy === "parserOnly"}
                  onClick={() => setParserStrategy("parserOnly")}
                >
                  1차 파서만
                </DebugPill>
                <DebugPill
                  type="button"
                  $active={parserStrategy === "aiOnly"}
                  onClick={() => setParserStrategy("aiOnly")}
                >
                  AI만
                </DebugPill>
                <span className="spacer" />
                <span style={{ color: tokens.color.ink4 }}>
                  임계 인식률 {(AI_FALLBACK_PICKUP_RATIO * 100).toFixed(0)}%
                </span>
              </DebugToolbar>
            )}

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

            {/*
              집계 타일: 총 행 / 신규 / 완전중복 / 아이템차이 / (DEBUG만) 건너뜀
              TODO(pfe-24): 유저에게 "건너뛴 행"은 노이즈라서 DEBUG 모드에서만 노출.
                          QA 후 "건너뛴 행" 타일과 grid $cols prop을 영구 제거 예정.
            */}
            <SummaryRow $cols={DEBUG_CSV_UPLOAD ? 5 : 4}>
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
              {DEBUG_CSV_UPLOAD && (
                <div className="item">
                  <div className="label">건너뛴 행 (DEBUG)</div>
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
              )}
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

            {/* ═════════════════════════════════════════════════════════════
                건너뛴 행 사유 — 유저에게는 노이즈라서 DEBUG 모드에서만 표시.
                실제 유저에게는 상단 "건너뛴 행" 개수만 보이면 충분합니다.
                TODO(pfe-24): 건너뛴 사유 분류(요약 행 / 헤더 행 / 파싱 실패)를
                            정제한 뒤 "파싱 실패"만 유저 메시지로 재도입 고려.
                ═════════════════════════════════════════════════════════════ */}
            {DEBUG_CSV_UPLOAD && result.skipped.length > 0 && (
              <SkippedBlock>
                <div className="head">건너뛴 행 사유 (DEBUG 전용)</div>
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
