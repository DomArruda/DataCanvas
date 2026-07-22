
// ---------------- Memory Inspector ----------------
function updateStateInspector() {
    let records = [];
    try {
        records = JSON.parse(pyodide.runPython("export_state_records()"));
    } catch (e) {
        console.error("State export failed:", e);
        return;
    }

    const tbody = document.getElementById('state-table-body');
    const table = document.getElementById('state-table');
    const empty = document.getElementById('state-empty');
    tbody.innerHTML = '';

    if (records.length === 0) {
        table.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    table.style.display = 'table';
    empty.style.display = 'none';

    records.forEach(r => {
        const tr = document.createElement('tr');

        const nameTd = document.createElement('td');
        nameTd.className = 'var-name';
        nameTd.textContent = r.name;

        const typeTd = document.createElement('td');
        typeTd.className = 'var-type';
        typeTd.textContent = r.type;

        const valueTd = document.createElement('td');
        valueTd.className = 'var-value';
        valueTd.textContent = r.preview;
        valueTd.title = r.preview;

        // Give the experimental cache entry a subtle marker color
        if (r.name === 'package_cache_info') {
            nameTd.style.color = 'var(--text-faint)';
        }

        tr.appendChild(nameTd);
        tr.appendChild(typeTd);
        tr.appendChild(valueTd);
        tbody.appendChild(tr);
    });
}

// Inline onclick attributes in the HTML need these on window,
// since everything above lives inside this DOMContentLoaded closure.
Object.assign(window, {
    toggleTheme, exportNotebookJson, exportPython, saveHtmlCopy,
    runAllCells, runCell, deleteCell, insertCellAbove, insertCellBelow
});

initPyodide();
document.getElementById('addCellBtn').addEventListener('click', () => addCell());
