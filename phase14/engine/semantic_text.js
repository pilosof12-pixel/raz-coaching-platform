// Shared semantic token normalization.
// Display punctuation is presentation only; validators should reason over stable
// tokens so pull-up, pull up and pull–up have the same internal meaning.
export function normalizeSemanticText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[-–—]+/g, ' ')
    .replace(/[_/]+/g, ' ')
    .replace(/[^\p{L}\p{N}+.]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
