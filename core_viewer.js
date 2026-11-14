async function initViewer() {
  const response = await fetch("pages.json");
  const data = await response.json();
  const scroller = document.getElementById("scroller");

  const isHorizontal = Boolean(data.horizontal);
  scroller.classList.add(isHorizontal ? "horizontal" : "vertical");

  data.sections.forEach((sec) => {
    const iframe = document.createElement("iframe");
    iframe.src = sec.path;
    iframe.className = "section-frame";
    iframe.title = sec.title;
    scroller.appendChild(iframe);
  });

  // 3. Optional: Convert vertical mouse wheel into horizontal scroll
  if (isHorizontal) {
    scroller.addEventListener(
      "wheel",
      (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          scroller.scrollLeft += e.deltaY;
        }
      },
      { passive: false },
    );
  }
}

initViewer();
