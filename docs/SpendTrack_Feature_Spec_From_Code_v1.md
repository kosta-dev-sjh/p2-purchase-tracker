# SpendTrack 기능명세서 (코드 기준 v1)

- 작성일: 2026-04-27
- 작성 방식: 사용자 요청에 따라 `src/` 코드를 single source of truth 로 보고 재작성
- 본 문서는 기존 `SpendTrack_Planning_Document.md` 와 별도로, **현재 실제 빌드되는 동작**만 정리합니다. planning 문서는 비전·결정 배경, 본 문서는 구현 사실의 인덱스.
- 우선순위 충돌 시: 본 문서 ↔ 코드 차이가 있으면 코드를 신뢰하고 본 문서를 갱신합니다.

---

## 0. 한 줄 요약

SpendTrack 는 React 19 + Vite + Firebase 기반 SPA로, 쇼핑 주문내역 OCR / 카드 CSV·XLSX / 수동 입력을 하나의 거래 스토어로 모아 월별로 조회·분석하는 가계부형 소비관리 웹앱입니다.

## 1. 라우팅 (src/App.tsx)

| 경로 | 가드 | 컴포넌트 | 역할 |
| --- | --- | --- | --- |
| `/login` | PublicOnly | LoginPage | 이메일/비밀번호 로그인 + Google OAuth |
| `/register` | PublicOnly | RegisterPage | 회원가입 |
| `/forgot-password` | PublicOnly | ForgotPasswordPage | 비밀번호 재설정 메일 발송 |
| `/` | Protected | HomePage | 대시보드 — 월별 KPI/차트/최근 거래/AI 인사이트 |
| `/upload` | Protected | UploadPage | 입력 방식 선택 (OCR / 수동 / 카드 파일) |
| `/ocr-upload` | Protected | OcrUploadPage | 캡처 업로드 + 플랫폼 태그 + OCR 분석 시작 |
| `/ocr-edit` | Protected | OcrEditPage | OCR 결과 검토·수정·저장 |
| `/manual-entry` | Protected | ManualEntryPage | 거래 직접 입력 + 상품 모달 |
| `/csv-upload` | Protected | CsvUploadPage | 카드 CSV/XLSX(XLS) 벌크 업로드 |
| `/transactions` | Protected | TransactionsPage | 월별 거래 목록·필터·상세·수정·삭제 |
| `/analysis` | Protected | AnalysisPage | 월별 심층 분석 (플랫폼/카테고리/반복/요일/구독) |
| `/settings` | Protected | SettingsPage | 프로필 / 계정 / 카테고리 / 위험구역(탈퇴·전체삭제) |
| `*` | — | Redirect | 정의되지 않은 경로 → `/` |

가드 동작: `useAuthSession().status === "loading"` 동안에는 "Firebase 연결 중…" 화면을 보여주고, 끝나면 인증 상태에 따라 진입/리다이렉트.

## 2. 도메인 데이터 모델 (src/pages/Transactions/components/TransactionTable.tsx)

`TxRow` 가 거래의 단일 진실원입니다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `id` | string | 거래 고유 ID (`m_*`, `csv_*`, `ocr_*` prefix 등) |
| `type` | `"expense" \| "income"` | 지출/수입 |
| `date` | string | `YYYY.MM.DD` 형식 |
| `platform` | `"coupang" \| "naver" \| "unspecified"` | 라벨: 쿠팡 / 네이버쇼핑 / 미지정 |
| `categories` | `TxCategory[]` (1~3개) | 표준 5종(`living/fashion/digital/food/etc`) + 사용자 커스텀 `custom_*`. 빈 배열 금지, 최소 `["etc"]` |
| `title` | string | 거래명/사용처 (필수) |
| `amount` | number | **지출은 음수**, 수입은 양수. 환불/취소도 양수로 저장 (메모리 규칙) |
| `status` | `"purchase" \| "cancel" \| "refund" \| "sub" \| "etc"` | type 별 허용 조합: 지출=purchase/sub/etc, 수입=refund/cancel/etc |
| `source` | `"mock" \| "csv" \| "ocr" \| "manual"` | 반입 경로 |
| `memo` | string? | 수동 입력 메모 |
| `detail.items[]` | `{name, price, link?}[]` | 상품 상세 |
| `detail.source` | `"OCR" \| "MANUAL"` | 상세의 출처 |
| `detail.sourceImageUrl` | string? | OCR 원본 캡처 (data URL) |
| `detail.itemsCoverage` | `"full" \| "partial"` | partial = 합계 미달임에도 "이대로 등록" 선택 |
| `detail.discountAmount` | number? | 주문단위 차감액 (쿠폰/포인트/카드할인) |
| `detail.folded` / `itemCountHint` / `hiddenItemCount` / `sectionTotal` | OCR 메타 | 네이버 접힌 주문 보존용 |
| `detail.cardImport` | object? | 카드 CSV/XLSX 원본 메타 (`recordKind`/`paymentMode`/할부 회차/`approvalNumber`/`dueDate` 등) |

