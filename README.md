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

## When to run `npm install` again

You usually need to run `npm install` again when:

- you first receive or clone the project
- `package.json` or `package-lock.json` changes
- `node_modules` was deleted

If none of those happened, you normally do not need to rerun it.
