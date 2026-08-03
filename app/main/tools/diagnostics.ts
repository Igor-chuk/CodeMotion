import { ipcMain, IpcMainInvokeEvent } from "electron"
import { Worker } from "worker_threads"
import path from "path"

type DiagnosticResult = unknown[]
type DiagnosticLanguage = "js" | "jsx" | "ts" | "tsx" | "dts"
type WorkerKey = "js" | "ts" | "typecheck"

type WorkerMap = Record<WorkerKey, Worker>
type PendingMap = Record<WorkerKey, Map<number, (value: DiagnosticResult) => void>>
type WorkerResponse = { id?: number, diagnostics?: DiagnosticResult }

let nextRequestId = 0

function normalizeLanguage(language: unknown, fallback: DiagnosticLanguage): DiagnosticLanguage {
    const normalized = String(language || "").trim().toLowerCase().replace(/^\./, "")
    if (["js", "jsx", "ts", "tsx", "dts"].includes(normalized)) {
        return normalized as DiagnosticLanguage
    }
    if (["mjs", "cjs", "es6"].includes(normalized)) return "js"
    if (["mts", "cts"].includes(normalized)) return "ts"
    return fallback
}

function createWorker(fileName: string): Worker {
    return new Worker(path.join(__dirname, "js-ts", fileName))
}

const workers: WorkerMap = {
    js: createWorker("diagnosticWorker.js"),
    ts: createWorker("diagnosticWorker.js"),
    typecheck: createWorker("typeCheckWorker.js"),
}

const pending: PendingMap = {
    js: new Map(),
    ts: new Map(),
    typecheck: new Map(),
}

function resolvePending(workerKey: WorkerKey, id: number | undefined, diagnostics: DiagnosticResult) {
    if (id === undefined) return
    const resolve = pending[workerKey].get(id)
    if (!resolve) return
    pending[workerKey].delete(id)
    resolve(diagnostics)
}

function rejectAllPending(workerKey: WorkerKey) {
    for (const resolve of pending[workerKey].values()) resolve([])
    pending[workerKey].clear()
}

for (const workerKey of ["js", "ts", "typecheck"] as const) {
    workers[workerKey].on("message", (response: WorkerResponse) => {
        resolvePending(workerKey, response?.id, response?.diagnostics || [])
    })
    workers[workerKey].on("error", (error: Error) => {
        console.error(`${workerKey} diagnostics worker error:`, error)
        rejectAllPending(workerKey)
    })
    workers[workerKey].on("exit", (code: number) => {
        if (code !== 0) console.error(`${workerKey} diagnostics worker exited with code ${code}`)
        rejectAllPending(workerKey)
    })
}

function requestDiagnostics(workerKey: "js" | "ts", code: string, lang: DiagnosticLanguage): Promise<DiagnosticResult> {
    const id = ++nextRequestId
    return new Promise(resolve => {
        pending[workerKey].set(id, resolve)
        workers[workerKey].postMessage({ id, code, lang })
    })
}

function requestTypeCheck(fileName: string, code: string): Promise<DiagnosticResult> {
    const id = ++nextRequestId
    return new Promise(resolve => {
        pending.typecheck.set(id, resolve)
        workers.typecheck.postMessage({ id, fileName, code })
    })
}

ipcMain.handle(
    "javascript-diagnostic",
    (_event: IpcMainInvokeEvent, code: string, language?: unknown): Promise<DiagnosticResult> => {
        const lang = normalizeLanguage(language, "js")
        return requestDiagnostics("js", code, lang)
    }
)

ipcMain.handle(
    "typescript-diagnostic",
    (_event: IpcMainInvokeEvent, code: string, language?: unknown): Promise<DiagnosticResult> => {
        const lang = normalizeLanguage(language, "ts")
        return requestDiagnostics("ts", code, lang)
    }
)

ipcMain.handle(
    "ts-type-check",
    (_event: IpcMainInvokeEvent, code: string, filePath: string): Promise<DiagnosticResult> => {
        return requestTypeCheck(filePath, code)
    }
)