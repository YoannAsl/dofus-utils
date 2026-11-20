import { ancestorsOf, type BreedingGraph, type Operation, type Recipe, genetonValue } from "@/lib/mounts/breeding-graph";
import { augmentFlow, FlowGraph } from "@/lib/mounts/min-cost-flow";
import { extendLp, type LpColumn, type LpResult, solveLp } from "@/lib/mounts/simplex";

const FEMALE = 0;
const MALE = 1;
const ANY = 2;
type TrackedSex = typeof FEMALE | typeof MALE;

export interface HorizonConfig {
  sexedSteps: number;
  mergedSteps: number;
  delta: number;
  deltaTerm: number;
  termScale: number;
  rebalanceMargin: number;
  rebalance: boolean;
  fracBonus: number;
  sexTol: number;
  maxCells: number;
  hardMaxCells: number;
  terminal: "alp" | "value-iteration";
  alpFloor: number;
  alpDelta: number | null;
  genetonWeight: number;
  progressReward: number;
  progressDelta: number;
  progressScale: number;
  successBetas: number[];
}

export const DEFAULT_HORIZON_CONFIG: HorizonConfig = {
  sexedSteps: 2,
  mergedSteps: 4,
  delta: 0.85,
  deltaTerm: 0.5,
  termScale: 1,
  rebalanceMargin: 0.15,
  rebalance: true,
  fracBonus: 0.001,
  sexTol: 0.02,
  maxCells: 15e5,
  hardMaxCells: 3e6,
  terminal: "alp",
  alpFloor: 1,
  alpDelta: null,
  genetonWeight: 1e-4,
  progressReward: 1,
  progressDelta: 0.85,
  progressScale: 1,
  successBetas: [0.5, 1, 1.6, 2.6],
};

export type ObjectiveMode = "genetons" | "success";

export interface StepInput {
  graph: BreedingGraph;
  mode: ObjectiveMode;
  chance: number;
  captureBudget: number;
  counts: Record<string, number>;
  females: Record<string, number>;
  missing: Record<string, number>;
  avoidObtained: boolean;
}

function valueIteration(graph: BreedingGraph, p: number, delta: number) {
  const values = new Float64Array(graph.n);
  const stay = 1 - delta * (1 - p / 2);
  for (let sweep = 0; sweep < 500; sweep += 1) {
    let bestBase = 0;
    for (const base of graph.bases) bestBase = Math.max(bestBase, values[base]!);
    let change = 0;
    for (let node = 0; node < graph.n; node += 1) {
      if (graph.exits[node]) continue;
      let best = 0;
      const own = genetonValue(graph, node);
      for (const recipe of graph.usesOf[node]!) {
        const child = graph.recipes[recipe]!.child;
        const childValue = graph.exits[child] ? bestBase : values[child]!;
        const value = (p * own + delta * (p / 2) * childValue) / stay;
        if (value > best) best = value;
      }
      change = Math.max(change, Math.abs(best - values[node]!));
      values[node] = best;
    }
    if (change < 1e-9) break;
  }
  fillExitsWithBestBase(graph, values);
  return values;
}

function fillExitsWithBestBase(graph: BreedingGraph, values: Float64Array) {
  let bestBase = 0;
  for (const base of graph.bases) bestBase = Math.max(bestBase, values[base]!);
  graph.exits.forEach((exit, node) => {
    if (exit) values[node] = bestBase;
  });
}

function alpValues(
  graph: BreedingGraph,
  p: number,
  delta: number,
  weights: number[],
  options: { gScale: number; childReward: number[] } | null = null,
) {
  const gScale = options ? options.gScale : 1;
  const childReward = options ? options.childReward : null;
  const rowOfNode = new Int32Array(graph.n).fill(-1);
  const rhs: number[] = [];
  for (let node = 0; node < graph.n; node += 1) {
    if (graph.exits[node]) continue;
    rowOfNode[node] = rhs.length;
    rhs.push(Math.max(0, weights[node]!));
  }
  const columns: LpColumn[] = [];
  const cost: number[] = [];
  const stay = 1 - delta * (1 - p / 2);
  for (const op of graph.ops) {
    const reward =
      gScale * p * (genetonValue(graph, op.f) + genetonValue(graph, op.m)) + (childReward ? delta * p * childReward[op.child]! : 0);
    const targets = graph.exits[op.child] ? graph.bases : [op.child];
    for (const target of targets) {
      const coefficients = new Map<number, number>();
      const add = (node: number, value: number) => {
        const row = rowOfNode[node]!;
        if (row >= 0) coefficients.set(row, (coefficients.get(row) ?? 0) + value);
      };
      add(op.f, stay);
      add(op.m, stay);
      add(target, -delta * p);
      columns.push(sparseColumn(coefficients));
      cost.push(reward);
    }
  }
  const initialBasis = new Int32Array(rhs.length);
  for (let row = 0; row < rhs.length; row += 1) {
    initialBasis[row] = columns.length;
    columns.push({ rows: [row], values: [1] });
    cost.push(0);
  }
  const result = solveLp({
    rowCount: rhs.length,
    columns,
    rhs: Float64Array.from(rhs),
    cost: Float64Array.from(cost),
    initialBasis,
  });
  if (result.status !== "optimal") return null;
  const values = new Float64Array(graph.n);
  for (let node = 0; node < graph.n; node += 1) if (rowOfNode[node]! >= 0) values[node] = Math.max(0, result.duals[rowOfNode[node]!]!);
  fillExitsWithBestBase(graph, values);
  return values;
}

function progressValues(graph: BreedingGraph, p: number, delta: number, childReward: number[]) {
  const values = new Float64Array(graph.n);
  const stay = 1 - delta * (1 - p / 2);
  for (let sweep = 0; sweep < 300; sweep += 1) {
    let change = 0;
    for (let node = 0; node < graph.n; node += 1) {
      if (graph.exits[node]) continue;
      let best = 0;
      for (const recipe of graph.usesOf[node]!) {
        const child = graph.recipes[recipe]!.child;
        const value = (delta * (p / 2) * (childReward[child]! + (graph.exits[child] ? 0 : values[child]!))) / stay;
        if (value > best) best = value;
      }
      change = Math.max(change, Math.abs(best - values[node]!));
      values[node] = best;
    }
    if (change < 1e-10) break;
  }
  return values;
}

