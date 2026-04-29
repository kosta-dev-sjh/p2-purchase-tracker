# spend-track

## 협업 참고

- AI 작업 규칙: `CLAUDE.md`

## Requirements

- Node.js `20.19.0+` or `22.12.0+`
- npm

This project uses Vite 8, so older Node.js versions can fail at `npm install` or `npm run dev`.

## Getting started

```bash
npm install
npm run dev
```

## Environment files

- Do not commit any `.env*` file
- Create `.env.local` manually on each machine when local env values are needed
- Never commit API keys or service-account JSON files
- Frontend code must not use `VITE_` secrets for direct third-party AI calls
- Firebase client config only goes in `.env.local`
- Gemini API key must be stored as a Firebase Functions secret: `GEMINI_API_KEY`
- Local Functions emulator can be connected with:
  - `VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST`
  - `VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT`

## Branch workflow

- `main`: protected release branch
- `dev`: protected integration branch
- individual work: create a feature branch from `dev`, push that branch, and merge through PR

Example:

```bash
git checkout dev
git pull origin dev
git checkout -b feature/your-task
```

See also: `CONTRIBUTING.md`

## Routing and deployment

- The app now uses `BrowserRouter`
- Production hosting must rewrite unknown routes back to `index.html`
- This fits Firebase Hosting-based SPA deployment better than GitHub Pages hash routing
- Firebase Hosting / Functions deploy config lives in `firebase.json`
- GitHub Actions production deploy now targets Firebase Hosting on pushes to `main`

## CI/CD for Firebase Hosting

The production site can be deployed automatically from GitHub Actions whenever `main` changes.

Required GitHub repository secrets:

- `FIREBASE_SERVICE_ACCOUNT_SPEND_TRACK_C2CC1`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`

Notes:

- The workflow file is `.github/workflows/deploy-firebase-hosting.yml`
- Pull requests to `main` can also use `.github/workflows/deploy-firebase-preview.yml` to publish a temporary preview URL
- The workflow builds the Vite app, deploys the `dist` output to Firebase Hosting, and applies `firestore.rules`
- `firebase.json` already contains SPA rewrites for `BrowserRouter`

## Current stack

- React 19
- TypeScript
- Vite 8
- React Router DOM
- Zustand
- styled-components
- Recharts
- SheetJS `xlsx`
- ESLint
- rollup-plugin-visualizer
- Firebase Auth / Firestore / Functions

## State management

- Global state: Zustand + localStorage-backed store modules in `src/stores/`
- Common hooks in use: `useState`, `useMemo`, `useEffect`
- Redux is not currently used

## Optimization tools

- `zustand`: lightweight global state management for transactions, categories, and profile
- `rollup-plugin-visualizer`: bundle analysis tool. Run `npm run analyze` and open `dist/bundle-stats.html`

## 상태관리와 최적화 도구 설명

이 프로젝트는 초보자가 구조를 따라가기 쉽도록 "무거운 도구를 많이 붙이기"보다, 필요한 문제를 작은 도구로 푸는 방향을 택했습니다. 아래 내용은 현재 코드 기준으로 왜 이 도구를 썼는지, 어디서 쓰는지, 어떻게 다루면 되는지를 정리한 문서입니다.

### 1. Zustand

`Zustand`는 전역 상태 관리 라이브러리입니다. 전역 상태란 여러 화면에서 함께 써야 하는 값을 뜻합니다. 예를 들어 거래 목록, 카테고리 목록, 프로필 정보처럼 "한 화면에서 바꾸면 다른 화면에도 바로 반영되어야 하는 데이터"가 여기에 해당합니다.

왜 썼는가:

- `useState`만으로도 화면 내부 상태는 충분히 관리할 수 있지만, 페이지가 달라져도 유지되어야 하는 데이터를 props로 계속 내려보내면 구조가 빠르게 복잡해집니다.
- Redux보다 설정이 훨씬 가볍고, 파일 수와 개념 수가 적어서 초보자가 진입하기 쉽습니다.
- 이 프로젝트는 `localStorage`와 함께 써서 "새로고침 후에도 남아 있어야 하는 데모 데이터"를 쉽게 유지합니다.

어디서 쓰는가:

- 거래 데이터: [src/stores/transactionsStore.ts](/Users/maren/EDU/second_project/spend-track/src/stores/transactionsStore.ts)
- 프로필 데이터: [src/stores/profileStore.ts](/Users/maren/EDU/second_project/spend-track/src/stores/profileStore.ts)
- 카테고리 데이터도 같은 패턴으로 `src/stores/` 아래에 있습니다.

어떻게 읽는가:

```ts
import { useProfile } from "./stores/profileStore";

