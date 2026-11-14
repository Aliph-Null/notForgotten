window.addEventListener(
  "wheel",
  (e) => {
    if (window.parent && window.parent !== window) {
      e.preventDefault();
      window.parent.postMessage(
        {
          type: "SECTION_WHEEL",
          deltaX: e.deltaX,
          deltaY: e.deltaY,
        },
        "*",
      );
    }
  },
  { passive: false },
);
