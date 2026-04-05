const cardContextMenuState = {
  anchorCardUid: null,
  pileCardUids: [],
};
const cardContextTouchState = {
  longPressTimeoutId: null,
  startClientPos: null,
  anchorCardUid: null,
  didOpenLongPressMenu: false,
};
const hostBlankContextTouchState = {
  longPressTimeoutId: null,
  startClientPos: null,
  didOpenLongPressMenu: false,
};

const clientLongPressDelayMs = 500;
const clientLongPressMoveTolerancePx = 12;

let cardContextMenuElement = null;

function getCardContextMenuElement() {
  if (cardContextMenuElement) {
    return cardContextMenuElement;
  }

  const menu = document.createElement("div");
  menu.className = "card-context-menu";
  document.body.appendChild(menu);
  cardContextMenuElement = menu;
  return cardContextMenuElement;
}

function closeCardContextMenu() {
  if (!cardContextMenuElement) {
    return;
  }

  cardContextMenuElement.classList.remove("active");
  cardContextMenuElement.replaceChildren();
  cardContextMenuState.anchorCardUid = null;
  cardContextMenuState.pileCardUids = [];
  clearHighlightedCardUids();
}

function clearLongPressContextMenuTimer(touchState) {
  if (touchState.longPressTimeoutId !== null) {
    clearTimeout(touchState.longPressTimeoutId);
    touchState.longPressTimeoutId = null;
  }
}

function clearClientLongPressContextMenuTimer() {
  clearLongPressContextMenuTimer(cardContextTouchState);
}

function clearHostBlankLongPressContextMenuTimer() {
  clearLongPressContextMenuTimer(hostBlankContextTouchState);
}

function resetClientLongPressContextMenuState() {
  clearClientLongPressContextMenuTimer();
  cardContextTouchState.startClientPos = null;
  cardContextTouchState.anchorCardUid = null;
  cardContextTouchState.didOpenLongPressMenu = false;
}

function resetHostBlankLongPressContextMenuState() {
  clearHostBlankLongPressContextMenuTimer();
  hostBlankContextTouchState.startClientPos = null;
  hostBlankContextTouchState.didOpenLongPressMenu = false;
}

function getTouchClientPos(event) {
  const touch =
    event.touches?.[0] ??
    event.changedTouches?.[0] ??
    event.originalEvent?.changedTouches?.[0];

  if (!touch) {
    return null;
  }

  return new Vector2d(touch.clientX, touch.clientY);
}

function scheduleClientLongPressContextMenu(event) {
  if (deviceInfo.role != DeviceRole.Client || event.touches?.length != 1) {
    resetClientLongPressContextMenuState();
    return;
  }

  const screenPos = Vector2d.fromEvent(event, fullscreenCanvas);
  const normPos = GameDrawer.screenPosToNormPos(fullscreenCanvas, screenPos);
  const gameCard = GameDrawer.getCardAt(fullscreenCanvas, gameState, normPos);
  const clientPos = getTouchClientPos(event);

  if (!gameCard || !clientPos) {
    resetClientLongPressContextMenuState();
    return;
  }

  resetClientLongPressContextMenuState();
  cardContextTouchState.startClientPos = clientPos;
  cardContextTouchState.anchorCardUid = gameCard.uid;
  cardContextTouchState.longPressTimeoutId = window.setTimeout(() => {
    const anchorCard = gameState.getCardByUid(cardContextTouchState.anchorCardUid);
    cardContextTouchState.didOpenLongPressMenu = true;

    if (typeof cancelUserInteraction === "function") {
      cancelUserInteraction();
    }

    if (!anchorCard) {
      closeCardContextMenu();
      return;
    }

    openCardContextMenu({
      anchorCard,
      clientX: clientPos.x,
      clientY: clientPos.y,
    });
  }, clientLongPressDelayMs);
}

function cancelClientLongPressOnMove(event) {
  if (
    deviceInfo.role != DeviceRole.Client ||
    !cardContextTouchState.startClientPos ||
    cardContextTouchState.didOpenLongPressMenu
  ) {
    return;
  }

  const clientPos = getTouchClientPos(event);
  if (!clientPos) {
    clearClientLongPressContextMenuTimer();
    return;
  }

  if (
    clientPos.distance(cardContextTouchState.startClientPos) >
    clientLongPressMoveTolerancePx
  ) {
    clearClientLongPressContextMenuTimer();
  }
}