function expectedCappedPoisson(mean: number, cap: number) {
  let term = Math.exp(-mean);
  let cumulative = term;
  let expected = 0;
  for (let k = 1; k <= cap; k += 1) {
    expected += 1 - cumulative;
    term *= mean / k;
    cumulative += term;
  }
  return expected;
}

function sparseColumn(coefficients: Map<number, number>): LpColumn {
  const rows: number[] = [];
  const values: number[] = [];
  coefficients.forEach((value, row) => {
    if (value !== 0) rows.push(row), values.push(value);
  });
  return { rows, values };
}

type RowInfo = { kind: "stock"; i: number; s: number; t: number } | { kind: "budget"; t: number } | { kind: "link"; c: number; t: number };

type ColumnInfo =
  | { kind: "x"; op: Operation; t: number }
  | { kind: "z"; i: number; s: number; t: number }
  | { kind: "k"; b: number; s: number; t: number }
  | { kind: "slack" }
  | { kind: "u"; c: number; k: number; t: number };

interface ModelBuilder {
  rhs: number[];
  rowInfo: RowInfo[];
  initialBasis: number[];
  addColumn: (coefficients: Map<number, number>, cost: number, info: ColumnInfo, upper?: number) => number;
  xCols: { op: Operation; col: number }[][];
  H: number;
  delta: number;
  columns: LpColumn[];
}

interface ModelInput {
  p: number;
  counts: Record<string, number>;
  females: Record<string, number>;
  sexedSteps: number;
  mergedSteps: number;
  delta: number;
  terminalValue: ArrayLike<number>;
  budget: number;
  reward?: ((op: Operation) => number) | null;
  successHook?: ((builder: ModelBuilder) => void) | null;
  certify?: boolean;
}

export interface HorizonModel {
  res: LpResult;
  rowOf: Int32Array;
  rowKey: (node: number, sex: number, t: number) => number;
  xCols: { op: Operation; col: number }[][];
  capCols: { b: number; s: number; t: number; col: number }[];
  colInfo: ColumnInfo[];
  stock: [Float64Array, Float64Array];
  H: number;
  Hs: number;
  rowCount: number;
  colCount: number;
  uncertified?: boolean;
}

