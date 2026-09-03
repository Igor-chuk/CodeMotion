export class Console {
    constructor(windowClass, startPath = null) {
        this.console = windowClass
        this.body = windowClass.winContent

        const fitAddon = new FitAddon.FitAddon()

        this.term = new Terminal(
            { 
                convertEol: true,
                cursorBlink: true,
                fontFamily: "Consolas, monospace",
                fontSize: 14
            }
        )

        this.term.loadAddon(fitAddon)
        this.term.open(this.body)
        this.fitAddon = fitAddon
        this.handleResize = () => this.fit()
        this.disposed = false
        this.fitFrame = null
        this.isPanelResizing = false
        this.handlePanelResizeStart = () => {
            this.isPanelResizing = true
        }
        this.handlePanelResizeEnd = () => {
            this.isPanelResizing = false
            this.fit()
        }

        this.fit()
        this.resizeObserver = new ResizeObserver(() => this.fit())
        this.resizeObserver.observe(this.body)
        window.addEventListener("resize", this.handleResize)
        this.console.win.addEventListener("bottom-window-resize-start", this.handlePanelResizeStart)
        this.console.win.addEventListener("bottom-window-resize-end", this.handlePanelResizeEnd)
        
        this.buffer = ""
        this.cursor = 0
        this.history = []
        this.historyIndex = -1
        this.cwd = this.toDir(startPath) || ""
        this.isWaitingForOutput = false
        this.tabMatches = []
        this.tabIndex = -1
        this.tabPrefix = ""

        this.customCommandDescriptions = {
            fs: "Fullscreen mode",
            "-fs": "Disable fullscreen",
            "?": "All custom CodeMotion Terminal commands",
            "cmexit": "Alias for exit command",
            "clear": "Clear the terminal screen",
            "cls": "Alias for clear"
        }
        this.customCommands = {
            "fs": () => { 
                this.console.fullscreen(); 
                this.console.show(); 
                this.term.writeln("CodeMotion: \x1b[1;30mFullscreen on\x1b[0m")
            },
            "-fs": () => { 
                this.console.fullscreen(false); 
                this.console.show(); 
                this.term.writeln("CodeMotion: \x1b[1;30mFullscreen off\x1b[0m")
            },
            "?": () => {
                Object.keys(this.customCommands).forEach(c => {
                    this.term.writeln(`${c} \x1b[1;30m${this.customCommandDescriptions[c]}\x1b[0m`)
                })
            },
            "cmexit": () => {
                if(this.isWaitingForOutput) {
                    this.isWaitingForOutput = false
                    window.electron?.killProcess?.()
                    this.term.writeln("\x1b[1;30mProcess terminated\x1b[0m")
                    this.prompt()
                } else {
                    this.term.writeln("\x1b[1;30mNo active process to exit\x1b[0m")
                }
            },
            "clear": () => {
                this.term.write("\x1b[2J\x1b[3J\x1b[H")
                this.term.write(`${this.cwd} $ `)
                return true
            },
            "cls": () => {
                return this.customCommands["clear"]()
            }
        }

        this.prompt()
        this.registerEvents()
        this.setupIPC()
        this.console.onHide(() => this.dispose())
    }

    toDir(p) {
        if (!p) return ""
        if (p.endsWith("/") || p.endsWith("\\")) return p
        const lastSlash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"))
        if (lastSlash <= 0) return p
        const lastSegment = p.substring(lastSlash + 1)
        if (lastSegment.includes(".")) return p.substring(0, lastSlash)
        return p
    }

    fit() {
        if (this.disposed) return
        if (this.isPanelResizing) return
        if (this.fitFrame) return

        this.fitFrame = requestAnimationFrame(() => {
            this.fitFrame = null
            if (this.disposed) return
            this.fitAddon?.fit()
        })
    }

    prompt() {
        this.term.write(`\r\n${this.cwd} $ `)
    }

    registerEvents() {
        this.term.attachCustomKeyEventHandler((e) => {
            if (e.ctrlKey && e.shiftKey && e.code === "KeyC") {
                const selection = this.term.getSelection()
                if (selection) navigator.clipboard.writeText(selection)
                return false
            }
            if (e.ctrlKey && e.shiftKey && e.code === "KeyV") {
                navigator.clipboard.readText().then(text => {
                    if (text) {
                        const clean = text.replace(/[\r\n]+/g, " ")
                        if (this.isWaitingForOutput) {
                            this.buffer += clean
                            this.term.write(clean)
                        } else {
                            this.insertAtCursor(clean)
                        }
                    }
                }).catch(() => {})
                return false
            }
            return true
        })
        this.term.onData(data => this.handleInput(data))
    }

    handleInput(data) {
        const code = data.charCodeAt(0)

        if(code === 3) { 
            if(this.isWaitingForOutput) {
                this.term.write("^C\r\n")
                window.electron?.killProcess?.()
                this.isWaitingForOutput = false
            } else if(this.buffer.length > 0) {
                this.term.write("^C\r\n")
                this.buffer = ""
                this.cursor = 0
            }
            this.prompt()
            return
        }

        if(code === 22) {
            navigator.clipboard.readText().then(text => {
                if (text) {
                    const clean = text.replace(/[\r\n]+/g, " ")
                    if (this.isWaitingForOutput) {
                        this.buffer += clean
                        this.term.write(clean)
                    } else {
                        this.insertAtCursor(clean)
                    }
                }
            }).catch(() => {})
            return
        }

        if(code === 13) {
            this.term.write("\r\n")
            this.tabMatches = []
            this.tabIndex = -1
            this.cursor = 0

            if(this.isWaitingForOutput) {
                const input = this.buffer + "\n"
                console.log(`[Console] Sending input: "${input}"`)
                window.electron?.sendInput?.(input)
                this.buffer = ""
                return
            }
            
            const trimmedBuffer = this.buffer.trim()
            
            if(!trimmedBuffer) {
                this.prompt()
                return
            }

            const firstWord = trimmedBuffer.split(/\s+/)[0]
            
            if(this.customCommands[firstWord]) {
                const handledPrompt = this.customCommands[firstWord]()
                this.history.push(trimmedBuffer)
                this.historyIndex = this.history.length
                this.buffer = ""
                if(handledPrompt !== true) this.prompt()
            } else {
                const cdMatch = trimmedBuffer.match(/^cd\s+(.*)$/i)
                if (cdMatch) {
                    const isWin = /^[a-zA-Z]:/.test(this.cwd) || this.cwd.includes("\\")
                    const sep = isWin ? "\\" : "/"
                    const root = isWin ? "C:\\" : "/"
                    const rawTarget = cdMatch[1].trim()
                    const isAbsolute = /^[a-zA-Z]:[\\/]/.test(rawTarget) || rawTarget.startsWith("/") || rawTarget.startsWith("\\")
                    const target = rawTarget.replace(/[\\/]+$/, "")
                    let newPath = this.cwd
                    if (target === "..") {
                        const parts = this.cwd.replace(/[\\/]+$/, "").split(/[\\/]/)
                        parts.pop()
                        newPath = parts.join(sep) || root
                    } else if (isAbsolute) {
                        newPath = target || root
                    } else if (target === "" || target === ".") {
                        newPath = this.cwd
                    } else {
                        newPath = this.cwd.replace(/[\\/]+$/, "") + sep + target
                    }
                    this.history.push(trimmedBuffer)
                    this.historyIndex = this.history.length
                    this.buffer = ""
                    window.electron.readDirTree(newPath, { maxDepth: 0 }).then(res => {
                        if (res) {
                            this.cwd = newPath
                        } else {
                            this.term.writeln(`\x1b[31mcd: no such file or directory: ${target}\x1b[0m`)
                        }
                        this.prompt()
                    }).catch(() => {
                        this.term.writeln(`\x1b[31mcd: no such file or directory: ${target}\x1b[0m`)
                        this.prompt()
                    })
                } else {
                    this.history.push(trimmedBuffer)
                    this.historyIndex = this.history.length
                    this.buffer = ""
                    this.isWaitingForOutput = true
                    window.electron?.sendCommand?.({ cmd: trimmedBuffer, cwd: this.cwd })
                }
            }
            return
        }

        if (this.isWaitingForOutput) {
            if (code === 127) {
                if (this.buffer.length > 0) {
                    this.buffer = this.buffer.slice(0, -1)
                    this.term.write("\b \b")
                }
                return
            }
            this.buffer += data
            this.term.write(data)
            window.electron?.sendInput?.(data)
            return
        }

        if (code === 127) {
            this.backspaceAtCursor()
            return
        }

        if (data === '\x1B[A') {
            if(this.historyIndex > 0) this.replaceBuffer(this.history[--this.historyIndex])
            return
        }
        if (data === '\x1B[B') {
            if(this.historyIndex < this.history.length - 1) this.replaceBuffer(this.history[++this.historyIndex])
            else { this.historyIndex = this.history.length; this.replaceBuffer("") }
            return
        }
        if (data === '\x1B[D') { this.moveLeft(); return }
        if (data === '\x1B[C') { this.moveRight(); return }
        if (data === '\x1B[H' || data === '\x1B[1~') { this.moveToStart(); return }
        if (data === '\x1B[F' || data === '\x1B[4~') { this.moveToEnd(); return }
        if (data === '\x1B[3~') { this.deleteAtCursor(); return }
        if (code === 1) { this.moveToStart(); return }
        if (code === 5) { this.moveToEnd(); return }

        if (data === '\t') {
            this.autocomplete()
            return
        }

        if (code === 27 || code < 32) return

        this.insertAtCursor(data)
        this.tabMatches = []
        this.tabIndex = -1
    }

    moveLeft() {
        if (this.cursor > 0) {
            this.cursor--
            this.term.write('\x1b[D')
        }
    }

    moveRight() {
        if (this.cursor < this.buffer.length) {
            this.cursor++
            this.term.write('\x1b[C')
        }
    }

    moveToStart() {
        if (this.cursor > 0) {
            this.term.write(`\x1b[${this.cursor}D`)
            this.cursor = 0
        }
    }

    moveToEnd() {
        const diff = this.buffer.length - this.cursor
        if (diff > 0) {
            this.term.write(`\x1b[${diff}C`)
            this.cursor = this.buffer.length
        }
    }

    insertAtCursor(text) {
        const after = this.buffer.slice(this.cursor)
        this.buffer = this.buffer.slice(0, this.cursor) + text + after
        this.cursor += text.length
        this.term.write(text + after)
        if (after.length) this.term.write(`\x1b[${after.length}D`)
    }

    backspaceAtCursor() {
        if (this.cursor === 0) return
        const after = this.buffer.slice(this.cursor)
        this.buffer = this.buffer.slice(0, this.cursor - 1) + after
        this.cursor--
        this.term.write('\b' + after + ' ' + `\x1b[${after.length + 1}D`)
    }

    deleteAtCursor() {
        if (this.cursor >= this.buffer.length) return
        const after = this.buffer.slice(this.cursor + 1)
        this.buffer = this.buffer.slice(0, this.cursor) + after
        this.term.write(after + ' ' + `\x1b[${after.length + 1}D`)
    }

    replaceBuffer(str) {
        this.moveToEnd()
        while(this.buffer.length) {
            this.term.write('\b \b')
            this.buffer = this.buffer.slice(0, -1)
        }
        this.buffer = str
        this.cursor = str.length
        this.term.write(str)
    }

    async autocomplete() {
        const commands = Object.keys(this.customCommands)
        const parts = this.buffer.split(/\s+/)
        const lastPart = parts[parts.length - 1] || ""

        if (this.tabMatches.length > 0) {
            this.tabIndex = (this.tabIndex + 1) % this.tabMatches.length
            const completed = this.tabMatches[this.tabIndex]
            if (parts.length <= 1 && commands.includes(completed)) {
                this.replaceBuffer(completed + " ")
            } else {
                parts[parts.length - 1] = this.tabPrefix_path + completed
                this.replaceBuffer(parts.join(" "))
            }
            return
        }

        let dir = this.cwd
        let pathPrefix = ""
        if (lastPart.includes("/") || lastPart.includes("\\")) {
            const lastSlash = Math.max(lastPart.lastIndexOf("/"), lastPart.lastIndexOf("\\"))
            pathPrefix = lastPart.substring(0, lastSlash + 1)
            const relDir = lastPart.substring(0, lastSlash) || lastPart.substring(0, 1)
            dir = (relDir.includes(":\\") || relDir.startsWith("/")) ? relDir : this.cwd + "\\" + relDir
        }

        try {
            const res = await window.electron.readDirTree(dir, { maxDepth: 0 })
            if (!res || !Array.isArray(res)) return

            const entries = res.map(e => typeof e === "string" ? e : e.name || "")
            const lower = lastPart.toLowerCase()
            const fileMatches = entries.filter(e => e.toLowerCase().startsWith(lastPart.split(/[\\/]/).pop().toLowerCase()))

            if (fileMatches.length === 0) return

            this.tabMatches = fileMatches
            this.tabIndex = 0
            this.tabPrefix_path = pathPrefix

            if (fileMatches.length === 1) {
                parts[parts.length - 1] = pathPrefix + fileMatches[0]
                this.replaceBuffer(parts.join(" "))
            } else {
                this.replaceBuffer(pathPrefix + fileMatches[0])
            }
        } catch (e) {}
    }

    parseCommand(cmd) {
        const regex = /(?:[^\s"]+|"[^"]*")+/g
        const args = []
        let match
        while((match = regex.exec(cmd)) !== null) {
            let arg = match[0]
            if(arg.startsWith('"') && arg.endsWith('"')) arg = arg.slice(1,-1)
            args.push(arg)
        }
        return args
    }

    executeCommand(cmd) {
        if (!cmd) return

        const args = this.parseCommand(cmd)
        const command = args.shift()

        if (this.customCommands[command]) {
            this.customCommands[command](...args)
            return
        }

        if(window.electron?.sendCommand) {
            window.electron.sendCommand({ cmd, cwd: this.cwd })
        } else {
            this.term.writeln(`Command not found: ${command}`)
        }
    }

    setupIPC() {
        if(window.electron && window.electron.onCommandResult) {
            this.commandResultHandler = (result) => {
                if (this.disposed) return

                console.log('[Console] Received result:', result)
                this.handleTerminalResult(result)
            }

            this.removeCommandResultHandler = window.electron.onCommandResult(this.commandResultHandler)
        } else {
            console.warn('[Console] onCommandResult not available')
        }
    }

    handleTerminalResult(result) {
        let output = ""
        let type = "output"

        if (!result) {
            console.warn('[Console] Empty result')
            return
        }

        if (result && typeof result === 'object') {
            type = result.type || "output"
            output = result.data || result.output || result.message || ""
        } else if (typeof result === 'string') {
            output = result
        } else {
            output = JSON.stringify(result)
        }

        console.log(`[Console] Type: "${type}", Output length: ${output.length}`)

        if (!output) return

        switch(type) {
            case "error":
                this.term.write("\x1b[31m" + output + "\x1b[0m")
                break
            case "warning":
                this.term.write("\x1b[38;5;208m" + output + "\x1b[0m")
                break
            case "exit":
                this.term.write(output)
                this.isWaitingForOutput = false
                this.prompt()
                return
            default:
                this.term.write(output)
        }

        if(type === "exit") {
            this.isWaitingForOutput = false
            this.prompt()
        }
    }

    dispose() {
        if (this.disposed) return

        this.disposed = true
        this.isWaitingForOutput = false
        window.electron?.cleanupTerminal?.()
        this.resizeObserver?.disconnect()
        window.removeEventListener("resize", this.handleResize)
        this.console.win.removeEventListener("bottom-window-resize-start", this.handlePanelResizeStart)
        this.console.win.removeEventListener("bottom-window-resize-end", this.handlePanelResizeEnd)
        this.removeCommandResultHandler?.()
        if (this.fitFrame) cancelAnimationFrame(this.fitFrame)
        this.term?.dispose()
    }
}