부호 규약(메모리): **환불/취소는 수입(+) 으로 저장**. 단 순수입 KPI 에서는 `status === "cancel"` 을 제외 (Home/Analysis 의 `sumIncomeAndRefund` 등). 별도 "취소 금액" 카드는 `status === "cancel"` 만 모아 `Math.abs` 로 표시.

## 3. 인증 / 동기화 (src/lib/firebase.ts, firebaseSync.ts)

- Firebase Auth (이메일+비번, Google Popup) — 세션은 `browserLocalPersistence`.
- 로그인 성공 시 `startFirebaseSync()` 가 `onAuthStateChanged` 로 다음을 부트스트랩:
  - `bootstrapUserProfile` / `bootstrapCategories` (없으면 기본값 생성)
  - `restorePendingDeletionIfNeeded` 호출 — 탈퇴 유예 중이던 계정은 자동 복구, 7일 경과 시 `purged` 로 판정해 다시 로그아웃
  - `subscribeUserProfile` / `subscribeCategories` / `subscribeTransactions` 로 Firestore 실시간 구독 → Zustand 스토어에 hydrate
- 로그아웃: `signOut(auth)` 호출 → `authStore.setUnauthenticated()` → 로컬 상태 리셋 (프로필/카테고리/거래 모두 기본값/빈 배열로).
- 계정 삭제: Firebase Functions `deleteAccount` 호출 (7일 grace, 재인증 필요).
- AI 호출: Firebase Functions `geminiProxy` (Gemini 2.5 Flash) — API 키는 Functions Secret(`GEMINI_API_KEY`).

## 4. 화면별 기능 명세

### 4-1. Login (`/login`)

- 컴포넌트: `src/pages/Login/index.tsx` → `LoginForm`.
- 입력: 이메일, 비밀번호.
- 클라이언트 1차 검증: 빈 값 / 이메일 형식.
- 액션:
  - "로그인" → `signIn` (Email/Pw). 성공 시 `/` 이동.
  - "Google 로 계속하기" → `signInWithGoogle` (popup). 성공 시 `/` 이동.
  - "비밀번호를 잊으셨나요?" → `/forgot-password`.
- 에러 매핑: `auth/invalid-credential`, `auth/wrong-password`, `auth/user-not-found` → "이메일이나 비밀번호가 일치하지 않습니다". `auth/too-many-requests`, `auth/network-request-failed`, `auth/user-disabled` 각각 한국어 매핑. 매핑 안 된 코드는 일반화 메시지.
- 로그인 상태 유지 체크박스: UI 상의 토글. 실제 persistence 는 항상 `browserLocalPersistence` (코드 기준).

### 4-2. Register (`/register`)

- 컴포넌트: `RegisterForm` + `PasswordStrength`.
- 입력: 이름, 이메일, 비밀번호 (강도 미터 표시).
- 액션: `registerAccount({ name, email, password })` → Auth 계정 생성 → Firestore 프로필/카테고리 부트스트랩 → 거래는 빈 배열로 시작.
- 성공 후 `/` 이동, Login 분기에서 신규 가입자에게는 WelcomeTutorial 강제 노출 가능 (`navigate("/", { state: { showTutorial: true } })`).

### 4-3. ForgotPassword (`/forgot-password`)

- `sendPasswordResetEmail` 호출 → 발송 결과 안내.

### 4-4. Home / Dashboard (`/`)

