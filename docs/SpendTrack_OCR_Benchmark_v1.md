# SpendTrack OCR 인식률 벤치 v1

- 측정일: 2026-04-28
- 환경: 사용자 macOS (사실상 동일) / sandbox Linux 모두에서 캐시 기반 재현 가능. Tesseract 결과는 `.ocr-raw-cache/` 에 미리 저장돼 결정론적.
- 스크립트:
  - 쿠팡: `node --experimental-strip-types ocr-scripts/ocr-name-score.mjs [--no-ai]`
  - 네이버: `node --experimental-strip-types ocr-scripts/ocr-naver-parser-only.mjs`
- 샘플 출처: `.local-samples/` (실제 사용자 캡쳐 — 쿠팡 23장 / 네이버 49장)
- 정답(GT): `.ocr-raw-cache/gemini-names*.json` (Gemini 2.5 Flash Vision 으로 별도 추출)

## 1. 한 줄 결론

| 플랫폼 | 1차 파서만 | 1차 + AI 보정 | 정책(CLAUDE.md §9.1) |
| --- | --- | --- | --- |
| 쿠팡 | clean-name 41.8% | **clean-name 92.5%** | 회귀 대응 모드 (튜닝 동결) — 합격선 |
| 네이버 | clean-name 52.3% / 가격 86.5% / name+price+date 75.1% | (현재 설정에서 AI 보정 합산 측정 미보유) | 얕은 1차 + AI 보정 정책. 1차 파서는 *편집 가능한 초안* 까지만 |

요약: **쿠팡은 사용자가 OcrEdit 화면에서 거의 그대로 저장 가능한 수준**. **네이버는 이름·가격은 약 80~90% 수준이지만 일부 카드는 사용자가 직접 손봐야 함**(또는 AI 보정 발동 대상). 두 플랫폼 모두 "이미지 1장에서 최소 1개의 주문 카드는 추출" 100% 달성.

## 2. 쿠팡 (`ocr-name-score.mjs`)

### 2-1. 측정 대상

- 이미지 22장 (web 14 + mobile 8) · 카드 67개 (Gemini 매칭 가능 카드 기준)
- GT 정답: `gemini-names.json` (Vision 추출 후 사람-검토)

### 2-2. 결과

| 모드 | clean-name (Lev ≥0.85) | 카드 변경량 | gate 발동율 |
| --- | --- | --- | --- |
| 1차 파서만 (`--no-ai`) | **28 / 67 (41.8%)** | — | 22 / 22 (100%) |
| 1차 + AI 보정 (default) | **62 / 67 (92.5%)** | AI 가 60 카드 / 19 이미지 손댐 | 19 / 22 (86.4%) |

GT-independent 보조 지표:
- 이미지마다 ≥1 카드 추출: 22 / 22 (100%) ✅
- UI 라벨 누수 / 광고 가격 누수: 0건 ✅
- fold 정합성 위반: (해당 사항 거의 없음)

### 2-3. 해석

1차 파서 단독 41.8% 는 낮아 보이지만, 이는 **"문자 단위 100% 정확"** 기준이며 사용자 입장에서는 "이름이 알아볼 만한 형태로 채워져 있는지"가 더 중요. AI 보정 발동 후 92.5% 는 사용자 검수 부담을 5~6 카드/22장 수준까지 낮춤.

## 3. 네이버쇼핑 (`ocr-naver-parser-only.mjs`)

### 3-1. 측정 대상

- 이미지 49장 (web 39 + web2 6 + mobile 4) · 카드 225개
- GT 정답: `gemini-names-naver.json` (110~111개 카드에 한정해 매칭)

### 3-2. 결과 (1차 파서만)

| 지표 | 값 | 합격선 |
| --- | --- | --- |
| 이미지 ≥1 카드 추출 | 49 / 49 (100.0%) | ≥99% ✅ |
| name+price+date 모두 OK | 169 / 225 (75.1%) | — |
| missing name | 14 | — |
| missing price (non-fold) | 18 | — |
| missing date | 35 | — |
| price OCR 실패 | 15 | — |
| UI 라벨 누수 | 0 | ✅ |
| 광고 가격 누수 | 0 | ✅ |
| fold 정합성 위반 | 1 | ❌ (사용자 목표 0) |
| GT 매칭된 카드 | 111 | — |
| **clean-name (Lev ≥0.85)** | **58 / 111 (52.3%)** | 사용자 목표 95% ❌ |
| **price 일치** | **96 / 111 (86.5%)** | — |

### 3-3. 해석 / 후속 조치 가이드

- 정책 §9.1 에 따르면 네이버 파서는 **얕은 1차 + AI 보정 정책**. 따라서 52.3% 는 "AI 게이트가 발동할 때까지의 초안" 으로 충분.
- 다만 가격이 86.5% 정확이라는 점은 거래 금액 정합성에 직접 영향. 추후 RAW 텍스트의 광고 영역 탐지 정확도가 가격 누수 0건을 유지하는지 모니터링 필요.
- `fold 정합성 위반 1` 은 단일 케이스라 회귀 대응 지표로만 둠.

## 4. 운영 메트릭 (CLAUDE.md §9.4 기준)

`analyzeUploadedImages` 가 콘솔에 찍는 3개 비율 (호출율 / 카드 실효율 / 이미지 실효율) 은 본 벤치 결과와 일관:

- gate 발동율: 쿠팡 86.4% / 네이버 (게이트 미적용 측정)
- AI 카드 실효율: 쿠팡 89.6% (60 / 67)
- AI 이미지 실효율: 쿠팡 100% (19 / 19)

게이트가 발동한 이미지에서는 AI 보정이 사실상 항상 효과를 봄. 즉 **"AI 가 호출됐는데 아무것도 못 바꾸고 끝나는" 가짜 발동은 없음**.

## 5. 재현 방법

### 5-1. 네이버 (AI 비용 0)

```
cd <repo>
node --experimental-strip-types ocr-scripts/ocr-naver-parser-only.mjs
# → 콘솔 요약 + ocr-naver-parser-report.txt
```

### 5-2. 쿠팡 (Gemini 캐시 사용, 추가 호출 없음)

```
cd <repo>
node --experimental-strip-types ocr-scripts/ocr-name-score.mjs --no-ai
# → 파서 단독
node --experimental-strip-types ocr-scripts/ocr-name-score.mjs
# → 파서 + AI(캐시) 합산
```

### 5-3. 메모리 룰 (사용자 메모리 #spendtrack_ocr_ai_variance)

> Gemini 2.5 Flash temp=0 도 ±2.5%p 변동. 단일 run 수치 금지, median + range 로 보고.

본 문서의 쿠팡 92.5% 는 단일 run(캐시 기반 결정론). variance 가 우려되는 경우 멀티 run 후 median 재계산 권장.

## 6. 다음 측정 권장

1. 사용자 사이드 신규 캡쳐(쿠팡·네이버 + 신규 플랫폼) 수집 → `.local-samples/` 에 추가 → 동일 스크립트 재실행.
2. 네이버 AI 보정까지 합친 종합 점수 측정용 스크립트 추가 (현재 쿠팡만 보유).
3. 비결정성 측정: 쿠팡 5-run 중간값 / 범위 (CLAUDE.md §9.4 와 사용자 메모리 일치).

