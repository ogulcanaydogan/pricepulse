import { USE_DEMO_MODE as CONFIG_USE_DEMO_MODE } from "./config.js";
import apiClient from "./api.js";
import authService from "./auth.js";

// Demo mode flag is now controlled via config.js
const USE_DEMO_MODE = CONFIG_USE_DEMO_MODE;
const STORAGE_KEY = "pricepulse-demo-state";
const GUEST_ID_KEY = "pricepulse_guest_id";

// SAMPLE_DATA: define preferences (contacts) first so items can reference them safely
const SAMPLE_DATA = {
  preferences: {
    fullName: "Ogulcan Aydogan",
    email: "ogulcan@example.com",
    timezone: "Europe/Istanbul",
    currency: "TRY",
    theme: "Aurora",
    digestTime: "08:00",
    dailyDigest: true,
    smsAlerts: false,
    familyTags: true,
    contacts: [
      { name: "Ogulcan", email: "ogulcan@example.com", phone: "+905551112233" },
      { name: "Muge", email: "muge@example.com", phone: "+905551112244" },
      { name: "Basak", email: "basak@example.com", phone: "+905551112255" },
      { name: "Guest", email: "guest@example.com", phone: "" }
    ]
  },
  items: [
    {
      id: "itm-1",
      name: "Camper Oruga Sandals",
      store: "Camper EU",
      url: "https://www.camper.com/en_WA/women/sandals/product.oruga",
      currentPrice: 128,
      targetPrice: 110,
      currency: "EUR",
      lastChecked: "2026-01-10T07:45:00Z",
      status: "Tracking",
      addedBy: "Ogulcan",
      notificationEmail: "ogulcan@example.com",
      frequency: "Every 12 hours",
      lastNotification: "2026-01-06T20:15:00Z"
    },
    {
      id: "itm-2",
      name: "Dyson V15 Detect",
      store: "Amazon UK",
      url: "https://www.amazon.co.uk/dp/B08H93ZRK9",
      currentPrice: 529,
      targetPrice: 499,
      currency: "GBP",
      lastChecked: "2026-01-10T09:05:00Z",
      status: "Watching",
      addedBy: "Muge",
      notificationEmail: "muge@example.com",
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
      currency: "GBP",
      lastChecked: "2026-01-09T21:40:00Z",
      status: "Target hit",
      addedBy: "Basak",
      notificationEmail: "basak@example.com",
      frequency: "Every 6 hours",
      lastNotification: "2026-01-09T21:45:00Z"
    }
  ],
  notifications: [
    {
      id: "ntf-1",
      itemId: "itm-3",
      itemName: "LEGO NASA Artemis Rocket",
      message: "Price dropped to £99.00 (target £99.00).",
      channel: "Email",
      sentAt: "2026-01-09T21:45:00Z"
    },
    {
      id: "ntf-2",
      itemId: "itm-1",
      itemName: "Camper Oruga Sandals",
      message: "Quick heads-up! Price dipped to £112.00.",
      channel: "Push",
      sentAt: "2026-01-06T20:15:00Z"
    }
  ]
};

function resolveItemId(item) {
  return item?.item_id || item?.id || "";
}

function minutesToFrequencyLabel(minutes) {
  if (!minutes) return "Every 12 hours";
  const map = {
    360: "Every 6 hours",
    480: "Every 8 hours",
    720: "Every 12 hours",
    1440: "Daily",
    2880: "Every 2 days"
  };
  return map[Number(minutes)] || `${minutes} min`;
}

function normalizeApiItem(item) {
  if (!item) return null;
  let derivedStore = item.store;
  if (!derivedStore && item.url) {
    try {
      derivedStore = new URL(item.url).hostname.replace("www.", "");
    } catch {
      derivedStore = "—";
    }
  }

  return {
    id: item.item_id || item.id,
    name: item.product_name || item.name || "—",
    store: derivedStore || "—",
    url: item.url,
    currentPrice: toNumber(item.last_price ?? item.current_price),
    targetPrice: toNumber(item.target_price ?? item.targetPrice),
    lastChecked: item.last_checked || item.lastChecked,
    status: toTitleCase((item.status || "Tracking").replace("_", " ")),
    addedBy: item.added_by || item.addedBy || "—",
    currency: normalizeCurrencyCode(item.currency_code || item.currency),
    frequency: item.frequency || minutesToFrequencyLabel(item.frequency_minutes),
    lastNotification: item.last_notification || item.lastNotification,
    notificationEmail: item.notification_email || null,
    notificationPhone: item.notification_phone || null
  };
}

