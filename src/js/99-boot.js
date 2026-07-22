
        // ---------------- Pyodide boot ----------------
        async function initPyodide() {
            const statusText = document.getElementById('status-text');
            pyodide = await loadPyodide();
            statusText.textContent = "Installing pandas, numpy, matplotlib, seaborn, duckdb, plotly. This may take a minute or two...";

            await pyodide.loadPackage("micropip");
            const micropip = pyodide.pyimport("micropip");

            // Create the shared data directory (idempotent) and make it the
            // working directory, so plain filenames in cells read/write there.
            try {
                pyodide.FS.mkdir(DATA_DIR);
            } catch (e) { /* already exists */ }
            pyodide.runPython(`import os; os.chdir(${JSON.stringify(DATA_DIR)})`);

            // plotly is pinned to 5.x: plotly.py 6+ serializes arrays as base64
            // "bdata" blobs that the plotly.js 2.x bundle in <head> can't read
            // (figures render as an empty white canvas). 5.24.1 + plotly.js 2.35
            // is a matched pair.
            await micropip.install(["duckdb", "pandas", "numpy", "matplotlib", "seaborn", "openpyxl", "plotly==5.24.1"]);

            // Python State Exporter & result renderer (tables / plots / plotly)
            await pyodide.runPythonAsync(`
                # pyregion file: bootstrap.py

                import json
                import sys
                import pandas as pd
                import numpy as np
                import duckdb
                import seaborn as sns
                import io
                import base64

                import matplotlib
                matplotlib.use("Agg")
                import matplotlib.pyplot as plt

                # Keep a handle on the real stdout so we can restore it after each
                # cell run. While a cell runs, sys.stdout is swapped for a StringIO
                # buffer so print() output can be read back instead of vanishing.
                _original_stdout = sys.stdout

                _IGNORE_GLOBALS = {
                    '__name__', '__doc__', '__package__', '__loader__', '__spec__',
                    '__annotations__', '__builtins__', 'json', 'sys', 'pl', 'io', 'duckdb', 'os',
                    'base64', 'matplotlib', 'plt', 'pd', 'pandas', 'np', 'numpy', 'sns', 'seaborn',
                    'export_state_records', 'render_plot', 'render_result', 'get_completable_names',
                    '_IGNORE_GLOBALS', '_original_stdout', 'start_stdout_capture', 'end_stdout_capture'
                }

                def start_stdout_capture():
                    """Point sys.stdout at a fresh in-memory buffer before running a cell."""
                    sys.stdout = io.StringIO()

                def end_stdout_capture():
                    """Read back everything print() wrote during the cell, then restore stdout."""
                    text = sys.stdout.getvalue()
                    sys.stdout = _original_stdout
                    return text

                def export_state_records():
                    records = []
                    for k in sorted(globals().keys()):
                        if k.startswith('_') or k in _IGNORE_GLOBALS:
                            continue
                        v = globals()[k] # getting the globals...
                        t = type(v).__name__
                        tstr = str(type(v))
                        try:
                            if isinstance(v, str):
                                preview = v if len(v) <= 60 else v[:57] + "..."
                            elif 'plotly' in tstr:
                                preview = "<Plotly Figure>"
                            elif 'matplotlib.figure.Figure' in tstr:
                                preview = "<Figure>"
                            elif 'matplotlib.axes' in tstr:
                                preview = "<Axes>"
                            elif 'io.' in tstr:
                                preview = "<File Stream>"
                            elif 'duckdb' in tstr:
                                preview = "<DuckDB Connection/Relation>"
                            elif hasattr(v, 'shape'):
                                preview = f"shape={tuple(v.shape)}"
                            elif isinstance(v, (list, tuple, set)):
                                preview = f"{t}, len={len(v)}"
                            elif isinstance(v, dict):
                                preview = f"dict, {len(v)} keys"
                            else:
                                s = str(v)
                                preview = s if len(s) <= 60 else s[:57] + "..."
                        except Exception:
                            preview = "<unable to preview>"
                        records.append({"name": k, "type": t, "preview": preview})
                    return json.dumps(records)

                def get_completable_names():
                    return json.dumps([k for k in globals().keys() if not k.startswith('_') and k not in _IGNORE_GLOBALS])

                def render_plot(obj):
                    """Extracts the underlying figure whether it's an Axes (Pandas) or Figure (Matplotlib)."""
                    if 'matplotlib.axes' in str(type(obj)):
                        fig = obj.get_figure()
                    elif 'matplotlib.figure.Figure' in str(type(obj)):
                        fig = obj
                    else:
                        return None

                    buf = io.BytesIO()
                    fig.savefig(buf, format='png', bbox_inches='tight')
                    buf.seek(0)
                    plt.close() # necessary or visual bugs...
                    return "data:image/png;base64," + base64.b64encode(buf.read()).decode('utf-8')

                def render_result(obj):
                    """Single dispatch for a cell's final expression: decides whether
                    it becomes an interactive plotly figure, a matplotlib image, an
                    HTML table (pandas / duckdb via .df()), or plain text."""
                    try:
                        tstr = str(type(obj))
                        if 'plotly' in tstr and hasattr(obj, 'to_json'):
                            return json.dumps({"kind": "plotly", "spec": obj.to_json()})
                        if 'matplotlib.axes' in tstr or 'matplotlib.figure.Figure' in tstr:
                            src = render_plot(obj)
                            if src:
                                return json.dumps({"kind": "image", "src": src})
                        # DuckDB relations materialize to a pandas DataFrame first
                        if 'duckdb' in tstr and hasattr(obj, 'df'):
                            obj = obj.df()
                        if hasattr(obj, '_repr_html_'):
                            html = obj._repr_html_()
                            if isinstance(html, str) and html.strip():
                                return json.dumps({"kind": "html", "html": html})
                    except Exception:
                        pass
                    try:
                        text = str(obj)
                    except Exception:
                        text = "<unprintable object>"
                    return json.dumps({"kind": "text", "text": text})

                # endpyregion
            `);

            document.getElementById('status').style.display = 'none';
            //document.getElementById('csvFileInput').disabled = false;
            //document.getElementById('excelFileInput').disabled = false;
            document.getElementById('loadNotebookInput').disabled = false;
            document.getElementById('importPythonInput').disabled = false;
            document.getElementById('runAllBtn').disabled = false;
            document.getElementById('uploadFilesBtn').disabled = false;
            document.getElementById('addCellBtn').style.display = 'flex';

            updateCacheBadge(); // publishes package_cache_info into globals if enabled

            // If this file was produced by "Save Copy", restore its embedded cells
            // (and their saved outputs — no re-running needed).
            const embedded = getEmbeddedNotebook();
            if (embedded) {
                restoreDataFiles(embedded.files); // rehydrate saved data/ files first
                loadCellsFromList(embedded.cells);
            } else {
                const starterCode = `import pandas as pd
import numpy as np

# Create a random timeseries
df = pd.DataFrame(
    np.random.randn(100, 2), 
    columns=['Series A', 'Series B']
).cumsum()

# Pandas .plot() returns a Matplotlib Axes object. 
# Just leave it at the end of the cell and the canvas will render it!
df.plot(title="Pandas Built-in Plotting", figsize=(7, 4))`;
                addCell(starterCode);
            }

            rebuildTOC();
            updateStateInspector();
            refreshFilePanel(); // render the Files panel's empty state
            maybeOfferRestore(); // offer autosaved work from this browser, if any
        }
