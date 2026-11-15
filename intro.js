(function () {
  const videoIntro = document.getElementById("video-intro");
  const introVideo = document.getElementById("video-intro-media");
  const startButton = document.getElementById("video-intro-start");
  const skipButton = document.getElementById("video-intro-skip");
  const videoStatus = document.getElementById("video-intro-status");
  let videoIntroDismissed = false;

  function dismissVideoIntro() {
    if (videoIntroDismissed) return;
    videoIntroDismissed = true;
    introVideo.pause();
    videoIntro.classList.add("is-dismissing");
    setTimeout(() => videoIntro.remove(), 350);
  }

  startButton.addEventListener("click", () => {
    introVideo.play().catch(() => {
      videoStatus.textContent = "Unable to play the intro. You can skip it to continue.";
    });
  });
  skipButton.addEventListener("click", dismissVideoIntro);
  introVideo.addEventListener("playing", () => {
    startButton.hidden = true;
    videoStatus.textContent = "";
  });
  introVideo.addEventListener("ended", dismissVideoIntro);
  introVideo.addEventListener("error", () => {
    videoStatus.textContent = "Intro video could not be loaded. You can skip it to continue.";
  });

  const PHI = (1 + Math.sqrt(5)) / 2; 
  const STAR_COUNT = 13; 
  const SVG_NS = "http://www.w3.org/2000/svg";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Hides the timeline
  document.body.classList.add("intro-open");


  const overlay = document.createElement("div");
  overlay.id = "intro";

  // Background: Hubble Ultra Deep Field photo
  const sky = document.createElement("div");
  sky.className = "intro-sky";

  // Faint background stars (few, so the constellation stands out)
  const starCanvas = document.createElement("canvas");
  starCanvas.className = "intro-stars";
  sky.appendChild(starCanvas);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "intro-svg");

  const spiral = document.createElementNS(SVG_NS, "path");
  spiral.setAttribute("class", "intro-spiral");

  const lines = document.createElementNS(SVG_NS, "polyline");
  lines.setAttribute("class", "intro-lines");
  lines.setAttribute("pathLength", "1"); 

  svg.append(spiral, lines);

  // Constellation stars
  const stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("class", "intro-star" + (i === 0 ? " first" : ""));
    c.setAttribute("r", i === 0 ? 5 : 3.5);
    svg.appendChild(c);
    stars.push({ el: c, x: 0, y: 0 });
  }

  // Invisible button over the constellation
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "intro-trigger";
  trigger.setAttribute("aria-label", "Begin the journey");

  const hint = document.createElement("p");
  hint.className = "intro-hint";
  hint.textContent = "Click the constellation";

  overlay.append(sky, svg, trigger, hint);
  document.body.appendChild(overlay);


  // [AI-GENERATED] The function below, spiralLayout(), was generated with the help of Claude (Anthropic).
  // Golden spiral: the radius grows by PHI every quarter turn

  function spiralLayout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const t0 = Math.PI; // start angle 
    const t1 = 4 * Math.PI; // end angle 
    const point = (t) => {
      const r = Math.pow(PHI, (2 * t) / Math.PI);
      return [r * Math.cos(t), r * Math.sin(t)];
    };

    const curve = [];
    for (let k = 0; k <= 200; k++) curve.push(point(t0 + ((t1 - t0) * k) / 200));
    const starPts = [];
    for (let i = 0; i < STAR_COUNT; i++) starPts.push(point(t0 + ((t1 - t0) * i) / (STAR_COUNT - 1)));

    const xs = curve.map((p) => p[0]);
    const ys = curve.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min((w * 0.75) / (maxX - minX), (h * 0.55) / (maxY - minY));
    const cx = w / 2, cy = h * 0.45;
    const map = ([x, y]) => [
      cx + (x - (minX + maxX) / 2) * scale,
      cy + (y - (minY + maxY) / 2) * scale,
    ];

    return {
      curve: curve.map(map),
      stars: starPts.map(map),
      box: {
        left: cx - ((maxX - minX) * scale) / 2,
        top: cy - ((maxY - minY) * scale) / 2,
        width: (maxX - minX) * scale,
        height: (maxY - minY) * scale,
      },
    };
  }

  // Same "random" sky every time (seeded random numbers)
  function seeded(seed) {
    return () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  // Draws the faint background stars; fewer and dimmer around the constellation
  function drawSky(box) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    starCanvas.width = w * dpr;
    starCanvas.height = h * dpr;
    const c = starCanvas.getContext("2d");
    c.scale(dpr, dpr);
    const rand = seeded(7);
    const count = Math.round((w * h) / 16000);
    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const nearConstellation =
        x > box.left - 40 && x < box.left + box.width + 40 &&
        y > box.top - 40 && y < box.top + box.height + 40;
      if (nearConstellation && rand() < 0.6) continue;
      const r = 0.3 + rand() * 0.9;
      const alpha = (nearConstellation ? 0.15 : 0.25) + rand() * 0.4;
      const tint = rand() < 0.2 ? "255, 225, 190" : "200, 215, 255";
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = `rgba(${tint}, ${alpha})`;
      c.fill();
    }

    sky.querySelectorAll(".intro-twinkle").forEach((el) => el.remove());
    for (let i = 0; i < 6; i++) {
      const dot = document.createElement("span");
      dot.className = "intro-twinkle";
      let x, y;
      do {
        x = rand() * w;
        y = rand() * h;
      } while (x > box.left - 40 && x < box.left + box.width + 40 && y > box.top - 40 && y < box.top + box.height + 40);
      dot.style.left = x + "px";
      dot.style.top = y + "px";
      dot.style.animationDelay = (rand() * 4).toFixed(2) + "s";
      sky.appendChild(dot);
    }
  }

  // Draws the spiral, stars and lines, and places the click area over them
  function render() {
    const layout = spiralLayout();
    drawSky(layout.box);
    spiral.setAttribute(
      "d",
      layout.curve.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" "),
    );
    layout.stars.forEach(([x, y], i) => {
      stars[i].x = x;
      stars[i].y = y;
      stars[i].el.setAttribute("cx", x);
      stars[i].el.setAttribute("cy", y);
    });
    lines.setAttribute("points", layout.stars.map((p) => p.join(",")).join(" "));
    const pad = 30; 
    Object.assign(trigger.style, {
      left: layout.box.left - pad + "px",
      top: layout.box.top - pad + "px",
      width: layout.box.width + pad * 2 + "px",
      height: layout.box.height + pad * 2 + "px",
    });
  }

  // Where each star lands: evenly spaced along the timeline's line

  function trackTargets() {
    const track = document.querySelector(".timeline-track");
    let x1, x2, y;
    if (track) {
      const r = track.getBoundingClientRect();
      x1 = r.left;
      x2 = r.right;
      y = r.top + r.height / 2;
    } else {
      x1 = window.innerWidth * 0.08;
      x2 = window.innerWidth * 0.92;
      y = window.innerHeight - 50;
    }
    return stars.map((_, i) => [x1 + ((x2 - x1) * i) / (STAR_COUNT - 1), y]);
  }

  // [AI-POLISHED] The functions ease(), play() and finish() below were written by us and polished with the help of Claude (Anthropic).
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  let playing = false;

  function play() {
    if (playing) return;
    playing = true;
    window.removeEventListener("resize", render);
    overlay.classList.add("is-leaving"); // fades the sky, spiral and text (see intro.css)

    if (reduceMotion) {
      document.body.classList.remove("intro-open");
      finish();
      return;
    }

    const targets = trackTargets();
    const from = stars.map((s) => [s.x, s.y]);
    const duration = 1400; // ms each star takes to fly to the timeline
    const stagger = 70; // ms between stars
    const start = performance.now();

    // Show the timeline while the last stars are still landing
    setTimeout(() => document.body.classList.remove("intro-open"), 900 + stagger * STAR_COUNT);

    function frame(now) {
      let done = true;
      const pts = stars.map((s, i) => {
        let k = (now - start - i * stagger) / duration;
        if (k < 1) done = false;
        k = ease(Math.min(Math.max(k, 0), 1));
        const x = from[i][0] + (targets[i][0] - from[i][0]) * k;
        const y = from[i][1] + (targets[i][1] - from[i][1]) * k;
        s.el.setAttribute("cx", x);
        s.el.setAttribute("cy", y);
        return x + "," + y;
      });
      lines.setAttribute("points", pts.join(" "));
      if (done) finish();
      else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function finish() {
    overlay.classList.add("is-done");
    setTimeout(() => {
      overlay.remove();
      document.body.classList.remove("intro-open");
    }, 700);
  }


  render();
  window.addEventListener("resize", render);
  trigger.addEventListener("click", play);

  requestAnimationFrame(() => {
    lines.classList.add("drawn");
    stars.forEach((s, i) => {
      s.el.style.transitionDelay = 0.2 + i * 0.15 + "s";
      s.el.classList.add("shown");
    });
  });
})();