export interface LpColumn {
  rows: number[];
  values: number[];
}

export interface LpProblem {
  rowCount: number;
  columns: LpColumn[];
  rhs: Float64Array;
  cost: Float64Array;
  initialBasis: Int32Array;
  upper?: Float64Array | null;
}

export type LpStatus = "optimal" | "unbounded" | "iterations";

interface SimplexState {
  rowCount: number;
  colCount: number;
  tableau: Float64Array;
  upper: Float64Array;
  beta: Float64Array;
  basis: Int32Array;
  basisRow: Int32Array;
  atUpper: Uint8Array;
  reducedCost: Float64Array;
  devexWeight: Float64Array;
  columns: LpColumn[];
  rhs: Float64Array;
  cost: Float64Array;
  initialBasis: Int32Array;
  iterations: number;
  flips: number;
}

export interface LpCertificate {
  primalResidual: number;
  boundViolation: number;
  maxReducedCost: number;
  dualObjective: number;
  gap: number;
}

export interface LpResult {
  status: LpStatus;
  x: Float64Array;
  duals: Float64Array;
  reducedCost: Float64Array;
  objective: number;
  iterations: number;
  state: SimplexState;
  certificate?: LpCertificate;
}

const PIVOT_TOL = 1e-7;
const RATIO_RELAX = 1e-9;
const PRICE_TOL = 1e-9;
const BLAND_AFTER_DEGENERATE = 50;

interface SolveOptions {
  maxIterations?: number;
  perturbation?: number;
  certify?: boolean;
}

export function solveLp(problem: LpProblem, { maxIterations = 1e5, perturbation = 1e-7, certify = false }: SolveOptions = {}): LpResult {
  const { rowCount: m, columns, rhs, cost, initialBasis, upper } = problem;
  const n = columns.length;
  const tableau = new Float64Array(m * n);
  for (let j = 0; j < n; j += 1) {
    const column = columns[j]!;
    for (let k = 0; k < column.rows.length; k += 1) tableau[column.rows[k]! * n + j]! += column.values[k]!;
  }
  const beta = new Float64Array(m);
  for (let r = 0; r < m; r += 1) beta[r] = rhs[r]! + perturbation * (1 + ((r * 7919) % 1000) * 0.001);
  const basis = Int32Array.from(initialBasis);
  const basisRow = new Int32Array(n).fill(-1);
  for (let r = 0; r < m; r += 1) basisRow[basis[r]!] = r;
  const reducedCost = Float64Array.from(cost);
  for (let r = 0; r < m; r += 1) {
    const basicCost = cost[basis[r]!]!;
    if (basicCost === 0) continue;
    for (let j = 0; j < n; j += 1) {
      const value = tableau[r * n + j]!;
      if (value !== 0) reducedCost[j]! -= basicCost * value;
    }
  }
  for (let r = 0; r < m; r += 1) reducedCost[basis[r]!] = 0;

  const state: SimplexState = {
    rowCount: m,
    colCount: n,
    tableau,
    upper: upper ? Float64Array.from(upper) : new Float64Array(n).fill(Infinity),
    beta,
    basis,
    basisRow,
    atUpper: new Uint8Array(n),
    reducedCost,
    devexWeight: new Float64Array(n).fill(1),
    columns: columns.slice(),
    rhs: Float64Array.from(rhs),
    cost: Float64Array.from(cost),
    initialBasis: Int32Array.from(initialBasis),
    iterations: 0,
    flips: 0,
  };
  return finish(state, iterate(state, maxIterations), certify);
}

