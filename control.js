// Control screen: the operator's side. It owns the event's data, decides each
// spin, and tells the display screen(s) what to show.

const $ = (id) => document.getElementById(id);

const eventTitle = $("event-title");
const displayStatus = $("display-status");
const displayStatusText = $("display-status-text");
const saveStatus = $("save-status");
const openDisplayLink = $("open-display");
const previewFrame = $("preview-frame");

const prevPrizeButton = $("prev-prize");
const nextPrizeButton = $("next-prize");
const currentPrizeText = $("current-prize");
const spinButton = $("spin-button");
const resultHeadline = $("result-headline");
const resultDetail = $("result-detail");
const resultActions = $("result-actions");
const removeWinnerButton = $("remove-winner");
const removeAndSpinButton = $("remove-and-spin");
const voidDrawButton = $("void-draw");
const dismissResultButton = $("dismiss-result");

const tabs = Array.from(document.querySelectorAll(".tab"));
const namesCount = $("names-count");
const winnersCount = $("winners-count");

const sheetUrlInput = $("sheet-url");
const sheetSyncButton = $("sheet-sync");
const sheetStatus = $("sheet-status");
const namesInput = $("names-input");
const namesMode = $("names-mode");
const fileInput = $("file-input");
const removedSection = $("removed-section");
const removedList = $("removed-list");
const restoreRemovedButton = $("restore-removed");

const prizesInput = $("prizes-input");
const prizeList = $("prize-list");
const prizeEmpty = $("prize-empty");

const winnersList = $("winners-list");
const winnersEmpty = $("winners-empty");
const downloadWinnersButton = $("download-winners");
const clearWinnersButton = $("clear-winners");

const themeGrid = $("theme-grid");
const spinDurationInput = $("spin-duration");
const spinDurationValue = $("spin-duration-value");
const popupHeaderInput = $("popup-header");
const arrowPositionInput = $("arrow-position");
const arrowPositionValue = $("arrow-position-value");
const appThemeButtons = Array.from(document.querySelectorAll("[data-app-theme]"));
const soundButtons = Array.from(document.querySelectorAll("[data-sound]"));
const textColorInput = $("text-color");
const textColorValue = $("text-color-value");
const arrowColorInput = $("arrow-color");
const arrowColorValue = $("arrow-color-value");
const pageColorInput = $("page-color");
const pageColorValue = $("page-color-value");
const resetPageColorButton = $("reset-page-color");
const pageImageInput = $("page-image");
const pageImageStatus = $("page-image-status");
const clearPageImageButton = $("clear-page-image");
const wheelImageInput = $("wheel-image");
const wheelImageStatus = $("wheel-image-status");
const clearWheelImageButton = $("clear-wheel-image");
const saveSettingsButton = $("save-settings");
const loadSettingsButton = $("load-settings");
const loadSettingsInput = $("load-settings-input");
const lookStatus = $("look-status");

const eventSlug = decodeURIComponent(window.location.pathname.split("/")[1] || "").toLowerCase();
const eventApiUrl = `/api/events/${encodeURIComponent(eventSlug)}`;
const saveDelayMs = 600;
const sheetHelpText = sheetStatus.textContent;

let settings = normalizeSettings(null);
let sheetUrl = "";
// Winners taken off the wheel; the server won't add them back from the sheet.
let removedNames = [];
let prizes = [];
let currentPrizeIndex = 0;
let awards = [];

// idle → spinning → result → idle
let phase = "idle";
let lastResult = null;
let eventReady = false;
let saveTimer = null;

// ---- Saving ----

function scheduleSave() {
  if (!eventReady) {
    return;
  }
  saveStatus.textContent = "Saving";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveEvent, saveDelayMs);
}

async function saveEvent() {
  try {
    const response = await fetch(eventApiUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // While a sheet is connected the server owns the names list.
        ...(sheetUrl ? {} : { names: parseNames() }),
        removedNames,
        sheetUrl,
        prizesText: prizesInput.value,
        currentPrizeIndex,
        awards,
        settings,
      }),
    });
    if (!response.ok) {
      throw new Error();
    }
    saveStatus.textContent = "All changes saved";
  } catch {
    saveStatus.textContent = "Not saved. Retrying";
    scheduleSave();
  }
}

