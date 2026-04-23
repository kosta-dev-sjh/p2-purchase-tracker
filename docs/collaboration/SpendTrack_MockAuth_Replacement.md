# SpendTrack 목업 인증 교체 체크리스트

작성일: 2026-04-21
브랜치: `feature/mobile-and-mocklogin`
대상: 실제 인증(Firebase Auth / Supabase / 자체 서버 등) 연결 시점에서 이 문서를 찾는 담당자

이 문서는 **프런트엔드만 있는 MVP 단계에서 도입한 목업 로그인 분기**의 현재 규칙과,
**실제 인증을 붙일 때 삭제/교체해야 하는 파일 및 코드 지점**을 한 장으로 정리합니다.
목업이 운영에 섞여 들어가지 않게 하려는 가드레일이므로, 교체 작업자는 반드시 이 체크리스트를 따라 주세요.

---

## 1. 현재 목업 규칙 요약

| 입력 | 동작 |
| --- | --- |
| 이메일·비밀번호 **둘 다 빈 값** | 현재 세션 상태 **그대로 유지** (거래/프로필/온보딩 플래그 변경 없음). 홈으로 진입만. |
| 이메일 `1111@test.com` + 비밀번호 `1111` | **신규 계정 취급** → `transactionsStore.replaceAll([])`, `profileStore.reset()` 후 이메일만 입력값으로 덮어씀, `localStorage["spendtrack:onboarding:seen"]` 제거. Home 진입 시 `WelcomeTutorial` 오버레이 자동 표시 |
| 그 외 이메일·비밀번호 조합 (둘 다 비어있지 않음) | **데이터 있는 데모 계정 취급** → `transactionsStore.resetToSeed()`로 시드 거래 강제 복원, `profileStore.reset()` 후 이메일만 입력값으로 덮어씀, 온보딩 플래그는 `seen`으로 설정. 홈에 즉시 "쌓여 있는 계정" 뷰가 보임 |

- 판별은 `src/mocks/auth.ts` 의 `isNewAccountCredential(email, password)` / `isSeededDemoCredential(email, password)` 두 헬퍼로 단일화되어 있습니다.
- 목업 상수 2개(`NEW_ACCOUNT_EMAIL = "1111@test.com"`, `NEW_ACCOUNT_PASSWORD = "1111"`)와 플래그 키(`ONBOARDING_SEEN_KEY`)도 같은 파일에 모여 있습니다.
- `WelcomeTutorial`은 `localStorage` 플래그로만 자동 표시 여부를 결정하므로, 신규 계정 이벤트만 이 플래그를 정확히 제거하면 실제 인증으로 옮길 때도 동작이 깔끔하게 재사용됩니다.
- "데이터 있는 데모 계정" 분기는 **데모·스크린샷 용도 전용**입니다. 실제 인증으로 교체할 때는 이 분기 통째로 걷어내야 합니다.

---

## 2. 목업 관련 파일 인벤토리

### 2.1 삭제 대상 — 실제 인증 붙일 때 제거

- `src/mocks/auth.ts`
  - 이 폴더 자체를 나중에 지워도 되도록, 목업 전용 상수/헬퍼만 여기에 모아뒀습니다.
  - 다른 모듈에서 이 파일을 import 하는 지점은 아래 "교체 대상"에 전부 나열되어 있습니다.

### 2.2 교체 대상 — 파일은 유지하고 import/분기만 걷어내기

- `src/pages/Login/components/LoginForm.tsx`
  - `// TODO(auth): src/mocks/auth.ts 제거 시 이 분기 통째로 교체` 주석이 달려 있습니다.
  - `onSubmit` 내 `isNewAccountCredential(...)` / `isSeededDemoCredential(...)` 분기 **모두**를 실제 auth SDK 호출로 교체하세요.
    - 신규 가입 성공 시: `transactionsStore.replaceAll([])` + `profileStore.reset()` + `localStorage.removeItem(ONBOARDING_SEEN_KEY)` 와 동등한 초기화 로직을 가입 성공 콜백 쪽에 옮기는 것이 가장 자연스럽습니다.
    - 기존 로그인 성공 시: 서버에서 실제 거래 데이터를 로드. `isSeededDemoCredential` 분기의 `transactionsStore.resetToSeed()` 호출은 **반드시 제거**하세요. (데모 전용이라 운영에 섞이면 실데이터를 시드로 덮어씁니다.)
  - `useState`로 들어간 `email` / `password` 로컬 상태는 실제 auth 호출에서도 그대로 쓸 수 있습니다.

- `src/components/onboarding/WelcomeTutorial.tsx`
  - `ONBOARDING_SEEN_KEY` import 를 `src/mocks/auth.ts` 삭제와 함께 끊어야 합니다.
  - 같은 이름의 상수를 **어느 실제 모듈로 옮길지**는 팀 합의로 결정하세요. 가장 부담 적은 선택지:
    1. `src/constants/onboarding.ts` 같은 새 상수 파일로 이동
    2. 또는 Auth 도메인 폴더(`src/auth/` 신설)로 흡수
  - 표시 조건을 "localStorage 플래그 없음" → "실제 가입 이벤트 직후"로 바꾸고 싶다면, `WelcomeTutorial`을 전역 마운트 대신 회원가입 콜백에서 `forceOpen` 을 주어 띄우는 방향도 가능합니다.