export function extendLp(
  solved: SimplexState,
  extra: (LpColumn & { cost: number; upper?: number })[],
  { maxIterations = 1e5, certify = false }: Omit<SolveOptions, "perturbation"> = {},
): LpResult {
  const { rowCount: m, colCount: n0 } = solved;
  const n = n0 + extra.length;
  const tableau = new Float64Array(m * n);
  for (let r = 0; r < m; r += 1) tableau.set(solved.tableau.subarray(r * n0, (r + 1) * n0), r * n);
  extra.forEach((column, k) => {
    const j = n0 + k;
    for (let r = 0; r < m; r += 1) {
      let value = 0;
      for (let e = 0; e < column.rows.length; e += 1) value += solved.tableau[r * n0 + solved.initialBasis[column.rows[e]!]!]! * column.values[e]!;
      tableau[r * n + j] = value;
    }
  });
  const cost = new Float64Array(n);
  cost.set(solved.cost);
  extra.forEach((column, k) => (cost[n0 + k] = column.cost));
  const upper = new Float64Array(n);
  upper.set(solved.upper);
  extra.forEach((column, k) => (upper[n0 + k] = column.upper ?? Infinity));
  const duals = new Float64Array(m);
  for (let r = 0; r < m; r += 1) duals[r] = solved.cost[solved.initialBasis[r]!]! - solved.reducedCost[solved.initialBasis[r]!]!;
  const reducedCost = new Float64Array(n);
  reducedCost.set(solved.reducedCost);
  extra.forEach((column, k) => {
    let value = column.cost;
    for (let e = 0; e < column.rows.length; e += 1) value -= duals[column.rows[e]!]! * column.values[e]!;
    reducedCost[n0 + k] = value;
  });
  const basisRow = new Int32Array(n).fill(-1);
  basisRow.set(solved.basisRow);
  const atUpper = new Uint8Array(n);
  atUpper.set(solved.atUpper);
  const devexWeight = new Float64Array(n).fill(1);
  devexWeight.set(solved.devexWeight);

  const state: SimplexState = {
    rowCount: m,
    colCount: n,
    tableau,
    upper,
    beta: Float64Array.from(solved.beta),
    basis: Int32Array.from(solved.basis),
    basisRow,
    atUpper,
    reducedCost,
    devexWeight,
    columns: [...solved.columns, ...extra.map(({ rows, values }) => ({ rows, values }))],
    rhs: solved.rhs,
    cost,
    initialBasis: solved.initialBasis,
    iterations: 0,
    flips: 0,
  };
  return finish(state, iterate(state, maxIterations), certify);
}

function chooseEntering(state: SimplexState, bland: boolean): { column: number; direction: 1 | -1 } | null {
  const { colCount: n, basisRow, atUpper, reducedCost, devexWeight } = state;
  if (bland) {
    for (let j = 0; j < n; j += 1) {
      if (basisRow[j]! >= 0) continue;
      if (!atUpper[j] && reducedCost[j]! > PRICE_TOL) return { column: j, direction: 1 };
      if (atUpper[j] && reducedCost[j]! < -PRICE_TOL) return { column: j, direction: -1 };
    }
    return null;
  }
  let best = 0;
  let choice: { column: number; direction: 1 | -1 } | null = null;
  for (let j = 0; j < n; j += 1) {
    const d = reducedCost[j]!;
    if (d > PRICE_TOL) {
      if (!atUpper[j] && basisRow[j]! < 0) {
        const score = (d * d) / devexWeight[j]!;
        if (score > best) (best = score), (choice = { column: j, direction: 1 });
      }
    } else if (d < -PRICE_TOL && atUpper[j]) {
      const score = (d * d) / devexWeight[j]!;
      if (score > best) (best = score), (choice = { column: j, direction: -1 });
    }
  }
  return choice;
}

