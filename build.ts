#!/usr/bin/env bun
// Rebuild data_canvas.html from ./src/
// Usage: bun build.ts [output.html]

const OUTPUT = process.argv[2] ?? "data_canvas_build.html";
const SRC = "./src";
const TEMPLATE = `${SRC}/template.html`;

async function main() {
  if (!(await Bun.file(TEMPLATE).exists())) {
    console.error(`❌ Template not found: ${TEMPLATE}`);
    process.exit(1);
  }

  let template = await Bun.file(TEMPLATE).text();
  const files = await getAllFiles(SRC);
  let injected = 0;

  console.log(`Found ${files.length} files`);

  for (const filePath of files) {
    const relative = filePath.replace(SRC + "/", "");
    const content = (await Bun.file(filePath).text()).trim();
    const escaped = relative.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // ---------- Normal regions (JS / CSS / HTML) ----------
    template = template.replace(
      new RegExp(
        `((?:<!--\\s*)?(?:\\/\\*|\\/\\/|#)\\s*#?region file: ${escaped}[^\\n]*)[\\s\\S]*?(?:\\/\\*|\\/\\/|<!--)?\\s*#?endregion[^\\n]*`,
        "g"
      ),
      (full, open) => {
        injected++;

        // Decide the correct closing based on the opening style
        let close: string;
        if (open.includes("<!--")) {
          close = "<!-- #endregion -->";
        } else if (open.includes("/*")) {
          close = "/* #endregion */";
        } else if (open.trimStart().startsWith("//")) {
          close = "//#endregion";
        } else {
          close = "#endregion";
        }

        return `${open}\n${content}\n${close}`;
      }
    );

    // ---------- Python pyregion ----------
    template = template.replace(
      new RegExp(`(# pyregion file: ${escaped})[\\s\\S]*?(# endpyregion)`, "g"),
      (_, open) => {
        injected++;
        return `${open}\n${content}\n# endpyregion`;
      }
    );
  }

  await Bun.write(OUTPUT, template);
  console.log(`✅ Built ${OUTPUT}`);
  console.log(`   Injected ${injected} regions`);
}

async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const { readdir } = await import("node:fs/promises");

  async function walk(current: string) {
    try {
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const full = `${current}/${entry.name}`;
        if (entry.isDirectory()) await walk(full);
        else files.push(full);
      }
    } catch {}
  }

  await walk(dir);
  return files.sort();
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});