async function loadItem() {
  const body = document.body;
  const params = new URLSearchParams(window.location.search);
  const sectionId = params.get("id") || body.dataset.sectionId || "1";

  try {
    const response = await fetch("../items.json");
    if (!response.ok) {
      throw new Error("items.json not found");
    }

    const items = await response.json();
    const item = Array.isArray(items)
      ? items.find((entry) => String(entry.ID) === String(sectionId))
      : null;

    if (!item) {
      return;
    }

    const requiredFields = [
      "ITEM",
      "ID",
      "YEAR",
      "TITLE",
      "BODY",
      "MODEL",
      "DATES",
      "TIP",
      "BAG_ID",
      "ORDER_ID",
    ];

    const hasRequiredFields = requiredFields.every((field) => {
      const value = item[field];
      return value !== undefined && value !== null && String(value).trim().length > 0;
    });

    updateTimeline(sectionId);
    applyTheme(item.TIP || "luna");
    const bagValid = validateBag(item);

    const fields = {
      item: item.ITEM || "",
      id: item.ID || "",
      year: item.YEAR || "",
      title: item.TITLE || "",
      body: item.BODY || "",
      modelText: item.MODEL || "",
      dates: item.DATES || "",
      tip: item.TIP || "",
      bagId: item.BAG_ID || "",
      orderId: item.ORDER_ID || "",
      mainDate: item.TITLE || "Launch",
    };

    document.getElementById("item").textContent = fields.item;
    document.getElementById("id").textContent = fields.id;
    document.getElementById("year").textContent = fields.year;
    document.getElementById("title").textContent = fields.title;
    document.getElementById("body").textContent = fields.body;
    document.getElementById("modelText").textContent = fields.modelText;
    document.getElementById("dates").textContent = fields.dates;
    document.getElementById("tip").textContent = fields.tip;
    document.getElementById("bagId").textContent = fields.bagId;
    document.getElementById("orderId").textContent = fields.orderId;
    document.getElementById("mainDate").textContent = fields.mainDate;

    const bagNode = document.getElementById("bagId");
    if (bagNode) {
      bagNode.classList.remove("invalid");
      if (!bagValid || !hasRequiredFields) {
        bagNode.classList.add("invalid");
      }
    }

    renderModel(item.MODEL || "");
  } catch (error) {
    console.error("Unable to render item:", error);
  }
}

function updateTimeline(sectionId) {
  const segments = document.querySelectorAll(".segment");
  if (!segments.length) {
    return;
  }

  const rawIndex = Number(sectionId) - 1;
  const safeIndex = Number.isFinite(rawIndex) ? rawIndex : 0;
  const boundedIndex = Math.min(Math.max(safeIndex, 0), segments.length - 1);

  segments.forEach((segment, i) => {
    segment.classList.toggle("active", i === boundedIndex);
  });
}

function applyTheme(tip) {
  const themeMap = {
    luna: "theme-luna",
    pamant: "theme-pamant",
    marte: "theme-marte",
  };

  document.body.classList.remove("theme-luna", "theme-pamant", "theme-marte");
  document.body.classList.add(themeMap[tip] || "theme-luna");
}

function validateBag(item) {
  if (!item || typeof item !== "object") {
    return false;
  }

  const bag = typeof item.BAG_ID === "string" ? item.BAG_ID.trim() : "";
  const order = typeof item.ORDER_ID === "string" ? item.ORDER_ID.trim() : item.ORDER_ID;

  return bag.length > 0 && order !== undefined && order !== null && String(order).trim() !== "";
}

function renderModel(modelPath) {
  const stage = document.getElementById("model");
  if (!stage) {
    return;
  }

  stage.innerHTML = "";

  if (!modelPath) {
    return;
  }

  const modelFile = String(modelPath).split(/[?#]/, 1)[0].toLowerCase();

  if (modelFile.endsWith(".usdz")) {
    const link = document.createElement("a");
    link.href = modelPath;
    link.rel = "ar";
    link.className = "usdz-link";
    link.setAttribute("aria-label", "Open USDZ model in AR Quick Look");

    link.textContent = "Open USDZ model";
    stage.appendChild(link);
    return;
  }

  if (/\.(gltf|glb)$/.test(modelFile)) {
    const viewer = document.createElement("model-viewer");
    viewer.src = modelPath;
    viewer.alt = "3D model";
    viewer.setAttribute("camera-controls", "");
    viewer.setAttribute("auto-rotate", "");
    viewer.setAttribute("ar", "");
    viewer.setAttribute("ar-modes", "webxr scene-viewer quick-look");
    stage.appendChild(viewer);
    return;
  }

  if (modelFile.endsWith(".html")) {
    const iframe = document.createElement("iframe");
    iframe.src = modelPath;
    iframe.title = "Model";
    stage.appendChild(iframe);
    return;
  }

  if (/\.(png|jpg|jpeg|svg|webp)$/.test(modelFile)) {
    const image = document.createElement("img");
    image.src = modelPath;
    image.alt = "Model";
    stage.appendChild(image);
    return;
  }

  if (/\.(mp4|webm|ogg)$/.test(modelFile)) {
    const video = document.createElement("video");
    video.src = modelPath;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.controls = true;
    stage.appendChild(video);
  }
}

loadItem();
