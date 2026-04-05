const userInteractionInfo = {
  dragStart: null,
  selectedGameCardCopy: null,
  selectedGameCard: null,
  dragNewPos: null,
  dragCardStartPos: null,
  dragCurrScreenNormPos: null,
  lastDragSyncTime: 0,
  dragSyncIntervalMs: 60,
  lookDragActive: false,
  lookPreviewCardUid: null,
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
    userInteractionInfo.lookDragActive ||
    userInteractionInfo.selectedGameCard
  ) {
    event.preventDefault();
  }
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
  img.style.borderRadius = "0.7rem";
  img.style.boxShadow = "0 0 24px rgba(0, 0, 0, 0.55)";
  img.style.backgroundColor = "rgba(255, 255, 255, 0.03)";
  img.style.backdropFilter = "blur(1px)";
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

  const imageUrl = deck.imageUrls[gameCard.deckCardIndex];
  if (!imageUrl) {
    preview.style.display = "none";
    userInteractionInfo.lookPreviewCardUid = null;
    return;
  }

  if (userInteractionInfo.lookPreviewCardUid != gameCard.uid) {
    preview.src = imageUrl;
    userInteractionInfo.lookPreviewCardUid = gameCard.uid;
  }

  const cardImage = deck.images[gameCard.deckCardIndex];
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
  if (lookDragPreviewElement) {
    lookDragPreviewElement.style.display = "none";
  }
}

function mouseDown(event) {
  preventBrowserGestureWhileDragging(event);

  if (event.type.startsWith("touch") && event.cancelable) {
    event.preventDefault();
  }

  const normPos = normPosFromEvent(event);
  const gameCard = GameDrawer.getCardAt(fullscreenCanvas, gameState, normPos);

  userInteractionInfo.dragStart = normPos;
  userInteractionInfo.lookDragActive = !gameCard;

  if (gameCard) {
    userInteractionInfo.selectedGameCard = gameCard;
    userInteractionInfo.selectedGameCardCopy = gameCard.copy();
    userInteractionInfo.dragCardStartPos = GameDrawer.getCardPosition(
      fullscreenCanvas,
      gameCard,
    );
    userInteractionInfo.lastDragSyncTime = 0;

    gameCard.layerIndex = gameState.maxLayerIndex + 1;
    fullscreenCanvas.style.cursor = "grabbing";
  } else {
    clearLookDragPreview();
    fullscreenCanvas.style.cursor = "zoom-in";
  }
}

function mouseMove(event) {
  preventBrowserGestureWhileDragging(event);

  const normPos = normPosFromEvent(event);

  if (userInteractionInfo.dragStart && userInteractionInfo.selectedGameCard) {
    const moveDelta = normPos.sub(userInteractionInfo.dragStart);
    const newPos = userInteractionInfo.dragCardStartPos.add(moveDelta);
    userInteractionInfo.dragNewPos = newPos;

    makeCardMove(
      userInteractionInfo.selectedGameCard,
      userInteractionInfo.dragCardStartPos,
      userInteractionInfo.dragNewPos,
    );

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

  if (
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

  userInteractionInfo.dragStart = null;
  userInteractionInfo.dragNewPos = null;
  userInteractionInfo.dragCardStartPos = null;
  userInteractionInfo.selectedGameCard = null;
  userInteractionInfo.selectedGameCardCopy = null;
  userInteractionInfo.lookDragActive = false;
  clearLookDragPreview();
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
