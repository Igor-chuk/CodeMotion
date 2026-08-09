import { parentPort } from "worker_threads";
import * as oxc from "oxc-parser";

type OxcLang = "js" | "jsx" | "ts" | "tsx" | "dts";

interface Position {
    line: number;
    column: number;
}

interface Diagnostic {
    message: string;
    category: string;
    from: number;
    to: number;
    line: number;
    col: number;
}

interface DiagnosticMessage {
    id?: any;
    code?: string;
    lang?: string;
    isTS?: boolean;
}

const OXC_LANGUAGES = new Set<string>(["js", "jsx", "ts", "tsx", "dts"]);

function normalizeLanguage(language: any, fallback: OxcLang = "js"): OxcLang {
    const normalized = String(language || "").trim().toLowerCase().replace(/^\./, "");
    if (OXC_LANGUAGES.has(normalized)) return normalized as OxcLang;
    if (["mjs", "cjs", "es6"].includes(normalized)) return "js";
    if (["mts", "cts"].includes(normalized)) return "ts";
    return fallback;
}

function getDiagnostics(code: any, language: any = "js"): Diagnostic[] {
    const lang = normalizeLanguage(language);
    const source = typeof code === "string" ? code : "";

    try {
        const result = oxc.parseSync(`file.${lang}`, source, {
            lang,
            sourceType: "unambiguous",
            showSemanticErrors: true,
        });
        const lineTable = buildLineTable(source);
        return (result.errors || []).map((error: any) => formatError(error, source, lineTable));
    } catch (error) {
        return [formatThrownError(error, source)];
    }
}

function buildLineTable(code: string): number[] {
    const table = [0];
    for (let index = 0; index < code.length; index++) {
        if (code[index] === "\n") table.push(index + 1);
    }
    return table;
}

function offsetToLoc(offset: number, lineTable: number[]): Position {
    let low = 0;
    let high = lineTable.length - 1;

    while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (lineTable[middle] <= offset) low = middle;
        else high = middle - 1;
    }

    return { line: low + 1, column: offset - lineTable[low] };
}

function formatError(error: any, code: string, lineTable: number[]): Diagnostic {
    const label = (error.labels || []).find((candidate: any) =>
        Number.isInteger(candidate?.start) && Number.isInteger(candidate?.end)
    );
    const start = clampOffset(label?.start, code.length);
    const end = clampOffset(label?.end, code.length);
    const loc = offsetToLoc(start, lineTable);

    const safeEnd = Math.max(end, start + 1);

    return {
        message: error.message || label?.message || "Syntax error",
        category: severityToCategory(error.severity),
        from: start,
        to: safeEnd,
        line: loc.line,
        col: loc.column,
    };
}

function formatThrownError(error: any, code: string): Diagnostic {
    return {
        message: error?.message || "Unable to parse source",
        category: "Error",
        from: 0,
        to: Math.max(1, code.length),
        line: 1,
        col: 0,
    };
}

function clampOffset(offset: any, length: number): number {
    if (!Number.isInteger(offset)) return 0;
    return Math.min(Math.max(offset, 0), length);
}

function severityToCategory(severity: any): string {
    switch (severity) {
        case "Warning": return "Warning";
        case "Advice": return "Suggestion";
        case "Error":
        default: return "Error";
    }
}

parentPort?.on("message", ({ id, code, lang, isTS = false }: DiagnosticMessage = {}) => {
    const diagnostics = getDiagnostics(code, lang || (isTS ? "ts" : "js"));
    parentPort?.postMessage({ id, diagnostics });
});

export { getDiagnostics, normalizeLanguage };
