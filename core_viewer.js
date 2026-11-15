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

  const sections = Array.isArray(data.sections)
    ? data.sections.filter((section) => section && section.path)
    : [];
  const sortedSections = [...sections].sort(
    (a, b) => Number(a.Order || 0) - Number(b.Order || 0),
  );
  const frames = [];
  let currentIndex = 0;
  let locked = false;
  const TRANSITION_COOLDOWN = 700;

  // [AI-POLISHED] The functions sendBgState() and setActiveSection() below were written by us and polished with the help of Claude (Anthropic).
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

  // Sections are stacked on top of each other; changing section fades between them
  function goToSection(index, force = false) {
    if (!Number.isInteger(index) || index < 0 || index >= frames.length) {
      return;
    }
    if (index === currentIndex && !force) {
      return;
    }
    if (locked && !force) {
      return;
    }

    locked = true;
    setTimeout(() => {
      locked = false;
    }, TRANSITION_COOLDOWN);
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

    // [AI-GENERATED] The iframe "load" listener below (safety net that injects wheel_event_forward.js) was generated with the help of Claude (Anthropic).
    // Safety net: a section page without wheel_event_forward.js (e.g. a missing
    // folder that loads a 404 page) gets the script added, so wheel and swipe
    // keep working on it
    iframe.addEventListener("load", () => {
      try {
        const sectionWindow = iframe.contentWindow;
        const sectionDocument = iframe.contentDocument;
        if (!sectionDocument || sectionWindow.__gesturesForwarded) {
          return;
        }
        const script = sectionDocument.createElement("script");
        script.src = new URL("wheel_event_forward.js", location.href).href;
        (sectionDocument.head || sectionDocument.documentElement).appendChild(script);
      } catch {
        // Section from another origin: it has to include the script itself
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

  function handleWheelDelta(deltaX, deltaY) {
    const delta = Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : deltaX;
    if (delta > 20) {
      goToSection(currentIndex + 1);
    } else if (delta < -20) {
      goToSection(currentIndex - 1);
    }
  }

  // Wheel over the parent page (outside the sections)
  window.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      handleWheelDelta(event.deltaX, event.deltaY);
    },
    { passive: false },
  );

  // Wheel and swipes forwarded from inside the sections (wheel_event_forward.js)
  window.addEventListener("message", (event) => {
    if (event.data?.type === "SECTION_WHEEL") {
      handleWheelDelta(event.data.deltaX, event.data.deltaY);
    } else if (event.data?.type === "SECTION_SWIPE") {
      goToSection(currentIndex + Math.sign(event.data.direction));
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
