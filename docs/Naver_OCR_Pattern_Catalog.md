# 네이버쇼핑 OCR 패턴 카탈로그

작성일: 2026-04-27
근거 자료:
- `.local-samples/naver/{web, web2, mobile}` 29장 (Claude Vision 직접 GT 추출)
- `.ocr-raw-cache/gemini-names-naver.json` (130 카드 ground-truth)
- `.ocr-raw-cache/naver-ground-truth-summary.md` (사람-가독 요약)
- 사용자 5년치 모바일 주문내역 panorama 캡쳐 1장 (구조 검증용)
- 비교군: 쿠팡 GT(`.ocr-raw-cache/ground-truth.json`, `gemini-names-web2.json`)

용도:
- 1차 파서(`parseNaverOrderText`) 의 정책·로직 결정 근거
- 향후 사용자/Codex 가 새 샘플을 보고 케이스 분류할 때 이 문서를 기준으로 사용
- 쿠팡과 무엇이 같고 무엇이 다른지 명확히 분리

---

## §1. 카드 = 한 결제 단위 (네이버 핵심 모델)

쿠팡과 다른 결정적 지점.

### 쿠팡 모델
- 화면 상단에 "YYYY. M. DD 주문" 헤더가 한 번 등장
- 헤더 아래로 같은 주문일자의 카드가 N개 깔림 — 카드들은 같은 결제(주문번호 1개) 의 분리배송 또는 같은 주문에 묶인 상품들
- 결과: **1 주문 = 1 헤더 + N 카드** ⇒ `buildCoupangOrders` 가 헤더로 그룹핑

### 네이버 모델
- 카드 자체가 결제 단위. 한 카드 = 한 결제(주문번호 1개)
- 모든 카드에 고유한 (날짜, 시각, 상태) 가 찍힘
- **1 주문 = 1 카드** ⇒ `buildFlatOrders` 가 카드 1개당 OcrOrder 1개 (예외는 fold + 추가상품, §6/§7)

이 차이가 있어 쿠팡 파서 헤더-그룹핑 로직을 네이버에 복제하면 안 됨.

---

## §2. 공통 카드 스키마 (web / web2 / mobile)

```
[image thumbnail]   [status badge]  [optional sub-badge]
                    [date]
                    [상품명 (truncated with ... in mobile/long)]
                    [price]   [Npay+ icon (option)]
                    [optional: "X원 적립 완료"]
                    [optional: "리뷰쓰고 최대 +N원" / "최대 N원" / "한달리뷰쓰기"]
[action buttons row: 다시 담기 / 다시 구매 / 장바구니 담기 / 바로 구매(하기) / 한달리뷰쓰기 / 배송조회 / 리뷰 쓰기 ...]
```

**고정 요소** (어느 캡쳐에든 1번씩 등장):
1. status badge — `§3` 라벨 11종 중 하나
2. date — `§4` 4가지 포맷 중 하나
3. 상품명 — 대부분 길고 자주 truncated
4. price — `\d{1,3}(,\d{3})*원` 패턴

**가변 요소** (캡쳐별로 있을 수도/없을 수도):
5. 적립금 라인 — "X,XXX원 적립 완료"
6. 리뷰 보상 라인 — "리뷰쓰고 최대 +N원" 또는 "최대 N원 한달리뷰쓰기"
7. 다시담기/다시구매/장바구니/바로구매 버튼 (대부분 있음)
8. Npay+ 아이콘 (가격 옆)
9. sub-badge — `N내일배송` / `N오늘배송` / `추가상품` (§7)
10. 판매자 정보 / 문의 / 배송조회 링크 (web/web2)

---

## §3. status 라벨 분포 (29장 GT 기준)

| 라벨 | 횟수 | 카테고리 (TxRow.status 매핑) |
|---|---|---|
| `구매확정완료` | ~70 | purchase |
| `결제완료` | ~20 | purchase |
| `결제취소` | ~5 | cancel |
| `취소완료` | ~10 | cancel |
| `환불완료` | 1 | refund |
| **`반품환불완료`** | 1 | refund (또는 cancel — 정책 결정 필요) |
| `배송완료` | 0 (29장 샘플엔 미관찰, 5년치 panorama 에서 가끔 보임) | purchase |
| `배송중` | 0 | purchase |
| `반품완료` | 0 | refund |
| `주문취소완료` | 0 | cancel |
| `주문완료` | 0 | purchase |
| `정기결제` | 0 (구독 카드) | sub |

