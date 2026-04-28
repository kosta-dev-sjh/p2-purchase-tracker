/**
 * 역할: 해당 화면의 상태와 레이아웃을 조립하는 페이지 진입 파일입니다.
 *       거래 데이터는 transactionsStore(localStorage 기반)를 통해 읽고,
 *       월 단위 필터·검색·선택 상태를 화면 내부에서 관리합니다.
 * 위치: src\pages\Transactions\index.tsx
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { AppShell } from "../../components/layout/AppShell";
import { MonthPicker } from "../../components/primitives/MonthPicker";
import { tokens } from "../../styles/tokens";
import { media } from "../../tokens/breakpoints";
import { SummaryStrip } from "./components/SummaryStrip";
import { FilterBar, type InstallmentFilter } from "./components/FilterBar";
import { TransactionTable } from "./components/TransactionTable";
import { DetailPanel } from "./components/DetailPanel";
import { QuickAddModal } from "./components/QuickAddModal";
import { buildTransactionSummary } from "./data";
import {
  computeMaxMonthKey,
  computeMinYear,
  getCurrentMonthKey,
  getMonthOption,
  getPrevMonthKey,
} from "../../constants/months";
import {
  transactionsStore,
  useTransactionsStore,
} from "../../stores/transactionsStore";
import { TransactionEditModal } from "../../components/modal/TransactionEditModal";
import { Modal } from "../../components/modal/Modal";
import { Button } from "../../components/primitives/Button";
import { formatKRW } from "../../utils/format";
import type {
  TxRow,
  TxPlatform,
} from "./components/TransactionTable";
import { getCardInstallmentKind } from "../../utils/cardInstallment";

const Body = styled.div<{ $hasPanel: boolean }>`
  display: grid;
  grid-template-columns: ${({ $hasPanel }) =>
    $hasPanel ? "minmax(0, 1fr) 320px" : "minmax(0, 1fr) 0px"};
  gap: ${({ $hasPanel }) => ($hasPanel ? "16px" : "0px")};
  align-items: start;
  transition:
    grid-template-columns ${tokens.motion.fast} ease,
    gap ${tokens.motion.fast} ease;

  ${media.tablet} {
    grid-template-columns: 1fr;
    gap: 16px;
  }
`;

const Left = styled.div`
  display: grid;
  gap: 16px;
  min-width: 0;
`;

/**
 * PC/태블릿에서만 보이는 오른쪽 상세 패널 슬롯.
 * 모바일에서는 상세를 행 아래에 아코디언으로 펼치기 때문에, 이 슬롯을 완전히 숨겨
 * "거래 목록을 다 본 뒤 맨 아래에 상세가 붙는" 이전 구조를 제거합니다.
 */
const PanelSlot = styled.div`
  min-width: 0;
  position: sticky;
  top: 20px;
  align-self: start;
  max-height: calc(100vh - 40px);
  overflow-x: hidden;
  overflow-y: auto;

  ${media.tablet} {
    position: static;
    max-height: none;
    overflow: visible;
  }

  ${media.mobile} {
    display: none;
  }
`;

const PanelInner = styled.div<{ $open: boolean }>`
  width: 320px;
  opacity: ${({ $open }) => ($open ? 1 : 0)};
  transform: translateX(${({ $open }) => ($open ? "0" : "8px")});
  transition:
    opacity ${tokens.motion.fast} ease,
    transform ${tokens.motion.fast} ease;

  ${media.tablet} {
    width: 100%;
    transform: none;
  }
`;

const Grid = styled.div`
  display: grid;
  gap: 16px;
`;

/**
 * "+ 거래 추가" 플로팅 액션 버튼(2026-04-28).
 * 데스크톱: 알약 모양 + "거래 추가" 라벨 + 아이콘
 * 모바일: 원형 + 아이콘 only (텍스트 생략으로 공간 절약)
 * 클릭 시 페이지 이동 대신 모달을 띄워 현재 페이지 컨텍스트를 유지 — UI 흐름이 끊기지 않음.
 */
