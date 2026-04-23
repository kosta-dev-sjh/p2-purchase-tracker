# Contributing

## Branch strategy

- `main`: release branch
- `dev`: shared integration branch
- feature work: branch from `dev`, then merge back through PR

Recommended flow:

```bash
git checkout dev
git pull origin dev
git checkout -b feature/your-task
```

## Before pushing

```bash
npm install
npm run build
```

Use `npm run lint` as well when the touched area is already lint-clean or when you are explicitly fixing lint backlog.

## Environment files

- Do not commit any `.env*` file
- Create `.env.local` manually on each machine when needed
- Do not put third-party secret keys in frontend `VITE_` variables

## Current stack

- React 19
- TypeScript
- Vite 8
- React Router DOM
- styled-components
- Recharts
- SheetJS `xlsx`
- ESLint

## State management notes

- Global state is currently handled with lightweight localStorage-backed store modules in `src/stores/`
- Local UI state mainly uses React hooks such as `useState`, `useMemo`, and `useEffect`
- Redux is not used in this project right now
