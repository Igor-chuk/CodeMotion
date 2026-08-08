const { ipcMain } = require("electron")

const STRUCTURAL = {
    "{": "lbrace",
    "}": "rbrace",
    "[": "lbracket",
    "]": "rbracket",
    ":": "colon",
    ",": "comma",
}

const WORDS = new Set(["true", "false", "null"])
const MAX_DIAGNOSTICS = 200

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

class JSONLinter {
    constructor(code) {
        this.code = typeof code === "string" ? code : ""
        this.length = this.code.length
        this.table = buildLineTable(this.code)
        this.errors = []
        this.tokens = []
        this.index = 0
    }

    report(message, from, to, category = "Error") {
        if (this.errors.length >= MAX_DIAGNOSTICS) return
        const start = Math.min(Math.max(from, 0), this.length)
        const end = Math.min(Math.max(to, start + 1), Math.max(this.length, start + 1))
        const loc = offsetToLoc(start, this.table)
        this.errors.push({ message, category, from: start, to: end, line: loc.line, col: loc.col })
    }

    tokenize() {
        let i = 0
        const code = this.code
        const length = this.length

        while (i < length) {
            const ch = code[i]

            if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
                i++
                continue
            }

            if (ch === "/") {
                const next = code[i + 1]
                if (next === "/") {
                    const start = i
                    i += 2
                    while (i < length && code[i] !== "\n") i++
                    this.report("Comments are not allowed in JSON", start, i)
                    continue
                }
                if (next === "*") {
                    const start = i
                    i += 2
                    while (i < length && !(code[i] === "*" && code[i + 1] === "/")) i++
                    i = i < length ? i + 2 : length
                    this.report("Comments are not allowed in JSON", start, i)
                    continue
                }
            }

            if (ch in STRUCTURAL) {
                this.tokens.push({ type: STRUCTURAL[ch], value: ch, start: i, end: i + 1 })
                i++
                continue
            }

            if (ch === '"') {
                i = this.readString(i)
                continue
            }

            if (ch === "'") {
                i = this.readSingleQuoted(i)
                continue
            }

            if (ch === "-" || (ch >= "0" && ch <= "9")) {
                i = this.readNumber(i)
                continue
            }

            if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_" || ch === "$") {
                i = this.readWord(i)
                continue
            }

