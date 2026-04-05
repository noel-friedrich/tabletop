const qrImg = document.getElementById("join-qr-code");
const gameIdOutput = document.getElementById("gameid-output");
const openMenuButton = document.getElementById("open-menu-button");
const closeMenuButton = document.getElementById("close-menu-button");
const menuContainer = document.getElementById("menu-container");
const copyGameIdButton = document.getElementById("copy-gameid");

const playerListContainer = document.getElementById("player-list-container");
const playerListFieldset = document.getElementById("player-list-fieldset");

const clientStatusTitle = document.getElementById("client-status-title");

const clientHandActionsContainer = document.getElementById(
  "client-hand-actions",
);
const clientHandActionsToggle = document.getElementById(
  "client-hand-actions-toggle",
);
const clientHandActionsOptions = document.getElementById(
  "client-hand-actions-options",
);

const addSkatDeckButton = document.getElementById("add-skat-deck-button");
const addFrenchDeckButton = document.getElementById("add-french-deck-button");
const resetCardsButton = document.getElementById("reset-cards-button");
const hostSingleCardGrid = document.getElementById("host-single-card-grid");

const clientHandActionHandlers = new Map();

function registerClientHandAction(actionName, handler) {
  clientHandActionHandlers.set(actionName, handler);
}

function shuffleArrayInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const randIndex = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[randIndex];
    arr[randIndex] = temp;
  }
}

function getRandomBoardNormPos({ marginX = 0.14, marginY = 0.14 } = {}) {
  return new Vector2d(
    marginX + Math.random() * (1 - marginX * 2),
    marginY + Math.random() * (1 - marginY * 2),
  );
}

function getCardLabelFromImageUrl(imageUrl) {
  const parts = imageUrl.split("/");
  const fileName = (parts[parts.length - 1] ?? "").replace(".svg", "");
  const [rankRaw = "", suitRaw = ""] = fileName.split("_");
  const rankMap = {
    ace: "Ace",
    jack: "Jack",
    queen: "Queen",
    king: "King",
  };
  const suitMap = {
    clubs: "clubs",
    diamonds: "diamonds",
    hearts: "hearts",
    spades: "spades",
  };

  const rank = rankMap[rankRaw] ?? `${parseInt(rankRaw, 10) || rankRaw}`;
  const suit = suitMap[suitRaw] ?? suitRaw;
  return `${rank} of ${suit}`;
}

function getSortedPrivateCards() {
  return gameState.gameCards
    .filter((card) => card.deviceId == deviceInfo.id)
    .sort((a, b) => {
      if (a.deckName != b.deckName) {
        return a.deckName.localeCompare(b.deckName);
      }
      return a.deckCardIndex - b.deckCardIndex;
    });
}

function linePositionsForHand(
  cardCount,
  { startX = 0.16, endX = 0.84, y = null } = {},
) {
  if (cardCount <= 0) {
    return [];
  }

  y ??= ClientAreaLayout.splitY + (1 - ClientAreaLayout.splitY) * 0.55 - 0.1;

  if (cardCount == 1) {
    return [new Vector2d(0.5, y)];
  }

  const out = [];
  for (let i = 0; i < cardCount; i++) {
    const t = i / (cardCount - 1);
    const x = startX + (endX - startX) * t;
    out.push(new Vector2d(x, y));
  }
  return out;
}

function fanPositionsForHand(
  cardCount,
  { centerX = 0.5, spreadX = 0.66, y = null, arcHeight = 0.11 } = {},
) {
  if (cardCount <= 0) {
    return [];
  }

  y ??= ClientAreaLayout.splitY + (1 - ClientAreaLayout.splitY) * 0.62 - 0.1;

  if (cardCount == 1) {
    return [new Vector2d(centerX, y)];
  }

  const out = [];
  for (let i = 0; i < cardCount; i++) {
    const t = i / (cardCount - 1);
    const x = centerX - spreadX / 2 + spreadX * t;
    const centered = t * 2 - 1;
    const curve = 1 - centered * centered;
    const yOffset = arcHeight * curve;
    out.push(new Vector2d(x, y - yOffset));
  }
  return out;
}

