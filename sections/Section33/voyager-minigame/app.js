const grid = document.querySelector("#grid");
const shapeList = document.querySelector("#shape-list");
const offRack = document.querySelector("#off-rack");
const data = {};
const pieces = [];
const retiredKeys = new Set();
let config;
let state;
let shapes = [];
let mode = "move";
let tier = "medium";
let dragState = null;
let cutPreview = null;
let pendingStitch = null;
let pointers = [];
let lastProbe = null;
let pointerLayer = null;
let gridCells = [];
let tlmTimer = null;
let cutCount = 0;
let booted = false;
let truthEarned = false;

async function loadGame() {
  const [configResponse, stateResponse, gameResponse] = await Promise.all([
    fetch("config.json"),
    fetch("grid-state.json"),
    fetch("game-data.json")
  ]);
  if (!configResponse.ok || !stateResponse.ok || !gameResponse.ok) throw new Error("Mission files could not be loaded.");
  config = await configResponse.json();
  data.state = await stateResponse.json();
  data.game = await gameResponse.json();
  applyTier(tier);
}

function updatePieceLabel(item) {
  const label = item.element.querySelector(".piece-label");
  if (!label) return;
  label.textContent = item.shape.identified
    ? `${item.shape.name} · ${item.shape.metadata.power || 0} W`
    : "???";
}

function applyTier(nextTier) {
  tier = nextTier;
  const tierState = tier === "easy" ? data.state.tiers.easy : data.state;
  state = {
    gridSize: tierState.gridSize,
    gridHeight: tierState.gridHeight,
    grid: tierState.grid,
    shapes: tierState.shapes
  };
  config.gridSize = state.gridSize;
  config.gridHeight = state.gridHeight;
  pieces.splice(0).forEach((item) => item.element.remove());
  shapes = createShapesFromGrid();
  cutCount = 0;
  pendingStitch = null;
  pointers.length = 0;
  lastProbe = null;
  retiredKeys.clear();
  booted = false;
  truthEarned = false;
  mode = "move";
  applyConfig();
  renderGrid();
  renderShapeSources();
  shapes.forEach((shape) => createPiece(shape, shape.column, shape.row));
  setMode("move");
  renderStitchTray();
  sizeGrid();
  layoutPieces();
  updateAll();
}

