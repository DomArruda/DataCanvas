
// ---------------- UI: Cells ----------------
// The cell list is the DOM itself — cells-wrapper's children in document
// order are the linked list. addCell supports insertion before/after any
// node; execution, save, export, and the TOC all read document order.
function addCell(defaultCode = "", refCellId = null, position = null) {
    cellCount++;
    const cellId = `cell-${cellCount}`;
    const textareaId = `textarea-${cellCount}`;

    const cellHtml = `
        <div class="cell" id="${cellId}">
            <button class="insert-btn top" onclick="insertCellAbove('${cellId}')" title="Insert cell above">+</button>
            <button class="insert-btn bottom" onclick="insertCellBelow('${cellId}')" title="Insert cell below">+</button>
            <textarea id="${textareaId}"></textarea>

            <div class="cell-actions">
                <div class="action-group">
                    <button class="btn btn-run" onclick="runCell('${cellId}')">
                        <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 1.2v9.6L10.4 6z"/></svg>
                        Run
                    </button>
                </div>
                <button class="btn btn-del" onclick="deleteCell('${cellId}')">Delete</button>
            </div>

            <div class="output"></div>
            <div class="plot-container"><img src="" alt="Matplotlib Plot"></div>
            <div class="plotly-container"><div class="plotly-target"></div></div>
            <div class="table-output"></div>
            <div class="markdown-output" title="Double-click to edit"></div>
        </div>
    `;

    const ref = refCellId ? document.getElementById(refCellId) : null;
    if (ref && position === 'before') {
        ref.insertAdjacentHTML('beforebegin', cellHtml);
    } else if (ref && position === 'after') {
        ref.insertAdjacentHTML('afterend', cellHtml);
    } else {
        document.getElementById('cells-wrapper').insertAdjacentHTML('beforeend', cellHtml);
    }

    const textarea = document.getElementById(textareaId);
    textarea.value = defaultCode; // set via .value so HTML in markdown/code isn't parsed

    const cm = CodeMirror.fromTextArea(textarea, {
        mode: isMarkdownCode(defaultCode) ? "markdown" : "python",
        theme: currentTheme, lineNumbers: true, indentUnit: 4, viewportMargin: Infinity,
        extraKeys: {
            "Shift-Enter": function() { runCellAndAdvance(cellId); },
            "Ctrl-Enter": function() { runCell(cellId); },
            "Cmd-Enter": function() { runCell(cellId); },
            "Ctrl-Space": function(instance) {
                if (instance.getOption("mode") !== "python") return;
                CodeMirror.showHint(instance, CodeMirror.hint.python, { completeSingle: false });
            }
        }
    });
    cm.on("inputRead", function(instance, changeObj) {
        if (instance.getOption("mode") !== "python") return;
        if (changeObj.text && changeObj.text[0] === ".") {
            CodeMirror.showHint(instance, CodeMirror.hint.python, { completeSingle: false });
        }
    });
    // Re-check the mode on every edit (adding/removing %%markdown), keep
    // the Contents panel in sync, and autosave as the user types.
    cm.on("change", function(instance) {
        syncCellMode(instance);
        scheduleTocRebuild();
        scheduleAutosave();
    });
    editors[cellId] = cm;

    // Double-click a rendered markdown cell to get the editor back
    document.getElementById(cellId).querySelector('.markdown-output')
        .addEventListener('dblclick', () => showEditorForCell(cellId));

    return cellId;
}

// Linked-list insertions, exposed on the hover handles.
function insertCellAbove(cellId) {
    const id = addCell("", cellId, 'before');
    editors[id].focus();
    scheduleAutosave();
}
function insertCellBelow(cellId) {
    const id = addCell("", cellId, 'after');
    editors[id].focus();
    scheduleAutosave();
}

function deleteCell(cellId) {
    document.getElementById(cellId).remove();
    delete editors[cellId];
    delete lastOutputs[cellId];
    rebuildTOC();
    scheduleAutosave();
}

// Jupyter-style Shift+Enter: run, then focus the next cell (creating one
// at the end of the notebook if there isn't one).
async function runCellAndAdvance(cellId) {
    await runCell(cellId);
    const cells = Array.from(document.querySelectorAll('#cells-wrapper .cell'));
    const idx = cells.findIndex(c => c.id === cellId);
    let nextId = (idx >= 0 && idx < cells.length - 1) ? cells[idx + 1].id : null;
    if (!nextId) nextId = addCell();
    const nextCm = editors[nextId];
    const nextCell = document.getElementById(nextId);
    if (nextCell) nextCell.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Focus the editor unless it's a rendered markdown cell
    if (nextCm && nextCm.getWrapperElement().style.display !== 'none') nextCm.focus();
}
