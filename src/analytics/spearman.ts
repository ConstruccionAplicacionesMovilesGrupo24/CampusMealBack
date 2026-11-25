/**
 * Spearman rank correlation: Pearson correlation of the ranks, with tied values given the
 * average of the ranks they span. Returns null when either variable is constant (undefined).
 */
export function spearman(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 2) {
    return null;
  }
  return pearson(ranks(x), ranks(y));
}

export function isConstant(values: number[]): boolean {
  return values.every((value) => value === values[0]);
}

function ranks(values: number[]): number[] {
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length);
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (
      end + 1 < order.length &&
      order[end + 1].value === order[start].value
    ) {
      end++;
    }
    // Ranks are 1-based; a tie group shares the mean of its positions.
    const averageRank = (start + end) / 2 + 1;
    for (let i = start; i <= end; i++) {
      result[order[i].index] = averageRank;
    }
    start = end + 1;
  }
  return result;
}

function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  const meanX = x.reduce((sum, v) => sum + v, 0) / n;
  const meanY = y.reduce((sum, v) => sum + v, 0) / n;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  if (varianceX === 0 || varianceY === 0) {
    return null;
  }
  return covariance / Math.sqrt(varianceX * varianceY);
}