function highlightAssembly(code) {
  return escapeHtml(code)
    .replace(/(^|\s)([A-Z_]+)(?=:|\s)/g, '$1<span class="label">$2</span>')
    .replace(/\b(JMP|SRB|EXC|MLD|MRD|ABS|AML|AMR|ADD|SUB|AND|LOR|LXR|SRS|SLS|SRR|ARS|LRS|LLS|LRR|SKP|SKZ|SKO|SKC|ISP|ISZ|DSP|DSZ|SKE|SLC|SWI|SWO|PWD|OUT|WAT|MCX|SETJU|SETJD|SETAU|SETAD|DMAEN|DMADI|DMAOU|DMAIN|DMAIN|DMAAD)\b/g, '<span class="opcode">$1</span>')
    .replace(/\b(R\d+|R[0-9]+)\b/g, '<span class="register">$1</span>')
    .replace(/(#?\d+|0x[0-9A-F]+)/gi, '<span class="number">$1</span>')
    .replace(/(;.*)$/gm, '<span class="comment">$1</span>');
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function expandAssembly(meta) {
  // The hard-tier source lives in game-data.json ("hard" field); this
  // generic fallback only covers blocks that ship without one.
  const fallback = [
    "SETAD",
    "BOOT:  MLD     FLAG",
    "        LOR     1",
    "        PWD     FLAG",
    "        WAT     10",
    "        SKZ     F80",
    "        JMP     BOOT",
    "TICK:  MLD     COUNT",
    "        ADD     1",
    "        PWD     COUNT",
    "        OUT     2",
    "        JMP     TICK"
  ];
  const profile = meta.hard
    ? meta.hard.split("\n").filter(Boolean)
    : fallback;
  const lineCount = Math.max(3, config.assembly.lineCount);
  const fillerCount = Math.max(0, lineCount - profile.length - 1);
  const filler = Array.from({ length: fillerCount }, (_, index) => {
    const operation = ["SETAD", "MLD", "SKZ", "JMP", "SETAU", "SWO", "SKC", "SETJD"][index % 8];
    const operand = ["F80", "TABLE", "F81", "RETRY", "F82", "STATUS", "F83", "RETURN"][index % 8];
    const label = index % 7 === 0 ? `L${String(index).padStart(2, "0")}: ` : "          ";
    return `${label}${operation.padEnd(7, " ")}${operand}    ; banked relocation ${index + 1}`;
  });
  const beforeCore = Math.floor(filler.length * 0.4);
  return [...filler.slice(0, beforeCore), "; remapped FDS source / preserved branch entry", ...profile, ...filler.slice(beforeCore)].slice(0, lineCount).join("\n");
}

function createShapesFromGrid() {
  const result = [];
  const visited = new Set();
  for (let row = 0; row < state.gridHeight; row += 1) {
    for (let column = 0; column < state.gridSize; column += 1) {
      const character = state.shapes[row][column];
      const startKey = `${column},${row}`;
      if (visited.has(startKey) || !/^[A-Za-z]$/.test(character)) continue;
      const queue = [[column, row]];
      const cells = [];
      visited.add(startKey);
      while (queue.length) {
        const [x, y] = queue.shift();
        cells.push([x, y]);
        [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].forEach(([nextX, nextY]) => {
          const key = `${nextX},${nextY}`;
          if (nextX >= 0 && nextX < state.gridSize && nextY >= 0 && nextY < state.gridHeight
            && !visited.has(key) && state.shapes[nextY][nextX] === character) {
            visited.add(key);
            queue.push([nextX, nextY]);
          }
        });
      }
      const minX = Math.min(...cells.map(([x]) => x));
      const minY = Math.min(...cells.map(([, y]) => y));
      const meta = data.game.blocks[character];
      result.push({
        id: `state-${character}-${result.length}`,
        rootKey: character,
        character,
        name: meta?.name || `BLOCK ${character}`,
        color: meta?.color || config.shape.colors?.[character] || "#87938d",
        metadata: meta || { name: `BLOCK ${character}`, power: 0, science: 0, address: "0x00000" },
        cells: cells.map(([x, y]) => [x - minX, y - minY]),
        column: minX,
        row: minY,
        identified: tier === "easy",
        fragment: false
      });
    }
  }
  return result;
}

function renderGrid() {
  grid.replaceChildren();
  grid.style.setProperty("--grid-columns", state.gridSize);
  grid.style.setProperty("--grid-rows", state.gridHeight);
  gridCells = [];
  for (let index = 0; index < state.gridSize * state.gridHeight; index += 1) {
    const cell = document.createElement("div");
    const row = Math.floor(index / state.gridSize);
    const column = index % state.gridSize;
    cell.className = "grid-cell";
    cell.classList.toggle("dead-cell", state.grid[row][column] === 1);
    cell.classList.toggle("reserved-cell", state.grid[row][column] === 2);
    grid.append(cell);
    gridCells.push(cell);
  }
  pointerLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  pointerLayer.setAttribute("class", "pointer-layer");
  grid.append(pointerLayer);
}

function renderShapeSources() {
  shapeList.replaceChildren();
  shapes.forEach((shape) => {
    const source = document.createElement("div");
    source.className = "shape-source";
    source.style.color = shape.color;
    source.innerHTML = `<span class="source-icon">${shape.metadata.icon || "◆"}</span><span>${shape.name}</span>`;
    source.addEventListener("pointerdown", (event) => beginSourceDrag(event, shape));
    shapeList.append(source);
  });
}

function createPiece(shape, column, row) {
  const piece = document.createElement("div");
  piece.className = `piece ${shape.identified ? "identified" : "unknown"}`;
  piece.style.color = shape.color;
  piece.dataset.shapeId = shape.id;
  piece.append(createOutline(shape));
  const label = document.createElement("span");
  label.className = "piece-label";
  piece.append(label);
  shape.cells.forEach(([x, y]) => {
    const cell = document.createElement("span");
    cell.className = "piece-cell";
    cell.dataset.x = String(x);
    cell.dataset.y = String(y);
    piece.append(cell);
  });
  const item = { element: piece, shape, column, row };
  updatePieceLabel(item);
  piece.addEventListener("pointerdown", (event) => beginPieceDrag(event, item));
  grid.append(piece);
  pieces.push(item);
  return item;
}

function createOutline(shape) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const bounds = getBounds(shape);
  svg.classList.add("piece-svg");
  svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", boundaryPath(shape));
  path.setAttribute("fill", "currentColor");
  path.setAttribute("fill-opacity", String(config.shape.fillOpacity));
  path.setAttribute("fill-rule", "evenodd");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", String(config.shape.strokeWidth));
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-linecap", "round");
  svg.append(path);
  return svg;
}

function getBounds(shape) {
  return {
    width: Math.max(...shape.cells.map(([x]) => x)) + 1,
    height: Math.max(...shape.cells.map(([, y]) => y)) + 1
  };
}

function boundaryPath(shape) {
  const occupied = new Set(shape.cells.map(([x, y]) => `${x},${y}`));
  const edges = [];
  shape.cells.forEach(([x, y]) => {
    if (!occupied.has(`${x},${y - 1}`)) edges.push([[x, y], [x + 1, y]]);
    if (!occupied.has(`${x + 1},${y}`)) edges.push([[x + 1, y], [x + 1, y + 1]]);
    if (!occupied.has(`${x},${y + 1}`)) edges.push([[x + 1, y + 1], [x, y + 1]]);
    if (!occupied.has(`${x - 1},${y}`)) edges.push([[x, y + 1], [x, y]]);
  });
  const outgoing = new Map(edges.map(([from, to]) => [`${from[0]},${from[1]}`, to]));
  const remaining = new Set(edges.map(([from]) => `${from[0]},${from[1]}`));
  const loops = [];
  while (remaining.size) {
    const startKey = remaining.values().next().value;
    const start = startKey.split(",").map(Number);
    const points = [start];
    let currentKey = startKey;
    while (remaining.has(currentKey)) {
      remaining.delete(currentKey);
      const next = outgoing.get(currentKey);
      points.push(next);
      currentKey = `${next[0]},${next[1]}`;
      if (currentKey === startKey) break;
    }
    const vertices = points.slice(0, -1);
    const corners = vertices.map((point, index) => {
      const previous = vertices[(index - 1 + vertices.length) % vertices.length];
      const next = vertices[(index + 1) % vertices.length];
      const radius = Math.min(config.shape.cornerRadius, distance(point, previous) / 2, distance(point, next) / 2);
      return { point, incoming: moveToward(point, previous, radius), outgoing: moveToward(point, next, radius) };
    });
    let path = `M ${corners[0].outgoing.join(" ")}`;
    corners.slice(1).forEach((corner) => {
      path += ` L ${corner.incoming.join(" ")} Q ${corner.point.join(" ")} ${corner.outgoing.join(" ")}`;
    });
    path += ` L ${corners[0].incoming.join(" ")} Q ${corners[0].point.join(" ")} ${corners[0].outgoing.join(" ")} Z`;
    loops.push(path);
  }
  return loops.join(" ");
}

function distance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function moveToward(from, to, amount) {
  const length = distance(from, to);
  return [from[0] + ((to[0] - from[0]) / length) * amount, from[1] + ((to[1] - from[1]) / length) * amount];
}

function updateGridMetrics() {
  const gridRect = grid.getBoundingClientRect();
  const borderLeft = parseFloat(getComputedStyle(grid).borderLeftWidth);
  const firstCell = grid.querySelector(".grid-cell");
  const secondCell = grid.querySelector(".grid-cell:nth-child(2)");
  const cellRect = firstCell.getBoundingClientRect();
  const nextRect = secondCell?.getBoundingClientRect();
  const cellSize = cellRect.width;
  const step = nextRect ? nextRect.left - cellRect.left : cellSize;
  document.documentElement.style.setProperty("--cell-size", `${cellSize}px`);
  document.documentElement.style.setProperty("--cell-step", `${step}px`);
  grid.dataset.originX = String(cellRect.left - gridRect.left - borderLeft);
  grid.dataset.originY = String(cellRect.top - gridRect.top - parseFloat(getComputedStyle(grid).borderTopWidth));
}

function sizeGrid() {
  const wrap = grid.parentElement.getBoundingClientRect();
  const styles = getComputedStyle(grid);
  const padding = parseFloat(styles.paddingLeft);
  const gap = parseFloat(styles.gap);
  const border = parseFloat(styles.borderLeftWidth) + parseFloat(styles.borderRightWidth);
  const cellSize = Math.max(1, Math.min(
    (wrap.width - padding * 2 - gap * (state.gridSize - 1)) / state.gridSize,
    (wrap.height - padding * 2 - gap * (state.gridHeight - 1)) / state.gridHeight
  ));
  grid.style.width = `${cellSize * state.gridSize + padding * 2 + gap * (state.gridSize - 1) + border}px`;
  grid.style.height = `${cellSize * state.gridHeight + padding * 2 + gap * (state.gridHeight - 1) + border}px`;
  grid.style.aspectRatio = "auto";
}

function redrawOutline(item) {
  // The outline is built from shape.cells, so any stitch that moves cells
  // must rebuild it or the visual lags behind the collider.
  item.element.querySelector(".piece-svg")?.remove();
  item.element.append(createOutline(item.shape));
}

function layoutPieces() {
  updateGridMetrics();
  const originX = Number(grid.dataset.originX);
  const originY = Number(grid.dataset.originY);
  const step = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-step"));
  const cellSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-size"));
  pieces.forEach((item) => {
    const bounds = getBounds(item.shape);
    item.element.style.width = `${bounds.width * cellSize}px`;
    item.element.style.height = `${bounds.height * cellSize}px`;
    item.element.style.left = `${originX + item.column * step}px`;
    item.element.style.top = `${originY + item.row * step}px`;
    item.element.querySelectorAll(".piece-cell").forEach((cell) => {
      cell.style.left = `${Number(cell.dataset.x) * cellSize}px`;
      cell.style.top = `${Number(cell.dataset.y) * cellSize}px`;
    });
  });
  renderPointers();
}

function clampPosition(shape, column, row) {
  const bounds = getBounds(shape);
  return {
    column: Math.max(0, Math.min(state.gridSize - bounds.width, column)),
    row: Math.max(0, Math.min(state.gridHeight - bounds.height, row))
  };
}

function positionFromPointer(event, shape, offsetX = 0, offsetY = 0) {
  const rect = grid.getBoundingClientRect();
  const originX = Number(grid.dataset.originX);
  const originY = Number(grid.dataset.originY);
  const step = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-step"));
  return clampPosition(shape,
    Math.round((event.clientX - rect.left - originX) / step - offsetX),
    Math.round((event.clientY - rect.top - originY) / step - offsetY));
}

function setMode(nextMode) {
  mode = nextMode;
  document.querySelectorAll(".action-button").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  const messages = {
    move: "Move blocks into surviving memory. Click a block to probe it.",
    slice: "Hover an inside edge, click to slice, then click a glowing seam cell to stitch a pointer."
  };
  document.querySelector("#tool-message").textContent = messages[mode] || "Select a target.";
  clearCutPreview();
}

function beginSourceDrag(event, shape) {
  if (mode !== "move" || event.button !== 0) return;
  event.preventDefault();
  const copy = { ...shape, id: `copy-${Date.now()}` };
  const item = createPiece(copy, 0, 0);
  layoutPieces();
  dragState = { source: "new", item, offsetX: 0.5, offsetY: 0.5, startX: event.clientX, startY: event.clientY, ghost: createDragGhost(item) };
  item.element.classList.add("dragging");
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", finishDrag, { once: true });
}

function beginPieceDrag(event, item) {
  if (event.button !== 0) return;
  if (mode !== "move") return;
  event.preventDefault();
  const rect = grid.getBoundingClientRect();
  const originX = Number(grid.dataset.originX);
  const originY = Number(grid.dataset.originY);
  const step = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-step"));
  dragState = {
    source: "move",
    item,
    // Grab offset: the piece keeps its relative position to the point of click.
    offsetX: (event.clientX - rect.left - originX) / step - item.column,
    offsetY: (event.clientY - rect.top - originY) / step - item.row,
    startX: event.clientX,
    startY: event.clientY,
    ghost: createDragGhost(item)
  };
  item.element.classList.add("dragging");
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", finishDrag, { once: true });
}

function moveDrag(event) {
  if (!dragState) return;
  if (dragState.ghost) {
    // Keep the ghost anchored to the original grab point, not the cursor center.
    const step = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-step"));
    dragState.ghost.style.left = `${event.clientX - dragState.offsetX * step}px`;
    dragState.ghost.style.top = `${event.clientY - dragState.offsetY * step}px`;
  }
  if (isOverElement(event, grid)) {
    const position = positionFromPointer(event, dragState.item.shape, dragState.offsetX, dragState.offsetY);
    dragState.item.column = position.column;
    dragState.item.row = position.row;
    layoutPieces();
    updateAll();
  }
}

function finishDrag(event) {
  window.removeEventListener("pointermove", moveDrag);
  if (!dragState) return;
  const overRack = isOverElement(event, offRack);
  const overGrid = isOverElement(event, grid);
  const moved = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
  if (overRack && dragState.source !== "new") {
    retirePiece(dragState.item);
  } else if (overGrid) {
    const position = positionFromPointer(event, dragState.item.shape, dragState.offsetX, dragState.offsetY);
    dragState.item.column = position.column;
    dragState.item.row = position.row;
    // A click that barely moved probes the block automatically.
    if (moved < 5) showProbe(dragState.item);
  } else if (dragState.source === "new") {
    dragState.item.element.remove();
    pieces.splice(pieces.indexOf(dragState.item), 1);
  }
  dragState.item.element.classList.remove("dragging");
  dragState.ghost?.remove();
  dragState = null;
  layoutPieces();
  updateAll();
}

function retirePiece(item) {
  emitDissolve(item);
  retiredKeys.add(item.shape.rootKey);
  item.element.remove();
  const index = pieces.indexOf(item);
  if (index >= 0) pieces.splice(index, 1);
  // Retiring a half that is waiting to be stitched cancels the stitch.
  if (pendingStitch && (pendingStitch.a === item || pendingStitch.b === item)) {
    pendingStitch = null;
    pointers = pointers.filter((pointer) => pointer.owner !== item && pointer.other !== item);
  }
  document.querySelector("#retired-count").textContent = `${retiredKeys.size} retired`;
  renderStitchTray();
  updateStitchHighlights();
}

function createDragGhost(item) {
  const ghost = item.element.cloneNode(true);
  ghost.classList.add("drag-ghost");
  ghost.style.width = item.element.style.width;
  ghost.style.height = item.element.style.height;
  document.body.append(ghost);
  return ghost;
}

function emitDissolve(item) {
  const rect = item.element.getBoundingClientRect();
  const burst = document.createElement("div");
  burst.className = "particle-burst";
  burst.style.left = `${rect.left + rect.width / 2}px`;
  burst.style.top = `${rect.top + rect.height / 2}px`;
  const feedback = config.feedback;
  burst.style.setProperty("--dissolve-duration", `${feedback.particleDuration}ms`);
  for (let index = 0; index < feedback.particleCount; index += 1) {
    const particle = document.createElement("span");
    const angle = (Math.PI * 2 * index) / feedback.particleCount;
    const distance = feedback.particleMinDistance
      + Math.random() * (feedback.particleMaxDistance - feedback.particleMinDistance);
    particle.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    burst.append(particle);
  }
  document.body.append(burst);
  setTimeout(() => burst.remove(), feedback.particleDuration + 100);
}

function isOverElement(event, element) {
  const rect = element.getBoundingClientRect();
  return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
}

function probeContent(item) {
  const meta = item.shape.metadata;
  const hint = (meta.hints && (meta.hints[tier] || meta.hints.medium)) || "No hint on this channel.";
  const body = tier === "hard"
    ? highlightAssembly(expandAssembly(meta))
    : escapeHtml(meta[tier] || meta.medium || "No signal.");
  const address = `\n\nADDR ${addressFor(item)} · ${meta.pages || "?"} pages`;
  return `<span class="hint">HINT&nbsp;·&nbsp;${escapeHtml(hint)}</span>\n\n${body}${escapeHtml(address)}`;
}

function showProbe(item) {
  lastProbe = item;
  document.querySelector("#probe-status").textContent = item.shape.identified ? "identified" : "awaiting answer";
  if (!document.querySelector("#probe-overlay").hidden) populateOverlay(item);
}

// ---- Probe overlay: source + live telemetry + FDS reference book ----
const BOOK = [
  {
    title: "DMA channels",
    rows: [
      ["0 · MDS", "telemetry home — the only path back to Earth"],
      ["1 · DSS", "data storage — the tape recorder"],
      ["2 · ISS", "imaging science — the cameras"],
      ["3 · PRA", "planetary radio astronomy — the greeting wire"]
    ]
  },
  {
    title: "Ports (SWI / SWO n)",
    rows: [
      ["0", "subcomputer bus — heartbeat pings"],
      ["1", "magnetometer flux samples"],
      ["2", "imaging / camera port"],
      ["3", "cosmic-ray particle line"],
      ["4", "solar-wind plasma sensors"]
    ]
  },
  {
    title: "Special flags (F80–F9F, lower bank)",
    rows: [
      ["F80", "boot echo — the kernel waits on it"],
      ["F84", "camera busy flag"],
      ["F88", "magnetometer sample ready"],
      ["F8A", "particle edge flag"],
      ["F8D", "plasma sample ready"],
      ["F8F", "heater temperature error"],
      ["F94", "greeting inbox flag"],
      ["F96", "buffer / tape ready"]
    ]
  },
  {
    title: "Pattern translations",
    rows: [
      ["AND 4095 / 0xFFF", "12-bit two's-complement sample"],
      ["AND 1023 / 0x3FF", "10-bit magnitude"],
      ["AND 3", "2-bit code — exposure mask, phase gate"],
      ["AND 1", "test the low carry / parity bit"],
      ["SUB 10 / SUB 13", "count gates: 10-tick heartbeat, hello word 13 (0x0D)"],
      ["SLS 2 / LRS 2", "shift = multiply/divide by 4 (slot addressing, slow wind)"],
      ["LOR BANK", "banked address — data goes to the upper 4K"],
      ["ISZ gate", "loop countdown with skip-on-zero"],
      ["WAT 10 / 20 / 55", "wait ticks: heartbeat / heater beat / 55-language greeting"],
      ["repeated ADD", "the FDS has no multiply — add in a loop instead"]
    ]
  },
  {
    title: "Banking",
    rows: [
      ["SETAD / SETAU", "address down (lower 4K) / up (upper 4K)"],
      ["SETJD / SETJU", "jumps go down / up"],
      ["F80–FFF", "special registers — always the lower bank"]
    ]
  }
];

function buildBook() {
  const el = document.querySelector("#overlay-book");
  el.replaceChildren();
  BOOK.forEach((section) => {
    const heading = document.createElement("h4");
    heading.className = "book-title";
    heading.textContent = section.title;
    el.append(heading);
    const table = document.createElement("div");
    table.className = "book-table";
    section.rows.forEach(([key, meaning]) => {
      const row = document.createElement("div");
      row.className = "book-row";
      const keyEl = document.createElement("span");
      keyEl.className = "book-key";
      keyEl.textContent = key;
      const meaningEl = document.createElement("span");
      meaningEl.className = "book-meaning";
      meaningEl.textContent = meaning;
      row.append(keyEl, meaningEl);
      table.append(row);
    });
    el.append(table);
  });
}

let tlmCells = [];
function startTelemetry() {
  stopTelemetry();
  const el = document.querySelector("#overlay-telemetry");
  el.replaceChildren();
  tlmCells = [];
  for (let row = 0; row < 14; row += 1) {
    const line = document.createElement("div");
    line.className = "tlm-row";
    const label = document.createElement("span");
    label.className = "tlm-label";
    label.textContent = `0x${(0x40 + row).toString(16).toUpperCase()}:`;
    line.append(label);
    for (let col = 0; col < 8; col += 1) {
      const byte = document.createElement("span");
      byte.className = "tlm-byte";
      byte.textContent = randHex();
      line.append(byte);
      tlmCells.push(byte);
    }
    el.append(line);
  }
  tlmTimer = setInterval(() => {
    for (let i = 0; i < 10; i += 1) {
      const byte = tlmCells[Math.floor(Math.random() * tlmCells.length)];
      byte.textContent = randHex();
      byte.classList.remove("tlm-flash");
      void byte.offsetWidth;
      byte.classList.add("tlm-flash");
    }
  }, 850);
}

function stopTelemetry() {
  if (tlmTimer) clearInterval(tlmTimer);
  tlmTimer = null;
}

function randHex() {
  return Math.floor(Math.random() * 256).toString(16).toUpperCase().padStart(2, "0");
}

function buildOverlayChoices(item) {
  const meta = item.shape.metadata;
  const choices = [...(meta.chips || [])];
  const choicesElement = document.querySelector("#overlay-choices");
  choicesElement.replaceChildren();
  choices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = choice;
    button.addEventListener("click", () => {
      if (index === meta.answer) {
        item.shape.identified = true;
        item.element.classList.remove("unknown");
        item.element.classList.add("identified");
        updatePieceLabel(item);
        document.querySelector("#probe-status").textContent = `${meta.name} online`;
        updateAll();
        closeOverlay();
      } else {
        button.classList.add("wrong");
        setTimeout(() => button.classList.remove("wrong"), 350);
        const reordered = [...choicesElement.children].sort(() => Math.random() - 0.5);
        reordered.forEach((child) => choicesElement.append(child));
        document.querySelector("#overlay-status").textContent = "signal reordered — retry";
      }
    });
    choicesElement.append(button);
  });
}