// ---- Names ----

function parseNames() {
  return namesInput.value
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean);
}

function setNames(names) {
  namesInput.value = names.join("\n");
  renderNamesMeta();
  scheduleSave();
}

function renderNamesMeta() {
  namesCount.textContent = String(parseNames().length);
  namesMode.textContent = sheetUrl ? "From the live sheet" : "Typed list";
  removedSection.hidden = removedNames.length === 0;
  removedList.textContent = removedNames.join(", ");
}

function normalizeImportedNames(rows) {
  const values = rows
    .map((row) => (Array.isArray(row) ? row[0] : row))
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (values.length > 0 && /\bnames?\b/i.test(values[0])) {
    values.shift();
  }
  return values;
}

function rowsFromWorkbookData(data, isCsv) {
  // Decode CSV as UTF-8 ourselves so non-Latin names (e.g. Thai) survive.
  const workbook = isCsv
    ? window.XLSX.read(new TextDecoder("utf-8").decode(data), { type: "string" })
    : window.XLSX.read(data, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return window.XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false });
}

async function handleFileImport() {
  const [file] = fileInput.files || [];
  if (!file) {
    return;
  }
  if (sheetUrl) {
    stopSheetSync();
  }
  const data = new Uint8Array(await file.arrayBuffer());
  setNames(normalizeImportedNames(rowsFromWorkbookData(data, file.name.toLowerCase().endsWith(".csv"))));
  fileInput.value = "";
}

// The server reads the sheet every 5 seconds and pushes new names to every screen.
async function refreshSheetNames() {
  if (!sheetUrl || phase === "starting" || phase === "spinning") {
    return;
  }
  try {
    const response = await fetch(eventApiUrl, { cache: "no-store" });
    const event = await response.json();
    if (sheetUrl && event.sheetUrl === sheetUrl && phase !== "starting" && phase !== "spinning") {
      namesInput.value = (event.names || []).join("\n");
      renderNamesMeta();
    }
  } catch {
    // The next update brings the names in.
  }
}

