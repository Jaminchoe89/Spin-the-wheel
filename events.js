const createForm = document.getElementById("create-form");
const nameInput = document.getElementById("event-name-input");
const slugInput = document.getElementById("event-slug-input");
const sheetInput = document.getElementById("event-sheet-input");
const copyFromSelect = document.getElementById("copy-from-select");
const formError = document.getElementById("form-error");
const slugPrefix = document.getElementById("slug-prefix");
const eventList = document.getElementById("event-list");
const emptyState = document.getElementById("empty-state");

// Stops auto-filling the address once the user has typed their own.
let slugEdited = false;

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

function displayUrl(slug) {
  return `${window.location.origin}/${slug}/display`;
}

function describeEvent(event) {
  const parts = [event.sheetUrl ? "Live sheet" : `${event.nameCount} names`];
  if (event.awardCount > 0) {
    parts.push(`${event.awardCount} prizes drawn`);
  }
  parts.push(`Updated ${new Date(event.updatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`);
  return parts.join(" · ");
}

function createLink(label, href, className, icon) {
  const link = document.createElement("a");
  link.className = `button small ${className}`;
  link.href = href;
  if (icon) {
    const glyph = document.createElement("i");
    glyph.className = `ph ${icon}`;
    glyph.setAttribute("aria-hidden", "true");
    link.append(glyph);
  }
  link.append(label);
  return link;
}

function createButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button small ${className}`;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

// Destructive buttons ask for a second click instead of a browser dialog.
function confirmClick(button, confirmLabel, action) {
  if (button.dataset.confirming === "true") {
    action();
    return;
  }
  const label = button.textContent;
  button.dataset.confirming = "true";
  button.classList.add("confirming");
  button.textContent = confirmLabel;
  setTimeout(() => {
    button.dataset.confirming = "false";
    button.classList.remove("confirming");
    button.textContent = label;
  }, 3000);
}

function renderEvents(events) {
  eventList.replaceChildren();
  emptyState.hidden = events.length > 0;

  const selected = copyFromSelect.value;
  copyFromSelect.replaceChildren(new Option("Default look", ""));

  events.forEach((event) => {
    copyFromSelect.append(new Option(event.name, event.slug));

    const item = document.createElement("li");
    item.className = "event-row";

    const info = document.createElement("div");
    info.className = "event-row-info";
    const name = document.createElement("p");
    name.className = "title-3";
    name.textContent = event.name;
    const meta = document.createElement("p");
    meta.className = "caption-4 muted";
    meta.textContent = `/${event.slug} · ${describeEvent(event)}`;
    info.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "event-row-actions";

    const control = createLink("Open control", `/${event.slug}`, "primary", "ph-sliders-horizontal");
    const display = createLink("Open display", `/${event.slug}/display`, "secondary", "ph-monitor");
    display.target = "_blank";
    display.rel = "noopener";

    const copy = createButton("Copy display link", "quiet", async () => {
      try {
        await navigator.clipboard.writeText(displayUrl(event.slug));
        copy.textContent = "Link copied";
      } catch {
        copy.textContent = displayUrl(event.slug);
      }
      setTimeout(() => {
        copy.textContent = "Copy display link";
      }, 2000);
    });

    const remove = createButton("Delete", "quiet", () =>
      confirmClick(remove, "Click again to delete", () => deleteEvent(event))
    );

    actions.append(control, display, copy, remove);
    item.append(info, actions);
    eventList.append(item);
  });

  copyFromSelect.value = selected;
}

async function loadEvents() {
  try {
    const response = await fetch("/api/events", { cache: "no-store" });
    renderEvents(await response.json());
  } catch {
    emptyState.hidden = false;
    eventList.replaceChildren();
    emptyState.textContent = "Couldn't load events. Check your connection and refresh the page.";
  }
}

async function deleteEvent(event) {
  await fetch(`/api/events/${encodeURIComponent(event.slug)}`, { method: "DELETE" });
  loadEvents();
}

async function handleCreate(submitEvent) {
  submitEvent.preventDefault();
  formError.textContent = "";

  const name = nameInput.value.trim();
  if (!name) {
    formError.textContent = "Give the event a name.";
    nameInput.focus();
    return;
  }

  const response = await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      slug: slugInput.value.trim() || slugify(name),
      sheetUrl: sheetInput.value.trim(),
      copyFrom: copyFromSelect.value,
    }),
  });
  const result = await response.json();

  if (!response.ok) {
    formError.textContent = result.error || "Couldn't create the event.";
    return;
  }

  window.location.href = `/${result.slug}`;
}

nameInput.addEventListener("input", () => {
  if (!slugEdited) {
    slugInput.value = slugify(nameInput.value);
  }
});
slugInput.addEventListener("input", () => {
  slugEdited = slugInput.value.trim() !== "";
});
slugInput.addEventListener("blur", () => {
  slugInput.value = slugify(slugInput.value);
});
createForm.addEventListener("submit", handleCreate);

slugPrefix.textContent = `${window.location.host}/`;
loadEvents();