function buildModel(graph: BreedingGraph, input: ModelInput, sizeOnly: true): { rowCount: number; colCount: number };
function buildModel(graph: BreedingGraph, input: ModelInput, sizeOnly?: false): HorizonModel;
function buildModel(graph: BreedingGraph, input: ModelInput, sizeOnly = false): HorizonModel | { rowCount: number; colCount: number } {
  const { p, counts, females, sexedSteps: Hs, mergedSteps, delta, terminalValue: pi, budget, reward, successHook, certify = false } = input;
  const H = Hs + mergedSteps;
  const n = graph.n;
  const stock: [Float64Array, Float64Array] = [new Float64Array(n), new Float64Array(n)];
  for (let node = 0; node < n; node += 1) {
    if (graph.exits[node]) continue;
    const id = graph.ids[node]!;
    const total = Math.max(0, counts[id] || 0);
    const female = Math.min(total, Math.max(0, females[id] || 0));
    stock[FEMALE][node] = female;
    stock[MALE][node] = total - female;
  }
  const sexed = (t: number) => t < Hs;

  const available: [Uint8Array, Uint8Array][] = [];
  const opsAt: Operation[][] = [];
  const recipeOps = graph.recipes.map((recipe: Recipe, index): Operation => ({ f: recipe.a, m: recipe.b, child: recipe.child, recipe: index }));
  for (let t = 0; t < H; t += 1) {
    const step: [Uint8Array, Uint8Array] = [new Uint8Array(n), new Uint8Array(n)];
    if (t === 0) {
      for (let node = 0; node < n; node += 1) for (const sex of [FEMALE, MALE] as const) if (stock[sex][node]! > 0) step[sex][node] = 1;
    } else {
      const previous = available[t - 1]!;
      step[FEMALE].set(previous[FEMALE]);
      step[MALE].set(previous[MALE]);
      for (const op of opsAt[t - 1]!)
        for (const node of [op.child, op.f, op.m])
          if (!graph.exits[node]) {
            step[FEMALE][node] = 1;
            step[MALE][node] = 1;
          }
    }
    for (const base of graph.bases) {
      step[FEMALE][base] = 1;
      step[MALE][base] = 1;
    }
    if (!sexed(t))
      for (let node = 0; node < n; node += 1) {
        const any = step[FEMALE][node]! | step[MALE][node]!;
        step[FEMALE][node] = any;
        step[MALE][node] = any;
      }
    available.push(step);
    const candidates = sexed(t) ? graph.ops : recipeOps;
    opsAt.push(
      candidates.filter((op) => (step[FEMALE][op.f] && step[MALE][op.m]) || (!sexed(t) && step[FEMALE][op.m] && step[MALE][op.f])),
    );
  }

  const rowOf = new Int32Array(H * 3 * n).fill(-1);
  const rowKey = (node: number, sex: number, t: number) => (t * 3 + sex) * n + node;
  const rhs: number[] = [];
  const rowInfo: RowInfo[] = [];
  for (let t = 0; t < H; t += 1)
    if (sexed(t)) {
      for (const sex of [FEMALE, MALE] as const)
        for (let node = 0; node < n; node += 1)
          if (available[t]![sex][node]) {
            rowOf[rowKey(node, sex, t)] = rhs.length;
            rhs.push(stock[sex][node]!);
            rowInfo.push({ kind: "stock", i: node, s: sex, t });
          }
    } else {
      for (let node = 0; node < n; node += 1)
        if (available[t]![FEMALE][node]) {
          rowOf[rowKey(node, ANY, t)] = rhs.length;
          rhs.push(stock[FEMALE][node]! + stock[MALE][node]!);
          rowInfo.push({ kind: "stock", i: node, s: ANY, t });
        }
    }
  const budgetRow: number[] = [];
  for (let t = 0; t < H; t += 1) {
    budgetRow.push(rhs.length);
    rhs.push(budget);
    rowInfo.push({ kind: "budget", t });
  }

  const columns: LpColumn[] = [];
  const cost: number[] = [];
  const colInfo: ColumnInfo[] = [];
  const upper: number[] = [];
  const addColumn = (coefficients: Map<number, number>, columnCost: number, info: ColumnInfo, bound = Infinity) => {
    upper.push(bound);
    columns.push(sparseColumn(coefficients));
    cost.push(columnCost);
    colInfo.push(info);
    return columns.length - 1;
  };
  const add = (coefficients: Map<number, number>, row: number, value: number) => {
    if (row >= 0 && value !== 0) coefficients.set(row, (coefficients.get(row) ?? 0) + value);
  };
  const addFrom = (coefficients: Map<number, number>, node: number, sex: TrackedSex, from: number, value: number) => {
    for (let t = from; t < H; t += 1) add(coefficients, rowOf[rowKey(node, sexed(t) ? sex : ANY, t)]!, value);
  };
  const discount = (t: number) => delta ** t;
  const operationReward = reward ?? ((op: Operation) => p * (genetonValue(graph, op.f) + genetonValue(graph, op.m)));

  const xCols: { op: Operation; col: number }[][] = [];
  for (let t = 0; t < H; t += 1) {
    xCols.push([]);
    for (const op of opsAt[t]!) {
      const coefficients = new Map<number, number>();
      addFrom(coefficients, op.f, FEMALE, t, 1);
      addFrom(coefficients, op.m, MALE, t, 1);
      const outputs: [number, number][] = [];
      if (!graph.exits[op.child]) outputs.push([op.child, p]);
      outputs.push([op.f, 1 - p / 2], [op.m, 1 - p / 2]);
      for (const [node, amount] of outputs) {
        addFrom(coefficients, node, FEMALE, t + 1, -amount / 2);
        addFrom(coefficients, node, MALE, t + 1, -amount / 2);
      }
      if (graph.exits[op.child]) add(coefficients, budgetRow[t]!, -p);
      let columnCost = discount(t) * operationReward(op);
      if (t === H - 1) for (const [node, amount] of outputs) columnCost += discount(H) * amount * pi[node]!;
      xCols[t]!.push({ op, col: addColumn(coefficients, columnCost, { kind: "x", op, t }) });
    }
  }

  const initialBasis: number[] = [];
  rowInfo.forEach((info, row) => {
    if (info.kind !== "stock") return;
    const leftover = info.t === H - 1 ? discount(H) * pi[info.i]! : 0;
    initialBasis[row] = addColumn(new Map([[row, 1]]), leftover, { kind: "z", i: info.i, s: info.s, t: info.t });
  });

  const capCols: HorizonModel["capCols"] = [];
  for (let t = 0; t < H; t += 1)
    for (const base of graph.bases)
      for (const sex of sexed(t) ? ([FEMALE, MALE] as const) : ([FEMALE] as const)) {
        const coefficients = new Map<number, number>();
        addFrom(coefficients, base, sex, t + 1, -1);
        add(coefficients, budgetRow[t]!, 1);
        const columnCost = t === H - 1 ? discount(H) * pi[base]! : 0;
        capCols.push({ b: base, s: sex, t, col: addColumn(coefficients, columnCost, { kind: "k", b: base, s: sex, t }) });
      }
  for (const row of budgetRow) initialBasis[row] = addColumn(new Map([[row, 1]]), 0, { kind: "slack" });

  successHook?.({ rhs, rowInfo, initialBasis, addColumn, xCols, H, delta, columns });

  if (sizeOnly) return { rowCount: rhs.length, colCount: columns.length };
  const res = solveLp(
    {
      rowCount: rhs.length,
      columns,
      rhs: Float64Array.from(rhs),
      cost: Float64Array.from(cost),
      initialBasis: Int32Array.from(initialBasis),
      upper: Float64Array.from(upper),
    },
    { certify },
  );
  return { res, rowOf, rowKey, xCols, capCols, colInfo, stock, H, Hs, rowCount: rhs.length, colCount: columns.length };
}

function isCertified(model: HorizonModel) {
  const { certificate } = model.res;
  if (model.res.status !== "optimal" || !certificate) return false;
  const scale = 1 + Math.abs(model.res.objective);
  return (
    certificate.primalResidual < 1e-6 &&
    certificate.boundViolation < 1e-6 &&
    certificate.gap < 1e-6 * scale &&
    certificate.maxReducedCost < 1e-5 * scale
  );
}

function stockDual(model: HorizonModel, node: number, sex: TrackedSex, from = 0) {
  let value = 0;
  for (let t = from; t < model.H; t += 1) {
    const row = model.rowOf[model.rowKey(node, t < model.Hs ? sex : ANY, t)]!;
    if (row >= 0) value += model.res.duals[row]!;
  }
  return value;
}

function missingVector(graph: BreedingGraph, missing: Record<string, number>) {
  const vector = new Float64Array(graph.n);
  Object.entries(missing).forEach(([id, count]) => {
    const node = graph.pos.get(id);
    if (node !== undefined && graph.gen[node]! >= 2) vector[node] = count;
  });
  return vector;
}

