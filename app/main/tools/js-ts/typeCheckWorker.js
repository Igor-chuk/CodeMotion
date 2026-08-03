const { parentPort } = require("worker_threads");
const ts = require("typescript");
const path = require("path");
const fs = require("fs");

const scriptVersions = new Map();
const scriptContents = new Map();

function findTsconfig(startDir) {
    const configPath = ts.findConfigFile(startDir, ts.sys.fileExists, "tsconfig.json");
    if (!configPath) return null;
    const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
    if (error) return null;
    return ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(configPath));
}

let projectRoot = process.cwd();
let parsedConfig = findTsconfig(projectRoot);

const defaultCompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: true,
    checkJs: true,
    strict: false,
    skipLibCheck: true,
    esModuleInterop: true,
    resolveJsonModule: true,
};

const compilerOptions = {
    ...defaultCompilerOptions,
    ...(parsedConfig?.options || {}),
    allowJs: true,
    checkJs: true,
};
const rootFiles = parsedConfig?.fileNames || [];

const host = {
    getScriptFileNames: () => Array.from(new Set([...rootFiles, ...scriptVersions.keys()])),
    getScriptVersion: (fileName) => String(scriptVersions.get(fileName) ?? 0),
    getScriptSnapshot: (fileName) => {
        const override = scriptContents.get(fileName);
        if (override !== undefined) return ts.ScriptSnapshot.fromString(override);
        if (!fs.existsSync(fileName)) return undefined;
        return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, "utf8"));
    },
    getCurrentDirectory: () => projectRoot,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (fileName) => scriptContents.has(fileName) || ts.sys.fileExists(fileName),
    readFile: (fileName) => scriptContents.get(fileName) ?? ts.sys.readFile(fileName),
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    readDirectory: ts.sys.readDirectory,
    realpath: ts.sys.realpath,
};

const languageService = ts.createLanguageService(host, ts.createDocumentRegistry());

function buildLineTable(code) {
    const table = [0];
    for (let i = 0; i < code.length; i++) if (code[i] === "\n") table.push(i + 1);
    return table;
}

function offsetToLoc(offset, lineTable) {
    let low = 0, high = lineTable.length - 1;
    while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (lineTable[mid] <= offset) low = mid; else high = mid - 1;
    }
    return { line: low + 1, column: offset - lineTable[low] };
}

function categoryToString(category) {
    switch (category) {
        case ts.DiagnosticCategory.Error: return "Error";
        case ts.DiagnosticCategory.Warning: return "Warning";
        default: return "Suggestion";
    }
}

function formatDiagnostic(diagnostic, lineTable) {
    const start = diagnostic.start ?? 0;
    const length = diagnostic.length ?? 1;
    const loc = offsetToLoc(start, lineTable);

    return {
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        category: categoryToString(diagnostic.category),
        from: start,
        to: start + length,
        line: loc.line,
        col: loc.column,
        code: diagnostic.code,
    };
}

function checkFile(fileName, code) {
    scriptContents.set(fileName, code);
    scriptVersions.set(fileName, (scriptVersions.get(fileName) ?? 0) + 1);

    const lineTable = buildLineTable(code);
    const diagnostics = [
        ...languageService.getSyntacticDiagnostics(fileName),
        ...languageService.getSemanticDiagnostics(fileName),
    ];

    return diagnostics.map((d) => formatDiagnostic(d, lineTable));
}

parentPort.on("message", ({ id, fileName, code } = {}) => {
    try {
        const diagnostics = checkFile(fileName, code);
        parentPort.postMessage({ id, diagnostics });
    } catch (error) {
        parentPort.postMessage({ id, diagnostics: [] });
    }
});