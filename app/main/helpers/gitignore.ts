import fsPromise from "fs/promises"
import path from "path"
import ignore from "ignore"

type Ignore = ReturnType<typeof ignore>

interface GitignoreRules {
    matcher: Ignore
    canPrune: boolean
}

async function loadGitignore(rootPath: string): Promise<GitignoreRules> {
    try {
        const content = await fsPromise.readFile(path.join(rootPath, ".gitignore"), "utf8")
        return {
            matcher: ignore().add(content),
            canPrune: !content.split(/\r?\n/).some(line => /^\s*!/.test(line))
        }
    } catch (error: any) {
        if (error.code === "ENOENT") return { matcher: ignore(), canPrune: true }
        throw error
    }
}

function getGitignorePath(rootPath: string, targetPath: string): string | null {
    const relative = path.relative(rootPath, targetPath).replace(/\\/g, "/")

    if (!relative || relative.startsWith("../") || relative === "..") return null
    return relative
}

function isIgnored(targetPath: string, rootPath: string, rules: GitignoreRules, isDirectory = false): boolean {
    const relative = getGitignorePath(rootPath, targetPath)
    if (!relative) return false

    return rules.matcher.ignores(isDirectory ? `${relative}/` : relative)
}

export { loadGitignore, isIgnored }