function successObjective(input: StepInput, config: HorizonConfig) {
  const { graph, chance: p } = input;
  const missing = missingVector(graph, input.missing);
  const weight = config.genetonWeight;
  const reward = (op: Operation) => weight * p * (genetonValue(graph, op.f) + genetonValue(graph, op.m));
  const perpetuity = 1 / (1 - config.delta);
  const childReward = Array.from(missing, (count) => (count > 0 ? perpetuity * config.progressReward : 0));

  let terminalValue: number[] | null = null;
  const weights = graph.ids.map((id) => (input.counts[id] || 0) + config.alpFloor);
  const alp = alpValues(graph, p, config.progressDelta ?? config.delta, weights, {
    gScale: weight * config.termScale,
    childReward: childReward.map((value) => value * config.progressScale),
  });
  if (alp) terminalValue = Array.from(alp);
  if (!terminalValue) {
    const progress = progressValues(graph, p, config.progressDelta ?? config.deltaTerm, childReward);
    const values = valueIteration(graph, p, config.deltaTerm);
    terminalValue = Array.from(values, (value, node) => weight * value * config.termScale + config.progressScale * progress[node]!);
  }

  const successHook = ({ rhs, rowInfo, initialBasis, addColumn, xCols, H, delta, columns }: ModelBuilder) => {
    const firstStep = new Map<number, number>();
    for (let t = 0; t < H; t += 1)
      for (const { op } of xCols[t] ?? []) if (missing[op.child]! > 0 && !firstStep.has(op.child)) firstStep.set(op.child, t);
    firstStep.forEach((start, child) => {
      const wanted = missing[child]!;
      const breakpoints = [0, ...config.successBetas.map((beta) => beta * wanted)];
      const expected = breakpoints.map((mean) => expectedCappedPoisson(mean, wanted));
      for (let t = start; t < H; t += 1) {
        const row = rhs.length;
        rhs.push(0);
        rowInfo.push({ kind: "link", c: child, t });
        for (let step = start; step <= t; step += 1)
          for (const { op, col } of xCols[step] ?? [])
            if (op.child === child) {
              columns[col]!.rows.push(row);
              columns[col]!.values.push(-p);
            }
        initialBasis[row] = addColumn(new Map([[row, 1]]), 0, { kind: "slack" });
        const weightAt = t === H - 1 ? delta ** t / (1 - delta) : delta ** t;
        for (let piece = 1; piece < breakpoints.length; piece += 1) {
          const width = breakpoints[piece]! - breakpoints[piece - 1]!;
          const slope = (expected[piece]! - expected[piece - 1]!) / width;
          if (slope > 1e-6) addColumn(new Map([[row, 1]]), weightAt * slope, { kind: "u", c: child, k: piece, t }, width);
        }
      }
    });
  };
  return { reward, terminalValue, successHook };
}

interface ScoredOperation {
  f: number;
  m: number;
  child: number;
  x: number;
  gain: number;
  bonus: number;
}

function roundAttempts(ops: ScoredOperation[], femaleCap: Float64Array, maleCap: Float64Array, n: number, tolerance = 1e-7) {
  const femalesLeft = Float64Array.from(femaleCap);
  const malesLeft = Float64Array.from(maleCap);
  const attempts = ops.map((op) => {
    const whole = Math.max(
      0,
      Math.min(Math.floor(op.x + 1e-6), Math.floor(femalesLeft[op.f]! + 1e-9), Math.floor(malesLeft[op.m]! + 1e-9)),
    );
    femalesLeft[op.f]! -= whole;
    malesLeft[op.m]! -= whole;
    return whole;
  });
  const source = 0;
  const sink = 2 * n + 1;
  const flow = new FlowGraph(2 * n + 2);
  for (let node = 0; node < n; node += 1) {
    const female = Math.floor(femalesLeft[node]! + 1e-9);
    const male = Math.floor(malesLeft[node]! + 1e-9);
    if (female > 0) flow.addEdge(source, 1 + node, female, 0);
    if (male > 0) flow.addEdge(1 + n + node, sink, male, 0);
  }
  const edges: [edge: number, op: number][] = [];
  ops.forEach((op, index) => {
    const score = op.gain + op.bonus;
    if (score < -tolerance || femalesLeft[op.f]! < 1 - 1e-9 || malesLeft[op.m]! < 1 - 1e-9) return;
    edges.push([flow.addEdge(1 + op.f, 1 + n + op.m, 1e9, -score), index]);
  });
  augmentFlow(flow, source, sink, { acceptPath: (cost) => cost <= tolerance, maxRounds: 1e5, relaxTolerance: 1e-9, throwOnNegativeCycle: false });
  for (const [edge, index] of edges) attempts[index]! += flow.flowOn(edge);
  return attempts;
}

export interface Reproduction {
  femaleId: string;
  maleId: string;
  childId: string;
  attempts: number;
}

interface Decision {
  model: HorizonModel;
  unit: string;
  reproductions: Reproduction[];
  capValue: number;
}

function decide(input: StepInput, config: HorizonConfig): Decision {
  const { graph, counts, females, chance: p, captureBudget } = input;
  const success = input.mode === "success" ? successObjective(input, config) : null;

  let terminalValue: ArrayLike<number> | null = null;
  if (success) terminalValue = success.terminalValue;
  else {
    if (config.terminal === "alp") {
      const weights = graph.ids.map((id) => (counts[id] || 0) + config.alpFloor);
      const alp = alpValues(graph, p, config.alpDelta ?? config.delta, weights);
      if (alp) terminalValue = Array.from(alp, (value) => value * config.termScale);
    }
    terminalValue ??= Array.from(valueIteration(graph, p, config.deltaTerm), (value) => value * config.termScale);
  }

  const base: ModelInput = {
    p,
    counts,
    females,
    sexedSteps: config.sexedSteps,
    mergedSteps: config.mergedSteps,
    delta: config.delta,
    terminalValue,
    budget: captureBudget,
    reward: success?.reward ?? null,
    successHook: success?.successHook ?? null,
  };

  let merged = config.mergedSteps;
  let sexedSteps = config.sexedSteps;
  for (;;) {
    const size = buildModel(graph, { ...base, sexedSteps, mergedSteps: merged }, true);
    const cells = size.rowCount * size.colCount;
    if (cells <= config.maxCells) break;
    if (merged > 1) merged -= 1;
    else if (cells <= config.hardMaxCells) break;
    else if (merged > 0) merged -= 1;
    else if (sexedSteps > 1) sexedSteps -= 1;
    else break;
  }
  base.sexedSteps = sexedSteps;

  let model: HorizonModel | null = null;
  for (const mergedSteps of [merged, Math.max(0, merged - 2), 0]) {
    model = buildModel(graph, { ...base, mergedSteps, certify: true });
    if (isCertified(model)) break;
    model.uncertified = true;
  }
  if (!model || model.res.status !== "optimal") throw new Error(`PL : ${model?.res.status}`);

  const { x, reducedCost } = model.res;
  const slackCol = new Map<string, number>();
  model.colInfo.forEach((info, col) => {
    if (info.kind === "z" && info.t === 0) slackCol.set(`${info.i}|${info.s}`, col);
  });
  const scored: ScoredOperation[] = model.xCols[0]!.map(({ op, col }) => {
    const femaleSlack = slackCol.get(`${op.f}|${FEMALE}`);
    const maleSlack = slackCol.get(`${op.m}|${MALE}`);
    const gain =
      reducedCost[col]! - (femaleSlack !== undefined ? reducedCost[femaleSlack]! : 0) - (maleSlack !== undefined ? reducedCost[maleSlack]! : 0);
    const fraction = x[col]! - Math.floor(x[col]! + 1e-6);
    return { f: op.f, m: op.m, child: op.child, x: x[col]!, gain, bonus: fraction > 1e-6 ? config.fracBonus * fraction : 0 };
  });

  if (input.mode === "success" && input.avoidObtained) {
    const useful = ancestorsOf(graph, missingVector(graph, input.missing));
    for (const op of scored)
      if (!useful[op.child]) {
        op.x = 0;
        op.gain = -1;
        op.bonus = 0;
      }
  }

  const attempts = roundAttempts(scored, model.stock[FEMALE], model.stock[MALE], graph.n);
  const reproductions: Reproduction[] = [];
  scored.forEach((op, index) => {
    if (attempts[index]! > 0)
      reproductions.push({ femaleId: graph.ids[op.f]!, maleId: graph.ids[op.m]!, childId: graph.ids[op.child]!, attempts: attempts[index]! });
  });
  return { model, unit: input.mode === "success" ? "cibles·étapes" : "génétons", reproductions, capValue: 0 };
}