### 중요 변형 (status 라인에 끼는 추가 메타)
- `취소완료 7.29.(화) 취소 (카드 취소 최대 3~5영업일 소요)` — web/184939 예시
- `결제취소 추가환급 이용료` — web/184545 예시
- 모바일에서는 status 옆에 `N내일배송` 등 sub-badge 가 같은 라인에 찍히는 경우 있음

### 1차 파서 정책 (현 구현)
`STATUS_KEYWORDS` 9종 fix: `구매확정완료, 결제완료, 결제취소, 취소완료, 환불완료, 반품완료, 배송완료, 배송중, 주문완료`. **`반품환불완료` 누락** → §10에 fix 항목.

### OCR 변형 (실측)
- `구매확정완료` → `, 구 확정완료`, `매화정오`, `구 매확정완료`, `발기 구매확정완료`
- `결제취소` → 비교적 안정 (2글자 묶음이라)
- `취소완료` → 안정

---

## §4. 날짜 포맷 분포

| 포맷 | 예시 | 출현 폴더 | regex |
|---|---|---|---|
| 풀(YYYY.M.D HH:MM) | `2025. 12. 31. 11:18 결제` | web 2025년 이전 카드, web2 일부 | `(20\d{2})[^\d]+(\d{1,2})[^\d]+(\d{1,2})` |
| 풀(YYYY.M.D 점공백 변형) | `2025.7.3. 19:04 주문` | web2 | 같음 |
| 단축(M.D HH:MM 결제) | `4. 7. 11:29 결제` | web 현재년 카드 | `(\d{1,2})\.\s*(\d{1,2})` + `결제` 키워드 |
| 단축(M.D 결제) | `1.20.20:20 결제` | mobile (압축 변형) | 같음 |

### 시간대 변형
- 네이버 모바일: 가끔 "오후" 단어 끼어들기 (예: `2025. 7. 28. 오후 11:02 주문`) — 현재 정규식이 흡수 가능 (`[^\d]+` 부분에 한글도 허용)

### 1차 파서 정책 (현 구현)
- 풀 포맷 우선 매칭 → 단축 포맷은 `결제` 또는 `주문` 키워드 동반 시에만 (false positive 방어)
- 단축 포맷일 때 연도 추정: 화면 월이 현재 월보다 크면 작년, 그 외 현재년

---

## §5. UI 라벨 (literal — 상품명으로 빨려들면 안 되는 라인)

### 항상 등장
- `상세 보기` / `상세보기` (web/web2)
- `장바구니 담기` (모든 폴더)
- `바로 구매하기` / `바로 구매` (모든 폴더)
- `다시 담기` / `다시 구매` / `다시 묶기` (모든 폴더)

### 자주 등장
- `한달리뷰쓰기` / `한달사용리뷰` / `리뷰 쓰기` (web2/mobile, 보상 광고)
- `최대 N원` (단독, 보상 안내. 한달리뷰 보상 카드)
- `판매자 정보` / `판매자/문의` (web/web2)
- `배송조회` (web/web2 일부)

### 가끔 등장
- `내일 배송` / `N내일배송` (mobile/web2 sub-badge)
- `오늘 배송` (드물게)
- `추가상품` (add-on 카드 sub-badge — 자체 카드 식별 신호이지 itemName 아님)
- `리뷰 OPEN` (광고 마커처럼 상품명 prefix 로 등장 — 예: "[리뷰 OPEN] 혼바디 롤러" 는 실제 상품명. UI 라벨로 잘못 잡으면 안 됨)

### 1차 파서 정책 (현 구현)
`UI_LABEL_REGEX` 13종 anchored `^...$` 매칭 — 단독 라인일 때만 UI 라벨로 인정. "[리뷰 OPEN] 혼바디 롤러" 같은 부분 매칭 false positive 방어 OK.

---

## §6. fold (접힘/펼침) 신호 카탈로그

네이버 fold 시스템은 같은 결제로 묶인 다중 상품을 화면에서 접거나 펼치는 UI. 1차 파서는 **fold 메타로만 표시** 하고 카드 그룹핑은 §15 Codex.

| literal | 의미 | 카드 출력 정책 |
|---|---|---|
| `대표상품 + 포함 총 N건 + 총 X원 + 주문 펼쳐보기` | 접힌 상태(folded) — 대표 상품만 보임 | folded=true, itemCountHint=N, sectionTotal=X. price=null (sectionTotal 강제 주입 X) |
| `총 N건 펼쳐보기` (단독, 가격/날짜만 위에) | 모바일 접힌 상태 (대표상품 없는 변형) | 같음 |
| `... + 총 N건 주문 접기` (마지막 줄) | 펼친 상태(expanded) — N개 카드 모두 보임 | folded=true, itemCountHint=N. 각 카드는 개별 출력. 같은 결제 그룹핑은 §15 Codex |
| `포함 총 N건` (인라인) | 접힌 상태 보조 신호 | itemCountHint=N |

