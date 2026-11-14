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
          const targetBgId = entry.target.dataset.bgId;
          if (targetBgId) {
            bgFrame.contentWindow.postMessage(
              { type: "SET_STATE", state: Number(targetBgId) },
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

  // Sort sections by "Order" before rendering
  const sortedSections = [...data.sections].sort((a, b) => a.Order - b.Order);

  sortedSections.forEach((sec) => {
    const iframe = document.createElement("iframe");
    iframe.id = sec.id;
    iframe.src = sec.path;
    iframe.className = "section-frame";
    iframe.title = sec.title;

    // Store the Background-id on the iframe dataset
    if (sec["Background-id"] !== undefined) {
      iframe.dataset.bgId = sec["Background-id"];
    }

    scroller.appendChild(iframe);
    observer.observe(iframe);
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