export interface RebalanceLine {
  nodeId: string;
  females: number;
  males: number;
  why: string;
}

const sexSymbol = (sex: number) => (sex === FEMALE ? "♀" : "♂");
const sexWord = (sex: number, count = 2) => (sex === FEMALE ? (count > 1 ? "femelles" : "femelle") : count > 1 ? "mâles" : "mâle");
const round1 = (value: number) => Math.round(value * 10) / 10;

function partnersIn(model: HorizonModel, node: number, t: number, sex: number | null = null) {
  const partners: { partner: number; child: number; v: number }[] = [];
  for (const { op, col } of model.xCols[t] ?? []) {
    const value = model.res.x[col]!;
    if (value < 1e-6) continue;
    if (op.f === node && (sex === null || sex === FEMALE)) partners.push({ partner: op.m, child: op.child, v: value });
    if (op.m === node && (sex === null || sex === MALE)) partners.push({ partner: op.f, child: op.child, v: value });
  }
  return partners.sort((a, b) => b.v - a.v);
}

interface G1Line {
  g1: number;
  females: number;
  males: number;
  why: string;
}

function purchaseRebalance(input: StepInput, config: HorizonConfig, decision: Decision): G1Line[] {
  const { graph } = input;
  const { model } = decision;
  let capValue = 0;
  for (const base of graph.bases) capValue = Math.max(capValue, stockDual(model, base, FEMALE, 1), stockDual(model, base, MALE, 1));
  decision.capValue = capValue;
  const price = (capValue / config.delta) * (1 + config.rebalanceMargin) + 1e-6;
  const stockSize = Object.values(input.counts).reduce((sum, count) => sum + count, 0);
  const upper = Math.max(10, stockSize);

  const extra: (LpColumn & { cost: number; upper: number })[] = [];
  const purchaseCols: { b: number; s: TrackedSex; col: number }[] = [];
  for (const base of graph.bases)
    for (const sex of [FEMALE, MALE] as const) {
      const rows: number[] = [];
      const values: number[] = [];
      for (let t = 0; t < model.H; t += 1) {
        const row = model.rowOf[model.rowKey(base, t < model.Hs ? sex : ANY, t)]!;
        if (row >= 0) rows.push(row), values.push(-1);
      }
      purchaseCols.push({ b: base, s: sex, col: model.colCount + extra.length });
      extra.push({ rows, values, cost: -price, upper });
    }
  const extended: HorizonModel = { ...model, res: extendLp(model.res.state, extra) };
  if (extended.res.status !== "optimal") return [];

  const bought = new Map<string, number>();
  for (const { b, s, col } of purchaseCols) {
    const value = extended.res.x[col]!;
    if (value > 0.5) bought.set(`${b}|${s}`, value);
  }
  if (!bought.size)
    return graph.bases.map((base) => ({
      g1: base,
      females: 0,
      males: 0,
      why: "étable équilibrée : aucune G1 ne vaut plus qu'une capture ordinaire",
    }));

  const usage = (solution: HorizonModel) => {
    const used = new Map<string, number>();
    for (const { op, col } of solution.xCols[0]!) {
      const value = solution.res.x[col]!;
      if (value < 1e-9) continue;
      used.set(`${op.f}|${FEMALE}`, (used.get(`${op.f}|${FEMALE}`) ?? 0) + value);
      used.set(`${op.m}|${MALE}`, (used.get(`${op.m}|${MALE}`) ?? 0) + value);
    }
    return used;
  };
  const births = (solution: HorizonModel) => {
    const born = new Float64Array(graph.n);
    for (let t = 0; t < solution.H; t += 1)
      for (const { op, col } of solution.xCols[t] ?? []) born[op.child]! += input.chance * solution.res.x[col]!;
    return born;
  };
  const usedBefore = usage(model);
  const usedAfter = usage(extended);
  const bornBefore = births(model);
  const bornAfter = births(extended);

  return graph.bases.map((base) => {
    const females = Math.round(bought.get(`${base}|${FEMALE}`) ?? 0);
    const males = Math.round(bought.get(`${base}|${MALE}`) ?? 0);
    if (females + males === 0) return { g1: base, females: 0, males: 0, why: "rien à ajouter" };
    const reasons: string[] = [];
    for (const sex of [FEMALE, MALE] as const) {
      if (!(sex === FEMALE ? females : males)) continue;
      const other = 1 - sex;
      const unlocked = partnersIn(extended, base, 0, sex)
        .map((entry) => ({
          ...entry,
          gain: (usedAfter.get(`${entry.partner}|${other}`) ?? 0) - (usedBefore.get(`${entry.partner}|${other}`) ?? 0),
        }))
        .filter((entry) => entry.gain > 0.5 && !bought.has(`${entry.partner}|${other}`))
        .sort((a, b) => b.gain - a.gain);
      const best = unlocked[0];
      if (best)
        reasons.push(
          `débloque ${Math.round(best.gain)} ${graph.name[best.partner]} ${sexSymbol(other)} sans ${sexWord(sex, 1)} disponible (pour faire ${graph.name[best.child]})`,
        );
    }
    if (!reasons.length) {
      let bestNode = -1;
      let bestScore = 0;
      for (let node = 0; node < graph.n; node += 1) {
        if (graph.gen[node]! < 2) continue;
        const score = (bornAfter[node]! - bornBefore[node]!) * graph.gen[node]!;
        if (score > bestScore) (bestScore = score), (bestNode = node);
      }
      if (bestNode >= 0)
        reasons.push(`fait naître ${round1(bornAfter[bestNode]! - bornBefore[bestNode]!)} ${graph.name[bestNode]} de plus sur l'horizon du plan`);
    }
    const valueNow = Math.max(stockDual(model, base, FEMALE, 0), stockDual(model, base, MALE, 0));
    reasons.push(
      `valeur d'une ${graph.name[base]} de plus maintenant : ${round1(valueNow)} ${decision.unit}, contre ${round1(capValue)} pour une capture ordinaire (seuil d'achat ${round1((capValue / config.delta) * (1 + config.rebalanceMargin))})`,
    );
    return { g1: base, females, males, why: reasons.join(" ; ") };
  });
}

