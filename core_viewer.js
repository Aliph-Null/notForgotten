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
  const bgFrame = document.getElementById("bg-frame");
  if (data.background && bgFrame) {
    bgFrame.src = data.background;
  }

  const isHorizontal = Boolean(data.horizontal);
  scroller.classList.add(isHorizontal ? "horizontal" : "vertical");

  const sections = Array.isArray(data.sections)
    ? data.sections.filter((section) => section && section.path)
    : [];
  const hasOrder = sections.length > 0 && sections.every((section) =>
    Number.isFinite(Number(section.Order)),
  );
  const orderedSections = hasOrder
    ? [...sections].sort((a, b) => Number(a.Order) - Number(b.Order))
    : sections;

  const observer = bgFrame
    ? new IntersectionObserver(
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
        { root: scroller, threshold: 0.5 },
      )
    : null;

  orderedSections.forEach((sec) => {
    const iframe = document.createElement("iframe");
    iframe.id = sec.id;
    iframe.src = sec.path;
    iframe.className = "section-frame";
    iframe.title = sec.title || "Section";

    if (sec["Background-id"] !== undefined) {
      iframe.dataset.bgId = sec["Background-id"];
    }

    scroller.appendChild(iframe);
    if (observer) {
      observer.observe(iframe);
    }
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
