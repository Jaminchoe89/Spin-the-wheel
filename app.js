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
const sheetUrlInput = document.getElementById("sheet-url-input");
const sheetSyncButton = document.getElementById("sheet-sync-button");
const sheetSyncStatus = document.getElementById("sheet-sync-status");

const saveStatus = document.getElementById("save-status");
const prizesButton = document.getElementById("prizes-button");
const prizesModal = document.getElementById("prizes-modal");
const closePrizesButton = document.getElementById("close-prizes-button");
const prizesInput = document.getElementById("prizes-input");
const prizeList = document.getElementById("prize-list");
const winnersList = document.getElementById("winners-list");
const winnersEmpty = document.getElementById("winners-empty");
const downloadWinnersButton = document.getElementById("download-winners-button");
const clearWinnersButton = document.getElementById("clear-winners-button");
const prizeBanner = document.getElementById("prize-banner");
const prizeBannerName = document.getElementById("prize-banner-name");
const prizeBannerCount = document.getElementById("prize-banner-count");
const prevPrizeButton = document.getElementById("prev-prize-button");
const nextPrizeButton = document.getElementById("next-prize-button");
const winnerModalPrize = document.getElementById("winner-modal-prize");
const voidDrawButton = document.getElementById("void-draw-button");

const sheetPollIntervalMs = 5000;
const sheetSyncHelpText = sheetSyncStatus.textContent.trim();
let sheetUrl = "";
let sheetPollTimer = null;
let sheetFetchInFlight = false;
// Winners removed during a synced session, so the next poll doesn't re-add them.
let removedSheetNames = [];

// Each wheel belongs to an event at /<slug>; its state is saved on the server.
const eventSlug = decodeURIComponent(window.location.pathname.split("/")[1] || "").toLowerCase();
const eventApiUrl = `/api/events/${encodeURIComponent(eventSlug)}`;
const saveDelayMs = 600;
let eventReady = false;
let saveTimer = null;

// Prizes are drawn top to bottom; each draw for a prize is logged as an award.
let prizes = [];
let currentPrizeIndex = 0;
let awards = [];
let lastAwardId = "";
let lastPrizesFocus = null;

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

  if (values.length > 0 && /\bnames?\b/i.test(values[0])) {
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
  scheduleSave();
}

