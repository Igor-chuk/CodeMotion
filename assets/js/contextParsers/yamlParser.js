import { renderSeparator } from "./globals.js";

export class YAMLParser {
    getContextChain(ast, row) {
        const chain = [];
        this.traverse(ast, row, chain);
        return chain;
    }

    traverse(node, row, chain) {
        if (!node || typeof node !== "object") return;

        const inRange = node.loc &&
            row >= node.loc.start.line &&
            row <= node.loc.end.line;

        if (inRange) {
            const item = this.nodeToChainItem(node);
            if (item) chain.push(item);

            for (const child of node.children || []) {
                this.traverse(child, row, chain);
            }
        }
    }

    nodeToChainItem(node) {
        switch (node.type) {
            case "Pair":
                return { icon: "data_object", label: node.key ?? "", className: "object" };
            case "Item":
                return { icon: "data_array", label: `[${node.index}]`, className: "array" };
            default:
                return null;
        }
    }

    renderContext(chain) {
        const container = document.querySelector(".code-structure");
        if (!container) return;

        container.innerHTML = "";

        if (!chain.length) {
            container.textContent = "No context";
            return;
        }

        container.style.opacity = "1";

        chain.forEach((item, i) => {
            const el = document.createElement("div");
            el.className = "context-item";
            el.innerHTML = `
            <span class="material-symbols-rounded ${item.className}">${item.icon}</span>
            ${item.label.length > 0 ? `<span>${item.label}</span>` : ""}
            `;
            container.appendChild(el);

            if (i < chain.length - 1) {
                const sep = renderSeparator();
                container.appendChild(sep);
            }
        });
    }
}
