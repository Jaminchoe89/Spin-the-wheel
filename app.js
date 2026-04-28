const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const rootElement = document.documentElement;
const bodyElement = document.body;
const addNamesButton = document.getElementById("add-names-button");
const input = document.getElementById("name-input");
const fileInput = document.getElementById("file-input");
const winnerText = document.getElementById("winner-text");
const entryCount = document.getElementById("entry-count");
const wheelStage = document.querySelector(".wheel-stage");
const wheelShell = document.getElementById("wheel-shell");
const pointerWrap = document.querySelector(".pointer-wrap");
const winnerModal = document.getElementById("winner-modal");
const winnerModalTitle = document.getElementById("winner-modal-title");
const winnerModalName = document.getElementById("winner-modal-name");
const closeModalButton = document.getElementById("close-modal-button");
const spinAgainButton = document.getElementById("spin-again-button");
const removeWinnerButton = document.getElementById("remove-winner-button");
const namesModal = document.getElementById("names-modal");
const closeNamesButton = document.getElementById("close-names-button");
const customizeButton = document.getElementById("customize-button");
const customizeModal = document.getElementById("customize-modal");
const closeCustomizeButton = document.getElementById("close-customize-button");
const spinDurationInput = document.getElementById("spin-duration-input");
const spinDurationValue = document.getElementById("spin-duration-value");
const popupHeaderInput = document.getElementById("popup-header-input");
const textColorInput = document.getElementById("text-color-input");
const textColorValue = document.getElementById("text-color-value");
const arrowColorInput = document.getElementById("arrow-color-input");
const arrowColorValue = document.getElementById("arrow-color-value");
const arrowPositionInput = document.getElementById("arrow-position-input");
const arrowPositionValue = document.getElementById("arrow-position-value");
const wheelBackdropColorInput = document.getElementById("wheel-backdrop-color-input");
const wheelBackdropColorValue = document.getElementById("wheel-backdrop-color-value");
const pageBackgroundImageInput = document.getElementById("page-background-image-input");
const pageBackgroundImageStatus = document.getElementById("page-background-image-status");
const clearPageBackgroundButton = document.getElementById("clear-page-background-button");
const themeOptions = Array.from(document.querySelectorAll("#theme-options .theme-option"));
const wheelBackgroundInput = document.getElementById("wheel-background-input");
const backgroundImageStatus = document.getElementById("background-image-status");
const clearBackgroundButton = document.getElementById("clear-background-button");
const loadSettingsInput = document.getElementById("load-settings-input");
const loadSettingsButton = document.getElementById("load-settings-button");
const saveSettingsButton = document.getElementById("save-settings-button");
const themeToggleInput = document.getElementById("theme-toggle-input");
const themeToggleLabel = document.getElementById("theme-toggle-label");
const themeToggle = document.querySelector(".theme-toggle");

let rotation = 0;
let spinVelocity = 0;
let spinAnimationId = null;
let idleAnimationId = null;
let lastFocusedElement = null;
let lastWinner = "";
let lastNamesFocus = null;
let lastCustomizeFocus = null;
let wheelBackgroundImage = null;
let wheelBackgroundImageDataUrl = "";
let pageBackgroundImageDataUrl = "";
const idleRotationSpeed = 0.0024;
const defaultPageBackgrounds = {
  dark: "#121212",
  light: "#f7efe4",
};

const paletteSets = [
  ["#0e9594", "#127475", "#8b5e34", "#b84f24", "#8f1d1d", "#235789"],
  ["#8f0f1c", "#6b2d5c", "#3f6791", "#003049", "#9a5c17", "#7d1f2a"],
  ["#5b3a29", "#7f5539", "#9c6644", "#6f4e37", "#8a5a44", "#4f3226"],
  ["#08111f", "#0d1b2a", "#123456", "#1e3a5f", "#1e4f86", "#6e8fb5"],
  ["#2b2d42", "#8d99ae", "#edf2f4", "#ef233c", "#d90429", "#f4a261"],
  ["#283618", "#606c38", "#9c6644", "#6b705c", "#8d5524", "#3d5a80"],
];

let palette = [...paletteSets[0]];
const wheelSettings = {
  appTheme: "light",
  spinDurationSeconds: 7,
  popupHeaderText: "Winner!",
  textColor: "#fff9f0",
  arrowColor: "#8f2b18",
  pointerClockHour: 12,
  wheelBackdropColor: defaultPageBackgrounds.light,
  wheelBackdropColorCustom: false,
};

