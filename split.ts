#!/usr/bin/env bun
// Extract every region block into src/<path>.
// Supports both normal #region and Python-specific # pyregion markers.

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const INPUT = process.argv[2] ?? "./data_canvas.html";
const OUT = "./src";

function dedent(s: string): string {
  const lines = s.split("\n");
  const widths = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^[ \t]*/)![0].length);
  const min = widths.length ? Math.min(...widths) : 0;
  return lines.map((l) => l.slice(min)).join("\n").trimEnd();
}

const text = await Bun.file(INPUT).text();

let count = 0;

// ==================== Normal regions (JS, HTML, CSS) ====================
const RE =
  /(?:(?:<!--|\/\*|\/\/|#|`)[ \t]*)#?[ \t]*#region file:[ \t]*(\S+?)[ \t]*(?:-->|\*\/|`)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*(?:(?:\/\/|\/\*|<!--|#|`)[ \t]*)#?[ \t]*#endregion/g;

let m: RegExpExecArray | null;
while ((m = RE.exec(text)) !== null) {
  const [, path, body] = m;
  await extractRegion(path, body);
  count++;
}

// ==================== Python regions (# pyregion) ====================
const PY_RE =
  /# pyregion file:[ \t]*(\S+?)[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*# endpyregion/g;

while ((m = PY_RE.exec(text)) !== null) {
  const [, path, body] = m;
  await extractRegion(path, body);
  count++;
}

async function extractRegion(path: string, body: string) {
  const dest = `${OUT}/${path}`;
  await mkdir(dirname(dest), { recursive: true });
  await Bun.write(dest, dedent(body) + "\n");
  console.log(`  ${path.padEnd(35)} ${body.split("\n").length} lines`);
}

if (count === 0) {
  console.error(`No region markers found in ${INPUT}`);
  process.exit(1);
}

// Create template.html with region bodies removed (markers preserved)
RE.lastIndex = 0;
PY_RE.lastIndex = 0;

let template = text.replace(RE, (full) => {
  const openEnd = full.indexOf("\n");
  const closeStart = full.lastIndexOf("\n");
  return full.slice(0, openEnd + 1) + full.slice(closeStart + 1);
});

template = template.replace(PY_RE, (full) => {
  const openEnd = full.indexOf("\n");
  const closeStart = full.lastIndexOf("\n");
  return full.slice(0, openEnd + 1) + full.slice(closeStart + 1);
});

await Bun.write(`${OUT}/template.html`, template);

console.log(`\n✅ ${count} regions extracted -> ${OUT}/`);
console.log(`✅ template.html created`);