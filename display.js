// Audience screen. It never decides anything: it shows the event's look and
// plays whatever spin the control screen sends.

const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const canvas3d = document.getElementById("wheel-3d");
// The wheel face is drawn once per change here, then turned by the renderer each frame.
const faceCanvas = document.createElement("canvas");
faceCanvas.width = 2048;
faceCanvas.height = 2048;
const faceCtx = faceCanvas.getContext("2d");
const wheelStage = document.getElementById("wheel-stage");
const wheelArea = document.getElementById("wheel-area");
const pointerWrap = document.getElementById("pointer-wrap");
const prizeBanner = document.getElementById("prize-banner");
const prizeBannerName = document.getElementById("prize-banner-name");
const prizeBannerDetail = document.getElementById("prize-banner-detail");
const reveal = document.getElementById("reveal");
const revealHeader = document.getElementById("reveal-header");
const revealName = document.getElementById("reveal-name");
const revealPrize = document.getElementById("reveal-prize");
const fullscreenHint = document.getElementById("fullscreen-hint");
const connectionNote = document.getElementById("connection-note");
const soundNote = document.getElementById("sound-note");

const eventSlug = decodeURIComponent(window.location.pathname.split("/")[1] || "").toLowerCase();
const isPreview = new URLSearchParams(window.location.search).has("preview");
const idleRotationSpeed = 0.0024;
// With this many names the slices are too thin to read, so the end of each spin zooms in.
const ZOOM_MIN_NAMES = 25;
const LANDED_HOLD_MS = 1000; // time to see the landed name in close-up before the reveal
const HIGH_RES_NAMES = 60; // above this the face is drawn at double resolution

let settings = normalizeSettings(null);
let names = [];
let rotation = 0;
let spinAnimationId = null;
let idleAnimationId = null;
let currentSpinId = "";
let refreshPending = false;
let wheelImage = null;
let wheelImageSource = "";
let cursorTimer = null;
let faceDirty = true;
let zoom = 0; // 0 = whole wheel, 1 = close-up at the pointer
let disconnectTimer = null;

// ---- Drawing ----

function normalizeAngle(angle) {
  const fullCircle = Math.PI * 2;
  return ((angle % fullCircle) + fullCircle) % fullCircle;
}

function getPointerWorldAngle() {
  return -Math.PI / 2 + ((settings.pointerClockHour % 12) * 30 * Math.PI) / 180;
}

function updatePointer() {
  const distance = Math.max(0, wheelStage.clientWidth / 2 - 8);
  pointerWrap.style.setProperty("--pointer-distance", `${distance}px`);
  pointerWrap.style.setProperty("--pointer-angle", `${(settings.pointerClockHour % 12) * 30}deg`);
  document.documentElement.style.setProperty("--pointer", settings.arrowColor);
  renderer.setPointer(settings.pointerClockHour, settings.arrowColor);
  renderer.resize(wheelArea.clientWidth, wheelArea.clientHeight);
  drawWheel();
}

