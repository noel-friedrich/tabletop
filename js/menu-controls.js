const localStorageGameIdKey = "cards--last-gameid";
const legacyLocalStorageCardSizeKey = "cards--card-size";

let floatingActionsSetupDone = false;
let hostDeckControlsSetupDone = false;
let dynamicMenusSetupDone = false;
let cardSizeControlsSetupDone = false;
let hostDeckControlsRendered = false;

function readLocalStorageValue(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorageValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function normalizeGameIdInput(value) {
  return `${value ?? ""}`.trim();
}

function makeFieldset(title, innerHtml, id = null) {
  const fieldset = document.createElement("fieldset");
  if (id) {
    fieldset.id = id;
  }

  fieldset.innerHTML = `<legend>${title}</legend>${innerHtml}`;
  return fieldset;
}

function getCurrentClientGameId() {
  return normalizeGameIdInput(
    deviceInfo.gameId || readLocalStorageValue(localStorageGameIdKey) || "",
  );
}

function updateClientJoinFieldsetVisibility() {
  const clientJoinFieldset = document.getElementById("client-join-fieldset");
  if (!clientJoinFieldset) {
    return;
  }

  clientJoinFieldset.style.display = getCurrentClientGameId() ? "none" : "";
}

function getCardSizeStorageKey() {
  return deviceInfo.role == DeviceRole.Host
    ? "cards--card-size--host"
    : "cards--card-size--client";
}

function getDefaultCardSizePx() {
  return deviceInfo.role == DeviceRole.Host ? 150 : 100;
}

function getCardSizePreviewImageUrl() {
  const preferredDeckInfo =
    cardDeckInfos.find((deckInfo) => deckInfo.name == "french") ??
    cardDeckInfos[0];
  const preferredDeckName = preferredDeckInfo?.name;
  if (!preferredDeckName) {
    return "";
  }

  const preferredDeck = cardDecks.getDeckByName(preferredDeckName);
  if (!preferredDeck?.loadedImages) {
    return "";
  }

  return preferredDeck.backPreviewUrl ?? preferredDeck.frontPreviewUrl ?? "";
}

function ensureCardSizePreviewElements() {
  const previewImageUrl = getCardSizePreviewImageUrl();
  for (const fieldset of document.querySelectorAll(
    "#host-display-fieldset, #client-display-fieldset",
  )) {
    if (fieldset.querySelector(".card-size-preview")) {
      continue;
    }

    const preview = document.createElement("div");
    preview.className = "card-size-preview";
    preview.setAttribute("aria-hidden", "false");

    const previewImage = document.createElement("img");
    previewImage.className = "card-size-preview-image";
    previewImage.alt = "";
    previewImage.draggable = false;
    if (previewImageUrl) {
      previewImage.src = previewImageUrl;
    }
    preview.appendChild(previewImage);
    const sliderInput = fieldset.querySelector(".card-size-input");
    if (sliderInput) {
      sliderInput.before(preview);
    } else {
      fieldset.appendChild(preview);
    }
  }
}

function refreshCardSizePreviewImages() {
  const previewImageUrl = getCardSizePreviewImageUrl();
  if (!previewImageUrl) {
    return;
  }

  for (const previewImage of document.querySelectorAll(".card-size-preview-image")) {
    previewImage.src = previewImageUrl;
  }
}

function updateCardSizePreviews(sizePx) {
  for (const preview of document.querySelectorAll(".card-size-preview")) {
    const previewImage = preview.querySelector(".card-size-preview-image");
    const shortEdgePx = Math.round(sizePx * (2 / 3));

    preview.style.setProperty("--card-preview-short-edge", `${shortEdgePx}px`);

    if (previewImage) {
      previewImage.style.height = `${sizePx}px`;
    }
  }
}

function ensureDynamicMenus() {
  if (dynamicMenusSetupDone) {
    return;
  }

  dynamicMenusSetupDone = true;

  if (hostMenuSection && !document.getElementById("host-join-fieldset")) {
    const joinFieldset = makeFieldset(
      "Join Another Table",
      `
        <p class="menu-note">
          Open an existing game on this device by typing its code instead of scanning the QR code.
        </p>
        <div class="menu-inline-form">
          <input
            id="host-join-gameid-input"
            class="menu-text-input"
            type="text"
            inputmode="text"
            autocapitalize="characters"
            placeholder="Enter game code"
          />
          <button id="host-join-gameid-button" type="button">Join</button>
        </div>
      `,
      "host-join-fieldset",
    );
    hostDeckControlsFieldset.before(joinFieldset);

    const hostHelpFieldset = makeFieldset(
      "Table Help",
      `
        <p class="menu-note">
          Drag cards to move them. Right-click a card to flip it, remove it, or work with a nearby pile as a stack.
        </p>
      `,
      "host-help-fieldset",
    );
    hostDeckControlsFieldset.after(hostHelpFieldset);

    const hostDisplayFieldset = makeFieldset(
      "Display",
      `
        <label class="menu-slider-row" for="host-card-size-input">
          <span>Card size</span>
          <output class="card-size-output" id="host-card-size-output"></output>
        </label>
        <input
          id="host-card-size-input"
          class="card-size-input"
          type="range"
          min="80"
          max="200"
          step="5"
        />
      `,
      "host-display-fieldset",
    );
    hostHelpFieldset.after(hostDisplayFieldset);
  }

  if (clientMenuSection && !document.getElementById("client-join-fieldset")) {
    const intro = document.createElement("p");
    intro.className = "menu-note client-intro-note";
    intro.textContent =
      "Join a host by entering a game code or opening a QR link. Cards in the lower half stay private to this device.";
    clientStatusTitle.after(intro);

    const joinFieldset = makeFieldset(
      "Join Table",
      `
        <p class="menu-note">
          Enter the game code from the host device, then connect to the table from here.
        </p>
        <div class="menu-inline-form">
          <input
            id="client-gameid-input"
            class="menu-text-input"
            type="text"
            inputmode="text"
            autocapitalize="characters"
            placeholder="Enter game code"
          />
          <button id="client-join-gameid-button" type="button">Connect</button>
        </div>
      `,
      "client-join-fieldset",
    );

    const helpFieldset = makeFieldset(
      "How It Works",
      `
        <p class="menu-note">
          Drag a card upward to play it on the table. Drag it downward to keep it in your private hand on this device.
        </p>
        <p class="menu-note">
          Right-click visible cards to flip or remove them. Use the floating hand button for sorting, shuffling, and fanning.
        </p>
      `,
      "client-help-fieldset",
    );

    const displayFieldset = makeFieldset(
      "Display",
      `
        <label class="menu-slider-row" for="client-card-size-input">
          <span>Card size</span>
          <output class="card-size-output" id="client-card-size-output"></output>
        </label>
        <input
          id="client-card-size-input"
          class="card-size-input"
          type="range"
          min="80"
          max="200"
          step="5"
        />
      `,
      "client-display-fieldset",
    );

    clientMenuSection.appendChild(joinFieldset);
    clientMenuSection.appendChild(helpFieldset);
    clientMenuSection.appendChild(displayFieldset);
  }

  const initialGameId = deviceInfo.gameId || readLocalStorageValue(localStorageGameIdKey) || "";
  for (const input of document.querySelectorAll(".menu-text-input")) {
    if (!input.value) {
      input.value = initialGameId;
    }
  }

  updateClientJoinFieldsetVisibility();
}

function applyCardSizeSetting(nextSizePx) {
  const numericSize = Math.max(
    80,
    Math.min(200, parseInt(nextSizePx, 10) || getDefaultCardSizePx()),
  );
  GameDrawer.imgHeightPx = numericSize;
  writeLocalStorageValue(getCardSizeStorageKey(), `${numericSize}`);

  for (const input of document.querySelectorAll(".card-size-input")) {
    input.value = `${numericSize}`;
  }

  for (const output of document.querySelectorAll(".card-size-output")) {
    output.textContent = `${numericSize}px`;
  }

  updateCardSizePreviews(numericSize);
  gameState.redraw();
}

function setupCardSizeControls() {
  if (cardSizeControlsSetupDone) {
    return;
  }

  cardSizeControlsSetupDone = true;
  ensureDynamicMenus();
  ensureCardSizePreviewElements();
  refreshCardSizePreviewImages();

  const storedSize =
    readLocalStorageValue(getCardSizeStorageKey()) ??
    readLocalStorageValue(legacyLocalStorageCardSizeKey);
  applyCardSizeSetting(storedSize ?? getDefaultCardSizePx());

  for (const input of document.querySelectorAll(".card-size-input")) {
    input.addEventListener("input", () => {
      applyCardSizeSetting(input.value);
    });
  }
}

function setupGameCodeForms() {
  ensureDynamicMenus();

  const hostJoinButton = document.getElementById("host-join-gameid-button");
  const hostJoinInput = document.getElementById("host-join-gameid-input");
  hostJoinButton?.addEventListener("click", () => {
    const gameId = normalizeGameIdInput(hostJoinInput?.value);
    if (!gameId) {
      return;
    }

    writeLocalStorageValue(localStorageGameIdKey, gameId);
    window.location.href = `${location.pathname}?client&p=${encodeURIComponent(gameId)}`;
  });

  const clientJoinButton = document.getElementById("client-join-gameid-button");
  const clientJoinInput = document.getElementById("client-gameid-input");
  clientJoinButton?.addEventListener("click", () => {
    const gameId = normalizeGameIdInput(clientJoinInput?.value);
    if (!gameId) {
      return;
    }

    joinClientWithGameId(gameId);
    updateClientJoinFieldsetVisibility();
  });
}

function renderHostSingleCardGrid(deckName = "french") {
  if (!hostSingleCardGrid) {
    return false;
  }

  const deck = cardDecks.getDeckByName(deckName);
  if (!deck) {
    hostSingleCardGrid.replaceChildren();
    return false;
  }

  const buttons = deck.imageUrls.map((imageUrl, deckCardIndex) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "host-single-card-button";

    const label = getCardLabelFromImageUrl(imageUrl);
    button.title = `Add ${label}`;
    button.setAttribute("aria-label", `Add ${label}`);

    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = label;

    button.appendChild(img);
    button.addEventListener("click", () => {
      hostAddSingleCard(deckName, deckCardIndex);
    });

    return button;
  });

  hostSingleCardGrid.replaceChildren(...buttons);
  return true;
}

