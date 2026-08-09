export class _DragDrop {
    constructor(el) {
        if (!(el instanceof HTMLElement)) {
            throw new Error("DragDrop element can be only HTML Element")
        }

        this.el = el

        if (!('draggable' in el)) {
            throw new Error("HTML Element cant support draggable")
        }

        this._onFile = () => {}
        this._onFolder = () => {}

        el.addEventListener('dragover', (e) => {
            e.preventDefault()
        })

        el.addEventListener('drop', (e) => this._handleDrop(e))
    }

    async _handleDrop(e) {
        e.preventDefault()

        const collected = []
        const items = e.dataTransfer.items

        if (items && items.length) {
            for (const item of items) {
                if (item.kind !== "file") continue

                const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null
                collected.push({ isDirectory: !!(entry && entry.isDirectory), file: item.getAsFile() })
            }
        } else {
            for (const file of e.dataTransfer.files) {
                collected.push({ isDirectory: false, file })
            }
        }

        for (const { isDirectory, file } of collected) {
            if (!file) continue

            if (isDirectory) {
                const folderPath = window.electron.getPathForFile(file)
                if (folderPath) this._onFolder(folderPath)
                continue
            }

            const content = await file.text()
            const name = file.name

            this._onFile({ content, name, extension: name.split(".").pop() })
        }
    }

    onDrop(callback = () => {}) {
        this._onFile = callback
    }

    onDropFolder(callback = () => {}) {
        this._onFolder = callback
    }
}
