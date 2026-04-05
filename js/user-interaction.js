const userInteractionInfo = {
  dragStart: null,
  selectedGameCard: null,
  dragNewPos: null,
  dragCardStartPos: null,
  dragCardStartPosByUid: new Map(),
  dragCurrScreenNormPos: null,
  lastDragSyncTime: 0,
  dragSyncIntervalMs: 60,
  selectedCardUids: new Set(),
  selectionBoxStart: null,
  selectionBoxEnd: null,
  isSelecting: false,
  lookDragActive: false,
  lookPreviewCardUid: null,
  lookPreviewImageKey: null,
};

let lookDragPreviewElement = null;

function shouldSyncDragUpdate(forceSync = false) {
  if (forceSync) {
    userInteractionInfo.lastDragSyncTime = Date.now();
    return true;
  }

  const now = Date.now();
  if (
    now - userInteractionInfo.lastDragSyncTime >=
    userInteractionInfo.dragSyncIntervalMs
  ) {
    userInteractionInfo.lastDragSyncTime = now;
    return true;
  }

  return false;
}

function makeCardMove(
  gameCard,
  originalPos,
  newPosition,
  { forceSync = false } = {},
) {
  if (deviceInfo.role == DeviceRole.Host) {
    gameCard.setOnlyNormalisedPos(newPosition);
    gameCard.setDesiredPos(newPosition);
    gameState.redraw();

    if (shouldSyncDragUpdate(forceSync)) {
      syncGamestateToClients();
    }
  } else if (deviceInfo.role == DeviceRole.Client) {
    const newId = isPrivateAreaVisualY(newPosition.y)
      ? deviceInfo.id
      : DeviceIdCatalogue.Board;
    const newLocalPos = GameDrawer.getLocalNormPos(newPosition);

    gameCard.deviceId = newId;
    gameCard.setOnlyNormalisedPos(newLocalPos);
    gameCard.setDesiredPos(newLocalPos);
    gameState.redraw();

    if (!shouldSyncDragUpdate(forceSync)) {
      return;
    }

    rtc.sendMessage(
      new DataMessage(dataMessageType.MOVE_CARD, {
        uid: gameCard.uid,
        to: newLocalPos.serialize(),
        deviceId: newId,
      }),
    );
  }
}

function getHostSelectedCards() {
  if (deviceInfo.role != DeviceRole.Host) {
    return [];
  }

  return gameState.gameCards
    .filter(
      (card) =>
        card.deviceId == DeviceIdCatalogue.Board &&
        userInteractionInfo.selectedCardUids.has(card.uid),
    )
    .sort((a, b) => a.layerIndex - b.layerIndex);
}

function setSelectedCardUids(cardUids = []) {
  const nextSelectedCardUids = new Set(cardUids);
  let didChange =
    nextSelectedCardUids.size != userInteractionInfo.selectedCardUids.size;

  if (!didChange) {
    for (const uid of nextSelectedCardUids) {
      if (!userInteractionInfo.selectedCardUids.has(uid)) {
        didChange = true;
        break;
      }
    }
  }

  userInteractionInfo.selectedCardUids = nextSelectedCardUids;

  if (didChange) {
    gameState.redraw();
  }
}

function clearSelectionBox() {
  userInteractionInfo.selectionBoxStart = null;
  userInteractionInfo.selectionBoxEnd = null;
  userInteractionInfo.isSelecting = false;
}

function raiseCardsToTop(cards) {
  const orderedCards = [...cards].sort((a, b) => a.layerIndex - b.layerIndex);
  const baseLayerIndex = gameState.maxLayerIndex + 1;

  for (let i = 0; i < orderedCards.length; i++) {
    orderedCards[i].layerIndex = baseLayerIndex + i;
  }
}

