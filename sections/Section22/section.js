async function loadItem() {
  const response = await fetch("item.json");
  if (!response.ok) {
    throw new Error(`Unable to load item.json (${response.status})`);
  }

  const item = await response.json();
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error("item.json must contain one item object");
  }

  const dates = item.Dates;
  const modelFacts = item.ModelFacts === undefined ? [] : item.ModelFacts;
  const modelPath = item.ModelPath == null ? "" : item.ModelPath;
  const previewPath = item.Path == null ? "" : item.Path;
  const gallery = item.Gallery === undefined ? [] : item.Gallery;
  const captions = item.Captions === undefined ? {} : item.Captions;
  const bottomPercent = Number(item["Bottom %"] ?? 0);

  if (!Array.isArray(dates)) {
    throw new Error("Dates must be an array");
  }
  if (!dates.every((entry) =>
    entry &&
    typeof entry.date === "string" &&
    typeof entry.text === "string"
  )) {
    throw new Error("Each Dates entry must contain string date and text values");
  }
  if (!Array.isArray(modelFacts) || !modelFacts.every((fact) => typeof fact === "string")) {
    throw new Error("ModelFacts must be an array of strings");
  }
  if (!Array.isArray(gallery) || !gallery.every((src) => typeof src === "string")) {
    throw new Error("Gallery must be an array of image paths");
  }
  if (
    !captions ||
    typeof captions !== "object" ||
    Array.isArray(captions) ||
    !Object.values(captions).every((text) => typeof text === "string")
  ) {
    throw new Error('Captions must be an object like { "image.jpg": "text" }');
  }
  if (typeof modelPath !== "string" || typeof previewPath !== "string") {
    throw new Error("Path and ModelPath must be strings");
  }
  if (!Number.isFinite(bottomPercent) || bottomPercent < 0 || bottomPercent > 100) {
    throw new Error('The "Bottom %" value must be between 0 and 100');
  }

  document.getElementById("year").textContent = item.Year ?? "";
  document.getElementById("title").textContent = item.Title ?? "";
  document.getElementById("body").textContent = item["Body-Text"] ?? "";
  document.documentElement.style.setProperty(
    "--bottom-clearance",
    `${bottomPercent}dvh`,
  );

  currentModelPath = modelPath;
  currentModelFacts = modelFacts;
  currentCaptions = captions;
  renderTimeline(dates);
  renderPreview(previewPath, modelPath, item.Title ?? "", gallery);
}

function renderTimeline(dates) {
  const timeline = document.getElementById("timeline");
  timeline.replaceChildren();

  for (const entry of dates) {
    const item = document.createElement("li");
    item.className = "timeline-item";

    const date = document.createElement("time");
    date.className = "timeline-date";
    date.dateTime = entry.date;
    date.textContent = entry.date;

    const text = document.createElement("span");
    text.className = "timeline-text";
    text.textContent = entry.text;

    item.append(date, text);
    timeline.appendChild(item);
  }
}