interface Served {
  partner: number;
  child: number;
  k: number;
}

interface Diagnosis {
  add: { b: number; s: number; k: number; partners: Served[]; viaGate: { y: number; k: number; kG1: number }[] }[];
  gates: { y: number; k: number; recipe: Recipe; n: number; partners: Served[] }[];
  unlocked: number;
  unlockedDirect: number;
  idleBefore: number;
  idleAfter: { i: number; s: number; k: number; needs: number[] }[];
}

function g1Gates(graph: BreedingGraph) {
  const gates = new Map<number, Recipe>();
  for (const recipe of graph.recipes)
    if (
      graph.gen[recipe.a] === 1 &&
      graph.gen[recipe.b] === 1 &&
      !graph.exits[recipe.child] &&
      graph.gen[recipe.child]! >= 2 &&
      !gates.has(recipe.child)
    )
      gates.set(recipe.child, recipe);
  return gates;
}

function diagnose(graph: BreedingGraph, stock: [Float64Array, Float64Array], mode: ObjectiveMode, missing: Float64Array, p: number, craftSteps = 2): Diagnosis {
  const n = graph.n;
  const useful = mode === "success" ? ancestorsOf(graph, missing) : null;
  const ops = graph.ops.filter((op) => !((useful && !useful[op.child]) || graph.exits[op.f] || graph.exits[op.m]));
  const gates = g1Gates(graph);
  const sources = [...graph.bases, ...gates.keys()];
  const femaleSource = (index: number) => 2 * n + index;
  const maleSource = (index: number) => 2 * n + sources.length + index;
  const nodeCount = 2 * n + 2 * sources.length + 2;
  const source = nodeCount - 2;
  const sink = nodeCount - 1;
  const byFemale = graph.ids.map((): Operation[] => []);
  const byMale = graph.ids.map((): Operation[] => []);
  ops.forEach((op) => {
    byFemale[op.f]!.push(op);
    byMale[op.m]!.push(op);
  });

  type Tag =
    | { kind: "supply" }
    | { kind: "extra"; i: number; s: number }
    | { kind: "xarc"; op: Operation; i: number; s: number; partner: number }
    | { kind: "arc"; op: Operation };

  const match = (level: number) => {
    const flow = new FlowGraph(nodeCount);
    const tagged: [edge: number, tag: Tag][] = [];
    const edge = (from: number, to: number, capacity: number, cost: number, tag: Tag) =>
      tagged.push([flow.addEdge(from, to, capacity, cost), tag]);
    for (let node = 0; node < n; node += 1) {
      const reward = -(1000 + graph.gen[node]!);
      if (stock[FEMALE][node]! > 0) edge(source, node, stock[FEMALE][node]!, reward, { kind: "supply" });
      if (stock[MALE][node]! > 0) edge(n + node, sink, stock[MALE][node]!, reward, { kind: "supply" });
    }
    sources.forEach((node, index) => {
      const isBase = index < graph.bases.length;
      if (level < 1 || (!isBase && level < 2)) return;
      const price = isBase ? 1 : 20;
      edge(source, femaleSource(index), 1e6, price, { kind: "extra", i: node, s: FEMALE });
      edge(maleSource(index), sink, 1e6, price, { kind: "extra", i: node, s: MALE });
      byFemale[node]!.forEach((op) => edge(femaleSource(index), n + op.m, 1e6, 0, { kind: "xarc", op, i: node, s: FEMALE, partner: op.m }));
      byMale[node]!.forEach((op) => edge(op.f, maleSource(index), 1e6, 0, { kind: "xarc", op, i: node, s: MALE, partner: op.f }));
    });
    ops.forEach((op) => edge(op.f, n + op.m, 1e6, 0, { kind: "arc", op }));
    augmentFlow(flow, source, sink, { acceptPath: (cost) => cost < 0, maxRounds: 2e4, relaxTolerance: 0, throwOnNegativeCycle: true });

    const employed: [Float64Array, Float64Array] = [new Float64Array(n), new Float64Array(n)];
    const extra: [Float64Array, Float64Array] = [new Float64Array(n), new Float64Array(n)];
    const served = new Map<string, Served[]>();
    for (const [edgeIndex, tag] of tagged) {
      const amount = flow.flowOn(edgeIndex);
      if (!(amount > 0)) continue;
      if (tag.kind === "arc") {
        employed[FEMALE][tag.op.f]! += amount;
        employed[MALE][tag.op.m]! += amount;
      }
      if (tag.kind === "xarc") {
        employed[1 - tag.s]![tag.partner]! += amount;
        const key = `${tag.i}|${tag.s}`;
        if (!served.has(key)) served.set(key, []);
        served.get(key)!.push({ partner: tag.partner, child: tag.op.child, k: amount });
      }
      if (tag.kind === "extra") extra[tag.s]![tag.i]! += amount;
    }
    served.forEach((list) => list.sort((a, b) => b.k - a.k));
    return { employed, extra, served };
  };

  const alone = match(0);
  const withG1 = match(1);
  const withGates = match(2);
  const employedTotal = (solution: ReturnType<typeof match>) => {
    let total = 0;
    for (let node = 0; node < n; node += 1) total += solution.employed[FEMALE][node]! + solution.employed[MALE][node]!;
    return total;
  };
  const employedBefore = employedTotal(alone);
  let idle = 0;
  for (let node = 0; node < n; node += 1)
    if (!graph.exits[node])
      idle += stock[FEMALE][node]! + stock[MALE][node]! - alone.employed[FEMALE][node]! - alone.employed[MALE][node]!;
  const servedBy = (solution: ReturnType<typeof match>, node: number, sex: number) => solution.served.get(`${node}|${sex}`) ?? [];

  const add = new Map<string, Diagnosis["add"][number]>();
  for (const base of graph.bases)
    for (const sex of [FEMALE, MALE]) {
      const count = Math.round(withGates.extra[sex]![base]!);
      if (count > 0) add.set(`${base}|${sex}`, { b: base, s: sex, k: count, partners: servedBy(withGates, base, sex), viaGate: [] });
    }

  const gatesUsed: Diagnosis["gates"] = [];
  const needed: [Float64Array, Float64Array] = [new Float64Array(n), new Float64Array(n)];
  let survival = 0;
  for (let step = 0; step < craftSteps; step += 1) survival += (1 - p / 2) ** step;
  gates.forEach((recipe, gate) => {
    const count = Math.round(withGates.extra[FEMALE][gate]! + withGates.extra[MALE][gate]!);
    if (!(count > 0)) return;
    const attempts = Math.ceil(count / (p * survival) - 1e-9);
    const partners = [...servedBy(withGates, gate, FEMALE), ...servedBy(withGates, gate, MALE)].sort((a, b) => b.k - a.k);
    gatesUsed.push({ y: gate, k: count, recipe, n: attempts, partners });
    if (recipe.a === recipe.b) {
      needed[FEMALE][recipe.a]! += attempts;
      needed[MALE][recipe.a]! += attempts;
    } else {
      needed[FEMALE][recipe.a]! += Math.ceil(attempts / 2);
      needed[MALE][recipe.b]! += Math.ceil(attempts / 2);
      needed[MALE][recipe.a]! += Math.floor(attempts / 2);
      needed[FEMALE][recipe.b]! += Math.floor(attempts / 2);
    }
  });
  gatesUsed.forEach((gate) => {
    for (const parent of new Set([gate.recipe.a, gate.recipe.b]))
      for (const sex of [FEMALE, MALE]) {
        const free = Math.max(0, stock[sex]![parent]! - withGates.employed[sex]![parent]!);
        const missingG1 = Math.max(0, Math.round(needed[sex]![parent]! - free));
        needed[sex]![parent] = 0;
        if (!(missingG1 > 0)) continue;
        const key = `${parent}|${sex}`;
        const entry = add.get(key) ?? { b: parent, s: sex, k: 0, partners: [], viaGate: [] };
        entry.k += missingG1;
        entry.viaGate.push({ y: gate.y, k: gate.k, kG1: missingG1 });
        add.set(key, entry);
      }
  });

  const idleAfter: Diagnosis["idleAfter"] = [];
  for (let node = 0; node < n; node += 1) {
    if (graph.exits[node]) continue;
    for (const sex of [FEMALE, MALE]) {
      const count = Math.round(stock[sex]![node]! - withGates.employed[sex]![node]!);
      if (count <= 0) continue;
      const needs: number[] = [];
      for (const op of graph.ops) {
        if (useful && !useful[op.child]) continue;
        const self = sex === FEMALE ? op.f : op.m;
        const partner = sex === FEMALE ? op.m : op.f;
        if (self !== node || graph.gen[partner] === 1 || graph.exits[partner] || gates.has(partner) || needs.includes(partner)) continue;
        needs.push(partner);
      }
      if (needs.length) idleAfter.push({ i: node, s: sex, k: count, needs });
    }
  }
  idleAfter.sort((a, b) => b.k - a.k);
  return {
    add: [...add.values()],
    gates: gatesUsed,
    unlocked: Math.round(employedTotal(withGates) - employedBefore),
    unlockedDirect: Math.round(employedTotal(withG1) - employedBefore),
    idleBefore: Math.round(idle),
    idleAfter,
  };
}

