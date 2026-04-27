# SpendTrack QA 결과 리포트 v1

- 검증 일자: 2026-04-27 ~ 2026-04-28
- 기준 명세: `docs/SpendTrack_Feature_Spec_From_Code_v1.md`
- 체크리스트: `docs/SpendTrack_QA_Checklist_v1.md`
- 환경
  - 사용자 macOS 로컬 dev (`npm run dev`, `http://localhost:5173`)
  - Browser 1 (macOS, Chrome, MCP 자동화 경유)
  - 로그인 상태: 홍길동 / 1111@test.com (38건의 4월 거래 보유)
  - 빌드/타입: `npx tsc -b` PASS (sandbox 환경에서는 `npm run build` 의 rolldown 네이티브 바이너리가 arm64 Linux 용 미설치라 실패하지만, 사용자 macOS 빌드 산출물 `dist/` 는 정상)

---

## 1. 결과 요약

| 카테고리 | PASS | FAIL | 미검증 |
| --- | --- | --- | --- |
| 환경 / 빌드 | 4 | 0 | 1 (`npm run build` 는 macOS 에서 별도 확인 필요) |
| 인증 / 라우팅 가드 | 5 | 0 | 5 (Google OAuth, 비번 재설정 등 — 실제 메일 발송 불가 환경) |
| 입력 방식 선택 | 4 | 0 | 1 (모바일 폭) |
| 수동 입력 | 4 | 0 | 10 (할부/매칭/머지 등 데이터 의존) |
| CSV/XLSX 업로드 | 1 | 0 | 10 (브라우저 자동화에서 file_upload 차단) |
| OCR 업로드/편집 | 1 | 0 | 9 (이미지 업로드 차단으로 미실행) |
| 거래내역 | 4 | 0 | 11 |
| 홈/분석 | 5 | 2 | 3 |
| 설정 | 3 | 0 | 4 |
| 안정성/회귀 | 3 | 0 | 2 |

전체적으로 **블로킹 이슈는 없음**. 분석 화면의 회귀 1건과 한국어 조사 처리 1건이 우선 조치 대상.

---

## 2. 발견된 이슈

### ISSUE-01 [Medium · 분석] 요일별 지출 패턴 카드의 부제목이 데이터와 무관하게 하드코딩 — **2026-04-28 RESOLVED**

- 위치: `src/pages/Analysis/components/WeeklyPattern.tsx:113`
  ```tsx
  <CardSub>주말에 집중되는 경향</CardSub>
  ```
- 재현: `/analysis` 진입. 4월 데이터 기준 본문(`note`)은 "평일 쪽 지출이 51%로 더 많아요. 주말 쇼핑을 의식적으로 덜 하는 흐름이에요."(`src/pages/Analysis/data.ts:343`) 인데 카드 부제는 항상 "주말에 집중되는 경향" 으로 표기됨.
- 영향: 분석 화면 헤드라인이 본문과 정반대 메시지를 전달 — 사용자 신뢰도 저하.
- 권장 수정: `WeeklyPatternProps` 에 `subtitle` 또는 `weekendBias` 같은 신호를 추가하고, `data.ts` 에서 weekendShare 50% 기준으로 `"주말에 집중되는 경향"` / `"평일에 더 분산된 흐름"` 등을 함께 내려서 표시. 또는 부제를 단순히 "이번 달 요일별 분포" 같은 중립 라벨로 바꿔 회귀 차단.
- 적용된 수정 (2026-04-28):
  - `WeeklyPatternProps` 에 `subtitle?: string` 추가 (`src/pages/Analysis/components/WeeklyPattern.tsx`).
  - `buildWeekly` 에서 `weekendShare` 기준으로 `"주말에 집중되는 경향" / "평일에 더 분산된 흐름" / "이번 달 요일별 분포"(0건)` 산출 후 함께 반환 (`src/pages/Analysis/data.ts`).
  - `Analysis/index.tsx` 에서 `subtitle={data.weekly.subtitle}` 전달.
  - 검증: 4월 데이터(weekendShare 49% → 평일 51%) 에서 부제가 "평일에 더 분산된 흐름" 으로 갱신, 본문과 일치. `npx tsc -b` PASS.

