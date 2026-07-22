
// ---------------- Autocomplete - for now we only use those from common data science packages ----------------
// ---------------- WIP: add functions to look at the methods assigned to the module object and add them to the keywords list -------
const PY_KEYWORDS = ["%pip install", "False","None","True","and","as","assert","async","await","break","class",
    "continue","def","del","elif","else","except","finally","for","from","global","if","import",
    "in","is","lambda","nonlocal","not","or","pass","raise","return","try","while","with","yield"];

const PY_BUILTINS = ["abs","all","any","bool","bytes","dict","dir","enumerate","filter","float",
    "format","getattr","hasattr","int","isinstance","len","list","map","max","min","open","print",
    "range","repr","reversed","round","set","sorted","str","sum","tuple","type","zip"];

const MODULE_MEMBERS = {
    pd: ["DataFrame","Series","read_csv","read_json","concat","merge","to_datetime","date_range",
         "isna","notna","pivot_table","cut","get_dummies","options"],
    np: ["array","arange","zeros","ones","linspace","reshape","mean","median","std","sum","min",
         "max","dot","concatenate","random","nan","where","unique","sort"],
    pl: ["DataFrame","Series","read_csv","concat","col","lit","when"],
    duckdb: ["sql","connect","query","from_df","read_csv"],
    sns: ["scatterplot","lineplot","barplot","histplot","boxplot","heatmap","pairplot","set_theme"],
    plt: ["figure","plot","scatter","bar","hist","xlabel","ylabel","title","legend","show",
          "subplots","savefig"],
    px: ["scatter","line","bar","histogram","box","violin","pie","imshow","density_heatmap",
         "scatter_3d","sunburst","treemap"],
    go: ["Figure","Scatter","Bar","Histogram","Box","Heatmap","Pie","Surface","Layout"]
};

const DF_METHODS = ["head","tail","describe","info","shape","dtypes","columns","values","index",
    "loc","iloc","groupby","merge","join","concat","sort_values","sort_index","drop","dropna",
    "fillna","astype","apply","map","applymap","query","sample","corr","cov","sum","mean","median",
    "std","min","max","count","nunique","value_counts","reset_index","set_index","rename",
    "pivot_table","melt","to_csv","to_json","to_dict","to_numpy","copy","plot","iterrows",
    "itertuples","isna","notna","duplicated","drop_duplicates"];

const ARRAY_METHODS = ["shape","dtype","reshape","flatten","transpose","sum","mean","std","min",
    "max","argmin","argmax","sort","astype","tolist","copy","T"];


// for python autocomplete for standard library AND the chosen default packages
function pythonHint(cm) {
    const cur = cm.getCursor();
    const line = cm.getLine(cur.line);
    const beforeCursor = line.slice(0, cur.ch);

    const dotMatch = /([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z0-9_]*)$/.exec(beforeCursor);
    let candidates = [];
    let from, to, partialText;

    if (dotMatch) {
        const objPath = dotMatch[1];
        partialText = dotMatch[2];
        from = CodeMirror.Pos(cur.line, cur.ch - partialText.length);
        to = CodeMirror.Pos(cur.line, cur.ch);

        if (MODULE_MEMBERS[objPath]) {
            candidates = MODULE_MEMBERS[objPath];
        } else if (pyodide) {
            try {
                const typeName = pyodide.runPython(
                    `type(${objPath}).__name__ if ${JSON.stringify(objPath)} in globals() else ''`
                );
                if (/DataFrame|Series/.test(typeName)) candidates = DF_METHODS;
                else if (/ndarray/.test(typeName)) candidates = ARRAY_METHODS;
            } catch (e) { candidates = []; }
        }
    } else {
        const wordMatch = /[A-Za-z_][A-Za-z0-9_]*$/.exec(beforeCursor);
        partialText = wordMatch ? wordMatch[0] : "";
        from = CodeMirror.Pos(cur.line, cur.ch - partialText.length);
        to = CodeMirror.Pos(cur.line, cur.ch);

        let globalNames = [];
        if (pyodide) {
            try {
                globalNames = JSON.parse(pyodide.runPython("get_completable_names()"));
            } catch (e) { /* pyodide not ready yet */ }
        }
        candidates = [...new Set([...PY_KEYWORDS, ...PY_BUILTINS, ...Object.keys(MODULE_MEMBERS), ...globalNames])];
    }

    const filtered = candidates
        .filter(c => c.toLowerCase().startsWith(partialText.toLowerCase()))
        .sort();

    return { list: filtered, from: from, to: to };
}
CodeMirror.registerHelper('hint', 'python', pythonHint);