function arrangeClientHand({
  order = "sorted",
  layout = "line",
  lineOptions = {},
  fanOptions = {},
} = {}) {
  if (deviceInfo.role != DeviceRole.Client) {
    return;
  }

  const privateCards = getSortedPrivateCards();

  if (order == "shuffled") {
    shuffleArrayInPlace(privateCards);
  }

  const targets =
    layout == "fan"
      ? fanPositionsForHand(privateCards.length, fanOptions)
      : linePositionsForHand(privateCards.length, lineOptions);

  for (let i = 0; i < privateCards.length; i++) {
    const card = privateCards[i];
    const targetVisualPos = targets[i];
    const newId = isPrivateAreaVisualY(targetVisualPos.y)
      ? deviceInfo.id
      : DeviceIdCatalogue.Board;
    const targetLocalPos = GameDrawer.getLocalNormPos(targetVisualPos);

    card.layerIndex = gameState.maxLayerIndex + 1;
    card.deviceId = newId;
    card.setDesiredPos(targetLocalPos);

    if (rtc) {
      rtc.sendMessage(
        new DataMessage(dataMessageType.MOVE_CARD, {
          uid: card.uid,
          to: targetLocalPos.serialize(),
          deviceId: newId,
        }),
      );
    }
  }

  gameState.redraw();
}

function closeClientHandActions() {
  clientHandActionsOptions?.classList.remove("active");
}

function openClientHandActions() {
  clientHandActionsOptions?.classList.add("active");
}

function getSortedAllCards() {
  return [...gameState.gameCards].sort((a, b) => {
    if (a.deckName != b.deckName) {
      return a.deckName.localeCompare(b.deckName);
    }
    if (a.deckCardIndex != b.deckCardIndex) {
      return a.deckCardIndex - b.deckCardIndex;
    }
    return a.uid.localeCompare(b.uid);
  });
}

function linePositionsForLocalCards(
  cardCount,
  { startX = 0.16, endX = 0.84, y = 0.5 } = {},
) {
  if (cardCount <= 0) {
    return [];
  }

  if (cardCount == 1) {
    return [new Vector2d(0.5, y)];
  }

  const out = [];
  for (let i = 0; i < cardCount; i++) {
    const t = i / (cardCount - 1);
    const x = startX + (endX - startX) * t;
    out.push(new Vector2d(x, y));
  }
  return out;
}

function getHostDistributionDeviceIds() {
  const ids = [];

  if (rtc?.connections) {
    for (const connection of rtc.connections) {
      ids.push(`client-${connection.index}`);
    }
  }

  if (ids.length == 0) {
    ids.push(DeviceIdCatalogue.Board);
  }

  return ids;
}

function hostDistributeShuffledCards() {
  if (deviceInfo.role != DeviceRole.Host) {
    return;
  }

  const allCards = [...gameState.gameCards];
  shuffleArrayInPlace(allCards);

  const targetDeviceIds = getHostDistributionDeviceIds();
  const handsByDeviceId = new Map(
    targetDeviceIds.map((deviceId) => [deviceId, []]),
  );

  for (let i = 0; i < allCards.length; i++) {
    const deviceId = targetDeviceIds[i % targetDeviceIds.length];
    handsByDeviceId.get(deviceId).push(allCards[i]);
  }

  let animationStep = 0;
  for (const deviceId of targetDeviceIds) {
    const handCards = handsByDeviceId.get(deviceId);
    const targets = linePositionsForLocalCards(handCards.length, {
      startX: 0.16,
      endX: 0.84,
      y: 0.5,
    });

    for (let i = 0; i < handCards.length; i++) {
      const card = handCards[i];
      const target = targets[i];
      const layerIndex = gameState.maxLayerIndex + 1;
      const delayMs = animationStep * 70;

      setTimeout(() => {
        card.deviceId = deviceId;
        card.layerIndex = layerIndex;
        card.setDesiredPos(target);
        gameState.redraw();
        syncGamestateToClients();
      }, delayMs);

      animationStep++;
    }
  }
}

function hostSortAndCenterAllCards() {
  if (deviceInfo.role != DeviceRole.Host) {
    return;
  }

  const sortedCards = getSortedAllCards();
  const targets = linePositionsForLocalCards(sortedCards.length, {
    startX: 0.2,
    endX: 0.8,
    y: 0.5,
  });

  for (let i = 0; i < sortedCards.length; i++) {
    const card = sortedCards[i];
    card.deviceId = DeviceIdCatalogue.Board;
    card.layerIndex = i;
    card.setDesiredPos(targets[i]);
  }

  gameState.redraw();
  syncGamestateToClients();
}

function hostRandomizeAllCards() {
  if (deviceInfo.role != DeviceRole.Host) {
    return;
  }

  const indices = Array.from(
    { length: gameState.gameCards.length },
    (_, i) => i,
  );
  const randomWeights = indices.map(Math.random);
  indices.sort((a, b) => randomWeights[a] - randomWeights[b]);

  for (let i = 0; i < gameState.gameCards.length; i++) {
    const card = gameState.gameCards[i];
    const randomPos = Vector2d.random()
      .scale(0.8)
      .add(Vector2d.unit11.scale(0.1));
    card.deviceId = DeviceIdCatalogue.Board;
    card.setDesiredPos(randomPos);
    card.layerIndex = indices[i];
  }

  gameState.redraw();
  syncGamestateToClients();
}