function renderSheetStatus(status) {
  if (!sheetUrl) {
    return;
  }
  const time = new Date(status.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  sheetStatus.textContent = status.ok
    ? `Connected. ${status.count} names, checked at ${time}. Updates every 5 seconds.`
    : status.error;
}

function startSheetSync(url) {
  sheetUrl = url;
  sheetUrlInput.value = url;
  namesInput.readOnly = true;
  sheetSyncButton.textContent = "Disconnect";
  sheetStatus.textContent = "Connecting to the sheet";
  renderNamesMeta();
}

function stopSheetSync() {
  sheetUrl = "";
  namesInput.readOnly = false;
  sheetSyncButton.textContent = "Connect";
  sheetStatus.textContent = sheetHelpText;
  renderNamesMeta();
}

function handleSheetButton() {
  if (sheetUrl) {
    stopSheetSync();
    scheduleSave();
    return;
  }
  const url = sheetUrlInput.value.trim();
  if (!url) {
    sheetStatus.textContent = "Paste the sheet link first.";
    sheetUrlInput.focus();
    return;
  }
  startSheetSync(url);
  scheduleSave();
}

function restoreRemoved() {
  if (!sheetUrl) {
    setNames(parseNames().concat(removedNames));
  }
  removedNames = [];
  renderNamesMeta();
  scheduleSave();
}

// ---- Prizes ----

function isPrizeComplete(index) {
  return countAwards(awards, prizes[index].name) >= prizes[index].quantity;
}

function findNextOpenPrize(fromIndex) {
  for (let index = fromIndex; index < prizes.length; index += 1) {
    if (!isPrizeComplete(index)) {
      return index;
    }
  }
  return prizes.length;
}

function renderPrizes() {
  const current = describeCurrentPrize(prizes, awards, currentPrizeIndex);
  currentPrizeText.textContent = current
    ? `${current.name}${current.detail ? ` · ${current.detail}` : ""}`
    : "No prize set";
  prevPrizeButton.disabled = currentPrizeIndex <= 0;
  nextPrizeButton.disabled = currentPrizeIndex >= prizes.length;

  prizeList.replaceChildren();
  prizeEmpty.hidden = prizes.length > 0;
  prizes.forEach((prize, index) => {
    const item = document.createElement("li");
    item.className = "list-item";
    item.classList.toggle("current", index === currentPrizeIndex);
    item.classList.toggle("complete", isPrizeComplete(index));

    const name = document.createElement("span");
    name.className = "list-item-main title-4";
    name.textContent = prize.name;

    const meta = document.createElement("span");
    meta.className = "list-item-meta caption-4";
    meta.textContent = `${countAwards(awards, prize.name)} of ${prize.quantity} drawn`;

    const select = document.createElement("button");
    select.type = "button";
    select.className = "button quiet small";
    select.textContent = index === currentPrizeIndex ? "Up next" : "Spin for this";
    select.disabled = index === currentPrizeIndex;
    select.addEventListener("click", () => setCurrentPrize(index));

    item.append(name, meta, select);
    prizeList.append(item);
  });

  renderWinners();
}

function setCurrentPrize(index) {
  if (phase === "spinning") {
    return;
  }
  currentPrizeIndex = Math.max(0, Math.min(index, prizes.length));
  renderPrizes();
  scheduleSave();
}

function handlePrizesInput() {
  const currentName = prizes[currentPrizeIndex]?.name;
  prizes = parsePrizes(prizesInput.value);
  // Keep pointing at the same prize while the list is edited.
  const sameIndex = prizes.findIndex((prize) => prize.name === currentName);
  currentPrizeIndex = sameIndex !== -1 ? sameIndex : findNextOpenPrize(0);
  renderPrizes();
  scheduleSave();
}

// ---- Winners log ----

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderWinners() {
  winnersCount.textContent = String(awards.length);
  winnersEmpty.hidden = awards.length > 0;
  downloadWinnersButton.disabled = awards.length === 0;
  clearWinnersButton.disabled = awards.length === 0;

  winnersList.replaceChildren();
  [...awards].reverse().forEach((award) => {
    const item = document.createElement("li");
    item.className = "list-item";

    const main = document.createElement("span");
    main.className = "list-item-main body-6";
    const who = document.createElement("strong");
    who.textContent = award.name;
    main.append(who, ` won ${award.prize}`);

    const time = document.createElement("span");
    time.className = "list-item-meta caption-4";
    time.textContent = formatTime(award.at);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button quiet small";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${award.name} from the log`);
    remove.addEventListener("click", () => removeAward(award.id));

    item.append(main, time, remove);
    winnersList.append(item);
  });
}

function recordAward(winner, prizeName) {
  const award = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: winner,
    prize: prizeName,
    at: new Date().toISOString(),
  };
  awards.push(award);
  const prizeIndex = prizes.findIndex((prize) => prize.name === prizeName);
  if (prizeIndex === currentPrizeIndex && isPrizeComplete(prizeIndex)) {
    currentPrizeIndex = findNextOpenPrize(prizeIndex + 1);
  }
  renderPrizes();
  scheduleSave();
  return award;
}

function removeAward(awardId) {
  const award = awards.find((entry) => entry.id === awardId);
  if (!award) {
    return;
  }
  awards = awards.filter((entry) => entry.id !== awardId);
  // Point back at the prize that has a free slot again.
  const prizeIndex = prizes.findIndex((prize) => prize.name === award.prize);
  if (prizeIndex !== -1 && prizeIndex < currentPrizeIndex) {
    currentPrizeIndex = prizeIndex;
  }
  renderPrizes();
  scheduleSave();
}

function downloadWinnersCsv() {
  const escapeCell = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const rows = [["Time", "Prize", "Winner"]].concat(
    awards.map((award) => [new Date(award.at).toLocaleString(), award.prize, award.name])
  );
  const csv = rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
  // The BOM makes Excel open non-Latin names correctly.
  downloadFile(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `${eventSlug}-winners.csv`);
}

function downloadFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Destructive buttons ask for a second click instead of a browser dialog.
function confirmClick(button, confirmLabel, action) {
  if (button.dataset.confirming === "true") {
    clearTimeout(Number(button.dataset.timer));
    button.dataset.confirming = "false";
    button.classList.remove("confirming");
    button.textContent = button.dataset.label;
    action();
    return;
  }
  button.dataset.label = button.textContent;
  button.dataset.confirming = "true";
  button.classList.add("confirming");
  button.textContent = confirmLabel;
  button.dataset.timer = String(
    setTimeout(() => {
      button.dataset.confirming = "false";
      button.classList.remove("confirming");
      button.textContent = button.dataset.label;
    }, 3000)
  );
}

