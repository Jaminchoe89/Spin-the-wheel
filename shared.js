// Shared by the control screen and the display screen.

const wheelThemes = [
  { name: "Harbor", palette: ["#0e9594", "#127475", "#8b5e34", "#b84f24", "#8f1d1d", "#235789"] },
  { name: "Cinema", palette: ["#8f0f1c", "#6b2d5c", "#3f6791", "#003049", "#9a5c17", "#7d1f2a"] },
  { name: "Clay", palette: ["#5b3a29", "#7f5539", "#9c6644", "#6f4e37", "#8a5a44", "#4f3226"] },
  { name: "Corporate", palette: ["#08111f", "#0d1b2a", "#123456", "#1e3a5f", "#1e4f86", "#6e8fb5"] },
  { name: "Neon night", palette: ["#2b2d42", "#8d99ae", "#edf2f4", "#ef233c", "#d90429", "#f4a261"] },
  { name: "Canyon", palette: ["#283618", "#606c38", "#9c6644", "#6b705c", "#8d5524", "#3d5a80"] },
];

const defaultPageBackgrounds = {
  dark: "#181818",
  light: "#f7efe4",
};

const defaultSettings = {
  appTheme: "light",
  spinDurationSeconds: 7,
  popupHeaderText: "Winner",
  textColor: "#fff9f0",
  arrowColor: "#8f2b18",
  pointerClockHour: 12,
  wheelBackdropColor: defaultPageBackgrounds.light,
  wheelBackdropColorCustom: false,
  palette: [...wheelThemes[0].palette],
  wheelBackgroundImage: "",
  pageBackgroundImage: "",
};

// Fills gaps in saved settings so older events keep working.
function normalizeSettings(saved) {
  const settings = { ...defaultSettings, ...(saved || {}) };
  settings.appTheme = settings.appTheme === "dark" ? "dark" : "light";
  settings.spinDurationSeconds = Number(settings.spinDurationSeconds) || defaultSettings.spinDurationSeconds;
  settings.pointerClockHour = Number(settings.pointerClockHour) || 12;
  settings.popupHeaderText = String(settings.popupHeaderText || "").trim() || defaultSettings.popupHeaderText;
  if (!Array.isArray(settings.palette) || settings.palette.length === 0) {
    const theme = wheelThemes[settings.selectedThemeIndex];
    settings.palette = theme ? [...theme.palette] : [...defaultSettings.palette];
  }
  if (!settings.wheelBackdropColorCustom) {
    settings.wheelBackdropColor = defaultPageBackgrounds[settings.appTheme];
  }
  return settings;
}

function palettesMatch(first, second) {
  return first.length === second.length && first.every((color, index) => color === second[index]);
}

function parsePrizes(text) {
  return String(text || "")
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

function countAwards(awards, prizeName) {
  return awards.filter((award) => award.prize === prizeName).length;
}

// Text for the "Now spinning for" banner, or null when there are no prizes.
function describeCurrentPrize(prizes, awards, currentIndex) {
  if (prizes.length === 0) {
    return null;
  }
  const prize = prizes[currentIndex];
  if (!prize) {
    return { name: "All prizes drawn", detail: "" };
  }
  const drawn = countAwards(awards, prize.name);
  return {
    name: prize.name,
    detail: prize.quantity > 1 ? `Draw ${Math.min(drawn + 1, prize.quantity)} of ${prize.quantity}` : "",
  };
}

// Opens a live connection to the event; reconnects on its own if it drops.
function connectToEvent(slug, role, handlers) {
  const source = new EventSource(`/api/events/${encodeURIComponent(slug)}/stream?role=${role}`);
  Object.entries(handlers).forEach(([type, handler]) => {
    source.addEventListener(type, (message) => handler(JSON.parse(message.data)));
  });
  return source;
}
