# SpendTrack QA 체크리스트 v1

- 기준 문서: `docs/SpendTrack_Feature_Spec_From_Code_v1.md`
- 환경: 로컬 dev 서버 (`npm run dev`, 기본 `http://localhost:5173`)
- 테스트 자료: `~/Downloads` 의 카드 이용내역 xlsx/xls 5종 (현대카드, 우리/신한 등 일시불+할부 이용내역)
- PASS/FAIL 결과는 같은 폴더의 `SpendTrack_QA_Findings_v1.md` 리포트에 기록.

---

## 0. 검증 환경 / 사전 점검

| ID | 케이스 | 기대 |
| --- | --- | --- |
| ENV-01 | `npm run build` | 타입/빌드 통과 |
| ENV-02 | dev 서버 기동 | `http://localhost:5173` 응답 200, index.html 렌더 |
| ENV-03 | Firebase 환경변수 | `.env.local` 에 `VITE_FIREBASE_*` 7종 모두 존재 |
| ENV-04 | 로그인 화면 진입 | 비로그인 시 모든 protected 라우트가 `/login` 으로 리다이렉트 |
| ENV-05 | 콘솔 오류 | 첫 로드 시 빨간 에러/경고 0건 (warning 은 허용 가능) |

## 1. 인증

| ID | 케이스 | 기대 |
| --- | --- | --- |
| AUTH-01 | 빈 폼 로그인 | "이메일과 비밀번호를 모두 입력해 주세요." 메시지 |
| AUTH-02 | 잘못된 이메일 형식 | "올바른 이메일 형식을 입력해 주세요." |
| AUTH-03 | 존재하지 않는 계정 로그인 | "이메일이나 비밀번호가 일치하지 않습니다." |
| AUTH-04 | 정상 로그인 | `/` 로 이동, AppShell 렌더 |
| AUTH-05 | 회원가입 정상 흐름 | 가입 후 자동 로그인 + WelcomeTutorial(또는 강제 노출) |
| AUTH-06 | Google 로그인 | Popup → 성공 시 `/` 이동 (실 Google 계정 필요, 환경에 따라 skip 가능) |
| AUTH-07 | "비밀번호를 잊으셨나요?" 링크 | `/forgot-password` 이동 |
| AUTH-08 | 비밀번호 재설정 메일 발송 | "발송됐다" 또는 동등한 안내 |
| AUTH-09 | 새로고침 후 세션 유지 | `browserLocalPersistence` 로 인해 로그아웃되지 않음 |
| AUTH-10 | 로그아웃 (헤더 메뉴) | `/login` 으로 이동, 로컬 거래 초기화 |

## 2. 입력 방식 선택 (`/upload`)

| ID | 케이스 | 기대 |
| --- | --- | --- |
| UPL-01 | 카드 3개 표시 | OCR / 수동 / 카드 내역 가져오기 |
| UPL-02 | OCR 카드 클릭 | `/ocr-upload` |
| UPL-03 | 수동 카드 클릭 | `/manual-entry` |
| UPL-04 | 카드 내역 카드 클릭 | `/csv-upload` |
| UPL-05 | 좁은 폭(360px) | 카드 1열 스택, 텍스트 가독 OK |

## 3. 수동 입력 (`/manual-entry`)

| ID | 케이스 | 기대 |
| --- | --- | --- |
| MAN-01 | 빈 저장 | 누락 필드 한 줄에 모두 표시 + 첫 누락 필드 포커스 |
| MAN-02 | 거래명만 입력 | 금액/거래일자 누락 안내 |
| MAN-03 | 지출 + 정상 저장 | amount 음수 저장, `/transactions` 이동 |
| MAN-04 | 수입 + 환불 status | amount 양수, status=refund |
| MAN-05 | 플랫폼 미지정 저장 | platform=unspecified, 라벨 "미지정" |
| MAN-06 | 카테고리 미선택 (디폴트 etc) | categories=["etc"] |
| MAN-07 | 카테고리 4개 시도 | 3개 초과 체크 비활성화 (MAX_CATEGORIES_PER_TX=3) |
| MAN-08 | 할부 옵션 = installment, 회차 누락 | "할부 현재/전체 회차" 누락 안내 |
| MAN-09 | 상품 추가 모달 | 이름·가격·링크 입력 후 행 추가 |
| MAN-10 | 상품 합계 > 거래금액 | ProductTotalWarningModal `exceeds` 블로킹 |
| MAN-11 | 상품 합계 < 거래금액, "이대로 등록" | 저장 성공 + DetailPanel 에 "일부만 입력" 힌트 |
| MAN-12 | 동일 날짜·금액 거래 후보 발생 | SuggestionCard 노출, "이 거래 수정하기" → `/transactions` 편집 모달 |
| MAN-13 | "아니에요" 누른 뒤 저장 | 새 거래로 저장 (중복 검사 우회) |
| MAN-14 | 저장 직후 페이지 잔존 | success 토스트 700ms → `/transactions` 이동 |