function Example() {
  const profile = useProfile();
  return <div>{profile.name}</div>;
}
```

이 코드는 "스토어에 들어 있는 최신 프로필"을 구독합니다. 스토어 값이 바뀌면 이 컴포넌트도 자동으로 다시 렌더링됩니다.

어떻게 수정하는가:

```ts
import { profileStore } from "./stores/profileStore";

profileStore.save({ nickname: "새 닉네임" });
```

이 프로젝트는 `useProfileStoreBase`를 직접 여기저기서 쓰기보다, `profileStore.save()`, `transactionsStore.updateOne()`처럼 읽기 쉬운 API를 한 겹 감싸 두었습니다. 초보자 기준에서는 "스토어 내부 구현"보다 "화면에서 어떻게 호출하는지"를 먼저 익히는 편이 훨씬 편합니다.

실무적으로 기억하면 좋은 점:

- 화면 전용 상태는 `useState`로 둡니다. 예: 검색창 열림 여부, 모달 열림 여부, 임시 입력값.
- 앱 전체에서 공유할 상태만 Zustand에 둡니다. 예: 거래 원본 데이터, 사용자 프로필.
- "모든 상태를 전역으로 올리기"보다, 정말 공유가 필요한 것만 올리는 것이 유지보수에 유리합니다.

현재 렌더링 전략도 이 기준을 따릅니다:

- 거래 페이지는 원본 거래 배열만 전역 상태에서 구독하고, 검색어·선택 행·모달 열림 같은 화면 전용 값은 페이지 내부 상태로 둡니다.
- `SummaryStrip`, `FilterBar`, `TransactionTable`, `DetailPanel`은 `memo` 기반으로 묶어 두어, 모달 상태처럼 자기와 무관한 값이 바뀔 때는 가능하면 다시 그리지 않게 했습니다.
- 다만 거래 데이터 자체가 바뀌면 목록/요약은 다시 계산되어야 하므로, 그 경우의 리렌더는 정상 동작입니다.

### 2. rollup-plugin-visualizer

`rollup-plugin-visualizer`는 "번들 분석기"입니다. 번들은 빌드 결과물로 묶인 자바스크립트 파일이고, 분석기는 그 안에 어떤 라이브러리가 얼마나 큰 비중을 차지하는지 시각적으로 보여 줍니다.

왜 썼는가:

- 앱이 느려질 때 원인이 "코드가 복잡해서"가 아니라 "불필요하게 큰 라이브러리를 넣어서"일 때가 많습니다.
- 초보자는 보통 `npm install`만 보고 끝내기 쉬운데, visualizer를 보면 "이 라이브러리가 실제 빌드 크기에 얼마나 영향을 주는지"를 눈으로 확인할 수 있습니다.
- 성능 최적화를 감으로 하지 않고, 실제 번들 크기를 보고 판단할 수 있습니다.

어디서 설정되어 있는가:

- [vite.config.ts](/Users/maren/EDU/second_project/spend-track/vite.config.ts)

현재 설정은 `mode === "analyze"`일 때만 플러그인이 켜집니다. 즉 평소 개발 서버에서는 부담 없이 쓰고, 분석이 필요할 때만 켜는 방식입니다.

어떻게 쓰는가:

```bash
npm run analyze
```

그 다음 `dist/bundle-stats.html` 파일을 브라우저로 열면 됩니다.

읽는 법:

- 큰 사각형일수록 번들에서 차지하는 용량이 큽니다.
- 특정 라이브러리가 너무 크면 "정말 필요한지", "지연 로딩할 수 있는지", "대체 가능한 더 가벼운 선택지가 있는지"를 검토합니다.
- 코드 분할이나 라우트 단위 lazy loading을 적용하기 전에, 먼저 무엇이 큰지 확인하는 용도로 아주 좋습니다.

### 3. BrowserRouter

`BrowserRouter`는 React Router에서 일반적인 웹 주소 형태를 쓰게 해 주는 라우터입니다. 주소가 `/transactions`, `/settings`처럼 깔끔하게 보이는 이유가 이것입니다.

왜 썼는가:

- 사용자 입장에서 URL이 자연스럽고, 공유하기도 쉽습니다.
- 서버가 SPA fallback만 제대로 지원하면 깊은 링크(`/analysis`, `/settings`)도 정상 동작합니다.
- `HashRouter`처럼 주소에 `#`가 들어가지 않아 실제 서비스 주소와 더 비슷한 구조를 만들 수 있습니다.