function normalizeApiNotification(notification) {
  if (!notification) return null;
  return {
    id: notification.id || notification.notification_id,
    itemId: notification.item_id || notification.itemId,
    itemName: notification.item_name || notification.itemName,
    message: notification.message,
    channel: notification.channel || "Email",
    sentAt: notification.sent_at || notification.sentAt
  };
}

async function loadState() {
  if (USE_DEMO_MODE) {
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

  try {
    const [itemsResponse, notificationsResponse] = await Promise.all([
      apiClient.getItems(),
      apiClient.getNotifications().catch(() => [])
    ]);

    const normalizeItems = (payload) => {
      const collection = Array.isArray(payload) ? payload : payload?.items || [];
      return collection.map(normalizeApiItem).filter(Boolean);
    };
    const normalizeNotifications = (payload) => {
      const collection = Array.isArray(payload) ? payload : payload?.notifications || [];
      return collection.map(normalizeApiNotification).filter(Boolean);
    };

    return {
      items: normalizeItems(itemsResponse),
      notifications: normalizeNotifications(notificationsResponse),
      preferences: structuredClone(SAMPLE_DATA.preferences)
    };
  } catch (error) {
    console.error("Failed to load live data", error);
    showToast("Unable to load your watchlist right now");
    return {
      items: [],
      notifications: [],
      preferences: structuredClone(SAMPLE_DATA.preferences)
    };
  }
}

function saveState(state) {
  if (USE_DEMO_MODE) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  // In live mode, state is saved via API calls
}

function resetDemoData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(SAMPLE_DATA));
  showToast("Demo data reset");
  window.location.reload();
}

function getContacts(state) {
  return state.preferences?.contacts || SAMPLE_DATA.preferences.contacts;
}

function getContactByName(state, name) {
  const contacts = getContacts(state);
  return contacts.find((contact) => contact.name === name) || contacts.find((contact) => contact.name === "Guest");
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeCurrencyCode(code) {
  if (!code || typeof code !== "string") return null;
  return code.trim().toUpperCase();
}

function formatCurrency(value, currency = "GBP") {
  const numeric = toNumber(value);
  if (numeric === null) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency
  }).format(numeric);
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

function showLoading() {
  const overlay = document.querySelector("#loading-overlay");
  if (overlay) overlay.classList.add("visible");
}

function hideLoading() {
  const overlay = document.querySelector("#loading-overlay");
  if (overlay) overlay.classList.remove("visible");
}