function sortHostDeckButtons() {
  if (!hostDeckControlsContainer) {
    return;
  }

  if (resetCardsButton) {
    hostDeckControlsContainer.prepend(resetCardsButton);
  }

  const deckButtons = [
    { deckName: "french", button: addFrenchDeckButton },
    { deckName: "skat", button: addSkatDeckButton },
  ]
    .filter((entry) => entry.button)
    .sort((a, b) => a.deckName.localeCompare(b.deckName));

  const firstExtraElement = hostSingleCardGrid?.parentElement;
  for (const entry of deckButtons) {
    hostDeckControlsContainer.insertBefore(entry.button, firstExtraElement);
  }
}

function setHostDeckControlsExpanded(isExpanded) {
  if (!hostDeckControlsContainer || !hostDeckControlsToggle) {
    return;
  }

  hostDeckControlsContainer.hidden = !isExpanded;
  hostDeckControlsToggle.setAttribute("aria-expanded", `${isExpanded}`);
  hostDeckControlsFieldset?.classList.toggle("expanded", isExpanded);

  if (isExpanded && !hostDeckControlsRendered) {
    hostDeckControlsRendered = renderHostSingleCardGrid();
  }
}

function setupHostDeckControls() {
  if (hostDeckControlsSetupDone) {
    return;
  }

  hostDeckControlsSetupDone = true;
  ensureDynamicMenus();
  sortHostDeckButtons();
  setHostDeckControlsExpanded(false);

  hostDeckControlsToggle?.addEventListener("click", () => {
    const isExpanded =
      hostDeckControlsToggle.getAttribute("aria-expanded") == "true";
    setHostDeckControlsExpanded(!isExpanded);
  });

  addSkatDeckButton?.addEventListener("click", () => {
    hostAddDeck("skat");
  });

  addFrenchDeckButton?.addEventListener("click", () => {
    hostAddDeck("french");
  });

  resetCardsButton?.addEventListener("click", async () => {
    const shouldReset = await customConfirm(
      "This will remove all cards from the table. Continue?",
      { defaultYes: false, header: "Reset Cards" },
    );
    if (shouldReset) {
      hostResetCards();
    }
  });
}