- 컴포넌트: `src/pages/Home/index.tsx`.
- 월 셀렉터: `MonthPicker` — minYear/maxMonthKey는 거래 데이터의 `date` 에서 자동 산출, `markedMonthKeys` 로 거래가 있는 달에 점 표시.
- 본문 구성(상→하): KPI strip → (PlatformDonut + TrendChart) → RecentTransactions → InsightCards (AI 인사이트 포함).
- AI 인사이트:
  - 트리거: 해당 월 거래의 `건수+총액` 해시가 변할 때만 `generateInsight` 호출.
  - 캐시: `aiInsightsStore` (월별 hash + insightText). 실패 시 캐시에 쓰지 않아 다음 변화 때 재시도.
  - 로딩 중에는 `isAiLoading=true` → InsightCards 가 AI 영역에 로딩 블록을 노출.
- WelcomeTutorial: 로그인 후 `state.showTutorial` 이면 무조건 1회, 그 외 일반 진입은 localStorage 플래그 기반 1회만.
- 우상단 stamp: `오늘: YYYY.MM.DD` — 헤더의 선택 월과 구분되도록 라벨링.

### 4-5. Upload (`/upload`)

- 입력 방식 선택 카드 3개 (`MethodCard`):
  - "OCR로 입력" → `/ocr-upload`
  - "수동 입력" → `/manual-entry`
  - "카드 내역 가져오기" → `/csv-upload`
- 모바일에서 카드 1열, 태블릿 2열, 데스크톱 3열.

### 4-6. OcrUpload (`/ocr-upload`)

- 컴포넌트: `src/pages/OcrUpload/index.tsx`.
- 흐름: 플랫폼 선택(`coupang`/`naver`) → 이미지 업로드(드롭존 or 파일선택) → 업로드 그리드(썸네일·플랫폼 뱃지·삭제) → "분석 시작" → AnalysisProgressModal → 끝나면 `/ocr-edit` 으로 이동.
- 배치 단위: 같은 화면에서 플랫폼을 바꿔 가며 추가 업로드 가능. 각 이미지는 업로드 시점의 플랫폼을 태그로 보존.
- 분석 파이프라인 (`utils/ocrAnalyzeImages.ts`):
  1. 이미지 전처리 → Tesseract OCR (`kor+eng`)
  2. 플랫폼 디텍트 + 플랫폼별 파서(`ocrParsers.ts`)로 1차 구조화
  3. `ocrQuality.pickBadProducts` 가 카드별 품질 평가 → bad 있으면 그 이미지 전체에 대해 AI 보정 호출(`aiService.fallbackOcrProducts`)
  4. AI 가 실제로 값을 바꾼 카드에만 `aiApplied: true` 표시
- 진행률 표시: 콘솔에 (호출 비율 / 카드 실효율 / 이미지 실효율) 3개 수치 로깅 (CLAUDE.md §9.4).

### 4-7. OcrEdit (`/ocr-edit`)

- 컴포넌트: `src/pages/OcrEdit/index.tsx` (914 LOC).
- 좌: 이미지 리스트 + 미리보기 (`ImagePreview`, `ImageList`, `AddImagesModal`)
- 우: 주문 카드별 폼 (`OrderCard`) — 날짜/상태/상품명/가격/링크 편집.
- 합계 점검: 상품 합계 vs 거래 총액 차이 발생 시 `ProductTotalWarningModal` (mode=exceeds 또는 under). under 에서 "이대로 등록" 누르면 `itemsCoverage="partial"` 로 저장.
- 매칭 후보: 같은 날짜·플랫폼·금액 거래가 이미 있으면 `MatchTransactionModal` 로 "기존 거래에 상품 추가" / "별도 새 거래" / "취소" 중 선택. 자동 머지 강제 없음(planning §1-6-2).
- 저장: `/transactions` 로 이동.
- 주의(CLAUDE.md §4): `detail.itemsCoverage`, `detail.sourceImageUrl` 같은 메타는 머지 시 보존. 1차 파서·AI 보정 결과의 `discountAmount` 는 주문단위 차감만 저장.

### 4-8. ManualEntry (`/manual-entry`)

