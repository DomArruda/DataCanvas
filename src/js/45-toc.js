
// ---------------- Contents panel ----------------
function rebuildTOC() {
    const tocList = document.getElementById('toc-list');
    const tocEmpty = document.getElementById('toc-empty');
    tocList.innerHTML = '';
    let count = 0;

    document.querySelectorAll('#cells-wrapper .cell').forEach(cellDiv => {
        const cm = editors[cellDiv.id];
        if (!cm) return;
        const code = cm.getValue();
        const m = code.match(MARKDOWN_MAGIC);
        if (!m) return;

        let inFence = false;
        code.slice(m[0].length).split('\n').forEach(line => {
            if (/^\s*```/.test(line)) { inFence = !inFence; return; }
            if (inFence) return;
            const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
            if (!h) return;
            count++;
            const li = document.createElement('li');
            li.className = 'toc-item toc-h' + h[1].length;
            li.textContent = h[2].replace(/[*_`]/g, '');
            li.title = li.textContent;
            li.addEventListener('click', () => {
                cellDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            tocList.appendChild(li);
        });
    });

    tocEmpty.style.display = count ? 'none' : 'block';
}

function scheduleTocRebuild() {
    clearTimeout(tocTimer);
    tocTimer = setTimeout(rebuildTOC, 500);
}
