const urlParams = new URLSearchParams(window.location.search);

const DeviceRole = {
  Host: "host",
  Client: "client",
};

const DeviceIdCatalogue = { Board: "board" };

const deviceInfo = {
  id: urlParams.has("client") ? "unnamed-device" : DeviceIdCatalogue.Board,
  role: urlParams.has("client") ? DeviceRole.Client : DeviceRole.Host,
  gameId: urlParams.get("p") || null,
};

const ClientAreaLayout = {
  splitY: 1 / 2,
};

function generateRandomUid() {
  return Math.random().toString().slice(2);
}

function isPrivateAreaVisualY(visualY) {
  return visualY > ClientAreaLayout.splitY;
}

function mapClientLocalYToVisualY(localY, deviceId) {
  const splitY = ClientAreaLayout.splitY;

  if (deviceId == DeviceIdCatalogue.Board) {
    return localY * splitY;
  } else if (deviceId == deviceInfo.id) {
    return splitY + localY * (1 - splitY);
  } else {
    return -0.5;
  }
}

function mapClientVisualYToLocalY(visualY, deviceId) {
  const splitY = ClientAreaLayout.splitY;

  if (deviceId == DeviceIdCatalogue.Board) {
    return visualY / splitY;
  } else if (deviceId == deviceInfo.id) {
    return (visualY - splitY) / (1 - splitY);
  } else {
    return -0.5;
  }
}

function getVisualNormPosForDevicePerspective(card, localNormPos) {
  const normPos = localNormPos.copy();

  if (deviceInfo.role == DeviceRole.Client) {
    if (
      card.deviceId == DeviceIdCatalogue.Board ||
      card.deviceId == deviceInfo.id
    ) {
      normPos.y = mapClientLocalYToVisualY(normPos.y, card.deviceId);
    } else {
      normPos.x = 0.5;
      normPos.y = -0.5;
    }
  } else if (deviceInfo.role == DeviceRole.Host) {
    if (card.deviceId != DeviceIdCatalogue.Board) {
      normPos.x = 0.5;
      normPos.y = -0.5;
    }
  }

  return normPos;
}

function getLocalNormPosFromVisualForDevice(deviceId, visualNormPos) {
  if (deviceInfo.role != DeviceRole.Client) {
    return visualNormPos.copy();
  }

  if (deviceId == DeviceIdCatalogue.Board || deviceId == deviceInfo.id) {
    return new Vector2d(
      visualNormPos.x,
      mapClientVisualYToLocalY(visualNormPos.y, deviceId),
    );
  } else {
    return new Vector2d(0.5, -0.5);
  }
}

function recoverCardPositionsFromOldGameState(oldGameState) {
  const gameCardUidMap = new Map();
  for (const card of gameState.gameCards) {
    gameCardUidMap.set(card.uid, card);
  }

  for (const oldCard of oldGameState.gameCards) {
    const newCard = gameCardUidMap.get(oldCard.uid);
    if (!newCard) {
      continue;
    }

    if (
      deviceInfo.role == DeviceRole.Client &&
      oldCard.deviceId != newCard.deviceId
    ) {
      const oldVisualNormPos = getVisualNormPosForDevicePerspective(
        oldCard,
        oldCard.normPosition,
      );
      const remappedLocalPos = getLocalNormPosFromVisualForDevice(
        newCard.deviceId,
        oldVisualNormPos,
      );
      newCard.normPosition.set(remappedLocalPos);
    } else {
      newCard.normPosition.set(oldCard.normPosition);
    }
  }
}

class GameCard extends Serializable {
  constructor(
    normPosition,
    desiredPosition,
    deckName,
    deckCardIndex,
    layerIndex,
    deviceId,
    uid,
    faceUp,
  ) {
    super();
    this.normPosition = normPosition ?? Vector2d.zero;
    this.desiredPosition = desiredPosition ?? this.normPosition.copy();
    this.deckName = deckName;
    this.deckCardIndex = deckCardIndex;
    this.layerIndex = layerIndex ?? 0;
    this.deviceId = deviceId ?? deviceInfo.id;
    this.uid = uid ?? generateRandomUid();
    this.faceUp = faceUp ?? true;
  }

  serialize() {
    return [
      this.normPosition.serialize(),
      this.desiredPosition.serialize(),
      this.deckName,
      this.deckCardIndex,
      this.layerIndex,
      this.deviceId,
      this.uid,
      this.faceUp,
    ];
  }

  static fromSerialized(serialized) {
    return new GameCard(
      Vector2d.fromSerialized(serialized[0]),
      Vector2d.fromSerialized(serialized[1]),
      serialized[2],
      serialized[3],
      serialized[4],
      serialized[5],
      serialized[6],
      serialized[7],
    );
  }

  setPos(newPos) {
    this.normPosition.x = Math.max(0, Math.min(1, newPos.x));
    this.normPosition.y = Math.max(0, Math.min(1, newPos.y));
    this.setDesiredPos(newPos);
  }

  setOnlyNormalisedPos(newPos) {
    this.normPosition.x = Math.max(0, Math.min(1, newPos.x));
    this.normPosition.y = Math.max(0, Math.min(1, newPos.y));
  }

  setDesiredPos(newPos) {
    this.desiredPosition.x = Math.max(0, Math.min(1, newPos.x));
    this.desiredPosition.y = Math.max(0, Math.min(1, newPos.y));
  }

  moveTowardsDesiredPos() {
    // returns whether we made a visual update or not (true / false)

    const distance = this.normPosition.distance(this.desiredPosition);
    if (distance > 0.001) {
      this.normPosition.ilerp(this.desiredPosition, 0.1);
      return true;
    } else {
      this.normPosition.set(this.desiredPosition);
      return false;
    }
  }
}

class GameState extends Serializable {
  constructor(gameCards, drawCount) {
    super();
    this.gameCards = gameCards ?? [];
    this.drawCount = drawCount ?? -1;
  }

  getCardByUid(uid) {
    return this.gameCards.find((c) => c.uid == uid);
  }

  serialize() {
    return {
      g: this.gameCards.map((c) => c.serialize()),
      c: this.drawCount,
    };
  }

  static fromSerialized(serialized) {
    return new GameState(
      serialized.g.map((g) => GameCard.fromSerialized(g)),
      serialized.c,
    );
  }

  addDeck(cardDeck, spawnPos = new Vector2d(0.5, 0.5)) {
    const addedCards = [];
    for (let i = 0; i < cardDeck.size; i++) {
      const offset = Vector2d.unit10.scale((i - cardDeck.size / 2) / 100);
      const gameCard = new GameCard(
        spawnPos.add(offset),
        null,
        cardDeck.name,
        i,
        i,
        deviceInfo.id,
      );
      this.gameCards.push(gameCard);
      addedCards.push(gameCard);
    }
    return addedCards;
  }

  redraw() {
    this.drawCount++;
  }

  get maxLayerIndex() {
    if (this.gameCards.length == 0) {
      return -1;
    }

    return Math.max(...this.gameCards.map((c) => c.layerIndex));
  }
}

let gameState = new GameState();
