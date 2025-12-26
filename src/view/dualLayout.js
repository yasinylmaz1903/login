function createDualLayout(win, leftView, rightView, options = {}) {
  const toolbarHeight = options.toolbarHeight ?? 64;
  let sidebarWidth = options.sidebarWidth ?? 0;
  let ratio = 0.5; // 50 / 50 default
  let currentLeft = leftView;
  let currentRight = rightView;

  function applyLayout() {
    if (!win || win.isDestroyed()) return;
    const { width, height } = win.getContentBounds();
    const availableWidth = Math.max(0, width - sidebarWidth);
    const contentHeight = Math.max(0, height - toolbarHeight);
    const leftWidth = Math.round(availableWidth * ratio);
    const rightWidth = Math.max(0, availableWidth - leftWidth);

    if (currentLeft) {
      currentLeft.setBounds({ x: sidebarWidth, y: toolbarHeight, width: leftWidth, height: contentHeight });
      currentLeft.setAutoResize({ width: false, height: false });
    }
    if (currentRight) {
      currentRight.setBounds({ x: sidebarWidth + leftWidth, y: toolbarHeight, width: rightWidth, height: contentHeight });
      currentRight.setAutoResize({ width: false, height: false });
    }
  }

  function setActiveViews(left, right) {
    currentLeft = left || null;
    currentRight = right || null;
    applyLayout();
  }

  function setRatio(nextRatio) {
    if (!Number.isFinite(nextRatio)) return;
    // Allow full collapse 0..1 to hide a pane when desired.
    ratio = Math.min(1, Math.max(0, nextRatio));
    applyLayout();
  }

  function setSidebarWidth(nextWidth) {
    if (!Number.isFinite(nextWidth)) return;
    sidebarWidth = Math.max(0, nextWidth);
    applyLayout();
  }

  win.on('resize', applyLayout);

  return { applyLayout, setRatio, setActiveViews, setSidebarWidth };
}

module.exports = { createDualLayout };
