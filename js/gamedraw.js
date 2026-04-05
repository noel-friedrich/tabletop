class GameDrawer {
  static imgHeightPx = 150;
  static cardRenderPadding = 0.05;
  static drawCount = null;
  static lastDrawTimestampMs = Date.now();
  static hostHiddenTargetNormPos = new Vector2d(0.5, -0.5);
  static hostHiddenTransitionPositionByUid = new Map();
  static privateOutlineMaskCache = new Map();
  static cardHitAlphaCache = new Map();
  static selectionOutlineColor = "#0000ff";
  static selectionFillColor = "rgba(0, 0, 255, 0.14)";

  static getLocalNormPos(pos) {
    if (deviceInfo.role == DeviceRole.Host) {
      return pos;
    } else if (deviceInfo.role == DeviceRole.Client) {
      const localDeviceId = isPrivateAreaVisualY(pos.y)
        ? deviceInfo.id
        : DeviceIdCatalogue.Board;
      return new Vector2d(
        pos.x,
        mapClientVisualYToLocalY(pos.y, localDeviceId),
      );
    }
  }

  static getCardAt(canvas, gameState, normPos) {
    const topFirstCards = [...gameState.gameCards].sort(
      (a, b) => b.layerIndex - a.layerIndex,
    );

    for (const gameCard of topFirstCards) {
      const deck = cardDecks.getDeckByName(gameCard.deckName);
      const img = deck.images[gameCard.deckCardIndex];
      const cardSize = new Vector2d(img.width / img.height, 1)
        .scale(this.imgHeightPx)
        .round()
        .div(this.getCanvasSize(canvas));
      const cardNormPos = GameDrawer.getCardPosition(canvas, gameCard);
      const topLeftPos = cardNormPos.sub(cardSize.scale(0.5));

      const isInsideBoundingBox =
        normPos.x >= topLeftPos.x &&
        normPos.y >= topLeftPos.y &&
        normPos.x <= topLeftPos.x + cardSize.x &&
        normPos.y <= topLeftPos.y + cardSize.y;

      if (!isInsideBoundingBox) {
        continue;
      }

      const relX = (normPos.x - topLeftPos.x) / cardSize.x;
      const relY = (normPos.y - topLeftPos.y) / cardSize.y;

      if (!this.isCardPixelOpaque(gameCard, relX, relY)) {
        continue;
      }

      return gameCard;
    }

    return null;
  }

  static getCardHitAlphaCache(gameCard) {
    const cacheKey = `${gameCard.deckName}:${gameCard.deckCardIndex}`;
    const cached = this.cardHitAlphaCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const deck = cardDecks.getDeckByName(gameCard.deckName);
    const img = deck.images[gameCard.deckCardIndex];

    let tempCanvas = null;
    if (typeof OffscreenCanvas !== "undefined") {
      tempCanvas = new OffscreenCanvas(img.width, img.height);
    } else {
      tempCanvas = document.createElement("canvas");
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
    }

    const tempContext = tempCanvas.getContext("2d");
    tempContext.clearRect(0, 0, img.width, img.height);
    tempContext.drawImage(img, 0, 0);

    const imageData = tempContext.getImageData(0, 0, img.width, img.height);
    const cacheEntry = {
      width: img.width,
      height: img.height,
      data: imageData.data,
    };

    this.cardHitAlphaCache.set(cacheKey, cacheEntry);
    return cacheEntry;
  }

  static isCardPixelOpaque(gameCard, relX, relY) {
    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) {
      return false;
    }

    if (!gameCard.faceUp) {
      return true;
    }

    const alphaCache = this.getCardHitAlphaCache(gameCard);

    const px = Math.max(
      0,
      Math.min(alphaCache.width - 1, Math.floor(relX * alphaCache.width)),
    );
    const py = Math.max(
      0,
      Math.min(alphaCache.height - 1, Math.floor(relY * alphaCache.height)),
    );

    const alphaIndex = (py * alphaCache.width + px) * 4 + 3;
    const alpha = alphaCache.data[alphaIndex];

    return alpha > 15;
  }

  static clearCanvas(canvas, context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  static resetCanvas(canvas, context) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    this.clearCanvas(canvas, context);
  }

  static screenPosToNormPos(canvas, screenPos) {
    return screenPos.div(this.getCanvasSize(canvas));
  }

  static getCanvasSize(canvas) {
    return new Vector2d(canvas.width, canvas.height);
  }

  static normPosToScreenPos(canvas, normPos) {
    return normPos.mul(this.getCanvasSize(canvas));
  }

  static drawImageWithScale(canvas, context, img, normPos, scale = 1) {
    const screenPos = this.normPosToScreenPos(canvas, normPos);
    const imgSize = new Vector2d(img.width / img.height, 1)
      .scale(this.imgHeightPx * scale)
      .round();

    context.drawImage(
      img,
      screenPos.x - imgSize.x / 2,
      screenPos.y - imgSize.y / 2,
      imgSize.x,
      imgSize.y,
    );
  }

  static drawImage(canvas, context, img, normPos) {
    this.drawImageWithScale(canvas, context, img, normPos, 1);
  }

  static getHostHiddenTransitionPos(gameCard) {
    let hiddenPos = this.hostHiddenTransitionPositionByUid.get(gameCard.uid);
    if (!hiddenPos) {
      hiddenPos = gameCard.normPosition.copy();
      this.hostHiddenTransitionPositionByUid.set(gameCard.uid, hiddenPos);
    }

    hiddenPos.ilerp(this.hostHiddenTargetNormPos, 0.2);
    return hiddenPos;
  }

  static getCardPosition(canvas, gameCard, normalized = true) {
    const normPos = gameCard.normPosition.copy();

    if (deviceInfo.role == DeviceRole.Client) {
      if (
        gameCard.deviceId == DeviceIdCatalogue.Board ||
        gameCard.deviceId == deviceInfo.id
      ) {
        normPos.y = mapClientLocalYToVisualY(normPos.y, gameCard.deviceId);
      } else {
        // don't draw cards that are home to other devides
        normPos.x = 0.5;
        normPos.y = -0.5;
      }
    } else if (deviceInfo.role == DeviceRole.Host) {
      if (gameCard.deviceId != DeviceIdCatalogue.Board) {
        normPos.set(this.getHostHiddenTransitionPos(gameCard));
      } else {
        this.hostHiddenTransitionPositionByUid.delete(gameCard.uid);
      }
    }

    if (normalized) {
      return normPos;
    } else {
      return this.normPosToScreenPos(canvas, normPos);
    }
  }

  static getCardNormSize(canvas, gameCard) {
    const deck = cardDecks.getDeckByName(gameCard.deckName);
    const img = deck.images[gameCard.deckCardIndex];
    return new Vector2d(img.width / img.height, 1)
      .scale(this.imgHeightPx)
      .round()
      .div(this.getCanvasSize(canvas));
  }

  static getPrivateOutlineMask(gameCard) {
    const cacheKey = `${gameCard.deckName}:${gameCard.deckCardIndex}`;
    const cachedMask = this.privateOutlineMaskCache.get(cacheKey);
    if (cachedMask) {
      return cachedMask;
    }

    const deck = cardDecks.getDeckByName(gameCard.deckName);
    const img = deck.images[gameCard.deckCardIndex];

    let maskCanvas = null;
    if (typeof OffscreenCanvas !== "undefined") {
      maskCanvas = new OffscreenCanvas(img.width, img.height);
    } else {
      maskCanvas = document.createElement("canvas");
      maskCanvas.width = img.width;
      maskCanvas.height = img.height;
    }

    const maskContext = maskCanvas.getContext("2d");
    maskContext.clearRect(0, 0, img.width, img.height);
    maskContext.drawImage(img, 0, 0);
    maskContext.globalCompositeOperation = "source-in";
    maskContext.fillStyle = "rgba(0, 0, 0, 1)";
    maskContext.fillRect(0, 0, img.width, img.height);
    maskContext.globalCompositeOperation = "source-over";

    this.privateOutlineMaskCache.set(cacheKey, maskCanvas);
    return maskCanvas;
  }

  static drawPrivateCardOutline(canvas, context, gameCard) {
    const position = this.getCardPosition(canvas, gameCard);
    this.drawCardOutline(canvas, context, gameCard, position, {
      color: "rgba(0, 0, 0, 0.72)",
      lineWidth: 4,
    });
  }

  static drawRoundedRectPath(context, x, y, width, height, radius) {
    const limitedRadius = Math.min(radius, width / 2, height / 2);

    context.beginPath();
    context.moveTo(x + limitedRadius, y);
    context.lineTo(x + width - limitedRadius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + limitedRadius);
    context.lineTo(x + width, y + height - limitedRadius);
    context.quadraticCurveTo(
      x + width,
      y + height,
      x + width - limitedRadius,
      y + height,
    );
    context.lineTo(x + limitedRadius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - limitedRadius);
    context.lineTo(x, y + limitedRadius);
    context.quadraticCurveTo(x, y, x + limitedRadius, y);
    context.closePath();
  }

  static getCardScreenRect(canvas, gameCard, position = null, trimPadding = false) {
    const cardPosition = position ?? this.getCardPosition(canvas, gameCard);
    const normSize = this.getCardNormSize(canvas, gameCard);
    const screenPos = this.normPosToScreenPos(canvas, cardPosition);
    let screenSize = normSize.mul(this.getCanvasSize(canvas));

    if (trimPadding) {
      screenSize = screenSize.scale(1 - this.cardRenderPadding * 2);
    }

    return {
      screenPos,
      screenSize,
      x: screenPos.x - screenSize.x / 2,
      y: screenPos.y - screenSize.y / 2,
    };
  }

  static drawCardOutline(
    canvas,
    context,
    gameCard,
    position = null,
    { color = "#000", lineWidth = 3 } = {},
  ) {
    const { x, y, screenSize } = this.getCardScreenRect(
      canvas,
      gameCard,
      position,
      true,
    );

    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    this.drawRoundedRectPath(context, x, y, screenSize.x, screenSize.y, 10);
    context.stroke();
    context.restore();
  }

  static getCardBackBitmap(gameCard) {
    const deck = cardDecks.getDeckByName(gameCard.deckName);
    return deck.backImage ?? deck.images[gameCard.deckCardIndex];
  }

  static drawCardBack(canvas, context, gameCard, position) {
    const backImage = this.getCardBackBitmap(gameCard);
    this.drawImage(canvas, context, backImage, position);
  }

  static drawGameCard(canvas, context, gameCard) {
    const deck = cardDecks.getDeckByName(gameCard.deckName);
    const img = deck.images[gameCard.deckCardIndex];
    const position = this.getCardPosition(canvas, gameCard);
    if (gameCard.faceUp) {
      this.drawImage(canvas, context, img, position);
    } else {
      this.drawCardBack(canvas, context, gameCard, position);
    }
  }

  static getLookDragPreviewCard(canvas, gameState) {
    if (typeof userInteractionInfo === "undefined") {
      return null;
    }

    if (
      !userInteractionInfo.dragStart ||
      userInteractionInfo.selectedGameCard
    ) {
      return null;
    }

    const hoverNormPos = userInteractionInfo.dragCurrScreenNormPos;
    if (!hoverNormPos) {
      return null;
    }

    return this.getCardAt(canvas, gameState, hoverNormPos);
  }

  static drawLookDragPreview(canvas, context, gameState) {
    return false;
  }

  static drawBackground(canvas, context) {
    if (deviceInfo.role == DeviceRole.Client) {
      // draw bottom third private card holder
      context.fillStyle = "rgba(0, 0, 0, 0.3)";
      context.fillRect(
        0,
        canvas.height * ClientAreaLayout.splitY,
        canvas.width,
        canvas.height * (1 - ClientAreaLayout.splitY),
      );
    }
  }

  static drawHighlightedPileBackdrop(canvas, context, gameState) {
    if (typeof cardUiState !== "undefined") {
      for (const gameCard of gameState.gameCards) {
        if (!cardUiState.highlightedCardUids.has(gameCard.uid)) {
          continue;
        }

        this.drawCardOutline(canvas, context, gameCard, null, {
          color: this.selectionOutlineColor,
          lineWidth: 5,
        });
      }
    }
  }

  static drawHighlightedSelectedCardBackdrop(canvas, context, gameState) {
    if (typeof userInteractionInfo === "undefined") {
      return new Set();
    }

    const highlightedCardUids = new Set(userInteractionInfo.selectedCardUids ?? []);
    if (userInteractionInfo.selectedGameCard) {
      highlightedCardUids.add(userInteractionInfo.selectedGameCard.uid);
    }

    if (highlightedCardUids.size == 0) {
      return highlightedCardUids;
    }

    for (const gameCard of gameState.gameCards) {
      if (!highlightedCardUids.has(gameCard.uid)) {
        continue;
      }

      this.drawCardOutline(canvas, context, gameCard, null, {
        color: this.selectionOutlineColor,
        lineWidth: 5,
      });
    }

    return highlightedCardUids;
  }

  static drawSelectionBox(canvas, context) {
    if (
      deviceInfo.role != DeviceRole.Host ||
      typeof userInteractionInfo === "undefined" ||
      !userInteractionInfo.isSelecting ||
      !userInteractionInfo.selectionBoxStart ||
      !userInteractionInfo.selectionBoxEnd
    ) {
      return;
    }

    const startPos = this.normPosToScreenPos(
      canvas,
      userInteractionInfo.selectionBoxStart,
    );
    const endPos = this.normPosToScreenPos(
      canvas,
      userInteractionInfo.selectionBoxEnd,
    );
    const x = Math.min(startPos.x, endPos.x);
    const y = Math.min(startPos.y, endPos.y);
    const width = Math.abs(endPos.x - startPos.x);
    const height = Math.abs(endPos.y - startPos.y);

    context.save();
    context.fillStyle = this.selectionFillColor;
    context.strokeStyle = this.selectionOutlineColor;
    context.lineWidth = 2;
    context.fillRect(x, y, width, height);
    context.strokeRect(x, y, width, height);
    context.restore();
  }

  static drawGameState(canvas, context, gameState) {
    if (gameState.drawCount === this.drawCount) {
      return;
    }

    this.resetCanvas(canvas, context);
    this.drawBackground(canvas, context);
    this.lastDrawTimestampMs = Date.now();

    // order is not relevant otherwise, so we can use index as a layer index
    gameState.gameCards.sort((a, b) => a.layerIndex - b.layerIndex);

    this.drawHighlightedPileBackdrop(canvas, context, gameState);
    const selectedCardUids = new Set(
      typeof userInteractionInfo === "undefined"
        ? []
        : [
            ...(userInteractionInfo.selectedCardUids ?? []),
            ...(userInteractionInfo.selectedGameCard
              ? [userInteractionInfo.selectedGameCard.uid]
              : []),
          ],
    );

    if (deviceInfo.role == DeviceRole.Client) {
      const regularCards = [];
      const privateCards = [];
      const selectedRegularCards = [];
      const selectedPrivateCards = [];

      for (const gameCard of gameState.gameCards) {
        const isSelected = selectedCardUids.has(gameCard.uid);
        if (gameCard.deviceId == deviceInfo.id) {
          (isSelected ? selectedPrivateCards : privateCards).push(gameCard);
        } else {
          (isSelected ? selectedRegularCards : regularCards).push(gameCard);
        }
      }

      for (const gameCard of regularCards) {
        this.drawGameCard(canvas, context, gameCard);
      }

      for (const gameCard of privateCards) {
        this.drawPrivateCardOutline(canvas, context, gameCard);
      }

      for (const gameCard of privateCards) {
        this.drawGameCard(canvas, context, gameCard);
      }

      this.drawHighlightedSelectedCardBackdrop(canvas, context, gameState);

      for (const gameCard of selectedRegularCards) {
        this.drawGameCard(canvas, context, gameCard);
      }

      for (const gameCard of selectedPrivateCards) {
        this.drawPrivateCardOutline(canvas, context, gameCard);
      }

      for (const gameCard of selectedPrivateCards) {
        this.drawGameCard(canvas, context, gameCard);
      }
    } else {
      const regularCards = [];
      const selectedCards = [];

      for (const gameCard of gameState.gameCards) {
        (selectedCardUids.has(gameCard.uid) ? selectedCards : regularCards).push(
          gameCard,
        );
      }

      for (const gameCard of regularCards) {
        this.drawGameCard(canvas, context, gameCard);
      }

      this.drawHighlightedSelectedCardBackdrop(canvas, context, gameState);

      for (const gameCard of selectedCards) {
        this.drawGameCard(canvas, context, gameCard);
      }
    }

    this.drawSelectionBox(canvas, context);

    const hasLookPreview = this.drawLookDragPreview(canvas, context, gameState);

    let madeMove = false;
    for (const gameCard of gameState.gameCards) {
      if (gameCard.moveTowardsDesiredPos()) {
        madeMove = true;
      }

      if (
        deviceInfo.role == DeviceRole.Host &&
        gameCard.deviceId != DeviceIdCatalogue.Board
      ) {
        const hiddenPos = this.hostHiddenTransitionPositionByUid.get(
          gameCard.uid,
        );
        if (
          hiddenPos &&
          hiddenPos.distance(this.hostHiddenTargetNormPos) > 0.001
        ) {
          madeMove = true;
        }
      }
    }

    if (hasLookPreview) {
      madeMove = true;
    }

    this.drawCount = gameState.drawCount;

    if (madeMove) {
      // we need to draw another time, yikes
      this.drawCount--;
    }
  }
}

function drawLoop() {
  GameDrawer.drawGameState(fullscreenCanvas, fullscreenContext, gameState);
  window.requestAnimationFrame(drawLoop);
}

setInterval(() => {
  if (Date.now() - GameDrawer.lastDrawTimestampMs > 1000) {
    gameState.redraw();
  }
}, 1000);

window.addEventListener("resize", () => {
  gameState.redraw();
});