### ISSUE-02 [Low · 홈] 인사이트 메시지에 한국어 조사 자동 처리 누락 — **2026-04-28 RESOLVED**

- 위치: `src/pages/Home/data.ts:227`
  ```ts
  title: `주로 ${topRepeat.title}를 사셨어요.`,
  ```
- 재현: 홈에서 반복구매 1위 거래명이 "쿠팡" 인 경우 "주로 쿠팡를 사셨어요." 로 출력됨 (받침이 있어 "쿠팡을" 이 자연스러움).
- 영향: AI 보조가 아니라 규칙 기반 인사이트라 사용자 시야에서 완성도 떨어지는 인상.
- 권장 수정: 마지막 한글 음절의 종성 유무로 `를/을` 선택하는 작은 유틸 추가 (예: `appendObjectParticle(name)`), `사셨어요` / `이/가` 등 다른 곳도 함께 점검.
- 보너스 점검: 같은 데이터 빌더 함수(`buildHomeData`) 안의 다른 메시지(`PLATFORM_LABELS[top.platform]` 활용 부분 등)도 조사 처리 필요한지 동시에 검토 권장.
- 적용된 수정 (2026-04-28):
  - 신규 유틸 `src/utils/koreanParticle.ts` 추가 — `hasJongseong / objectParticle / subjectParticle / topicParticle / withParticle` 5종. 한글이 없는 토큰("GS25" 등)은 안전한 폴백("을/를", "이/가", "은/는") 사용.
  - `src/pages/Home/data.ts` 의 반복구매 인사이트 — `${topRepeat.title}${objectParticle(topRepeat.title)} 사셨어요`. 4월 데이터에서 "주로 쿠팡을 사셨어요." 로 정정 확인.
  - `src/pages/Analysis/data.ts` 의 SummaryBanner — `${topCategory.label}(${percent}%) 가/이` 도 종성에 따라 분기. (예: "기타(92%)가" / "생활용품(N%)이").
  - 검증: 홈/분석 두 화면 모두 HMR 후 정상 렌더, `npx tsc -b` PASS.

### NOTE-03 [정보 · 환경] CSV/XLSX 업로드 자동화 검증 불가

- 증상: Claude in Chrome MCP 의 `file_upload` 호출이 `Not allowed` 로 거부됨 (Korean/non-Korean 파일명 불문, .xlsx/.xls 모두 동일).
- 의미: 사용자 수동 업로드 경로(파일 선택 다이얼로그) 동작에는 영향 없음. 코드 결함이 아니라 보안 정책 차원의 자동화 차단.
- 후속 점검 권장: 사용자가 다음 5종 xlsx/xls 를 직접 올려 보고 결과를 공유해 주면 1차 파서 / AI fallback 가동률·미리보기 정합성을 확정 검증 가능.
  - `~/Downloads/hyundaicard_20260423 (1)2.xlsx`
  - `~/Downloads/일시불+할부_카드이용내역조회.xlsx`
  - `~/Downloads/ChungGu.xls`
  - `~/Downloads/기간별 사용내역 조회_출력용_20260423.xls`
  - `~/Downloads/카드이용내역__20260423123821.xls`

### NOTE-04 [정보 · 명세] 홈 인사이트의 "쿠팡 비중이 가장 높아요" 는 의도된 동작

- 코드 근거: `src/pages/Home/data.ts:118` 주석 ―
  > "미지정" 버킷은 최상위 후보에서 제외합니다("미지정 비중이 가장 높아요"는 도움이 안 됩니다).
- 4월 데이터의 PlatformDonut 은 `미지정 71% / 쿠팡 19% / 네이버 10%` 인데 인사이트는 "쿠팡 비중이 가장 높아요" 로 출력 — 의도된 정책.
- 옵션: 사용자 혼란을 줄이기 위해 카드 부제 등에 "*미지정 제외*" 마이크로 카피 한 줄 추가하면 더 명확.

### NOTE-05 [정보 · UX] DangerSection 카드 헤더 "계정 삭제 예약" 라벨

