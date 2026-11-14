async function initViewer() {
  let data;
  try {
    const response = await fetch("pages.json");
    if (!response.ok) throw new Error("pages.json not found");
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

  const sortedSections = (Array.isArray(data.sections) ? data.sections : [])
    .filter((section) => section && section.path)
    .sort((a, b) => Number(a.Order || 0) - Number(b.Order || 0));
  const frames = [];
  const mobileViewport = window.matchMedia("(max-width: 768px)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const FADE_MS = 500;
  let currentIndex = 0;
  let transitionUntil = 0;
  let lastWheelTime = -Infinity;
  let wheelTotal = 0;
  let wheelGestureUsed = false;
  let touchStart = null;

  function sendBgState(index) {
    const targetBgId = frames[index]?.dataset.bgId;
    if (targetBgId !== undefined && bgFrame?.contentWindow) {
      bgFrame.contentWindow.postMessage(
        { type: "SET_STATE", state: Number(targetBgId) },
        "*",
      );
    }
  }

  function goToSection(index, force = false) {
    if (!Number.isInteger(index) || index < 0 || index >= frames.length) return;
    const changed = index !== currentIndex;
    if (!changed && !force) return;

    currentIndex = index;
    if (changed) {
      transitionUntil =
        performance.now() + (reducedMotion.matches ? 0 : FADE_MS);
    }
    // Every iframe occupies the same viewport. CSS fades the old and new layers.
    frames.forEach((frame, frameIndex) => {
      const active = frameIndex === index;
      if (!active && document.activeElement === frame) frame.blur();
      frame.classList.toggle("active", active);
      frame.inert = !active;
      frame.tabIndex = active ? 0 : -1;
      frame.setAttribute("aria-hidden", String(!active));
    });
    sendBgState(index);
    window.dispatchEvent(
      new CustomEvent("sectionchange", { detail: { index } }),
    );
  }

  function handleWheelDelta(deltaX, deltaY) {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
    const delta = Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : deltaX;
    if (!delta) return;
    const now = performance.now();
    // A trackpad's momentum belongs to one gesture, not several section changes.
    if (now - lastWheelTime > 180) {
      wheelTotal = 0;
      wheelGestureUsed = false;
    }
    lastWheelTime = now;
    if (wheelGestureUsed) return;
    if (Math.sign(wheelTotal) !== Math.sign(delta)) wheelTotal = 0;
    wheelTotal += delta;
    if (Math.abs(wheelTotal) < 40) return;
    wheelGestureUsed = true;
    if (now >= transitionUntil)
      goToSection(currentIndex + Math.sign(wheelTotal));
  }

  function handleKeydown(event) {
    const target = event.target;
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      target?.isContentEditable ||
      target?.closest?.("input, textarea, select, button, [role='slider']")
    )
      return;
    let nextIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      nextIndex = currentIndex + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      nextIndex = currentIndex - 1;
    else return;
    event.preventDefault();
    if (!event.repeat && performance.now() >= transitionUntil)
      goToSection(nextIndex);
  }

  function bindTouchNavigation(target) {
    target.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches.length !== 1) {
          touchStart = null;
          return;
        }
        const touch = event.touches[0];
        touchStart = {
          x: touch.clientX,
          y: touch.clientY,
          index: currentIndex,
        };
      },
      { passive: true },
    );
    target.addEventListener(
      "touchend",
      (event) => {
        const start = touchStart;
        touchStart = null;
        if (
          !start ||
          event.touches.length ||
          start.index !== currentIndex ||
          performance.now() < transitionUntil
        )
          return;
        const touch = event.changedTouches[0];
        if (!touch) return;
        const dx = start.x - touch.clientX;
        const dy = start.y - touch.clientY;
        const horizontal = Boolean(data.horizontal) && !mobileViewport.matches;
        const delta = horizontal ? dx : dy;
        const perpendicular = horizontal ? dy : dx;
        if (
          Math.abs(delta) >= 64 &&
          Math.abs(delta) > Math.abs(perpendicular)
        ) {
          goToSection(currentIndex + Math.sign(delta));
        }
      },
      { passive: true },
    );
    target.addEventListener(
      "touchcancel",
      () => {
        touchStart = null;
      },
      { passive: true },
    );
  }

  sortedSections.forEach((section, index) => {
    const iframe = document.createElement("iframe");
    if (section.id) iframe.id = section.id;
    iframe.src = section.path;
    iframe.className = "section-frame";
    iframe.title = section.title || "Section";
    iframe.inert = true;
    iframe.tabIndex = -1;
    iframe.setAttribute("aria-hidden", "true");
    if (section["Background-id"] !== undefined) {
      iframe.dataset.bgId = section["Background-id"];
    }
    iframe.addEventListener("load", () => {
      // Local sections can receive swipes and arrow keys while the iframe has focus.
      // Remote sections keep using the existing SECTION_WHEEL message bridge.
      try {
        const sectionDocument = iframe.contentDocument;
        if (sectionDocument) {
          bindTouchNavigation(sectionDocument);
          sectionDocument.addEventListener("keydown", (event) => {
            if (index === currentIndex) handleKeydown(event);
          });
        }
      } catch (_) {
        /* Cross-origin documents cannot be accessed by the parent. */
      }
    });
    scroller.appendChild(iframe);
    frames.push(iframe);
  });

  window.viewerApp = {
    sections: sortedSections,
    goToSection,
    getCurrentIndex: () => currentIndex,
  };

  if (bgFrame) {
    bgFrame.addEventListener("load", () => sendBgState(currentIndex));
    if (data.background) bgFrame.src = data.background;
  }

  // Commit the initial opacity: 0 before enabling the first section's fade-in.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (frames.length) goToSection(currentIndex, true);
    });
  });

  scroller.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? scroller.clientHeight
            : 1;
      handleWheelDelta(event.deltaX * unit, event.deltaY * unit);
    },
    { passive: false },
  );

  window.addEventListener("message", (event) => {
    if (
      event.data?.type === "SECTION_WHEEL" &&
      event.source === frames[currentIndex]?.contentWindow
    ) {
      handleWheelDelta(event.data.deltaX, event.data.deltaY);
    }
  });
  window.addEventListener("keydown", handleKeydown);
  bindTouchNavigation(scroller);
}

initViewer();