어디서 쓰는가:

- [src/App.tsx](/Users/maren/EDU/second_project/spend-track/src/App.tsx)

기본 구조는 아래처럼 이해하면 됩니다.

```tsx
<BrowserRouter>
  <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/transactions" element={<TransactionsPage />} />
  </Routes>
</BrowserRouter>
```

초보자가 꼭 알아둘 점:

- `BrowserRouter`를 쓰면 프론트엔드만 바꾸는 것으로 끝나지 않습니다.
- 운영 서버도 "없는 파일 경로로 들어와도 `index.html`을 다시 내려주는 설정"이 필요합니다.
- README 위쪽의 "Routing and deployment" 섹션은 바로 그 이유를 설명합니다.

즉, 개발할 때는 편하지만 배포 서버 설정과 한 세트라고 생각하면 됩니다.

### 4. StrictMode 제거

현재 [src/main.tsx](/Users/maren/EDU/second_project/spend-track/src/main.tsx)를 보면 루트 렌더링이 `<StrictMode>` 없이 이루어집니다.

왜 제거했는가:

- React 개발 모드의 `StrictMode`는 일부 생명주기와 effect를 의도적으로 한 번 더 실행해 잠재 버그를 찾도록 돕습니다.
- 이 동작 자체는 좋은데, 초보자에게는 "왜 버튼을 한 번 눌렀는데 두 번 저장된 것 같지?", "왜 시드 데이터가 두 번 도는 것 같지?"처럼 보이기 쉽습니다.
- 이 프로젝트는 `localStorage` 기반 seed 데이터, 온보딩, 업로드/편집 흐름처럼 "부수효과가 눈에 보이는" 코드가 많아서, 학습 단계에서는 오히려 혼란을 줄 가능성이 컸습니다.

그래서 현재는:

- 개발 중 동작을 실제 사용자 동작과 더 비슷하게 맞추고
- 초보자가 effect/스토어 흐름을 추적할 때 혼란을 줄이며
- 데모 데이터 저장/수정 흐름을 더 직관적으로 확인하는 쪽을 택했습니다.

대신 기억해야 할 점도 있습니다:

- `StrictMode`를 제거했다고 해서 effect를 대충 써도 된다는 뜻은 아닙니다.
- 오히려 지금처럼 ESLint의 `react-hooks/set-state-in-effect` 같은 규칙으로 위험한 패턴을 더 엄격하게 잡아 주는 편이 중요합니다.
- 프로젝트가 더 안정화되면, 사이드이펙트를 정리한 뒤 다시 `StrictMode`를 켜는 것도 충분히 가능한 선택입니다.

한 줄로 요약하면:

- Zustand: 여러 화면이 함께 쓰는 데이터를 가볍게 관리하려고 사용
- visualizer: 번들 크기를 눈으로 확인해 최적화를 근거 있게 하려고 사용
- BrowserRouter: 실제 서비스 같은 URL 구조를 쓰려고 사용
- StrictMode 제거: 개발 중 부수효과가 두 번 보이는 혼란을 줄이려고 현재는 제외

## When to run `npm install` again

You usually need to run `npm install` again when:

- you first receive or clone the project
- `package.json` or `package-lock.json` changes
- `node_modules` was deleted

If none of those happened, you normally do not need to rerun it.