// WCAG relative luminance of a #rrggbb colour.
function luminance(hex) {
  const value = parseInt(String(hex).replace("#", "").slice(0, 6), 16) || 0;
  const channel = (shift) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

function contrastRatio(first, second) {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

// Keeps the chosen name colour unless it would be hard to read on this slice
// (e.g. white on a pale slice); then uses whichever of dark or white reads better.
const MIN_NAME_CONTRAST = 3; // WCAG minimum for large bold text
function readableNameColor(sliceColor) {
  if (contrastRatio(settings.textColor, sliceColor) >= MIN_NAME_CONTRAST) {
    return settings.textColor;
  }
  return contrastRatio("#1f1a16", sliceColor) >= contrastRatio("#ffffff", sliceColor) ? "#1f1a16" : "#ffffff";
}

function fitFontSize(text, baseSize, minSize, maxWidth) {
  for (let size = baseSize; size > minSize; size -= 1) {
    faceCtx.font = `700 ${size}px Manrope`;
    if (faceCtx.measureText(text).width <= maxWidth) {
      return size;
    }
  }
  return minSize;
}

// Draws the unrotated wheel face edge to edge on faceCanvas.
function drawFace() {
  const resolution = names.length > HIGH_RES_NAMES ? 4096 : 2048;
  if (faceCanvas.width !== resolution) {
    faceCanvas.width = resolution;
    faceCanvas.height = resolution;
  }
  const size = faceCanvas.width;
  const radius = size / 2;
  faceCtx.clearRect(0, 0, size, size);
  faceCtx.save();
  faceCtx.translate(radius, radius);

  if (names.length === 0) {
    faceCtx.beginPath();
    faceCtx.arc(0, 0, radius, 0, Math.PI * 2);
    faceCtx.fillStyle = settings.appTheme === "dark" ? "#272727" : "#fffcf7";
    faceCtx.fill();
    faceCtx.fillStyle = settings.appTheme === "dark" ? "#9b9b9b" : "#6e6157";
    faceCtx.font = `600 ${Math.round(radius * 0.09)}px Manrope`;
    faceCtx.textAlign = "center";
    faceCtx.fillText("Waiting for names", 0, radius * 0.03);
    faceCtx.restore();
    return;
  }

  const arc = (Math.PI * 2) / names.length;
  const textRadius = radius * 0.86;

  if (wheelImage) {
    const scale = Math.max(size / wheelImage.width, size / wheelImage.height);
    faceCtx.save();
    faceCtx.beginPath();
    faceCtx.arc(0, 0, radius, 0, Math.PI * 2);
    faceCtx.clip();
    faceCtx.drawImage(
      wheelImage,
      (-wheelImage.width * scale) / 2,
      (-wheelImage.height * scale) / 2,
      wheelImage.width * scale,
      wheelImage.height * scale
    );
    faceCtx.restore();
  }

  names.forEach((name, index) => {
    const startAngle = index * arc;
    const maxTextWidth = Math.min(radius * 0.6, Math.max(radius * 0.17, 2 * Math.sin(arc / 2) * textRadius * 0.9));

    if (!wheelImage) {
      faceCtx.beginPath();
      faceCtx.moveTo(0, 0);
      faceCtx.arc(0, 0, radius, startAngle, startAngle + arc);
      faceCtx.closePath();
      faceCtx.fillStyle = settings.palette[index % settings.palette.length];
      faceCtx.fill();
    }

    faceCtx.save();
    faceCtx.rotate(startAngle + arc / 2);
    faceCtx.translate(textRadius, 0);
    faceCtx.textAlign = "right";
    const sliceColor = settings.palette[index % settings.palette.length];
    faceCtx.fillStyle = wheelImage ? settings.textColor : readableNameColor(sliceColor);
    if (wheelImage) {
      faceCtx.shadowColor = "rgba(31, 26, 22, 0.5)";
      faceCtx.shadowBlur = 20;
    }
    // Never taller than the slice is thick, so neighbouring names don't overlap.
    const sliceThickness = 2 * Math.sin(arc / 2) * textRadius * 0.62;
    const largest = Math.round(Math.min(radius * 0.085, sliceThickness));
    const fontSize = fitFontSize(name, largest, Math.min(Math.round(radius * 0.024), largest), maxTextWidth);
    faceCtx.font = `700 ${fontSize}px Manrope`;
    if (wheelImage) {
      // A photo can be light anywhere, so outline names to keep them readable on it.
      const outlineLight = luminance(settings.textColor) < 0.4;
      faceCtx.strokeStyle = outlineLight ? "rgba(255, 255, 255, 0.85)" : "rgba(20, 17, 15, 0.75)";
      faceCtx.lineWidth = Math.max(2, fontSize * 0.14);
      faceCtx.lineJoin = "round";
      faceCtx.strokeText(name, 0, fontSize * 0.34);
    }
    faceCtx.fillText(name, 0, fontSize * 0.34);
    faceCtx.restore();
  });

  // Fine dividers between slices. They start away from the centre and fade with
  // long lists, where they would otherwise bunch up into a white haze.
  faceCtx.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.35, (0.35 * 40) / names.length)})`;
  faceCtx.lineWidth = Math.max(1, radius * 0.004 * Math.min(1, 40 / names.length));
  names.forEach((_, index) => {
    const x = Math.cos(index * arc);
    const y = Math.sin(index * arc);
    faceCtx.beginPath();
    faceCtx.moveTo(x * radius * 0.2, y * radius * 0.2);
    faceCtx.lineTo(x * radius, y * radius);
    faceCtx.stroke();
  });

  faceCtx.restore();
}

// Flat fallback: turns the face on the 2D canvas.
const flatRenderer = {
  setFace() {},
  setPointer() {},
  resize() {},
  render(angle) {
    const size = canvas.width;
    const radius = size / 2;
    const faceRadius = radius - 24;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(radius, radius);
    ctx.rotate(angle);
    ctx.drawImage(faceCanvas, -faceRadius, -faceRadius, faceRadius * 2, faceRadius * 2);
    ctx.restore();
  },
};
let renderer = flatRenderer;

function drawWheel() {
  if (faceDirty) {
    faceDirty = false;
    drawFace();
    renderer.setFace(names.length);
  }
  renderer.render(rotation, zoom);
}

function zoomsForNames() {
  return Boolean(renderer.canZoom) && names.length >= ZOOM_MIN_NAMES;
}

function setNames(next) {
  names = next;
  faceDirty = true;
}

// Switches to the 3D wheel once three.js has loaded; stays flat if WebGL is unavailable.
function useWheel3D() {
  if (renderer !== flatRenderer || !window.createWheel3D) {
    return;
  }
  try {
    renderer = window.createWheel3D({ canvas: canvas3d, faceCanvas });
  } catch {
    renderer = flatRenderer;
    return;
  }
  document.body.classList.add("wheel-3d");
  faceDirty = true;
  updatePointer();
}

// ---- Motion ----

function stopIdleSpin() {
  cancelAnimationFrame(idleAnimationId);
  idleAnimationId = null;
}

function startIdleSpin() {
  if (idleAnimationId || spinAnimationId || !reveal.hidden) {
    return;
  }
  const tick = () => {
    rotation = normalizeAngle(rotation + idleRotationSpeed);
    zoom = Math.max(0, zoom - 0.02); // glide back out to the whole wheel
    drawWheel();
    idleAnimationId = requestAnimationFrame(tick);
  };
  idleAnimationId = requestAnimationFrame(tick);
}

function rotationForTarget(count, targetIndex) {
  const arc = (Math.PI * 2) / count;
  return getPointerWorldAngle() - (targetIndex * arc + arc / 2);
}

function playSpin(spin) {
  stopIdleSpin();
  cancelAnimationFrame(spinAnimationId);
  hideReveal();
  currentSpinId = spin.spinId;
  setNames(spin.names);

  const remainingMs = spin.durationMs - (spin.elapsedMs || 0);
  if (remainingMs <= 0) {
    // Joined after the spin finished: jump straight to the result.
    rotation = rotationForTarget(names.length, spin.targetIndex);
    zoom = 0;
    drawWheel();
    showReveal(spin);
    return;
  }

  // Whole turns only, so the wheel stops exactly on the control's chosen name.
  const rounds = 7 + Math.floor(Math.random() * 4);
  const target = rotationForTarget(names.length, spin.targetIndex);
  const startRotation = rotation;
  const extraRotation = rounds * Math.PI * 2 + normalizeAngle(target - normalizeAngle(rotation));
  const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
  const smoothstep = (from, to, t) => {
    const x = Math.min(Math.max((t - from) / (to - from), 0), 1);
    return x * x * (3 - 2 * x);
  };
  const startZoom = zoom;
  const zooming = zoomsForNames();
  const sliceAngle = (Math.PI * 2) / names.length;
  const sliceUnderPointer = () => Math.floor(normalizeAngle(getPointerWorldAngle() - rotation) / sliceAngle);
  let lastSlice = sliceUnderPointer();
  let startTime = null;

  const frame = (timestamp) => {
    if (startTime === null) {
      startTime = timestamp;
    }
    const progress = Math.min((timestamp - startTime) / remainingMs, 1);
    rotation = startRotation + extraRotation * easeOutQuint(progress);
    // Leave any earlier close-up quickly, then move in as the wheel slows down.
    const zoomIn = zooming ? smoothstep(0.42, 0.72, progress) : 0;
    zoom = Math.max(zoomIn, startZoom * Math.max(0, 1 - progress / 0.12));
    drawWheel();

    // Tick whenever a new slice reaches the pointer; ticks slow as the wheel does.
    const slice = sliceUnderPointer();
    if (slice !== lastSlice) {
      lastSlice = slice;
      if (soundOn()) {
        wheelSounds.tick(Math.pow(1 - progress, 2));
      }
    }

    if (progress < 1) {
      spinAnimationId = requestAnimationFrame(frame);
      return;
    }
    if (zooming) {
      holdOnLanding(spin);
      return;
    }
    spinAnimationId = null;
    finishSpin(spin);
  };
  spinAnimationId = requestAnimationFrame(frame);
}

function finishSpin(spin) {
  if (currentSpinId === spin.spinId) {
    showReveal(spin);
    if (soundOn()) {
      wheelSounds.fanfare();
    }
  }
}

// Keeps the close-up on the landed name for a moment (the flapper settles) before the reveal.
function holdOnLanding(spin) {
  const holdUntil = performance.now() + LANDED_HOLD_MS;
  const hold = (timestamp) => {
    drawWheel();
    if (timestamp < holdUntil && currentSpinId === spin.spinId) {
      spinAnimationId = requestAnimationFrame(hold);
      return;
    }
    spinAnimationId = null;
    finishSpin(spin);
  };
  spinAnimationId = requestAnimationFrame(hold);
}

function showReveal(spin) {
  revealHeader.textContent = spin.header || settings.popupHeaderText;
  revealName.textContent = spin.winner;
  revealName.classList.toggle("long", spin.winner.length > 14);
  revealName.classList.toggle("very-long", spin.winner.length > 28);
  revealPrize.textContent = spin.prize ? `wins ${spin.prize}` : "";
  reveal.hidden = false;
}

function hideReveal() {
  reveal.hidden = true;
}

// ---- Event state ----

function applySettings(next) {
  settings = normalizeSettings(next);
  faceDirty = true;
  const root = document.documentElement;
  root.dataset.theme = settings.appTheme;
  root.style.setProperty("--page", settings.wheelBackdropColor);
  updateSoundNote();
  document.body.style.backgroundImage = settings.pageBackgroundImage ? `url("${settings.pageBackgroundImage}")` : "none";
  updatePointer();

  if (settings.wheelBackgroundImage !== wheelImageSource) {
    wheelImageSource = settings.wheelBackgroundImage;
    wheelImage = null;
    faceDirty = true;
    if (wheelImageSource) {
      const image = new Image();
      image.onload = () => {
        if (wheelImageSource === image.src) {
          wheelImage = image;
          faceDirty = true;
          drawWheel();
        }
      };
      image.src = wheelImageSource;
    }
  }
}

function applyPrizeBanner(event) {
  const prizes = parsePrizes(event.prizesText);
  const awards = Array.isArray(event.awards) ? event.awards : [];
  const current = describeCurrentPrize(prizes, awards, event.currentPrizeIndex || 0);
  prizeBanner.hidden = !current;
  document.body.classList.toggle("has-prizes", Boolean(current));
  if (current) {
    prizeBannerName.textContent = current.name;
    prizeBannerDetail.textContent = current.detail;
  }
}

async function refreshEvent() {
  // Hold changes until the current spin and reveal are finished.
  if (spinAnimationId || !reveal.hidden) {
    refreshPending = true;
    return;
  }
  refreshPending = false;

  try {
    const response = await fetch(`/api/events/${encodeURIComponent(eventSlug)}`, { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const event = await response.json();
    document.title = `${event.name} · Display`;
    applySettings(event.settings);
    applyPrizeBanner(event);
    if (!spinAnimationId && reveal.hidden) {
      setNames(event.names || []);
      drawWheel();
      startIdleSpin();
    }
  } catch {
    // The live connection retries; the next update will refresh.
  }
}

function handleLive(state) {
  if (state.type === "spin") {
    if (state.spinId !== currentSpinId || reveal.hidden) {
      playSpin(state);
    }
    return;
  }

  // Dismissed: clear the result and catch up on anything that changed meanwhile.
  currentSpinId = "";
  hideReveal();
  if (!spinAnimationId) {
    startIdleSpin();
    if (refreshPending) {
      refreshEvent();
    }
  }
}

// ---- Sound ----

// The preview inside the control screen stays silent so the room doesn't hear it twice.
function soundOn() {
  return !isPreview && settings.soundEnabled;
}

function updateSoundNote() {
  soundNote.hidden = !soundOn() || wheelSounds.isUnlocked();
}

async function unlockSound() {
  if (!isPreview) {
    await wheelSounds.unlock();
    updateSoundNote();
  }
}

// ---- Screen behaviour ----

function showCursorBriefly() {
  document.body.classList.remove("hide-cursor");
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.add("hide-cursor"), 2500);
}

function enterFullscreen() {
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

const source = connectToEvent(eventSlug, isPreview ? "preview" : "display", {
  live: handleLive,
  updated: refreshEvent,
});
source.addEventListener("open", () => {
  clearTimeout(disconnectTimer);
  connectionNote.hidden = true;
  refreshEvent();
});
source.addEventListener("error", () => {
  clearTimeout(disconnectTimer);
  disconnectTimer = setTimeout(() => {
    connectionNote.hidden = isPreview;
  }, 3000);
});

if (!isPreview) {
  wheelSounds.loadWinnerSound("/winner.mp3");
  fullscreenHint.hidden = false;
  setTimeout(() => fullscreenHint.classList.add("fading"), 6000);
  setTimeout(() => {
    fullscreenHint.hidden = true;
  }, 6500);
  document.addEventListener("click", () => {
    enterFullscreen();
    unlockSound();
  });
  document.addEventListener("keydown", (event) => {
    unlockSound();
    if (event.key === "f" || event.key === "F") {
      enterFullscreen();
    }
  });
  document.addEventListener("mousemove", showCursorBriefly);
  showCursorBriefly();
}

// The wheel resizes when the prize banner comes and goes, not just with the window.
const sizeWatcher = new ResizeObserver(updatePointer);
sizeWatcher.observe(wheelStage);
sizeWatcher.observe(wheelArea);
document.fonts.ready.then(() => {
  faceDirty = true;
  drawWheel();
});
window.addEventListener("wheel3d-ready", useWheel3D);
useWheel3D();
updatePointer();
drawWheel();
refreshEvent();
