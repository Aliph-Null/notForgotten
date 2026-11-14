async function initViewer() {
  const response = await fetch("pages.json");
  const data = await response.json();
  const scroller = document.getElementById("scroller");
  const bgFrame = document.getElementById("bg-frame");

  if (data.background) {
    bgFrame.src = data.background;
  }

  const isHorizontal = Boolean(data.horizontal);
  scroller.classList.add(isHorizontal ? "horizontal" : "vertical");

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && bgFrame.contentWindow) {
          const targetState = entry.target.dataset.bgState;
          if (targetState) {
            bgFrame.contentWindow.postMessage(
              { type: "SET_STATE", state: targetState },
              "*",
            );
          }
        }
      });
    },
    {
      root: scroller,
      threshold: 0.5,
    },
  );

  // 4. Build sections and register them with the observer
  data.sections.forEach((sec) => {
    const iframe = document.createElement("iframe");
    iframe.src = sec.path;
    iframe.className = "section-frame";
    iframe.title = sec.title;
    iframe.dataset.bgState = sec.bgState || "";

    scroller.appendChild(iframe);
    observer.observe(iframe);
  });

  // 5. Horizontal mouse wheel helper
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