function makeHostSelectedCardsMove(moveDelta, { forceSync = false } = {}) {
  if (deviceInfo.role != DeviceRole.Host) {
    return;
  }

  let movedAny = false;
  for (const [uid, startPos] of userInteractionInfo.dragCardStartPosByUid) {
    const gameCard = gameState.getCardByUid(uid);
    if (!gameCard) {
      continue;
    }

    const newPos = startPos.add(moveDelta);
    gameCard.setOnlyNormalisedPos(newPos);
    gameCard.setDesiredPos(newPos);
    movedAny = true;

    if (
      userInteractionInfo.selectedGameCard &&
      userInteractionInfo.selectedGameCard.uid == uid
    ) {
      userInteractionInfo.dragNewPos = newPos;
    }
  }

  if (!movedAny) {
    return;
  }

  gameState.redraw();

  if (shouldSyncDragUpdate(forceSync)) {
    syncGamestateToClients();
  }
}

const normPosFromEvent = (event) => {
  const screenPos = Vector2d.fromEvent(event, fullscreenCanvas);
  return GameDrawer.screenPosToNormPos(fullscreenCanvas, screenPos);
};

function preventBrowserGestureWhileDragging(event) {
  const isTouchEvent = event.type.startsWith("touch");
  if (!isTouchEvent || !event.cancelable) {
    return;
  }

  if (
    userInteractionInfo.dragStart ||
    userInteractionInfo.isSelecting ||
    userInteractionInfo.lookDragActive ||
    userInteractionInfo.selectedGameCard
  ) {
    event.preventDefault();
  }
}

function getSelectionBoxRect() {
  if (
    !userInteractionInfo.selectionBoxStart ||
    !userInteractionInfo.selectionBoxEnd
  ) {
    return null;
  }

  const startScreenPos = GameDrawer.normPosToScreenPos(
    fullscreenCanvas,
    userInteractionInfo.selectionBoxStart,
  );
  const endScreenPos = GameDrawer.normPosToScreenPos(
    fullscreenCanvas,
    userInteractionInfo.selectionBoxEnd,
  );

  return {
    x: Math.min(startScreenPos.x, endScreenPos.x),
    y: Math.min(startScreenPos.y, endScreenPos.y),
    width: Math.abs(endScreenPos.x - startScreenPos.x),
    height: Math.abs(endScreenPos.y - startScreenPos.y),
  };
}

function rectsOverlap(rectA, rectB) {
  return (
    rectA.x < rectB.x + rectB.width &&
    rectA.x + rectA.width > rectB.x &&
    rectA.y < rectB.y + rectB.height &&
    rectA.y + rectA.height > rectB.y
  );
}

function updateSelectionFromBox() {
  if (deviceInfo.role != DeviceRole.Host) {
    return;
  }

  const selectionRect = getSelectionBoxRect();
  if (!selectionRect) {
    setSelectedCardUids([]);
    return;
  }

  const selectedCardUids = [];
  for (const gameCard of gameState.gameCards) {
    if (gameCard.deviceId != DeviceIdCatalogue.Board) {
      continue;
    }

    const cardRect = GameDrawer.getCardScreenRect(
      fullscreenCanvas,
      gameCard,
      null,
      true,
    );
    if (
      rectsOverlap(selectionRect, {
        x: cardRect.x,
        y: cardRect.y,
        width: cardRect.screenSize.x,
        height: cardRect.screenSize.y,
      })
    ) {
      selectedCardUids.push(gameCard.uid);
    }
  }

  setSelectedCardUids(selectedCardUids);
}

function getClosestVisibleCard(normPos) {
  let bestCard = null;
  let bestDistance = Infinity;

  for (const gameCard of gameState.gameCards) {
    const cardPos = GameDrawer.getCardPosition(fullscreenCanvas, gameCard);
    const cardSize = GameDrawer.getCardNormSize(fullscreenCanvas, gameCard);
    const halfSize = cardSize.scale(0.5);

    const isVisible =
      cardPos.x + halfSize.x >= 0 &&
      cardPos.x - halfSize.x <= 1 &&
      cardPos.y + halfSize.y >= 0 &&
      cardPos.y - halfSize.y <= 1;

    if (!isVisible) {
      continue;
    }

    const distance = cardPos.distance(normPos);
    if (
      distance < bestDistance ||
      (distance == bestDistance &&
        bestCard &&
        gameCard.layerIndex > bestCard.layerIndex)
    ) {
      bestDistance = distance;
      bestCard = gameCard;
    }
  }

  return bestCard;
}

