import { ipcMain, IpcMainInvokeEvent } from "electron"

interface Loc {
    start: { line: number }
    end: { line: number }
}

interface PyNode {
    type: string
    line: number
    endLine: number
    indent: number
    children: PyNode[]
    name?: string
    params?: string
    returns?: string
    bases?: string
    keyword?: string
    names?: string[]
}

interface PyAst {
    type: string
    loc: Loc
    name?: string
    params?: string
    returns?: string
    bases?: string
    keyword?: string
    names?: string[]
    children: PyAst[]
}

interface ScanState {
    inTriple: string | null
    depth: number
}

const CONTAINER_TYPES = new Set(["ClassDef", "FunctionDef", "AsyncFunctionDef", "Block"])
const BLOCK_KEYWORDS = new Set(["if", "elif", "else", "for", "while", "with", "try", "except", "finally", "match", "case"])

function countIndent(line: string): number {
    let i = 0
    while (i < line.length && (line[i] === " " || line[i] === "\t")) i++
    return i
}

function scanLine(line: string, state: ScanState): { code: string; backslash: boolean } {
    let code = ""
    let i = 0
    const n = line.length

    while (i < n) {
        if (state.inTriple) {
            const close = line.indexOf(state.inTriple, i)
            if (close === -1) return { code, backslash: false }
            i = close + 3
            state.inTriple = null
            continue
        }

        const ch = line[i]

        if (ch === "#") break

        if (ch === '"' || ch === "'") {
            const triple = line.slice(i, i + 3)
            if (triple === '"""' || triple === "'''") {
                state.inTriple = triple
                i += 3
                const close = line.indexOf(triple, i)
                if (close === -1) return { code, backslash: false }
                i = close + 3
                state.inTriple = null
                continue
            }

            const quote = ch
            i++
            while (i < n) {
                if (line[i] === "\\") { i += 2; continue }
                if (line[i] === quote) { i++; break }
                i++
            }
            continue
        }

        if (ch === "(" || ch === "[" || ch === "{") { state.depth++; code += ch; i++; continue }
        if (ch === ")" || ch === "]" || ch === "}") { if (state.depth > 0) state.depth--; code += ch; i++; continue }

        code += ch
        i++
    }

    return { code, backslash: line.replace(/\s+$/, "").endsWith("\\") }
}

function signature(content: string): { params: string; rest: string } {
    const open = content.indexOf("(")
    if (open < 0) return { params: "", rest: content }

    let depth = 0
    let close = -1
    for (let i = open; i < content.length; i++) {
        const c = content[i]
        if (c === "(") depth++
        else if (c === ")") {
            depth--
            if (depth === 0) { close = i; break }
        }
    }

    if (close < 0) return { params: content.slice(open + 1).replace(/\s+/g, " ").replace(/,\s*$/, "").trim(), rest: "" }
    return {
        params: content.slice(open + 1, close).replace(/\s+/g, " ").trim(),
        rest: content.slice(close + 1),
    }
}

function returnType(rest: string): string {
    const arrow = rest.indexOf("->")
    if (arrow < 0) return ""
    let value = rest.slice(arrow + 2)
    const colon = value.lastIndexOf(":")
    if (colon >= 0) value = value.slice(0, colon)
    return value.replace(/\s+/g, " ").trim()
}

function importNames(rest: string): string[] {
    return rest
        .split(",")
        .map(part => part.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean)
}

function classify(content: string, line: number, indent: number): PyNode | null {
    const base = { line, endLine: line, indent, children: [] as PyNode[] }

    const classMatch = content.match(/^class\s+([A-Za-z_]\w*)/)
    if (classMatch) {
        const { params } = signature(content.slice(classMatch[0].length))
        return { type: "ClassDef", name: classMatch[1], bases: params, ...base }
    }

    const asyncDefMatch = content.match(/^async\s+def\s+([A-Za-z_]\w*)/)
    if (asyncDefMatch) {
        const { params, rest } = signature(content)
        return { type: "AsyncFunctionDef", name: asyncDefMatch[1], params, returns: returnType(rest), ...base }
    }

    const defMatch = content.match(/^def\s+([A-Za-z_]\w*)/)
    if (defMatch) {
        const { params, rest } = signature(content)
        return { type: "FunctionDef", name: defMatch[1], params, returns: returnType(rest), ...base }
    }

    if (/^import\s+/.test(content)) {
        const names = importNames(content.replace(/^import\s+/, ""))
        return { type: "Import", name: names.join(", "), names, ...base }
    }

    const fromMatch = content.match(/^from\s+(\S+)\s+import\s+(.*)$/)
    if (fromMatch) {
        return { type: "Import", name: fromMatch[1], names: importNames(fromMatch[2]), ...base }
    }

    const keywordMatch = content.match(/^([A-Za-z_]\w*)/)
    if (keywordMatch && BLOCK_KEYWORDS.has(keywordMatch[1])) {
        return { type: "Block", keyword: keywordMatch[1], ...base }
    }

    const assignNames = assignmentTargets(content)
    if (assignNames.length) {
        return { type: "Assignment", name: assignNames.join(", "), names: assignNames, ...base }
    }

    return null
}

