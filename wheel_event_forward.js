window.addEventListener("wheel", (e) => {
  if (window.parent && window.parent !== window) {
    window.parent.document.getElementById("scroller").scrollBy({
      top: e.deltaY,
      left: e.deltaY,
      behavior: "smooth",
    });
  }
});