function scheduleHostBlankLongPressContextMenu(event) {
  if (deviceInfo.role != DeviceRole.Host || event.touches?.length != 1) {
    resetHostBlankLongPressContextMenuState();
    return;
  }

  const screenPos = Vector2d.fromEvent(event, fullscreenCanvas);
  const spawnNormPos = GameDrawer.screenPosToNormPos(fullscreenCanvas, screenPos);
  const gameCard = GameDrawer.getCardAt(fullscreenCanvas, gameState, spawnNormPos);
  const clientPos = getTouchClientPos(event);

  if (gameCard || !clientPos) {
    resetHostBlankLongPressContextMenuState();
    return;
  }

  resetHostBlankLongPressContextMenuState();
  hostBlankContextTouchState.startClientPos = clientPos;
  hostBlankContextTouchState.longPressTimeoutId = window.setTimeout(() => {
    hostBlankContextTouchState.didOpenLongPressMenu = true;

    if (typeof cancelUserInteraction === "function") {
      cancelUserInteraction();
    }

    openHostBlankContextMenu({
      clientX: clientPos.x,
      clientY: clientPos.y,
      spawnNormPos,
    });
  }, clientLongPressDelayMs);
}

function cancelHostBlankLongPressOnMove(event) {
  if (
    deviceInfo.role != DeviceRole.Host ||
    !hostBlankContextTouchState.startClientPos ||
    hostBlankContextTouchState.didOpenLongPressMenu
  ) {
    return;
  }

  const clientPos = getTouchClientPos(event);
  if (!clientPos) {
    clearHostBlankLongPressContextMenuTimer();
    return;
  }

  if (
    clientPos.distance(hostBlankContextTouchState.startClientPos) >
    clientLongPressMoveTolerancePx
  ) {
    clearHostBlankLongPressContextMenuTimer();
  }
}

