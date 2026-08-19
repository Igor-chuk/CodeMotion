const { execSync } = require("child_process")
const os = require("os")

function callback(data) {
    return (...args) => {
        const command = args[0]
        const options = args[1] || {}

        if (typeof command !== "string" || command.length === 0) {
            throw new Error("[shell.linux] First argument must be a non-empty command string")
        }

        if (os.platform() !== "linux") {
            return { stdout: "", stderr: "", ok: false, skipped: true, platform: os.platform(), message: "[shell.linux] skipped — not running on Linux" }
        }

        try {
            const result = execSync(command, {
                encoding: options.encoding || "utf-8",
                timeout: options.timeout || 30000,
                maxBuffer: options.maxBuffer || 1024 * 1024,
                cwd: options.cwd || undefined,
                env: options.env || process.env,
                shell: options.shell || "/bin/sh"
            })

            return { stdout: result, stderr: "", ok: true }
        } catch (err) {
            return {
                stdout: err.stdout || "",
                stderr: err.stderr || err.message,
                ok: false,
                code: err.status
            }
        }
    }
}

module.exports = { callback }