function parseNames() {
  const names = input.value
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean);

  entryCount.textContent = String(names.length);
  return names;
}

function normalizeImportedNames(rows) {
  const values = rows
    .map((row) => {
      if (Array.isArray(row)) {
        return row[0];
      }
      return row;
    })
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  if (values.length > 0 && /^(name|names)$/i.test(values[0])) {
    values.shift();
  }

  return values;
}

function updateNames(names) {
  input.value = names.join("\n");
  entryCount.textContent = String(names.length);
  winnerText.textContent = names.length > 0 ? "Waiting to spin" : "Add names to begin";

  if (!spinAnimationId) {
    drawWheel(names);
  }
}

function openWinnerModal(name) {
  lastFocusedElement = document.activeElement;
  lastWinner = name;
  winnerModalTitle.textContent = wheelSettings.popupHeaderText;
  winnerModalName.textContent = name;
  winnerModal.classList.remove("hidden");
  winnerModal.setAttribute("aria-hidden", "false");
  closeModalButton.focus();
}

function closeWinnerModal() {
  winnerModal.classList.add("hidden");
  winnerModal.setAttribute("aria-hidden", "true");
  startIdleSpin();
  if (lastFocusedElement instanceof HTMLElement) {
    lastFocusedElement.focus();
  }
}

function openCustomizeModal() {
  lastCustomizeFocus = document.activeElement;
  customizeModal.classList.remove("hidden");
  customizeModal.setAttribute("aria-hidden", "false");
  closeCustomizeButton.focus();
}

function openNamesModal() {
  lastNamesFocus = document.activeElement;
  namesModal.classList.remove("hidden");
  namesModal.setAttribute("aria-hidden", "false");
  closeNamesButton.focus();
}

function closeNamesModal() {
  namesModal.classList.add("hidden");
  namesModal.setAttribute("aria-hidden", "true");
  if (lastNamesFocus instanceof HTMLElement) {
    lastNamesFocus.focus();
  }
}

function closeCustomizeModal() {
  customizeModal.classList.add("hidden");
  customizeModal.setAttribute("aria-hidden", "true");
  if (lastCustomizeFocus instanceof HTMLElement) {
    lastCustomizeFocus.focus();
  }
}

function removeWinnerFromList() {
  if (!lastWinner) {
    return;
  }

  const names = parseNames();
  const winnerIndex = names.indexOf(lastWinner);

  if (winnerIndex === -1) {
    closeWinnerModal();
    return;
  }

  names.splice(winnerIndex, 1);
  updateNames(names);
  lastWinner = "";
  closeWinnerModal();
}

function importCsv(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? "");
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.split(","))
      .map((cells) => cells.map((cell) => cell.replace(/^"|"$/g, "").trim()));
    updateNames(normalizeImportedNames(rows));
  };
  reader.readAsText(file);
}

function importWorkbook(file) {
  if (!window.XLSX) {
    winnerText.textContent = "Excel import unavailable";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const data = new Uint8Array(reader.result);
    const workbook = window.XLSX.read(data, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false });
    updateNames(normalizeImportedNames(rows));
  };
  reader.readAsArrayBuffer(file);
}

function handleFileImport(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".csv")) {
    importCsv(file);
    return;
  }

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    importWorkbook(file);
    return;
  }

  winnerText.textContent = "Unsupported file type";
}

function getSegmentFillStyle(index) {
  if (!wheelBackgroundImage) {
    return palette[index % palette.length];
  }

  return "rgba(255, 255, 255, 0)";
}

function getPointerWorldAngle() {
  const degrees = (wheelSettings.pointerClockHour % 12) * 30;
  return (-Math.PI / 2) + (degrees * Math.PI / 180);
}

function normalizeAngle(angle) {
  const fullCircle = Math.PI * 2;
  return ((angle % fullCircle) + fullCircle) % fullCircle;
}

function updatePointerPosition() {
  const stageSize = wheelStage ? wheelStage.clientWidth : 0;
  const pointerDistance = Math.max(0, stageSize / 2 - 8);
  const degrees = (wheelSettings.pointerClockHour % 12) * 30;
  pointerWrap.style.setProperty("--pointer-distance", `${pointerDistance}px`);
  pointerWrap.style.setProperty("--pointer-angle", `${degrees}deg`);
  pointerWrap.style.setProperty("--pointer-color", wheelSettings.arrowColor);
}

function describeArrowPosition(hour) {
  return `${hour} o'clock`;
}

