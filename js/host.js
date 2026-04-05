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
  } else {
    console.log("unknown data message type", dataMessage.type);
  }
}

function syncGamestateToClients(rtcs) {
  rtcs ??= rtc.connections;
  for (const rtc of rtcs) {
    const message = new DataMessage(
      dataMessageType.GAMESTATE,
      gameState.toJSON(),
    );
    rtc.sendMessage(message);
  }
}

async function mainHost() {
  initHostMenu();

  await cardDecks.loadAll();
  console.log("loaded carddecks.");

  const currDeck = cardDecks.getDeckByName("skat");
  gameState.addDeck(currDeck);

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
    allowNewConnections: () => true,
    allowPollingCalls: () => !menuContainer.classList.contains("hidden"),
    // allowPollingCalls: () => false // disallow polling for testing
  });

  rtc.start();

  setInterval(() => {
    rtc.removeLostConnections();
    updateRtcConnectionsTable();
    syncGamestateToClients();
  }, 1000);
}