function ensureLookDragPreviewElement() {
  if (lookDragPreviewElement) {
    return lookDragPreviewElement;
  }

  const img = document.createElement("img");
  img.style.position = "fixed";
  img.style.left = "0";
  img.style.top = "0";
  img.style.transform = "translate(-50%, -50%)";
  img.style.pointerEvents = "none";
  img.style.zIndex = "250";
  img.style.display = "none";
  img.style.width = "auto";
  img.style.height = `${Math.round(GameDrawer.imgHeightPx * 1.85)}px`;
  img.style.borderRadius = "0";
  img.style.boxShadow = "none";
  img.style.backgroundColor = "transparent";
  img.style.backdropFilter = "none";
  img.style.filter = "drop-shadow(0 0 24px rgba(0, 0, 0, 0.55))";
  document.body.appendChild(img);

  lookDragPreviewElement = img;
  return lookDragPreviewElement;
}

function setLookDragPreviewFromCard(gameCard, normPos) {
  const preview = ensureLookDragPreviewElement();

  if (!gameCard) {
    preview.style.display = "none";
    userInteractionInfo.lookPreviewCardUid = null;
    return;
  }

  const deck = cardDecks.getDeckByName(gameCard.deckName);
  if (!deck) {
    preview.style.display = "none";
    userInteractionInfo.lookPreviewCardUid = null;
    return;
  }

  const imageUrl = gameCard.faceUp
    ? deck.imageUrls[gameCard.deckCardIndex]
    : deck.backPreviewUrl ?? deck.backImageUrl;
  if (!imageUrl) {
    preview.style.display = "none";
    userInteractionInfo.lookPreviewCardUid = null;
    return;
  }

  if (userInteractionInfo.lookPreviewImageKey != imageUrl) {
    preview.src = imageUrl;
    userInteractionInfo.lookPreviewImageKey = imageUrl;
  }

  userInteractionInfo.lookPreviewCardUid = gameCard.uid;

  const cardImage = gameCard.faceUp
    ? deck.images[gameCard.deckCardIndex]
    : deck.backImage;
  const previewHeight = Math.round(GameDrawer.imgHeightPx * 1.85);
  const aspectRatio =
    cardImage && cardImage.height ? cardImage.width / cardImage.height : 0.72;
  const previewWidth = Math.round(previewHeight * aspectRatio);

  preview.style.height = `${previewHeight}px`;
  preview.style.width = `${previewWidth}px`;

  const screenPos = GameDrawer.normPosToScreenPos(fullscreenCanvas, normPos);
  const margin = 12;

  let previewX = Math.round(screenPos.x);
  let previewY = Math.round(screenPos.y - 12);

  const minX = margin + previewWidth / 2;
  const maxX = window.innerWidth - margin - previewWidth / 2;
  const minY = margin + previewHeight / 2;
  const maxY = window.innerHeight - margin - previewHeight / 2;

  previewX = Math.max(minX, Math.min(maxX, previewX));
  previewY = Math.max(minY, Math.min(maxY, previewY));

  preview.style.left = `${Math.round(previewX)}px`;
  preview.style.top = `${Math.round(previewY)}px`;
  preview.style.display = "block";
}

function clearLookDragPreview() {
  userInteractionInfo.lookPreviewCardUid = null;
  userInteractionInfo.lookPreviewImageKey = null;
  if (lookDragPreviewElement) {
    lookDragPreviewElement.style.display = "none";
  }
}

function cancelUserInteraction({ clearSelection = false } = {}) {
  clearSelectionBox();
  userInteractionInfo.dragStart = null;
  userInteractionInfo.dragNewPos = null;
  userInteractionInfo.dragCardStartPos = null;
  userInteractionInfo.dragCardStartPosByUid = new Map();
  userInteractionInfo.dragCurrScreenNormPos = null;
  userInteractionInfo.selectedGameCard = null;
  userInteractionInfo.lookDragActive = false;
  clearLookDragPreview();

  if (clearSelection) {
    setSelectedCardUids([]);
  }

  fullscreenCanvas.style.cursor = "default";
  gameState.redraw();
}

