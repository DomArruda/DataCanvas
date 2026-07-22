# Data Canvas

**A self-contained, browser-based data science notebook.**

Data Canvas runs real Python (via [Pyodide](https://pyodide.org/)) entirely in your browser. No server, no install, no Jupyter kernel — just open the single HTML file.

It is designed for exploratory analysis, teaching, sharing reproducible notebooks, and lightweight data work when you don’t want (or can’t) spin up a full environment.

---

## Features

### Execution
- Full Python runtime in the browser (Pyodide)
- Pre-installed: `pandas`, `numpy`, `matplotlib`, `seaborn`, `duckdb`, `plotly` (5.24.1), `openpyxl`
- Install additional packages on the fly with `%pip install package-name` (or the legacy `install("pkg")`)
- Last expression in a cell is automatically displayed
- DataFrames render as interactive tables
- Matplotlib / Seaborn / pandas plots render as images
- Plotly figures are experimental for now

### Notebook experience
- Code cells + Markdown cells (`%%markdown` at the top of a cell)
- Syntax highlighting and autocomplete (CodeMirror)
- `Shift+Enter` runs and advances; `Ctrl/Cmd+Enter` runs in place
- Hover a cell to insert above / below
- Live **Memory Inspector** showing all Python globals
- Table of Contents built automatically from Markdown headings
- Dark / light theme (persists)

### Data & files
- Everything runs inside a virtual `data/` folder
- Upload CSV, Excel, JSON, Parquet, or text files
- Write files the normal way (`df.to_csv("out.csv")`, DuckDB `COPY … TO`, etc.) and they appear in the Files panel with download buttons
- Optional “Store data in notebook” — embeds files into Save Copy so the notebook travels with its data

### Persistence & sharing
- Autosaves as you type (localStorage)
- **Save Copy** downloads a standalone `.html` (or `.capy-canvas.html`) with cells *and their outputs* baked in — open it later and everything is restored, no re-running required
- Export as Notebook JSON or a clean Python script (`# %%` cell markers, compatible with jupytext / VS Code)
- Import Notebook (`.json` / `.html`) or Python script (`.py`)

### Performance
- Experimental package cache (IndexedDB) — after the first load, subsequent loads are much faster
- Clear cache button if packages ever misbehave

---

## Quick start

1. Open `data_canvas.html` (or any Save Copy) in a modern browser.
2. Wait for the status bar to disappear (“Loading the Python runtime…” → packages install).
3. Start typing in a cell and hit `Shift+Enter`.

No backend, no login, no internet after the first load (if package cache is enabled).