function populateOverlay(item) {
  const meta = item.shape.metadata;
  const name = document.querySelector("#overlay-name");
  name.textContent = item.shape.identified ? meta.name : "UNKNOWN BLOCK";
  name.style.color = item.shape.color;
  document.querySelector("#overlay-status").textContent = item.shape.identified ? "identified" : "awaiting answer";
  document.querySelector("#overlay-code").innerHTML = probeContent(item);
  buildOverlayChoices(item);
}

function openOverlay() {
  if (!lastProbe) return;
  const overlay = document.querySelector("#probe-overlay");
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add("open"));
  buildBook();
  populateOverlay(lastProbe);
  startTelemetry();
}

function closeOverlay() {
  const overlay = document.querySelector("#probe-overlay");
  overlay.classList.remove("open");
  overlay.hidden = true;
  stopTelemetry();
}

function handleGridMove(event) {
  if (mode !== "slice" || pendingStitch) return;
  const candidate = nearestCut(event);
  if (!candidate) {
    clearCutPreview();
    return;
  }
  clearCutPreview();
  cutPreview = { candidate, elements: [] };
  const padding = parseFloat(getComputedStyle(grid).paddingLeft);
  const step = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-step"));
  const cellSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-size"));
  const lineWidth = config.cut.previewWidth;
  const vertical = candidate.edge[0][0] === candidate.edge[1][0];
  candidate.segments.forEach(([start, end]) => {
    const line = document.createElement("div");
    line.className = "cut-preview";
    line.style.background = config.cut.previewColor;
    if (vertical) {
      line.style.left = `${padding + candidate.item.column * step + candidate.edge[0][0] * cellSize - lineWidth / 2}px`;
      line.style.top = `${padding + candidate.item.row * step + start * cellSize}px`;
      line.style.width = `${lineWidth}px`;
      line.style.height = `${(end - start) * cellSize}px`;
    } else {
      line.style.left = `${padding + candidate.item.column * step + start * cellSize}px`;
      line.style.top = `${padding + candidate.item.row * step + candidate.edge[0][1] * cellSize - lineWidth / 2}px`;
      line.style.width = `${(end - start) * cellSize}px`;
      line.style.height = `${lineWidth}px`;
    }
    grid.append(line);
    cutPreview.elements.push(line);
  });
}

