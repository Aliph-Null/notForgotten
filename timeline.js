const VISIBLE = 9;

function visibleForWidth(n) {
  const w = window.innerWidth;
  const max = w < 600 ? 5 : w < 1000 ? 8 : VISIBLE;
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
    el.textContent = era.name;
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
      '<svg class="timeline-callout-line" width="34" height="34" viewBox="0 0 34 34">' +
      '<line x1="0" y1="34" x2="34" y2="0" /></svg>';
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

  if (eras.length) timeline.appendChild(erasRow);
  timeline.appendChild(track);

  function goTo(i) {
    if (window.viewerApp) {
      window.viewerApp.goToSection(i, true); // force = true so clicking timeline dots works immediately
    }
  }

  const posOf = (i, windowStart) => ((i - windowStart) / span) * 100;
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
    });

    progress.style.width = Math.max(posOf(active, windowStart), 0) + "%";

    eraEls.forEach((el, k) => {
      const era = eras[k];
      const from = Math.max(posOf(era.start - 0.5, windowStart), -5);
      const to = Math.min(posOf(era.end + 0.5, windowStart), 105);
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