- `src/pages/Home/index.tsx`
  - `<WelcomeTutorial />` 마운트 지점은 그대로 두어도 되고, 위에서 언급한 "가입 콜백에서만 뜨게" 하는 구조로 옮겨도 됩니다.
  - 어느 쪽을 택하든 `src/mocks/auth.ts` 삭제 후 컴파일이 깨지지 않는지 확인하세요.

### 2.3 그대로 두어도 되는 것 — 목업 전제 없이 이미 안전

- `src/stores/transactionsStore.ts`
  - 이미 `replaceAll([])`, `resetToSeed()` 같은 범용 API만 쓰고 있어, 실제 인증 로직이 호출만 교체해주면 됩니다.
- `src/stores/profileStore.ts`
  - `reset()` / `save({ email })` 역시 목업과 무관한 범용 메서드입니다.
- `src/components/auth/AuthLayout.tsx`, `src/pages/Login/index.tsx`
  - 목업 로직과 무관한 레이아웃/진입 파일. 건드릴 이유 없음.

---

## 3. 교체 작업 체크리스트

아래 순서대로 진행하면 목업 흔적이 남지 않도록 걷어낼 수 있습니다.

1. 실제 auth SDK(예: Firebase Auth) 초기화 모듈을 `src/auth/` 같은 곳에 도입.
2. `LoginForm.tsx` 의 `onSubmit`에서 `isNewAccountCredential` 분기를 제거하고, 실제 로그인/회원가입 호출로 교체.
   - 회원가입 성공 콜백 안에 "스토어 초기화 + 온보딩 플래그 제거" 로직을 옮겨둘 것.
3. `RegisterForm.tsx`가 추가되는 경우, 동일하게 실제 SDK 호출로 구현.
4. `ONBOARDING_SEEN_KEY` 상수를 `src/mocks/auth.ts` 에서 중립 위치(예: `src/constants/onboarding.ts`)로 이동.
   - `WelcomeTutorial.tsx` 의 import 경로만 바꿔 주면 됩니다.
5. `src/mocks/auth.ts` 파일 **삭제**.
6. 전역 검색으로 남은 흔적 없는지 확인:
   - `rg "mocks/auth"` → 히트 0
   - `rg "NEW_ACCOUNT_EMAIL\|NEW_ACCOUNT_PASSWORD\|isNewAccountCredential\|isSeededDemoCredential"` → 히트 0
   - `rg "resetToSeed"` → LoginForm에서는 호출이 사라져야 함. transactionsStore 내 정의 자체는 남겨도 무방.
   - `rg "TODO(auth)"` → 남아있는 TODO가 있다면 이 단계에서 정리
7. `npx tsc -b --force` 통과 확인.
8. 회귀 테스트:
   - 기존 계정 로그인 시 서버에서 불러온 거래 데이터가 그대로 유지되는지
   - 신규 가입 직후 거래 0건 + `WelcomeTutorial` 오버레이 자동 표시
   - 튜토리얼을 닫거나 "건너뛰기" 누르면 다음 진입부터 더 이상 안 뜨는지
   - 로그아웃 → 다시 가입 시 다시 뜨는지
   - 목업 단계에서만 존재하던 "아무 이메일 = 시드 복원" 동작이 **더 이상 일어나지 않는지** (중요: 실데이터 덮어쓰기 사고 방지)

---

## 4. 디자인/UX 상 남는 결정 사항

- **튜토리얼 슬라이드 문구/아이콘**은 `WelcomeTutorial.tsx` 상단 `STEPS` 배열 한 곳에서 관리 중입니다. 카피 수정은 이 파일만 건드리면 됩니다.
- 현재 오버레이는 `localStorage` 플래그 기반이라 **기기/브라우저별로 다시 뜰 수 있음**에 유의. 사용자 단위로 묶고 싶다면 실제 인증 전환 시 유저 문서에 `hasSeenOnboarding` 필드를 두는 식으로 확장하세요.
- `WelcomeTutorial` 은 `forceOpen` prop을 지원하므로, Settings 화면 등에서 "튜토리얼 다시 보기" 버튼을 만들고 싶다면 이 prop만 연결하면 됩니다.
- **스포트라이트 투어(`ProductTour`)** 는 `src/components/onboarding/tourStore.ts`의 `tourStore.start()` 를 호출하면 어디서든 기동됩니다. 현재는 `WelcomeTutorial` 마지막 슬라이드 "투어 시작" 버튼에서만 트리거됩니다. 투어 스텝(라우트·셀렉터·문구)은 `ProductTour.tsx` 상단 `STEPS` 배열에서 관리합니다.
- 투어가 조명하는 대상은 각 페이지의 `data-tour="..."` 속성으로 식별합니다 (`home-kpi`, `manual-savebar`, `ocr-zone`, `csv-zone`, `analysis-summary`). 페이지 리팩터링 시 이 속성이 사라지지 않도록 주의하세요.

---

## 5. 참고 링크

- 인수인계 원본: `docs/collaboration/SpendTrack_NextSession_Handoff_2026-04-21.md`
- 현재 구현 스냅샷: `docs/collaboration/SpendTrack_V1_Tech_Summary.md`
- 기획 문서(수정 금지): `docs/SpendTrack_Planning_Document.md`