function openWinnerModal(name, prizeName = "") {
  lastFocusedElement = document.activeElement;
  lastWinner = name;
  winnerModalTitle.textContent = wheelSettings.popupHeaderText;
  winnerModalName.textContent = name;
  winnerModalPrize.textContent = prizeName ? `wins ${prizeName}` : "";
  winnerModalPrize.classList.toggle("hidden", !prizeName);
  voidDrawButton.classList.toggle("hidden", !prizeName);
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
  if (sheetUrl) {
    removedSheetNames.push(lastWinner);
  }
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

function excludeRemovedSheetNames(names) {
  const remaining = [...names];
  removedSheetNames.forEach((removedName) => {
    const index = remaining.indexOf(removedName);
    if (index !== -1) {
      remaining.splice(index, 1);
    }
  });
  return remaining;
}

function setSheetSyncStatus(message) {
  sheetSyncStatus.textContent = message;
}

async function pollSheet() {
  if (!sheetUrl || sheetFetchInFlight || !window.XLSX) {
    return;
  }

  // Never swap names mid-spin; the next poll will pick up any changes.
  if (spinAnimationId) {
    return;
  }

  sheetFetchInFlight = true;
  const requestedUrl = sheetUrl;

  try {
    const response = await fetch(`/api/sheet?url=${encodeURIComponent(requestedUrl)}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await response.text());
    }

    const isCsv = (response.headers.get("content-type") || "").includes("csv");
    const data = new Uint8Array(await response.arrayBuffer());
    if (requestedUrl !== sheetUrl || spinAnimationId) {
      return;
    }

    // Decode CSV as UTF-8 ourselves so non-Latin names (e.g. Thai) survive.
    const workbook = isCsv
      ? window.XLSX.read(new TextDecoder("utf-8").decode(data), { type: "string" })
      : window.XLSX.read(data, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false });
    const names = excludeRemovedSheetNames(normalizeImportedNames(rows));

    if (names.join("\n") !== parseNames().join("\n")) {
      updateNames(names);
    }

    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setSheetSyncStatus(`Live: ${names.length} names, last checked ${time}.`);
  } catch (error) {
    if (requestedUrl === sheetUrl) {
      setSheetSyncStatus(error.message || "Couldn't reach the sheet. Retrying…");
    }
  } finally {
    sheetFetchInFlight = false;
  }
}

function startSheetSync(url, removedNames = []) {
  stopSheetSync();
  sheetUrl = url;
  removedSheetNames = [...removedNames];
  sheetUrlInput.value = url;
  input.readOnly = true;
  sheetSyncButton.textContent = "Stop";
  setSheetSyncStatus("Connecting to sheet…");
  scheduleSave();
  pollSheet();
  sheetPollTimer = setInterval(pollSheet, sheetPollIntervalMs);
}

function stopSheetSync() {
  clearInterval(sheetPollTimer);
  sheetPollTimer = null;
  sheetUrl = "";
  removedSheetNames = [];
  input.readOnly = false;
  sheetSyncButton.textContent = "Sync";
  setSheetSyncStatus(sheetSyncHelpText);
}

function handleSheetSyncButton() {
  if (sheetUrl) {
    stopSheetSync();
    scheduleSave();
    return;
  }

  const url = sheetUrlInput.value.trim();
  if (!url) {
    setSheetSyncStatus("Paste a shared sheet link first.");
    return;
  }

  startSheetSync(url);
}

function parsePrizes(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.*?)\s*[x×]\s*(\d+)$/i);
      if (match && match[1]) {
        return { name: match[1], quantity: Math.max(1, Number(match[2])) };
      }
      return { name: line, quantity: 1 };
    });
}

function countAwards(prizeName) {
  return awards.filter((award) => award.prize === prizeName).length;
}

function isPrizeComplete(index) {
  return countAwards(prizes[index].name) >= prizes[index].quantity;
}

function findNextOpenPrize(fromIndex) {
  for (let index = fromIndex; index < prizes.length; index += 1) {
    if (!isPrizeComplete(index)) {
      return index;
    }
  }
  return prizes.length;
}

function getCurrentPrize() {
  return prizes[currentPrizeIndex] || null;
}

function renderPrizeBanner() {
  const prize = getCurrentPrize();
  prizeBanner.classList.toggle("hidden", prizes.length === 0);
  bodyElement.classList.toggle("has-prizes", prizes.length > 0);

  if (!prize) {
    prizeBannerName.textContent = "All prizes drawn";
    prizeBannerCount.textContent = "";
  } else {
    const drawn = countAwards(prize.name);
    prizeBannerName.textContent = prize.name;
    prizeBannerCount.textContent = prize.quantity > 1
      ? `Draw ${Math.min(drawn + 1, prize.quantity)} of ${prize.quantity}`
      : "";
  }

  prevPrizeButton.disabled = currentPrizeIndex <= 0;
  nextPrizeButton.disabled = currentPrizeIndex >= prizes.length;
}

function formatAwardTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderPrizesPanel() {
  prizeList.replaceChildren();
  prizes.forEach((prize, index) => {
    const item = document.createElement("li");
    item.className = "prize-item";
    item.classList.toggle("current", index === currentPrizeIndex);
    item.classList.toggle("complete", isPrizeComplete(index));

    const label = document.createElement("span");
    label.className = "prize-item-name";
    label.textContent = prize.name;

    const status = document.createElement("span");
    status.className = "prize-item-status";
    status.textContent = `${countAwards(prize.name)} / ${prize.quantity} drawn`;

    const select = document.createElement("button");
    select.type = "button";
    select.className = "ghost-button small-button";
    select.textContent = index === currentPrizeIndex ? "Up next" : "Spin for this";
    select.disabled = index === currentPrizeIndex;
    select.addEventListener("click", () => setCurrentPrize(index));

    item.append(label, status, select);
    prizeList.append(item);
  });

  winnersList.replaceChildren();
  awards.forEach((award) => {
    const item = document.createElement("li");
    item.className = "winner-item";

    const text = document.createElement("span");
    text.className = "winner-item-text";
    const who = document.createElement("strong");
    who.textContent = award.name;
    text.append(who, ` – ${award.prize} · ${formatAwardTime(award.at)}`);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "winner-item-remove";
    remove.setAttribute("aria-label", `Remove ${award.name} from the log`);
    remove.textContent = "×";
    remove.addEventListener("click", () => removeAward(award.id));

    item.append(text, remove);
    winnersList.append(item);
  });
  winnersEmpty.hidden = awards.length > 0;
  downloadWinnersButton.disabled = awards.length === 0;
  clearWinnersButton.disabled = awards.length === 0;
}

function renderPrizes() {
  renderPrizeBanner();
  renderPrizesPanel();
}

function setCurrentPrize(index) {
  currentPrizeIndex = Math.max(0, Math.min(index, prizes.length));
  renderPrizes();
  scheduleSave();
}

function handlePrizesInput() {
  const currentName = getCurrentPrize()?.name;
  prizes = parsePrizes(prizesInput.value);
  // Keep pointing at the same prize while the list is being edited.
  const sameIndex = prizes.findIndex((prize) => prize.name === currentName);
  currentPrizeIndex = sameIndex !== -1 ? sameIndex : findNextOpenPrize(0);
  renderPrizes();
  scheduleSave();
}

// Logs the winner against the current prize and returns the prize name ("" if none).
function recordAward(winnerName) {
  const prize = getCurrentPrize();
  lastAwardId = "";
  if (!prize) {
    return "";
  }

  const award = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: winnerName,
    prize: prize.name,
    at: new Date().toISOString(),
  };
  awards.push(award);
  lastAwardId = award.id;

  if (isPrizeComplete(currentPrizeIndex)) {
    currentPrizeIndex = findNextOpenPrize(currentPrizeIndex + 1);
  }
  renderPrizes();
  scheduleSave();
  return prize.name;
}

function removeAward(awardId) {
  const award = awards.find((entry) => entry.id === awardId);
  if (!award) {
    return;
  }

  awards = awards.filter((entry) => entry.id !== awardId);
  // Point back at the prize that just got a slot free again.
  const prizeIndex = prizes.findIndex((prize) => prize.name === award.prize);
  if (prizeIndex !== -1 && prizeIndex < currentPrizeIndex) {
    currentPrizeIndex = prizeIndex;
  }
  renderPrizes();
  scheduleSave();
}

function voidLastDraw() {
  if (lastAwardId) {
    removeAward(lastAwardId);
    lastAwardId = "";
  }
  closeWinnerModal();
}

function clearAwards() {
  if (!window.confirm("Clear the whole winners log? Prizes will be available to draw again.")) {
    return;
  }
  awards = [];
  currentPrizeIndex = findNextOpenPrize(0);
  renderPrizes();
  scheduleSave();
}

function downloadWinnersCsv() {
  const escapeCell = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const rows = [["Time", "Prize", "Winner"]].concat(
    awards.map((award) => [new Date(award.at).toLocaleString(), award.prize, award.name])
  );
  const csv = rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
  // The BOM makes Excel open non-Latin names (e.g. Thai) correctly.
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${eventSlug || "wheel"}-winners.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function openPrizesModal() {
  lastPrizesFocus = document.activeElement;
  renderPrizesPanel();
  prizesModal.classList.remove("hidden");
  prizesModal.setAttribute("aria-hidden", "false");
  closePrizesButton.focus();
}

function closePrizesModal() {
  prizesModal.classList.add("hidden");
  prizesModal.setAttribute("aria-hidden", "true");
  if (lastPrizesFocus instanceof HTMLElement) {
    lastPrizesFocus.focus();
  }
}

function getSettingsSnapshot() {
  return {
    ...wheelSettings,
    palette: [...palette],
    selectedThemeIndex: getSelectedThemeIndex(),
    wheelBackgroundImage: wheelBackgroundImageDataUrl,
    pageBackgroundImage: pageBackgroundImageDataUrl,
  };
}

function setSaveStatus(message) {
  saveStatus.textContent = message;
  saveStatus.classList.toggle("hidden", !message);
}

function scheduleSave() {
  if (!eventReady) {
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveEvent, saveDelayMs);
}

async function saveEvent() {
  saveTimer = null;
  try {
    const response = await fetch(eventApiUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        names: parseNames(),
        removedNames: removedSheetNames,
        sheetUrl,
        prizesText: prizesInput.value,
        currentPrizeIndex,
        awards,
        settings: getSettingsSnapshot(),
      }),
    });
    if (!response.ok) {
      throw new Error();
    }
    setSaveStatus("");
  } catch {
    setSaveStatus("Not saved – retrying");
    scheduleSave();
  }
}

async function loadEvent() {
  try {
    const response = await fetch(eventApiUrl, { cache: "no-store" });
    if (!response.ok) {
      window.location.href = "/";
      return;
    }

    const event = await response.json();
    document.title = `${event.name} · Spin the Wheel`;
    if (event.settings) {
      applyLoadedSettings(event.settings);
    }
    updateNames(event.names || []);
    prizesInput.value = event.prizesText || "";
    prizes = parsePrizes(prizesInput.value);
    awards = Array.isArray(event.awards) ? event.awards : [];
    currentPrizeIndex = Number.isInteger(event.currentPrizeIndex) ? event.currentPrizeIndex : findNextOpenPrize(0);
    renderPrizes();
    if (event.sheetUrl) {
      startSheetSync(event.sheetUrl, event.removedNames || []);
    }
    eventReady = true;
  } catch {
    setSaveStatus("Couldn't load this event – refresh to retry");
  }
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
    ctx.font = "700 46px Roboto Flex";
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
    const textRadius = radius - 60;
    const maxTextWidth = Math.min(
      radius * 0.58,
      Math.max(80, 2 * Math.sin(arc / 2) * (textRadius - 32))
    );

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
    ctx.translate(textRadius, 0);
    if (wheelBackgroundImage) {
      ctx.shadowColor = "rgba(31, 26, 22, 0.45)";
      ctx.shadowBlur = 10;
    }

    const fontSize = fitTextFontSize(name, 38, 12, maxTextWidth);
    ctx.font = `700 ${fontSize}px Roboto Flex`;
    ctx.fillText(name, 0, fontSize * 0.32);
    ctx.restore();
  });

  ctx.restore();
}

function fitTextFontSize(text, baseFontSize, minFontSize, maxWidth) {
  let fontSize = baseFontSize;

  while (fontSize > minFontSize) {
    ctx.font = `700 ${fontSize}px Roboto Flex`;
    if (ctx.measureText(text).width <= maxWidth) {
      return fontSize;
    }
    fontSize -= 1;
  }

  return minFontSize;
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
  const durationMs = Math.max(3000, wheelSettings.spinDurationSeconds * 1000);
  const startRotation = rotation;
  let startTime = null;

  function easeOutQuint(t) {
    return 1 - Math.pow(1 - t, 5);
  }

  function scriptedSpin(timestamp) {
    if (startTime === null) {
      startTime = timestamp;
    }

    const progress = Math.min((timestamp - startTime) / durationMs, 1);
    const eased = easeOutQuint(Math.min(progress, 1));
    const newRotation = startRotation + extraRotation * eased;
    spinVelocity = newRotation - rotation;
    rotation = newRotation;

    drawWheel(names);

    if (progress < 1) {
      spinAnimationId = requestAnimationFrame(scriptedSpin);
      return;
    }

    spinAnimationId = null;
    spinVelocity = 0;
    const winner = pickWinner(names);
    winnerText.textContent = winner;
    drawWheel(names);
    stopIdleSpin();
    openWinnerModal(winner, recordAward(winner));
  }

  spinAnimationId = requestAnimationFrame(scriptedSpin);
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
  scheduleSave();
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
      scheduleSave();
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
    settings: getSettingsSnapshot(),
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
      scheduleSave();
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
  scheduleSave();
});
// Any change in the Customise panel is saved to the event.
["input", "change", "click"].forEach((type) => customizeModal.addEventListener(type, scheduleSave));

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
prizesButton.addEventListener("click", openPrizesModal);
closePrizesButton.addEventListener("click", closePrizesModal);
prizesModal.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.dataset.closePrizes === "true") {
    closePrizesModal();
  }
});
prizesInput.addEventListener("input", handlePrizesInput);
prevPrizeButton.addEventListener("click", () => setCurrentPrize(currentPrizeIndex - 1));
nextPrizeButton.addEventListener("click", () => setCurrentPrize(currentPrizeIndex + 1));
voidDrawButton.addEventListener("click", voidLastDraw);
downloadWinnersButton.addEventListener("click", downloadWinnersCsv);
clearWinnersButton.addEventListener("click", clearAwards);
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
themeToggleInput.addEventListener("change", scheduleSave);
sheetSyncButton.addEventListener("click", handleSheetSyncButton);
sheetUrlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleSheetSyncButton();
  }
});
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

    if (
      namesModal.classList.contains("hidden")
      && customizeModal.classList.contains("hidden")
      && prizesModal.classList.contains("hidden")
    ) {
      startSpin();
      return;
    }
  }

  const noModalOpen = [winnerModal, namesModal, customizeModal, prizesModal]
    .every((modal) => modal.classList.contains("hidden"));
  if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && noModalOpen && prizes.length > 0) {
    event.preventDefault();
    setCurrentPrize(currentPrizeIndex + (event.key === "ArrowRight" ? 1 : -1));
    return;
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
    return;
  }

  if (event.key === "Escape" && !prizesModal.classList.contains("hidden")) {
    closePrizesModal();
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
loadEvent();
startIdleSpin();