function clearCutPreview() {
  cutPreview?.elements.forEach((element) => element.remove());
  cutPreview = null;
}

function nearestCut(event) {
  const rect = grid.getBoundingClientRect();
  const padding = parseFloat(getComputedStyle(grid).paddingLeft);
  const step = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-step"));
  const cellSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-size"));
  const px = event.clientX - rect.left - padding;
  const py = event.clientY - rect.top - padding;
  let best;
  let bestDistance = cellSize * 0.42;
  pieces.forEach((item) => {
    const occupied = new Set(item.shape.cells.map(([x, y]) => `${x},${y}`));
    item.shape.cells.forEach(([x, y]) => {
      [[x + 1, y, x + 1, y + 1], [x, y + 1, x + 1, y + 1]].forEach(([x1, y1, x2, y2]) => {
        const hasNeighbor = x1 === x2 ? occupied.has(`${x1},${Math.min(y1, y2)}`) : occupied.has(`${Math.min(x1, x2)},${y1}`);
        if (!hasNeighbor) return;
        const edge = [[x1, y1], [x2, y2]];
        const segments = getCutSegments(item.shape, edge);
        const midpointX = (x1 + x2) / 2 * cellSize + item.column * step;
        const midpointY = (y1 + y2) / 2 * cellSize + item.row * step;
        const distanceToPointer = Math.hypot(px - midpointX, py - midpointY);
        if (segments.length && distanceToPointer < bestDistance) {
          bestDistance = distanceToPointer;
          best = { item, edge, segments };
        }
      });
    });
  });
  return best;
}