function iterate(state: SimplexState, maxIterations: number): LpStatus {
  const { rowCount: m, colCount: n, tableau, upper, beta, basis, basisRow, atUpper, reducedCost, devexWeight } = state;
  const pivotRowCols = new Int32Array(n);
  const touchedRows = new Int32Array(m);
  const touchedValues = new Float64Array(m);
  let degenerate = 0;

  for (let step = 0; ; step += 1) {
    if (step >= maxIterations) return "iterations";
    const entering = chooseEntering(state, degenerate > BLAND_AFTER_DEGENERATE);
    if (!entering) return "optimal";
    const { column: g, direction } = entering;

    let touched = 0;
    let relaxedStep = upper[g]!;
    for (let r = 0; r < m; r += 1) {
      const value = tableau[r * n + g]!;
      if (value === 0) continue;
      touchedRows[touched] = r;
      touchedValues[touched] = value;
      touched += 1;
      const rate = direction * value;
      if (rate > PIVOT_TOL) {
        const ratio = (beta[r]! + RATIO_RELAX) / rate;
        if (ratio < relaxedStep) relaxedStep = ratio;
      } else if (rate < -PIVOT_TOL) {
        const bound = upper[basis[r]!]!;
        if (bound !== Infinity) {
          const ratio = (bound - beta[r]! + RATIO_RELAX) / -rate;
          if (ratio < relaxedStep) relaxedStep = ratio;
        }
      }
    }

    let leavingRow = -1;
    let stepLength = upper[g]!;
    let largestPivot = 0;
    let leavesAtUpper = false;
    if (relaxedStep < upper[g]!) {
      for (let k = 0; k < touched; k += 1) {
        const r = touchedRows[k]!;
        const value = touchedValues[k]!;
        const rate = direction * value;
        if (rate > PIVOT_TOL) {
          const ratio = beta[r]! / rate;
          if (ratio <= relaxedStep && Math.abs(value) > largestPivot)
            (largestPivot = Math.abs(value)), (leavingRow = r), (stepLength = ratio), (leavesAtUpper = false);
        } else if (rate < -PIVOT_TOL) {
          const bound = upper[basis[r]!]!;
          if (bound === Infinity) continue;
          const ratio = (bound - beta[r]!) / -rate;
          if (ratio <= relaxedStep && Math.abs(value) > largestPivot)
            (largestPivot = Math.abs(value)), (leavingRow = r), (stepLength = ratio), (leavesAtUpper = true);
        }
      }
      if (leavingRow < 0) stepLength = relaxedStep;
    }
    if (stepLength === Infinity) return "unbounded";
    if (stepLength < 0) stepLength = 0;

    for (let k = 0; k < touched; k += 1) beta[touchedRows[k]!]! -= stepLength * direction * touchedValues[k]!;

    if (leavingRow < 0) {
      atUpper[g] = direction > 0 ? 1 : 0;
      state.flips += 1;
      degenerate = 0;
      continue;
    }

    state.iterations += 1;
    degenerate = stepLength < 1e-12 ? degenerate + 1 : 0;
    const enteringValue = (atUpper[g] ? upper[g]! : 0) + direction * stepLength;
    const leaving = basis[leavingRow]!;
    const pivotOffset = leavingRow * n;
    const pivot = tableau[pivotOffset + g]!;
    let pivotNonZeros = 0;
    for (let j = 0; j < n; j += 1) {
      const value = tableau[pivotOffset + j]!;
      if (value !== 0) {
        tableau[pivotOffset + j] = value / pivot;
        pivotRowCols[pivotNonZeros] = j;
        pivotNonZeros += 1;
      }
    }
    tableau[pivotOffset + g] = 1;
    for (let k = 0; k < touched; k += 1) {
      const r = touchedRows[k]!;
      if (r === leavingRow) continue;
      const factor = touchedValues[k]!;
      const offset = r * n;
      for (let e = 0; e < pivotNonZeros; e += 1) {
        const j = pivotRowCols[e]!;
        tableau[offset + j]! -= factor * tableau[pivotOffset + j]!;
      }
      tableau[offset + g] = 0;
    }

    const enteringCost = reducedCost[g]!;
    const enteringWeight = devexWeight[g]!;
    for (let e = 0; e < pivotNonZeros; e += 1) {
      const j = pivotRowCols[e]!;
      const value = tableau[pivotOffset + j]!;
      if (enteringCost !== 0) reducedCost[j]! -= enteringCost * value;
      if (basisRow[j]! < 0 && j !== g) {
        const weight = value * value * enteringWeight;
        if (weight > devexWeight[j]!) devexWeight[j] = weight;
      }
    }
    reducedCost[g] = 0;
    devexWeight[leaving] = Math.max(enteringWeight / (pivot * pivot), 1);
    basis[leavingRow] = g;
    basisRow[g] = leavingRow;
    basisRow[leaving] = -1;
    atUpper[g] = 0;
    atUpper[leaving] = leavesAtUpper ? 1 : 0;
    beta[leavingRow] = enteringValue;
  }
}

