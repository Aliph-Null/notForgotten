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

  // Elements that use gestures themselves (3D viewer, video, open dialogs)
  const ownsGestures = (target) =>
    target instanceof Element &&
    Boolean(target.closest("model-viewer, video, input, dialog[open]"));

  function findScrollableElement(target) {
    let element = target instanceof Element ? target : null;
    while (element && element !== document.body) {
      const overflowY = window.getComputedStyle(element).overflowY;
      if (
        (overflowY === "auto" || overflowY === "scroll") &&
        element.scrollHeight > element.clientHeight
      ) {
        return element;
      }
      element = element.parentElement;
    }
    return null;
  }

  // True if an inner scrollable box (e.g. the dates list) can still scroll that way
  function canScrollInside(target, deltaY) {
    const element = findScrollableElement(target);
    if (!element) {
      return false;
    }
    const atTop = element.scrollTop <= 0;
    const atBottom =
      element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
    return (deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom);
  }

  window.addEventListener(
    "wheel",
    (event) => {
      if (ownsGestures(event.target) || canScrollInside(event.target, event.deltaY)) {
        return;
      }
      // Horizontal trackpad swipes would otherwise trigger the browser's "Back"
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault();
      }
      post({ type: "SECTION_WHEEL", deltaX: event.deltaX, deltaY: event.deltaY });
    },
    { passive: false },
  );

  let startX = null;
  let startY = null;
  let startTarget = null;

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
      if (vertical && canScrollInside(startTarget, dy)) {
        return;
      }
      post({ type: "SECTION_SWIPE", direction: Math.sign(distance) });
    },
    { passive: true },
  );
})();
