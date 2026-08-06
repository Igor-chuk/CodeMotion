import { createDIV, createSpan } from "../handlers/helpers.js"

export function renderInput(properties = {}) {
    const id = properties.id
    const title = properties.title
    const description = properties.description
    const placeholder = properties.placeholder
    const prefix = properties.prefix
    const inputType = properties.inputType
    const value = properties.value
    const maxSymbols = properties.maxSymbols

    const wrapper = document.createElement("div")
    wrapper.classList.add("modal-category__item")

    const elementTitle = document.createElement("div")
    elementTitle.classList.add("modal-category__item-title")
    elementTitle.textContent = title

    const elementDesc = document.createElement("div")
    elementDesc.classList.add("modal-category__item-desc")
    elementDesc.textContent = description

    const inputWrapper = createDIV()
    inputWrapper.classList.add("form-element")

    const input = document.createElement("input")
    input.type = inputType ? inputType : "text"
    input.spellcheck = "false"
    input.id = id

    if(prefix) {
        input.classList.add("focused")
        input.value = prefix
    }
    if(value) {
        input.classList.add("focused")
        input.value = value
    }

    const inputName = createSpan()
    inputName.classList.add("form-label")
    inputName.textContent = placeholder

    if(maxSymbols > 0) {
        input.setAttribute("maxlength", maxSymbols)
        inputName.innerHTML += `<span class="max-symbols"><span id="current-symbols">${value.length > 0 ? value.length : 0}</span>/${maxSymbols}</span>`
    }

    inputWrapper.appendChild(input)
    inputWrapper.appendChild(inputName)

    if(title) wrapper.appendChild(elementTitle)
    if(description) wrapper.appendChild(elementDesc)
    if(!placeholder) inputName.textContent = title

    wrapper.appendChild(inputWrapper)

	input.addEventListener("input", (e) => {
		if (e.target.parentElement.querySelector("#current-symbols")) {
			e.target.parentElement.querySelector("#current-symbols").textContent = e.target.value.length
		}

        if(prefix) {
            if (!e.target.value.startsWith(prefix)) {
                e.target.value = prefix;
            }

            input.classList.toggle(
                "focused",
                input.value.length > prefix.length
            );
        }
        else {
            input.classList.toggle(
                "focused",
                input.value.length > 0
            );
        }
    });

    return wrapper
}