const FabAddButton = styled.button`
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 18px 12px 14px;
  border: none;
  border-radius: 999px;
  background: ${tokens.color.accent};
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  box-shadow:
    0 8px 18px rgba(79, 70, 229, 0.32),
    0 2px 4px rgba(16, 24, 40, 0.08);
  transition:
    background ${tokens.motion.fast} ease,
    transform ${tokens.motion.fast} ease;

  &:hover {
    background: ${tokens.color.accentHover};
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }

  &:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 3px rgba(79, 70, 229, 0.32),
      0 8px 18px rgba(79, 70, 229, 0.32);
  }

  .label {
    display: inline-block;
  }

  ${media.mobile} {
    right: 16px;
    bottom: 80px; /* 모바일 하단 네비 바 위에 떠 있도록 띄움. */
    width: 52px;
    height: 52px;
    padding: 0;
    border-radius: 50%;
    /* 모바일은 SVG 아이콘만. 텍스트는 시각적으로 숨기되 스크린리더용으로 aria-label 유지. */
    .label {
      display: none;
    }
  }
`;

const SearchScopeBar = styled.div`
  margin-top: -4px;
  padding: 10px 14px;
  border: 1px solid ${tokens.color.line2};
  border-radius: ${tokens.radius.card};
  background: ${tokens.color.foot};
  color: ${tokens.color.ink4};
  font-size: 12px;
  line-height: 1.45;
  text-align: center;
`;

// 삭제 확인 모달의 본문 레이아웃. 모달 컴포넌트 자체가 padding 을 책임지므로 여기선
// 안내문 · 대상 거래 요약 · 액션 버튼 세 영역만 수직으로 쌓아 줍니다.
const ConfirmBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const ConfirmLead = styled.p`
  margin: 0;
  color: ${tokens.color.ink2};
  font-size: 13.5px;
  line-height: 1.55;
`;

const ConfirmTarget = styled.div`
  padding: 12px 14px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.card};
  background: ${tokens.color.foot};
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ConfirmTargetTitle = styled.div`
  color: ${tokens.color.ink1};
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ConfirmTargetMeta = styled.div`
  color: ${tokens.color.ink4};
  font-size: 12px;
  font-family: ${tokens.font.mono};
  font-variant-numeric: tabular-nums;
`;

const ConfirmActions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;

  > button {
    min-width: 96px;
  }
