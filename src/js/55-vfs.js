// ---------------- Virtual filesystem file panel ----------------
// pandas df.to_csv("x.csv")
// duckdb COPY ... TO 'x.json' — anything Python writes lands in
// Emscripten's in-memory FS. Everything runs inside DATA_DIR (created
// at boot, set as the cwd), so we simply list that directory and show
// every recognized data file in the sidebar's Files panel, with
// download buttons and an Upload button for putting files in.
const DATA_FILE_RE = /\.(csv|xlsx|json|parquet)$/i;
const FILE_MIME = {
    csv:     'text/csv',
    json:    'application/json',
    xlsx:    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    parquet: 'application/vnd.apache.parquet'
};

function pyCwd() {
    try { return pyodide.FS.cwd(); } catch (e) { return DATA_DIR; }
}

function listVirtualFiles() {
    const files = [];
    if (!pyodide || !pyodide.FS) return files;
    const dir = pyCwd();
    let names = [];
    try { names = pyodide.FS.readdir(dir); } catch (e) { return files; }
    names.forEach(name => {
        if (name === '.' || name === '..' || !DATA_FILE_RE.test(name)) return;
        try {
            const st = pyodide.FS.stat(dir + '/' + name);
            if (pyodide.FS.isDir(st.mode)) return;
            files.push({ name: name, size: st.size, mtime: Number(st.mtime) });
        } catch (e) { /* unreadable entry — skip */ }
    });
    // Most recently written first
    return files.sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name));
}

function formatBytes(n) {
    if (n === null || n === undefined) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function downloadVirtualFile(name) {
    try {
        const bytes = pyodide.FS.readFile(pyCwd() + '/' + name); // Uint8Array
        const ext = name.split('.').pop().toLowerCase();
        downloadBlob(bytes, name, FILE_MIME[ext] || 'application/octet-stream');
    } catch (e) {
        alert('Could not read ' + name + ' from the virtual filesystem \u2014 it may have been deleted or the runtime was restarted.');
    }
}


function deleteVirtualFile(name) {
    if (!confirm('Delete ' + name + ' from the data folder? This cannot be undone.')) return;
    try {
        pyodide.FS.unlink(pyCwd() + '/' + name);
        refreshFilePanel();
    } catch (e) {
        alert('Could not delete ' + name + ' \u2014 it may have already been removed or the runtime was restarted.');
    }
}

// for creating a zip file. dependency-free for now (no real compression.)
function crc32(bytes) {
    let c, crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
        c = (crc ^ bytes[i]) & 0xFF;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;

}

// ---- Minimal ZIP writer (store method, no compression) ----
function zipFiles(entries) {
    // entries: [{ name: string, bytes: Uint8Array }]
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;

    const u16 = n => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
    const u32 = n => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);

    entries.forEach(({ name, bytes }) => {
        const nameBytes = enc.encode(name);
        const crc = crc32(bytes);
        const size = bytes.length;

        // Local file header
        const local = [
            u32(0x04034b50),      // signature
            u16(20),              // version needed
            u16(0),               // flags
            u16(0),               // method 0 = store
            u16(0), u16(0),       // mod time / date (left 0)
            u32(crc),
            u32(size),            // compressed size
            u32(size),            // uncompressed size
            u16(nameBytes.length),
            u16(0),               // extra len
            nameBytes,
            bytes
        ];
        local.forEach(c => chunks.push(c));

        // Central directory record (kept for the end)
        central.push([
            u32(0x02014b50),      // signature
            u16(20), u16(20),     // version made by / needed
            u16(0), u16(0),       // flags / method
            u16(0), u16(0),       // time / date
            u32(crc),
            u32(size), u32(size),
            u16(nameBytes.length),
            u16(0), u16(0),       // extra / comment len
            u16(0), u16(0),       // disk # / internal attrs
            u32(0),               // external attrs
            u32(offset),          // local header offset
            nameBytes
        ]);

        offset += local.reduce((s, c) => s + c.length, 0);
    });

    const cdStart = offset;
    central.forEach(rec => rec.forEach(c => { chunks.push(c); offset += c.length; }));
    const cdSize = offset - cdStart;

    // End of central directory
    [
        u32(0x06054b50),
        u16(0), u16(0),                       // disk numbers
        u16(entries.length), u16(entries.length),
        u32(cdSize), u32(cdStart),
        u16(0)                                // comment len
    ].forEach(c => chunks.push(c));

    // Flatten
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    chunks.forEach(c => { out.set(c, p); p += c.length; });
    return out;
}

function downloadAllFilesAsZip() {
    const files = listVirtualFiles();
    if (!files.length) { alert('No files in data/ to zip.'); return; }

    const payload = {};
    files.forEach(f => {
        payload[f.name] = pyodide.FS.readFile(pyCwd() + '/' + f.name); // Uint8Array
    });

    // level 6 = balanced; use 0 for store (fast, no compression)
    fflate.zip(payload, { level: 6 }, (err, data) => {
        if (err) { alert('Zip failed: ' + err); return; }
        downloadBlob(data, 'data_canvas_files.zip', 'application/zip');
    });
}