### 5년치 panorama 에서 확인된 추가 fold 변형
- 매우 오래된 카드(2020~2022) 가 fold 묶음으로 표현되는 경우 — 모바일에서는 `총 N건 주문 펼쳐보기` 의 N 이 30~50까지 가는 경우 있음
- fold 묶음 안의 대표 상품명이 OCR 어려운 텍스트일 가능성 높음 (오래된 카드 = OCR 품질 저하)

### 1차 파서 정책 (현 구현)
- `FOLD_OPEN_CTA` (`주문 펼쳐보기`)
- `FOLD_TOTAL_OPEN_CTA` (`총 N건 펼쳐보기`)
- `FOLD_CLOSE_CTA` (`총 N건 주문 접기`)
- `FOLD_BARE_CLOSE` (`주문 접기`)
- `포함 총 N건` (인라인)
- N → itemCountHint, 가장 큰 값 채택
- `총 N원` → sectionTotal, 가장 큰 값 채택
- folded=true 면 product price=null (정직성)

---

## §7. 추가상품 (add-on) 패턴

### 정의
같은 결제번호로 같이 주문된 보조 상품. 화면에서는 `추가상품` 배지가 카드에 붙고, **자체 날짜 라인이 없음** (대신 위 메인 상품의 날짜를 공유).

### 관찰된 4 케이스
| 캡쳐 | 메인 상품 | add-on |
|---|---|---|
| web2/10.02.11 | SNS 복숭아 초콜릿 19,900원 (2025.7.28) | 드라이아이스 1,000원 |
| web2/10.03.13 | 미테르 마그네틱 독서대 59,800원 (2025.5.17) | 독서대 전용 사각 플레이트 2,900원 |
| mobile/09:46-06 | 프롬버드 갤럭시탭 27,900원 (2.14 11:56) | 블랙+그레이 4,500원 |
| mobile/09:45-32 (잠재) | (확인 필요) | (확인 필요) |

### 식별 신호
- 카드 상단에 `추가상품` 배지 (배경 회색 pill)
- 자체 날짜 부재
- price 는 자체 X,XXX원 표시
- name 은 보조 옵션 형태 (예: "블랙+그레이")

### 1차 파서 현 동작
- 자체 status 라벨이 없어 `STATUS_ANCHOR_REGEX` 매칭 X → 카드 시작점으로 인식 안 됨 → **GT에서는 카드 1로 카운트되지만 1차 파서는 0개로 본다.**
- 결과: 4 케이스 모두 1차 파서가 add-on 을 누락
- 정책: §15 Codex 의 section grouping 작업으로 해결 예정. 1차 파서가 강제로 잡으려 하면 다른 회귀 위험 큼

---

## §8. 광고 섹션 (관심 있을만한 상품)

### 식별 신호
- 헤더 라인: `관심 있을만한 상품` (또는 `관심 있는만한 상품` 변형) + `AD` 배지
- 안의 카드들:
  - product 썸네일 + 상품명 (truncated)
  - 가격: `30% 21,000원` 같은 할인 % 포함, 또는 그냥 `21,000원`
  - rating: `★ 4.8 2,618` (별점 + 리뷰 수)
  - `찜 N` 배지
  - `구매 N+` 배지 (예: `구매 710+`)
- 끝 신호: 다음 사용자 주문의 status 키워드 등장 (`구매확정완료` 등)

### 출현 위치
- mobile/09:45-32, 09:45-43, 09:46-06 등 모바일 캡쳐
- web/web2 에서는 거의 없음 (광고 섹션 자체가 모바일 UI 특화)

### 1차 파서 정책 (현 구현)
- `AD_START_REGEX = /관심\s*있(?:을|는)\s*만?한\s*상품/`
- 마커 만나면 `inAd=true`, 다음 status 키워드까지 라인 통째 컷
- 30%/구매 N+/별점 라인이 메인 가격으로 누수되는 회귀 방지

### 한계
- **마커 없는 1줄 promo** — web/185430 의 `갑작스런 사고에도 든든한 운전자보험 🚗` 같은 케이스. literal 마커 없어 컷 안 됨. 한글 ≥ 2 + 길이 ≥ 4 통과해서 itemName 후보로 빨려들 위험. **현재 파서 미커버, 측정 후 빈도 보고 결정.**

---

## §9. aux 라인 (메인 가격 후보 제외 대상)

### 적립금 안내
- `1,042원 적립 완료` (가격 라인 직후 같은 카드 안)
- `® 217 원 적립 완료` (OCR 변형 — `®` 가 N 아이콘 잔류)
- 신호: 라인에 `적립` 단어 포함