function rebalanceLines(graph: BreedingGraph, purchases: G1Line[], diagnosis: Diagnosis): G1Line[] {
  const purchaseByBase = new Map(purchases.map((line) => [line.g1, line]));
  const addByKey = new Map(diagnosis.add.map((entry) => [`${entry.b}|${entry.s}`, entry]));
  const gateByNode = new Map(diagnosis.gates.map((gate) => [gate.y, gate]));
  const stillIdle = diagnosis.idleAfter
    .slice(0, 3)
    .map(
      (entry) =>
        `${entry.k} ${graph.name[entry.i]} ${sexSymbol(entry.s)} (il leur faut ${entry.needs
          .slice(0, 3)
          .map((node) => graph.name[node])
          .join(" ou ")})`,
    );
  const lines = graph.bases.map((base) => {
    const purchase = purchaseByBase.get(base) ?? { females: 0, males: 0, why: "" };
    const femaleAdd = addByKey.get(`${base}|${FEMALE}`);
    const maleAdd = addByKey.get(`${base}|${MALE}`);
    const females = Math.max(purchase.females || 0, femaleAdd?.k || 0);
    const males = Math.max(purchase.males || 0, maleAdd?.k || 0);
    const reasons: string[] = [];
    const totalsByPartner = (partners: Served[]) => {
      const totals = new Map<number, number>();
      partners.forEach((entry) => totals.set(entry.partner, (totals.get(entry.partner) ?? 0) + entry.k));
      return [...totals.entries()].sort((a, b) => b[1] - a[1]);
    };
    for (const entry of [femaleAdd, maleAdd]) {
      if (!entry) continue;
      const direct = entry.k - entry.viaGate.reduce((sum, gate) => sum + gate.kG1, 0);
      if (direct > 0) {
        const partners = entry.partners
          .filter((partner) => !gateByNode.has(partner.partner))
          .slice(0, 3)
          .map((partner) => `${Math.round(partner.k)} ${graph.name[partner.partner]} ${sexSymbol(1 - entry.s)} (pour faire ${graph.name[partner.child]})`)
          .join(", ");
        reasons.push(
          `${direct} ${sexSymbol(entry.s)} ${direct > 1 ? "donnent" : "donne"} tout de suite un partenaire à des montures qui n'en ont aucun : ${partners}`,
        );
      }
    }
    const viaGates = new Map<number, [number, number]>();
    for (const entry of [femaleAdd, maleAdd])
      entry?.viaGate.forEach((gate) => {
        const split = viaGates.get(gate.y) ?? [0, 0];
        split[entry.s]! += gate.kG1;
        viaGates.set(gate.y, split);
      });
    viaGates.forEach(([femaleCount, maleCount], gateNode) => {
      const gate = gateByNode.get(gateNode)!;
      const partners = totalsByPartner(gate.partners)
        .slice(0, 3)
        .map(([partner, count]) => `${Math.round(count)} ${graph.name[partner]}`)
        .join(", ");
      reasons.push(
        `${femaleCount} ${sexSymbol(FEMALE)} + ${maleCount} ${sexSymbol(MALE)} pour fabriquer en 2 étapes (${gate.n} tentatives ${graph.name[gate.recipe.a]} × ${graph.name[gate.recipe.b]}) les ${gate.k} ${graph.name[gate.y]} qui manquent comme partenaires à ${partners}`,
      );
    });
    if ((purchase.females || 0) + (purchase.males || 0) > 0 && (purchase.females > (femaleAdd?.k || 0) || purchase.males > (maleAdd?.k || 0)))
      reasons.push(`le plan en voudrait ${purchase.females} ${sexSymbol(FEMALE)} ${purchase.males} ${sexSymbol(MALE)} : ${purchase.why}`);
    return { g1: base, females, males, why: reasons.length ? reasons.join(" ; ") : "rien à ajouter" };
  });

  if (lines.every((line) => line.females + line.males === 0)) {
    const why = stillIdle.length
      ? `aucune G1 à ajouter : une G1 ne donnerait de partenaire à aucune monture ; restent sans partenaire, et il faut d'abord faire naître leur partenaire : ${stillIdle.join(", ")}`
      : "étable équilibrée : chaque monture a un partenaire possible, aucune G1 ne vaut plus qu'une capture ordinaire";
    lines.forEach((line) => (line.why = why));
  } else if (stillIdle.length)
    lines.forEach((line) => {
      if (line.females + line.males === 0) line.why = `rien à ajouter (restent sans partenaire, hors de portée d'une G1 : ${stillIdle.join(", ")})`;
    });
  return lines;
}

