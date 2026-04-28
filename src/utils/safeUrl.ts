/**
 * 역할: 사용자 입력 URL 의 보안 검증.
 *       href 속성에 들어가는 모든 사용자 제공 URL 은 이 모듈을 통과해야 하며,
 *       `javascript:`, `data:` 같은 위험한 스킴이 `<a href>` 로 새지 않도록 막습니다.
 *
 * 위치: src/utils/safeUrl.ts
 *
 * 정책:
 *   - 화이트리스트 방식: `http:` / `https:` 만 안전한 것으로 인정합니다.
 *     `mailto:`, `tel:` 등은 이 앱이 사용하는 표면이 없으므로 일단 차단해 두고 필요 시 열기.
 *   - 상대 경로(`/foo`, `./bar`) 는 외부 리다이렉트가 아니라 같은 origin 의 라우트로
 *     해석되므로 안전한 것으로 봅니다. 단 `//evil.com/...` 처럼 protocol-relative 형식은
 *     외부 origin 으로 빠질 수 있어 차단합니다.
 *   - 파싱 실패한 URL 은 안전하지 않은 것으로 간주(보수적 폴백).
 */

/**
 * 사용자 입력 URL 이 `<a href>` 로 흘려도 안전한지 판정합니다.
 *
 * 안전 정의:
 *   - 빈/공백 문자열 → false (caller 가 부재 처리)
 *   - 절대 URL: http / https 스킴만 true
 *   - protocol-relative (`//host`) → false (외부 리다이렉트 위험)
 *   - 상대 경로 (`/path`, `./path`, `path`) → true
 *
 * 차단 예:
 *   - `javascript:alert(1)` → false
 *   - `data:text/html,<script>` → false
 *   - `vbscript:msgbox(1)` → false
 *   - 0x09/0x0A/0x0D 같은 컨트롤 문자가 스킴 앞에 끼인 우회 (`\tjavascript:`) → false
 */
export function isSafeHttpUrl(input: string | null | undefined): boolean {
  if (!input) return false;
  // 컨트롤 문자(NULL/TAB/LF/CR/DEL 등 0x00-0x1F, 0x7F) 제거 후 검사.
  // 브라우저는 href 파싱 시 스킴 앞의 일부 컨트롤 문자를 무시하므로, 우리 쪽에서도
  // 같은 정규화로 검사해야 `\tjavascript:` 같은 우회를 막을 수 있습니다.
  // eslint-disable-next-line no-control-regex
  const stripped = input.replace(/[\x00-\x1F\x7F]/g, "").trim();
  if (!stripped) return false;
  // protocol-relative 차단.
  if (stripped.startsWith("//")) return false;
  // 절대 경로 / 같은 origin 상대 경로는 안전.
  if (stripped.startsWith("/") || stripped.startsWith("./") || stripped.startsWith("../")) {
    return true;
  }
  // 스킴 검사. URL 생성자는 스킴 검증에 강건합니다.
  // 단, "example.com/foo" 처럼 스킴이 없는 경우 URL 생성자가 throw 하므로 그 전에 빠른 분기.
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(stripped);
  if (!schemeMatch) {
    // 스킴 없는 일반 토큰 — `<a href="example.com">` 은 같은 origin 의 상대 경로로
    // 해석되므로 안전. 다만 "javascript" 같은 단어가 우연히 스킴 모양으로 보일 수 있어
    // 위 schemeMatch 가 잡습니다.
    return true;
  }
  const scheme = schemeMatch[1].toLowerCase();
  return scheme === "http" || scheme === "https";
}

/**
 * 사용자 입력 URL 을 안전한 값으로 sanitize 합니다.
 * - 안전하면 trim 한 원본을 반환
 * - 위험하거나 비어 있으면 null 반환 (caller 가 폴백 결정)
 */
export function sanitizeHref(input: string | null | undefined): string | null {
  if (!isSafeHttpUrl(input)) return null;
  return input!.trim();
}