- 위치: `src/pages/Settings/components/DangerSection.tsx`
- 사용자가 아직 탈퇴를 신청하지 않은 상태에서도 카드 타이틀이 "계정 삭제 예약" 으로 보일 수 있어, 실제 예약 상태와 안내문 사이에 톤 차이 발생.
- 권장: 예약 전엔 "계정 삭제 안내", 예약 중일 때 "계정 삭제 예약" 식으로 상태 의존 라벨 분리. (확인 필요한 회귀 가능성 있음 — 현재 코드 분기 미점검)

---

## 3. PASS 항목 (대표)

- ENV-02 dev 서버 응답 / ENV-04 가드 (비로그인 시 `/login` 리다이렉트) / ENV-05 첫 로드 콘솔 에러 0건 (vite hot reload 메시지만)
- AUTH-04 정상 로그인 후 `/` 진입 / AUTH-09 새로고침 후 세션 유지
- UPL-01 ~ 04 입력 방식 선택 카드 → 각 라우트 이동
- MAN-01 빈 폼 저장 → "다음 항목을 입력해 주세요 — 거래명, 금액(숫자), 거래일자" + 거래명 인풋 포커스 / 누락 한 줄 노출
- TX-01 현재 월 표시 / TX-02 MonthPicker 변경 / TX-04 ~ 08 필터 항목 노출 (지출/수입/플랫폼/카테고리/상태/결제방식 셀렉트)
- TX-09 행 클릭 → 우측 DetailPanel 갱신 (선택한 토스페이먼츠 거래의 결제방식·결제예정일 등 메타 보존)
- HOME-01 ~ 04 KPI / Donut / Trend / Recent 모두 정상 렌더
- HOME-06 AI 인사이트 호출은 데이터 hash 변화 시에만 (코드 검토)
- HOME-05 빈 데이터 인사이트 안전 (구현 코드 기준)
- ANA-01 SummaryBanner / ANA-02 PlatformBars / ANA-03 CategoryBars 지난달 비교
- SET-03 표준 카테고리 5종(`기타 / 생활용품 / 패션·의류 / 전자기기 / 식품·음료`) 정렬 OK
- 라우팅 가드 — 비공개 라우트는 인증 체크, `/forgot-password` 는 PublicOnly 로 인증 시 `/` 리다이렉트 (의도)
- 빈 상태(데이터 없음) — `/ocr-edit` 진입 시 "등록된 이미지가 없어요" 안내, 크래시 없음
- localStorage 키 — `spendtrack:transactions:v5` 사용 (코드 라인), v4 이전 더미 시드 자동 무효화

---

## 4. 미검증 / 후속 권장

- CSV/XLSX 실제 파싱 정확도 — NOTE-03 참고
- OCR 이미지 업로드/분석 — Vision fallback 호출까지 — 동일 사유로 자동화 차단
- Google OAuth 로그인 흐름
- 비밀번호 재설정 메일 수신 (실제 메일함)
- 비밀번호 변경, 탈퇴 재인증 흐름 (실제 비번 입력 필요)
- 모바일 뷰포트 (CSS breakpoint) 시각 회귀 — 자동화 환경 1539x784 데스크톱 폭에서만 검증
- 카테고리 추가/삭제 후 거래내역 폴백 동작
- 거래 0건 신규 계정 onboarding (WelcomeTutorial / ProductTour)

---

## 5. 빠른 조치 우선순위 제안

1. **ISSUE-01 수정 (분석 카드 부제 정합성)** — 사용자 신뢰 직결, 1줄 수정 + props 추가로 즉시 해결.
2. **ISSUE-02 수정 (조사 처리 유틸 도입)** — 작은 유틸 1개로 향후 다국어 메시지 회귀까지 흡수.
3. **사용자 사이드에서 카드 CSV 5종 직접 업로드 1회씩** — 1차 파서 인식률, AI fallback 발화 빈도, SaveResultModal 의 머지/스킵 카운트 정합성 확인.
4. **NOTE-04 마이크로 카피 1줄 추가** (`*미지정 제외*`) — 5분 작업, UX 혼란 차단.

---

## 6. 보조 산출물

- 새 기능명세서 (코드 기준): `docs/SpendTrack_Feature_Spec_From_Code_v1.md`
- QA 체크리스트: `docs/SpendTrack_QA_Checklist_v1.md`
- 본 리포트: `docs/SpendTrack_QA_Findings_v1.md`

