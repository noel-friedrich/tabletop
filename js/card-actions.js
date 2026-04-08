const clientHandActionHandlers = new Map();

const cardUiState = {
  highlightedCardUids: new Set(),
};

function registerClientHandAction(actionName, handler) {
  clientHandActionHandlers.set(actionName, handler);
}

function setHighlightedCardUids(uids = []) {
  cardUiState.highlightedCardUids = new Set(uids);
  gameState.redraw();
}

function clearHighlightedCardUids() {
  if (cardUiState.highlightedCardUids.size == 0) {
    return;
  }

  cardUiState.highlightedCardUids.clear();
  gameState.redraw();
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

function getPrivateCardsOrderedForLineLayout() {
  return gameState.gameCards
    .filter((card) => card.deviceId == deviceInfo.id)
    .sort((a, b) => {
      const aPos = getCardVisualPos(a);
      const bPos = getCardVisualPos(b);

      if (aPos.x != bPos.x) {
        return aPos.x - bPos.x;
      }

      if (aPos.y != bPos.y) {
        return aPos.y - bPos.y;
      }

      return a.layerIndex - b.layerIndex;
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

  const patches = [];
  for (let i = 0; i < privateCards.length; i++) {
    const card = privateCards[i];
    const targetVisualPos = targets[i];
    const newId = isPrivateAreaVisualY(targetVisualPos.y)
      ? deviceInfo.id
      : DeviceIdCatalogue.Board;
    const targetLocalPos = GameDrawer.getLocalNormPos(targetVisualPos);

    patches.push({
      uid: card.uid,
      to: targetLocalPos,
      deviceId: newId,
      layerIndex: gameState.maxLayerIndex + i + 1,
      faceUp: true,
    });
  }

  requestCardPatches(patches);
}

function takePileToPrivateArea(cards) {
  if (deviceInfo.role != DeviceRole.Client || !cards || cards.length == 0) {
    return;
  }

  const pileCards = [...cards].sort((a, b) => a.layerIndex - b.layerIndex);
  const pileCardUids = new Set(pileCards.map((card) => card.uid));
  const orderedPrivateCards = getPrivateCardsOrderedForLineLayout().filter(
    (card) => !pileCardUids.has(card.uid),
  );
  const combinedCards = [...orderedPrivateCards, ...pileCards];
  const targets = linePositionsForHand(combinedCards.length);

  const patches = combinedCards.map((card, index) => ({
    uid: card.uid,
    to: GameDrawer.getLocalNormPos(targets[index]),
    deviceId: deviceInfo.id,
    layerIndex: gameState.maxLayerIndex + index + 1,
    faceUp: true,
  }));

  requestCardPatches(patches);
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
      if (!connection?.alive || connection.getStatus?.().color == "red") {
        continue;
      }

      if (connection.deviceId) {
        ids.push(connection.deviceId);
      }
    }
  }

  if (ids.length == 0) {
    ids.push(DeviceIdCatalogue.Board);
  }

  return ids;
}

const hostDistributionAnimationState = {
  sequenceId: 0,
};

const hostDistributionAnimationStepMs = 110;
const hostDistributionRevealDelayMs = 450;

function waitMs(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function cancelHostDistributionAnimation() {
  hostDistributionAnimationState.sequenceId++;
}

function buildHostDistributionPatches(
  cardsToDeal,
  { oneEach = false, fullRoundsOnly = false } = {},
) {
  const targetDeviceIds = getHostDistributionDeviceIds();
  const selectedCards = [...cardsToDeal].sort((a, b) => b.layerIndex - a.layerIndex);

  let distributableCount = selectedCards.length;
  if (oneEach) {
    distributableCount = Math.min(selectedCards.length, targetDeviceIds.length);
  } else if (fullRoundsOnly) {
    distributableCount =
      Math.floor(selectedCards.length / targetDeviceIds.length) *
      targetDeviceIds.length;
  }

  const cardsForDistribution = selectedCards.slice(0, distributableCount);
  if (cardsForDistribution.length == 0) {
    return [];
  }

  const handsByDeviceId = new Map(
    targetDeviceIds.map((deviceId) => [deviceId, []]),
  );

  for (let i = 0; i < cardsForDistribution.length; i++) {
    const deviceId = targetDeviceIds[i % targetDeviceIds.length];
    handsByDeviceId.get(deviceId).push(cardsForDistribution[i]);
  }

  const patchesByCardUid = new Map();
  let layerIndex = gameState.maxLayerIndex + 1;
  for (const deviceId of targetDeviceIds) {
    const handCards = handsByDeviceId.get(deviceId);
    const targets = linePositionsForLocalCards(handCards.length, {
      startX: 0.16,
      endX: 0.84,
      y: 0.5,
    });

    for (let i = 0; i < handCards.length; i++) {
      const card = handCards[i];
      const shouldRevealInPrivateArea =
        deviceId != DeviceIdCatalogue.Board && !card.faceUp;

      patchesByCardUid.set(handCards[i].uid, {
        uid: card.uid,
        to: targets[i],
        deviceId,
        layerIndex,
        faceUp: shouldRevealInPrivateArea ? false : card.faceUp,
        revealFaceUp: shouldRevealInPrivateArea ? true : undefined,
      });
      layerIndex++;
    }
  }

  return cardsForDistribution.map((card) => patchesByCardUid.get(card.uid));
}

function getHostDistributionRevealPatches(patches) {
  return patches
    .filter((patch) => patch.revealFaceUp !== undefined)
    .map((patch) => ({
      uid: patch.uid,
      faceUp: patch.revealFaceUp,
    }));
}

async function animateHostDistributionPatches(
  patches,
  {
    stepMs = hostDistributionAnimationStepMs,
    revealDelayMs = hostDistributionRevealDelayMs,
  } = {},
) {
  const sequenceId = ++hostDistributionAnimationState.sequenceId;

  for (let i = 0; i < patches.length; i++) {
    if (sequenceId != hostDistributionAnimationState.sequenceId) {
      return;
    }

    requestCardPatches([patches[i]]);
    if (patches[i].revealFaceUp !== undefined) {
      window.setTimeout(() => {
        if (sequenceId != hostDistributionAnimationState.sequenceId) {
          return;
        }

        requestCardPatches([
          {
            uid: patches[i].uid,
            faceUp: patches[i].revealFaceUp,
          },
        ]);
      }, revealDelayMs);
    }

    if (i < patches.length - 1) {
      await waitMs(stepMs);
    }
  }
}

function serializeCardPatch(patch) {
  const serialized = { uid: patch.uid };

  if (patch.to !== undefined) {
    serialized.to =
      patch.to instanceof Vector2d ? patch.to.serialize() : patch.to;
  }

  if (patch.deviceId !== undefined) {
    serialized.deviceId = patch.deviceId;
  }

  if (patch.layerIndex !== undefined) {
    serialized.layerIndex = patch.layerIndex;
  }

  if (patch.faceUp !== undefined) {
    serialized.faceUp = patch.faceUp;
  }

  return serialized;
}

function applyCardPatchToState(card, patch) {
  if (patch.to !== undefined) {
    const newPos =
      patch.to instanceof Vector2d
        ? patch.to
        : Vector2d.fromSerialized(patch.to);
    card.setDesiredPos(newPos);
  }

  if (patch.deviceId !== undefined) {
    card.deviceId = patch.deviceId;
  }

  if (patch.layerIndex !== undefined) {
    card.layerIndex = patch.layerIndex;
  }

  if (patch.faceUp !== undefined) {
    card.faceUp = patch.faceUp;
  }
}

function applyCardPatchesLocally(cardPatches) {
  if (!cardPatches || cardPatches.length == 0) {
    return false;
  }

  let changedAny = false;
  for (const patch of cardPatches) {
    const gameCard = gameState.getCardByUid(patch.uid);
    if (!gameCard) {
      continue;
    }

    applyCardPatchToState(gameCard, patch);
    changedAny = true;
  }

  if (changedAny) {
    gameState.redraw();
  }

  return changedAny;
}

function requestCardPatches(cardPatches) {
  if (!cardPatches || cardPatches.length == 0) {
    return;
  }

  const serializedPatches = cardPatches.map(serializeCardPatch);
  applyCardPatchesLocally(serializedPatches);

  if (deviceInfo.role == DeviceRole.Host) {
    syncGamestateToClients();
    return;
  }

  rtc?.sendMessage(
    new DataMessage(dataMessageType.UPDATE_CARDS, {
      patches: serializedPatches,
    }),
  );
}

function removeCardsByUidLocally(cardUids) {
  if (!cardUids || cardUids.length == 0) {
    return false;
  }

  const removeSet = new Set(cardUids);
  const oldLength = gameState.gameCards.length;
  gameState.gameCards = gameState.gameCards.filter((card) => !removeSet.has(card.uid));

  if (oldLength != gameState.gameCards.length) {
    gameState.redraw();
    return true;
  }

  return false;
}

function requestRemoveCards(cardUids) {
  if (!cardUids || cardUids.length == 0) {
    return;
  }

  if (deviceInfo.role != DeviceRole.Host) {
    return;
  }

  removeCardsByUidLocally(cardUids);
  syncGamestateToClients();
}

function getCardVisualPos(card) {
  return GameDrawer.getCardPosition(fullscreenCanvas, card);
}

function cardRectsAreConnected(rectA, rectB) {
  const tolerancePx = 5;

  const horizontalGap = Math.max(
    rectA.x - (rectB.x + rectB.screenSize.x),
    rectB.x - (rectA.x + rectA.screenSize.x),
    0,
  );
  const verticalGap = Math.max(
    rectA.y - (rectB.y + rectB.screenSize.y),
    rectB.y - (rectA.y + rectA.screenSize.y),
    0,
  );

  return horizontalGap <= tolerancePx && verticalGap <= tolerancePx;
}

function getNearbyPileCards(anchorCard, { boardOnly = false } = {}) {
  if (!anchorCard || !fullscreenCanvas) {
    return [];
  }

  const candidateCards = gameState.gameCards.filter((card) => {
    if (boardOnly && card.deviceId != DeviceIdCatalogue.Board) {
      return false;
    }

    return card.deviceId == anchorCard.deviceId;
  });

  const rectByUid = new Map(
    candidateCards.map((card) => [
      card.uid,
      GameDrawer.getCardScreenRect(fullscreenCanvas, card, null, true),
    ]),
  );

  const pileCards = [];
  const queue = [anchorCard];
  const visited = new Set();

  while (queue.length > 0) {
    const currCard = queue.pop();
    if (!currCard || visited.has(currCard.uid)) {
      continue;
    }

    visited.add(currCard.uid);
    pileCards.push(currCard);

    const currRect = rectByUid.get(currCard.uid);
    if (!currRect) {
      continue;
    }

    for (const candidateCard of candidateCards) {
      if (visited.has(candidateCard.uid)) {
        continue;
      }

      const candidateRect = rectByUid.get(candidateCard.uid);
      if (!candidateRect) {
        continue;
      }

      if (cardRectsAreConnected(currRect, candidateRect)) {
        queue.push(candidateCard);
      }
    }
  }

  return pileCards.sort((a, b) => a.layerIndex - b.layerIndex);
}

function getAverageVisualPosition(cards) {
  if (!cards || cards.length == 0) {
    return new Vector2d(0.5, 0.5);
  }

  const sum = cards.reduce(
    (acc, card) => acc.add(getCardVisualPos(card)),
    Vector2d.zero,
  );
  return sum.scale(1 / cards.length);
}

function stackCards(
  cards,
  { faceUp = null, shuffle = true, anchorVisualPos = null, sortByDeck = false } = {},
) {
  if (!cards || cards.length == 0) {
    return;
  }

  const orderedCards = [...cards];
  if (sortByDeck) {
    orderedCards.sort((a, b) => {
      if (a.deckName != b.deckName) {
        return a.deckName.localeCompare(b.deckName);
      }
      if (a.deckCardIndex != b.deckCardIndex) {
        return a.deckCardIndex - b.deckCardIndex;
      }
      return a.layerIndex - b.layerIndex;
    });
  } else if (shuffle) {
    shuffleArrayInPlace(orderedCards);
  } else {
    orderedCards.sort((a, b) => a.layerIndex - b.layerIndex);
  }

  const stackVisualPos = anchorVisualPos ?? getAverageVisualPosition(cards);
  const stackLocalPos = GameDrawer.getLocalNormPos(stackVisualPos);
  const stackDeviceId =
    deviceInfo.role == DeviceRole.Client
      ? isPrivateAreaVisualY(stackVisualPos.y)
        ? deviceInfo.id
        : DeviceIdCatalogue.Board
      : cards[0].deviceId;

  const patches = orderedCards.map((card, index) => ({
    uid: card.uid,
    to: stackLocalPos.add(
      Vector2d.random().sub(Vector2d.unit11.scale(0.5)).scale(0.006),
    ),
    deviceId: stackDeviceId,
    layerIndex: gameState.maxLayerIndex + index + 1,
    faceUp: faceUp === null ? card.faceUp : faceUp,
  }));

  requestCardPatches(patches);
}

function toggleCardFaceUp(card) {
  if (!card) {
    return;
  }

  requestCardPatches([{ uid: card.uid, faceUp: !card.faceUp }]);
}

function togglePileFaceUp(cards) {
  if (!cards || cards.length == 0) {
    return;
  }

  const nextFaceUp = cards.some((card) => !card.faceUp);
  requestCardPatches(cards.map((card) => ({ uid: card.uid, faceUp: nextFaceUp })));
}

function stackNearbyPile(anchorCard) {
  const pileCards = getNearbyPileCards(anchorCard, { boardOnly: true });
  stackCards(pileCards, {
    faceUp: null,
    shuffle: false,
    anchorVisualPos: getCardVisualPos(anchorCard),
  });
}

function sortAndStackNearbyPile(anchorCard) {
  const pileCards = getNearbyPileCards(anchorCard, { boardOnly: true });
  stackCards(pileCards, {
    faceUp: null,
    shuffle: false,
    sortByDeck: true,
    anchorVisualPos: getCardVisualPos(anchorCard),
  });
}

function shuffleAndStackNearbyPile(anchorCard) {
  const pileCards = getNearbyPileCards(anchorCard, { boardOnly: true });
  stackCards(pileCards, {
    faceUp: false,
    shuffle: true,
    anchorVisualPos: getCardVisualPos(anchorCard),
  });
}

function hostDealCardsToHands(
  cardsToDeal,
  { oneEach = false, fullRoundsOnly = false, animate = false } = {},
) {
  if (deviceInfo.role != DeviceRole.Host || cardsToDeal.length == 0) {
    return;
  }

  const patches = buildHostDistributionPatches(cardsToDeal, {
    oneEach,
    fullRoundsOnly,
  });
  cancelHostDistributionAnimation();
  if (patches.length == 0) {
    return;
  }

  if (animate) {
    animateHostDistributionPatches(patches);
  } else {
    requestCardPatches(patches);
    const revealPatches = getHostDistributionRevealPatches(patches);
    if (revealPatches.length > 0) {
      window.setTimeout(() => {
        requestCardPatches(revealPatches);
      }, hostDistributionRevealDelayMs);
    }
  }
}

function hostDealOneCardPerPlayerFromPile(anchorCard) {
  const pileCards = getNearbyPileCards(anchorCard, { boardOnly: true });
  hostDealCardsToHands(pileCards, { oneEach: true, animate: true });
}

function hostDealPileEvenly(anchorCard) {
  const pileCards = getNearbyPileCards(anchorCard, { boardOnly: true });
  hostDealCardsToHands(pileCards, {
    oneEach: false,
    fullRoundsOnly: true,
    animate: true,
  });
}

function hostDistributeShuffledCards() {
  if (deviceInfo.role != DeviceRole.Host) {
    return;
  }

  const allCards = [...gameState.gameCards];
  shuffleArrayInPlace(allCards);
  cancelHostDistributionAnimation();
  hostDealCardsToHands(allCards, { oneEach: false });
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

  requestCardPatches(
    sortedCards.map((card, index) => ({
      uid: card.uid,
      to: targets[index],
      deviceId: DeviceIdCatalogue.Board,
      layerIndex: index,
      faceUp: true,
    })),
  );
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

  requestCardPatches(
    gameState.gameCards.map((card, i) => ({
      uid: card.uid,
      to: Vector2d.random().scale(0.8).add(Vector2d.unit11.scale(0.1)),
      deviceId: DeviceIdCatalogue.Board,
      layerIndex: indices[i],
    })),
  );
}

function hostAddDeck(
  deckName,
  { spawnPos = null, stacked = false, sortByDeck = true } = {},
) {
  if (deviceInfo.role != DeviceRole.Host) {
    return;
  }

  const deck = cardDecks.getDeckByName(deckName);
  if (!deck) {
    return;
  }

  const targetSpawnPos =
    spawnPos ??
    Vector2d.unit11
      .scale(0.5)
      .add(Vector2d.random().sub(Vector2d.unit11.scale(0.5)).scale(0.08));
  const addedCards = gameState.addDeck(deck, targetSpawnPos);

  if (stacked) {
    stackCards(addedCards, {
      faceUp: null,
      shuffle: false,
      sortByDeck,
      anchorVisualPos: targetSpawnPos,
    });
    return;
  }

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
    null,
    true,
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

function reclaimCardsForDisconnectedDevices(deviceIds) {
  if (deviceInfo.role != DeviceRole.Host || !deviceIds || deviceIds.length == 0) {
    return false;
  }

  let didChange = false;
  for (const deviceId of deviceIds) {
    const cards = gameState.gameCards.filter((card) => card.deviceId == deviceId);
    if (cards.length == 0) {
      continue;
    }

    stackCards(cards, {
      faceUp: false,
      shuffle: true,
      anchorVisualPos: getRandomBoardNormPos(),
    });
    didChange = true;
  }

  return didChange;
}