function drawWheelBackground(radius) {
  if (!wheelBackgroundImage) {
    return;
  }

  const image = wheelBackgroundImage;
  const diameter = (radius - 18) * 2;
  const scale = Math.max(diameter / image.width, diameter / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius - 18, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
}

function drawWheel(names) {
  const size = canvas.width;
  const radius = size / 2;

  ctx.clearRect(0, 0, size, size);

  if (names.length === 0) {
    ctx.save();
    ctx.translate(radius, radius);
    ctx.beginPath();
    ctx.arc(0, 0, radius - 20, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 252, 247, 0.88)";
    ctx.fill();
    ctx.lineWidth = 18;
    ctx.strokeStyle = "rgba(225, 164, 79, 0.72)";
    ctx.stroke();
    ctx.fillStyle = "#6e6157";
    ctx.font = "700 46px Manrope";
    ctx.textAlign = "center";
    ctx.fillText("Add names to begin", 0, 16);
    ctx.restore();
    return;
  }

  const arc = (Math.PI * 2) / names.length;

  ctx.save();
  ctx.translate(radius, radius);
  ctx.rotate(rotation);
  drawWheelBackground(radius);

  names.forEach((name, index) => {
    const startAngle = index * arc;
    const endAngle = startAngle + arc;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius - 18, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = getSegmentFillStyle(index);
    ctx.fill();

    ctx.save();
    ctx.rotate(startAngle + arc / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = wheelSettings.textColor;
    ctx.font = "700 38px Manrope";
    ctx.translate(radius - 60, 0);
    if (wheelBackgroundImage) {
      ctx.shadowColor = "rgba(31, 26, 22, 0.45)";
      ctx.shadowBlur = 10;
    }

    const fitted = fitText(name, 18);
    ctx.fillText(fitted, 0, 12);
    ctx.restore();
  });

  ctx.restore();
}

function fitText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

function pickWinner(names) {
  const fullCircle = Math.PI * 2;
  const sliceAngle = fullCircle / names.length;
  const normalizedRotation = normalizeAngle(rotation);
  const pointerAngle = normalizeAngle(getPointerWorldAngle() - normalizedRotation);
  const clampedPointerAngle = Math.min(pointerAngle, fullCircle - 1e-9);
  const winningIndex = Math.floor(clampedPointerAngle / sliceAngle) % names.length;
  return names[winningIndex];
}

function stopIdleSpin() {
  if (!idleAnimationId) {
    return;
  }

  cancelAnimationFrame(idleAnimationId);
  idleAnimationId = null;
}

function startIdleSpin() {
  if (idleAnimationId || spinAnimationId || !winnerModal.classList.contains("hidden")) {
    return;
  }

  function tick() {
    const names = parseNames();
    if (!spinAnimationId && winnerModal.classList.contains("hidden")) {
      rotation = normalizeAngle(rotation + idleRotationSpeed);
      drawWheel(names);
      idleAnimationId = requestAnimationFrame(tick);
      return;
    }

    idleAnimationId = null;
  }

  idleAnimationId = requestAnimationFrame(tick);
}

function animateWheel(names) {
  rotation += spinVelocity;
  spinVelocity *= 0.985;

  if (spinVelocity < 0.03) {
    cancelAnimationFrame(spinAnimationId);
    spinAnimationId = null;
    spinVelocity = 0;
    const winner = pickWinner(names);
    winnerText.textContent = winner;
    drawWheel(names);
    stopIdleSpin();
    openWinnerModal(winner);
    return;
  }

  drawWheel(names);
  spinAnimationId = requestAnimationFrame(() => animateWheel(names));
}

function startSpin() {
  const names = parseNames();

  if (names.length < 2) {
    winnerText.textContent = "Add at least 2 names";
    return;
  }

  if (spinAnimationId) {
    return;
  }

  stopIdleSpin();
  winnerText.textContent = "Spinning...";

  const rounds = 7 + Math.random() * 4;
  const targetIndex = Math.floor(Math.random() * names.length);
  const arc = (Math.PI * 2) / names.length;
  const targetAngle = getPointerWorldAngle() - (targetIndex * arc + arc / 2);
  const currentNormalized = normalizeAngle(rotation);
  const extraRotation = rounds * Math.PI * 2 + normalizeAngle(targetAngle - currentNormalized);
  const durationFrames = Math.max(120, Math.round(wheelSettings.spinDurationSeconds * 60));
  let frame = 0;
  const startRotation = rotation;

  function easeOutQuint(t) {
    return 1 - Math.pow(1 - t, 5);
  }

  function scriptedSpin() {
    frame += 1;
    const progress = frame / durationFrames;
    const eased = easeOutQuint(Math.min(progress, 1));
    const newRotation = startRotation + extraRotation * eased;
    spinVelocity = newRotation - rotation;
    rotation = newRotation;

    drawWheel(names);

    if (progress < 1) {
      spinAnimationId = requestAnimationFrame(scriptedSpin);
      return;
    }

    spinAnimationId = requestAnimationFrame(() => animateWheel(names));
  }

  scriptedSpin();
}

function syncThemeSelection() {
  themeOptions.forEach((option, index) => {
    option.classList.toggle("active", palettesMatch(palette, paletteSets[index]));
  });
}

function updateSpinDuration() {
  wheelSettings.spinDurationSeconds = Number(spinDurationInput.value);
  spinDurationValue.textContent = `${wheelSettings.spinDurationSeconds.toFixed(1)}s`;
}

function updatePopupHeader() {
  const trimmed = popupHeaderInput.value.trim();
  wheelSettings.popupHeaderText = trimmed || "The wheel landed on";
  winnerModalTitle.textContent = wheelSettings.popupHeaderText;
}

function updateTextColor() {
  wheelSettings.textColor = textColorInput.value.toLowerCase();
  textColorValue.textContent = wheelSettings.textColor.toUpperCase();
  drawWheel(parseNames());
}

function updateArrowColor() {
  wheelSettings.arrowColor = arrowColorInput.value.toLowerCase();
  arrowColorValue.textContent = wheelSettings.arrowColor.toUpperCase();
  updatePointerPosition();
}

function updateArrowPosition() {
  wheelSettings.pointerClockHour = Number(arrowPositionInput.value);
  arrowPositionValue.textContent = describeArrowPosition(wheelSettings.pointerClockHour);
  updatePointerPosition();
}

function syncWheelBackdropColorUI() {
  wheelBackdropColorInput.value = wheelSettings.wheelBackdropColor;
  wheelBackdropColorValue.textContent = wheelSettings.wheelBackdropColor.toUpperCase();
  rootElement.style.setProperty("--page-bg-color", wheelSettings.wheelBackdropColor);
}

function syncPageBackgroundImageUI() {
  if (pageBackgroundImageDataUrl) {
    bodyElement.style.backgroundImage = `url("${pageBackgroundImageDataUrl}")`;
    pageBackgroundImageStatus.textContent = "Page image loaded";
  } else {
    bodyElement.style.backgroundImage = "none";
    pageBackgroundImageStatus.textContent = "No page background image selected";
  }
}

function hasCustomPageBackground() {
  return wheelSettings.wheelBackdropColorCustom || Boolean(pageBackgroundImageDataUrl);
}

function updateThemeToggleVisibility() {
  themeToggle.classList.toggle("hidden", hasCustomPageBackground());
}

function updateWheelBackdropColor() {
  wheelSettings.wheelBackdropColor = wheelBackdropColorInput.value.toLowerCase();
  wheelSettings.wheelBackdropColorCustom = true;
  syncWheelBackdropColorUI();
  updateThemeToggleVisibility();
}

function applyPageBackgroundImageDataUrl(dataUrl) {
  pageBackgroundImageDataUrl = dataUrl;
  syncPageBackgroundImageUI();
  updateThemeToggleVisibility();
}

function handlePageBackgroundImageUpload(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    applyPageBackgroundImageDataUrl(String(reader.result ?? ""));
  };
  reader.readAsDataURL(file);
}

function clearPageBackgroundImage() {
  pageBackgroundImageDataUrl = "";
  pageBackgroundImageInput.value = "";
  syncPageBackgroundImageUI();
  updateThemeToggleVisibility();
}

function applyTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
  wheelSettings.appTheme = nextTheme;
  rootElement.setAttribute("data-theme", nextTheme);
  themeToggleInput.checked = nextTheme === "light";
  themeToggleLabel.textContent = nextTheme === "light" ? "☀" : "☾";

  if (!wheelSettings.wheelBackdropColorCustom) {
    wheelSettings.wheelBackdropColor = defaultPageBackgrounds[nextTheme];
    syncWheelBackdropColorUI();
  }

  updateThemeToggleVisibility();
}

