#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(root, "comments-baseline.json");

const SKIPPED = [/(^|\/)routeTree\.gen\.ts$/, /^front\/src\/components\/ui\//];
const PRAGMAS = [
  /^\s*(\/\/|\/\*)\s*(@ts-|eslint-|prettier-|oxlint-|biome-|@vite-ignore|#region|#endregion)/,
  /^\s*\/\/\/\s*<reference/,
  /^\s*#\s*(type:|noqa|pragma|pyright:|mypy:|requires\s)/,
  /^\s*#!/,
];

const lexers = {
  ".ts": lexJs, ".tsx": lexJs, ".js": lexJs, ".mjs": lexJs, ".jsx": lexJs,
  ".css": lexCss, ".html": lexHtml,
  ".py": lexPython, ".ps1": lexPowerShell, ".toml": lexHash,
};

function lexJs(src) {
  const out = [];
  const braceStack = [];
  let i = 0;
  let lastSignificant = "";
  const regexAllowedAfter = /[(,=:[!&|?{};+\-*%<>~^]|^$|\b(return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      out.push([i, stop]);
      i = stop;
    } else if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out.push([i, stop]);
      i = stop;
    } else if (c === "'" || c === '"') {
      i = skipQuoted(src, i, c);
      lastSignificant = "x";
    } else if (c === "`") {
      i = skipTemplate(src, i + 1, braceStack);
      lastSignificant = "x";
    } else if (c === "}" && braceStack.length && braceStack[braceStack.length - 1] === 0) {
      braceStack.pop();
      i = skipTemplate(src, i + 1, braceStack);
      lastSignificant = "x";
    } else if (c === "/" && regexAllowedAfter.test(lastSignificant)) {
      i = skipRegex(src, i);
      lastSignificant = "x";
    } else {
      if (c === "{" && braceStack.length) braceStack[braceStack.length - 1]++;
      if (c === "}" && braceStack.length) braceStack[braceStack.length - 1]--;
      if (!/\s/.test(c)) {
        if (/[A-Za-z_$]/.test(c)) {
          let j = i;
          while (j < src.length && /[\w$]/.test(src[j])) j++;
          lastSignificant = src.slice(i, j);
          i = j;
          continue;
        }
        lastSignificant = c;
      }
      i++;
    }
  }
  return out;
}

function skipQuoted(src, i, quote) {
  i++;
  while (i < src.length && src[i] !== quote && src[i] !== "\n") i += src[i] === "\\" ? 2 : 1;
  return i + 1;
}

function skipTemplate(src, i, braceStack) {
  while (i < src.length) {
    if (src[i] === "\\") i += 2;
    else if (src[i] === "`") return i + 1;
    else if (src[i] === "$" && src[i + 1] === "{") {
      braceStack.push(0);
      return i + 2;
    } else i++;
  }
  return i;
}

function skipRegex(src, i) {
  i++;
  let inClass = false;
  while (i < src.length && src[i] !== "\n") {
    if (src[i] === "\\") i += 2;
    else if (src[i] === "[") (inClass = true), i++;
    else if (src[i] === "]") (inClass = false), i++;
    else if (src[i] === "/" && !inClass) return i + 1;
    else i++;
  }
  return i;
}

function lexDelimited(src, open, close) {
  const out = [];
  let i = src.indexOf(open);
  while (i !== -1) {
    const end = src.indexOf(close, i + open.length);
    const stop = end === -1 ? src.length : end + close.length;
    out.push([i, stop]);
    i = src.indexOf(open, stop);
  }
  return out;
}

function lexCss(src) {
  return lexDelimited(src, "/*", "*/");
}

function lexHtml(src) {
  return lexDelimited(src, "<!--", "-->");
}

function lexHash(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"') i = skipQuoted(src, i, c);
    else if (c === "#") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      out.push([i, stop]);
      i = stop;
    } else i++;
  }
  return out;
}

