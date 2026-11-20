import { accentColourName } from "@/lib/mounts/family";
import type { MountColour } from "@/lib/mounts/types";

export const EXIT_GENERATION = 10;

export interface Recipe {
  a: number;
  b: number;
  child: number;
}

export interface Operation {
  f: number;
  m: number;
  child: number;
  recipe: number;
}

export interface BreedingGraph {
  ids: string[];
  pos: Map<string, number>;
  gen: number[];
  name: string[];
  recipes: Recipe[];
  ops: Operation[];
  usesOf: number[][];
  bases: number[];
  exits: Uint8Array;
  n: number;
}

const graphs = new WeakMap<MountColour[], BreedingGraph>();

export function breedingGraph(colours: MountColour[]): BreedingGraph {
  const cached = graphs.get(colours);
  if (cached) return cached;
  const ids = colours.map((colour) => colour.id);
  const pos = new Map(ids.map((id, index) => [id, index]));
  const gen = colours.map((colour) => colour.generation);
  const recipes: Recipe[] = [];
  const seen = new Set<string>();
  colours.forEach((colour, child) => {
    for (const [first, second] of colour.recipes) {
      const a = pos.get(first);
      const b = pos.get(second);
      if (a === undefined || b === undefined) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      recipes.push({ a, b, child });
    }
  });
  const ops: Operation[] = [];
  recipes.forEach((recipe, index) => {
    ops.push({ f: recipe.a, m: recipe.b, child: recipe.child, recipe: index });
    if (recipe.a !== recipe.b) ops.push({ f: recipe.b, m: recipe.a, child: recipe.child, recipe: index });
  });
  const usesOf = ids.map((): number[] => []);
  recipes.forEach((recipe, index) => {
    usesOf[recipe.a]!.push(index);
    if (recipe.b !== recipe.a) usesOf[recipe.b]!.push(index);
  });
  const exits = new Uint8Array(ids.length);
  gen.forEach((generation, index) => {
    if (generation >= EXIT_GENERATION) exits[index] = 1;
  });
  const graph: BreedingGraph = {
    ids,
    pos,
    gen,
    name: colours.map((colour) => accentColourName(colour.name || colour.id)),
    recipes,
    ops,
    usesOf,
    bases: ids.map((_, index) => index).filter((index) => gen[index] === 1),
    exits,
    n: ids.length,
  };
  graphs.set(colours, graph);
  return graph;
}

export function ancestorsOf(graph: BreedingGraph, wanted: ArrayLike<number>) {
  const marked = new Uint8Array(graph.n);
  const parents = graph.ids.map((): number[] => []);
  graph.recipes.forEach((recipe) => parents[recipe.child]!.push(recipe.a, recipe.b));
  const stack: number[] = [];
  for (let i = 0; i < graph.n; i += 1)
    if (wanted[i]! > 0) {
      marked[i] = 1;
      stack.push(i);
    }
  while (stack.length) {
    const node = stack.pop()!;
    for (const parent of parents[node]!)
      if (!marked[parent]) {
        marked[parent] = 1;
        stack.push(parent);
      }
  }
  return marked;
}

export const genetonValue = (graph: BreedingGraph, node: number) => 2 ** (graph.gen[node]! - 1);
