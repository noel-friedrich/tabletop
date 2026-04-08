function onHostDataMessage(dataMessage, rtcConnection) {
  if (dataMessage.type == dataMessageType.PING) {
    rtcConnection.receivePing(dataMessage);
  } else if (dataMessage.type == dataMessageType.GAMESTATE) {
    const prevGameState = gameState.copy();
    gameState = GameState.fromJSON(dataMessage.data);
    recoverCardPositionsFromOldGameState(prevGameState);

    gameState.redraw();
  } else if (dataMessage.type == dataMessageType.MOVE_CARD) {
    const cardUid = dataMessage.data.uid;
    const newPos = Vector2d.fromSerialized(dataMessage.data.to);
    const newDeviceId = dataMessage.data.deviceId;

    const gameCard = gameState.getCardByUid(cardUid);
    if (!gameCard) {
      return; // ignore, it's likely an old card that was already removed.
    }

    gameCard.setDesiredPos(newPos);
    gameCard.deviceId = newDeviceId;
    gameCard.layerIndex = gameState.maxLayerIndex + 1;

    gameState.redraw();
    syncGamestateToClients();
  } else if (dataMessage.type == dataMessageType.UPDATE_CARDS) {
    if (applyCardPatchesLocally(dataMessage.data.patches)) {
      syncGamestateToClients();
    }
  } else if (dataMessage.type == dataMessageType.REMOVE_CARDS) {
    if (removeCardsByUidLocally(dataMessage.data.uids)) {
      syncGamestateToClients();
    }
  } else {
    console.log("unknown data message type", dataMessage.type);
  }
}

function syncGamestateToClients(rtcs) {
  rtcs ??= rtc.connections;
  for (const rtc of rtcs) {
    if (!rtc?.alive) {
      continue;
    }

    const message = new DataMessage(
      dataMessageType.GAMESTATE,
      gameState.toJSON(),
    );
    rtc.sendMessage(message);
  }
}

const hostReconnectState = {
  menuWasOpen: true,
  lockedSlotIndexByDeviceId: new Map(),
  needsLockedRosterCleanup: false,
};

const idleClosedMenuJoinPollingPeriodMs = 10 * 1000;

function isHostConnectionActive(connection) {
  if (!connection?.alive) {
    return false;
  }

  const status = connection.getStatus?.();
  return status?.color != "red";
}

function getActiveHostConnections() {
  return (rtc?.connections ?? []).filter(isHostConnectionActive);
}

function getActiveHostConnectionDeviceIds() {
  const activeDeviceIds = new Set();

  for (const connection of getActiveHostConnections()) {
    if (connection.deviceId) {
      activeDeviceIds.add(connection.deviceId);
    }
  }

  return activeDeviceIds;
}

function captureLockedHostRoster(connections = getActiveHostConnections()) {
  hostReconnectState.lockedSlotIndexByDeviceId = new Map(
    connections
      .filter((connection) => connection.deviceId)
      .map((connection) => [connection.deviceId, connection.index]),
  );
}

function getMissingLockedHostDeviceIds(
  activeDeviceIds = getActiveHostConnectionDeviceIds(),
) {
  const missingDeviceIds = [];

  for (const [deviceId] of hostReconnectState.lockedSlotIndexByDeviceId) {
    if (!activeDeviceIds.has(deviceId)) {
      missingDeviceIds.push(deviceId);
    }
  }

  return missingDeviceIds;
}

function pushHostConnectionIndicesToClients(connections = rtc?.connections ?? []) {
  for (const connection of connections) {
    if (!isHostConnectionActive(connection)) {
      continue;
    }

    connection.sendMessage(DataMessage.Ping({ index: connection.index }));
  }
}

function normalizeHostConnections() {
  if (!rtc?.connections) {
    return false;
  }

  const activeConnections = getActiveHostConnections();
  let didChange = activeConnections.length != rtc.connections.filter(Boolean).length;

  for (let i = 0; i < activeConnections.length; i++) {
    const connection = activeConnections[i];
    const newIndex = i + 1;
    if (connection.index == newIndex) {
      continue;
    }

    connection.index = newIndex;
    didChange = true;
  }

  if (!didChange) {
    return false;
  }

  rtc.connections = activeConnections;
  pushHostConnectionIndicesToClients(activeConnections);

  gameState.redraw();
  return true;
}

function syncHostReconnectTracking() {
  const menuIsOpen = !menuContainer.classList.contains("hidden");
  const activeConnections = getActiveHostConnections();
  const activeDeviceIds = getActiveHostConnectionDeviceIds();
  if (menuIsOpen) {
    if (!hostReconnectState.menuWasOpen) {
      hostReconnectState.needsLockedRosterCleanup = true;
    }
  } else if (hostReconnectState.menuWasOpen) {
    captureLockedHostRoster(activeConnections);
    hostReconnectState.needsLockedRosterCleanup = false;
  }

  hostReconnectState.menuWasOpen = menuIsOpen;
  return {
    menuIsOpen,
    activeConnections,
    activeDeviceIds,
    needsLockedRosterCleanup: hostReconnectState.needsLockedRosterCleanup,
  };
}