function toggleTheme() {
  applyTheme(themeToggleInput.checked ? "light" : "dark");
}

function palettesMatch(firstPalette, secondPalette) {
  return firstPalette.length === secondPalette.length
    && firstPalette.every((color, index) => color === secondPalette[index]);
}

function handleThemeSelection(event) {
  const option = event.currentTarget;
  const themeIndex = Number(option.dataset.themeIndex);
  palette = [...paletteSets[themeIndex]];
  syncThemeSelection();
  drawWheel(parseNames());
}

function setBackgroundImage(file) {
  const reader = new FileReader();
  reader.onload = () => {
    wheelBackgroundImageDataUrl = String(reader.result ?? "");
    const image = new Image();
    image.onload = () => {
      wheelBackgroundImage = image;
      backgroundImageStatus.textContent = file.name;
      drawWheel(parseNames());
    };
    image.src = wheelBackgroundImageDataUrl;
  };
  reader.readAsDataURL(file);
}

function handleBackgroundImageUpload(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  setBackgroundImage(file);
}

function clearBackgroundImage() {
  wheelBackgroundImage = null;
  wheelBackgroundImageDataUrl = "";
  wheelBackgroundInput.value = "";
  backgroundImageStatus.textContent = "No image selected";
  drawWheel(parseNames());
}

