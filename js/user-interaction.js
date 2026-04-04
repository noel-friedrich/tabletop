const userInteractionInfo = {
  dragStart: null,
  selectedGameCardCopy: null,
  selectedGameCard: null,
  dragNewPos: null,
  dragCardStartPos: null,
  dragCurrScreenNormPos: null,
};

function makeCardMove(gameCard, originalPos, newPosition) {
  if (deviceInfo.role == DeviceRole.Host) {
    gameCard.setDesiredPos(newPosition);
    gameState.redraw();

    syncGamestateToClients();
  } else if (deviceInfo.role == DeviceRole.Client) {
    const newId =
      newPosition.y > 2 / 3 ? deviceInfo.id : DeviceIdCatalogue.Board;
    const newLocalPos = GameDrawer.getLocalNormPos(newPosition);

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

function mouseDown(event) {
  const normPos = normPosFromEvent(event);
  const gameCard = GameDrawer.getCardAt(fullscreenCanvas, gameState, normPos);

  userInteractionInfo.dragStart = normPos;

  if (gameCard) {
    userInteractionInfo.selectedGameCard = gameCard;
    userInteractionInfo.selectedGameCardCopy = gameCard.copy();
    userInteractionInfo.dragCardStartPos = GameDrawer.getCardPosition(
      fullscreenCanvas,
      gameCard,
    );

    gameCard.layerIndex = gameState.maxLayerIndex + 1;
    fullscreenCanvas.style.cursor = "grabbing";
  }
}

function mouseMove(event) {
  const normPos = normPosFromEvent(event);

  if (userInteractionInfo.dragStart && userInteractionInfo.selectedGameCard) {
    const moveDelta = normPos.sub(userInteractionInfo.dragStart);
    const cardNormPos = GameDrawer.getCardPosition(
      fullscreenCanvas,
      userInteractionInfo.selectedGameCard,
    );
    const newPos = cardNormPos.add(moveDelta);
    userInteractionInfo.dragNewPos = newPos;

    fullscreenCanvas.style.cursor = "grabbing";
  } else {
    const gameCard = GameDrawer.getCardAt(fullscreenCanvas, gameState, normPos);

    fullscreenCanvas.style.cursor = gameCard ? "grab" : "default";
  }
}

function mouseUp(event) {
  if (
    userInteractionInfo.dragStart &&
    userInteractionInfo.dragNewPos &&
    userInteractionInfo.selectedGameCard
  ) {
    makeCardMove(
      userInteractionInfo.selectedGameCard,
      userInteractionInfo.dragCardStartPos,
      userInteractionInfo.dragNewPos,
    );
  }

  userInteractionInfo.dragStart = null;
  userInteractionInfo.selectedGameCard = null;
  userInteractionInfo.selectedGameCardCopy = null;
}

fullscreenCanvas.addEventListener("mousedown", mouseDown);
fullscreenCanvas.addEventListener("mousemove", mouseMove);
fullscreenCanvas.addEventListener("mouseup", mouseUp);

fullscreenCanvas.addEventListener("touchstart", mouseDown);
fullscreenCanvas.addEventListener("touchmove", mouseMove);
fullscreenCanvas.addEventListener("touchend", mouseUp);

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
