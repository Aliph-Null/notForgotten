window.addEventListener("wheel", (e) => {
  // Forward vertical wheel movement to the parent scroller
  if (window.parent && window.parent !== window) {
    window.parent.document.getElementById("scroller").scrollBy({
      top: e.deltaY,
      left: e.deltaY,
      behavior: "smooth",
    });
  }
});
