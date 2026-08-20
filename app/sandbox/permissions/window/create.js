const { createNativeImageFromUrl } = require("../../tools.js")
const { BrowserWindow } = require("electron")

const ALLOWED_PROTOCOLS = ["http:", "https:"]
const DEFAULT_URL = "https://google.com"

function sanitizeUrl(raw) {
    try {
        const parsed = new URL(raw)
        if (ALLOWED_PROTOCOLS.includes(parsed.protocol) && parsed.hostname) {
            return parsed.href
        }
    } catch {}
    try {
        const parsed = new URL(`https://${raw}`)
        if (parsed.hostname) {
            return parsed.href
        }
    } catch {}
    return DEFAULT_URL
}

function callback(data) {
    return (id, properties = {}) => {
        if (id == undefined) {
            id = Math.floor(Math.random() * 9999) + 1
        }

        const title = properties.title == undefined ? `${data.extensionName} Window` : properties.title
        const url = sanitizeUrl(properties.url || "google.com")

        const win = new BrowserWindow(
            {
                width: 800,
                height: 600,
                show: false
            }
        )
        win.setMenu(null)

        win.setTitle(title)
        win.loadURL(url)

        return {
            id: id,
            open: () => {
                win.show()
            },
            close: () => {
                win.close()
            }
        }
    }
}

module.exports = { callback }