function closeClientHandActions() {
  clientHandActionsOptions?.classList.remove("active");
}

function openClientHandActions() {
  clientHandActionsOptions?.classList.add("active");
}

function setupFloatingActions() {
  if (
    floatingActionsSetupDone ||
    !clientHandActionsContainer ||
    !clientHandActionsToggle ||
    !clientHandActionsOptions
  ) {
    return;
  }

  floatingActionsSetupDone = true;

  const handActions = [
    {
      name: "sort-cards",
      run: () => arrangeClientHand({ order: "sorted", layout: "line" }),
    },
    {
      name: "shuffle-hand",
      run: () => arrangeClientHand({ order: "shuffled", layout: "line" }),
    },
    {
      name: "fan-hand",
      run: () => arrangeClientHand({ order: "sorted", layout: "fan" }),
    },
    {
      name: "host-distribute-shuffle",
      run: () => hostDistributeShuffledCards(),
    },
    {
      name: "host-sort-center",
      run: () => hostSortAndCenterAllCards(),
    },
    {
      name: "host-randomize-all",
      run: () => hostRandomizeAllCards(),
    },
  ];

  for (const action of handActions) {
    registerClientHandAction(action.name, action.run);
  }

  clientHandActionsToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (clientHandActionsOptions.classList.contains("active")) {
      closeClientHandActions();
    } else {
      openClientHandActions();
    }
  });

  for (const button of clientHandActionsOptions.querySelectorAll("[data-action]")) {
    button.addEventListener("click", (event) => {
      const actionName = button.dataset.action;
      const handler = clientHandActionHandlers.get(actionName);
      if (handler) {
        handler(event);
      }
      closeClientHandActions();
    });
  }

  document.addEventListener("click", (event) => {
    if (!clientHandActionsContainer.contains(event.target)) {
      closeClientHandActions();
    }
  });
}