## 4. CSV/XLSX 업로드 (`/csv-upload`)

테스트 파일(다운로드 폴더):
- `hyundaicard_20260423 (1)2.xlsx` — 현대카드
- `일시불+할부_카드이용내역조회.xlsx`
- `ChungGu.xls`
- `기간별 사용내역 조회_출력용_20260423.xls`
- `카드이용내역__20260423123821.xls`

| ID | 케이스 | 기대 |
| --- | --- | --- |
| CSV-01 | xlsx 업로드(현대카드) | 헤더 인식 → 미리보기 행 표시 |
| CSV-02 | xls 업로드(레거시) | xlsx 파서 경유, 동일하게 처리 |
| CSV-03 | csv 업로드 | UTF-8/CP949 자동 디코딩(`decodeCsvBuffer`) → 미리보기 |
| CSV-04 | 지원 안 되는 확장자(.txt 등) | `UnsupportedFileTypeError` 스낵/배너 |
| CSV-05 | 1차 파서 인식률 < 50% | AI fallback 자동 시도 → AiLoadingIndicator |
| CSV-06 | 미리보기 일부 행 체크 해제 후 저장 | 체크된 행만 저장 |
| CSV-07 | 완전 중복 행 포함 | exactDup 안내, 체크박스로 강제 포함 가능 |
| CSV-08 | 새 아이템만 있는 동일 거래(아이템 차이) | "기존에 추가" merge 액션 |
| CSV-09 | 카드 메타(승인번호/할부 회차) 보존 | 저장 후 DetailPanel 에 cardImport 정보 표시 |
| CSV-10 | 카테고리 자동 추정 | etc 로 들어온 가맹점도 룰 매칭 시 적절한 카테고리 |
| CSV-11 | SaveResultModal | 저장/머지/스킵 카운트 정확 |

## 5. OCR 업로드 (`/ocr-upload` → `/ocr-edit`)

| ID | 케이스 | 기대 |
| --- | --- | --- |
| OCR-01 | 플랫폼 선택 후 이미지 1장 업로드 | 그리드에 썸네일 + 플랫폼 뱃지 |
| OCR-02 | 플랫폼 바꿔서 추가 업로드 | 각 이미지가 자기 시점 플랫폼을 유지 |
| OCR-03 | 분석 시작 | AnalysisProgressModal 진행률 표시 (단계: 분석 중/검토 중/AI 보정/완료) |
| OCR-04 | 분석 완료 후 자동 이동 | `/ocr-edit` |
| OCR-05 | OcrEdit — 주문 카드 표시 | 날짜/상태/상품 row 인식, 비어있어도 빈 폼은 아님 |
| OCR-06 | 상품 행 수정 | 이름/가격 변경 → 상태 갱신 |
| OCR-07 | 상품 합계 ≠ 거래금액 (under) | ProductTotalWarningModal under 모드, "이대로 등록" 가능 |
| OCR-08 | 매칭 후보 존재 | MatchTransactionModal — 기존 거래 추가/별도 저장/취소 선택지 |
| OCR-09 | 저장 | `/transactions` 이동, source=ocr, sourceImageUrl 보존 |
| OCR-10 | DetailPanel "OCR 분석 이미지 보기" | 원본 캡처 lightbox 노출 |

## 6. 거래내역 (`/transactions`)