const IMAGE_FILE = /\.(png|jpe?g|gif|svg|webp|avif)$/;
const VIDEO_FILE = /\.(mp4|webm|ogg|mov)$/;
const fileOf = (path) => path.split(/[?#]/, 1)[0].toLowerCase();
const isImage = (path) => IMAGE_FILE.test(fileOf(path));
const canHover = window.matchMedia("(hover: hover)").matches;

// Preview box: a 3D model if there is one (falls back to the image if the
// model file is missing), otherwise the image / gallery / video / HTML page.
function renderPreview(path, modelPath, title, gallery = []) {
  const preview = document.getElementById("preview");
  const modelHint = document.getElementById("modelHint");
  resetPreview(preview);
  modelHint.hidden = !modelPath;

  if (path && fileOf(path).endsWith(".html")) {
    renderMedia(preview, path, title, gallery);
    if (modelPath) {
      addModelOpenButton(preview, title);
    }
    return;
  }

  if (modelPath) {
    const modelPreview = document.createElement("model-viewer");
    modelPreview.src = modelPath;
    modelPreview.alt = `${title} 3D preview`;
    modelPreview.setAttribute("auto-rotate", "");
    modelPreview.addEventListener("error", () => {
      console.warn(`3D model not found or broken: ${modelPath}`);
      if (path) {
        modelHint.hidden = true;
        renderMedia(preview, path, title, gallery);
      }
    });
    preview.appendChild(modelPreview);

    addModelOpenButton(preview, title);
    return;
  }

  if (!path) {
    const placeholder = document.createElement("div");
    placeholder.className = "preview-placeholder";
    const heading = document.createElement("strong");
    heading.textContent = "Mission preview";
    const message = document.createElement("span");
    message.textContent = "No image or video provided";
    placeholder.append(heading, message);
    preview.appendChild(placeholder);
    return;
  }

  renderMedia(preview, path, title, gallery);
}

function addModelOpenButton(preview, title) {
  const openButton = document.createElement("button");
  openButton.className = "preview-hitarea";
  openButton.type = "button";
  openButton.setAttribute("aria-label", `Open ${title} in the 3D viewer`);
  openButton.addEventListener("click", openModelDialog);
  preview.appendChild(openButton);
}

function resetPreview(preview) {
  preview.replaceChildren();
  preview.classList.remove("has-image", "has-gallery", "is-expanded");
  preview.style.removeProperty("--preview-image");
  preview.style.removeProperty("--count");
}

function setBackdrop(preview, src) {
  preview.classList.add("has-image");
  preview.style.setProperty(
    "--preview-image",
    `url("${new URL(src, location.href).href}")`,
  );
}

function renderMedia(preview, path, title, gallery) {
  resetPreview(preview);
  const file = fileOf(path);
  let media;

  if (isImage(path)) {
    const images = [path, ...gallery.filter(isImage)];
    setBackdrop(preview, path);
    if (images.length > 1) {
      renderGallery(preview, images, title);
      return;
    }
    media = document.createElement("img");
    media.src = path;
    media.alt = captionFor(path) || title;
    addCaption(preview, captionFor(path));
  } else if (VIDEO_FILE.test(file)) {
    media = document.createElement("video");
    media.src = path;
    media.autoplay = true;
    media.muted = true;
    media.loop = true;
    media.playsInline = true;
    media.controls = true;
  } else if (file.endsWith(".html")) {
    media = document.createElement("iframe");
    media.src = path;
    media.title = `${title} preview`;
    media.loading = "lazy";
  } else {
    const error = document.createElement("p");
    error.className = "preview-placeholder";
    error.textContent = `Unsupported preview file: ${path}`;
    preview.appendChild(error);
    return;
  }

  preview.appendChild(media);
}

// Gallery: the images are stacked like cards; on hover (or tap on touch screens)
// they spread out side by side. Clicking a card brings it to the front.
function renderGallery(preview, images, title) {
  preview.classList.add("has-gallery");
  preview.style.setProperty("--count", images.length);

  images.forEach((src, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "gallery-card";
    card.style.setProperty("--i", index);
    card.setAttribute("aria-label", `${title}, image ${index + 1} of ${images.length}`);

    const image = document.createElement("img");
    image.src = src;
    image.alt = captionFor(src) || (index === 0 ? title : "");
    image.loading = index === 0 ? "eager" : "lazy";
    card.appendChild(image);

    const caption = captionFor(src);
    if (caption) {
      const text = document.createElement("span");
      text.className = "gallery-caption";
      text.textContent = caption;
      card.appendChild(text);
    }

    card.addEventListener("click", () => {
      if (!canHover && !preview.classList.contains("is-expanded")) {
        preview.classList.add("is-expanded");
        return;
      }
      const reordered = [src, ...images.filter((_, other) => other !== index)];
      preview
        .querySelectorAll(".gallery-card")
        .forEach((oldElement) => oldElement.remove());
      setBackdrop(preview, src);
      renderGallery(preview, reordered, title);
      if (!canHover) {
        preview.classList.remove("is-expanded");
      }
    });

    preview.appendChild(card);
  });

}

function renderModelFacts(facts) {
  const container = document.getElementById("modelFacts");
  container.replaceChildren();

  if (facts.length === 0) {
    return;
  }

  const svgNamespace = "http://www.w3.org/2000/svg";
  const leaders = document.createElementNS(svgNamespace, "svg");
  leaders.classList.add("model-leaders");
  leaders.setAttribute("viewBox", "0 0 1000 1000");
  leaders.setAttribute("preserveAspectRatio", "none");
  leaders.setAttribute("aria-hidden", "true");
  container.appendChild(leaders);

  const leftCount = Math.ceil(facts.length / 2);
  const rightCount = Math.floor(facts.length / 2);
  const containerBounds = container.getBoundingClientRect();

  facts.forEach((fact, index) => {
    const side = index % 2 === 0 ? "left" : "right";
    const slot = Math.floor(index / 2);
    const sideCount = side === "left" ? leftCount : rightCount;
    const y = ((slot + 1) / (sideCount + 1)) * 100;
    const offset = y < 50 || (y === 50 && side === "left") ? 6 : -6;
    const targetY = Math.max(12, Math.min(88, y + offset));
    const startY = y * 10;
    const targetLineY = targetY * 10;
    const item = document.createElement("p");
    item.className = "model-fact";
    item.dataset.side = side;
    item.style.top = `${y}%`;
    item.textContent = fact;
    container.appendChild(item);

    const itemBounds = item.getBoundingClientRect();
    const edgeX = side === "left" ? itemBounds.right : itemBounds.left;
    const startX = Math.round(
      ((edgeX - containerBounds.left) / containerBounds.width) * 1000,
    );
    const direction = side === "left" ? 1 : -1;
    const bendX = startX + direction * 50;
    const endX = startX + direction * 100;
    const points = index % 2 === 0
      ? [
          [startX, startY],
          [bendX, targetLineY],
          [endX, targetLineY],
        ]
      : [
          [startX, startY],
          [bendX, startY],
          [endX, targetLineY],
        ];

    const line = document.createElementNS(svgNamespace, "polyline");
    line.classList.add("model-leader");
    line.setAttribute("points", points.map((point) => point.join(",")).join(" "));
    leaders.appendChild(line);
  });
}

function openModelDialog() {
  const modelPath = currentModelPath;
  const viewerFrame = document.getElementById("modelViewer");
  viewerFrame.replaceChildren();

  const modelFile = modelPath.split(/[?#]/, 1)[0].toLowerCase();
  if (/\.(gltf|glb)$/.test(modelFile)) {
    const viewer = document.createElement("model-viewer");
    viewer.src = modelPath;
    viewer.alt = "Interactive 3D model";
    viewer.setAttribute("camera-controls", "");
    viewer.setAttribute("auto-rotate", "");
    viewer.setAttribute("ar", "");
    viewer.setAttribute("ar-modes", "webxr scene-viewer quick-look");
    viewerFrame.appendChild(viewer);
  } else {
    const error = document.createElement("p");
    error.className = "model-error";
    error.textContent = "The 3D viewer supports GLB and glTF model files.";
    viewerFrame.appendChild(error);
  }

  const dialog = document.getElementById("modelDialog");
  dialog.showModal();
  renderModelFacts(currentModelFacts);
}

let currentModelPath = "";
let currentModelFacts = [];
let currentCaptions = {};

// Captions: text shown under an image, from "Captions" in item.json
// (keys are the image file names, e.g. { "earthrise.jpg": "Earth rising over the Moon" })
function captionFor(src) {
  return currentCaptions[src] ?? "";
}

function addCaption(preview, text) {
  if (!text) {
    return;
  }
  const caption = document.createElement("p");
  caption.className = "preview-caption";
  caption.textContent = text;
  preview.appendChild(caption);
}

window.addEventListener("resize", () => {
  const dialog = document.getElementById("modelDialog");
  if (dialog.open) {
    renderModelFacts(currentModelFacts);
  }
});

document.getElementById("closeModel").addEventListener("click", () => {
  document.getElementById("modelDialog").close();
});

document.getElementById("modelDialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) {
    event.currentTarget.close();
  }
});

loadItem().catch((error) => {
  console.error("Unable to render item:", error);
  document.getElementById("loadError").textContent = error.message;
  document.getElementById("loadError").hidden = false;
});
