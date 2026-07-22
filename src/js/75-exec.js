
// ---------------- Core Execution Logic ----------------

async function runCell(cellId) {
    const cell = document.getElementById(cellId);
    const output = cell.querySelector('.output');
    const plotContainer = cell.querySelector('.plot-container');
    const plotImage = plotContainer.querySelector('img');
    const plotlyContainer = cell.querySelector('.plotly-container');
    const plotlyTarget = plotlyContainer.querySelector('.plotly-target');
    const tableContainer = cell.querySelector('.table-output');
    const mdContainer = cell.querySelector('.markdown-output');
    const runBtn = cell.querySelector('.btn-run');

    let inputCode = editors[cellId].getValue();

    // ---- Markdown cell: render instead of executing ----
    if (isMarkdownCode(inputCode)) {
        renderMarkdownCell(cellId);
        rebuildTOC();
        scheduleAutosave();
        return;
    }

    mdContainer.style.display = 'none';
    cell.classList.remove('md-rendered');
    output.style.display = 'block';
    plotContainer.style.display = 'none';
    plotlyContainer.style.display = 'none';
    tableContainer.style.display = 'none';
    output.classList.remove('error');
    runBtn.disabled = true;
    const originalLabel = runBtn.innerHTML;
    runBtn.innerHTML = 'Running\u2026';
    let printedText = "";
    let cellOutput = null; // archived for Save Copy / Export / autosave

    try {
        // Intercept installs — `%pip install pkg1 pkg2` and legacy `install("pkg")`
        const packagesToInstall = [];

        // %pip install (also accepts !pip); strip flags like -q / -U
        inputCode = inputCode.replace(
            /^[ \t]*[%!]pip\s+install\s+([^\n]+)$/gm,
            (full, args) => {
                args.trim().split(/\s+/).forEach(tok => {
                    if (tok.startsWith('-')) return;
                    packagesToInstall.push(tok.replace(/^['"]|['"]$/g, ''));
                });
                return `# Intercepted: ${full.trim()}`;
            }
        );

        // legacy install("pkg", "pkg2")
        const installRegex = /^\s*install\(([^)]+)\)/gm;
        let match;
        while ((match = installRegex.exec(inputCode)) !== null) {
            const args = match[1].match(/['"]([^'"]+)['"]/g);
            if (args) args.forEach(arg => packagesToInstall.push(arg.replace(/['"]/g, '')));
            inputCode = inputCode.replace(match[0], `# Intercepted: ${match[0]}`);
        }

        if (packagesToInstall.length > 0) {
            output.innerText = `Fetching packages\u2026`;
            const micropip = pyodide.pyimport("micropip");
            for (const pkg of packagesToInstall) await micropip.install(pkg);
        }

        output.innerText = "Running\u2026";

        // Run Python, capturing anything print() writes along the way
        pyodide.runPython("start_stdout_capture()");
        let result;
        try {
            result = await pyodide.runPythonAsync(inputCode);
        } finally {
            // Always read the buffer back and restore stdout, even on error,
            // so partial print() output before a crash isn't lost.
            printedText = pyodide.runPython("end_stdout_capture()");
        }

        // A PyProxy result goes through the Python-side dispatcher, which
        // picks table / image / plotly / text. JS primitives fall through
        // to the plain-text path.
        const isProxy = result && typeof result === 'object' && typeof result.type === 'string';
        let rich = null;
        if (isProxy) {
            pyodide.globals.set("_temp_result", result);
            try {
                rich = JSON.parse(pyodide.runPython("render_result(_temp_result)"));
            } catch (e) {
                rich = { kind: 'text', text: String(result) };
            }
        }

        const showStdoutOnly = () => {
            if (printedText && printedText.length > 0) {
                output.innerText = printedText;
                output.style.display = 'block';
            } else {
                output.style.display = 'none';
            }
        };

        if (rich && rich.kind === 'plotly') {
            const spec = JSON.parse(rich.spec);
            Plotly.purge(plotlyTarget);
            plotlyContainer.style.display = 'block';
            await Plotly.newPlot(plotlyTarget, spec.data, spec.layout || {}, { responsive: true, displaylogo: false });
            showStdoutOnly();
            cellOutput = { kind: 'plotly', spec: { data: spec.data, layout: spec.layout || {} }, stdout: printedText || "" };
        } else if (rich && rich.kind === 'image') {
            plotImage.src = rich.src;
            plotContainer.style.display = 'block';
            showStdoutOnly();
            cellOutput = { kind: 'image', src: rich.src, stdout: printedText || "" };
        } else if (rich && rich.kind === 'html') {
            // Sanitize once; the sanitized HTML is both displayed and
            // archived, so saved files carry clean markup.
            const safeHtml = sanitizeHtml(rich.html.replace(STYLE_TAG, ''));
            tableContainer.innerHTML = safeHtml;
            tableContainer.style.display = 'block';
            showStdoutOnly();
            cellOutput = { kind: 'html', html: safeHtml, stdout: printedText || "" };
        } else {
            // Plain text: combine stdout with the result's repr (rich text
            // for proxies, String() for JS primitives).
            const resultText = rich ? rich.text : (result !== undefined ? String(result) : null);
            let combined = printedText || "";
            if (resultText !== null && resultText !== undefined) {
                if (combined.length > 0 && !combined.endsWith("\n")) combined += "\n";
                combined += resultText;
            }
            output.innerText = combined.length > 0 ? combined : "Executed successfully.";
            cellOutput = { kind: 'text', text: output.innerText, error: false };
        }

        updateStateInspector();
    } catch (err) {
        output.classList.add('error');
        let combined = printedText || "";
        if (combined.length > 0 && !combined.endsWith("\n")) combined += "\n";
        combined += String(err);
        output.innerText = combined;
        output.style.display = 'block';
        cellOutput = { kind: 'text', text: combined, error: true };
    } finally {
        // Refresh the Files panel so anything this cell wrote to the
        // virtual FS shows up — runs on error too, so partial writes
        // before a crash are still recoverable. FS hiccups must never
        // mask the cell result.
        try { refreshFilePanel(); } catch (e) { /* no-op */ }
        lastOutputs[cellId] = cellOutput;
        scheduleAutosave();
        runBtn.disabled = false;
        runBtn.innerHTML = originalLabel;
    }
}

// ---------------- Run All ----------------
async function runAllCells() {
    const runAllBtn = document.getElementById('runAllBtn');
    if (runAllBtn.disabled) return;
    runAllBtn.disabled = true;
    const originalLabel = runAllBtn.innerHTML;
    runAllBtn.innerHTML = 'Running\u2026';

    try {
        const ids = Array.from(document.querySelectorAll('#cells-wrapper .cell')).map(c => c.id);
        for (const id of ids) {
            if (editors[id]) await runCell(id); // use the run cell Button; running is linear.....
        }
    } finally {
        runAllBtn.disabled = false; // make sure that the button is no longer disabled.
        runAllBtn.innerHTML = originalLabel; // reset lable.
    }
}