function finish(state: SimplexState, status: LpStatus, certify: boolean): LpResult {
  const { rowCount: m, colCount: n, tableau, upper, basis, basisRow, atUpper, reducedCost, columns, rhs, cost, initialBasis } = state;
  const x = new Float64Array(n);
  const residualRhs = Float64Array.from(rhs);
  for (let j = 0; j < n; j += 1) {
    if (basisRow[j]! >= 0 || !atUpper[j]) continue;
    x[j] = upper[j]!;
    const column = columns[j]!;
    for (let k = 0; k < column.rows.length; k += 1) residualRhs[column.rows[k]!]! -= column.values[k]! * upper[j]!;
  }
  for (let r = 0; r < m; r += 1) {
    const offset = r * n;
    let value = 0;
    for (let k = 0; k < m; k += 1) {
      const b = residualRhs[k]!;
      if (b !== 0) value += tableau[offset + initialBasis[k]!]! * b;
    }
    x[basis[r]!] = Math.abs(value) < 1e-9 ? 0 : value;
  }
  const duals = new Float64Array(m);
  for (let r = 0; r < m; r += 1) duals[r] = cost[initialBasis[r]!]! - reducedCost[initialBasis[r]!]!;
  let objective = 0;
  for (let j = 0; j < n; j += 1) objective += cost[j]! * x[j]!;

  const result: LpResult = { status, x, duals, reducedCost, objective, iterations: state.iterations, state };
  if (!certify) return result;

  const lhs = new Float64Array(m);
  for (let j = 0; j < n; j += 1) {
    const column = columns[j]!;
    for (let k = 0; k < column.rows.length; k += 1) lhs[column.rows[k]!]! += column.values[k]! * x[j]!;
  }
  let primalResidual = 0;
  for (let r = 0; r < m; r += 1) primalResidual = Math.max(primalResidual, Math.abs(lhs[r]! - rhs[r]!));
  let boundViolation = 0;
  for (let j = 0; j < n; j += 1) boundViolation = Math.max(boundViolation, -x[j]!, x[j]! - upper[j]!);
  const priced = (j: number) => {
    const column = columns[j]!;
    let value = cost[j]!;
    for (let k = 0; k < column.rows.length; k += 1) value -= duals[column.rows[k]!]! * column.values[k]!;
    return value;
  };
  let maxReducedCost = 0;
  for (let j = 0; j < n; j += 1) {
    const d = priced(j);
    const atLower = x[j]! < 1e-9;
    const atBound = x[j]! > upper[j]! - 1e-9;
    if (atLower && atBound) continue;
    maxReducedCost = Math.max(maxReducedCost, atLower ? d : atBound ? -d : Math.abs(d));
  }
  let dualObjective = 0;
  for (let r = 0; r < m; r += 1) dualObjective += duals[r]! * rhs[r]!;
  for (let j = 0; j < n; j += 1) {
    if (upper[j] === Infinity) continue;
    const d = priced(j);
    if (d > 0) dualObjective += upper[j]! * d;
  }
  result.certificate = { primalResidual, boundViolation, maxReducedCost, dualObjective, gap: Math.abs(dualObjective - objective) };
  return result;
}