function assignmentTargets(content: string): string[] {
    let depth = 0
    let eq = -1
    for (let i = 0; i < content.length; i++) {
        const ch = content[i]
        if (ch === "(" || ch === "[" || ch === "{") depth++
        else if (ch === ")" || ch === "]" || ch === "}") depth--
        else if (ch === "=" && depth === 0) {
            const prev = content[i - 1]
            const next = content[i + 1]
            if (next === "=") { i++; continue }
            if (prev && "=<>!+-*/%&|^:@~".includes(prev)) continue
            eq = i
            break
        }
    }
    if (eq < 0) return []

    let lhs = content.slice(0, eq)
    const annotation = lhs.indexOf(":")
    if (annotation >= 0) lhs = lhs.slice(0, annotation)

    const names: string[] = []
    for (const part of lhs.split(",")) {
        const match = part.trim().match(/^([A-Za-z_]\w*)/)
        if (match) names.push(match[1])
    }
    return names
}

class PythonParser {
    code: string

    constructor(code: unknown) {
        this.code = typeof code === "string" ? code : ""
    }

    build(): PyNode {
        const lines = this.code.split("\n")
        const root: PyNode = { type: "Module", line: 1, endLine: lines.length || 1, indent: -1, children: [] }
        const stack: PyNode[] = [root]
        const state: ScanState = { inTriple: null, depth: 0 }
        let continuation = false
        let lastContentLine = 0

        for (let idx = 0; idx < lines.length; idx++) {
            const physical = lines[idx]
            const wasContinuation = continuation || state.inTriple !== null || state.depth > 0
            const indent = countIndent(physical)

            const { code, backslash } = scanLine(physical, state)
            continuation = backslash

            const content = code.trim()

            if (wasContinuation) {
                if (content) lastContentLine = idx + 1
                continue
            }
            if (!content) continue

            const prevContentLine = lastContentLine
            lastContentLine = idx + 1

            while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
                const popped = stack.pop() as PyNode
                popped.endLine = Math.max(popped.endLine, prevContentLine)
            }

            const node = classify(content, idx + 1, indent)
            if (!node) continue

            stack[stack.length - 1].children.push(node)
            if (CONTAINER_TYPES.has(node.type)) stack.push(node)
        }

        while (stack.length > 1) {
            const popped = stack.pop() as PyNode
            popped.endLine = Math.max(popped.endLine, lastContentLine)
        }

        return root
    }

    toAst(node: PyNode): PyAst {
        const result: PyAst = {
            type: node.type,
            loc: { start: { line: node.line }, end: { line: node.endLine } },
            children: node.children.map(child => this.toAst(child)),
        }
        if (node.name !== undefined) result.name = node.name
        if (node.params !== undefined) result.params = node.params
        if (node.returns !== undefined) result.returns = node.returns
        if (node.bases !== undefined) result.bases = node.bases
        if (node.keyword !== undefined) result.keyword = node.keyword
        if (node.names !== undefined) result.names = node.names
        return result
    }
}

function ast(code: unknown): PyAst {
    const parser = new PythonParser(code)
    return parser.toAst(parser.build())
}

ipcMain.handle("python-ast", (_event: IpcMainInvokeEvent, code: unknown): PyAst | { type: string; loc: null; children: never[] } => {
    try {
        return ast(code)
    } catch (error) {
        console.error("Python AST error:", error)
        return { type: "Module", loc: null, children: [] }
    }
})

export { ast }