export interface StepPlan {
  reproductions: Reproduction[];
  rebalance: RebalanceLine[];
  rebalanceNote: string | null;
  fallback: string | null;
}

function rebalanceSummary(diagnosis: Diagnosis | null, lines: RebalanceLine[]) {
  if (!diagnosis) return null;
  const idleBefore = diagnosis.idleBefore;
  const unlocked = diagnosis.unlocked;
  const stillIdle = diagnosis.idleAfter.reduce((sum, entry) => sum + entry.k, 0);
  if (idleBefore <= 0) return null;
  const parts = [`${idleBefore} monture${idleBefore > 1 ? "s" : ""} sans partenaire possible aujourd'hui`];
  if (lines.length > 0 && unlocked > 0) parts.push(`les G1 conseillées en débloquent ${unlocked}`);
  if (stillIdle > 0) parts.push(`${stillIdle} attendent d'abord la naissance de leur partenaire`);
  return `${parts.join(" ; ")}.`;
}

export function planStep(input: StepInput, config: HorizonConfig = DEFAULT_HORIZON_CONFIG): StepPlan {
  const { graph } = input;
  let decision: Decision | null = null;
  let fallback: string | null = null;
  for (const attempt of [config, { ...config, sexedSteps: 1, mergedSteps: 0 }])
    try {
      decision = decide(input, attempt);
      break;
    } catch (error) {
      fallback = String((error as Error)?.message || error);
    }
  if (!decision)
    return {
      reproductions: [],
      rebalance: [],
      rebalanceNote: "calcul impossible à cette étape",
      fallback,
    };

  const missing = missingVector(graph, input.missing);
  const nothingMissing = input.mode === "success" && !missing.some((count) => count > 0);
  let lines: G1Line[] = [];
  try {
    if (config.rebalance && !nothingMissing) lines = purchaseRebalance(input, config, decision);
  } catch (error) {
    fallback = `rééquilibrage : ${(error as Error)?.message || error}`;
  }
  let diagnosis: Diagnosis | null = null;
  try {
    diagnosis = diagnose(graph, decision.model.stock, input.mode, missing, input.chance);
    lines = rebalanceLines(graph, lines, diagnosis);
  } catch (error) {
    fallback = `diagnostic : ${(error as Error)?.message || error}`;
    if (!lines.length) lines = graph.bases.map((base) => ({ g1: base, females: 0, males: 0, why: "diagnostic impossible à cette étape" }));
  }

  const rebalance = lines.map((line) => ({
    nodeId: graph.ids[line.g1]!,
    females: Math.max(0, Math.round(line.females || 0)),
    males: Math.max(0, Math.round(line.males || 0)),
    why: line.why,
  }));
  const toAdd = rebalance.filter((line) => line.females + line.males > 0);
  return {
    reproductions: decision.reproductions,
    rebalance: toAdd,
    rebalanceNote: toAdd.length ? rebalanceSummary(diagnosis, toAdd) : (rebalance[0]?.why ?? null),
    fallback,
  };
}
