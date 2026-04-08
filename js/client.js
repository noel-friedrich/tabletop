const localStorageDeviceIndexKey = "cards--device-index";
const clientReconnectDelayMs = 1 * 2 * 3 * 4 * 5 * 6 * 7;
const clientReconnectRetrySeconds = 5;
const clientStatusRefreshPeriodMs = 1000;
const clientConnectionLogLimit = 3;

const clientUiState = {
  statusOverrideMessage: null,
  reconnectTimeoutId: null,
  statusRefreshIntervalId: null,
  connectionLogMessages: [],
  connectionLogElement: null,
};

function getClientConnectionLogElement() {
  if (clientUiState.connectionLogElement) {
    return clientUiState.connectionLogElement;
  }

  if (!clientStatusTitle) {
    return null;
  }

  const logElement = document.createElement("div");
  logElement.className = "client-status-log";
  clientStatusTitle.after(logElement);
  clientUiState.connectionLogElement = logElement;
  return logElement;
}

function renderClientConnectionLog() {
  const logElement = getClientConnectionLogElement();
  if (!logElement) {
    return;
  }

  const lastMessages = clientUiState.connectionLogMessages
    .slice(-clientConnectionLogLimit);

  logElement.replaceChildren(
    ...lastMessages.map((message) => {
      const entry = document.createElement("div");
      entry.className = "client-status-log-entry";
      entry.textContent = message;
      return entry;
    }),
  );
}

function addClientConnectionLog(message) {
  const normalizedMessage = `${message ?? ""}`.trim();
  if (!normalizedMessage) {
    return;
  }

  clientUiState.connectionLogMessages.push(normalizedMessage);
  if (clientUiState.connectionLogMessages.length > clientConnectionLogLimit) {
    clientUiState.connectionLogMessages = clientUiState.connectionLogMessages.slice(
      -clientConnectionLogLimit,
    );
  }

  renderClientConnectionLog();
}

function getClientAutoStatusMessage() {
  if (!rtc) {
    return "";
  }

  if (!rtc.alive) {
    return Text.ConnectionFailed;
  }

  const status = rtc.getStatus?.();
  if (!status) {
    return "";
  }

  if (status.color == "red") {
    return Text.ConnectionFailed;
  }

  if (status.color == "blue" || !rtc.dataChannelOpen) {
    return Text.ConnectingToHost;
  }

  return Text.ConnectedToHost;
}

function hasActiveClientConnection() {
  if (!rtc || !rtc.alive || !rtc.dataChannelOpen) {
    return false;
  }

  const status = rtc.getStatus?.();
  return status?.color != "red";
}

function shouldForceClientMenuOpen() {
  return (
    deviceInfo.role == DeviceRole.Client &&
    menuContainer &&
    !hasActiveClientConnection()
  );
}

function syncClientMenuVisibility() {
  if (!menuContainer || deviceInfo.role != DeviceRole.Client) {
    return;
  }

  const shouldForceOpen = shouldForceClientMenuOpen();
  menuContainer.classList.toggle("connection-required", shouldForceOpen);
  if (shouldForceOpen) {
    menuContainer.classList.remove("hidden");
  }
}

function syncGamestateToHost() {
  const message = new DataMessage(
    dataMessageType.GAMESTATE,
    gameState.toJSON(),
  );
  rtc.sendMessage(message);
}

function onClientDataMessage(dataMessage) {
  if (dataMessage.type == dataMessageType.PING) {
    // send ping back and get deviceindex from ping
    if (deviceInfo.deviceIndex != dataMessage.data.index) {
      deviceInfo.deviceIndex = parseInt(dataMessage.data.index);
      localStorage.setItem(localStorageDeviceIndexKey, deviceInfo.deviceIndex);
      updateClientDeviceIndicator();
      gameState.redraw();
    }

    rtc.sendMessage(DataMessage.Ping());
  } else if (dataMessage.type == dataMessageType.GAMESTATE) {
    // let's not disturb the dragging user. he'll be angry!
    if (userInteractionInfo.dragStart) {
      return;
    }

    const prevGameState = gameState.copy();
    gameState = GameState.fromJSON(dataMessage.data);
    recoverCardPositionsFromOldGameState(prevGameState);

    gameState.redraw();
  } else {
    console.log("unknown message type", dataMessage.type);
  }
}

function setClientStatus(message) {
  clientUiState.statusOverrideMessage = message ?? null;
  renderClientStatus();
}

function clearClientStatusOverride() {
  clientUiState.statusOverrideMessage = null;
  renderClientStatus();
}

function renderClientStatus() {
  if (!clientStatusTitle) {
    return;
  }

  const nextMessage =
    clientUiState.statusOverrideMessage ?? getClientAutoStatusMessage();
  clientStatusTitle.textContent = nextMessage;
  updateClientDeviceIndicator();
  syncClientMenuVisibility();
}

