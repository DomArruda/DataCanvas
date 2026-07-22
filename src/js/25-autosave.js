
// ---------------- Autosave (localStorage, keyed per file path so
// different chapter files never clobber each other) ----------------
const AUTOSAVE_KEY = "dc-autosave:" + (location.pathname || "canvas");

function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(doAutosave, 1500);
}
function doAutosave() {
    const payload = { ts: Date.now(), cells: collectCellsRich() };
    try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
    } catch (e) {
        // Quota exceeded (plots are heavy) — fall back to code only,
        // which is the part that can't be regenerated.
        try {
            localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ts: Date.now(), cells: collectCells() }));
        } catch (e2) { /* storage blocked entirely — nothing to do */ }
    }
}
function maybeOfferRestore() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || "null"); } catch (e) { return; }
    if (!saved || !Array.isArray(saved.cells) || !saved.cells.length) return;

    const savedCodes = JSON.stringify(saved.cells.map(c => (typeof c === "string") ? c : (c && c.code) || ""));
    const currentCodes = JSON.stringify(collectCells());
    if (savedCodes === currentCodes) return; // nothing newer than what's on screen

    const bar = document.getElementById("restoreBar");
    const when = new Date(saved.ts || Date.now()).toLocaleString();
    document.getElementById("restoreText").textContent =
        `Unsaved work from ${when} was found in this browser.`;
    bar.style.display = "flex";
    document.getElementById("restoreBtn").onclick = () => {
        loadCellsFromList(saved.cells);
        bar.style.display = "none";
    };
    document.getElementById("restoreDismissBtn").onclick = () => {
        try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) { /* no-op */ }
        bar.style.display = "none";
    };
}
