/**
 * 역할: 이미지 File을 canvas로 리사이즈·압축해 JPEG data URL을 반환합니다.
 *       blob URL은 세션 종료/새로고침 시 무효화되므로, 거래내역에 영속할
 *       "OCR 원본 이미지 보기" URL을 만들 때 이 함수를 사용합니다.
 * 위치: src/utils/createThumbDataUrl.ts
 */

/**
 * File → 압축 JPEG data URL.
 * @param maxWidth  출력 최대 너비(px). 원본이 더 작으면 그대로 사용합니다.
 * @param quality   JPEG 품질 0..1.
 */
export function createThumbDataUrl(
  file: File,
  maxWidth = 400,
  quality = 0.6,
): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          // canvas를 지원하지 않는 환경에서는 빈 문자열로 폴백합니다.
          resolve("");
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve("");
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}
