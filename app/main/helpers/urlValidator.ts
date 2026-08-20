const ALLOWED_PROTOCOLS = ["http:", "https:"]

export function isUrlSafe(url: string): boolean {
    try {
        const parsed = new URL(url)
        if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
            return false
        }
        if (!parsed.hostname || parsed.hostname.length === 0) {
            return false
        }
        return true
    } catch {
        return false
    }
}

export function sanitizeUrl(url: string): string {
    try {
        const parsed = new URL(url)
        if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
            return ""
        }
        return parsed.href
    } catch {
        try {
            const withProtocol = new URL(`https://${url}`)
            if (!ALLOWED_PROTOCOLS.includes(withProtocol.protocol)) {
                return ""
            }
            if (!withProtocol.hostname || withProtocol.hostname.length === 0) {
                return ""
            }
            return withProtocol.href
        } catch {
            return ""
        }
    }
}
