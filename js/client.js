const localStorageDeviceIndexKey = "cards--device-index";

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
      deviceInfo.id = `client-${dataMessage.data.index}`;
      localStorage.setItem(localStorageDeviceIndexKey, deviceInfo.deviceIndex);
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
  if (clientStatusTitle) {
    clientStatusTitle.textContent = message;
  }
}

function updateClientUrlGameId(gameId) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("client", "");
  nextUrl.searchParams.set("p", gameId);
  window.history.replaceState({}, "", nextUrl);
}

async function startClientConnection() {
  if (!deviceInfo.gameId) {
    setClientStatus("Enter a game code to connect.");
    return;
  }

  rtc?.die();
  rtc = new RtcClient({
    logFunction: (message) => {
      console.log("[RTC LOG]", message);
    },
    onDataMessage: onClientDataMessage,
    onDataClose: () => {
      menuContainer.classList.remove("hidden");
      setClientStatus(Text.ConnectionFailed);
      console.log(Text.TryingAgainInSeconds(5));
      setTimeout(startClientConnection, 1 * 2 * 3 * 4 * 5 * 6 * 7); // 7! ~ 5000, fun fact
    },
    poolUid: deviceInfo.gameId,
  });

  setClientStatus(Text.ConnectingToHost);
  try {
    await rtc.start();
    setClientStatus(Text.ConnectedToHost);
  } catch (err) {
    console.log(Text.CouldNotConnect);
    console.log(`Error-Message: ${err.message}`);
    console.log(Text.TryingAgainInSeconds(10));
    setClientStatus(Text.ConnectionFailed);
    return setTimeout(startClientConnection, 10 * 1000);
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
  // device index is guaranteed to be >0, so we can safely do || instead of ?? to deal with NaN
  const savedDeviceIndex = parseInt(
    localStorage.getItem(localStorageDeviceIndexKey),
  );
  const restoredDeviceIndex = savedDeviceIndex || null;

  if (restoredDeviceIndex !== null) {
    deviceInfo.deviceIndex = restoredDeviceIndex;
    deviceInfo.id = `client-${restoredDeviceIndex}`;
  }

  initClientMenu(restoredDeviceIndex);
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
