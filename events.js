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

function eventUrl(slug) {
  return `${window.location.origin}/${slug}`;
}

function describeEvent(event) {
  const parts = [`/${event.slug}`];
  parts.push(event.sheetUrl ? "Synced to sheet" : `${event.nameCount} names`);
  if (event.removedCount > 0) {
    parts.push(`${event.removedCount} winners removed`);
  }
  if (event.awardCount > 0) {
    parts.push(`${event.awardCount} prizes drawn`);
  }
  parts.push(`updated ${new Date(event.updatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`);
  return parts.join(" · ");
}

function createButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `ghost-button small-button ${className}`.trim();
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderEvents(events) {
  eventList.replaceChildren();
  emptyState.hidden = events.length > 0;

  const selected = copyFromSelect.value;
  copyFromSelect.replaceChildren(new Option("Default look", ""));

  events.forEach((event) => {
    copyFromSelect.append(new Option(event.name, event.slug));

    const item = document.createElement("li");
    item.className = "event-item";

    const info = document.createElement("div");
    info.className = "event-info";
    const name = document.createElement("p");
    name.className = "event-name";
    name.textContent = event.name;
    const meta = document.createElement("p");
    meta.className = "event-meta";
    meta.textContent = describeEvent(event);
    info.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "event-actions";

    const open = document.createElement("a");
    open.className = "primary-button small-button events-link";
    open.href = `/${event.slug}`;
    open.textContent = "Open wheel";

    const copy = createButton("Copy link", "", async () => {
      try {
        await navigator.clipboard.writeText(eventUrl(event.slug));
        copy.textContent = "Copied";
      } catch {
        copy.textContent = eventUrl(event.slug);
      }
      setTimeout(() => {
        copy.textContent = "Copy link";
      }, 1500);
    });

    const remove = createButton("Delete", "danger-button", () => deleteEvent(event));

    actions.append(open, copy, remove);
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
    emptyState.textContent = "Couldn't load events. Refresh to try again.";
  }
}

async function deleteEvent(event) {
  if (!window.confirm(`Delete "${event.name}"? Its wheel link will stop working. The shared sheet is not affected.`)) {
    return;
  }
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