function hasPendingHostReconnects(activeDeviceIds = getActiveHostConnectionDeviceIds()) {
  return getMissingLockedHostDeviceIds(activeDeviceIds).length > 0;
}

function hasLockedHostRoster() {
  return hostReconnectState.lockedSlotIndexByDeviceId.size > 0;
}

function shouldAllowHostJoinRequest(joinInfo) {
  const { menuIsOpen } = syncHostReconnectTracking();
  if (menuIsOpen) {
    return true;
  }

  if (!joinInfo?.deviceId) {
    return false;
  }

  return hostReconnectState.lockedSlotIndexByDeviceId.has(joinInfo.deviceId);
}

function resolveHostJoinDeviceIndex(joinInfo) {
  if (!joinInfo?.deviceId) {
    return null;
  }

  const activeConnection = getActiveHostConnections().find(
    (connection) => connection.deviceId == joinInfo.deviceId,
  );
  if (activeConnection) {
    return activeConnection.index;
  }

  if (!menuContainer.classList.contains("hidden")) {
    return null;
  }

  const slotIndex =
    hostReconnectState.lockedSlotIndexByDeviceId.get(joinInfo.deviceId);
  return Number.isInteger(slotIndex) ? slotIndex : null;
}

function shouldAllowHostPollingCalls() {
  const { menuIsOpen, activeDeviceIds } = syncHostReconnectTracking();
  return menuIsOpen || hasPendingHostReconnects(activeDeviceIds) || hasLockedHostRoster();
}

function getHostJoinPollingPeriodMs() {
  const { menuIsOpen, activeDeviceIds } = syncHostReconnectTracking();
  if (menuIsOpen || hasPendingHostReconnects(activeDeviceIds)) {
    return RtcHostManager.checkForJoinsPeriod;
  }

  if (hasLockedHostRoster()) {
    return idleClosedMenuJoinPollingPeriodMs;
  }

  return RtcHostManager.checkForJoinsPeriod;
}

async function mainHost() {
  initHostMenu();

  await cardDecks.loadAll();
  refreshCardSizePreviewImages();
  console.log("loaded carddecks.");

  const skat = cardDecks.getDeckByName("skat");
  gameState.addDeck(skat);

  drawLoop();

  // init webrtc connections
  rtc = new RtcHostManager({
    logFunction: (message) => {
      console.log("[RTC LOG]", message);
    },
    onClientUrlAvailable: async (clientUrl) => {
      if (new URLSearchParams(location.search).has("debug")) {
        console.log("QR CODE URL", clientUrl);

        const debugUrl = clientUrl.replace(
          "https://noel-friedrich.de/cards",
          "http://localhost:8000",
        );
        console.log("QR CODE URL DEBUG", debugUrl);

        qrImg.addEventListener("click", () => {
          window.open(debugUrl, "_blank");
        });
      }

      qrImg.innerHTML = ""; // clear current qr code
      new QRCode(qrImg, clientUrl);
      gameIdOutput.textContent = rtc.poolUid;
      deviceInfo.gameId = rtc.poolUid;
    },
    onDataMessage: onHostDataMessage,
    allowConnectionOverride: () => true,
    allowNewConnections: () => !menuContainer.classList.contains("hidden"),
    allowPollingCalls: shouldAllowHostPollingCalls,
    shouldAcceptJoinRequest: shouldAllowHostJoinRequest,
    resolveJoinDeviceIndex: resolveHostJoinDeviceIndex,
    getJoinPollingPeriodMs: getHostJoinPollingPeriodMs,
    // allowPollingCalls: () => false // disallow polling for testing
  });

  rtc.start();

  setInterval(() => {
    const lostConnections = rtc.removeLostConnections();
    const { menuIsOpen, activeDeviceIds, needsLockedRosterCleanup } =
      syncHostReconnectTracking();

    if (menuIsOpen) {
      const deviceIdsToReclaim = new Set(
        lostConnections.map((connection) => connection.deviceId).filter(Boolean),
      );

      if (needsLockedRosterCleanup) {
        for (const deviceId of getMissingLockedHostDeviceIds(activeDeviceIds)) {
          deviceIdsToReclaim.add(deviceId);
        }

        hostReconnectState.lockedSlotIndexByDeviceId = new Map();
        hostReconnectState.needsLockedRosterCleanup = false;
      }

      reclaimCardsForDisconnectedDevices([...deviceIdsToReclaim]);
      normalizeHostConnections();
    }

    updateRtcConnectionsTable();
    syncGamestateToClients();
  }, 1000);
}