- 폼 구성: TypeSegment(지출/수입) → MetaFields(거래명, 금액, 플랫폼, 거래일자, 카테고리, 메모, 할부 옵션, 청구금액/결제예정일) → StatusTags → ProductRows + 상품 추가 모달.
- 필수값: `title`, `amount`, `date`. 누락 시 모두 한 줄에 모아 보여주고 첫 누락 필드로 포커스.
- 할부 옵션: `lump_sum` / `installment` / `none`. installment 일 때는 할부개월·현재/전체 회차 검증 추가.
- 부호: 지출은 자동 음수화, 수입은 양수.
- `status` 기본값: 지출=purchase, 수입=refund (또는 type별 default).
- 후보 매칭: 사용자가 입력 중 날짜·금액(+플랫폼)이 일치하는 기존 거래가 있으면 SuggestionCard 표시 → "이 거래 수정하기"(`/transactions?editTransactionId`) / "아니에요, 계속" (해당 키만 dismissed).
- 저장 흐름: `buildRowFromForm` → `checkProductTotal` → `checkDuplicates` + `autoResolveDuplicates` → 잔여 toSave/toMerge/skipped 처리 → 성공 시 700ms 토스트 후 `/transactions`.
- 카테고리 자동 추정: ManualEntry 는 사용자가 명시적으로 고른 값을 그대로 저장 (`addFromManual`).

### 4-9. CsvUpload (`/csv-upload`)

- 지원 확장자: `.csv`, `.xlsx`, `.xls` (`utils/fileImport.ts`).
- 흐름: Dropzone 업로드 → `importFile` (CSV는 `csvParse`+`importRows`, XLSX/XLS 는 `xlsxImport.readXlsxAsRows` → 같은 `importRows`) → 성공률 < 50% 면 `aiService.fallbackCsv` 로 AI 재해석 시도.
- 미리보기: PreviewTable 에 인식 결과(거래 후보) 노출, 사용자 선택 가능.
- 중복 처리: `checkDuplicates` → 완전 중복(`exactDup`)은 체크박스로 강제 포함 가능, 아이템 차이는 신규 vs 변경 안내, 부분 차이는 머지 액션 생성.
- 저장: `transactionsStore.addFromImport` (카테고리 자동 추정 적용 — `etc`/빈 카테고리는 가맹점명·키워드 룰로 재분류).
- 결과 모달: SaveResultModal — 저장된 행/머지된 행/스킵된 행 요약.

### 4-10. Transactions (`/transactions`)

- 좌측: SummaryStrip(월별 합계 카드들) + FilterBar(검색/유형/플랫폼/카테고리/상태/할부) + TransactionTable.
- 우측 (PC/태블릿): DetailPanel (sticky) — 선택 거래의 상세, 상품 목록, OCR 원본 이미지 보기, 메모, 카드 메타.
- 모바일: 행 아래 아코디언으로 DetailPanel 펼침.
- 액션: 행 클릭 → 상세 / 더보기 → 수정 모달(`TransactionEditModal`) / 삭제 확인 모달.
- 컬럼: 유형 / 주문일 / 플랫폼 / 거래명 / 상품(+N개) / 카테고리 / 금액 / 상태·결제. 모바일은 카드 행으로 변환.
- 진입 state(`editTransactionId`): ManualEntry 의 "이 거래 수정하기" 등에서 넘어왔을 때 해당 거래의 편집 모달을 자동으로 열음.

### 4-11. Analysis (`/analysis`)

- 본문 구성(상→하): SummaryBanner(이번 달/해당 월 요약 문구) → KpiStrip → (PlatformBars + CategoryBars) → MonthlyTrend → (RepeatTop3 + SubscriptionList + WeeklyPattern).
- CategoryBars: "지난 달" 탭에서 비교 표시 (`prevData`).
- 색상: 카테고리 색은 `useCategoryColorMap` 으로 설정 변경 즉시 반영.

### 4-12. Settings (`/settings`)

- 좌: SettingsNav (4개 섹션). 우: 본문.
- ProfileSection: 이름/닉네임/이메일/아바타 표시 + 편집.
- AccountSection: 비밀번호 변경(`changeCurrentPassword`), 마지막 변경일 표시. 비밀번호 사용자/Google 사용자 구분 (`getAccountDeletionProvider`).
- CategoriesSection: 표준 5종 + 커스텀 카테고리 추가/삭제/색상 변경. 정렬은 `STANDARD_CATEGORY_ORDER` 기준.
- DangerSection: "전체 거래 삭제"(로컬+Firestore) / "계정 탈퇴"(Functions `deleteAccount`, 재인증 필요, 7일 grace).

## 5. 공통 도메인 규칙

### 5-1. 중복 감지 (`utils/duplicateCheck.ts`)

