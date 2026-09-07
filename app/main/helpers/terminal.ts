import * as pty from 'node-pty';
import { ipcMain, IpcMainEvent } from 'electron';
import fs from 'fs';
import os from 'os';

class TerminalManager {
    ptyProcess: pty.IPty | null;

    constructor() {
        this.ptyProcess = null;
    }

    getShell(): string {
        if (process.platform === 'win32') {
            const powerShell = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
            if (fs.existsSync(powerShell)) {
                return powerShell;
            }
            return process.env.COMSPEC || 'cmd.exe';
        }

        const userShell = process.env.SHELL;

        if (userShell && fs.existsSync(userShell)) {
            return userShell;
        }

        for (const shell of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
            if (fs.existsSync(shell)) {
                return shell;
            }
        }

        return '/bin/sh';
    }

    validateWorkDir(cwd: string): string {
        const fallback = os.homedir();

        if (!cwd || !fs.existsSync(cwd)) {
            return fallback;
        }

        try {
            const stat = fs.statSync(cwd);
            if (stat.isFile()) {
                const path = require('path');
                return path.dirname(cwd);
            }
            if (stat.isDirectory()) {
                return cwd;
            }
        } catch {
            return fallback;
        }

        return fallback;
    }

    initSession(event: IpcMainEvent, data: { cwd?: string; cols?: number; rows?: number }): void {
        if (this.ptyProcess) {
            this.killProcessTree();
        }

        const workDir = this.validateWorkDir(data?.cwd || '');
        const shell = this.getShell();
        const cols = data?.cols || 80;
        const rows = data?.rows || 24;

        console.log(`[Terminal PTY] Spawning shell: ${shell} in "${workDir}" (cols: ${cols}, rows: ${rows})`);

        try {
            this.ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-256color',
                cols,
                rows,
                cwd: workDir,
                env: {
                    ...process.env,
                    COLORTERM: 'truecolor',
                    TERM: 'xterm-256color'
                }
            });

            this.ptyProcess.onData((data: string) => {
                if (!event.sender.isDestroyed()) {
                    event.sender.send("terminal-result", {
                        type: 'output',
                        data: data
                    });
                }
            });

            this.ptyProcess.onExit(({ exitCode, signal }) => {
                console.log(`[Terminal PTY] Process exited with code ${exitCode}, signal ${signal}`);
                if (!event.sender.isDestroyed()) {
                    event.sender.send("terminal-result", {
                        type: 'exit',
                        data: `\r\nProcess exited with code ${exitCode}\r\n`,
                        exitCode
                    });
                }
                this.ptyProcess = null;
            });

        } catch (err: any) {
            console.error(`[Terminal PTY] Failed to spawn shell: ${err.message}`);
            event.sender.send("terminal-result", {
                type: 'error',
                data: `Failed to spawn shell: ${err.message}\r\n`
            });
            this.ptyProcess = null;
        }
    }

    sendInput(input: string): void {
        if (this.ptyProcess) {
            this.ptyProcess.write(input);
        }
    }

    resize(cols: number, rows: number): void {
        if (this.ptyProcess && cols > 0 && rows > 0) {
            try {
                this.ptyProcess.resize(cols, rows);
            } catch (err: any) {
                console.error(`[Terminal PTY] Resize error: ${err.message}`);
            }
        }
    }

    killProcessTree(): void {
        if (!this.ptyProcess) return;

        try {
            this.ptyProcess.kill();
        } catch (err: any) {
            console.error(`[Terminal PTY] Error killing process: ${err.message}`);
        }
        this.ptyProcess = null;
    }

    cleanupInputHandler(): void {
        // No-op for PTY session
    }
}

const terminalManager = new TerminalManager();

ipcMain.on("terminal-init", (event: IpcMainEvent, data: { cwd?: string; cols?: number; rows?: number }) => {
    terminalManager.initSession(event, data);
});

ipcMain.on("terminal-input", (_: IpcMainEvent, input: string) => {
    terminalManager.sendInput(input);
});

ipcMain.on("terminal-resize", (_: IpcMainEvent, data: { cols: number; rows: number }) => {
    terminalManager.resize(data.cols, data.rows);
});

ipcMain.on("terminal-command", (event: IpcMainEvent, data: { cmd: string; cwd: string }) => {
    if (!terminalManager.ptyProcess) {
        terminalManager.initSession(event, { cwd: data.cwd });
    }
    if (data.cmd) {
        terminalManager.sendInput(data.cmd + '\r');
    }
});

ipcMain.on("terminal-kill", () => {
    terminalManager.killProcessTree();
});

ipcMain.on("terminal-cleanup", () => {
    terminalManager.killProcessTree();
});

export { TerminalManager, terminalManager };
