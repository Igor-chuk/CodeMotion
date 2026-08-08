const { ipcMain } = require("electron")

const MAX_DIAGNOSTICS = 200
const FLOW_OPEN = new Set(["[", "{"])

function buildLineTable(code) {
    const table = [0]
    for (let i = 0; i < code.length; i++) {
        if (code[i] === "\n") table.push(i + 1)
    }
    return table
}

function offsetToLoc(offset, table) {
    let low = 0
    let high = table.length - 1
    while (low < high) {
        const middle = (low + high + 1) >> 1
        if (table[middle] <= offset) low = middle
        else high = middle - 1
    }
    return { line: low + 1, col: offset - table[low] }
}

function stripComment(text) {
    let inSingle = false
    let inDouble = false
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (ch === '"' && !inSingle) inDouble = !inDouble
        else if (ch === "'" && !inDouble) inSingle = !inSingle
        else if (ch === "#" && !inSingle && !inDouble) {
            if (i === 0 || text[i - 1] === " " || text[i - 1] === "\t") return text.slice(0, i)
        }
    }
    return text
}

function findKeyColon(content) {
    let inSingle = false
    let inDouble = false
    let depth = 0
    for (let i = 0; i < content.length; i++) {
        const ch = content[i]
        if (ch === '"' && !inSingle) inDouble = !inDouble
        else if (ch === "'" && !inDouble) inSingle = !inSingle
        else if (!inSingle && !inDouble) {
            if (ch === "[" || ch === "{") depth++
            else if (ch === "]" || ch === "}") depth--
            else if (ch === ":" && depth === 0) {
                const next = content[i + 1]
                if (next === undefined || next === " " || next === "\t") return i
            }
        }
    }
    return -1
}

function unquote(text) {
    const trimmed = text.trim()
    if (trimmed.length >= 2) {
        const first = trimmed[0]
        const last = trimmed[trimmed.length - 1]
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return trimmed.slice(1, -1)
        }
    }
    return trimmed
}

function balanceFlow(code, start) {
    let depth = 0
    let i = start
    let inSingle = false
    let inDouble = false

    while (i < code.length) {
        const ch = code[i]
        if (inDouble) {
            if (ch === "\\") { i += 2; continue }
            if (ch === '"') inDouble = false
            i++
            continue
        }
        if (inSingle) {
            if (ch === "'") {
                if (code[i + 1] === "'") { i += 2; continue }
                inSingle = false
            }
            i++
            continue
        }
        if (ch === '"') { inDouble = true; i++; continue }
        if (ch === "'") { inSingle = true; i++; continue }
        if (ch === "#" && (i === start || code[i - 1] === " " || code[i - 1] === "\t" || code[i - 1] === "\n")) {
            while (i < code.length && code[i] !== "\n") i++
            continue
        }
        if (ch === "[" || ch === "{") { depth++; i++; continue }
        if (ch === "]" || ch === "}") {
            depth--
            i++
            if (depth === 0) return { closed: true, end: i }
            continue
        }
        i++
    }
    return { closed: false, end: i }
}

class YAMLLinter {
    constructor(code) {
        this.code = typeof code === "string" ? code : ""
        this.table = buildLineTable(this.code)
        this.errors = []
        this.lines = this.preprocess()
    }

    report(message, from, to, category = "Error") {
        if (this.errors.length >= MAX_DIAGNOSTICS) return
        const start = Math.min(Math.max(from, 0), this.code.length)
        const end = Math.min(Math.max(to, start + 1), Math.max(this.code.length, start + 1))
        const loc = offsetToLoc(start, this.table)
        this.errors.push({ message, category, from: start, to: end, line: loc.line, col: loc.col })
    }

    preprocess() {
        const rawLines = this.code.split("\n")
        const lines = []
        let offset = 0

        for (let index = 0; index < rawLines.length; index++) {
            const raw = rawLines[index]
            const lineStart = offset
            offset += raw.length + 1

            let ws = 0
            while (ws < raw.length && (raw[ws] === " " || raw[ws] === "\t")) ws++

            const leading = raw.slice(0, ws)
            const tabIndex = leading.indexOf("\t")
            const content = stripComment(raw.slice(ws)).replace(/\s+$/, "")

            lines.push({
                index,
                line: index + 1,
                lineStart,
                indent: ws,
                contentStart: lineStart + ws,
                content,
                tabAbs: tabIndex >= 0 ? lineStart + tabIndex : -1,
            })
        }
        return lines
    }

