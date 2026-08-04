import test from "node:test";
import assert from "node:assert/strict";
import { getContextMenuPosition } from "../../assets/js/handlers/contextMenuPosition.js";

const viewport = { viewportWidth: 1000, viewportHeight: 800, menuWidth: 200, menuHeight: 120 };

test("maps client coordinates into the body zoom coordinate system", () => {
    assert.deepEqual(getContextMenuPosition({
        ...viewport,
        clientX: 500,
        clientY: 300,
        zoom: 2,
    }), { left: 250, top: 150 });
});

test("keeps a zoomed menu inside the viewport", () => {
    assert.deepEqual(getContextMenuPosition({
        ...viewport,
        clientX: 990,
        clientY: 790,
        zoom: 2,
    }), { left: 292, top: 272 });
});

test("falls back to normal scale for invalid zoom values", () => {
    assert.deepEqual(getContextMenuPosition({
        ...viewport,
        clientX: 500,
        clientY: 300,
        zoom: 0,
    }), { left: 500, top: 300 });
});
