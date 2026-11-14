async function initViewer() {
  let data;
  try {
    const response = await fetch("pages.json");
    if (!response.ok) {
      throw new Error("pages.json not found");
    }
    data = await response.json();
  } catch (error) {
    console.error("Viewer config failed:", error);
    return;
  }

  const scroller = document.getElementById("scroller");
  const isHorizontal = Boolean(data.horizontal);
  scroller.classList.add(isHorizontal ? "horizontal" : "vertical");

  (Array.isArray(data.sections) ? data.sections : []).forEach((sec) => {
    if (!sec || !sec.path) {
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.src = sec.path;
    iframe.className = "section-frame";
    iframe.title = sec.title || "Section";
    scroller.appendChild(iframe);
  });

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
