const STORAGE_KEY = "pricepulse-demo-state";

const SAMPLE_DATA = {
  items: [
    {
      id: "itm-1",
      name: "Camper Oruga Sandals",
      store: "Camper EU",
      url: "https://www.camper.com/en_WA/women/sandals/product.oruga",
      currentPrice: 128,
      targetPrice: 110,
      lastChecked: "2025-02-23T07:45:00Z",
      status: "Tracking",
      addedBy: "Mina",
      frequency: "Every 12 hours",
      lastNotification: "2025-02-19T20:15:00Z"
    },
    {
      id: "itm-2",
      name: "Dyson V15 Detect",
      store: "Amazon UK",
      url: "https://www.amazon.co.uk/dp/B08H93ZRK9",
      currentPrice: 529,
      targetPrice: 499,
      lastChecked: "2025-02-23T09:05:00Z",
      status: "Watching",
      addedBy: "Oğulcan",
      frequency: "Daily",
      lastNotification: null
    },
    {
      id: "itm-3",
      name: "LEGO NASA Artemis Rocket",
      store: "LEGO Store",
      url: "https://www.lego.com/product/artemis-rocket",
      currentPrice: 119,
      targetPrice: 99,
      lastChecked: "2025-02-22T21:40:00Z",
      status: "Target hit",
      addedBy: "Ayşe",
      frequency: "Every 6 hours",
      lastNotification: "2025-02-22T21:45:00Z"
    }
  ],
  notifications: [
    {
      id: "ntf-1",
      itemId: "itm-3",
      itemName: "LEGO NASA Artemis Rocket",
      message: "Price dropped to £99.00 (target £99.00).",
      channel: "Email",
      sentAt: "2025-02-22T21:45:00Z"
    },
    {
      id: "ntf-2",
      itemId: "itm-1",
      itemName: "Camper Oruga Sandals",
      message: "Quick heads-up! Price dipped to £112.00.",
      channel: "Push",
      sentAt: "2025-02-19T20:15:00Z"
    }
  ],
  preferences: {
    fullName: "Oğulcan Aydogan",
    email: "ogulcan@example.com",
    timezone: "Europe/Istanbul",
    currency: "GBP",
    theme: "Aurora",
    digestTime: "08:00",
    dailyDigest: true,
    smsAlerts: false,
    familyTags: true
  }
};

function getState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SAMPLE_DATA));
    return structuredClone(SAMPLE_DATA);
  }

  try {
    const parsed = JSON.parse(stored);
    return {
      items: parsed.items || [],
      notifications: parsed.notifications || [],
      preferences: parsed.preferences || structuredClone(SAMPLE_DATA.preferences)
    };
  } catch (error) {
    console.error("Failed to parse saved state", error);
    localStorage.removeItem(STORAGE_KEY);
    return structuredClone(SAMPLE_DATA);
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function resetDemoData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(SAMPLE_DATA));
  showToast("Demo data reset");
  window.location.reload();
}

function formatCurrency(value, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency
  }).format(value);
}

function formatRelative(dateString) {
  if (!dateString) return "—";
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const date = new Date(dateString);
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);

  const thresholds = [
    { unit: "day", value: 60 * 24 },
    { unit: "hour", value: 60 },
    { unit: "minute", value: 1 }
  ];

  for (const { unit, value } of thresholds) {
    if (Math.abs(diffMinutes) >= value || unit === "minute") {
      return formatter.format(Math.round(diffMinutes / value), unit);
    }
  }

  return "just now";
}

function formatAbsolute(dateString) {
  if (!dateString) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(dateString));
}