`;

function toMonthKey(dateStr: string): string {
  // "2026.04.19" → "2026-04" 형식으로 변환해 월 필터 키로 사용합니다.
  const match = dateStr.match(/(\d{4})[./-](\d{1,2})/);
  if (!match) return "";
  const [, year, month] = match;
  return `${year}-${month.padStart(2, "0")}`;
}

function parseDateKey(dateStr: string): number | null {
  const match = dateStr.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  return Number(year) * 10000 + Number(month) * 100 + Number(day);
}

function getSearchScopeRange(rows: TxRow[]): { min: string; max: string } | null {
  let minDate = "";
  let maxDate = "";
  let minKey = Number.POSITIVE_INFINITY;
  let maxKey = Number.NEGATIVE_INFINITY;

  rows.forEach((row) => {
    const dateKey = parseDateKey(row.date);
    if (dateKey === null) return;
    if (dateKey < minKey) {
      minKey = dateKey;
      minDate = row.date;
    }
    if (dateKey > maxKey) {
      maxKey = dateKey;
      maxDate = row.date;
    }
  });

  if (!minDate || !maxDate) return null;
  return { min: minDate, max: maxDate };
}

export const TransactionsPage: React.FC = () => {
  // 필터 상태는 모두 페이지 상단에서 관리해서 표와 상세 패널이 같은 기준을 보게 합니다.
  const location = useLocation();
  const navigate = useNavigate();
  /**
   * 진입 시 location.state.scrollToTransactionId 가 있으면 그 거래의 id 를 첫 렌더부터
   * highlightId 로 잡습니다 (2026-04-28 회귀 수정).
   * 이전엔 useEffect 로 "첫 렌더 → 그 다음 렌더에서 highlight 세팅" 순서였는데, 그 사이에
   * 대상 행이 rowEnter 페이드 애니메이션을 한 번 시작했다가 highlight 펄스로 바꿔치기 돼서
   * 사용자에게 "행이 가만히 있지 못하고 재렌더링되는" 것처럼 보였습니다.
   */
  const initialScrollToId = useMemo<string | null>(() => {
    const state = location.state as { scrollToTransactionId?: string } | null;
    return state?.scrollToTransactionId ?? null;
    // 이 값은 마운트 시점의 navigation state 만 반영하면 되므로 의존성 비어있음.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 진입 시 디폴트 월은 "오늘 시점의 현재 월". 과거 목업처럼 특정 월에 고정되지 않습니다.
  const [month, setMonth] = useState(() => getCurrentMonthKey());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "expense" | "income">("all");
  const [platform, setPlatform] = useState<"all" | TxPlatform>("all");
  const [category, setCategory] = useState<"all" | string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "purchase" | "cancel" | "refund" | "sub" | "etc">("all");
  const [installmentFilter, setInstallmentFilter] = useState<InstallmentFilter>("all");
  /**
   * 반복결제·분석 카드에서 가맹점명 검색으로 진입했을 때 추가로 적용할 "동일 일자(±2일)"
   * 필터의 기준 day-of-month. 검증된 반복결제 클릭 시 같이 들어옴(2026-04-28).
   * null 이면 동일 일자 필터 비활성화. filteredRows useMemo 가 참조하므로 그보다 위에 선언.
   */
  const [recurringDayFilter, setRecurringDayFilter] = useState<number | null>(null);
  /** 거래 추가 FAB → QuickAddModal 노출 여부. 닫으면 자동 false. */
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // 거래 내역은 기본적으로 최신이 위로 오게 두고, 사용자가 원하면 오름차순으로 뒤집을 수 있습니다.
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // 거래 원본은 스토어에서 구독해 가져옵니다. CSV 업로드·삭제 등 변경이 자동 반영됩니다.
  const allRows = useTransactionsStore();
  const monthRows = useMemo(
    () => allRows.filter((row) => toMonthKey(row.date) === month),
    [allRows, month]
  );
  const prevMonthRows = useMemo(() => {
    const prevKey = getPrevMonthKey(month);
    return allRows.filter((row) => toMonthKey(row.date) === prevKey);
  }, [allRows, month]);
  const monthOption = getMonthOption(month);
  // MonthPicker 셀렉터의 가장 오래된 년도 — 거래 데이터에 옛날 거래가 있으면 자동 확장.
  const pickerMinYear = useMemo(
    () => computeMinYear(allRows.map((row) => row.date)),
    [allRows]
  );
  // 미래 거래(과거 데이터 정합 케이스)가 있으면 그 월까지 자동 노출. 새 거래는 거래일자 maxDate로 차단.
  const pickerMaxMonth = useMemo(
    () => computeMaxMonthKey(allRows.map((row) => row.date)),
    [allRows]
  );
  const markedMonthKeys = useMemo(
    () => Array.from(new Set(allRows.map((row) => toMonthKey(row.date)).filter(Boolean))),
    [allRows]
  );
  const searchScopeRange = useMemo(() => getSearchScopeRange(allRows), [allRows]);
  const summary = useMemo(
    () => buildTransactionSummary(monthRows, prevMonthRows, allRows),
    [monthRows, prevMonthRows, allRows]
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    // 검색이 들어오면 현재 월에 갇히지 않고 전체 거래 기간에서 찾습니다.
    const candidateRows = query ? allRows : monthRows;

    const matched = candidateRows.filter((row) => {
      if (typeFilter !== "all" && row.type !== typeFilter) {
        return false;
      }

      if (platform !== "all" && row.platform !== platform) {
        return false;
      }

      // 다중 카테고리 거래는 카테고리 중 하나라도 필터 키와 일치하면 표에 노출합니다.
      if (category !== "all" && !row.categories.includes(category)) {
        return false;
      }

      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false;
      }

      const cardImport = row.detail?.cardImport;
      const installmentKind = getCardInstallmentKind(cardImport);
      if (installmentFilter === "lump_sum" && installmentKind !== "lump_sum") {
        return false;
      }
      if (
        installmentFilter === "installment" &&
        installmentKind !== "installment_approval" &&
        installmentKind !== "installment_billing"
      ) {
        return false;
      }

      // 정기결제 클릭으로 진입한 경우만 동일 일자(±2일) 필터 추가 적용. 일반 검색에는 영향 없음.
      if (recurringDayFilter !== null) {
        const dayMatch = row.date.match(/[./-](\d{1,2})$/);
        const day = dayMatch ? Number(dayMatch[1]) : null;
        if (day === null) return false;
        const diff = Math.abs(day - recurringDayFilter);
        // 월말 31일 ↔ 1일 같은 wrap-around 도 허용 — 31일 결제가 다음 달 1일로 슬립되는 케이스.
        const wrapDiff = Math.min(diff, 31 - diff);
        if (wrapDiff > 2) return false;
      }

      if (!query) {
        return true;
      }

      const itemText = row.detail?.items.map((item) => item.name).join(" ").toLowerCase() ?? "";
      return row.title.toLowerCase().includes(query) || itemText.includes(query);
    });

    // "YYYY.MM.DD" / "YYYY-MM-DD"를 수치로 환산해 정렬 기준을 만듭니다.
    const dayKey = (dateStr: string): number => {
      const parsed = dateStr.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
      if (!parsed) return 0;
      const [, y, m, d] = parsed;
      return Number(y) * 10000 + Number(m) * 100 + Number(d);
    };

    // 정렬은 filter 이후 한 번만 수행합니다. 기본은 desc(최신이 위).
    const sorted = [...matched].sort((a, b) => {
      const diff = dayKey(a.date) - dayKey(b.date);
      return sortOrder === "desc" ? -diff : diff;
    });
    return sorted;
  }, [allRows, category, installmentFilter, monthRows, platform, recurringDayFilter, search, sortOrder, statusFilter, typeFilter]);
  const searchScopeHint = useMemo(() => {
    if (search.trim().length === 0 || !searchScopeRange) return "";
    return `전체 검색 · ${searchScopeRange.min} ~ ${searchScopeRange.max} 데이터에서 ${filteredRows.length}건 찾았어요`;
  }, [filteredRows.length, search, searchScopeRange]);

  const INITIAL_VISIBLE = 20;
  const LOAD_STEP = 20;
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  // 외부 진입(scrollToTransactionId) 의 경우 첫 렌더부터 selectedId 를 잡아둬, 상세 패널이
  // 마운트 시점에 이미 열린 상태로 그려지도록 합니다(rowEnter 와의 간섭 회피 + 깜빡임 차단).
  const [selectedId, setSelectedId] = useState<string | null>(initialScrollToId);
  /**
   * 홈 "최근 거래" 등 다른 화면에서 특정 거래로 진입했을 때 그 행을 부드럽게 스크롤하고
   * 잠깐 강조하기 위한 상태. highlightId 는 강조 대상 행의 id, pulseToken 은 같은 id 가
   * 연달아 들어와도 펄스를 다시 트리거하기 위한 단조 증가 카운터.
   * initialScrollToId 가 있으면 첫 렌더부터 highlightId 를 잡아 대상 행이 rowEnter 를 건너뛰게 합니다.
   */
  const [highlightId, setHighlightId] = useState<string | null>(initialScrollToId);
  const [pulseToken, setPulseToken] = useState(0);

  const resetVisibleCount = useCallback(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, []);

  const handleMonthChange = useCallback((nextMonth: string) => {
    setMonth(nextMonth);
    resetVisibleCount();
  }, [resetVisibleCount]);

  const handleSearchChange = useCallback((nextSearch: string) => {
    setSearch(nextSearch);
    // 사용자가 검색어를 직접 손대면 정기결제에서 따라온 동일 일자 필터는 해제 — 더 자유로운 검색 모드.
    setRecurringDayFilter(null);
    resetVisibleCount();
  }, [resetVisibleCount]);

  const handleTypeChange = useCallback((nextType: "all" | "expense" | "income") => {
    setTypeFilter(nextType);
    resetVisibleCount();
  }, [resetVisibleCount]);

  const handlePlatformChange = useCallback(
    (nextPlatform: "all" | TxPlatform) => {
      setPlatform(nextPlatform);
      resetVisibleCount();
    },
    [resetVisibleCount]
  );

  const handleCategoryChange = useCallback(
    (nextCategory: "all" | string) => {
      setCategory(nextCategory);
      resetVisibleCount();
    },
    [resetVisibleCount]
  );

  const handleStatusChange = useCallback(
    (nextStatus: "all" | "purchase" | "cancel" | "refund" | "sub" | "etc") => {
      setStatusFilter(nextStatus);
      resetVisibleCount();
    },
    [resetVisibleCount]
  );

  const handleInstallmentChange = useCallback((nextInstallment: InstallmentFilter) => {
    setInstallmentFilter(nextInstallment);
    resetVisibleCount();
  }, [resetVisibleCount]);

  const visibleRows = useMemo(
    () => filteredRows.slice(0, visibleCount),
    [filteredRows, visibleCount]
  );

  const handleLoadMore = useCallback(() => {
    setVisibleCount((current) => {
      if (current >= filteredRows.length) return current;
      return Math.min(current + LOAD_STEP, filteredRows.length);
    });
  }, [filteredRows.length]);

  const handleToggleSort = useCallback(() => {
    setSortOrder((current) => (current === "desc" ? "asc" : "desc"));
  }, []);

  const handleSelectRow = useCallback((id: string) => {
    setSelectedId(id || null);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedId(null);
  }, []);

  const resolvedSelectedId = useMemo(() => {
    if (selectedId === null) return null;
    return filteredRows.some((row) => row.id === selectedId)
      ? selectedId
      : filteredRows[0]?.id ?? null;
  }, [filteredRows, selectedId]);

  const selected = useMemo(
    () =>
      resolvedSelectedId
        ? filteredRows.find((row) => row.id === resolvedSelectedId) ?? null
        : null,
    [filteredRows, resolvedSelectedId]
  );

  const [displayed, setDisplayed] = useState<typeof selected>(selected);
  const [isOpen, setIsOpen] = useState<boolean>(Boolean(selected));

  useEffect(() => {
    // 상세 패널은 선택 항목이 바뀔 때 부드럽게 열리고 닫히도록 표시 상태를 분리합니다.
    if (selected) {
      let openRaf = 0;
      const displayRaf = requestAnimationFrame(() => {
        setDisplayed(selected);
        openRaf = requestAnimationFrame(() => setIsOpen(true));
      });
      return () => {
        cancelAnimationFrame(displayRaf);
        cancelAnimationFrame(openRaf);
      };
    }
    const closeRaf = requestAnimationFrame(() => setIsOpen(false));
    const timer = window.setTimeout(() => setDisplayed(null), 160);
    return () => {
      cancelAnimationFrame(closeRaf);
      window.clearTimeout(timer);
    };
  }, [selected]);

  /**
   * 삭제는 돌이킬 수 없으므로 실제 store.removeOne 호출 전에 확인 모달을 띄웁니다.
   * 상세 패널에서 '거래 삭제'를 누르면 여기로 와서 대상 행을 보관만 해두고,
   * 모달의 확인 버튼을 눌렀을 때 `confirmDelete`가 실제 삭제를 수행합니다.
   */
  const [deleteTarget, setDeleteTarget] = useState<TxRow | null>(null);

  const handleDelete = useCallback((row: TxRow) => {
    setDeleteTarget(row);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    // 삭제 후에는 가능한 한 바로 다음 또는 이전 행을 선택해 사용 흐름이 끊기지 않게 합니다.
    const currentIndex = filteredRows.findIndex((row) => row.id === deleteTarget.id);
    const nextSelectedId =
      filteredRows[currentIndex + 1]?.id ??
      filteredRows[currentIndex - 1]?.id ??
      "";

    transactionsStore.removeOne(deleteTarget.id);
    setSelectedId(nextSelectedId);
    setDeleteTarget(null);
  }, [deleteTarget, filteredRows]);

  // 수정 모달은 상세 패널에서 '수정하기'를 누르는 순간 열려, 대상 거래의 id와 현재 값을 그대로 받습니다.
  // 수동 입력 화면으로의 전체 페이지 이동 대신 해당 거래만 가볍게 편집할 수 있게 합니다.
  // editEpoch는 "같은 거래를 다시 열었을 때도 모달을 remount"시키기 위한 단조 증가 카운터입니다.
  // 모달 내부 상태는 row prop 기반 useState 초기자로만 세팅되므로, 새로 열릴 때마다
  // key를 바꿔 remount해야 편집 중이던 값이 남지 않습니다.
  const [editTarget, setEditTarget] = useState<TxRow | null>(null);
  const [editEpoch, setEditEpoch] = useState(0);

  const handleEditOpen = useCallback((row: TxRow) => {
    setEditTarget(row);
    setEditEpoch((current) => current + 1);
  }, []);

  const handleEditSave = useCallback((id: string, patch: Partial<TxRow>) => {
    transactionsStore.updateOne(id, patch);
  }, []);

  /**
   * 분석 페이지의 EssentialStrip(공과금·관리비·교육비·정기결제 카드) 클릭 진입 처리(2026-04-28).
   *
   * state.presetCategory 가 들어오면 카테고리 필터로, presetStatus="sub" 가 들어오면 상태
   * 필터로 좁힙니다. 사용자가 보고 있던 month 도 같이 동기화해 같은 달 거래만 노출.
   * searchTransactionName 핸들러와 분리한 이유는 진입 의도가 다르기 때문 — 가맹점 검색은
   * 모든 달 거래를 펼쳐 보지만, 분류 필터는 그 달 안에서만 좁혀 보는 게 사용자 멘탈 모델.
   */
  useEffect(() => {
    const state = location.state as {
      presetCategory?: string;
      presetStatus?: "sub";
      presetType?: "expense" | "income";
      presetMonth?: string;
    } | null;
    const cat = state?.presetCategory;
    const stat = state?.presetStatus;
    if (!cat && !stat) return;
    setSearch("");
    setTypeFilter(state?.presetType ?? "all");
    setPlatform("all");
    setCategory(cat ?? "all");
    setStatusFilter(stat ?? "all");
    setInstallmentFilter("all");
    setRecurringDayFilter(null);
    if (state?.presetMonth) setMonth(state.presetMonth);
    setVisibleCount(INITIAL_VISIBLE);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  /**
   * 반복결제 페이지·분석 카드에서 location.state.searchTransactionName 으로 진입한 경우.
   * 검색창에 가맹점명을 채워 그 결제와 관련된 모든 거래(과거·현재) 를 한 번에 볼 수 있게 합니다.
   * 동선상 다른 필터는 초기화해 검색 결과가 가려지지 않게 합니다.
   * recurringDay 가 같이 오면 day-of-month ±2일 필터도 켭니다.
   */
  useEffect(() => {
    const state = location.state as {
      searchTransactionName?: string;
      recurringDay?: number;
    } | null;
    const name = state?.searchTransactionName?.trim();
    if (!name) return;
    setSearch(name);
    setTypeFilter("all");
    setPlatform("all");
    setCategory("all");
    setStatusFilter("all");
    setInstallmentFilter("all");
    setRecurringDayFilter(
      typeof state?.recurringDay === "number" ? state.recurringDay : null,
    );
    // 검색 진입은 월 필터를 풀어 줘야 과거 거래까지 다 보임. month 는 그대로 두지만
    // 사용자가 원하면 직접 다른 달로 이동 가능.
    setVisibleCount(INITIAL_VISIBLE);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  /**
   * 홈 "최근 거래"·소비분석 등에서 location.state.scrollToTransactionId 로 진입한 경우의 처리.
   * 편집 모달은 띄우지 않고, 대상 거래가 표에 보이도록 다음을 강제합니다:
   *   1) 검색·유형·플랫폼·카테고리·상태·할부 필터 모두 초기화 (필터로 가려져 있으면 안 보이니까)
   *   2) 거래 일자에 맞춰 month 동기화 + visibleCount 리셋
   *   3) selectedId = 대상 id (오른쪽 상세 패널 열기, 모바일은 아코디언 열기)
   *   4) highlightId / pulseToken 갱신 → TransactionTable 이 ref 로 scrollIntoView
   * 처리 후 navigate replace 로 state 를 비워 새로고침·뒤로가기 시 다시 트리거되지 않게 합니다.
   */
  useEffect(() => {
    const state = location.state as { scrollToTransactionId?: string } | null;
    const targetId = state?.scrollToTransactionId;
    if (!targetId) return;
    const target = allRows.find((row) => row.id === targetId);
    if (!target) {
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

    setSearch("");
    setTypeFilter("all");
    setPlatform("all");
    setCategory("all");
    setStatusFilter("all");
    setInstallmentFilter("all");

    const key = toMonthKey(target.date);
    if (key) {
      setMonth(key);
    }
    setVisibleCount(INITIAL_VISIBLE);
    setSelectedId(targetId);
    setHighlightId(targetId);
    setPulseToken((current) => current + 1);

    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, allRows, navigate]);

  /**
   * 강조 대상 행이 visibleCount 밖에 있으면 충분히 보이도록 자동 확장.
   * filteredRows 가 필터/월 변경 후 갱신되면 한 번만 점프합니다.
   */
  useEffect(() => {
    if (!highlightId) return;
    const idx = filteredRows.findIndex((row) => row.id === highlightId);
    if (idx === -1) return;
    if (idx >= visibleCount) {
      setVisibleCount(Math.min(filteredRows.length, idx + 5));
    }
  }, [highlightId, filteredRows, visibleCount]);

  /**
   * 펄스 애니메이션 길이(약 1.6s)와 동일한 시간 뒤에 highlightId 를 비웁니다.
   * 강조 효과는 일회성이라 selectedId(상세 선택) 와 분리해 운영합니다.
   */
  useEffect(() => {
    if (!highlightId) return;
    const timer = window.setTimeout(() => setHighlightId(null), 1800);
    return () => window.clearTimeout(timer);
  }, [highlightId, pulseToken]);

  /**
   * 수동 입력 페이지에서 "이 거래 수정하기"로 넘어올 때 location.state.editTransactionId 에
   * 대상 거래 id 가 담겨 옵니다. 이 경우 해당 거래를 스토어에서 찾아 편집 모달을 자동으로 엽니다.
   * 한 번 처리한 뒤에는 state 를 비워 같은 거래를 다시 새로 고침·뒤로가기 해도 모달이 불쑥
   * 다시 뜨지 않게 합니다.
   */
  useEffect(() => {
    const state = location.state as { editTransactionId?: string; targetDate?: string } | null;
    const targetId = state?.editTransactionId;

    // OCR/CSV 저장 후 넘어올 때 해당 날짜의 월로 자동 전환합니다.
    // 외부 라우팅 state(targetDate) 에 따라 페이지 내부 month/visibleCount 를 동기화하는
    // 정당한 effect 케이스 (한 번만 실행되고 navigate 로 state 를 비웁니다).
    const targetDate = state?.targetDate;
    if (!targetId && targetDate) {
      const key = toMonthKey(targetDate);
      if (key) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMonth(key);
        resetVisibleCount();
      }
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if (!targetId) return;
    const target = allRows.find((row) => row.id === targetId);
    const timer = window.setTimeout(() => {
      if (target) {
        handleEditOpen(target);
        // 해당 거래가 현재 선택되도록 상세 하이라이트도 맞춰 둡니다.
        setSelectedId(target.id);
        // 선택 후에 month 기본값을 타겟 행의 월로 맞춰 두어야 editor 를 닫았을 때도
        // 같은 거래가 표에 보이도록 보장됩니다.
        const key = toMonthKey(target.date);
        if (key) {
          setMonth(key);
          resetVisibleCount();
        }
      }
      // state 를 비워 두 번째 진입에서 재오픈되지 않도록 합니다.
      navigate(location.pathname, { replace: true, state: null });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [location.state, location.pathname, allRows, handleEditOpen, navigate, resetVisibleCount]);

  // OCR 경로로 저장된 거래에서 "원본 캡쳐만 다시 보기" 흐름을 위한 모달 상태입니다.
  // 이전에는 편집 페이지로 이동했지만, 이 거래는 이미 파싱된 상태라 재방문이 낭비였고
  // 이미지 한 장만 띄우는 가벼운 뷰로 역할을 좁혔습니다. URL이 비어 있는 경우도
  // 있어(mock/구데이터), 모달 본문에서 플레이스홀더로 떨어뜨립니다.
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);

  const handleOpenSource = useCallback((row: TxRow) => {
    setSourceImageUrl(row.detail?.sourceImageUrl ?? "");
  }, []);

  const handleEditDisplayed = useCallback(() => {
    if (!displayed) return;
    handleEditOpen(displayed);
  }, [displayed, handleEditOpen]);

  const handleDeleteDisplayed = useCallback(() => {
    if (!displayed) return;
    handleDelete(displayed);
  }, [displayed, handleDelete]);

  const renderMobileDetail = useCallback(
    (row: TxRow) => (
      <DetailPanel
        row={row}
        onClose={handleCloseDetail}
        onEdit={() => handleEditOpen(row)}
        onDelete={() => handleDelete(row)}
        onOpenSource={() => handleOpenSource(row)}
      />
    ),
    [handleCloseDetail, handleDelete, handleEditOpen, handleOpenSource]
  );

  return (
    <AppShell
      activeNav="transactions"
      crumb={`거래 · ${monthOption.label}`}
      title="수입·지출 내역"
      headerRight={
        <MonthPicker
          value={month}
          onChange={handleMonthChange}
          minYear={pickerMinYear}
          maxMonthKey={pickerMaxMonth}
          markedMonthKeys={markedMonthKeys}
        />
      }
    >
      <Grid>
        <SummaryStrip summary={summary} filteredCount={filteredRows.length} />
        <Body $hasPanel={isOpen}>
          <Left>
            {/* 왼쪽 영역은 필터와 표, 오른쪽 영역은 상세 패널로 역할을 분리합니다.
                모바일에서는 FilterBar 가 아이콘 바 + 확장 패널로 축약되고, TransactionTable
                의 MobileList 가 각 행 아래에 DetailPanel 을 아코디언으로 펼칩니다. */}
            <FilterBar
              search={search}
              typeFilter={typeFilter}
              platform={platform}
              category={category}
              statusFilter={statusFilter}
              installmentFilter={installmentFilter}
              sortOrder={sortOrder}
              onToggleSort={handleToggleSort}
              onSearchChange={handleSearchChange}
              onTypeChange={handleTypeChange}
              onPlatformChange={handlePlatformChange}
              onCategoryChange={handleCategoryChange}
              onStatusChange={handleStatusChange}
              onInstallmentChange={handleInstallmentChange}
            />
            {searchScopeHint && (
              <SearchScopeBar>{searchScopeHint}</SearchScopeBar>
            )}
            <TransactionTable
              rows={visibleRows}
              allRows={allRows}
              totalCount={filteredRows.length}
              selectedId={selected?.id ?? ""}
              onSelect={handleSelectRow}
              onLoadMore={handleLoadMore}
              sortOrder={sortOrder}
              onToggleSort={handleToggleSort}
              renderMobileDetail={renderMobileDetail}
              highlightId={highlightId}
              pulseToken={pulseToken}
            />
          </Left>
          <PanelSlot>
            {displayed && (
              <PanelInner $open={isOpen}>
                <DetailPanel
                  row={displayed}
                  onClose={handleCloseDetail}
                  onEdit={handleEditDisplayed}
                  onDelete={handleDeleteDisplayed}
                  onOpenSource={() => handleOpenSource(displayed)}
                />
              </PanelInner>
            )}
          </PanelSlot>
        </Body>
      </Grid>
      <FabAddButton
        type="button"
        aria-label="새 거래 추가"
        title="새 거래 추가"
        onClick={() => setQuickAddOpen(true)}
      >
        <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
          <path
            d="M7 3V11M3 7H11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span className="label">거래 추가</span>
      </FabAddButton>
      {quickAddOpen && (
        <QuickAddModal
          onClose={() => setQuickAddOpen(false)}
          onSubmit={(row) => {
            transactionsStore.addFromManual(row);
            setQuickAddOpen(false);
            // 저장된 행의 월로 자동 점프해 사용자가 결과를 즉시 확인할 수 있게.
            const key = toMonthKey(row.date);
            if (key) {
              setMonth(key);
              resetVisibleCount();
            }
            setSelectedId(row.id);
            setHighlightId(row.id);
            setPulseToken((c) => c + 1);
          }}
          onOpenFullForm={() => {
            setQuickAddOpen(false);
            navigate("/manual-entry");
          }}
        />
      )}
      {editTarget && (
        <TransactionEditModal
          key={editEpoch}
          row={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={handleEditSave}
        />
      )}
      {deleteTarget && (
        <Modal
          isOpen
          onClose={() => setDeleteTarget(null)}
          title="정말 삭제하시겠습니까?"
        >
          {/*
            삭제는 되돌릴 수 없으므로 어떤 거래를 지우려고 하는지 제목·날짜·금액을 함께
            보여 사용자가 잘못된 행을 고른 게 아닌지 마지막으로 확인하게 합니다.
          */}
          <ConfirmBody>
            <ConfirmLead>이 거래는 삭제 후 되돌릴 수 없어요.</ConfirmLead>
            <ConfirmTarget>
              <ConfirmTargetTitle>{deleteTarget.title}</ConfirmTargetTitle>
              <ConfirmTargetMeta>
                {deleteTarget.date} · {formatKRW(Math.abs(deleteTarget.amount))}
              </ConfirmTargetMeta>
            </ConfirmTarget>
            <ConfirmActions>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setDeleteTarget(null)}
              >
                취소
              </Button>
              <Button variant="danger" size="md" onClick={confirmDelete}>
                삭제하기
              </Button>
            </ConfirmActions>
          </ConfirmBody>
        </Modal>
      )}
      {sourceImageUrl !== null && (
        <Modal
          isOpen
          onClose={() => setSourceImageUrl(null)}
          title="분석에 사용된 원본 캡처"
        >
          {/* 이미지 URL이 비어 있는 경우(mock/구데이터)엔 플레이스홀더로 떨어뜨려,
            "버튼은 보이는데 눌러도 아무것도 안 뜬다"는 상태를 피합니다. */}
          {sourceImageUrl ? (
            <img
              src={sourceImageUrl}
              alt="주문 캡처 분석에 사용된 원본 이미지"
              style={{
                display: "block",
                width: "100%",
                maxHeight: "70vh",
                objectFit: "contain",
                borderRadius: tokens.radius.control,
                background: tokens.color.bg,
              }}
            />
          ) : (
            <div
              style={{
                padding: "32px 0",
                textAlign: "center",
                color: tokens.color.ink4,
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              저장된 원본 이미지가 없어 표시할 수 없어요.
              <br />
              예전 데이터이거나 이미지가 유실된 경우일 수 있습니다.
            </div>
          )}
        </Modal>
      )}
    </AppShell>
  );
};