function getSelectedThemeIndex() {
  return paletteSets.findIndex((paletteSet) => palettesMatch(palette, paletteSet));
}

function saveSettingsToFile() {
  const payload = {
    exportedAt: new Date().toISOString(),
    settings: {
      ...wheelSettings,
      palette: [...palette],
      selectedThemeIndex: getSelectedThemeIndex(),
      wheelBackgroundImage: wheelBackgroundImageDataUrl,
      pageBackgroundImage: pageBackgroundImageDataUrl,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "spin-the-wheel-settings.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function applyBackgroundImageDataUrl(dataUrl) {
  if (!dataUrl) {
    clearBackgroundImage();
    return;
  }

  wheelBackgroundImageDataUrl = dataUrl;
  const image = new Image();
  image.onload = () => {
    wheelBackgroundImage = image;
    backgroundImageStatus.textContent = "Loaded from settings";
    drawWheel(parseNames());
  };
  image.src = wheelBackgroundImageDataUrl;
}

function applyLoadedSettings(settings) {
  wheelSettings.spinDurationSeconds = Number(settings.spinDurationSeconds ?? wheelSettings.spinDurationSeconds);
  wheelSettings.appTheme = String(settings.appTheme ?? wheelSettings.appTheme);
  wheelSettings.popupHeaderText = String(settings.popupHeaderText ?? wheelSettings.popupHeaderText);
  wheelSettings.textColor = String(settings.textColor ?? wheelSettings.textColor).toLowerCase();
  wheelSettings.arrowColor = String(settings.arrowColor ?? wheelSettings.arrowColor).toLowerCase();
  wheelSettings.pointerClockHour = Number(settings.pointerClockHour ?? wheelSettings.pointerClockHour);
  wheelSettings.wheelBackdropColor = String(settings.wheelBackdropColor ?? wheelSettings.wheelBackdropColor).toLowerCase();
  wheelSettings.wheelBackdropColorCustom = Boolean(
    settings.wheelBackdropColorCustom ?? settings.wheelBackdropColor
  );

  if (Array.isArray(settings.palette) && settings.palette.length > 0) {
    palette = settings.palette.map((color) => String(color));
  } else if (Number.isInteger(settings.selectedThemeIndex) && paletteSets[settings.selectedThemeIndex]) {
    palette = [...paletteSets[settings.selectedThemeIndex]];
  }

  applyTheme(wheelSettings.appTheme);
  spinDurationInput.value = String(wheelSettings.spinDurationSeconds);
  popupHeaderInput.value = wheelSettings.popupHeaderText;
  textColorInput.value = wheelSettings.textColor;
  arrowColorInput.value = wheelSettings.arrowColor;
  arrowPositionInput.value = String(wheelSettings.pointerClockHour);
  updateSpinDuration();
  updatePopupHeader();
  updateTextColor();
  updateArrowColor();
  updateArrowPosition();
  syncWheelBackdropColorUI();
  applyPageBackgroundImageDataUrl(String(settings.pageBackgroundImage ?? ""));
  syncThemeSelection();
  applyBackgroundImageDataUrl(String(settings.wheelBackgroundImage ?? ""));
  drawWheel(parseNames());
}

function handleLoadSettings(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result ?? "{}"));
      const settings = parsed && typeof parsed === "object" && "settings" in parsed ? parsed.settings : parsed;
      applyLoadedSettings(settings || {});
    } catch {
      winnerText.textContent = "Invalid settings file";
    } finally {
      loadSettingsInput.value = "";
    }
  };
  reader.readAsText(file);
}