### 리뷰 보상 안내
- `리뷰쓰고 최대 +1,450원 다시 담기` (보상 + 액션 같은 라인)
- `리뷰 쓰기 최대 +N원`
- `한달리뷰쓰기` (단독)
- `한달사용리뷰` (단독)
- `최대 N원` (단독, 한달리뷰 보상)
- 신호: `리뷰쓰`/`한달(사용)리뷰`/`리뷰 (보상|혜택|적립)` 단어 매칭

### 광고 가격 (광고 섹션 컷이 실패했을 때 보호선)
- `30% 21,000원` (모바일 광고)
- `+1,450원` 단독 (보상)
- 신호: 라인이 `30%` 또는 `+숫자원` 으로 시작

### 액션 버튼
- `다시 담기` / `다시 구매` / `다시 묶기`
- `구매 하기`
- 신호: 명시적 literal

### 1차 파서 정책 (현 구현)
`isAuxiliaryAmountLine` regex 묶음. **컨텍스트 키워드 동반 시에만** 매칭 (예: `리뷰` 단독 매칭 X — `리뷰쓰` 같은 컴포지트만). "[리뷰 OPEN] 혼바디 롤러" false positive 방어 OK.

---

## §10. OCR-vulnerable 요소

실제 사용자 console 로그(184545.png)와 GT 비교로 확인된 OCR 변형:

| 원형 | OCR 변형 | 영향 |
|---|---|---|
| `원` | `¢` / `8` / `8원` | 가격 매칭 실패 → 카드 누락 |
| `구매확정완료` | `매화정오` / `구 확정완료` / `, 구 확정완료` / `발기 구매확정완료` | status anchor 미매칭 → 카드 시작점 누락 |
| `4. 7. 11:29 결제` | `4 7 11.29 결제` (점/콜론 변형) | 단축 날짜 매칭 실패 → date=null |
| 상품 썸네일 | 한글 1~2자 prefix garbage (`발기`, `ol`) | itemName prefix 오염 |
| Npay+ 아이콘 | `(D` / `pay)` 같은 잔류 | 다른 라인으로 분리되거나 가격 라인에 끼어들 수 있음 |
| N 아이콘 (적립금 옆) | `®` / `0` / 빈 공백 | 적립 라인에 prefix 가 끼지만 `적립` 키워드는 살아 있어 aux 매칭 OK |

### 정책
- 1차 파서에서 변형 wordlist 하드코딩하지 않음 (CLAUDE.md §9.1)
- 명백한 currency 변형(`¢` / `€` → `원`) 만 `recoverWonUnit` 에서 일반 정정
- 그 외 변형은 ocrQuality bad → AI fallback 의 책임 (현재 단계 우선순위 X)

---

## §11. 쿠팡 vs 네이버 — 무엇을 분리해야 하나

### 데이터 분리 (이미 됨)
| 자산 | 쿠팡 | 네이버 |
|---|---|---|
| 샘플 디렉터리 | `.local-samples/coupang/{web, web2, web3, web4, mobile}/` | `.local-samples/naver/{web, web2, mobile}/` |
| Tesseract 캐시 | `.ocr-raw-cache/{web, web2, mobile}/` | `.ocr-raw-cache/naver/` |
| Ground-truth | `.ocr-raw-cache/ground-truth.json` (orders/items 구조) | `.ocr-raw-cache/gemini-names-naver.json` (flat items) |
| Gemini 이름 GT | `.ocr-raw-cache/gemini-names-web2.json` | `.ocr-raw-cache/gemini-names-naver.json` |
| 측정 harness | `ocr-scripts/ocr-web2-check.mjs` | `ocr-scripts/ocr-naver-check.mjs` (별도) |

### 코드 분리
| 함수 | 쿠팡 | 네이버 |
|---|---|---|
| 파서 | `parseCoupangOrderText` (parser-heavy, regex 누적) | `parseNaverOrderText` (thin, status anchor 평면) |
| OcrOrder 빌더 | `buildCoupangOrders` (헤더-그룹핑) | `buildFlatOrders` (1 카드 = 1 OcrOrder) |
| status 감지 | `detectCoupangStatusFromOcrText` (반품완료 → cancel 매핑) | 글로벌 `detectStatusFromOcrText` |
| 후처리 | `dropStandaloneRibbonNoiseLines` (Coupang only, applyOcrCorrections platform-aware) | 일반 정정만 |
| Truncation | `detectTruncation` topCut Coupang 한정 | 네이버는 topCut 강제 false |