    isSkippable(content) {
        return content.length === 0 ||
            content === "---" ||
            content === "..." ||
            content.startsWith("%")
    }

    makeNode(line, content, contentStart) {
        if (content === "-" || content.startsWith("- ") || content.startsWith("-\t")) {
            const remainder = content.slice(1).replace(/^\s+/, "")
            const remainderStart = contentStart + (content.length - remainder.length)
            const node = { type: "Item", index: 0, line: line.line, endLine: line.line, children: [], keys: new Map() }

            if (remainder.length > 0) {
                const inner = this.makeNode(line, remainder, remainderStart)
                node.inner = inner
                if (inner.type === "Pair") {
                    node.children.push(inner)
                    node.keys.set(inner.key, inner)
                }
            }
            return node
        }

        const colon = findKeyColon(content)
        if (colon >= 0) {
            const key = unquote(content.slice(0, colon))
            const value = content.slice(colon + 1).trim()
            return {
                type: "Pair",
                key,
                value,
                valueStart: this.flowStart(content, colon, contentStart),
                line: line.line,
                endLine: line.line,
                children: [],
                keys: new Map(),
            }
        }

        return { type: "Scalar", value: content, line: line.line, endLine: line.line, children: [], keys: new Map() }
    }

    flowStart(content, colon, contentStart) {
        let i = colon + 1
        while (i < content.length && (content[i] === " " || content[i] === "\t")) i++
        if (FLOW_OPEN.has(content[i])) return contentStart + i
        return -1
    }

    build() {
        const root = { type: "Document", line: 1, endLine: this.lines.length || 1, children: [], keys: new Map(), indent: -1 }
        const stack = [root]

        for (const line of this.lines) {
            if (line.tabAbs >= 0) {
                this.report("Tab characters are not allowed for indentation", line.tabAbs, line.tabAbs + 1)
            }
            if (this.isSkippable(line.content)) continue

            while (stack.length > 1 && stack[stack.length - 1].indent >= line.indent) stack.pop()
            const parent = stack[stack.length - 1]

            const node = this.makeNode(line, line.content, line.contentStart)
            node.indent = line.indent

            if (node.type === "Item") {
                node.index = parent.children.filter(child => child.type === "Item").length
            }

            if (node.type === "Pair") {
                if (parent.keys.has(node.key) && node.key.length > 0) {
                    this.report(`Duplicate key ${JSON.stringify(node.key)}`, line.contentStart, line.contentStart + node.key.length, "Warning")
                }
                parent.keys.set(node.key, node)
            }

            if (node.valueStart >= 0) {
                const flow = balanceFlow(this.code, node.valueStart)
                if (!flow.closed) {
                    this.report(`Unclosed flow collection ${JSON.stringify(this.code[node.valueStart])}`, node.valueStart, node.valueStart + 1)
                }
            }

            parent.children.push(node)
            stack.push(node)
        }

        this.finalize(root)
        return root
    }

    finalize(node) {
        let end = node.line
        for (const child of node.children) {
            this.finalize(child)
            if (child.endLine > end) end = child.endLine
        }
        node.endLine = end
    }

    toAst(node) {
        const base = {
            type: node.type,
            loc: { start: { line: node.line }, end: { line: node.endLine } },
        }
        if (node.type === "Pair") base.key = node.key
        if (node.type === "Pair") base.value = node.value
        if (node.type === "Item") base.index = node.index
        if (node.type === "Scalar") base.value = node.value
        base.children = node.children.map(child => this.toAst(child))
        return base
    }
}

function diagnostics(code) {
    const linter = new YAMLLinter(code)
    linter.build()
    return linter.errors
}

function ast(code) {
    const linter = new YAMLLinter(code)
    const root = linter.build()
    return linter.toAst(root)
}

ipcMain.handle("yaml-diagnostic", (_event, code) => {
    try {
        return diagnostics(code)
    } catch (error) {
        console.error("YAML diagnostics error:", error)
        return []
    }
})

ipcMain.handle("yaml-ast", (_event, code) => {
    try {
        return ast(code)
    } catch (error) {
        console.error("YAML AST error:", error)
        return { type: "Document", loc: null, children: [] }
    }
})

module.exports = { diagnostics, ast }