function isEditableTarget(target) {
  return target instanceof HTMLElement
    && (
      target.tagName === "INPUT"
      || target.tagName === "TEXTAREA"
      || target.isContentEditable
      || target.closest("input, textarea, [contenteditable='true']")
    );
}

function togglePresentationMode() {
  bodyElement.classList.toggle("presentation-mode");
}

input.addEventListener("input", () => {
  const names = parseNames();
  if (names.length > 0 && !spinAnimationId) {
    drawWheel(names);
  } else if (!spinAnimationId) {
    drawWheel([]);
  }
});

fileInput.addEventListener("change", handleFileImport);
addNamesButton.addEventListener("click", openNamesModal);
customizeButton.addEventListener("click", openCustomizeModal);
wheelShell.addEventListener("click", startSpin);
wheelShell.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    startSpin();
  }
});
winnerModal.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.dataset.closeModal === "true") {
    closeWinnerModal();
  }
});
namesModal.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.dataset.closeNames === "true") {
    closeNamesModal();
  }
});
customizeModal.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.dataset.closeCustomize === "true") {
    closeCustomizeModal();
  }
});
closeModalButton.addEventListener("click", closeWinnerModal);
closeNamesButton.addEventListener("click", closeNamesModal);
removeWinnerButton.addEventListener("click", removeWinnerFromList);
spinAgainButton.addEventListener("click", () => {
  closeWinnerModal();
  startSpin();
});
closeCustomizeButton.addEventListener("click", closeCustomizeModal);
spinDurationInput.addEventListener("input", updateSpinDuration);
popupHeaderInput.addEventListener("input", updatePopupHeader);
textColorInput.addEventListener("input", updateTextColor);
arrowColorInput.addEventListener("input", updateArrowColor);
arrowPositionInput.addEventListener("input", updateArrowPosition);
wheelBackdropColorInput.addEventListener("input", updateWheelBackdropColor);
pageBackgroundImageInput.addEventListener("change", handlePageBackgroundImageUpload);
clearPageBackgroundButton.addEventListener("click", clearPageBackgroundImage);
themeOptions.forEach((option) => {
  option.addEventListener("click", handleThemeSelection);
});
wheelBackgroundInput.addEventListener("change", handleBackgroundImageUpload);
clearBackgroundButton.addEventListener("click", clearBackgroundImage);
loadSettingsButton.addEventListener("click", () => loadSettingsInput.click());
loadSettingsInput.addEventListener("change", handleLoadSettings);
saveSettingsButton.addEventListener("click", saveSettingsToFile);
themeToggleInput.addEventListener("change", toggleTheme);
window.addEventListener("resize", updatePointerPosition);
document.addEventListener("keydown", (event) => {
  if (isEditableTarget(event.target)) {
    return;
  }

  if (event.key === " " || event.code === "Space") {
    event.preventDefault();

    if (!winnerModal.classList.contains("hidden")) {
      closeWinnerModal();
      startSpin();
      return;
    }

    if (namesModal.classList.contains("hidden") && customizeModal.classList.contains("hidden")) {
      startSpin();
      return;
    }
  }

  if ((event.key === "r" || event.key === "R") && !winnerModal.classList.contains("hidden")) {
    event.preventDefault();
    removeWinnerFromList();
    return;
  }

  if ((event.key === "h" || event.key === "H") && winnerModal.classList.contains("hidden")) {
    event.preventDefault();
    togglePresentationMode();
    return;
  }

  if (event.key === "Escape" && !winnerModal.classList.contains("hidden")) {
    closeWinnerModal();
    return;
  }

  if (event.key === "Escape" && !namesModal.classList.contains("hidden")) {
    closeNamesModal();
    return;
  }

  if (event.key === "Escape" && !customizeModal.classList.contains("hidden")) {
    closeCustomizeModal();
  }
});

applyTheme(wheelSettings.appTheme);
updateThemeToggleVisibility();
updateSpinDuration();
updatePopupHeader();
updateTextColor();
updateArrowColor();
updateArrowPosition();
syncWheelBackdropColorUI();
syncPageBackgroundImageUI();
syncThemeSelection();
drawWheel(parseNames());
startIdleSpin();
