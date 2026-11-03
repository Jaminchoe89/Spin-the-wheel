// Audience screen. It never decides anything: it shows the event's look and
// plays whatever spin the control screen sends.

const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const wheelStage = document.getElementById("wheel-stage");
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
}

function fitFontSize(text, baseSize, minSize, maxWidth) {
  for (let size = baseSize; size > minSize; size -= 1) {
    ctx.font = `700 ${size}px Manrope`;
    if (ctx.measureText(text).width <= maxWidth) {
      return size;
    }
  }
  return minSize;
}

function drawWheel(wheelNames = names) {
  const size = canvas.width;
  const radius = size / 2;
  ctx.clearRect(0, 0, size, size);

  if (wheelNames.length === 0) {
    ctx.save();
    ctx.translate(radius, radius);
    ctx.beginPath();
    ctx.arc(0, 0, radius - 24, 0, Math.PI * 2);
    ctx.fillStyle = settings.appTheme === "dark" ? "#272727" : "rgba(255, 252, 247, 0.9)";
    ctx.fill();
    ctx.fillStyle = settings.appTheme === "dark" ? "#9b9b9b" : "#6e6157";
    ctx.font = "600 56px Manrope";
    ctx.textAlign = "center";
    ctx.fillText("Waiting for names", 0, 20);
    ctx.restore();
    return;
  }

  const arc = (Math.PI * 2) / wheelNames.length;
  const rimRadius = radius - 24;
  const textRadius = radius - 80;

  ctx.save();
  ctx.translate(radius, radius);
  ctx.rotate(rotation);

  if (wheelImage) {
    const diameter = rimRadius * 2;
    const scale = Math.max(diameter / wheelImage.width, diameter / wheelImage.height);
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, rimRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      wheelImage,
      (-wheelImage.width * scale) / 2,
      (-wheelImage.height * scale) / 2,
      wheelImage.width * scale,
      wheelImage.height * scale
    );
    ctx.restore();
  }

  wheelNames.forEach((name, index) => {
    const startAngle = index * arc;
    const maxTextWidth = Math.min(radius * 0.58, Math.max(100, 2 * Math.sin(arc / 2) * (textRadius - 40)));

    if (!wheelImage) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, rimRadius, startAngle, startAngle + arc);
      ctx.closePath();
      ctx.fillStyle = settings.palette[index % settings.palette.length];
      ctx.fill();
    }

    ctx.save();
    ctx.rotate(startAngle + arc / 2);
    ctx.translate(textRadius, 0);
    ctx.textAlign = "right";
    ctx.fillStyle = settings.textColor;
    if (wheelImage) {
      ctx.shadowColor = "rgba(31, 26, 22, 0.5)";
      ctx.shadowBlur = 12;
    }
    const fontSize = fitFontSize(name, 50, 14, maxTextWidth);
    ctx.font = `700 ${fontSize}px Manrope`;
    ctx.fillText(name, 0, fontSize * 0.34);
    ctx.restore();
  });

  ctx.restore();
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
  names = spin.names;

  const remainingMs = spin.durationMs - (spin.elapsedMs || 0);
  if (remainingMs <= 0) {
    // Joined after the spin finished: jump straight to the result.
    rotation = rotationForTarget(names.length, spin.targetIndex);
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
    spinAnimationId = null;
    if (currentSpinId === spin.spinId) {
      showReveal(spin);
      if (soundOn()) {
        wheelSounds.fanfare();
      }
    }
  };
  spinAnimationId = requestAnimationFrame(frame);
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
  const root = document.documentElement;
  root.dataset.theme = settings.appTheme;
  root.style.setProperty("--page", settings.wheelBackdropColor);
  updateSoundNote();
  document.body.style.backgroundImage = settings.pageBackgroundImage ? `url("${settings.pageBackgroundImage}")` : "none";
  updatePointer();

  if (settings.wheelBackgroundImage !== wheelImageSource) {
    wheelImageSource = settings.wheelBackgroundImage;
    wheelImage = null;
    if (wheelImageSource) {
      const image = new Image();
      image.onload = () => {
        if (wheelImageSource === image.src) {
          wheelImage = image;
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
      names = event.names || [];
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
new ResizeObserver(updatePointer).observe(wheelStage);
document.fonts.ready.then(() => drawWheel());
updatePointer();
drawWheel();
refreshEvent();