            this.report(`Unexpected character ${JSON.stringify(ch)}`, i, i + 1)
            this.tokens.push({ type: "invalid", value: ch, start: i, end: i + 1 })
            i++
        }

        this.tokens.push({ type: "eof", value: "", start: length, end: length })
    }

    readString(start) {
        const code = this.code
        const length = this.length
        let i = start + 1
        let value = ""

        while (i < length) {
            const ch = code[i]

            if (ch === "\n") {
                this.report("Unterminated string", start, i)
                this.tokens.push({ type: "string", value, start, end: i, terminated: false })
                return i
            }

            if (ch === "\\") {
                const escape = code[i + 1]
                if (escape === undefined) {
                    this.report("Unterminated string", start, i + 1)
                    this.tokens.push({ type: "string", value, start, end: i + 1, terminated: false })
                    return i + 1
                }
                if ("\"\\/bfnrt".includes(escape)) {
                    value += escape
                    i += 2
                    continue
                }
                if (escape === "u") {
                    const hex = code.slice(i + 2, i + 6)
                    if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
                        this.report("Invalid unicode escape sequence", i, i + 2)
                    } else {
                        value += String.fromCharCode(parseInt(hex, 16))
                    }
                    i += 6
                    continue
                }
                this.report(`Invalid escape sequence \\${escape}`, i, i + 2)
                i += 2
                continue
            }

            if (ch === '"') {
                i++
                this.tokens.push({ type: "string", value, start, end: i, terminated: true })
                return i
            }

            const codePoint = ch.charCodeAt(0)
            if (codePoint < 0x20) {
                this.report("Control characters must be escaped in strings", i, i + 1)
            }

            value += ch
            i++
        }

        this.report("Unterminated string", start, length)
        this.tokens.push({ type: "string", value, start, end: length, terminated: false })
        return length
    }

    readSingleQuoted(start) {
        const code = this.code
        const length = this.length
        let i = start + 1
        let value = ""

        while (i < length && code[i] !== "'" && code[i] !== "\n") {
            value += code[i]
            i++
        }
        const end = code[i] === "'" ? i + 1 : i

        this.report("Single-quoted strings are not allowed in JSON, use double quotes", start, end)
        this.tokens.push({ type: "string", value, start, end, terminated: code[i] === "'" })
        return end
    }

    readNumber(start) {
        const code = this.code
        const length = this.length
        let i = start
        while (i < length && !(code[i] in STRUCTURAL) && !" \t\n\r".includes(code[i])) i++

        const raw = code.slice(start, i)
        if (!/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(raw)) {
            this.report(`Invalid number ${JSON.stringify(raw)}`, start, i)
        }

        this.tokens.push({ type: "number", value: raw, start, end: i })
        return i
    }

    readWord(start) {
        const code = this.code
        const length = this.length
        let i = start
        while (i < length && /[A-Za-z0-9_$]/.test(code[i])) i++

        const raw = code.slice(start, i)
        if (WORDS.has(raw)) {
            this.tokens.push({ type: raw, value: raw, start, end: i })
        } else {
            this.report(`Unexpected token ${JSON.stringify(raw)}`, start, i)
            this.tokens.push({ type: "invalid", value: raw, start, end: i })
        }
        return i
    }

    peek() {
        return this.tokens[this.index]
    }

    next() {
        const token = this.tokens[this.index]
        if (this.index < this.tokens.length - 1) this.index++
        return token
    }

    parse() {
        this.tokenize()

        const first = this.peek()
        if (first.type === "eof") return null

        const value = this.parseValue()

        const trailing = this.peek()
        if (trailing.type !== "eof") {
            this.report("Unexpected content after top-level value", trailing.start, trailing.end)
        }

        return value
    }

    parseValue() {
        const token = this.peek()

        switch (token.type) {
            case "lbrace":
                return this.parseObject()
            case "lbracket":
                return this.parseArray()
            case "string":
                this.next()
                return { type: "String", value: token.value, loc: this.locOf(token) }
            case "number":
                this.next()
                return { type: "Number", value: token.value, loc: this.locOf(token) }
            case "true":
            case "false":
                this.next()
                return { type: "Boolean", value: token.type === "true", loc: this.locOf(token) }
            case "null":
                this.next()
                return { type: "Null", value: null, loc: this.locOf(token) }
            case "eof":
                this.report("Unexpected end of input, expected a value", token.start, token.end)
                return null
            default:
                this.report("Expected a value", token.start, token.end)
                this.next()
                return null
        }
    }

    parseObject() {
        const open = this.next()
        const members = []
        const seen = new Set()

        if (this.peek().type === "rbrace") {
            const close = this.next()
            return { type: "Object", members, loc: this.locBetween(open, close) }
        }

        while (true) {
            const keyToken = this.peek()

            if (keyToken.type === "eof") {
                this.report("Unterminated object, expected '}'", open.start, open.end)
                return { type: "Object", members, loc: this.locBetween(open, keyToken) }
            }

            if (keyToken.type === "comma") {
                this.report("Expected property name, found ','", keyToken.start, keyToken.end)
                this.next()
                continue
            }

            if (keyToken.type === "rbrace") {
                this.report("Trailing comma is not allowed", keyToken.start, keyToken.end)
                const close = this.next()
                return { type: "Object", members, loc: this.locBetween(open, close) }
            }

            if (keyToken.type !== "string") {
                if (keyToken.type !== "invalid") {
                    this.report("Property name must be a double-quoted string", keyToken.start, keyToken.end)
                }
                this.next()
            } else {
                this.next()
                if (seen.has(keyToken.value)) {
                    this.report(`Duplicate key ${JSON.stringify(keyToken.value)}`, keyToken.start, keyToken.end, "Warning")
                }
                seen.add(keyToken.value)
            }

            const colon = this.peek()
            if (colon.type === "colon") {
                this.next()
            } else {
                this.report("Expected ':' after property name", colon.start, colon.end)
            }

            const value = this.parseValue()
            members.push({ type: "Property", key: keyToken.value, value, loc: this.locOf(keyToken) })

            const separator = this.peek()
            if (separator.type === "comma") {
                this.next()
                continue
            }
            if (separator.type === "rbrace") {
                const close = this.next()
                return { type: "Object", members, loc: this.locBetween(open, close) }
            }
            if (separator.type === "eof") {
                this.report("Unterminated object, expected '}'", open.start, open.end)
                return { type: "Object", members, loc: this.locBetween(open, separator) }
            }

            this.report("Expected ',' or '}' after property value", separator.start, separator.end)
        }
    }

    parseArray() {
        const open = this.next()
        const elements = []

        if (this.peek().type === "rbracket") {
            const close = this.next()
            return { type: "Array", elements, loc: this.locBetween(open, close) }
        }

        while (true) {
            const token = this.peek()

            if (token.type === "eof") {
                this.report("Unterminated array, expected ']'", open.start, open.end)
                return { type: "Array", elements, loc: this.locBetween(open, token) }
            }

            if (token.type === "rbracket") {
                this.report("Trailing comma is not allowed", token.start, token.end)
                const close = this.next()
                return { type: "Array", elements, loc: this.locBetween(open, close) }
            }

            if (token.type === "comma") {
                this.report("Expected a value, found ','", token.start, token.end)
                this.next()
                continue
            }

            const value = this.parseValue()
            if (value) elements.push(value)

            const separator = this.peek()
            if (separator.type === "comma") {
                this.next()
                continue
            }
            if (separator.type === "rbracket") {
                const close = this.next()
                return { type: "Array", elements, loc: this.locBetween(open, close) }
            }
            if (separator.type === "eof") {
                this.report("Unterminated array, expected ']'", open.start, open.end)
                return { type: "Array", elements, loc: this.locBetween(open, separator) }
            }

            this.report("Expected ',' or ']' after array element", separator.start, separator.end)
        }
    }

    locOf(token) {
        return { start: offsetToLoc(token.start, this.table), end: offsetToLoc(token.end, this.table) }
    }

    locBetween(from, to) {
        return { start: offsetToLoc(from.start, this.table), end: offsetToLoc(to.end, this.table) }
    }
}

function diagnostics(code) {
    const linter = new JSONLinter(code)
    linter.parse()
    return linter.errors
}

function ast(code) {
    const linter = new JSONLinter(code)
    const body = linter.parse()
    return { type: "Document", body, loc: { start: { line: 1, col: 0 }, end: offsetToLoc(linter.length, linter.table) } }
}

ipcMain.handle("json-diagnostic", (_event, code) => {
    try {
        return diagnostics(code)
    } catch (error) {
        console.error("JSON diagnostics error:", error)
        return []
    }
})

ipcMain.handle("json-ast", (_event, code) => {
    try {
        return ast(code)
    } catch (error) {
        console.error("JSON AST error:", error)
        return { type: "Document", body: null, loc: null }
    }
})

module.exports = { diagnostics, ast }
