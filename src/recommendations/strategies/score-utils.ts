/** Every strategy score is an integer 0-100 (issue #6: "Scores must be finite and between 0 and 100"). */
export function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}