function getCutSegments(shape, edge) {
  const cells = new Set(shape.cells.map(([x, y]) => `${x},${y}`));
  const vertical = edge[0][0] === edge[1][0];
  const seam = vertical ? edge[0][0] : edge[0][1];
  const shared = [];
  shape.cells.forEach(([x, y]) => {
    const isShared = vertical ? x === seam - 1 && cells.has(`${seam},${y}`) : y === seam - 1 && cells.has(`${x},${seam}`);
    if (isShared) shared.push(vertical ? y : x);
  });
  shared.sort((a, b) => a - b);
  const segments = [];
  shared.forEach((value) => {
    const previous = segments[segments.length - 1];
    if (previous && previous[1] === value) previous[1] = value + 1;
    else segments.push([value, value + 1]);
  });
  return segments;
}

function splitShape(shape, edge) {
  const [first, second] = edge;
  const parts = first[0] === second[0]
    ? [shape.cells.filter(([x]) => x < first[0]), shape.cells.filter(([x]) => x >= first[0])]
    : [shape.cells.filter(([, y]) => y < first[1]), shape.cells.filter(([, y]) => y >= first[1])];
  return parts.filter((part) => part.length && isConnected(part));
}

function isConnected(cells) {
  const remaining = new Set(cells.map(([x, y]) => `${x},${y}`));
  const queue = [remaining.values().next().value];
  remaining.delete(queue[0]);
  while (queue.length) {
    const [x, y] = queue.shift().split(",").map(Number);
    [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].forEach(([nx, ny]) => {
      const key = `${nx},${ny}`;
      if (remaining.has(key)) {
        remaining.delete(key);
        queue.push(key);
      }
    });
  }
  return remaining.size === 0;
}