| ID | 케이스 | 기대 |
| --- | --- | --- |
| TX-01 | 기본 진입 — 현재 월 표시 | `getCurrentMonthKey` 기반 |
| TX-02 | MonthPicker 변경 | 해당 월의 거래만 표시, marked 점 표시 |
| TX-03 | 검색 | 거래명/메모 부분 일치 |
| TX-04 | 유형 필터 (지출/수입) | 부호 분리 |
| TX-05 | 플랫폼 필터 | 쿠팡/네이버쇼핑/미지정 |
| TX-06 | 카테고리 필터 | 표준+커스텀 |
| TX-07 | 상태 필터 | 구매/취소/환불/정기결제/기타 |
| TX-08 | 할부 필터 | 일시불/할부/구분없음 (`getCardInstallmentKind`) |
| TX-09 | 행 클릭 → 상세 패널 | PC/태블릿: 우측 sticky, 모바일: 행 아래 아코디언 |
| TX-10 | 더보기 → 수정 | TransactionEditModal 오픈 |
| TX-11 | 수정 저장 | 스토어/Firestore 동기 업데이트, 카테고리 변경은 학습 캐시 기록 |
| TX-12 | 더보기 → 삭제 | 확인 모달 → 제거 |
| TX-13 | ManualEntry 의 SuggestionCard 경유 진입 | 진입 즉시 해당 거래 편집 모달 자동 오픈 |
| TX-14 | OCR partial 거래의 힌트 표시 | "상품 내역이 일부만 입력되어 있어요" |
| TX-15 | 카드 할부 거래 표시 | 회차/원거래 메타 노출 |

## 7. 홈 / 분석

| ID | 케이스 | 기대 |
| --- | --- | --- |
| HOME-01 | KPI strip | 지출/수입/취소 등 합계가 부호 규약대로 |
| HOME-02 | TrendChart | 월간 추이 데이터 정상 |
| HOME-03 | PlatformDonut | 플랫폼별 비율 정상 |
| HOME-04 | RecentTransactions | 최근 N건 표시 |
| HOME-05 | InsightCards 룰 인사이트 | 빈 데이터에서도 크래시 없음 |
| HOME-06 | AI 인사이트 호출 | 데이터 hash 변동 시에만 호출 (네트워크 탭 확인) |
| HOME-07 | AI 인사이트 캐시 | 새로고침 후 바로 보임 (캐시 적중) |
| ANA-01 | SummaryBanner | "이번 달 요약" 또는 "YYYY년 N월 요약" 라벨 |
| ANA-02 | PlatformBars | netSpend 계산 정확 |
| ANA-03 | CategoryBars 지난달 비교 | prev 데이터 함께 표시 |
| ANA-04 | RepeatTop3 / SubscriptionList / WeeklyPattern | 빈 데이터에서도 크래시 없음 |

## 8. 설정

| ID | 케이스 | 기대 |
| --- | --- | --- |
| SET-01 | 프로필 이름 변경 | Firestore 반영 + 사이드바 표시 갱신 |
| SET-02 | 비밀번호 변경 | 현재 비번 검증 → 변경 성공 안내 |
| SET-03 | 카테고리 추가 | 표준 5종 뒤에 커스텀이 추가 순서대로 |
| SET-04 | 카테고리 색 변경 | Analysis CategoryBars 즉시 반영 |
| SET-05 | 카테고리 삭제 | 사용 중 거래의 categories 가 etc 로 폴백 |
| SET-06 | 전체 거래 삭제 | 확인 후 stores+Firestore 모두 비움 |
| SET-07 | 계정 탈퇴 (재인증 필요) | Functions 호출 → 7일 grace 안내 |

## 9. 모바일 반응형

| ID | 케이스 | 기대 |
| --- | --- | --- |
| MOB-01 | 헤더 — MonthPicker 풀-폭 pill | DateStamp 가 아래에 한 줄로 |
| MOB-02 | Sidebar | 햄버거/슬라이드 또는 하단 nav |
| MOB-03 | TransactionTable → 모바일 카드 리스트 | 행 클릭 시 아래로 펼침 |
| MOB-04 | OcrUpload Footer | 요약/액션 세로 스택 |
| MOB-05 | 입력폼 키보드 | 숫자 필드 numeric inputmode |

## 10. 안정성/회귀

| ID | 케이스 | 기대 |
| --- | --- | --- |
| REG-01 | localStorage v5 키 사용 | 이전 v3/v4 데이터는 영향 없음 (코드 기준 v5) |
| REG-02 | 거래 0건 상태 | 빈 화면 안내, 차트/리스트 크래시 없음 |
| REG-03 | 미래 일자 거래 | MonthPicker maxMonthKey 자동 확장 |
| REG-04 | 과거 일자 거래 | minYear 자동 확장 |
| REG-05 | 빌드 산출물 | `dist/` 정상 (assets 해시 포함) |