function refreshFilePanel() {
    const list = document.getElementById('file-list');
    const empty = document.getElementById('files-empty');
    if (!list) return;
    const files = listVirtualFiles();
    list.innerHTML = '';
    if (!files.length) {
        list.style.display = 'none';
        empty.style.display = 'block';
        return;
    }
    list.style.display = 'block';
    empty.style.display = 'none';
    files.forEach(f => {
        const row = document.createElement('div');
        row.className = 'file-row';

        const info = document.createElement('div');
        info.className = 'file-info';
        const nm = document.createElement('div');
        nm.className = 'file-name';
        nm.textContent = f.name;
        const meta = document.createElement('div');
        meta.className = 'file-meta';
        meta.textContent = formatBytes(f.size) + ' \u00b7 ' + new Date(f.mtime).toLocaleTimeString();
        info.appendChild(nm);
        info.appendChild(meta);

         const btn = document.createElement('button');
        btn.className = 'btn btn-slate file-dl';
        btn.title = 'Download ' + f.name;
        btn.textContent = '\u2913';
        btn.addEventListener('click', () => downloadVirtualFile(f.name));

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-slate file-dl';
        delBtn.title = 'Delete ' + f.name;
        delBtn.textContent = '\u2715';
        delBtn.style.marginLeft = '6px';
        delBtn.addEventListener('click', () => deleteVirtualFile(f.name));

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.flex = '0 0 auto';
        btnGroup.appendChild(btn);
        btnGroup.appendChild(delBtn);

        row.appendChild(info);
        row.appendChild(btnGroup);
        list.appendChild(row);
    });
}


// Show the cache contents as filename + size. Full URLs are set as the
// row's title only; buffers are never read or rendered.
function refreshCacheList() {
    const list = document.getElementById('cache-list');
    const empty = document.getElementById('cache-empty');
    if (!list) return;
    cacheDbList().then(rows => {
        list.innerHTML = '';
        if (!rows.length) {
            list.style.display = 'none';
            empty.style.display = 'block';
            empty.textContent = 'Nothing cached yet.';
            return;
        }
        rows.sort((a, b) => b.size - a.size);
        const total = rows.reduce((s, r) => s + r.size, 0);

        list.style.display = 'block';
        empty.style.display = 'none';
        rows.forEach(r => {
            let label = r.url;
            try { label = new URL(r.url).pathname.split('/').pop() || r.url; } catch (e) { /* keep raw */ }

            const row = document.createElement('div');
            row.className = 'file-row';
            row.title = r.url;                 // textContent/title only — never innerHTML

            const info = document.createElement('div');
            info.className = 'file-info';
            const nm = document.createElement('div');
            nm.className = 'file-name';
            nm.textContent = label;
            const meta = document.createElement('div');
            meta.className = 'file-meta';
            meta.textContent = formatBytes(r.size);
            info.appendChild(nm);
            info.appendChild(meta);
            const delBtn = document.createElement('button');
            delBtn.className = 'btn btn-slate file-dl';
            delBtn.title = 'Remove ' + label + ' from the cache';
            delBtn.textContent = '\u2715';
            delBtn.addEventListener('click', () => {
                if (!confirm('Remove ' + label + ' from the package cache?\n\nIt will be re-downloaded on the next load that needs it.')) return;
                cacheDbDelete(r.url)
                    .then(refreshCacheList)
                    .catch(() => alert('Could not remove ' + label + ' from the cache.'));
            });

            row.appendChild(info);
            row.appendChild(delBtn);
            list.appendChild(row);
            
        });

        const totalRow = document.createElement('div');
        totalRow.className = 'file-row';
        totalRow.style.fontWeight = '700';
        totalRow.textContent = `${rows.length} files \u00b7 ${formatBytes(total)}`;
        list.appendChild(totalRow);
    }).catch(() => {
        list.style.display = 'none';
        empty.style.display = 'block';
        empty.textContent = 'Cache unavailable in this browser.';
    });
}

document.getElementById('refreshCacheListBtn').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    refreshCacheList();
});
document.getElementById('cacheSection').addEventListener('toggle', function () {
    if (this.open) refreshCacheList();
});

// Both buttons live inside the <summary>, so plain clicks would also
// toggle the section open/closed — preventDefault suppresses that.
document.getElementById('refreshFilesBtn').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    refreshFilePanel();
});

document.getElementById('uploadFilesBtn').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('dataFileUpload').click();
});

// ZIP DOWNLOAD - WIP
document.getElementById("downloadZipBtn").style.display = "none";

/*

document.getElementById('downloadZipBtn').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    downloadAllFilesAsZip();
});
*/