function renderDashboard(state) {
  const tableBody = document.querySelector("#watchlist-body");
  const emptyState = document.querySelector("#watchlist-empty");
  const stats = {
    total: document.querySelector("#stat-total"),
    tracking: document.querySelector("#stat-tracking"),
    targetHit: document.querySelector("#stat-target-hit")
  };
  const preferenceCurrency = state.preferences?.currency || "GBP";

  if (!tableBody || !stats.total) return;

  if (!state.items.length) {
    tableBody.innerHTML = "";
    if (emptyState) emptyState.hidden = false;
  } else {
    if (emptyState) emptyState.hidden = true;
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
          <td>${formatCurrency(item.currentPrice, item.currency || preferenceCurrency)}</td>
          <td>${formatCurrency(item.targetPrice, item.currency || preferenceCurrency)}</td>
          <td>
            <span class="badge ${item.status === "Target hit" ? "success" : item.status === "Tracking" ? "neutral" : "warning"}">
              ${item.status}
            </span>
          </td>
          <td>${formatAbsolute(item.lastChecked)}</td>
          <td>${item.addedBy || "—"}</td>
          <td>${item.frequency}</td>
          <td>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-ghost btn-small" type="button" data-edit-item="${resolveItemId(item)}">
                Edit
              </button>
              <button class="btn btn-ghost btn-small" type="button" data-delete-item="${resolveItemId(item)}">
                Remove
              </button>
            </div>
          </td>
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
    if (emptyState) emptyState.hidden = false;
    return;
  }

  if (emptyState) emptyState.hidden = true;
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

  const container = document.querySelector("#contacts-container");
  const addButton = document.querySelector("#add-contact");
  if (container && addButton) {
    const renderContacts = () => {
      container.innerHTML = "";
      (prefs.contacts || []).forEach((contact, index) => {
        const block = document.createElement("div");
        block.className = "form-grid contact-row";
        block.dataset.index = index;
        block.innerHTML = `
          <div>
            <label>Name</label>
            <input type="text" name="contact-name" value="${contact.name || ""}" required />
          </div>
          <div>
            <label>Email</label>
            <input type="email" name="contact-email" value="${contact.email || ""}" required />
          </div>
          <div>
            <label>Phone</label>
            <input type="tel" name="contact-phone" value="${contact.phone || ""}" />
          </div>
          <div style="display:flex; align-items:flex-end;">
            <button type="button" class="btn btn-ghost btn-small" data-remove-contact="${index}">Remove</button>
          </div>
        `;
        container.appendChild(block);
      });
    };

    renderContacts();

    addButton.addEventListener("click", () => {
      prefs.contacts = [
        ...getContacts({ preferences: prefs }),
        { name: "", email: "", phone: "" }
      ];
      renderContacts();
    });

    container.addEventListener("click", (event) => {
      const removeButton = event.target.closest("button[data-remove-contact]");
      if (!removeButton) return;
      const index = Number(removeButton.dataset.removeContact);
      prefs.contacts.splice(index, 1);
      renderContacts();
    });
  }

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
      familyTags: form.familyTags.checked,
      contacts: Array.from(document.querySelectorAll("#contacts-container .contact-row")).map((row) => ({
        name: row.querySelector('input[name="contact-name"]')?.value?.trim() || "",
        email: row.querySelector('input[name="contact-email"]')?.value?.trim() || "",
        phone: row.querySelector('input[name="contact-phone"]')?.value?.trim() || ""
      }))
    };
    saveState(state);
    showToast("Preferences saved");
  });
}

function handleAddItem(state) {
  const form = document.querySelector("#add-item-form");
  if (!form) return;
  const currencySelect = form.querySelector("#currencyCode");
  if (currencySelect && state.preferences?.currency) {
    currencySelect.value = state.preferences.currency;
  }

  // Populate addedBy dropdown from contacts
  const addedBySelect = form.querySelector("#addedBy");
  if (addedBySelect) {
    const contacts = getContacts(state);
    addedBySelect.innerHTML = contacts
      .map((contact) => `<option value="${contact.name}">${contact.name}</option>`)
      .join("");
  }

  const frequencyToMinutes = (label) => {
    const map = {
      "Every 6 hours": 360,
      "Every 8 hours": 480,
      "Every 12 hours": 720,
      "Daily": 1440,
      "Every 2 days": 2880,
    };
    return map[label] || 720;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const editingId = form.dataset.editingId || null;
    const contact = getContactByName(state, formData.get("addedBy"));
    const newItem = {
      id: editingId || `itm-${Date.now()}`,
      name: formData.get("name"),
      store: formData.get("store"),
      url: formData.get("url"),
      currentPrice: Number(formData.get("currentPrice")),
      targetPrice: Number(formData.get("targetPrice")),
      currency: formData.get("currencyCode") || state.preferences?.currency || "TRY",
      lastChecked: new Date().toISOString(),
      status: Number(formData.get("currentPrice")) <= Number(formData.get("targetPrice")) ? "Target hit" : "Tracking",
      addedBy: formData.get("addedBy"),
      notificationEmail: contact?.email || "",
      frequency: formData.get("frequency"),
      lastNotification: null
    };

    if (USE_DEMO_MODE) {
      if (editingId) {
        state.items = state.items.map((item) => (resolveItemId(item) === editingId ? { ...newItem } : item));
        showToast("Item updated");
      } else {
        state.items.unshift(newItem);
        showToast("Item added to watchlist");
      }
      saveState(state);
      // Reset form but preserve currency preference
      const savedCurrency = currencySelect?.value;
      form.reset();
      if (currencySelect) {
        currencySelect.value = state.preferences?.currency || savedCurrency || "TRY";
      }
    } else {
      try {
        const payload = {
          url: newItem.url,
          target_price: newItem.targetPrice,
          product_name: newItem.name,
          store: newItem.store,
          last_price: newItem.currentPrice,
          status: newItem.status === "Target hit" ? "TARGET_HIT" : "ACTIVE",
          last_checked: newItem.lastChecked,
          frequency_minutes: frequencyToMinutes(newItem.frequency),
          notification_channel: "email",
          added_by: newItem.addedBy,
          notification_email: newItem.notificationEmail,
          currency_code: newItem.currency,
          notification_phone: contact?.phone || ""
        };
        if (editingId) {
          await apiClient.updateItem(editingId, payload);
          showToast("Item updated");
        } else {
          await apiClient.createItem(payload);
          showToast("Item added to watchlist");
        }
        // Reset form but preserve currency preference
        const savedCurrency = currencySelect?.value;
        form.reset();
        if (currencySelect && savedCurrency) {
          currencySelect.value = state.preferences?.currency || savedCurrency;
        }
        // Refresh the page to show new item
        setTimeout(() => window.location.href = 'index.html', 800);
      } catch (error) {
        showToast("Failed to add item: " + error.message);
      }
    }
  });

  attachAutofillHandler(form, state);
  setupEditMode(form, state);

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

