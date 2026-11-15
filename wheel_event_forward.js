// Forwards wheel and swipe gestures from a section to the main page (core_viewer.js),
// which fades to the next or previous section.
(function () {
  const parentWindow = window.parent;
  if (parentWindow === window || window.__gesturesForwarded) {
    return;
  }
  // Lets core_viewer.js know this page already forwards its gestures
  window.__gesturesForwarded = true;

  const post = (message) => parentWindow.postMessage(message, "*");

  // How long the page must rest at its top/bottom edge before the wheel can change
  // section (so the end of a scroll, or its momentum, never jumps to the next section)
  const EDGE_PAUSE = 500;

  // Elements that use gestures themselves (3D viewer, video, open dialogs)
  const ownsGestures = (target) =>
    target instanceof Element &&
    Boolean(target.closest("model-viewer, video, input, dialog[open]"));

  // Nearest element that scrolls vertically: an inner box (e.g. the dates list)
  // or the page itself (on phones the whole section scrolls)
  function findScrollableElement(target) {
    let element = target instanceof Element ? target : null;
    while (element && element !== document.body && element !== document.documentElement) {
      const overflowY = window.getComputedStyle(element).overflowY;
      if (
        (overflowY === "auto" || overflowY === "scroll") &&
        element.scrollHeight > element.clientHeight
      ) {
        return element;
      }
      element = element.parentElement;
    }
    const page = document.scrollingElement || document.documentElement;
    return page.scrollHeight > page.clientHeight + 1 ? page : null;
  }

  // Where the scrollable area is: at the top, at the bottom (both if nothing scrolls)
  function edges(target) {
    const element = findScrollableElement(target);
    if (!element) {
      return { atTop: true, atBottom: true };
    }
    return {
      atTop: element.scrollTop <= 1,
      atBottom: element.scrollTop + element.clientHeight >= element.scrollHeight - 2,
    };
  }

  // ---------- Wheel / trackpad ----------
  let lastInnerScroll = 0;

  window.addEventListener(
    "wheel",
    (event) => {
      if (
        ownsGestures(event.target) ||
        canScrollInside(event.target, event.deltaY)
      ) {
        return;
      }
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (!horizontal) {
        const edge = edges(event.target);
        const canScroll = (event.deltaY < 0 && !edge.atTop) || (event.deltaY > 0 && !edge.atBottom);
        // Still scrolling inside, or just reached the edge: keep scrolling, don't change section
        if (canScroll || performance.now() - lastInnerScroll < EDGE_PAUSE) {
          lastInnerScroll = performance.now();
          return;
        }
      } else {
        // Horizontal trackpad swipes would otherwise trigger the browser's "Back"
        event.preventDefault();
      }
      post({
        type: "SECTION_WHEEL",
        deltaX: event.deltaX,
        deltaY: event.deltaY,
      });
    },
    { passive: false },
  );

  // ---------- Touch swipe ----------
  let startX = null;
  let startY = null;
  let startTarget = null;
  let startEdge = null;

  window.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1 || ownsGestures(event.target)) {
        startX = startY = null;
        return;
      }
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      startTarget = event.target;
      // Remember if the page was already at its top/bottom when the finger went down
      startEdge = edges(event.target);
    },
    { passive: true },
  );

  window.addEventListener(
    "touchend",
    (event) => {
      if (startX === null) {
        return;
      }
      const touch = event.changedTouches[0];
      const dx = startX - touch.clientX;
      const dy = startY - touch.clientY;
      startX = startY = null;

      const vertical = Math.abs(dy) > Math.abs(dx);
      const distance = vertical ? dy : dx;
      if (Math.abs(distance) < 50) {
        return;
      }
      if (vertical) {
        // A swipe changes section only if it STARTED at the edge: the swipe that
        const endEdge = edges(startTarget);
        if (dy > 0 && !(startEdge.atBottom && endEdge.atBottom)) {
          return;
        }
        if (dy < 0 && !(startEdge.atTop && endEdge.atTop)) {
          return;
        }
      }
      post({ type: "SECTION_SWIPE", direction: Math.sign(distance) });
    },
    { passive: true },
  );
})();