const diagnosticsByPath = new Map();

function paintFileEl(fileEl, errorCount, warnCount) {
    fileEl.classList.toggle("error", errorCount > 0);
    fileEl.classList.toggle("warn", errorCount === 0 && warnCount > 0);

    let errEl = fileEl.querySelector(".file-info__error");
    let warnEl = fileEl.querySelector(".file-info__warn");

    if (!errEl) {
        errEl = document.createElement("span");
        errEl.className = "file-info file-info__error";
        fileEl.appendChild(errEl);
    }
    if (!warnEl) {
        warnEl = document.createElement("span");
        warnEl.className = "file-info file-info__warn";
        fileEl.appendChild(warnEl);
    }

    errEl.textContent = errorCount > 0 ? String(errorCount) : "";
    warnEl.textContent = warnCount > 0 ? String(warnCount) : "";
}

export function setFileDiagnostics(path, state) {
    if (!path) return;

    const errorCount = state?.errorCount || 0;
    const warnCount = state?.warnCount || 0;

    if (errorCount === 0 && warnCount === 0) {
        diagnosticsByPath.delete(path);
    } else {
        diagnosticsByPath.set(path, { errorCount, warnCount });
    }

    const panel = document.querySelector('.explorer-elements[data-tab="files"]');
    if (!panel) return;

    panel.querySelectorAll(".file[data-path]").forEach(fileEl => {
        if (fileEl.getAttribute("data-path") === path) {
            paintFileEl(fileEl, errorCount, warnCount);
        }
    });
}

export function applyExplorerDiagnostics(scopeEl) {
    if (!scopeEl || typeof scopeEl.querySelectorAll !== "function") return;

    scopeEl.querySelectorAll(".file[data-path]").forEach(fileEl => {
        const counts = diagnosticsByPath.get(fileEl.getAttribute("data-path"));
        if (counts) paintFileEl(fileEl, counts.errorCount, counts.warnCount);
    });
}