// ---- Spinning ----

async function sendLive(command) {
  const response = await fetch(`${eventApiUrl}/live`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!response.ok) {
    throw new Error((await response.json()).error);
  }
}

function setResult(headline, detail, { showActions = false, winner = "" } = {}) {
  resultHeadline.replaceChildren();
  if (winner) {
    const name = document.createElement("span");
    name.className = "winner";
    name.textContent = winner;
    resultHeadline.append(name, headline);
  } else {
    resultHeadline.textContent = headline;
  }
  resultDetail.textContent = detail;
  resultActions.hidden = !showActions;
}

async function spin() {
  if (phase === "starting" || phase === "spinning" || !eventReady) {
    return;
  }
  if (phase === "result") {
    await dismissResult();
  }

  const names = parseNames();
  if (names.length < 2) {
    setResult("Add at least 2 names", "Open the Names tab to type names or connect a sheet.");
    return;
  }
  phase = "starting";

  const prize = prizes[currentPrizeIndex]?.name || "";
  const targetIndex = Math.floor(Math.random() * names.length);
  const durationMs = Math.round(settings.spinDurationSeconds * 1000);

  try {
    await sendLive({
      type: "spin",
      spinId: `${Date.now()}`,
      names,
      targetIndex,
      durationMs,
      prize,
      header: settings.popupHeaderText,
    });
  } catch (error) {
    phase = "idle";
    setResult("Spin didn't start", error.message || "Couldn't reach the server. Check the connection and try again.");
    return;
  }

  phase = "spinning";
  spinButton.disabled = true;
  setResult("Spinning", prize ? `For ${prize}` : "The result appears on the display and here together.");

  setTimeout(() => {
    const winner = names[targetIndex];
    const award = prize ? recordAward(winner, prize) : null;
    lastResult = { winner, prize, awardId: award?.id || "" };
    phase = "result";
    spinButton.disabled = false;
    setResult(prize ? ` wins ${prize}` : "", prize ? "Logged in Winners." : "No prize set for this spin.", {
      showActions: true,
      winner,
    });
    voidDrawButton.hidden = !award;
  }, durationMs);
}

async function dismissResult() {
  if (phase !== "result") {
    return;
  }
  phase = "idle";
  setResult("Ready for the next spin", lastResult ? `Last: ${lastResult.winner}${lastResult.prize ? ` won ${lastResult.prize}` : ""}.` : "");
  try {
    await sendLive({ type: "dismiss" });
  } catch {
    // The display clears on the next spin anyway.
  }
}

function removeWinner() {
  if (phase !== "result" || !lastResult) {
    return Promise.resolve();
  }
  const names = parseNames();
  const index = names.indexOf(lastResult.winner);
  if (index !== -1) {
    names.splice(index, 1);
  }
  removedNames.push(lastResult.winner);
  setNames(names);
  return dismissResult();
}

// Waits for the display to clear the result first, so the new spin isn't cancelled by it.
async function removeAndSpinAgain() {
  if (phase !== "result") {
    return;
  }
  await removeWinner();
  spin();
}

function voidDraw() {
  if (phase !== "result" || !lastResult?.awardId) {
    return;
  }
  removeAward(lastResult.awardId);
  lastResult = { ...lastResult, prize: "", awardId: "" };
  dismissResult().then(() => setResult("Draw voided", "The prize is back in play. Spin again when ready."));
}

// ---- Look ----

function renderThemeGrid() {
  themeGrid.replaceChildren();
  wheelThemes.forEach((theme) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-option";
    button.setAttribute("aria-pressed", String(palettesMatch(settings.palette, theme.palette)));
    const swatches = document.createElement("span");
    swatches.className = "swatches";
    theme.palette.forEach((color) => {
      const swatch = document.createElement("span");
      swatch.style.background = color;
      swatches.append(swatch);
    });
    button.append(theme.name, swatches);
    button.addEventListener("click", () => updateSettings({ palette: [...theme.palette] }));
    themeGrid.append(button);
  });
}