function renderContextMenuEntries(entries, { clientX, clientY }) {
  if (!entries || entries.length == 0) {
    closeCardContextMenu();
    return;
  }

  const menu = getCardContextMenuElement();

  menu.replaceChildren(
    ...entries.map((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = entry.label;
      if (entry.danger) {
        button.classList.add("danger");
      }
      button.addEventListener("click", () => {
        entry.run();
        closeCardContextMenu();
      });
      return button;
    }),
  );

  menu.classList.add("active");
  const margin = 10;
  const bottomPadding = 28;
  const measuredRect = menu.getBoundingClientRect();
  const width = measuredRect.width || 220;
  const height = measuredRect.height || entries.length * 40 + 16;
  const left = Math.max(
    margin,
    Math.min(window.innerWidth - width - margin, clientX),
  );
  const top = Math.max(
    margin,
    Math.min(window.innerHeight - height - bottomPadding, clientY),
  );

  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

function formatContextMenuCountLabel(label, count) {
  return `${label} (${count})`;
}

function openCardContextMenu({ anchorCard, clientX, clientY }) {
  if (!anchorCard) {
    return closeCardContextMenu();
  }

  if (
    deviceInfo.role == DeviceRole.Host &&
    typeof cancelUserInteraction === "function"
  ) {
    cancelUserInteraction({ clearSelection: true });
  }

  const pileCards = getNearbyPileCards(anchorCard, {
    boardOnly: deviceInfo.role == DeviceRole.Host,
  });
  const pileCardUids = pileCards.map((card) => card.uid);
  const allowDelete = deviceInfo.role == DeviceRole.Host;

  cardContextMenuState.anchorCardUid = anchorCard.uid;
  cardContextMenuState.pileCardUids = pileCardUids;
  setHighlightedCardUids(pileCardUids);

  const entries = [];

  if (pileCards.length <= 1) {
    entries.push({
      label: "Flip card",
      run: () => toggleCardFaceUp(anchorCard),
    });
  }

  if (allowDelete && pileCards.length <= 1) {
    entries.push({
      label: "Delete card",
      run: () => requestRemoveCards([anchorCard.uid]),
      danger: true,
    });
  }

  if (pileCards.length > 1) {
    entries.push({
      label: "Flip entire stack",
      run: () => togglePileFaceUp(pileCards),
    });
    if (allowDelete) {
      entries.push({
        label: formatContextMenuCountLabel("Delete Pile", pileCardUids.length),
        run: () => requestRemoveCards(pileCardUids),
        danger: true,
      });
    }
  }

  if (
    deviceInfo.role == DeviceRole.Host &&
    anchorCard.deviceId == DeviceIdCatalogue.Board &&
    pileCards.length > 1
  ) {
    entries.splice(0, 0, {
      label: "Align to stack",
      run: () => stackNearbyPile(anchorCard),
    });
    entries.splice(1, 0, {
      label: "Sort and Stack",
      run: () => sortAndStackNearbyPile(anchorCard),
    });
    entries.splice(2, 0, {
      label: "Shuffle, Stack and Flip",
      run: () => shuffleAndStackNearbyPile(anchorCard),
    });
    entries.splice(3, 0, {
      label: "Deal one card to each player",
      run: () => hostDealOneCardPerPlayerFromPile(anchorCard),
    });
    entries.splice(4, 0, {
      label: "Deal pile evenly",
      run: () => hostDealPileEvenly(anchorCard),
    });
  }

  if (pileCards.length > 1) {
    const flipEntireStackIndex = entries.findIndex(
      (entry) => entry.label == "Flip entire stack",
    );
    if (flipEntireStackIndex > 0) {
      const [flipEntireStackEntry] = entries.splice(flipEntireStackIndex, 1);
      entries.unshift(flipEntireStackEntry);
    }
  }

  renderContextMenuEntries(entries, { clientX, clientY });
}

function openHostBlankContextMenu({ clientX, clientY, spawnNormPos }) {
  if (deviceInfo.role != DeviceRole.Host) {
    return closeCardContextMenu();
  }

  const skatDeck = cardDecks.getDeckByName("skat");
  const frenchDeck = cardDecks.getDeckByName("french");

  cardContextMenuState.anchorCardUid = null;
  cardContextMenuState.pileCardUids = [];
  clearHighlightedCardUids();

  renderContextMenuEntries(
    [
      {
        label: formatContextMenuCountLabel("Spawn Skat Stack", skatDeck?.size ?? 0),
        run: () =>
          hostAddDeck("skat", {
            spawnPos: spawnNormPos?.copy?.() ?? null,
            stacked: true,
          }),
      },
      {
        label: formatContextMenuCountLabel(
          "Spawn French Stack",
          frenchDeck?.size ?? 0,
        ),
        run: () =>
          hostAddDeck("french", {
            spawnPos: spawnNormPos?.copy?.() ?? null,
            stacked: true,
          }),
      },
    ],
    { clientX, clientY },
  );
}

fullscreenCanvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();

  const normPos = GameDrawer.screenPosToNormPos(
    fullscreenCanvas,
    Vector2d.fromEvent(event, fullscreenCanvas),
  );
  const gameCard = GameDrawer.getCardAt(fullscreenCanvas, gameState, normPos);

  if (!gameCard) {
    if (deviceInfo.role == DeviceRole.Host) {
      openHostBlankContextMenu({
        clientX: event.clientX,
        clientY: event.clientY,
        spawnNormPos: normPos,
      });
      return;
    }

    closeCardContextMenu();
    return;
  }

  openCardContextMenu({
    anchorCard: gameCard,
    clientX: event.clientX,
    clientY: event.clientY,
  });
});

fullscreenCanvas.addEventListener(
  "touchstart",
  (event) => {
    scheduleClientLongPressContextMenu(event);
    scheduleHostBlankLongPressContextMenu(event);
  },
  { passive: false },
);

fullscreenCanvas.addEventListener(
  "touchmove",
  (event) => {
    cancelClientLongPressOnMove(event);
    cancelHostBlankLongPressOnMove(event);
  },
  { passive: false },
);

fullscreenCanvas.addEventListener(
  "touchend",
  () => {
    resetClientLongPressContextMenuState();
    resetHostBlankLongPressContextMenuState();
  },
  { passive: false },
);

fullscreenCanvas.addEventListener(
  "touchcancel",
  () => {
    resetClientLongPressContextMenuState();
    resetHostBlankLongPressContextMenuState();
  },
  { passive: false },
);

document.addEventListener("click", (event) => {
  if (
    !cardContextMenuElement ||
    !cardContextMenuElement.classList.contains("active")
  ) {
    return;
  }

  if (!cardContextMenuElement.contains(event.target)) {
    closeCardContextMenu();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key == "Escape") {
    closeCardContextMenu();
  }
});
