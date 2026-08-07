import { EditorView, Decoration, ViewPlugin } from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder, Facet } from "@codemirror/state";
import * as babelParser from "@babel/parser";
import traverseImport from "@babel/traverse";

// @babel/parser is CJS; grab `parse` off the namespace for robust esbuild interop.
const parse = babelParser.parse;
// @babel/traverse exposes the callable on `.default` under CJS interop.
const traverse = traverseImport.default || traverseImport;

// ─── Analysis ─────────────────────────────────────────────────────────────────

const UPPER_CASE = /^[A-Z][A-Z0-9_]*$/;

const BASE_PLUGINS = [
    "decorators-legacy",
    "classProperties",
    "classPrivateProperties",
    "classPrivateMethods",
    "objectRestSpread",
    "optionalChaining",
    "nullishCoalescingOperator",
    "dynamicImport",
    "topLevelAwait",
];

function parserPlugins({ ts, jsx }) {
    const plugins = [...BASE_PLUGINS];
    if (jsx) plugins.push("jsx");
    if (ts) plugins.push("typescript");
    return plugins;
}

const KIND_PRIORITY = { "semantic-class": 3, "func_arg": 2, "constant": 1 };

function pushToken(tokens, node, kind) {
    if (!node || typeof node.start !== "number" || typeof node.end !== "number") return;
    // A typed identifier (e.g. a TS param `x: number`) reports an `end` past its
    // type annotation; clamp to the name so only the identifier is highlighted.
    const end = node.type === "Identifier" && typeof node.name === "string"
        ? node.start + node.name.length
        : node.end;
    if (end <= node.start) return;
    tokens.push({ from: node.start, to: end, kind });
}

function isClassDeclNode(node) {
    if (!node) return false;
    if (node.type === "ClassDeclaration" || node.type === "ClassExpression") return true;
    if (node.type === "VariableDeclarator" && node.init && node.init.type === "ClassExpression") return true;
    return false;
}

function classifyBinding(name, binding) {
    if (isClassDeclNode(binding.path && binding.path.node)) return "semantic-class";
    if (binding.kind === "param") return "func_arg";
    if (binding.kind === "const" && UPPER_CASE.test(name)) return "constant";
    return null;
}

function collectTokens(ast, tokens) {
    traverse(ast, {
        Scopable(path) {
            const bindings = path.scope.bindings;
            for (const name in bindings) {
                const binding = bindings[name];
                const kind = classifyBinding(name, binding);
                if (!kind) continue;

                pushToken(tokens, binding.identifier, kind);
                for (const ref of binding.referencePaths) {
                    pushToken(tokens, ref.node, kind);
                }
            }
        },
    });
}

// Keep one kind per identifier range (class > func_arg > constant), sort ascending,
// and drop any overlap so RangeSetBuilder receives clean, ordered ranges.
function finalizeTokens(tokens) {
    const byStart = new Map();
    for (const token of tokens) {
        const existing = byStart.get(token.from);
        if (!existing || KIND_PRIORITY[token.kind] > KIND_PRIORITY[existing.kind]) {
            byStart.set(token.from, token);
        }
    }

    const sorted = Array.from(byStart.values()).sort((a, b) => a.from - b.from || a.to - b.to);

    const result = [];
    let lastTo = -1;
    for (const token of sorted) {
        if (token.from < lastTo) continue;
        result.push(token);
        lastTo = token.to;
    }
    return result;
}

// ─── Method-existence analysis (JavaScript only) ────────────────────────────────

const MEMBER_TYPES = new Set([
    "ClassMethod", "ClassPrivateMethod",
    "ClassProperty", "ClassPrivateProperty", "PropertyDefinition",
]);

function memberKeyName(key) {
    if (!key) return null;
    if (key.type === "Identifier") return key.name;
    if (key.type === "PrivateName") return key.id && key.id.name;
    if (key.type === "StringLiteral") return key.value;
    if (key.type === "NumericLiteral") return String(key.value);
    return null;
}