function renderLook() {
  spinDurationInput.value = String(settings.spinDurationSeconds);
  spinDurationValue.textContent = `${settings.spinDurationSeconds.toFixed(1)}s`;
  if (document.activeElement !== popupHeaderInput) {
    popupHeaderInput.value = settings.popupHeaderText;
  }
  arrowPositionInput.value = String(settings.pointerClockHour);
  arrowPositionValue.textContent = `${settings.pointerClockHour} o'clock`;
  appThemeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.appTheme === settings.appTheme));
  });
  soundButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String((button.dataset.sound === "on") === settings.soundEnabled));
  });
  textColorInput.value = settings.textColor;
  textColorValue.textContent = settings.textColor.toUpperCase();
  arrowColorInput.value = settings.arrowColor;
  arrowColorValue.textContent = settings.arrowColor.toUpperCase();
  pageColorInput.value = settings.wheelBackdropColor;
  pageColorValue.textContent = settings.wheelBackdropColorCustom ? settings.wheelBackdropColor.toUpperCase() : "Theme default";
  resetPageColorButton.hidden = !settings.wheelBackdropColorCustom;
  pageImageStatus.textContent = settings.pageBackgroundImage ? "Background image set" : "No background image";
  clearPageImageButton.hidden = !settings.pageBackgroundImage;
  wheelImageStatus.textContent = settings.wheelBackgroundImage ? "Wheel image set" : "No wheel image";
  clearWheelImageButton.hidden = !settings.wheelBackgroundImage;
  renderThemeGrid();
}

function updateSettings(changes) {
  settings = normalizeSettings({ ...settings, ...changes });
  renderLook();
  scheduleSave();
}

// Shrinks big photos so the event stays quick to load on the display.
function readImage(file, maxSize = 2400) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(file.type === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.88));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function handleImageInput(input, key) {
  const [file] = input.files || [];
  if (!file) {
    return;
  }
  try {
    updateSettings({ [key]: await readImage(file) });
  } catch {
    lookStatus.textContent = "That image couldn't be read. Try a JPG or PNG.";
  }
  input.value = "";
}