function formatStoreName(store) {
  if (!store) return "";
  return store
    .split(".")
    .filter((segment) => segment && segment.toLowerCase() !== "www")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function toTitleCase(value) {
  if (!value) return "";
  return value
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function guessDetailsFromUrl(rawUrl) {
  try {
    const normalized = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    const parsed = new URL(normalized);
    const store = formatStoreName(parsed.hostname);
    const slug = parsed.pathname.split("/").filter(Boolean).pop() || "";
    const cleaned = slug
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();

    return {
      product_name: toTitleCase(cleaned) || store,
      store,
    };
  } catch {
    return null;
  }
}

function attachAutofillHandler(form, state) {
  const urlInput = form.querySelector("#url");
  const nameInput = form.querySelector("#name");
  const storeInput = form.querySelector("#store");
  const priceInput = form.querySelector("#currentPrice");
  const currencySelect = form.querySelector("#currencyCode");
  const detectButton = form.querySelector("#detect-details");
  const hint = document.querySelector("#detect-hint");
  if (!urlInput || !detectButton || !nameInput || !storeInput) return;

  let lastProcessedUrl = "";
  const originalButtonText = detectButton.textContent;
  const defaultCurrency = state.preferences?.currency || "TRY";
  if (currencySelect && !form.dataset.editingId) {
    currencySelect.value = defaultCurrency;
  }

  const setLoading = (loading) => {
    if (loading) {
      detectButton.disabled = true;
      detectButton.textContent = "Detecting…";
      if (hint) hint.textContent = "Looking up product details…";
    } else {
      detectButton.disabled = false;
      detectButton.textContent = originalButtonText;
    }
  };

  const applyDetails = (details, source = "live") => {
    if (!details) return;
    if (details.product_name) {
      nameInput.value = details.product_name;
    }
    if (details.store) {
      storeInput.value = details.store;
    }
    if (priceInput && details.current_price !== undefined && details.current_price !== null) {
      const numeric = Number(details.current_price);
      if (!Number.isNaN(numeric) && numeric > 0) {
        // Round to 2 decimal places for display
        priceInput.value = Math.round(numeric * 100) / 100;
      }
    }
    if (currencySelect && details.currency_code) {
      // Normalize currency code and check if it's a valid option
      const normalizedCode = details.currency_code.toUpperCase().trim();
      const validCurrencies = Array.from(currencySelect.options).map(opt => opt.value);
      if (validCurrencies.includes(normalizedCode)) {
        currencySelect.value = normalizedCode;
      } else {
        console.warn(`Detected currency ${normalizedCode} not in dropdown, keeping default`);
      }
    }
    if (hint) {
      hint.textContent =
        source === "guess"
          ? "Used the link to make our best guess."
          : "Details detected automatically.";
    }
  };

  const detect = async (auto = false) => {
    const url = urlInput.value.trim();
    if (!url) {
      if (!auto) showToast("Enter a product URL first");
      return;
    }
    if (auto && url === lastProcessedUrl) {
      return;
    }
    lastProcessedUrl = url;
    setLoading(true);

    try {
      if (USE_DEMO_MODE) {
        const guess = guessDetailsFromUrl(url);
        if (guess) {
          applyDetails(guess, "guess");
          showToast("Filled details based on the link");
        }
        return;
      }

      const details = await apiClient.testExtract(url);
      if (details && (details.product_name || details.current_price)) {
        const detectedPrice = Number(details.current_price);
        const priceSeemsSuspicious = detectedPrice <= 0 || detectedPrice > 100000;

        applyDetails(
          {
            product_name: details.product_name,
            store: formatStoreName(details.store),
            current_price: priceSeemsSuspicious ? null : details.current_price,
            currency_code: details.currency_code
          },
          "live"
        );

        if (priceSeemsSuspicious && details.current_price) {
          showToast("Price detected may be incorrect - please verify");
          if (hint) {
            hint.textContent = `Detected price (${details.current_price}) seems off - please check manually.`;
            hint.classList.add("warning");
            clearDetectHintAfterTimeout(hint);
          }
        } else {
          showToast("Product details detected");
        }
      } else {
        const guess = guessDetailsFromUrl(url);
        if (guess) {
          applyDetails(guess, "guess");
          showToast("Used best guess from the link");
        }
      }
    } catch (error) {
      console.error("Unable to detect product details", error);
      const fallback = guessDetailsFromUrl(url);
      if (fallback) {
        applyDetails(fallback, "guess");
        // Provide explicit UI feedback when auto-detect fails but we used a best-guess
        if (hint) {
          hint.textContent = "Automatic detection failed — used best guess from the link.";
          hint.classList.remove("info");
          hint.classList.add("warning");
          // Clear the hint after a short delay so the UI doesn't remain in warning state
          clearDetectHintAfterTimeout(hint);
        }
        showToast("Auto-detect failed; used best guess from link");
      } else if (!auto) {
        // No fallback available — make the user aware and prompt manual input
        if (hint) {
          hint.textContent = "Automatic detection failed — please enter product details manually.";
          hint.classList.remove("info");
          hint.classList.add("error");
          // Clear the hint after a short delay so the UI doesn't remain in error state
          clearDetectHintAfterTimeout(hint);
        }
        showToast("Could not detect product details");
      }
    } finally {
      setLoading(false);
    }
  };

  detectButton.addEventListener("click", () => detect(false));
  urlInput.addEventListener("change", () => detect(true));
}

async function setupEditMode(form, state) {
  const params = new URLSearchParams(window.location.search);
  const editId = params.get("edit");
  if (!editId) return;

  form.dataset.editingId = editId;
  const cached = sessionStorage.getItem("pricepulse-edit-item");
  if (cached) {
    try {
      populateFormFromItem(form, JSON.parse(cached));
    } catch (error) {
      console.debug("Invalid cached item payload", error);
    } finally {
      sessionStorage.removeItem("pricepulse-edit-item");
    }
  }

  const loadItem = async () => {
    let item = state.items.find((entry) => resolveItemId(entry) === editId);
    if (!item && !USE_DEMO_MODE) {
      try {
        const apiItem = await apiClient.getItem(editId);
        item = normalizeApiItem(apiItem);
      } catch (error) {
        console.error("Failed to fetch item for editing", error);
        showToast("Unable to load item details");
      }
    }
    if (!item) return;
    populateFormFromItem(form, item);
    const heading = document.querySelector("main h1");
    if (heading) heading.textContent = "Edit product";
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = "Save changes";
    const hint = document.querySelector("#detect-hint");
    if (hint) hint.textContent = "Editing existing item — update details below.";
  };

  await loadItem();
}

function populateFormFromItem(form, item) {
  if (!item) return;
  form.name.value = item.name || "";
  form.store.value = item.store || "";
  form.url.value = item.url || "";
  form.currentPrice.value = toNumber(item.currentPrice) ?? "";
  form.targetPrice.value = toNumber(item.targetPrice) ?? "";
  if (form.currencyCode && (item.currency || form.currencyCode.value)) {
    form.currencyCode.value = item.currency || form.currencyCode.value;
  }
  if (form.frequency && item.frequency) {
    form.frequency.value = item.frequency;
  }
  if (form.addedBy && item.addedBy) {
    form.addedBy.value = item.addedBy;
  }
}

// Auto-clear hint classes after a short timeout so the UI doesn't remain in error state
function clearDetectHintAfterTimeout(hint, timeout = 6000) {
  if (!hint) return;
  setTimeout(() => {
    hint.textContent = "";
    hint.classList.remove("warning", "error");
  }, timeout);
}

// handleProfile merged into renderProfile which properly saves contacts

function renderAddItemHints(state) {
  const list = document.querySelector("#recent-items");
  if (!list) return;
  const currency = state.preferences?.currency || "GBP";
  list.innerHTML = state.items
    .slice(0, 3)
    .map(
      (item) => `
      <div class="timeline-item">
        <strong>${item.name}</strong>
        <span>Last seen ${formatRelative(item.lastChecked)}</span>
        <span>Current • ${formatCurrency(item.currentPrice, item.currency || currency)}</span>
      </div>
    `
    )
    .join("");
}

function attachDashboardActions(state) {
  const tableBody = document.querySelector("#watchlist-body");
  if (!tableBody) return;

  tableBody.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("button[data-delete-item]");
    if (deleteButton) {
      const itemId = deleteButton.dataset.deleteItem;
      if (!itemId) return;

      deleteButton.disabled = true;
      deleteButton.textContent = "Removing…";

      const removeFromState = () => {
        state.items = state.items.filter((item) => resolveItemId(item) !== itemId);
        renderDashboard(state);
      };

      try {
        if (USE_DEMO_MODE) {
          removeFromState();
          saveState(state);
          showToast("Item removed");
        } else {
          await apiClient.deleteItem(itemId);
          removeFromState();
          showToast("Item removed");
        }
      } catch (error) {
        console.error("Failed to delete item", error);
        showToast("Unable to remove item right now");
        deleteButton.disabled = false;
        deleteButton.textContent = "Remove";
      }
      return;
    }

    const editButton = event.target.closest("button[data-edit-item]");
    if (editButton) {
      const itemId = editButton.dataset.editItem;
      if (!itemId) return;
      const item = state.items.find((entry) => resolveItemId(entry) === itemId);
      if (!item) {
        showToast("Could not find item to edit");
        return;
      }
      sessionStorage.setItem("pricepulse-edit-item", JSON.stringify(item));
      window.location.href = `add-item.html?edit=${encodeURIComponent(itemId)}`;
    }
  });
}

