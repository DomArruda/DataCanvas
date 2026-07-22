// ---------------- Persistent preferences (guarded: some locked-down
// or private-browsing modes block storage — fail soft, never break) ----
function readPref(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}
function writePref(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* no-op */ }
}