function hostAddDeck(deckName) {
  if (deviceInfo.role != DeviceRole.Host) {
    return;
  }

  const deck = cardDecks.getDeckByName(deckName);
  if (!deck) {
    return;
  }

  const jitter = Vector2d.random().sub(Vector2d.unit11.scale(0.5)).scale(0.08);
  const spawnPos = Vector2d.unit11.scale(0.5).add(jitter);

  gameState.addDeck(deck, spawnPos);
  gameState.redraw();
  syncGamestateToClients();
}

function hostAddSingleCard(deckName, deckCardIndex) {
  if (deviceInfo.role != DeviceRole.Host) {
    return;
  }

  const deck = cardDecks.getDeckByName(deckName);
  if (!deck || deckCardIndex < 0 || deckCardIndex >= deck.size) {
    return;
  }

  const spawnPos = new Vector2d(0.5 + (Math.random() - 0.5) * 0.08, -0.18);
  const targetPos = getRandomBoardNormPos();
  const gameCard = new GameCard(
    spawnPos,
    targetPos,
    deckName,
    deckCardIndex,
    gameState.maxLayerIndex + 1,
    DeviceIdCatalogue.Board,
  );

  gameState.gameCards.push(gameCard);
  gameState.redraw();
  syncGamestateToClients();
}

function hostResetCards() {
  if (deviceInfo.role != DeviceRole.Host) {
    return;
  }

  gameState = new GameState();
  gameState.redraw();
  syncGamestateToClients();
}

let floatingActionsSetupDone = false;
let hostDeckControlsSetupDone = false;

function renderHostSingleCardGrid(deckName = "french") {
  if (!hostSingleCardGrid) {
    return;
  }

  const deck = cardDecks.getDeckByName(deckName);
  if (!deck) {
    hostSingleCardGrid.replaceChildren();
    return;
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
}

function setupHostDeckControls() {
  if (hostDeckControlsSetupDone) {
    return;
  }

  hostDeckControlsSetupDone = true;
  renderHostSingleCardGrid();

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

  for (const button of clientHandActionsOptions.querySelectorAll(
    "[data-action]",
  )) {
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

function initCommonMenu() {
  openMenuButton.addEventListener("click", () => {
    menuContainer.classList.remove("hidden");
  });

  closeMenuButton.addEventListener("click", () => {
    menuContainer.classList.add("hidden");
  });
}

function initHostMenu() {
  menuContainer.classList.add("host");
  initCommonMenu();
  setupFloatingActions();
  setupHostDeckControls();

  copyGameIdButton.addEventListener("click", async () => {
    navigator.clipboard
      .writeText(gameIdOutput.textContent)
      .then(() => {
        const originalText = copyGameIdButton.textContent;
        copyGameIdButton.textContent = "Copied!";
        copyGameIdButton.disabled = true;

        setTimeout(() => {
          copyGameIdButton.textContent = originalText;
          copyGameIdButton.disabled = false;
        }, 2000);
      })
      .catch(() => {
        const originalText = copyGameIdButton.textContent;
        copyGameIdButton.textContent = "Couldn't copy.";
        copyGameIdButton.disabled = true;

        setTimeout(() => {
          copyGameIdButton.textContent = originalText;
          copyGameIdButton.disabled = false;
        }, 2000);
      });
  });
}

function updateRtcConnectionsTable() {
  if (!rtc) {
    return;
  }

  playerListFieldset.style.display = "grid";
  playerListContainer.innerHTML = "";
  if (rtc.connections.length == 0) {
    playerListContainer.textContent = Text.OnceYouConnectPlayers;
  }

  for (let i = 0; i < rtc.connections.length; i++) {
    const playerContainer = document.createElement("div");
    playerContainer.classList.add("player-status-container");
    const circularIndicator = document.createElement("div");
    circularIndicator.classList.add("circle-indicator");
    const playerNameElement = document.createElement("div");
    playerNameElement.classList.add("player-name");

    playerContainer.appendChild(circularIndicator);
    playerContainer.appendChild(playerNameElement);

    const connection = rtc.connections[i];

    playerNameElement.textContent = Text.DeviceNum(connection.index);

    const connectionStatus = connection.getStatus();
    circularIndicator.classList.add(connectionStatus.color);
    playerContainer.title = connectionStatus.message ?? "";

    playerListContainer.appendChild(playerContainer);
  }
}

function initClientMenu() {
  initCommonMenu();
  menuContainer.classList.add("client");
  setupFloatingActions();
}