### 공유 코드 (platform-agnostic)
- `pickBadProducts` / `classifyOcrCardQuality` (`ocrQuality.ts`) — 룰 B0~B3w 모두 쿠팡 ground-truth 기반이지만 platform-agnostic 적용. **현재는 네이버 전용 룰 추가 안 함** (CLAUDE.md §9.1)
- `recoverWonUnit` (`ocrCorrection.ts`) — 한글/통화기호 변형 일반 정정
- `aiOcrFallback` / `aiService` — AI 보정 경로 공통 (Firebase proxy 통일)

---

## §12. 1차 파서 한계 (GT 대조 후 인지된 것)

| # | 한계 | 영향 카드 수 | 처리 방향 |
|---|---|---|---|
| 1 | `반품환불완료` status fix 누락 | 1 (web/184818) | **즉시 fix** — STATUS_KEYWORDS 에 추가 (literal 추가, §5 OK) |
| 2 | `추가상품` add-on 카드 누락 | 4+ (web2 x2, mobile x2+) | §15 Codex section grouping |
| 3 | mobile fold sectionTotal | ~3 (mobile/09:45-43) | 1차 책임 X, fold 메타로만 보존 |
| 4 | 1줄 promo 미커버 | 1+ (web/185430 운전자보험) | 측정 후 빈도 보고 결정 |
| 5 | status 메타 라인 끼어듦 | 1+ (web/184939 카드 취소 메타) | UI 라벨 블랙리스트로는 정형성 부족, 측정 후 결정 |
| 6 | OCR 변형 status (`매화정오` 등) | 가변 | 정책상 fix 안 함 (AI 영역) |

---

## §13. 측정 파이프라인 (parser-only, GT 활용)

### 현재 단계 (AI 게이트 우선순위 X, 파서 품질만 본다)
```
Tesseract 캐시 (이미 있음)
  → applyOcrCorrections(rawText, "naver")
  → parseNaverOrderText
  → output 카드 vs gemini-names-naver.json GT 비교
  → 메트릭 출력
```

### GT-independent 메트릭 (1차 합격 기준)
- 이미지마다 ≥1 카드: `imagesAtLeastOneCard / imagesTotal ≥ 99%` (29장 → 28/29 = 96.6% 이미 달성, 1장 fix 필요한 케이스가 web/184818 인지 측정 결과 보고 확인)
- UI 라벨 누수 0: 출력 itemName 이 `UI_LABEL_REGEX` 와 anchored 매칭되는 카드 수
- 광고 가격 누수 0: 출력 itemName 에 `구매 N+` / `★` / `찜` substring 또는 price 가 30% 할인 포맷
- fold 메타 정합성: folded=true 카드 중 itemCountHint < products.length 가 있으면 fail

### GT-dependent 메트릭 (2차)
- name clean-rate: 출력 카드를 GT 카드와 (price 일치 우선) 매칭 → 유사도 ≥ 0.85 비율
- price 정확도: GT price 와 일치 카드 비율
- card count 정확도: |GT 카드 수 − parser 카드 수| 합계 / 총 GT 카드 수

### 출력 형태 (제안)
- 콘솔 요약: 합격 기준 4가지 ✅/❌ + 위 메트릭
- `ocr-naver-parser-report.txt`: 카드 단위 dump (stem, idx, name, price, date, folded, GT 매칭 sim, 결측 종류) — grep 으로 dirty 케이스 추적 가능

---

## §14. 정책 변경 이력

- 2026-04-27 작성: 사용자 요청에 따라 29장 GT + 5년치 panorama 관찰을 패턴으로 정규화. 쿠팡과의 차이를 §1, §11 에서 명시적으로 분리.
- 향후 변경: §3 status 추가/§5 UI 라벨 추가/§7 add-on 그룹핑 등 발생 시 이 문서에 추가 + 변경 이력에 기록.

---

## §15. 다음 작업 우선순위

1. **즉시**: §12-1 (`반품환불완료` 추가). 1줄 fix.
2. **다음**: parser-only 측정 스크립트 작성 → §13 메트릭 출력. AI 의존 0.
3. **결과 보고**: §12-4, §12-5 의 실제 빈도 측정. 빈도 따라 추가 fix or 그대로 둘지 결정.
4. **이후 단계 (AI 게이트 작업으로 넘어가면)**: §11 의 `pickBadProducts` 가 네이버 카드를 얼마나 bad 로 분류하는지 측정 → 글로벌 임계값 조정 (네이버 한정 우회 X).
5. **Codex 후속 (§15 strategy doc)**: §12-2 add-on section grouping, §12-6 OCR 변형 AI 복구 프롬프트 보강.