function mouseDown(event) {
  if (event.button === 2) {
    return;
  }

  if (typeof closeCardContextMenu === "function") {
    closeCardContextMenu();
  }

  preventBrowserGestureWhileDragging(event);

  if (event.type.startsWith("touch") && event.cancelable) {
    event.preventDefault();
  }

  const normPos = normPosFromEvent(event);
  userInteractionInfo.dragCurrScreenNormPos = normPos;
  const gameCard = GameDrawer.getCardAt(fullscreenCanvas, gameState, normPos);

  userInteractionInfo.dragStart = normPos;
  userInteractionInfo.dragNewPos = null;

  if (deviceInfo.role == DeviceRole.Host) {
    userInteractionInfo.lookDragActive = false;
    clearLookDragPreview();
    clearSelectionBox();

    if (gameCard) {
      const selectedCards = getHostSelectedCards();
      const shouldDragSelection =
        userInteractionInfo.selectedCardUids.has(gameCard.uid) &&
        selectedCards.length > 1;
      const draggedCards = shouldDragSelection ? selectedCards : [gameCard];

      setSelectedCardUids(draggedCards.map((card) => card.uid));
      userInteractionInfo.selectedGameCard = gameCard;
      userInteractionInfo.dragCardStartPos = GameDrawer.getCardPosition(
        fullscreenCanvas,
        gameCard,
      );
      userInteractionInfo.dragCardStartPosByUid = new Map(
        draggedCards.map((card) => [
          card.uid,
          GameDrawer.getCardPosition(fullscreenCanvas, card),
        ]),
      );
      userInteractionInfo.lastDragSyncTime = 0;

      raiseCardsToTop(draggedCards);
      fullscreenCanvas.style.cursor = "grabbing";
      gameState.redraw();
    } else {
      userInteractionInfo.selectedGameCard = null;
      userInteractionInfo.dragCardStartPos = null;
      userInteractionInfo.dragCardStartPosByUid = new Map();
      userInteractionInfo.selectionBoxStart = normPos;
      userInteractionInfo.selectionBoxEnd = normPos;
      userInteractionInfo.isSelecting = true;
      setSelectedCardUids([]);
      fullscreenCanvas.style.cursor = "crosshair";
      gameState.redraw();
    }

    return;
  }

  userInteractionInfo.lookDragActive = !gameCard;

  if (gameCard) {
    userInteractionInfo.selectedGameCard = gameCard;
    userInteractionInfo.dragCardStartPos = GameDrawer.getCardPosition(
      fullscreenCanvas,
      gameCard,
    );
    userInteractionInfo.lastDragSyncTime = 0;

    gameCard.layerIndex = gameState.maxLayerIndex + 1;
    fullscreenCanvas.style.cursor = "grabbing";
    gameState.redraw();
  } else {
    clearLookDragPreview();
    fullscreenCanvas.style.cursor = "zoom-in";
  }
}

