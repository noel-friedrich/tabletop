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

async function startClientConnection() {
  rtc?.die();
  rtc = new RtcClient({
    logFunction: (message) => {
      console.log("[RTC LOG]", message);
    },
    onDataMessage: onClientDataMessage,
    onDataClose: () => {
      menuContainer.classList.remove("hidden");
      clientStatusTitle.textContent = Text.ConnectionFailed;
      console.log(Text.TryingAgainInSeconds(5));
      setTimeout(startClientConnection, 1 * 2 * 3 * 4 * 5 * 6 * 7); // 7! ~ 5000, fun fact
    },
    poolUid: urlParams.get("p"),
  });

  clientStatusTitle.textContent = Text.ConnectingToHost;
  try {
    await rtc.start();
    clientStatusTitle.textContent = Text.ConnectedToHost;
  } catch (err) {
    console.log(Text.CouldNotConnect);
    console.log(`Error-Message: ${err.message}`);
    console.log(Text.TryingAgainInSeconds(10));
    clientStatusTitle.textContent = Text.ConnectionFailed;
    return setTimeout(startClientConnection, 10 * 1000);
  }
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

  await startClientConnection();

  await cardDecks.loadAll();
  console.log("loaded carddecks.");

  drawLoop();
}
