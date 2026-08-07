// Prettier-backed code formatter used by the "Format Document" / "Format Selection"
// editor actions. Kept out of the hot path — plugins are only pulled in here.
import * as prettier from "prettier/standalone";
import * as babel from "prettier/plugins/babel";
import * as estree from "prettier/plugins/estree";
import * as typescript from "prettier/plugins/typescript";
import * as postcss from "prettier/plugins/postcss";
import * as html from "prettier/plugins/html";
import * as markdown from "prettier/plugins/markdown";
import * as yaml from "prettier/plugins/yaml";

const PLUGINS = [babel, estree, typescript, postcss, html, markdown, yaml];

// Editor language "mode" (see assets/js/libClasses/languages.js) -> Prettier parser.
// Anything not listed is unsupported in-browser and falls back to re-indentation.
const MODE_TO_PARSER = {
    javascript: "babel",
    jsx: "babel",
    typescript: "typescript",
    tsx: "typescript",
    json: "json",
    css: "css",
    sass: "scss",   // this app's "sass" mode is SCSS
    scss: "scss",
    less: "less",
    html: "html",
    vue: "vue",
    markdown: "markdown",
    yaml: "yaml",
};

export function parserForMode(mode) {
    if (!mode) return null;
    return MODE_TO_PARSER[String(mode).toLowerCase()] || null;
}

// Returns { formatted, cursorOffset } or throws on a syntax error. `parser` is
// required (callers resolve it via parserForMode and fall back otherwise).
export async function formatCode(code, options = {}) {
    const { parser, tabWidth = 4, useTabs = true, rangeStart, rangeEnd, cursorOffset } = options;
    if (!parser) return null;

    const prettierOptions = { parser, plugins: PLUGINS, tabWidth, useTabs };
    if (typeof rangeStart === "number") prettierOptions.rangeStart = rangeStart;
    if (typeof rangeEnd === "number") prettierOptions.rangeEnd = rangeEnd;

    // formatWithCursor keeps the caret in place; range formatting can't track a
    // cursor, so only use it for whole-document formatting.
    if (typeof cursorOffset === "number" && rangeStart === undefined) {
        const result = await prettier.formatWithCursor(code, { ...prettierOptions, cursorOffset });
        return { formatted: result.formatted, cursorOffset: result.cursorOffset };
    }

    const formatted = await prettier.format(code, prettierOptions);
    return { formatted, cursorOffset: null };
}
