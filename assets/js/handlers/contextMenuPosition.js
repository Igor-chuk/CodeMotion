export function getContextMenuPosition({ clientX, clientY, menuWidth, menuHeight, viewportWidth, viewportHeight, zoom = 1, edgeGap = 8 }) {
    const scale = Number(zoom) > 0 ? Number(zoom) : 1;
    const x = clientX / scale;
    const y = clientY / scale;
    const maxLeft = Math.max(edgeGap, viewportWidth / scale - menuWidth - edgeGap);
    const maxTop = Math.max(edgeGap, viewportHeight / scale - menuHeight - edgeGap);

    return {
        left: Math.min(Math.max(edgeGap, x), maxLeft),
        top: Math.min(Math.max(edgeGap, y), maxTop),
    };
}
