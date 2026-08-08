import { renderSeparator } from "./globals.js";

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);
const LITERAL_END = new Set([" ", "\t", "\n", "\r", ",", "{", "}", "[", "]", ":"]);

export class JSONParser {
    showJSONContext(editor, contextPanel) {
        const code = editor.getValue();
        const pos = editor.getCursorPosition();

        if (code.trim().length === 0) {
            contextPanel.textContent = "No context";
            return;
        }

        let valid = true;
        try {
            JSON.parse(code);
        } catch {
            valid = false;
        }

        const offset = this.toOffset(code, pos);
        const path = this.getContextChain(code, offset);

        if (path.length === 0 && !valid) {
            contextPanel.textContent = "Incorrect JSON";
            return;
        }

        this.renderContext(path, contextPanel);
    }

    toOffset(code, pos) {
        const lines = code.split("\n");
        const row = Math.min(pos.row, lines.length - 1);

        let offset = 0;
        for (let i = 0; i < row; i++) offset += lines[i].length + 1;
        return offset + Math.min(pos.column || 0, lines[row]?.length ?? 0);
    }

    getContextChain(code, offset) {
        const frames = [];
        let expectKey = false;
        let captured = null;

        const length = code.length;
        let i = 0;

        while (i < length) {
            if (captured === null && i >= offset) {
                captured = this.cloneFrames(frames);
                break;
            }

            const ch = code[i];

            if (WHITESPACE.has(ch)) {
                i++;
            } else if (ch === "{") {
                frames.push({ type: "object", key: null });
                expectKey = true;
                i++;
            } else if (ch === "[") {
                frames.push({ type: "array", index: 0 });
                expectKey = false;
                i++;
            } else if (ch === "}" || ch === "]") {
                frames.pop();
                const top = frames[frames.length - 1];
                expectKey = !!top && top.type === "object";
                i++;
            } else if (ch === ":") {
                expectKey = false;
                i++;
            } else if (ch === ",") {
                const top = frames[frames.length - 1];
                if (top) {
                    if (top.type === "object") {
                        top.key = null;
                        expectKey = true;
                    } else {
                        top.index++;
                    }
                }
                i++;
            } else if (ch === '"') {
                const start = i;
                const value = this.readString(code, i);
                i = value.end;

                const top = frames[frames.length - 1];
                if (top && top.type === "object" && expectKey) top.key = value.text;

                if (captured === null && offset >= start && offset < value.end) {
                    captured = this.cloneFrames(frames);
                    break;
                }
            } else {
                const start = i;
                while (i < length && !LITERAL_END.has(code[i])) i++;

                if (captured === null && offset >= start && offset < i) {
                    captured = this.cloneFrames(frames);
                    break;
                }
            }
        }

        if (captured === null) captured = this.cloneFrames(frames);
        return this.framesToPath(captured);
    }

    readString(code, start) {
        const length = code.length;
        let i = start + 1;
        let text = "";

        while (i < length) {
            const ch = code[i];
            if (ch === "\\") {
                text += code[i + 1] ?? "";
                i += 2;
                continue;
            }
            if (ch === '"') {
                i++;
                break;
            }
            text += ch;
            i++;
        }

        return { text, end: i };
    }

    cloneFrames(frames) {
        return frames.map(frame => ({ ...frame }));
    }

    framesToPath(frames) {
        return frames.map(frame => {
            if (frame.type === "array") {
                return { icon: "data_array", label: `[${frame.index}]`, className: "array" };
            }
            return { icon: "data_object", label: frame.key ?? "", className: "object" };
        });
    }

    renderContext(chain, contextPanel) {
        contextPanel.innerHTML = "";

        if (!chain.length) {
            contextPanel.textContent = "No context";
            return;
        }

        contextPanel.style.opacity = "1";

        chain.forEach((item, i) => {
            const el = document.createElement("div");
            el.className = "context-item";
            el.innerHTML = `
            <span class="material-symbols-rounded ${item.className}">${item.icon}</span>
            ${item.label.length > 0 ? `<span>${item.label}</span>` : ""}
            `;
            contextPanel.appendChild(el);

            if (i < chain.length - 1) {
                const sep = renderSeparator();
                contextPanel.appendChild(sep);
            }
        });
    }
}