function saveLookToFile() {
  const payload = { exportedAt: new Date().toISOString(), settings };
  downloadFile(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${eventSlug}-look.json`);
}

async function loadLookFromFile() {
  const [file] = loadSettingsInput.files || [];
  if (!file) {
    return;
  }
  try {
    const parsed = JSON.parse(await file.text());
    updateSettings(parsed && typeof parsed === "object" && "settings" in parsed ? parsed.settings : parsed);
    lookStatus.textContent = `Loaded the look from ${file.name}.`;
  } catch {
    lookStatus.textContent = "That file isn't a saved look. Choose a .json file saved from this page.";
  }
  loadSettingsInput.value = "";
}

// ---- Tabs ----

function selectTab(tab) {
  tabs.forEach((other) => {
    const selected = other === tab;
    other.setAttribute("aria-selected", String(selected));
    other.tabIndex = selected ? 0 : -1;
    $(other.getAttribute("aria-controls")).hidden = !selected;
  });
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }
    const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    selectTab(next);
    next.focus();
  });
});

// ---- Loading ----

async function loadEvent() {
  try {
    const response = await fetch(eventApiUrl, { cache: "no-store" });
    if (!response.ok) {
      window.location.href = "/";
      return;
    }
    const event = await response.json();
    document.title = `${event.name} · Control`;
    eventTitle.textContent = event.name;

    settings = normalizeSettings(event.settings);
    namesInput.value = (event.names || []).join("\n");
    removedNames = Array.isArray(event.removedNames) ? event.removedNames : [];
    prizesInput.value = event.prizesText || "";
    prizes = parsePrizes(prizesInput.value);
    awards = Array.isArray(event.awards) ? event.awards : [];
    currentPrizeIndex = Number.isInteger(event.currentPrizeIndex) ? event.currentPrizeIndex : findNextOpenPrize(0);

    renderLook();
    renderPrizes();
    renderNamesMeta();
    if (event.sheetUrl) {
      startSheetSync(event.sheetUrl);
    }
    eventReady = true;
  } catch {
    eventTitle.textContent = "Couldn't load this event. Refresh to try again.";
  }
}

function renderDisplayCount({ count }) {
  displayStatus.classList.toggle("live", count > 0);
  displayStatusText.textContent =
    count === 0 ? "No display open" : count === 1 ? "Display connected" : `${count} displays connected`;
}

function isTyping(target) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

// ---- Wiring ----

spinButton.addEventListener("click", spin);
removeWinnerButton.addEventListener("click", removeWinner);
removeAndSpinButton.addEventListener("click", removeAndSpinAgain);
voidDrawButton.addEventListener("click", voidDraw);
dismissResultButton.addEventListener("click", dismissResult);
prevPrizeButton.addEventListener("click", () => setCurrentPrize(currentPrizeIndex - 1));
nextPrizeButton.addEventListener("click", () => setCurrentPrize(currentPrizeIndex + 1));

sheetSyncButton.addEventListener("click", handleSheetButton);
sheetUrlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleSheetButton();
  }
});
namesInput.addEventListener("input", () => {
  renderNamesMeta();
  scheduleSave();
});
fileInput.addEventListener("change", handleFileImport);
restoreRemovedButton.addEventListener("click", restoreRemoved);

prizesInput.addEventListener("input", handlePrizesInput);
downloadWinnersButton.addEventListener("click", downloadWinnersCsv);
clearWinnersButton.addEventListener("click", () =>
  confirmClick(clearWinnersButton, "Click again to clear", () => {
    awards = [];
    currentPrizeIndex = findNextOpenPrize(0);
    renderPrizes();
    scheduleSave();
  })
);

spinDurationInput.addEventListener("input", () => updateSettings({ spinDurationSeconds: Number(spinDurationInput.value) }));
popupHeaderInput.addEventListener("input", () => updateSettings({ popupHeaderText: popupHeaderInput.value }));
arrowPositionInput.addEventListener("input", () => updateSettings({ pointerClockHour: Number(arrowPositionInput.value) }));
appThemeButtons.forEach((button) => {
  button.addEventListener("click", () => updateSettings({ appTheme: button.dataset.appTheme }));
});
soundButtons.forEach((button) => {
  button.addEventListener("click", () => updateSettings({ soundEnabled: button.dataset.sound === "on" }));
});
textColorInput.addEventListener("input", () => updateSettings({ textColor: textColorInput.value }));
arrowColorInput.addEventListener("input", () => updateSettings({ arrowColor: arrowColorInput.value }));
pageColorInput.addEventListener("input", () =>
  updateSettings({ wheelBackdropColor: pageColorInput.value, wheelBackdropColorCustom: true })
);
resetPageColorButton.addEventListener("click", () => updateSettings({ wheelBackdropColorCustom: false }));
pageImageInput.addEventListener("change", () => handleImageInput(pageImageInput, "pageBackgroundImage"));
wheelImageInput.addEventListener("change", () => handleImageInput(wheelImageInput, "wheelBackgroundImage"));
clearPageImageButton.addEventListener("click", () => updateSettings({ pageBackgroundImage: "" }));
clearWheelImageButton.addEventListener("click", () => updateSettings({ wheelBackgroundImage: "" }));
saveSettingsButton.addEventListener("click", saveLookToFile);
loadSettingsButton.addEventListener("click", () => loadSettingsInput.click());
loadSettingsInput.addEventListener("change", loadLookFromFile);

document.addEventListener("keydown", (event) => {
  if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }
  const key = event.key.toLowerCase();
  if (key === " ") {
    event.preventDefault();
    spin();
  } else if (key === "enter" && !event.target.closest?.("button, a")) {
    removeAndSpinAgain();
  } else if (key === "r") {
    removeWinner();
  } else if (key === "v") {
    voidDraw();
  } else if (key === "escape") {
    dismissResult();
  } else if ((key === "arrowleft" || key === "arrowright") && !event.target.closest?.("[role='tab']")) {
    setCurrentPrize(currentPrizeIndex + (key === "arrowright" ? 1 : -1));
  }
});

openDisplayLink.href = `/${encodeURIComponent(eventSlug)}/display`;
previewFrame.src = `/${encodeURIComponent(eventSlug)}/display?preview=1`;
connectToEvent(eventSlug, "control", {
  displays: renderDisplayCount,
  updated: refreshSheetNames,
  sheet: renderSheetStatus,
});
loadEvent();
