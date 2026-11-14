async function initViewer() {
  const response = await fetch("pages.json");
  const data = await response.json();
  const scroller = document.getElementById("scroller");
  const bgFrame = document.getElementById("bg-frame");

  if (data.background) {
    bgFrame.src = data.background;
  }

  // Sort sections by "Order"
  const sortedSections = [...data.sections].sort((a, b) => a.Order - b.Order);
  const frames = [];

  // Build stacked iframes
  sortedSections.forEach((sec) => {
    const iframe = document.createElement("iframe");
    iframe.id = sec.id;
    iframe.src = sec.path;
    iframe.className = "section-frame";
    iframe.title = sec.title;

    if (sec["Background-id"] !== undefined) {
      iframe.dataset.bgId = sec["Background-id"];
    }

    scroller.appendChild(iframe);
    frames.push(iframe);
  });

  let currentIndex = 0;
  let isTransitioning = false;
  const TRANSITION_COOLDOWN = 700;

  function sendBgState(frame) {
    const targetBgId = frame?.dataset.bgId;
    if (targetBgId !== undefined && bgFrame.contentWindow) {
      bgFrame.contentWindow.postMessage(
        { type: "SET_STATE", state: Number(targetBgId) },
        "*",
      );
    }
  }

  function goToSection(index) {
    if (
      index < 0 ||
      index >= frames.length ||
      index === currentIndex ||
      isTransitioning
    ) {
      return;
    }

    isTransitioning = true;

    frames[currentIndex].classList.remove("active");
    frames[index].classList.add("active");
    currentIndex = index;

    sendBgState(frames[currentIndex]);

    setTimeout(() => {
      isTransitioning = false;
    }, TRANSITION_COOLDOWN);
  }

  function handleWheelDelta(deltaX, deltaY) {
    const delta = Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : deltaX;
    if (delta > 20) {
      goToSection(currentIndex + 1);
    } else if (delta < -20) {
      goToSection(currentIndex - 1);
    }
  }

  // Initialize first section and sync background once bg-frame loads
  if (frames.length > 0) {
    frames[0].classList.add("active");
    bgFrame.addEventListener("load", () => sendBgState(frames[0]), {
      once: true,
    });
  }

  // Listen for wheel events forwarded from section iframes
  window.addEventListener("message", (e) => {
    if (e.data?.type === "SECTION_WHEEL") {
      handleWheelDelta(e.data.deltaX, e.data.deltaY);
    }
  });

  // Fallback wheel listener if scrolling outside an iframe
  window.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      handleWheelDelta(e.deltaX, e.deltaY);
    },
    { passive: false },
  );

  // Keyboard arrow navigation
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      goToSection(currentIndex + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      goToSection(currentIndex - 1);
    }
  });
}

initViewer();
