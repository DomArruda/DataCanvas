

 // Export
function exportNotebookJson() {
    let name = prompt("Export notebook JSON as:", "capy_notebook.json");
    if (name === null) return;
    name = name.trim() || "capy_notebook.json";
    if (!/\.json$/i.test(name)) name += ".json";
    const content = JSON.stringify({
        cells: collectCellsRich(),
        files: collectDataFiles()
    }, null, 2);
    downloadBlob(content, name, "application/json");
}

// Saving HTML - let's end users just click with the state of the previously saved....
function saveHtmlCopy() {
    // Files ride along only when the embed toggle is on and data/ is
    // non-empty — the suffix advertises which kind of file this is.
    const files = collectDataFiles();
    const hasData = Object.keys(files).length > 0;
    const suffix = hasData ? ".capy-canvas.html" : ".canvas.html";

    let name = prompt("Save notebook as:", "data_canvas_book" + suffix);
    if (name === null) return;
    name = name.trim();
    if (!name) name = "data_canvas_book" + suffix;
    if (!/\.html?$/i.test(name)) name += suffix;

    let stateJson = JSON.stringify({
        cells: collectCellsRich(),
        files: files            // reuse — don't call collectDataFiles() twice
    });
    stateJson = stateJson.replace(/<\//g, "<\\/");

    const updated = PRISTINE_HTML.replace(
        /(<script id="notebook-data" type="application\/json">)[\s\S]*?(<\/script>)/,
        (full, open, close) => open + stateJson + close
    );

    downloadBlob(updated, name, "text/html");
}
console.log(typeof saveHtmlCopy)


// exporting to a .py. Have to make sure that install() function and markdown is handled correctly...
function exportPython() {
    const chunks = [];
    collectCellsRich().forEach(item => {
        const code = item.code;
        const out = item.output;
        const m = code.match(MARKDOWN_MAGIC);
        if (m) {
            // Markdown cell -> commented block, tagged so jupytext/VS Code
            // round-trips it back into a markdown cell.
            const lines = ["# %% [markdown]"];
            code.slice(m[0].length).split("\n").forEach(l => {
                lines.push(("# " + l).trimEnd());
            });
            chunks.push(lines.join("\n"));
        } else {
            // Code cell -> plain cell under a # %% marker. The canvas's
            // install("pkg") helper doesn't exist in regular Python, so
            // rewrite those lines to pip install form.
            const body = code.split("\n").map(line => {
                const pm = /^(\s*)[%!]pip\s+install\s+(.+)$/.exec(line);
                if (pm) return pm[1] + "# pip install " + pm[2].trim();
                const im = /^(\s*)install\(([^)]+)\)\s*$/.exec(line);
                if (!im) return line;
                const quoted = im[2].match(/['"]([^'"]+)['"]/g);
                const pkgs = quoted
                    ? quoted.map(s => s.replace(/['"]/g, '')).join(' ')
                    : im[2].trim();
                return im[1] + "# pip install " + pkgs;
            }).join("\n");
            let chunk = "# %%\n" + body.trimEnd();

            // Append the archived output as comments. Un-run cells
            // (out === null) export as bare code.
            if (out) {
                if (out.kind === 'text' && out.text && out.text !== 'Executed successfully.') {
                    chunk += "\n\n# Output:\n" +
                        out.text.trimEnd().split("\n").map(l => ("#   " + l).trimEnd()).join("\n");
                } else if (out.kind === 'image') {
                    chunk += "\n\n# Output: [matplotlib figure]";
                } else if (out.kind === 'plotly') {
                    chunk += "\n\n# Output: [plotly figure]";
                } else if (out.kind === 'html') {
                    chunk += "\n\n# Output: [table]";
                }
            }
            chunks.push(chunk);
        }
    });

    const header = "# Exported from Data Canvas \u2014 cells delimited with '# %%' markers\n\n";
    downloadBlob(header + chunks.join("\n\n") + "\n", "data_canvas_export.py", "text/x-python");
}




function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}


 document.getElementById('dataFileUpload').addEventListener('change', async (e) => {
    if (!e.target.files.length) return;
    for (const file of e.target.files) {
        try {
            const buf = await file.arrayBuffer();
            pyodide.FS.writeFile(DATA_DIR + '/' + file.name, new Uint8Array(buf));
        } catch (err) {
            alert('Could not write ' + file.name + ' to the data folder: ' + err);
        }
    }
    refreshFilePanel();
    e.target.value = '';

});


// ---------------- Python import: the reverse of exportPython ----------------
// Parses a '# %%'-delimited .py (jupytext / VS Code / our own export) back
// into cells: '# %% [markdown]' blocks are uncommented into %%markdown
// cells, '# pip install a b' lines become install("a", "b") again, and
// trailing '# Output:' comment blocks (our export artifact) are dropped.
// A plain .py with no markers imports as a single cell.
function parsePythonToCells(text) {
    const lines = text.split(/\r?\n/);
    const chunks = [];
    let current = { markdown: false, lines: [], preamble: true };

    lines.forEach(line => {
        const marker = /^\s*#\s*%%(.*)$/.exec(line);
        if (marker) {
            chunks.push(current);
            current = { markdown: /\[markdown\]/.test(marker[1]), lines: [], preamble: false };
        } else {
            current.lines.push(line);
        }
    });
    chunks.push(current);

    const cells = [];
    chunks.forEach(chunk => {
        if (chunk.markdown) {
            const md = chunk.lines.map(l => l.replace(/^\s*#\s?/, '')).join("\n").trim();
            if (md.length) cells.push("%%markdown\n" + md);
            return;
        }

        let ls = chunk.lines.slice();

        // Drop a trailing "# Output:" block, but only if everything from
        // that line onward is comments/blank — a genuine mid-code comment
        // followed by more code is left untouched.
        const outIdx = ls.findIndex(l => /^\s*#\s*Output:/.test(l));
        if (outIdx !== -1 && ls.slice(outIdx).every(l => /^\s*#/.test(l) || l.trim() === '')) {
            ls = ls.slice(0, outIdx);
        }

        // Restore "# pip install a b" -> install("a", "b")
        ls = ls.map(l => {
            const m = /^(\s*)#\s*pip install\s+(.+)$/.exec(l);
            if (!m) return l;
            return m[1] + "%pip install " + m[2].trim();
        });

        // The preamble (before the first marker) keeps user content but
        // drops our own export header.
        if (chunk.preamble) {
            ls = ls.filter(l => !/^#\s*Exported from Data Canvas/.test(l));
        }

        const body = ls.join("\n").replace(/^\n+|\n+$/g, '');
        if (body.trim().length) cells.push(body);
    });

    return cells.length ? cells : [text];
}

// ---------------- File loading ----------------

// --- 1. Load CSV Data ---

/* 

// LEGACY
document.getElementById('csvFileInput').addEventListener('change', async (e) => {
    if(!e.target.files.length) return;
    const file = e.target.files[0];
    const text = await file.text();

    pyodide.globals.set("raw_csv_string", text);
    addCell(`# ${file.name} loaded!\ndf_csv = pd.read_csv(io.StringIO(raw_csv_string))\ndf_csv.head()`);
    updateStateInspector();
    e.target.value = '';
});
*/

// --- 1b. Load Excel Data (parsed client-side with SheetJS, handed to pandas as JSON) ---
// Each sheet becomes its own DataFrame named {source_file}_{sheet_name},
// e.g. sales_2024_Summary. Raw JSON is stashed in an underscore-prefixed
// global (per file) so it stays out of the Memory Inspector and autocomplete.

// Turn an arbitrary file/sheet name into a valid Python identifier.
function toPyIdentifier(name) {
    let s = String(name).replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (!s) s = 'sheet';
    if (/^[0-9]/.test(s)) s = '_' + s;
    return s;
}

/*
// LEGACY
document.getElementById('excelFileInput').addEventListener('change', async (e) => {
    if(!e.target.files.length) return;
    const file = e.target.files[0];
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

    // Convert every sheet to an array of row-objects so pandas can build
    // a DataFrame straight from it, no server round-trip required.
    const sheetsData = {};
    workbook.SheetNames.forEach(name => {
        sheetsData[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: null });
    });

    const base = toPyIdentifier(file.name.replace(/\.[^.]+$/, ''));
    const rawVar = `_raw_excel_${base}`;
    const parsedVar = `_excel_${base}`;
    pyodide.globals.set(rawVar, JSON.stringify(sheetsData));

    const lines = [
        `# ${file.name} loaded! Sheets: ${workbook.SheetNames.join(', ')}`,
        `${parsedVar} = json.loads(${rawVar})`
    ];

    const dfNames = [];
    const seen = {};
    workbook.SheetNames.forEach(name => {
        let dfName = `${base}_${toPyIdentifier(name)}`;
        // Guard against two sheet names sanitizing to the same identifier
        if (seen[dfName] !== undefined) {
            seen[dfName]++;
            dfName = `${dfName}_${seen[dfName]}`;
        } else {
            seen[dfName] = 1;
        }
        dfNames.push(dfName);
        lines.push(`${dfName} = pd.DataFrame(${parsedVar}[${JSON.stringify(name)}])`);
    });

    lines.push('', `${dfNames[0]}.head()`);
    addCell(lines.join('\n'));
    updateStateInspector();
    e.target.value = '';
});
*/

// --- 2. Open a saved notebook: .json export OR a Save Copy .html ---
// --- 2. Open a saved notebook: .json export OR a Save Copy .html ---
document.getElementById('loadNotebookInput').addEventListener('change', async (e) => {
    if(!e.target.files.length) return;
    const file = e.target.files[0];
    const text = await file.text();
    try {
        let cells = null;
        let embeddedFiles = null;

        if (/\.html?$/i.test(file.name)) {
            // Pull the embedded notebook-data payload out of a saved copy
            const m = /<script id="notebook-data" type="application\/json">([\s\S]*?)<\/script>/.exec(text);
            if (m) {
                const parsed = JSON.parse(m[1]);
                cells = parsed.cells || null;
                embeddedFiles = parsed.files || null;
            }
            if (!cells || !cells.length) throw new Error("No saved cells found in this HTML file.");
        } else {
            const data = JSON.parse(text);
            cells = data.cells || null;
            embeddedFiles = data.files || null;
            if (!cells) throw new Error("Not a valid notebook JSON file.");
        }

        if (embeddedFiles) restoreDataFiles(embeddedFiles);
        loadCellsFromList(cells);
        refreshFilePanel();
        scheduleAutosave();
    } catch (err) { alert("Error: " + err.message); }
    e.target.value = '';
});

// --- 3. Import a Python script (.py) — parse # %% cells (and plain .py)
// into the notebook. Keeps the running Python state, virtual FS, and
// inspector intact; only the cell list is replaced.
document.getElementById('importPythonInput').addEventListener('change', async (e) => {
    if (!e.target.files.length) return;
    const file = e.target.files[0];
    const text = await file.text();
    try {
        const cells = parsePythonToCells(text);
        loadCellsFromList(cells);
        scheduleAutosave();
    } catch (err) {
        alert("Error importing Python script: " + err.message);
    }
    e.target.value = '';
});