function wireResetButtons() {
  const buttons = document.querySelectorAll("[data-reset-demo]");
  buttons.forEach((button) => {
    if (USE_DEMO_MODE) {
      button.addEventListener("click", resetDemoData);
    } else {
      button.hidden = true;
    }
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

function wireLogoutButton() {
  const logoutBtn = document.querySelector("#logout-btn");
  if (!logoutBtn) return;

  // Show logout button if user is authenticated
  if (!USE_DEMO_MODE && authService.isAuthenticated()) {
    logoutBtn.style.display = "inline-block";
  }

  logoutBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      await authService.signOut();
      showToast("Signed out successfully");
      setTimeout(() => {
        window.location.href = "login.html";
      }, 500);
    } catch (error) {
      console.error("Logout failed", error);
      showToast("Failed to sign out");
    }
  });
}

function ensureGuestIdentity() {
  let guestId = localStorage.getItem(GUEST_ID_KEY);
  if (!guestId) {
    const randomPart = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2, 10);
    guestId = `guest-${randomPart}`;
    localStorage.setItem(GUEST_ID_KEY, guestId);
  }
  return guestId;
}

async function guardProtectedPage() {
  try {
    await authService.init();
  } catch (error) {
    console.debug("Auth init error", error);
  }

  if (!USE_DEMO_MODE) {
    if (!authService.isAuthenticated()) {
      ensureGuestIdentity();
    }
  }

  return true;
}

document.addEventListener("DOMContentLoaded", async () => {
  const allowed = await guardProtectedPage();
  if (!allowed) return;

  showLoading();
  const state = await loadState();
  hideLoading();

  setActiveNav();
  wireResetButtons();
  wireLogoutButton();

  switch (document.body.dataset.page) {
    case "dashboard":
      renderDashboard(state);
      attachDashboardActions(state);
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
      break;
    default:
      break;
  }
});
