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

  const horizontalSetting = Boolean(data.horizontal);
  const mobileViewport = window.matchMedia("(max-width: 768px)");
  let horizontalMode = null;

  function updateScrollMode() {
    const isHorizontal = horizontalSetting && !mobileViewport.matches;
    if (horizontalMode === isHorizontal) {
      return;
    }

    const currentIndex =
      horizontalMode === null
        ? 0
        : Math.round(
            (horizontalMode ? scroller.scrollLeft : scroller.scrollTop) /
              (horizontalMode ? scroller.clientWidth : scroller.clientHeight),
          );

    scroller.classList.toggle("horizontal", isHorizontal);
    scroller.classList.toggle("vertical", !isHorizontal);
    horizontalMode = isHorizontal;

    if (scroller.children.length) {
      requestAnimationFrame(() => {
        scroller.scrollTo({
          left: isHorizontal ? currentIndex * scroller.clientWidth : 0,
          top: isHorizontal ? 0 : currentIndex * scroller.clientHeight,
          behavior: "auto",
        });
      });
    }
  }

  updateScrollMode();
  window.addEventListener("resize", updateScrollMode);

  const sections = Array.isArray(data.sections)
    ? data.sections.filter((section) => section && section.path)
    : [];
  const hasOrder = sections.length > 0 && sections.every((section) =>
    Number.isFinite(Number(section.Order)),
  );
  const orderedSections = hasOrder
    ? [...sections].sort((a, b) => Number(a.Order) - Number(b.Order))
    : sections;

  const observer = new IntersectionObserver(
    (entries) => {
      const activeEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!activeEntry) {
        return;
      }

      scroller.querySelectorAll(".section-frame.active").forEach((frame) => {
        frame.classList.remove("active");
      });
      activeEntry.target.classList.add("active");

      const targetBgId = activeEntry.target.dataset.bgId;
      if (targetBgId && bgFrame && bgFrame.contentWindow) {
        bgFrame.contentWindow.postMessage(
          { type: "SET_STATE", state: Number(targetBgId) },
          "*",
        );
      }
    },
    { root: scroller, threshold: 0.5 },
  );

  orderedSections.forEach((sec) => {
    const iframe = document.createElement("iframe");
    iframe.id = sec.id;
    iframe.src = sec.path;
    iframe.className = "section-frame";
    iframe.title = sec.title || "Section";

    if (sec["Background-id"] !== undefined) {
      iframe.dataset.bgId = sec["Background-id"];
    }

    if (!scroller.children.length) {
      iframe.classList.add("active");
    }

    scroller.appendChild(iframe);
    observer.observe(iframe);
  });

  if (horizontalSetting) {
    scroller.addEventListener(
      "wheel",
      (e) => {
        if (!mobileViewport.matches && e.deltaY !== 0) {
          e.preventDefault();
          scroller.scrollLeft += e.deltaY;
        }
      },
      { passive: false },
    );
  }
}

initViewer();
