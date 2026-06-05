# SpendTrack

> 온라인 결제는 쉽고 빠른데, 기록은 흩어진다.
> **주문내역·카드 명세서 사진 한 장이면, 흩어진 소비가 상품 단위로 정리됩니다.**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Firebase](https://img.shields.io/badge/Firebase-Hosting%20·%20Auth%20·%20Firestore%20·%20Functions-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com)

- **Live**: https://spendtrack.web.app
- **발표자료 (바로 보기)**: https://spendtrack.web.app/presentation.html
- **소속/팀**: Toos · KOSTA 2차 프로젝트

---

## 한눈에

카드사 명세서에는 결제가 `OO페이 35,000원` 한 줄로만 남습니다. 정작 그 안에 무엇을 샀는지는 사라지고, 가계부 앱에 다시 옮겨 적는 일도 번거롭습니다.

SpendTrack은 그 한 줄을 **산 상품 단위로 풀어 줍니다.** 쇼핑 주문내역이나 카드 명세서를 올리면 OCR과 AI가 날짜·상품명·금액·상태를 읽어 자동으로 분류하고 기록합니다. 사용자는 **올리고 → 확인하고 → 분석을 보는** 세 단계만 거치면 됩니다.

## 핵심 가치 — "카드 한 줄을, 산 상품 단위로"

가계부의 가장 귀찮은 지점은 "결제 한 건"과 "내가 산 물건"이 1:1로 맞지 않는다는 데 있습니다. 한 번의 결제에 여러 상품이 묶이고, 분리배송·부분취소·할부까지 끼면 직접 정리하기가 어렵습니다. SpendTrack은 이 풀어내기(decomposition)를 자동화하는 것을 제품의 중심에 둡니다.

## 주요 기능

- **사진 업로드(OCR)** — 쿠팡·네이버쇼핑 등 주문내역 캡처에서 날짜·상품명·금액·상태를 추출해 편집 가능한 초안으로 만듭니다.
- **AI 보정** — 인식이 애매한 카드만 골라(Gemini 2.5 Flash Vision) 재검증합니다. 모든 이미지를 부르지 않고 "문제 있는 카드"만 게이트를 통과시켜 비용과 호출을 아낍니다.
- **카드 명세서(CSV·XLSX)** — 한 달치 거래를 한 파일로 자동 반영하고, 중복은 같은 기준으로 자동 판정합니다.
- **수동 입력** — 상품 단위 입력, 필수값 검증과 오류 필드 포커스 이동까지.
- **분석 대시보드** — 이번 달 핵심 숫자, 카테고리 비중, 반복결제(구독) 감지, 주간 소비 패턴을 한 화면에.
- **거래 관리** — 필터·검색·상세·수정과 중복 병합.
- **개인화** — Firebase Auth 로그인, 사용자별 데이터 분리 저장(Firestore).

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, React Router DOM, styled-components, Recharts |
| 상태 관리 | Zustand (+ localStorage), 화면 전용 상태는 `useState` |
| OCR / AI | tesseract.js(온디바이스 OCR), Google Gemini 2.5 Flash Vision |
| Backend / Infra | Firebase Auth · Firestore · Functions · Hosting |
| 파일 파싱 | SheetJS `xlsx` |
| 품질 / 분석 | ESLint, rollup-plugin-visualizer |
| CI/CD | GitHub Actions → Firebase Hosting (main 푸시 자동 배포 + PR 프리뷰) |

> **보안 메모** — Gemini API 키는 프론트엔드 번들에 절대 넣지 않습니다. Firebase Functions의 secret(`GEMINI_API_KEY`)에 저장하고 `geminiProxy` 함수를 거쳐서만 호출합니다.

## 아키텍처

- 페이지 16개, 유틸 33개 모듈, Zustand 스토어 6개로 구성된 SPA입니다.
- **OCR 파이프라인**: 이미지 전처리 → 플랫폼 감지 → 파서(구조화 초안 생성) → 품질 게이트(`pickBadProducts`) → 필요 시 AI 보정 → 중복/병합.
  - 신규 플랫폼은 쿠팡 파서를 복제하지 않고 "얇은 전처리 + AI 보정" 경로를 우선합니다.
  - AI 변경 표시(`aiApplied`)는 실제로 값이 바뀐 카드에만 찍습니다.
- **단일 기준 원칙**: 거래 CRUD는 `transactionsStore`로, 중복 판정은 `duplicateCheck.ts`로, 보강·병합은 `mergeEnrichment.ts`로 일원화해 입력 경로(수동·OCR·CSV·수정)가 서로 다른 규칙으로 갈라지지 않게 했습니다.

## 화면

홈 · 거래 · 분석 · 업로드(OCR / CSV / 수동 입력) · 설정, 그리고 사이드바 한 개. 비로그인 사용자에게는 랜딩 페이지와 로그인·회원가입·약관 화면을 제공합니다.

## 실행 방법

```bash
# 요구 사항: Node.js 20.19+ 또는 22.12+
npm install
npm run dev        # 개발 서버
npm run build      # 프로덕션 빌드
npm run analyze    # 번들 분석 (dist/bundle-stats.html)
```

환경 변수는 각 머신에서 `.env.local`로 직접 생성하며, 어떤 `.env*` 파일도 커밋하지 않습니다. 자세한 규칙은 `CLAUDE.md`와 `CONTRIBUTING.md`를 참고하세요.

## 발표자료

- **온라인**: https://spendtrack.web.app/presentation.html — 배포 사이트에서 바로 열립니다(16:9, 키보드 좌우 방향키로 넘김).
- **로컬**: 저장소의 `public/presentation.html`을 브라우저로 열면 동일하게 동작합니다.

## 팀 — Toos

| 이름 | 역할 |
| --- | --- |
| 송정현 | Lead |
| 이효도 | QA |

개발 과정에서 **Claude · Cowork · Claude Design · Codex**를 바이브 코딩 도구로 함께 활용했습니다.

## 배포

`main`에 푸시되면 GitHub Actions가 Vite 빌드 후 산출물(`dist`)을 Firebase Hosting(`spendtrack`)에 자동 배포하고 `firestore.rules`도 함께 적용합니다. `main`으로 향하는 PR은 임시 프리뷰 URL로도 확인할 수 있습니다.
