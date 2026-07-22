
// ---------------- Embedded state (Save Copy) ----------------
function getEmbeddedNotebook() {
    const el = document.getElementById('notebook-data');
    if (!el) return null;
    try {
        const data = JSON.parse(el.textContent);
        return (data && Array.isArray(data.cells) && data.cells.length > 0) ? data : null; // getting all cells if data exists and if each cell is an array > 0
    } catch (e) { return null; }
}

// Code only — used for comparisons and as a quota-friendly fallback.
function collectCells() {
    const cells = [];
    document.querySelectorAll('#cells-wrapper .cell').forEach(cellDiv => {
        if (editors[cellDiv.id]) cells.push(editors[cellDiv.id].getValue());
    });
    return cells;
}

// Code + archived output. Cells that were never run save with output: null
// — they round-trip as plain code, exactly as written.
function collectCellsRich() {
    const items = [];
    document.querySelectorAll('#cells-wrapper .cell').forEach(cellDiv => {
        if (!editors[cellDiv.id]) return;
        items.push({
            code: editors[cellDiv.id].getValue(),
            output: lastOutputs[cellDiv.id] || null
        });
    });
    return items;
}


// Serialize the data/ folder into the saved notebook. Each embeddable
// file becomes { name: {b64, ext} }. Binary-safe base64 encoding, chunked
// so large files don't blow the call stack on String.fromCharCode.
const EMBEDDABLE_FILE_RE = /\.(csv|xlsx|xls|json|parquet|txt|tsv)$/i;

function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000; // 32 KB per chunk keeps the apply() args in range
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function base64ToBytes(b64) {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

function collectDataFiles() {
    const out = {};
    if (!embedFilesEnabled) return out;   // <-- respect the embed toggle

    if (!pyodide || !pyodide.FS) return out;
    const dir = pyCwd();
    let names = [];
    try { names = pyodide.FS.readdir(dir); } catch (e) { return out; }
    names.forEach(name => {
        if (name === '.' || name === '..' || !EMBEDDABLE_FILE_RE.test(name)) return;
        try {
            const st = pyodide.FS.stat(dir + '/' + name);
            if (pyodide.FS.isDir(st.mode)) return;
            const bytes = pyodide.FS.readFile(dir + '/' + name); // Uint8Array
            out[name] = {
                b64: bytesToBase64(bytes),
                ext: name.split('.').pop().toLowerCase()
            };
        } catch (e) { /* unreadable — skip this file */ }
    });
    return out;
}

// Write embedded files back into the virtual FS on load.
function restoreDataFiles(files) {
    if (!files || !pyodide || !pyodide.FS) return;
    Object.keys(files).forEach(name => {
        try {
            const bytes = base64ToBytes(files[name].b64);
            pyodide.FS.writeFile(DATA_DIR + '/' + name, bytes);
        } catch (e) { /* skip a corrupt entry rather than fail the whole load */ }
    });
}

// Re-display an archived output on a freshly created cell (used when
// opening a Save Copy / JSON export / autosave restore). All HTML from
// opened files passes through sanitizeHtml before injection.
function restoreOutput(cellId, out) {
    if (!out || !out.kind) return;
    const cell = document.getElementById(cellId);
    if (!cell) return;
    lastOutputs[cellId] = out;

    const output = cell.querySelector('.output');
    const stdout = out.stdout || "";

    if (out.kind === 'text') {
        output.innerText = out.text || "";
        output.classList.toggle('error', !!out.error);
        output.style.display = (out.text && out.text.length) ? 'block' : 'none';
        return;
    }
    if (stdout) {
        output.innerText = stdout;
        output.style.display = 'block';
    }
    if (out.kind === 'image' && out.src) {
        const pc = cell.querySelector('.plot-container');
        pc.querySelector('img').src = out.src;
        pc.style.display = 'block';
    } else if (out.kind === 'html' && out.html) {
        const tc = cell.querySelector('.table-output');
        tc.innerHTML = sanitizeHtml(out.html.replace(STYLE_TAG, ''));
        tc.style.display = 'block';
    } else if (out.kind === 'plotly' && out.spec && window.Plotly) {
        const pc = cell.querySelector('.plotly-container');
        pc.style.display = 'block';
        Plotly.newPlot(pc.querySelector('.plotly-target'), out.spec.data, out.spec.layout || {},
            { responsive: true, displaylogo: false });
    }
}

// Accepts legacy entries (plain code strings) and rich entries
// ({code, output}) interchangeably.
function loadCellsFromList(cellList) {
    document.getElementById('cells-wrapper').innerHTML = '';
    for (let key in editors) delete editors[key];
    for (let key in lastOutputs) delete lastOutputs[key];
    cellList.forEach(entry => {
        const code = (typeof entry === 'string') ? entry : ((entry && entry.code) || '');
        const out = (entry && typeof entry === 'object') ? entry.output : null;
        const cellId = addCell(code);
        if (isMarkdownCode(code)) {
            renderMarkdownCell(cellId);
        } else if (out) {
            restoreOutput(cellId, out);
        }
    });
    rebuildTOC();
}


// Export and Save Functions....
// IO FUNCTIONS....