function collectConstructorMembers(classPath, info) {
    for (const element of classPath.get("body.body")) {
        if (!element.isClassMethod() || element.node.kind !== "constructor") continue;

        element.traverse({
            AssignmentExpression(assign) {
                const left = assign.node.left;
                if (
                    left.type === "MemberExpression" && !left.computed &&
                    left.object.type === "ThisExpression" &&
                    left.property.type === "Identifier"
                ) {
                    info.members.add(left.property.name);
                }
            },
            CallExpression(call) {
                // Object.assign(this, ...) makes the instance surface unknowable.
                const callee = call.node.callee;
                if (
                    callee.type === "MemberExpression" &&
                    callee.object.type === "Identifier" && callee.object.name === "Object" &&
                    callee.property.type === "Identifier" && callee.property.name === "assign" &&
                    call.node.arguments[0] && call.node.arguments[0].type === "ThisExpression"
                ) {
                    info.open = true;
                }
            },
        });
    }
}

function analyzeMethods(ast, diagnostics) {
    const localClasses = new Map();      // name -> { members:Set, superName, open }
    const prototypeAugmented = new Set();
    const instanceVars = new Map();      // Binding -> className

    traverse(ast, {
        "ClassDeclaration|ClassExpression"(path) {
            const node = path.node;
            const name = node.id && node.id.name;
            if (!name) return;

            const info = { members: new Set(), superName: null, open: false };

            if (node.superClass) {
                if (node.superClass.type === "Identifier") info.superName = node.superClass.name;
                else info.open = true; // mixin / expression superclass
            }

            for (const element of node.body.body) {
                if (element.computed) { info.open = true; continue; }
                if (!MEMBER_TYPES.has(element.type)) continue;
                const key = memberKeyName(element.key);
                if (key) info.members.add(key);
            }

            collectConstructorMembers(path, info);
            localClasses.set(name, info); // last declaration of a name wins
        },

        MemberExpression(path) {
            const node = path.node;
            if (
                !node.computed &&
                node.object.type === "Identifier" &&
                node.property.type === "Identifier" && node.property.name === "prototype"
            ) {
                prototypeAugmented.add(node.object.name);
            }
        },

        VariableDeclarator(path) {
            const node = path.node;
            if (
                node.id.type === "Identifier" &&
                node.init && node.init.type === "NewExpression" &&
                node.init.callee.type === "Identifier"
            ) {
                const binding = path.scope.getBinding(node.id.name);
                if (binding) instanceVars.set(binding, node.init.callee.name);
            }
        },
    });

    // Any prototype patching or a non-local base makes the surface open.
    for (const [name, info] of localClasses) {
        if (prototypeAugmented.has(name)) info.open = true;
        if (info.superName && !localClasses.has(info.superName)) info.open = true;
    }

    const resolveMembers = (name, seen = new Set()) => {
        if (seen.has(name)) return null;
        seen.add(name);

        const info = localClasses.get(name);
        if (!info || info.open) return null;

        const members = new Set(info.members);
        if (info.superName) {
            const inherited = resolveMembers(info.superName, seen);
            if (inherited === null) return null;
            for (const member of inherited) members.add(member);
        }
        return members;
    };

    traverse(ast, {
        CallExpression(path) {
            const callee = path.node.callee;
            if (callee.type !== "MemberExpression" || callee.computed) return;
            if (callee.object.type !== "Identifier" || callee.property.type !== "Identifier") return;

            const binding = path.scope.getBinding(callee.object.name);
            if (!binding || !instanceVars.has(binding)) return;
            if (binding.constantViolations.length > 0) return; // reassigned -> unprovable

            const className = instanceVars.get(binding);
            const members = resolveMembers(className);
            if (!members) return; // open / unknown surface

            const method = callee.property.name;
            if (!members.has(method)) {
                diagnostics.push({
                    from: callee.property.start,
                    to: callee.property.end,
                    severity: "error",
                    message: `Property '${method}' does not exist on type '${className}'.`,
                    code: "semantic-2339",
                });
            }
        },
    });
}