function applyCut(candidate) {
  const parts = splitShape(candidate.item.shape, candidate.edge);
  if (parts.length !== 2) return;
  const original = candidate.item;
  const originalIndex = pieces.indexOf(original);
  original.element.remove();
  pieces.splice(originalIndex, 1);
  const fragments = parts.map((cells, index) => {
    const minX = Math.min(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    const shape = {
      ...original.shape,
      id: `${original.shape.id}-fragment-${cutCount}-${index}`,
      cells: cells.map(([x, y]) => [x - minX, y - minY]),
      column: original.column + minX,
      row: original.row + minY,
      fragment: true,
      fragmentOf: original.shape.rootKey
    };
    return createPiece(shape, shape.column, shape.row);
  });
  remapPointers(original, fragments);
  cutCount += 1;
  pendingStitch = { a: fragments[0], b: fragments[1] };
  layoutPieces();
  refreshStitch();
  clearCutPreview();
  updateAll();
}

function remapPointers(original, fragments) {
  // Existing pointer arrows must survive their piece being re-sliced:
  // the owner follows the fragment that keeps the from-cell, and the
  // target follows the fragment closest to it.
  pointers.forEach((pointer) => {
    const from = [pointer.owner.column + pointer.local[0], pointer.owner.row + pointer.local[1]];
    if (pointer.owner === original) {
      const ownerFrag = fragments.find((f) => f.shape.cells.some(([x, y]) => f.column + x === from[0] && f.row + y === from[1]));
      if (ownerFrag) {
        pointer.owner = ownerFrag;
        pointer.local = ownerFrag.shape.cells.find(([x, y]) => ownerFrag.column + x === from[0] && ownerFrag.row + y === from[1]);
      }
    }
    if (pointer.other === original) {
      let best = null;
      let bestDist = Infinity;
      fragments.forEach((f) => f.shape.cells.forEach(([x, y]) => {
        const d = Math.hypot(f.column + x - from[0], f.row + y - from[1]);
        if (d < bestDist) {
          bestDist = d;
          best = f;
        }
      }));
      if (best) pointer.other = best;
    }
  });
}

function renderStitchTray() {
  const tray = document.querySelector("#pointer-tray");
  const status = document.querySelector("#pointer-status");
  tray.replaceChildren();
  if (!pendingStitch) {
    tray.textContent = "No pointer waiting.";
    status.textContent = "empty";
    return;
  }
  if (pendingStitch.choice) {
    tray.textContent = "Ambiguous seam — click a cell of the half the new page should join.";
    status.textContent = "choose";
    return;
  }
  if (pendingStitch.awaiting) {
    tray.textContent = "Type the other half's address into the glowing cell (probe it to read it), then press Enter.";
    status.textContent = "address";
    return;
  }
  tray.textContent = "Click a glowing seam cell to stitch the pointer.";
  status.textContent = "ready";
}

function refreshStitch() {
  renderStitchTray();
  updateStitchHighlights();
}

function updateStitchHighlights() {
  document.querySelectorAll(".stitchable").forEach((element) => element.classList.remove("stitchable", "stitch-ambiguous"));
  pieces.forEach((item) => item.element.classList.remove("stitch-choice"));
  if (!pendingStitch || pendingStitch.awaiting) return;
  const { a, b } = pendingStitch;
  const mapOf = (item) => {
    const map = new Map();
    item.shape.cells.forEach(([x, y]) => map.set(`${item.column + x},${item.row + y}`, true));
    return map;
  };
  const mapA = mapOf(a);
  const mapB = mapOf(b);
  const occupied = new Set();
  pieces.forEach((item) => item.shape.cells.forEach(([x, y]) => occupied.add(`${item.column + x},${item.row + y}`)));
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const holes = new Map();
  const markCell = (item, x, y) => {
    const cell = item.element.querySelector(`.piece-cell[data-x="${x}"][data-y="${y}"]`);
    cell?.classList.add("stitchable");
  };
  const scan = (item, otherMap) => {
    item.shape.cells.forEach(([x, y]) => {
      const cx = item.column + x;
      const cy = item.row + y;
      DIRS.forEach(([dx, dy]) => {
        const key = `${cx + dx},${cy + dy}`;
        if (otherMap.has(key)) {
          markCell(item, x, y);
        } else if (holes.has(key)) {
          holes.get(key).add(item);
        } else if (cx + dx >= 0 && cx + dx < state.gridSize && cy + dy >= 0 && cy + dy < state.gridHeight
          && state.grid[cy + dy][cx + dx] === 0 && !occupied.has(key)) {
          holes.set(key, new Set([item]));
        }
      });
    });
  };
  scan(a, mapB);
  scan(b, mapA);
  if (pendingStitch.choice) {
    const { x, y } = pendingStitch.choice;
    gridCells[y * state.gridSize + x]?.classList.add("stitchable", "stitch-ambiguous");
    a.element.classList.add("stitch-choice");
    b.element.classList.add("stitch-choice");
    return;
  }
  holes.forEach((neighbors, key) => {
    const [x, y] = key.split(",").map(Number);
    const cell = gridCells[y * state.gridSize + x];
    if (!cell) return;
    cell.classList.add("stitchable");
    cell.classList.toggle("stitch-ambiguous", neighbors.size === 2);
  });
}

function touchesPiece(item, x, y) {
  return item.shape.cells.some(([cx, cy]) => Math.abs(item.column + cx - x) + Math.abs(item.row + cy - y) === 1);
}

function normalizePiece(item) {
  const minX = Math.min(...item.shape.cells.map(([x]) => x));
  const minY = Math.min(...item.shape.cells.map(([, y]) => y));
  if (minX !== 0 || minY !== 0) {
    const pointerAnchors = pointers
      .filter((pointer) => pointer.owner === item)
      .map((pointer) => ({
        pointer,
        column: item.column + pointer.local[0],
        row: item.row + pointer.local[1]
      }));
    item.column += minX;
    item.row += minY;
    item.shape.cells = item.shape.cells.map(([x, y]) => [x - minX, y - minY]);
    pointerAnchors.forEach(({ pointer, column, row }) => {
      const local = item.shape.cells.find(([x, y]) => item.column + x === column && item.row + y === row);
      if (local) pointer.local = local;
    });
  }
}

function handleStitchClick(event, target) {
  if (!pendingStitch) return;
  const { a, b } = pendingStitch;
  if (pendingStitch.choice) {
    const pieceEl = event.target.closest(".piece");
    const item = pieceEl ? pieces.find((candidate) => candidate.element === pieceEl) : null;
    if (item === a || item === b) finalizeStitch(pendingStitch.choice, item);
    else {
      pendingStitch.choice = null;
      refreshStitch();
    }
    return;
  }
  if (pendingStitch.awaiting) return;
  if (target.classList.contains("piece-cell")) {
    const item = pieces.find((candidate) => candidate.element === target.closest(".piece"));
    if (!item || (item !== a && item !== b)) return;
    const other = item === a ? b : a;
    const x = item.column + Number(target.dataset.x);
    const y = item.row + Number(target.dataset.y);
    if (!touchesPiece(other, x, y)) return;
    transferCell(item, other, x, y);
    return;
  }
  if (target.classList.contains("grid-cell")) {
    const index = gridCells.indexOf(target);
    if (index < 0) return;
    const x = index % state.gridSize;
    const y = Math.floor(index / state.gridSize);
    const neighbors = [a, b].filter((item) => touchesPiece(item, x, y));
    if (!neighbors.length) return;
    if (neighbors.length === 2) {
      // The cell touches both halves (e.g. a ring's center after a cut):
      // let the player preview and pick which half absorbs it.
      pendingStitch.choice = { x, y };
      refreshStitch();
      document.querySelector("#tool-message").textContent = "Ambiguous seam — click a cell of the half that should absorb it.";
      return;
    }
    finalizeStitch({ x, y }, neighbors[0]);
  }
}

function transferCell(from, to, x, y) {
  from.shape.cells = from.shape.cells.filter(([cx, cy]) => !(from.column + cx === x && from.row + cy === y));
  if (from.shape.cells.length === 0) {
    // The half was a single page: the stitch merges the two fragments back.
    from.element.remove();
    pieces.splice(pieces.indexOf(from), 1);
  } else {
    normalizePiece(from);
    redrawOutline(from);
  }
  to.shape.cells.push([x - to.column, y - to.row]);
  normalizePiece(to);
  redrawOutline(to);
  layoutPieces();
  finalizePointer(to, x, y, from);
  updateAll();
}

function finalizeStitch(hole, owner) {
  const other = pendingStitch.a === owner ? pendingStitch.b : pendingStitch.a;
  pendingStitch.choice = null;
  owner.shape.cells.push([hole.x - owner.column, hole.y - owner.row]);
  normalizePiece(owner);
  redrawOutline(owner);
  layoutPieces();
  finalizePointer(owner, hole.x, hole.y, other);
  updateAll();
}

function finalizePointer(owner, x, y, other) {
  if (!other || !pieces.includes(other)) {
    pendingStitch = null;
    refreshStitch();
    document.querySelector("#tool-message").textContent = "Fragments merged — the cut is undone.";
    return;
  }
  const local = owner.shape.cells.find(([cx, cy]) => owner.column + cx === x && owner.row + cy === y);
  if (!local) return;
  if (tier === "hard") {
    // Hard: the pointer must be typed by hand as the other half's address.
    pendingStitch.awaiting = { owner, local, other };
    createPtrInput(owner, local, other);
  } else {
    pointers.push({ owner, local, other });
    pendingStitch = null;
    renderPointers();
    document.querySelector("#tool-message").textContent = "Fragments stitched. Continue the remap.";
  }
  refreshStitch();
}

function createPtrInput(owner, local, other) {
  const cellEl = owner.element.querySelector(`.piece-cell[data-x="${local[0]}"][data-y="${local[1]}"]`);
  if (!cellEl || cellEl.querySelector(".ptr-input")) return;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "ptr-input";
  input.value = "ptr* = ";
  input.setAttribute("spellcheck", "false");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("aria-label", "Pointer target address");
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") resolvePtrInput(input, owner, local, other);
  });
  cellEl.append(input);
  input.focus();
}

