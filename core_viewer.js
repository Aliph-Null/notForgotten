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
  if (!scroller) {
    console.error("Section scroller not found");
    return;
  }

  const horizontalSetting = Boolean(data.horizontal);
  const mobileViewport = window.matchMedia("(max-width: 768px)");
  const sections = Array.isArray(data.sections)
    ? data.sections.filter((section) => section && section.path)
    : [];
  const sortedSections = [...sections].sort(
    (a, b) => Number(a.Order || 0) - Number(b.Order || 0),
  );
  const frames = [];
  let currentIndex = 0;
  let horizontalMode = null;

  function sendBgState(index) {
    const targetBgId = frames[index]?.dataset.bgId;
    if (targetBgId !== undefined && bgFrame && bgFrame.contentWindow) {
      bgFrame.contentWindow.postMessage(
        { type: "SET_STATE", state: Number(targetBgId) },
        "*",
      );
    }
  }

  function setActiveSection(index, notify = false) {
    if (!Number.isInteger(index) || index < 0 || index >= frames.length) {
      return;
    }

    const changed = index !== currentIndex;
    currentIndex = index;
    frames.forEach((frame, frameIndex) => {
      frame.classList.toggle("active", frameIndex === index);
    });

    if (changed || notify) {
      sendBgState(index);
      window.dispatchEvent(
        new CustomEvent("sectionchange", { detail: { index } }),
      );
    }
  }

  function currentScrollIndex() {
    if (horizontalMode === null || frames.length === 0) {
      return currentIndex;
    }

    const pageSize = horizontalMode
      ? scroller.clientWidth
      : scroller.clientHeight;
    const scrollPosition = horizontalMode
      ? scroller.scrollLeft
      : scroller.scrollTop;

    return pageSize > 0
      ? Math.min(
          Math.max(Math.round(scrollPosition / pageSize), 0),
          frames.length - 1,
        )
      : currentIndex;
  }

  function updateScrollMode() {
    const nextMode = horizontalSetting && !mobileViewport.matches;
    const index = currentScrollIndex();
    const modeChanged = horizontalMode !== nextMode;

    scroller.classList.toggle("horizontal", nextMode);
    scroller.classList.toggle("vertical", !nextMode);
    horizontalMode = nextMode;

    requestAnimationFrame(() => {
      scroller.scrollTo({
        left: nextMode ? index * scroller.clientWidth : 0,
        top: nextMode ? 0 : index * scroller.clientHeight,
        behavior: "auto",
      });
      if (modeChanged) {
        setActiveSection(index);
      }
    });
  }

  function goToSection(index, force = false) {
    if (!Number.isInteger(index) || index < 0 || index >= frames.length) {
      return;
    }
    if (index === currentIndex && !force) {
      return;
    }

    scroller.scrollTo({
      left: horizontalMode ? index * scroller.clientWidth : 0,
      top: horizontalMode ? 0 : index * scroller.clientHeight,
      behavior: "smooth",
    });
    setActiveSection(index, true);
  }

  sortedSections.forEach((sec, index) => {
    const iframe = document.createElement("iframe");
    iframe.id = sec.id;
    iframe.src = sec.path;
    iframe.className = "section-frame";
    iframe.title = sec.title || "Section";

    if (sec["Background-id"] !== undefined) {
      iframe.dataset.bgId = sec["Background-id"];
    }

    if (index === 0) {
      iframe.classList.add("active");
    }

    scroller.appendChild(iframe);
    frames.push(iframe);
  });

  window.viewerApp = {
    sections: sortedSections,
    goToSection,
    getCurrentIndex: () => currentIndex,
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const activeEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (activeEntry) {
        setActiveSection(frames.indexOf(activeEntry.target));
      }
    },
    { root: scroller, threshold: 0.5 },
  );

  frames.forEach((frame) => observer.observe(frame));
  if (frames.length > 0) {
    setActiveSection(0, true);
  }

  if (bgFrame) {
    bgFrame.addEventListener("load", () => sendBgState(currentIndex), {
      once: true,
    });
    if (data.background) {
      bgFrame.src = data.background;
    }
  }

  updateScrollMode();
  window.addEventListener("resize", updateScrollMode);

  if (horizontalSetting) {
    scroller.addEventListener(
      "wheel",
      (event) => {
        if (
          !mobileViewport.matches &&
          Math.abs(event.deltaY) > Math.abs(event.deltaX)
        ) {
          event.preventDefault();
          scroller.scrollBy({ left: event.deltaY, behavior: "auto" });
        }
      },
      { passive: false },
    );
  }

  function handleWheelDelta(deltaX, deltaY) {
    const delta = Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : deltaX;
    if (delta > 20) {
      goToSection(currentIndex + 1);
    } else if (delta < -20) {
      goToSection(currentIndex - 1);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.data?.type === "SECTION_WHEEL") {
      handleWheelDelta(event.data.deltaX, event.data.deltaY);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      goToSection(currentIndex + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      goToSection(currentIndex - 1);
    }
  });
}

initViewer();