export function analyze(code, { ts = false, jsx = true } = {}) {
    let ast;
    try {
        ast = parse(code, {
            sourceType: "module",
            errorRecovery: true,
            allowReturnOutsideFunction: true,
            allowAwaitOutsideFunction: true,
            allowUndeclaredExports: true,
            plugins: parserPlugins({ ts, jsx }),
        });
    } catch {
        return { ok: false, tokens: [], diagnostics: [] };
    }

    const tokens = [];
    const diagnostics = [];
    try {
        collectTokens(ast, tokens);
        if (!ts) analyzeMethods(ast, diagnostics);
    } catch {
        return { ok: false, tokens: [], diagnostics: [] };
    }

    return { ok: true, tokens: finalizeTokens(tokens), diagnostics };
}

// ─── CodeMirror integration ─────────────────────────────────────────────────

const MAX_DOC_LENGTH = 200_000;
const DEBOUNCE_MS = 200;

// Per-editor callback that receives computed diagnostics (routed to the app).
export const semanticDiagnosticsSink = Facet.define({
    combine: (values) => (values.length ? values[0] : null),
});

const setSemanticDecorations = StateEffect.define();

const MARKS = {
    "func_arg": Decoration.mark({ class: "cm-func-arg" }),
    "semantic-class": Decoration.mark({ class: "cm-semantic-class" }),
    "constant": Decoration.mark({ class: "cm-constant" }),
};

function buildDecorations(tokens) {
    const builder = new RangeSetBuilder();
    for (const token of tokens) builder.add(token.from, token.to, MARKS[token.kind]);
    return builder.finish();
}

// Single shared field; an editor only ever has one JS/TS variant active at a time.
const semanticField = StateField.define({
    create: () => Decoration.none,
    update(decorations, tr) {
        decorations = decorations.map(tr.changes);
        for (const effect of tr.effects) {
            if (effect.is(setSemanticDecorations)) decorations = effect.value;
        }
        return decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
});

export function semanticHighlight({ ts = false, jsx = true } = {}) {
    const driver = ViewPlugin.fromClass(class {
        constructor(view) {
            this.timer = null;
            this.schedule(view);
        }
        update(update) {
            if (update.docChanged) this.schedule(update.view);
        }
        schedule(view) {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.run(view), DEBOUNCE_MS);
        }
        run(view) {
            const code = view.state.doc.toString();
            const sink = view.state.facet(semanticDiagnosticsSink);

            if (code.length > MAX_DOC_LENGTH) {
                view.dispatch({ effects: setSemanticDecorations.of(Decoration.none) });
                if (sink) sink([]);
                return;
            }

            const { ok, tokens, diagnostics } = analyze(code, { ts, jsx });
            // On parse/analysis failure keep the last good decorations & diagnostics
            // (they are position-mapped as the user types) to avoid flicker.
            if (!ok) return;

            view.dispatch({ effects: setSemanticDecorations.of(buildDecorations(tokens)) });
            if (sink) sink(diagnostics);
        }
        destroy() {
            clearTimeout(this.timer);
        }
    });

    return [semanticField, driver];
}

export const semanticHighlightTheme = EditorView.baseTheme({
    "&dark .cm-func-arg, &dark .cm-func-arg *": { color: "#9CDCFE !important" },
    "&light .cm-func-arg, &light .cm-func-arg *": { color: "#001080 !important" },

    "&dark .cm-semantic-class, &dark .cm-semantic-class *": { color: "#4EC9B0 !important" },
    "&light .cm-semantic-class, &light .cm-semantic-class *": { color: "#267F99 !important" },

    "&dark .cm-constant, &dark .cm-constant *": { color: "#4FC1FF !important" },
    "&light .cm-constant, &light .cm-constant *": { color: "#0070C1 !important" },
});
