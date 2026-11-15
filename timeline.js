const VISIBLE = 9;

function visibleForWidth(n) {
  const w = window.innerWidth;
  const max = w <= 700 ? 3 : w < 1100 ? 6 : VISIBLE;
  return Math.min(max, n);
}

async function initTimeline() {
  const response = await fetch("pages.json");
  const data = await response.json();
  const timeline = document.getElementById("timeline");

  // Match the exact same sort order as core_viewer.js
  const sections = [...data.sections].sort((a, b) => a.Order - b.Order);
  const n = sections.length;
  let visible = visibleForWidth(n);
  let span = Math.max(visible - 1, 1);

  const eras = [];
  sections.forEach((sec, i) => {
    if (!sec.era) return;
    const prev = eras[eras.length - 1];
    if (prev && prev.name === sec.era && prev.end === i - 1) prev.end = i;
    else eras.push({ name: sec.era, start: i, end: i });
  });

  const erasRow = document.createElement("div");
  erasRow.className = "timeline-eras";
  const eraEls = eras.map((era) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "timeline-era";
    el.title = era.name;
    // Name in its own span so a long era name ends in "…" instead of being cut
    const name = document.createElement("span");
    name.className = "timeline-era-name";
    name.textContent = era.name;
    el.appendChild(name);
    el.addEventListener("click", () => goTo(era.start));
    erasRow.appendChild(el);
    return el;
  });

  const track = document.createElement("div");
  track.className = "timeline-track";

  const progress = document.createElement("div");
  progress.className = "timeline-progress";
  track.appendChild(progress);

  const points = sections.map((sec, i) => {
    const point = document.createElement("button");
    point.type = "button";
    point.className = "timeline-point";
    point.title = sec.title;

    const label = document.createElement("span");
    label.className = "timeline-label";
    label.textContent = sec.title;

    const callout = document.createElement("span");
    callout.className = "timeline-callout";
    callout.innerHTML =
      '<svg class="timeline-callout-line" width="30" height="30" viewBox="0 0 30 30">' +
      '<line x1="0" y1="30" x2="30" y2="0" /></svg>';
    const title = document.createElement("span");
    title.className = "timeline-title";
    title.textContent = sec.title;
    callout.appendChild(title);

    const dot = document.createElement("span");
    dot.className = "timeline-dot";

    const year = document.createElement("span");
    year.className = "timeline-year";
    year.textContent = sec.year ?? "";

    point.append(label, callout, dot, year);
    point.addEventListener("click", () => goTo(i));
    track.appendChild(point);
    return point;
  });

  // Title of the active event, centred above the line (only visible on phones)
  const current = document.createElement("div");
  current.className = "timeline-current";
  current.setAttribute("aria-live", "polite");

  if (eras.length) timeline.appendChild(erasRow);
  timeline.append(current, track);

  function goTo(i) {
    if (window.viewerApp) {
      window.viewerApp.goToSection(i, true); // force = true so clicking timeline dots works immediately
    }
  }

  // [AI-GENERATED] The helpers posOf(), halfStep() and the update() function below were generated with the help of Claude (Anthropic).
  const posOf = (i, windowStart) => ((i - windowStart) / span) * 100;
  // The line continues half a step past the first and last visible points,
  // as far as the era row (at most 9%, which is inside the side padding)
  const halfStep = () => Math.min(50 / span, 9);
  let lastActive = -1;

  function update(activeIndex) {
    const active = Math.min(Math.max(activeIndex, 0), n - 1);
    if (active === lastActive) return;
    lastActive = active;

    const windowStart = Math.min(
      Math.max(active - Math.floor(visible / 2), 0),
      Math.max(n - visible, 0),
    );
    const windowEnd = windowStart + visible - 1;

    points.forEach((p, i) => {
      const left = posOf(i, windowStart);
      p.style.left = left + "%";
      p.classList.toggle("hidden", i < windowStart || i > windowEnd);
      p.classList.toggle("active", i === active);
      p.classList.toggle("passed", i < active);
      p.classList.toggle("flip", left > 75);
      p.classList.toggle("edge-left", left < 1);
      p.classList.toggle("edge-right", left > 99);
    });

    current.textContent = sections[active]?.title ?? "";

    const half = halfStep();
    track.style.setProperty("--half", half + "%");
    // Earlier sections are hidden on the left: the passed colour starts at the line's edge
    const extra = windowStart > 0 ? half : 0;
    progress.style.left = -extra + "%";
    progress.style.width = Math.max(posOf(active, windowStart), 0) + extra + "%";

    eraEls.forEach((el, k) => {
      const era = eras[k];
      const from = Math.max(posOf(era.start - 0.5, windowStart), -halfStep());
      const to = Math.min(posOf(era.end + 0.5, windowStart), 100 + halfStep());
      const outside = era.end < windowStart || era.start > windowEnd;
      el.style.left = `calc(${from}% + 4px)`;
      el.style.width = `calc(${Math.max(to - from, 0)}% - 8px)`;
      el.classList.toggle("hidden", outside);
      el.classList.toggle("active", active >= era.start && active <= era.end);
    });
  }

  // Wheel scrolling over the timeline bar steps forward/backward
  timeline.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const current = window.viewerApp
        ? window.viewerApp.getCurrentIndex()
        : lastActive;
      if (e.deltaY > 10) goTo(current + 1);
      else if (e.deltaY < -10) goTo(current - 1);
    },
    { passive: false },
  );

  // Listen for section changes from core_viewer.js
  window.addEventListener("sectionchange", (e) => {
    update(e.detail.index);
  });

  window.addEventListener("resize", () => {
    visible = visibleForWidth(n);
    span = Math.max(visible - 1, 1);
    const current = lastActive;
    lastActive = -1;
    update(current);
  });

  // Initialize at section 0
  update(0);
}

initTimeline();