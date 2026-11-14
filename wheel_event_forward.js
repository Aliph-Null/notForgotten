const parentWindow = window.parent;
const parentScroller =
  parentWindow !== window && parentWindow.document.getElementById("scroller");

if (parentScroller) {
  window.addEventListener("wheel", (event) => {
    parentScroller.scrollBy({
      top: event.deltaY,
      left: event.deltaY,
      behavior: "smooth",
    });
  });

  let previousTouchY = null;
  let forwardedTouchDistance = 0;
  let ignoreTouch = false;
  let touchScrollElement = null;

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

    return document.scrollingElement;
  }

  window.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1) {
        previousTouchY = null;
        return;
      }

      previousTouchY = event.touches[0].clientY;
      forwardedTouchDistance = 0;
      touchScrollElement = findScrollableElement(event.target);
      ignoreTouch =
        event.target instanceof Element &&
        Boolean(event.target.closest("model-viewer, video, input, button, a"));
    },
    { passive: true },
  );

  window.addEventListener(
    "touchmove",
    (event) => {
      if (
        previousTouchY === null ||
        ignoreTouch ||
        event.touches.length !== 1 ||
        !window.matchMedia("(max-width: 768px)").matches ||
        !parentScroller.classList.contains("vertical")
      ) {
        return;
      }

      const currentTouchY = event.touches[0].clientY;
      const deltaY = previousTouchY - currentTouchY;
      previousTouchY = currentTouchY;
      const scrollElement = touchScrollElement;

      if (!scrollElement || deltaY === 0) {
        return;
      }

      const atTop = scrollElement.scrollTop <= 0;
      const atBottom =
        scrollElement.scrollTop + scrollElement.clientHeight >=
        scrollElement.scrollHeight - 1;

      if ((deltaY < 0 && atTop) || (deltaY > 0 && atBottom)) {
        event.preventDefault();
        forwardedTouchDistance += deltaY;
      }
    },
    { passive: false },
  );

  function finishTouch() {
    if (
      Math.abs(forwardedTouchDistance) >= 40 &&
      parentScroller.children.length > 0 &&
      parentScroller.clientHeight > 0
    ) {
      const pageHeight = parentScroller.clientHeight;
      const currentIndex = Math.round(parentScroller.scrollTop / pageHeight);
      const direction = Math.sign(forwardedTouchDistance);
      const lastIndex = parentScroller.children.length - 1;
      const nextIndex = Math.min(Math.max(currentIndex + direction, 0), lastIndex);

      parentScroller.scrollTo({
        top: nextIndex * pageHeight,
        behavior: "smooth",
      });
    }

    previousTouchY = null;
    forwardedTouchDistance = 0;
    ignoreTouch = false;
    touchScrollElement = null;
  }

  window.addEventListener("touchend", finishTouch);
  window.addEventListener("touchcancel", finishTouch);
}
