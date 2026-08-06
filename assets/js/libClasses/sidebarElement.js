import { idify } from "../lib.js"

export class _SidebarElement {
    static instances = new Map()

    constructor(id, attributes = []) {
        const normalizedId = idify(id)

        if (_SidebarElement.instances.has(normalizedId)) {
	        return _SidebarElement.instances.get(normalizedId)
        }

        this.container = document.querySelector(".sidebar")

        let item = this.container.querySelector(`#${normalizedId}`)

        if (!item) {
            item = document.createElement("div")
            item.className = "sidebar-item hidden"
            item.id = normalizedId

            this.container.after(item)
		}

		if (attributes.length > 0) {
			attributes.forEach((a) => {
				item.setAttribute(a, true)
			})
        }

        this.item = item

        _SidebarElement.instances.set(normalizedId, this)
    }

    content({ icon, image, tooltip }) {
		this.item.innerHTML = ""

		if (image) {
            const imageEl = document.createElement("img")
			imageEl.className = "sidebar-image"
            imageEl.src = image

            this.item.appendChild(imageEl)
		}

        if (icon) {
            const iconEl = document.createElement("span")
            iconEl.className = "material-symbols-rounded"
            iconEl.id = "icon"
            iconEl.textContent = icon

            this.item.appendChild(iconEl)
		}

		if (tooltip) {
			this.item.setAttribute("tooltip", tooltip)
        }

        this.container.appendChild(this.item)
    }

    show() {
    	this.item.classList.remove("hidden")
    }

    hide() {
    	this.item.classList.add("hidden")
    }

    on(event, callback) {
        const events = {
            hover: "mouseenter",
            unhover: "mouseleave",
            click: "click"
        }

        if (event in events) {
            this.item.addEventListener(events[event], () => {
                callback(this)
            })
        }
    }

    destroy() {
        this.item.remove()
        _SidebarElement.instances.delete(this.item.id)
    }
}
