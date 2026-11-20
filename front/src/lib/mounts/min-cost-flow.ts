export class FlowGraph {
  readonly to: number[] = [];
  readonly capacity: number[] = [];
  readonly cost: number[] = [];
  readonly next: number[] = [];
  readonly head: Int32Array;

  constructor(readonly nodeCount: number) {
    this.head = new Int32Array(nodeCount).fill(-1);
  }

  addEdge(from: number, to: number, capacity: number, cost: number) {
    this.to.push(to, from);
    this.capacity.push(capacity, 0);
    this.cost.push(cost, -cost);
    this.next.push(this.head[from]!, this.head[to]!);
    this.head[from] = this.to.length - 2;
    this.head[to] = this.to.length - 1;
    return this.to.length - 2;
  }

  flowOn(edge: number) {
    return this.capacity[edge + 1]!;
  }
}

interface AugmentOptions {
  acceptPath: (cost: number) => boolean;
  maxRounds: number;
  relaxTolerance: number;
  throwOnNegativeCycle: boolean;
}

export function augmentFlow(graph: FlowGraph, source: number, sink: number, options: AugmentOptions) {
  const { nodeCount } = graph;
  const distance = new Float64Array(nodeCount);
  const inQueue = new Uint8Array(nodeCount);
  const via = new Int32Array(nodeCount);
  const enqueued = new Int32Array(nodeCount);
  let totalCost = 0;

  for (let round = 0; round < options.maxRounds; round += 1) {
    distance.fill(Infinity);
    via.fill(-1);
    inQueue.fill(0);
    enqueued.fill(0);
    distance[source] = 0;
    inQueue[source] = 1;
    const queue = [source];
    let negativeCycle = false;
    for (let index = 0; index < queue.length && !negativeCycle; index += 1) {
      const node = queue[index]!;
      inQueue[node] = 0;
      for (let edge = graph.head[node]!; edge !== -1; edge = graph.next[edge]!) {
        if (graph.capacity[edge]! <= 0) continue;
        const target = graph.to[edge]!;
        const candidate = distance[node]! + graph.cost[edge]!;
        if (!(candidate < distance[target]! - options.relaxTolerance)) continue;
        distance[target] = candidate;
        via[target] = edge;
        if (inQueue[target]) continue;
        inQueue[target] = 1;
        queue.push(target);
        enqueued[target]! += 1;
        if (enqueued[target]! > nodeCount + (options.throwOnNegativeCycle ? 2 : 1)) {
          if (options.throwOnNegativeCycle) throw new Error("diagnostic : cycle négatif");
          negativeCycle = true;
          break;
        }
      }
    }
    if (negativeCycle || !options.acceptPath(distance[sink]!)) break;

    let bottleneck = Infinity;
    let length = 0;
    let broken = false;
    for (let node = sink; node !== source; node = graph.to[via[node]! ^ 1]!) {
      if (via[node]! < 0 || (length += 1) > nodeCount) {
        broken = true;
        break;
      }
      bottleneck = Math.min(bottleneck, graph.capacity[via[node]!]!);
    }
    if (broken || !(bottleneck > 0) || !Number.isFinite(bottleneck)) break;
    for (let node = sink; node !== source; node = graph.to[via[node]! ^ 1]!) {
      graph.capacity[via[node]!]! -= bottleneck;
      graph.capacity[via[node]! ^ 1]! += bottleneck;
    }
    totalCost += bottleneck * distance[sink]!;
  }
  return totalCost;
}