function lexPython(src) {
  const out = [];
  let i = 0;
  let prevLine = ":";
  while (i < src.length) {
    const c = src[i];
    if (c === "#") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      out.push([i, stop]);
      i = stop;
    } else if (c === "'" || c === '"') {
      const triple = src.startsWith(c.repeat(3), i);
      const lineStart = src.lastIndexOf("\n", i - 1) + 1;
      const prefix = src.slice(lineStart, i);
      const isPrefixed = /[A-Za-z]$/.test(prefix);
      let stop;
      if (triple) {
        const end = src.indexOf(c.repeat(3), i + 3);
        stop = end === -1 ? src.length : end + 3;
      } else stop = skipQuoted(src, i, c);
      const startsStatement = /^\s*$/.test(prefix) && !isPrefixed;
      const restOfLine = src.slice(stop, (src.indexOf("\n", stop) + 1 || src.length + 1) - 1);
      if (triple && startsStatement && /:\s*$/.test(prevLine) && /^\s*(#.*)?$/.test(restOfLine)) out.push([i, stop]);
      i = stop;
    } else {
      if (c === "\n") {
        const lineStart = src.lastIndexOf("\n", i - 1) + 1;
        const line = src.slice(lineStart, i).replace(/#.*$/, "");
        if (line.trim()) prevLine = line;
      }
      i++;
    }
  }
  return out;
}

function lexPowerShell(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "<" && src[i + 1] === "#") {
      const end = src.indexOf("#>", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out.push([i, stop]);
      i = stop;
    } else if (src.startsWith('@"', i) || src.startsWith("@'", i)) {
      const close = "\n" + src[i + 1] + "@";
      const end = src.indexOf(close, i + 2);
      i = end === -1 ? src.length : end + close.length;
    } else if (c === "'") {
      i = skipQuoted(src, i, "'");
    } else if (c === '"') {
      i++;
      while (i < src.length && src[i] !== '"') i += src[i] === "`" ? 2 : 1;
      i++;
    } else if (c === "#" && (i === 0 || /[\s;({]/.test(src[i - 1]))) {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      out.push([i, stop]);
      i = stop;
    } else i++;
  }
  return out;
}

function lineOf(src, index) {
  let line = 1;
  for (let k = 0; k < index; k++) if (src[k] === "\n") line++;
  return line;
}

export function commentsIn(path, src) {
  const lex = lexers[extname(path)];
  if (!lex) return [];
  return lex(src)
    .map(([start, end]) => {
      const text = src.slice(start, end);
      const startLine = lineOf(src, start);
      const endLine = startLine + (text.match(/\n/g)?.length ?? 0);
      const lineStart = src.lastIndexOf("\n", start - 1) + 1;
      const lineEnd = src.indexOf("\n", end);
      const before = src.slice(lineStart, start);
      const after = src.slice(end, lineEnd === -1 ? src.length : lineEnd);
      const ownLines = /^[\s{]*$/.test(before) && /^[\s}]*$/.test(after);
      return { path, startLine, endLine, text, ownLines };
    })
    .filter(({ text }) => !PRAGMAS.some((p) => p.test(text)));
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((p) => p && lexers[extname(p)] && !SKIPPED.some((s) => s.test(p)) && existsSync(join(root, p)));
}

function collect() {
  return trackedFiles().flatMap((p) => commentsIn(p, readFileSync(join(root, p), "utf8")));
}

function countByFile(comments) {
  const counts = {};
  for (const c of comments) counts[c.path] = (counts[c.path] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function readBaseline() {
  return existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : {};
}

function writeBaseline(counts) {
  writeFileSync(baselinePath, JSON.stringify(counts, null, 2) + "\n");
}

function check({ tighten }) {
  const comments = collect();
  const counts = countByFile(comments);
  const baseline = readBaseline();
  const failures = Object.entries(counts).filter(([p, n]) => n > (baseline[p] ?? 0));
  for (const [path, n] of failures) {
    console.error(`${path}: ${n} comments, baseline allows ${baseline[path] ?? 0}. Comments are banned: put the reason in a name, a type, a test or an ADR (docs/adr) instead.`);
    for (const c of comments.filter((c) => c.path === path)) console.error(`  ${path}:${c.startLine}  ${c.text.split("\n")[0].trim()}`);
  }
  const shrunk = Object.keys(baseline).some((p) => (counts[p] ?? 0) < baseline[p]);
  if (tighten && !existsSync(baselinePath)) {
    writeBaseline(counts);
    console.log("Comment baseline recorded.");
  } else if (shrunk && tighten) {
    const next = Object.fromEntries(Object.entries(baseline).map(([p, n]) => [p, Math.min(n, counts[p] ?? 0)]).filter(([, n]) => n > 0));
    writeBaseline(next);
    console.log("Comment baseline tightened.");
  } else if (shrunk) {
    console.error("Comments were removed: run `node scripts/comments.mjs tighten` and commit comments-baseline.json so they can't come back.");
    process.exitCode = 1;
  }
  if (failures.length) process.exitCode = 1;
  else if (!process.exitCode) console.log(`No new comments (${comments.length} left in the baseline).`);
}

function removeComments(path, startLines) {
  const file = join(root, path);
  let src = readFileSync(file, "utf8");
  const targets = commentsIn(path, src).filter((c) => startLines.has(c.startLine));
  const ranges = lexers[extname(path)](src).filter(([start]) => targets.some((t) => t.startLine === lineOf(src, start)));
  for (const [start, end] of ranges.reverse()) {
    const lineStart = src.lastIndexOf("\n", start - 1) + 1;
    const newline = src.indexOf("\n", end);
    const lineEnd = newline === -1 ? src.length : newline + 1;
    const before = src.slice(lineStart, start);
    const after = src.slice(end, newline === -1 ? src.length : newline).replace(/\r$/, "");
    const wholeLine = (/^\s*$/.test(before) && /^\s*$/.test(after)) || (/^\s*\{$/.test(before) && /^\}\s*$/.test(after));
    if (wholeLine) {
      const head = src.slice(0, lineStart);
      let tail = src.slice(lineEnd);
      const allowedBlankLines = extname(path) === ".py" ? 2 : 1;
      const blankBefore = head.match(/(\r?\n[ \t]*)*$/)[0].split("\n").length - 2;
      let blankAfter = tail.match(/^([ \t]*\r?\n)*/)[0].split("\n").length - 1;
      while (blankAfter > 0 && blankBefore + blankAfter > allowedBlankLines) {
        tail = tail.replace(/^[ \t]*\r?\n/, "");
        blankAfter--;
      }
      src = head + tail;
    } else src = src.slice(0, start).replace(/[ \t]+$/, "") + src.slice(end);
  }
  writeFileSync(file, src.replace(/^(\r?\n)+/, ""));
  return ranges.length;
}

const [command = "check", ...args] = process.argv.slice(2);
if (command === "delete") {
  const byFile = new Map();
  const targets = args.includes("--all") ? collect().map((c) => `${c.path}:${c.startLine}`) : args;
  for (const target of targets) {
    const [, path, line] = target.match(/^(.*):(\d+)$/) ?? [];
    if (!path) throw new Error(`expected path:line, got ${target}`);
    if (!byFile.has(path)) byFile.set(path, new Set());
    byFile.get(path).add(Number(line));
  }
  let removed = 0;
  for (const [path, lines] of byFile) removed += removeComments(path, lines);
  console.log(`Removed ${removed} comments from ${byFile.size} files.`);
} else
if (command === "check") check({ tighten: false });
else if (command === "tighten") check({ tighten: true });
else if (command === "list") {
  for (const c of collect()) console.log(JSON.stringify({ ...c }));
} else if (command === "lines") {
  const comments = collect();
  const ownLines = comments.filter((c) => c.ownLines).reduce((s, c) => s + c.endLine - c.startLine + 1, 0);
  console.log(JSON.stringify({ comments: comments.length, files: Object.keys(countByFile(comments)).length, wholeLines: ownLines, trailing: comments.filter((c) => !c.ownLines).length }));
} else {
  console.error("usage: node scripts/comments.mjs [check|tighten|list|lines|delete <path:line>...|delete --all]");
  process.exitCode = 2;
}