- 1단계 fingerprint: `date | platform | abs(amount) | title` (+ 카드 메타가 있으면 `cardImport.recordKind/paymentMode/회차/승인번호/청구월…` 추가).
- 2단계 fingerprint: `detail.items` 의 `name|price` 정렬 join.
- 결과 분기:
  - 1단계 매칭 없음 → fresh
  - 1+2단계 모두 일치 → exactDup (스킵, 사용자가 강제 포함 시 toSave)
  - 1단계 일치, 2단계 차이:
    - 가격이 변한 아이템 존재 → 새 거래로 분기(`toSave`)
    - 새 아이템만 있음 → `toMerge` (기존 거래에 아이템 추가)
    - 그 외 → 스킵

### 5-2. 카테고리 추론 (`utils/categoryInference.ts`)

- import 경로(CSV/OCR) 에서 `categories` 가 비었거나 `["etc"]` 인 경우만 추정.
- 우선순위: 학습 캐시(`spendtrack:category-learned:v1`) → bindings → 키워드 룰.
- ManualEntry 는 사용자가 직접 고른 값이므로 추정 미적용.
- 사용자가 거래 수정에서 카테고리를 명시적으로 바꾸면 학습 캐시에 기록.

### 5-3. 상품 합계 점검 (`utils/productTotalCheck.ts`)

- 모드:
  - `exceeds`: 상품 합계 > 거래 금액 → 블로킹, 사용자가 수정해야 함.
  - `under`: 상품 합계 < 거래 금액 → "이대로 등록" 가능, `itemsCoverage: "partial"` 표시.

### 5-4. AI 서비스 (`utils/aiService.ts`)

- Firebase Functions `geminiProxy` 통일 호출. 키는 Functions secret.
- 함수: `generateInsight(rulesText)` (Home), `fallbackOcrProducts(image, hints)` (OcrUpload), `fallbackCsv(text)` (CsvUpload).
- 호출 타이밍 원칙: 화면 진입 시 반복 호출 금지. 데이터가 실제 갱신될 때만.

### 5-5. 모바일 반응형

- breakpoints: `media.tablet`, `media.mobile`.
- 모바일에서 Sidebar 는 햄버거/하단 슬라이드, 표는 카드형, MonthPicker 는 풀-폭 pill.

## 6. 알려진 정책 (CLAUDE.md / OCR_Architecture_Decision.md)

- 쿠팡 OCR 파서: 회귀 대응 모드. 추가 정확도 튜닝 동결.
- 네이버 OCR: 얕은 1차 파서 + AI 보정 정책. 구조화 초안 수준.
- API 키: Functions Secret 만 사용. 프론트 번들에 직접 키 금지.
- 부호 규약: 환불/취소도 양수로 저장하되, 순수입 KPI 에선 cancel 제외.

## 7. 알려진 차이점 vs 기획문서 (planning v3)

코드 기준으로 보면 다음이 planning 문서와 추가/달라진 부분입니다:

1. `csv-upload` 화면이 **CSV 뿐 아니라 XLSX/XLS 도 지원**(`fileImport.ts`). planning §6-1 의 "결제내역 CSV" 보다 넓음.
2. Google OAuth 로그인 — planning 본문에는 명시되어 있지 않음.
3. 비밀번호 재설정(`/forgot-password`) 흐름 — planning 의 화면 표(§8-1)에는 없음.
4. WelcomeTutorial / ProductTour — planning 에 정식 항목 없음.
5. 카테고리 커스터마이즈(설정 > 카테고리 추가/삭제/색) — planning §10 의 단일 카테고리 가정과 다르게 **거래당 1~3개 카테고리** 허용.
6. AI 인사이트는 Analysis 의 SummaryBanner 외에 Home 의 InsightCards 에도 노출.
7. 카드 CSV 의 할부 메타(`cardImport.recordKind/paymentMode/회차/청구금액`) 보존 — planning 의 거래 모델보다 상세.
8. 계정 탈퇴는 Firebase Functions `deleteAccount` (7일 grace, 재인증) 로 구체화.

위 차이는 잘못된 게 아니라 v1 빌드의 구현 사실입니다. planning 문서를 손대고 싶다면 이 절을 기준으로 부분 갱신하면 됩니다(이번 작업에서는 코드 기준 본 문서를 신규 자료로 추가).

