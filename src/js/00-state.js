const PRISTINE_HTML = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;

let pyodide;
let cellCount = 0;
const editors = {};
const lastOutputs = {};   // cellId -> archived output object (see runCell)
let currentTheme = "dracula"; // CodeMirror theme, mirrors light/dark mode (starts in dark mode)
let tocTimer = null;
let autosaveTimer = null;

const MARKDOWN_MAGIC = /^\s*%%markdown\b[^\n]*\n?/;  // we look out for the %%markdown in a cell to make sure that we know how to render it as such...
const STYLE_TAG = /<style[\s\S]*?<\/style>/gi; // strip library CSS from _repr_html_ so the theme wins
const DATA_DIR = "/home/pyodide/data"; // shared data folder — created at boot, becomes the Python cwd

// Every piece of third-party or file-derived HTML (rendered markdown,
// table reprs, outputs restored from opened files) passes through here
// before touching innerHTML. Fails CLOSED: if DOMPurify didn't load,
// content is escaped to plain text rather than injected raw.
function sanitizeHtml(html) { // SANITIZE HTML; THE WHOLE POINT IS THAT WE RUN CODE BUT FOR SAFETY REASONS.
    if (window.DOMPurify) {
        return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    }
    const d = document.createElement('div');
    d.textContent = html;
    return d.innerHTML;
}