function clearClientReconnectTimeout() {
  if (clientUiState.reconnectTimeoutId === null) {
    return;
  }

  clearTimeout(clientUiState.reconnectTimeoutId);
  clientUiState.reconnectTimeoutId = null;
}

function getClientJoinRejectionMessage(errorMessage = "") {
  if (errorMessage == "join-not-allowed") {
    return Text.JoinRejectedNeedsHostMenu;
  }

  if (errorMessage == "slot-unavailable") {
    return Text.JoinRejectedSlotUnavailable;
  }

  return null;
}

function scheduleClientReconnect(delayMs) {
  clearClientReconnectTimeout();
  clientUiState.reconnectTimeoutId = window.setTimeout(() => {
    clientUiState.reconnectTimeoutId = null;
    startClientConnection();
  }, delayMs);
}

function handleClientJoinRejection(
  clientRtc,
  rejectionMessage,
  { retryDelayMs = 10 * 1000, retrySeconds = 10 } = {},
) {
  if (!clientRtc || clientRtc.connectionLossHandled) {
    return;
  }

  clientRtc.connectionLossHandled = true;
  clientRtc.die();

  menuContainer.classList.remove("hidden");
  setClientStatus(rejectionMessage);
  addClientConnectionLog(rejectionMessage);
  addClientConnectionLog(Text.TryingAgainInSeconds(retrySeconds));
  scheduleClientReconnect(retryDelayMs);
}

function handleClientConnectionLoss(
  clientRtc,
  { retryDelayMs = clientReconnectDelayMs, retrySeconds = clientReconnectRetrySeconds } = {},
) {
  if (!clientRtc || clientRtc.connectionLossHandled) {
    return;
  }

  clientRtc.connectionLossHandled = true;
  clientRtc.die();

  menuContainer.classList.remove("hidden");
  setClientStatus(Text.ConnectionFailed);
  addClientConnectionLog(Text.TryingAgainInSeconds(retrySeconds));
  console.log(Text.TryingAgainInSeconds(retrySeconds));
  scheduleClientReconnect(retryDelayMs);
}

function refreshClientConnectionHealth() {
  if (!rtc) {
    return renderClientStatus();
  }

  const status = rtc.getStatus?.();
  if (rtc.alive && status?.color == "red") {
    handleClientConnectionLoss(rtc);
    return;
  }

  renderClientStatus();
}

function startClientStatusRefreshLoop() {
  if (clientUiState.statusRefreshIntervalId !== null) {
    return;
  }

  clientUiState.statusRefreshIntervalId = window.setInterval(
    refreshClientConnectionHealth,
    clientStatusRefreshPeriodMs,
  );
  refreshClientConnectionHealth();
}

function updateClientUrlGameId(gameId) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("client", "");
  nextUrl.searchParams.set("p", gameId);
  window.history.replaceState({}, "", nextUrl);
}

async function startClientConnection() {
  if (!deviceInfo.gameId) {
    clearClientReconnectTimeout();
    setClientStatus("Enter a game code to connect.");
    return;
  }

  clearClientReconnectTimeout();
  rtc?.die();
  const clientRtc = new RtcClient({
    logFunction: (message) => {
      console.log("[RTC LOG]", message);
      addClientConnectionLog(message);
    },
    onDataMessage: onClientDataMessage,
    onDataClose: () => {
      handleClientConnectionLoss(clientRtc);
    },
    poolUid: deviceInfo.gameId,
  });
  rtc = clientRtc;

  setClientStatus(Text.ConnectingToHost);
  try {
    await clientRtc.start({
      deviceId: deviceInfo.id,
    });
    clearClientStatusOverride();
  } catch (err) {
    console.log(Text.CouldNotConnect);
    console.log(`Error-Message: ${err.message}`);
    const rejectionMessage = getClientJoinRejectionMessage(err.message);
    if (rejectionMessage) {
      handleClientJoinRejection(clientRtc, rejectionMessage);
      return;
    }

    handleClientConnectionLoss(clientRtc, {
      retryDelayMs: 10 * 1000,
      retrySeconds: 10,
    });
  }
}

function joinClientWithGameId(gameId) {
  const normalizedGameId = `${gameId ?? ""}`.trim();
  if (!normalizedGameId) {
    return;
  }

  writeLocalStorageValue(localStorageGameIdKey, normalizedGameId);
  deviceInfo.gameId = normalizedGameId;
  updateClientUrlGameId(normalizedGameId);
  startClientConnection();
}

async function mainClient() {
  initClientMenu();
  getClientConnectionLogElement();
  renderClientConnectionLog();
  startClientStatusRefreshLoop();
  gameState.redraw();

  await cardDecks.loadAll();
  refreshCardSizePreviewImages();
  console.log("loaded carddecks.");

  drawLoop();

  if (deviceInfo.gameId) {
    await startClientConnection();
  } else {
    setClientStatus("Enter a game code to connect.");
  }
}