function mouseMove(event) {
  preventBrowserGestureWhileDragging(event);

  const normPos = normPosFromEvent(event);
  userInteractionInfo.dragCurrScreenNormPos = normPos;

  if (deviceInfo.role == DeviceRole.Host && userInteractionInfo.isSelecting) {
    userInteractionInfo.selectionBoxEnd = normPos;
    updateSelectionFromBox();
    fullscreenCanvas.style.cursor = "crosshair";
    gameState.redraw();
  } else if (userInteractionInfo.dragStart && userInteractionInfo.selectedGameCard) {
    const moveDelta = normPos.sub(userInteractionInfo.dragStart);
    if (deviceInfo.role == DeviceRole.Host) {
      userInteractionInfo.dragNewPos =
        userInteractionInfo.dragCardStartPos.add(moveDelta);
      makeHostSelectedCardsMove(moveDelta);
    } else {
      const newPos = userInteractionInfo.dragCardStartPos.add(moveDelta);
      userInteractionInfo.dragNewPos = newPos;

      makeCardMove(
        userInteractionInfo.selectedGameCard,
        userInteractionInfo.dragCardStartPos,
        userInteractionInfo.dragNewPos,
      );
    }

    fullscreenCanvas.style.cursor = "grabbing";
  } else if (
    userInteractionInfo.dragStart &&
    userInteractionInfo.lookDragActive
  ) {
    const gameCard = getClosestVisibleCard(normPos);
    setLookDragPreviewFromCard(gameCard, normPos);
    fullscreenCanvas.style.cursor = gameCard ? "zoom-in" : "default";
  } else {
    const gameCard = GameDrawer.getCardAt(fullscreenCanvas, gameState, normPos);
    fullscreenCanvas.style.cursor = gameCard ? "grab" : "default";
  }
}

function mouseUp(event) {
  preventBrowserGestureWhileDragging(event);

  if (deviceInfo.role == DeviceRole.Host) {
    if (
      userInteractionInfo.dragStart &&
      userInteractionInfo.dragNewPos &&
      userInteractionInfo.selectedGameCard
    ) {
      const moveDelta = userInteractionInfo.dragNewPos.sub(
        userInteractionInfo.dragCardStartPos,
      );
      makeHostSelectedCardsMove(moveDelta, { forceSync: true });
    }
  } else if (
    userInteractionInfo.dragStart &&
    userInteractionInfo.dragNewPos &&
    userInteractionInfo.selectedGameCard
  ) {
    makeCardMove(
      userInteractionInfo.selectedGameCard,
      userInteractionInfo.dragCardStartPos,
      userInteractionInfo.dragNewPos,
      { forceSync: true },
    );
  }

  cancelUserInteraction();
}

fullscreenCanvas.style.touchAction = "none";
fullscreenCanvas.style.webkitUserSelect = "none";
fullscreenCanvas.style.userSelect = "none";

fullscreenCanvas.addEventListener("mousedown", mouseDown);
fullscreenCanvas.addEventListener("mousemove", mouseMove);
fullscreenCanvas.addEventListener("mouseup", mouseUp);

const nonPassiveTouchOptions = { passive: false };
fullscreenCanvas.addEventListener(
  "touchstart",
  mouseDown,
  nonPassiveTouchOptions,
);
fullscreenCanvas.addEventListener(
  "touchmove",
  mouseMove,
  nonPassiveTouchOptions,
);
fullscreenCanvas.addEventListener("touchend", mouseUp, nonPassiveTouchOptions);
fullscreenCanvas.addEventListener(
  "touchcancel",
  mouseUp,
  nonPassiveTouchOptions,
);
fullscreenCanvas.addEventListener("mouseleave", mouseUp);

window.addEventListener("keydown", (event) => {
  if (deviceInfo.role != DeviceRole.Host) {
    return;
  }

  if (event.key == "r") {
    const indeces = Array.from(
      { length: gameState.gameCards.length },
      (_, i) => i,
    );
    const randomWeights = indeces.map(Math.random);
    indeces.sort((a, b) => randomWeights[a] - randomWeights[b]);

    for (let i = 0; i < gameState.gameCards.length; i++) {
      const card = gameState.gameCards[i];
      const randomPos = Vector2d.random()
        .scale(0.8)
        .add(Vector2d.unit11.scale(0.1));
      card.setDesiredPos(randomPos);
      card.layerIndex = indeces[i];
    }

    gameState.redraw();
    syncGamestateToClients();
  }

  if (event.key == "o") {
    for (let i = 0; i < gameState.gameCards.length; i++) {
      const card = gameState.gameCards[i];
      card.setDesiredPos(
        Vector2d.unit10
          .scale((i - gameState.gameCards.length / 2) / 100)
          .add(Vector2d.unit11.scale(0.5)),
      );
    }
    gameState.redraw();
    syncGamestateToClients();
  }
});
