const VISIBLE = 12;

function visibleForWidth(n) {
  const w = window.innerWidth;
  const max = w < 600 ? 5 : w < 1000 ? 8 : VISIBLE;
  return Math.min(max, n);
}

async function initTimeline() {
  const response = await fetch("pages.json");
  const data = await response.json();
  const scroller = document.getElementById("scroller");
  const timeline = document.getElementById("timeline");
  const isHorizontal = Boolean(data.horizontal);
  const sections = data.sections;
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

    const callout = document.createElement("span");
    callout.className = "timeline-callout";
    callout.innerHTML =
      '<svg class="timeline-callout-line" width="32" height="32" viewBox="0 0 32 32">' +
      '<line x1="0" y1="32" x2="32" y2="0" /></svg>';
    const title = document.createElement("span");
    title.className = "timeline-title";
    title.textContent = sec.title;
    callout.appendChild(title);

    const dot = document.createElement("span");
    dot.className = "timeline-dot";

    const year = document.createElement("span");
    year.className = "timeline-year";
    year.textContent = sec.year ?? "";

    point.append(callout, dot, year);
    point.addEventListener("click", () => goTo(i));
    track.appendChild(point);
    return point;
  });

  if (eras.length) timeline.appendChild(erasRow);
  timeline.appendChild(track);

  function goTo(i) {
    if (isHorizontal) scroller.scrollTo({ left: i * scroller.clientWidth });
    else scroller.scrollTo({ top: i * scroller.clientHeight });
  }

  const posOf = (i, windowStart) => ((i - windowStart) / span) * 100;

  let lastActive = -1;

  function update() {
    const pos = isHorizontal
      ? scroller.scrollLeft / scroller.clientWidth
      : scroller.scrollTop / scroller.clientHeight;
    const active = Math.min(Math.max(Math.round(pos), 0), n - 1);
    if (active === lastActive) return;
    lastActive = active;

    const windowStart = Math.min(
      Math.max(active - Math.floor(visible / 2), 0),
      n - visible,
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

  timeline.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      scroller.scrollBy(isHorizontal ? { left: e.deltaY } : { top: e.deltaY });
    },
    { passive: false },
  );

  scroller.addEventListener("scroll", update);
  window.addEventListener("resize", () => {
    visible = visibleForWidth(n);
    span = Math.max(visible - 1, 1);
    lastActive = -1;
    update();
  });
  update();
}

initTimeline();