function showToast(message) {
  const toast = document.querySelector(".toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2600);
}

function renderDashboard(state) {
  const tableBody = document.querySelector("#watchlist-body");
  const emptyState = document.querySelector("#watchlist-empty");
  const stats = {
    total: document.querySelector("#stat-total"),
    tracking: document.querySelector("#stat-tracking"),
    targetHit: document.querySelector("#stat-target-hit")
  };

  if (!tableBody || !stats.total) return;

  if (!state.items.length) {
    tableBody.innerHTML = "";
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
    tableBody.innerHTML = state.items
      .map(
        (item) => `
        <tr>
          <td>
            <div style="display:flex; flex-direction:column; gap:4px;">
              <strong>${item.name}</strong>
              <a href="${item.url}" target="_blank" rel="noopener">${item.store}</a>
            </div>
          </td>
          <td>${formatCurrency(item.currentPrice)}</td>
          <td>${formatCurrency(item.targetPrice)}</td>
          <td>
            <span class="badge ${item.status === "Target hit" ? "success" : item.status === "Tracking" ? "neutral" : "warning"}">
              ${item.status}
            </span>
          </td>
          <td>${formatAbsolute(item.lastChecked)}</td>
          <td>${item.addedBy}</td>
          <td>${item.frequency}</td>
        </tr>
      `
      )
      .join("");
  }

  stats.total.textContent = state.items.length;
  stats.tracking.textContent = state.items.filter((item) => item.status === "Tracking" || item.status === "Watching").length;
  stats.targetHit.textContent = state.items.filter((item) => item.status === "Target hit").length;

  const upcomingList = document.querySelector("#upcoming-checks");
  if (upcomingList) {
    upcomingList.innerHTML = state.items
      .slice()
      .sort((a, b) => new Date(a.lastChecked) - new Date(b.lastChecked))
      .map(
        (item) => `
        <div class="timeline-item">
          <strong>${item.name}</strong>
          <span>Last checked ${formatRelative(item.lastChecked)}</span>
          <span>Frequency • ${item.frequency}</span>
        </div>
      `
      )
      .join("");
  }
}

function renderNotifications(state) {
  const container = document.querySelector("#notification-feed");
  const emptyState = document.querySelector("#notifications-empty");
  if (!container) return;

  if (!state.notifications.length) {
    container.innerHTML = "";
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  container.innerHTML = state.notifications
    .slice()
    .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
    .map(
      (notification) => `
        <div class="timeline-item">
          <strong>${notification.itemName}</strong>
          <span>${notification.message}</span>
          <span>Sent ${formatAbsolute(notification.sentAt)} • ${notification.channel}</span>
        </div>
      `
    )
    .join("");
}

function renderProfile(state) {
  const form = document.querySelector("#profile-form");
  if (!form) return;
  const prefs = state.preferences;
  form.fullName.value = prefs.fullName;
  form.email.value = prefs.email;
  form.timezone.value = prefs.timezone;
  form.currency.value = prefs.currency;
  form.theme.value = prefs.theme;
  form.digestTime.value = prefs.digestTime;
  form.dailyDigest.checked = prefs.dailyDigest;
  form.smsAlerts.checked = prefs.smsAlerts;
  form.familyTags.checked = prefs.familyTags;
}

function handleAddItem(state) {
  const form = document.querySelector("#add-item-form");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const newItem = {
      id: `itm-${Date.now()}`,
      name: formData.get("name"),
      store: formData.get("store"),
      url: formData.get("url"),
      currentPrice: Number(formData.get("currentPrice")),
      targetPrice: Number(formData.get("targetPrice")),
      lastChecked: new Date().toISOString(),
      status: Number(formData.get("currentPrice")) <= Number(formData.get("targetPrice")) ? "Target hit" : "Tracking",
      addedBy: formData.get("addedBy"),
      frequency: formData.get("frequency"),
      lastNotification: null
    };

    state.items.unshift(newItem);
    saveState(state);
    showToast("Item added to watchlist");
    form.reset();
  });

  const quickFill = document.querySelector("#quick-fill");
  if (quickFill) {
    quickFill.addEventListener("click", () => {
      form.name.value = "IKEA Söderhamn Sofa";
      form.store.value = "IKEA";
      form.url.value = "https://www.ikea.com/soderhamn";
      form.currentPrice.value = "899";
      form.targetPrice.value = "799";
      form.addedBy.value = "Guest";
      form.frequency.value = "Every 8 hours";
      showToast("Sample data filled");
    });
  }
}

function handleProfile(state) {
  const form = document.querySelector("#profile-form");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    state.preferences = {
      fullName: form.fullName.value,
      email: form.email.value,
      timezone: form.timezone.value,
      currency: form.currency.value,
      theme: form.theme.value,
      digestTime: form.digestTime.value,
      dailyDigest: form.dailyDigest.checked,
      smsAlerts: form.smsAlerts.checked,
      familyTags: form.familyTags.checked
    };
    saveState(state);
    showToast("Preferences saved");
  });
}

function renderAddItemHints(state) {
  const list = document.querySelector("#recent-items");
  if (!list) return;
  list.innerHTML = state.items
    .slice(0, 3)
    .map(
      (item) => `
      <div class="timeline-item">
        <strong>${item.name}</strong>
        <span>Last seen ${formatRelative(item.lastChecked)}</span>
        <span>Current • ${formatCurrency(item.currentPrice)}</span>
      </div>
    `
    )
    .join("");
}

function wireResetButtons() {
  document.querySelectorAll("[data-reset-demo]").forEach((button) => {
    button.addEventListener("click", resetDemoData);
  });
}

function setActiveNav() {
  const current = document.body.dataset.page;
  const links = document.querySelectorAll("nav a");
  links.forEach((link) => {
    if (link.dataset.page === current) {
      link.classList.add("active");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const state = getState();
  setActiveNav();
  wireResetButtons();

  switch (document.body.dataset.page) {
    case "dashboard":
      renderDashboard(state);
      break;
    case "add-item":
      renderAddItemHints(state);
      handleAddItem(state);
      break;
    case "notifications":
      renderNotifications(state);
      break;
    case "profile":
      renderProfile(state);
      handleProfile(state);
      break;
    default:
      break;
  }
});
