/** Álgebra lineal densa mínima para interpolación de splines y el solver de restricciones. */

export type Matrix = number[][];

export function zeros(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
}

/** Resuelve A·x = b por eliminación gaussiana con pivoteo parcial. Devuelve null si es singular. */
export function solveLinear(A: Matrix, b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    let best = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const val = Math.abs(M[r][col]);
      if (val > best) {
        best = val;
        piv = r;
      }
    }
    if (best < 1e-14) return null;
    if (piv !== col) [M[piv], M[col]] = [M[col], M[piv]];
    const pivRow = M[col];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / pivRow[col];
      if (f === 0) continue;
      const row = M[r];
      for (let c = col; c <= n; c++) row[c] -= f * pivRow[c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

export function matMul(A: Matrix, B: Matrix): Matrix {
  const r = A.length;
  const c = B[0]?.length ?? 0;
  const k = B.length;
  const out = zeros(r, c);
  for (let i = 0; i < r; i++) {
    for (let t = 0; t < k; t++) {
      const a = A[i][t];
      if (a === 0) continue;
      const Bt = B[t];
      const oi = out[i];
      for (let j = 0; j < c; j++) oi[j] += a * Bt[j];
    }
  }
  return out;
}

export function transpose(A: Matrix): Matrix {
  const r = A.length;
  const c = A[0]?.length ?? 0;
  const out = zeros(c, r);
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) out[j][i] = A[i][j];
  return out;
}

export function matVec(A: Matrix, x: number[]): number[] {
  return A.map((row) => row.reduce((s, a, j) => s + a * x[j], 0));
}

export function norm(x: number[]): number {
  return Math.sqrt(x.reduce((s, a) => s + a * a, 0));
}
