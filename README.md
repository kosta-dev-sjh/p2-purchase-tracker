# spend-track

## 문서 안내

- 기획 기준: `docs/SpendTrack_Planning_Document.md`
- AI 작업 규칙: `CLAUDE.md`
- AI 프로젝트 요약: `docs/AI_PROJECT_GUIDE.md`
- 차기 구현 참고:
  - `docs/collaboration/SpendTrack_Firestore_Data_Model.md`
  - `docs/collaboration/SpendTrack_MockAuth_Replacement.md`

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
- This fits EC2, Firebase Hosting, and Docker-based SPA deployment better than GitHub Pages hash routing

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

## State management

- Global state: Zustand + localStorage-backed store modules in `src/stores/`
- Common hooks in use: `useState`, `useMemo`, `useEffect`
- Redux is not currently used

## Optimization tools

- `zustand`: lightweight global state management for transactions, categories, and profile
- `rollup-plugin-visualizer`: bundle analysis tool. Run `npm run analyze` and open `dist/bundle-stats.html`

## When to run `npm install` again

You usually need to run `npm install` again when:

- you first receive or clone the project
- `package.json` or `package-lock.json` changes
- `node_modules` was deleted

If none of those happened, you normally do not need to rerun it.
