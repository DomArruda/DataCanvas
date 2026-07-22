
//

// ---------------- Experimental package cache (IndexedDB) ----------------
// Pyodide and micropip fetch the runtime, stdlib, and every wheel through
// window.fetch. When caching is on, we wrap fetch: for the package CDNs
// below, serve from IndexedDB when possible and store misses on the way
// through. Keys are full URLs — versioned package URLs invalidate
// themselves naturally when a pin changes.
const PKG_CACHE_DOMAINS = ["cdn.jsdelivr.net", "files.pythonhosted.org", "pypi.org"];
const PKG_CACHE_DB = "data-canvas-pkg-cache";
const PKG_CACHE_STORE = "responses";

let cacheEnabled = readPref("dc-pkg-cache") === "1";
let embedFilesEnabled = readPref("dc-embed-files") !== "0"; // default ON
const cacheStats = { hits: 0, stored: 0 };

function cacheDbOpen() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(PKG_CACHE_DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(PKG_CACHE_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
function cacheDbGet(db, key) {
    return new Promise((resolve, reject) => {
        const req = db.transaction(PKG_CACHE_STORE, "readonly").objectStore(PKG_CACHE_STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
function cacheDbPut(db, key, value) {
    return new Promise((resolve, reject) => {
        const req = db.transaction(PKG_CACHE_STORE, "readwrite").objectStore(PKG_CACHE_STORE).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });

}


function cacheDbList() {
    return new Promise((resolve, reject) => {
        cacheDbOpen().then(db => {
            const store = db.transaction(PKG_CACHE_STORE, "readonly").objectStore(PKG_CACHE_STORE);
            const req = store.openCursor();
            const rows = [];
            req.onsuccess = () => {
                const cur = req.result;
                if (!cur) { resolve(rows); return; }
                const v = cur.value || {};
                rows.push({
                    url: String(cur.key),
                    size: (v.buffer && v.buffer.byteLength) || 0,
                    ts: v.ts || 0
                });
                cur.continue();
            };
            req.onerror = () => reject(req.error);
        }).catch(reject);
    });
}

function cacheDbDelete(key) {
    return new Promise((resolve, reject) => {
        cacheDbOpen().then(db => {
            const req = db.transaction(PKG_CACHE_STORE, "readwrite")
                          .objectStore(PKG_CACHE_STORE).delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        }).catch(reject);
    });
}

function isCacheableRequest(url, method) {
    if ((method || "GET").toUpperCase() !== "GET") return false;
    let host = "";
    try { host = new URL(url, location.href).hostname; } catch (e) { return false; }
    return PKG_CACHE_DOMAINS.some(d => host === d || host.endsWith("." + d));
}

// Patch is always installed; the cacheEnabled flag gates behavior so the
// checkbox works live without a reload.
const nativeFetch = window.fetch.bind(window);
window.fetch = async function (input, init) {
    const url = (typeof input === "string") ? input : ((input && input.url) || "");
    const method = (init && init.method) || (input && input.method) || "GET";
    if (!cacheEnabled || !isCacheableRequest(url, method)) {
        return nativeFetch(input, init);
    }
    try {
        const db = await cacheDbOpen();
        const hit = await cacheDbGet(db, url);
        if (hit && hit.buffer) {
            cacheStats.hits++;
            updateCacheBadge();
            // slice() hands out a fresh copy so the stored buffer is never consumed
            return new Response(hit.buffer.slice(0), {
                status: 200,
                headers: { "Content-Type": hit.contentType || "application/octet-stream" }
            });
        }
        const resp = await nativeFetch(input, init);
        if (resp.ok) {
            resp.clone().arrayBuffer()
                .then(buf => cacheDbPut(db, url, {
                    buffer: buf,
                    contentType: resp.headers.get("Content-Type") || "",
                    ts: Date.now()
                }))
                .then(() => { cacheStats.stored++; updateCacheBadge(); })
                .catch(() => { /* storage full or blocked — carry on uncached */ });
        }
        return resp;
    } catch (e) {
        return nativeFetch(input, init); // IndexedDB unavailable — plain fetch
    }
};

function updateCacheBadge() {
    const badge = document.getElementById("cacheBadge");
    badge.textContent = cacheEnabled
        ? `${cacheStats.hits} cached \u00b7 ${cacheStats.stored} stored`
        : "";
    // "(experimental)" marker surfaced in the Python globals / Memory Inspector
    if (pyodide) {
        try {
            if (cacheEnabled) {
                pyodide.globals.set("package_cache_info",
                    `(experimental) IndexedDB package cache \u2014 served ${cacheStats.hits} from cache, stored ${cacheStats.stored} this session`);
            } else {
                pyodide.runPython("globals().pop('package_cache_info', None)");
            }
        } catch (e) { /* pyodide mid-boot — badge alone is fine */ }
    }
}

const cacheToggle = document.getElementById("pkgCacheToggle");
cacheToggle.checked = cacheEnabled;
cacheToggle.addEventListener("change", () => {
    cacheEnabled = cacheToggle.checked;
    writePref("dc-pkg-cache", cacheEnabled ? "1" : "0");
    updateCacheBadge();
    if (pyodide) updateStateInspector();
});


const embedToggle = document.getElementById("embedFilesToggle");
embedToggle.checked = embedFilesEnabled;
embedToggle.addEventListener("change", (e) => {
    e.stopPropagation();
    embedFilesEnabled = embedToggle.checked;
    writePref("dc-embed-files", embedFilesEnabled ? "1" : "0");
});
// Clicks on the label/checkbox shouldn't collapse the Files <details>
document.getElementById("embedFilesLabel").addEventListener("click", (e) => e.stopPropagation());

document.getElementById("clearCacheBtn").addEventListener("click", () => {
    try { indexedDB.deleteDatabase(PKG_CACHE_DB); } catch (e) { /* no-op */ }
    cacheStats.hits = 0;
    cacheStats.stored = 0;
    updateCacheBadge();
    refreshCacheList();
    document.getElementById("cacheBadge").textContent = "cache cleared";
});