function resolvePtrInput(input, owner, local, other) {
  const typed = input.value.replace(/^ptr\*\s*=\s*/i, "").trim();
  if (typed.toUpperCase() === addressFor(other).toUpperCase()) {
    pointers.push({ owner, local, other });
    pendingStitch = null;
    input.remove();
    renderPointers();
    refreshStitch();
    updateAll();
    document.querySelector("#tool-message").textContent = "Pointer bound. Continue the remap.";
  } else {
    input.classList.add("wrong");
    document.querySelector("#pointer-status").textContent = "address rejected";
    setTimeout(() => input.classList.remove("wrong"), 350);
  }
}

function renderPointers() {
  if (!pointerLayer) return;
  pointerLayer.replaceChildren();
  if (!pointers.length) return;
  const ns = "http://www.w3.org/2000/svg";
  const originX = Number(grid.dataset.originX);
  const originY = Number(grid.dataset.originY);
  const step = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-step"));
  const cellSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-size"));
  const center = (column, row) => [originX + column * step + cellSize / 2, originY + row * step + cellSize / 2];
  const defs = document.createElementNS(ns, "defs");
  const marker = document.createElementNS(ns, "marker");
  marker.setAttribute("id", "pointer-arrowhead");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "8");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "7");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("orient", "auto");
  const tip = document.createElementNS(ns, "path");
  tip.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  tip.setAttribute("fill", "#202a25");
  marker.append(tip);
  defs.append(marker);
  pointerLayer.append(defs);
  pointers.forEach((pointer) => {
    if (!pieces.includes(pointer.owner) || !pieces.includes(pointer.other)) return;
    const from = center(pointer.owner.column + pointer.local[0], pointer.owner.row + pointer.local[1]);
    let best = null;
    let bestDistance = Infinity;
    pointer.other.shape.cells.forEach(([x, y]) => {
      const point = center(pointer.other.column + x, pointer.other.row + y);
      const distance = Math.hypot(point[0] - from[0], point[1] - from[1]);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = point;
      }
    });
    if (!best || bestDistance < cellSize) return;
    const dx = best[0] - from[0];
    const dy = best[1] - from[1];
    const length = bestDistance || 1;
    const end = [best[0] - (dx / length) * 8, best[1] - (dy / length) * 8];
    const bow = Math.min(36, length * 0.3);
    const px = -dy / length;
    const py = dx / length;
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d",
      `M ${from[0]} ${from[1]} ` +
      `C ${from[0] + dx / 3 + px * bow} ${from[1] + dy / 3 + py * bow}, ` +
      `${from[0] + (2 * dx) / 3 + px * bow} ${from[1] + (2 * dy) / 3 + py * bow}, ` +
      `${end[0]} ${end[1]}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", pointer.owner.shape.color);
    path.setAttribute("stroke-width", "2.5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("marker-end", "url(#pointer-arrowhead)");
    pointerLayer.append(path);
  });
}

function addressFor(item) {
  const page = item.row * state.gridSize + item.column;
  return `0x${(0x40000 + page * 0x1000).toString(16).toUpperCase()}`;
}

function updateAll() {
  updateStatus();
  updateAudit();
  updateStitchHighlights();
  checkMission();
}

function updateStatus() {
  const occupied = new Map();
  const forbidden = new Set();
  pieces.forEach((item) => item.shape.cells.forEach(([x, y]) => {
    const column = item.column + x;
    const row = item.row + y;
    const key = `${column},${row}`;
    occupied.set(key, (occupied.get(key) || 0) + 1);
    if (state.grid[row]?.[column] > 0) forbidden.add(`${key}:${state.grid[row][column]}`);
  }));
  const overlaps = new Set([...occupied].filter(([, count]) => count > 1).map(([key]) => key));
  pieces.forEach((item) => item.element.querySelectorAll(".piece-cell").forEach((cell) => {
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    cell.classList.toggle("is-overlap", overlaps.has(`${item.column + x},${item.row + y}`));
    cell.classList.toggle("is-forbidden", state.grid[item.row + y]?.[item.column + x] > 0);
  }));
  document.querySelector("#overlap-dot").className = `state-dot ${overlaps.size ? "bad" : "clear"}`;
  document.querySelector("#overlap-text").textContent = overlaps.size ? `${overlaps.size} overlapping page${overlaps.size === 1 ? "" : "s"}.` : "No overlap.";
  document.querySelector("#dead-dot").className = `state-dot ${forbidden.size ? "bad" : "clear"}`;
  document.querySelector("#dead-text").textContent = forbidden.size ? `${forbidden.size} forbidden page${forbidden.size === 1 ? "" : "s"} touched.` : "Dead and reserved pages are clear.";
}

function updateAudit() {
  const activeRoots = new Set(pieces.map((item) => item.shape.rootKey).filter((key) => !retiredKeys.has(key)));
  const power = [...activeRoots].reduce((sum, key) => sum + (data.game.blocks[key]?.power || 0), 0);
  const science = [...activeRoots].reduce((sum, key) => sum + (data.game.blocks[key]?.science || 0), 0);
  const limit = config.game.powerLimit;
  document.querySelector("#power-used").textContent = power;
  document.querySelector("#power-limit").textContent = limit;
  document.querySelector("#power-meter").style.width = `${Math.min(100, power / limit * 100)}%`;
  document.querySelector("#power-meter").classList.toggle("over", power > limit);
  document.querySelector("#power-message").textContent = power > limit ? `${power - limit} W over budget — retire a block.` : "Within the 2024 science budget.";
  document.querySelector("#signal-score").textContent = `${Math.round(science / config.game.scienceTotal * 100)}%`;
  document.querySelector("#cut-score").textContent = cutCount;
}

function checkMission() {
  const hasOverlap = document.querySelector("#overlap-dot").classList.contains("bad");
  const hasForbidden = document.querySelector("#dead-dot").classList.contains("bad");
  const power = Number(document.querySelector("#power-used").textContent);
  const needsRetirement = tier !== "easy" && retiredKeys.size === 0;
  const needsPointer = tier !== "easy" && pendingStitch;
  const powerOkay = tier === "easy" || power <= config.game.powerLimit;
  const ready = !hasOverlap && !hasForbidden && powerOkay && !needsRetirement && !needsPointer;
  if (ready && !booted) {
    booted = true;
    document.querySelector("#tool-message").textContent = "Clean signal. Voyager is running.";
    runBootSequence();
  } else if (!booted) {
    document.querySelector("#mission-log").textContent = needsRetirement ? "MISSION LOG · POWER-DOWN REQUIRED" : "FDS WAITING FOR LAYOUT";
  }
}

function getReturnBlockers() {
  if (!state) return ["mission data is not ready"];

  const occupied = new Set();
  let hasOverlap = false;
  let hasForbidden = false;
  pieces.forEach((item) => item.shape.cells.forEach(([x, y]) => {
    const column = item.column + x;
    const row = item.row + y;
    const key = `${column},${row}`;
    if (occupied.has(key)) hasOverlap = true;
    occupied.add(key);
    if (row < 0 || row >= state.gridHeight || column < 0 || column >= state.gridSize
      || state.grid[row]?.[column] > 0) {
      hasForbidden = true;
    }
  }));

  const pointersValid = !pendingStitch && pointers.every(({ owner, local, other }) =>
    pieces.includes(owner)
    && pieces.includes(other)
    && !retiredKeys.has(owner.shape.rootKey)
    && !retiredKeys.has(other.shape.rootKey)
    && owner !== other
    && Array.isArray(local)
    && owner.shape.cells.some(([x, y]) => x === local[0] && y === local[1]));
  const activeRoots = new Set(
    pieces
      .filter((item) => !retiredKeys.has(item.shape.rootKey))
      .map((item) => item.shape.rootKey)
  );
  const blockers = [];
  if (!pointersValid) blockers.push("finish or repair fragment pointers");
  if (hasOverlap) blockers.push("remove block overlaps");
  if (hasForbidden) blockers.push("move blocks off dead or reserved pages");
  if (!activeRoots.has("K")) blockers.push("restore the Kernel block");
  if (!activeRoots.has("T")) blockers.push("restore the Telemetry block");
  return blockers;
}

function returnToRoot() {
  const blockers = getReturnBlockers();
  if (blockers.length) {
    document.querySelector("#mission-log").textContent = `RETURN CHECK · ${blockers.join(" · ")}`;
    return;
  }
  window.location.href = "../../../index.html";
}

function runBootSequence() {
  const log = document.querySelector("#mission-log");
  ["BOOT 01 · KERNEL", "BOOT 02 · TELEMETRY", "BOOT 03 · SCIENCE LINKS", "BOOT COMPLETE · SIGNAL CLEAN"].forEach((line, index) => {
    setTimeout(() => { log.textContent = line; }, index * 420);
  });
  setTimeout(updateMissionGrade, 1500);
}

function updateMissionGrade() {
  const signal = document.querySelector("#signal-score").textContent;
  const elegance = cutCount === 0 ? 20 : cutCount === 1 ? 10 : 0;
  const truth = truthEarned ? 15 : 0;
  document.querySelector("#mission-log").textContent = `VOYAGER LOG · SIGNAL ${signal} · ELEGANCE ${elegance} · TRUTH ${truth}`;
}

function verifyTruth() {
  const expected = data.game.truth.puzzleMapping;
  const matched = expected.every((key) => retiredKeys.has(key));
  truthEarned = matched;
  const badge = document.querySelector("#truth-badge");
  badge.textContent = matched ? "earned +15" : "not matched";
  badge.classList.toggle("earned", matched);
  document.querySelector("#truth-card").textContent = matched
    ? `${data.game.truth.fact} Truth badge earned.`
    : `${data.game.truth.fact} Puzzle match: retire CAMERA, PLASMA, and COSMIC RAY.`;
  if (booted) updateMissionGrade();
}

function applyConfig() {
  document.documentElement.style.setProperty("--panel-width", `${config.panel.width}px`);
  document.documentElement.style.setProperty("--grid-gap", `${config.grid.gap}px`);
  document.documentElement.style.setProperty("--grid-padding", `${config.grid.padding}px`);
  document.documentElement.style.setProperty("--grid-radius", `${config.grid.radius}px`);
  document.documentElement.style.setProperty("--cell-radius", `${config.grid.cellRadius}px`);
  document.documentElement.style.setProperty("--cell-border", config.grid.cellBorder);
  document.documentElement.style.setProperty("--cell-background", config.grid.cellBackground);
  document.documentElement.style.setProperty("--board-border", config.grid.boardBorder);
  document.documentElement.style.setProperty("--board-background", config.grid.boardBackground);
  document.documentElement.style.setProperty("--overlap-color", config.shape.overlapColor);
  document.documentElement.style.setProperty("--overlap-fill", config.shape.overlapFill);
  document.documentElement.style.setProperty("--label-background", config.ui.labelBackground);
  document.documentElement.style.setProperty("--label-color", config.ui.labelColor);
  document.documentElement.style.setProperty("--unknown-label-background", config.ui.unknownLabelBackground);
  document.documentElement.style.setProperty("--unknown-label-color", config.ui.unknownLabelColor);
}

document.querySelectorAll("[data-tier]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-tier]").forEach((other) => other.classList.toggle("active", other === button));
  applyTier(button.dataset.tier);
}));
document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
grid.addEventListener("pointermove", handleGridMove);
grid.addEventListener("pointerleave", clearCutPreview);
grid.addEventListener("click", (event) => {
  if (mode !== "slice") return;
  // Touch screens have no hover, so the tap itself must resolve the cut.
  const candidate = cutPreview?.candidate || (!pendingStitch && event.pointerType === "touch" ? nearestCut(event) : null);
  if (candidate) {
    applyCut(candidate);
    return;
  }
  if (!pendingStitch) return;
  const target = event.target.closest(".piece-cell, .grid-cell");
  if (!target) {
    if (pendingStitch.choice) {
      pendingStitch.choice = null;
      refreshStitch();
    }
    return;
  }
  if (pendingStitch.choice || target.classList.contains("stitchable")) handleStitchClick(event, target);
});
document.querySelector("#see-console").addEventListener("click", openOverlay);
document.querySelector("#overlay-close").addEventListener("click", closeOverlay);
document.querySelector("#overlay-backdrop").addEventListener("click", closeOverlay);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeOverlay();
});
window.addEventListener("resize", () => {
  if (!state) return;
  sizeGrid();
  layoutPieces();
});
document.querySelector("#truth-check").addEventListener("click", verifyTruth);
document.querySelector("#signal-button").addEventListener("click", returnToRoot);

loadGame().catch((error) => {
  document.querySelector("#mission-log").textContent = error.message;
});
