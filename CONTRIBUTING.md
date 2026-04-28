# 협업 가이드

## 브랜치 전략

- `main`: 배포/릴리즈 브랜치
- `dev`: 공용 통합 브랜치
- 기능 작업: `dev`에서 브랜치를 따고, 작업 후 PR로 다시 합칩니다.

권장 작업 흐름:

```bash
git checkout dev
git pull origin dev
git checkout -b feature/your-task
```

## 푸시 전 확인

```bash
npm install
npm run build
```

수정한 영역이 이미 lint-clean 상태이거나, 이번 작업의 목적이 lint 백로그 정리라면 `npm run lint`도 함께 실행합니다.

## 환경 파일 규칙

- 어떤 `.env*` 파일도 커밋하지 않습니다.
- 필요한 경우 각자 로컬 환경에서 `.env.local`을 직접 생성합니다.
- 외부 서비스 비밀키는 프론트엔드 `VITE_` 변수에 넣지 않습니다.

## 현재 사용 중인 스택

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

## 상태 관리 메모

- 전역 상태는 현재 `src/stores/`의 Zustand + localStorage 기반 스토어 모듈로 관리합니다.
- 로컬 UI 상태는 주로 `useState`, `useMemo`, `useEffect` 같은 React 훅을 사용합니다.
- 현재 이 프로젝트에서는 Redux를 사용하지 않습니다.

## 번들 확인

- 번들 크기를 확인할 때는 `npm run analyze`를 실행합니다.
- 결과 파일은 `dist/bundle-stats.html`에 생성됩니다.
