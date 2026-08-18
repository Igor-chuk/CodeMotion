import { idify, parseTwemojiString, Time } from "../lib.js"
import { renderInput } from "../modalsHandler/components/input.js"

function mdParse(md) {
	return md
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")

		.replace(/^###### (.*)$/gm, "<h6>$1</h6>")
		.replace(/^##### (.*)$/gm, "<h5>$1</h5>")
		.replace(/^#### (.*)$/gm, "<h4>$1</h4>")
		.replace(/^### (.*)$/gm, "<h3>$1</h3>")
		.replace(/^## (.*)$/gm, "<h2>$1</h2>")
		.replace(/^# (.*)$/gm, "<h1>$1</h1>")

		.replace(/^---$/gm, "<hr>")

		.replace(/^> (.*)$/gm, "<blockquote>$1</blockquote>")

		.replace(/(?:^- .*(?:\n|$))+/gm, (match) => {
			const items = match
				.trim()
				.split("\n")
				.map((item) => `<li>${item.slice(2)}</li>`)
				.join("");

			return `<ul>${items}</ul>`;
		})

		.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")

		.replace(/\*(.*?)\*/g, "<em>$1</em>")

		.replace(/`([^`]+)`/g, "<code>$1</code>")

		.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
}

export class _ChatElement {
    static instances = new Map()

    constructor(id) {
        const normalizedId = idify(id)

        if (_ChatElement.instances.has(normalizedId)) {
	        return _ChatElement.instances.get(normalizedId)
        }

        this.container = document.querySelector(".main-wrapper")

        let item = this.container.querySelector(`.chat-element#${normalizedId}`)

        if (!item) {
            item = document.createElement("div")
            item.className = "chat-element hidden"
            item.id = normalizedId

            this.container.after(item)
		}

		this.item = item
		this.events = {}

		const header = document.createElement("div")
		header.classList.add("chat-header")
		this.header = header

		const closeBtn = document.createElement("span")
		closeBtn.classList.add("chat-close", "material-symbols-rounded")
		closeBtn.textContent = "close"
		this.closeBtn = closeBtn

		const body = document.createElement("div")
		body.classList.add("chat-body")
		this.body = body

		const footer = document.createElement("div")
		footer.classList.add("chat-footer")
		this.footer = footer

		const messagesWrapper = document.createElement("div")
		messagesWrapper.classList.add("chat-messages")
		this.messages = messagesWrapper
		this.body.appendChild(messagesWrapper)

		this.image = null
		this.title = null

		_ChatElement.instances.set(normalizedId, this)
    }

    content({ title, image, secondary }) {
		this.item.innerHTML = ""

		if (image) {
			const imageEl = document.createElement("img")
			imageEl.src = image
			imageEl.classList.add("chat-image")

			this.header.appendChild(imageEl)
			this.image = image
		}
		if (title) {
			const titleEl = document.createElement("div")
			titleEl.textContent = title
			titleEl.classList.add("chat-title")

			this.header.appendChild(titleEl)
			this.title = titleEl
		}
		if (secondary) {
			const secondaryEl = document.createElement("span")
			secondaryEl.textContent = secondary
			secondaryEl.classList.add("chat-title__secondary")

			this.title?.appendChild(secondaryEl)
		}

		const input = renderInput({
			placeholder: "Your prompt"
		})
		const inputEl = input.querySelector("input")

		inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && "msg" in this.events) {
				const text = inputEl.value

				const wrapper = document.createElement("div")
				wrapper.classList.add("chat-msg__wrapper")

				const msgEl = document.createElement("div")
				msgEl.classList.add("chat-msg")

				const msgTextEl = document.createElement("p")
				msgTextEl.textContent = text

				const msgTextElTime = document.createElement("span")
				msgTextElTime.textContent = Time.format("{{HH}}:{{mm}}", Time.now())
				msgTextElTime.classList.add("chat-time")
				msgTextEl.appendChild(msgTextElTime)

				msgEl.appendChild(msgTextEl)
				wrapper.appendChild(msgEl)
				this.messages.appendChild(wrapper)

				this.events["msg"]({
					text: text
				})
				inputEl.value = ""
			}
		})

		this.footer.appendChild(input)
		this.header.appendChild(this.closeBtn)
		this.body.appendChild(this.footer)

		this.item.appendChild(this.header)
		this.item.appendChild(this.body)

		this.closeBtn.onclick = () => {
			this.hide()
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

        this.events[event] = callback
	}

	reply({ id, type, content, removeLast, time }) {
		const wrapper = document.createElement("div")
		wrapper.classList.add("chat-reply__wrapper")

		wrapper.id = id

		if (removeLast) {
			this.messages.querySelector(`[id="${id - 1}"]`)?.remove()
		}

		if (this.image != null) {
			const avatarEl = document.createElement("img")
			avatarEl.src = this.image
			avatarEl.classList.add("chat-reply__avatar")

			wrapper.appendChild(avatarEl)
		}

		const replyEl = document.createElement("div")
		replyEl.classList.add("chat-reply")

		const textEl = document.createElement("p")
		textEl.textContent = content

		if (type == "error") {
			replyEl.classList.add("chat-error")
		}
		if (type == "thinking") {
			replyEl.classList.add("chat-thinking")
			textEl.textContent = "Thinking..."
		}
		if (type == "tool_run") {
			replyEl.classList.add("chat-tool")
			textEl.textContent = content
		}

		textEl.innerHTML = parseTwemojiString(textEl.textContent)
		textEl.innerHTML = mdParse(textEl.textContent)

		if (time) {
			const timeEl = document.createElement("span")
			timeEl.textContent = time
			timeEl.classList.add("chat-time")

			textEl.appendChild(timeEl)
		}

		replyEl.appendChild(textEl)

		wrapper.appendChild(replyEl)
		this.messages.appendChild(wrapper)
	}

	destroy() {
        this.item.remove()
        _ChatElement.instances.delete(this.item.id)
    }
}
