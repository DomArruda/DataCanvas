
// ---------------- Markdown cell helpers ----------------
function isMarkdownCode(code) {    // MARKDOWN_MAGIC is of type RegExp. It's test method will return false if not markdown...
    return MARKDOWN_MAGIC.test(code);
}

// Keep CodeMirror's syntax mode in sync with the cell's content:
// "%%markdown" at the top => markdown highlighting, otherwise Python.
function syncCellMode(cm) {
    const wantsMarkdown = isMarkdownCode(cm.getValue()); // get value of the cm
    const target = wantsMarkdown ? "markdown" : "python"; // only support python and markdown.
    if (cm.getOption("mode") !== target) cm.setOption("mode", target);
    return wantsMarkdown;
}

// Render a %%markdown cell into its book-page view. Returns true if the
// cell was markdown (and was rendered), false otherwise.
function renderMarkdownCell(cellId) {
    const cell = document.getElementById(cellId);
    const cm = editors[cellId]; // editors is a JSON object/hashmap
    if (!cell || !cm) return false;
    const code = cm.getValue();
    const m = code.match(MARKDOWN_MAGIC);
    if (!m) return false;

    const mdContainer = cell.querySelector('.markdown-output');
    mdContainer.innerHTML = sanitizeHtml(marked.parse(code.slice(m[0].length))); // making sure that the HTML is sanitized...
    cell.querySelector('.output').style.display = 'none';
    cell.querySelector('.plot-container').style.display = 'none';
    cell.querySelector('.plotly-container').style.display = 'none';
    cell.querySelector('.table-output').style.display = 'none';
    mdContainer.style.display = 'block';
    cm.getWrapperElement().style.display = 'none';
    cell.classList.add('md-rendered');
    return true;
}

function showEditorForCell(cellId) {
    const cell = document.getElementById(cellId);
    if (!cell || !editors[cellId]) return;
    cell.querySelector('.markdown-output').style.display = 'none';
    cell.classList.remove('md-rendered');
    const cm = editors[cellId];
    cm.getWrapperElement().style.display = '';
    cm.refresh();
    cm.focus();
}
