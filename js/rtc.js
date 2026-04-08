const dataMessageType = {
  PING: "ping",
  GAMESTATE: "gamestate",
  MOVE_CARD: "cardmove",
  UPDATE_CARDS: "cardsupdate",
  REMOVE_CARDS: "cardsremove",
};

class Serializable {
  serialize() {
    return {};
  }

  static fromSerialized(serialized) {
    return new Serializable();
  }

  toJSON() {
    return JSON.stringify(this.serialize());
  }

  static fromJSON(jsonString) {
    return this.fromSerialized(JSON.parse(jsonString));
  }

  copy() {
    return this.constructor.fromSerialized(this.serialize());
  }
}

class DataMessage {
  constructor(type, data, createTime, receivedTime, hostTime) {
    this.type = type;
    this.data = data ?? {};
    this.createTime = createTime ?? Date.now();

    this.hostTime = hostTime ?? null;
    this.receivedTime = receivedTime ?? null;
  }

  toString() {
    return JSON.stringify({
      type: this.type,
      data: this.data,
      createTime: this.createTime,
      receivedTime: this.receivedTime,
      hostTime: this.hostTime,
    });
  }

  static fromObject(obj) {
    return new DataMessage(
      obj.type,
      obj.data,
      obj.createTime,
      obj.receivedTime,
      obj.hostTime,
    );
  }

  static fromString(jsonString) {
    return DataMessage.fromObject(JSON.parse(jsonString));
  }

  static Ping(data = {}) {
    return new DataMessage(dataMessageType.PING, data);
  }
}

const rtcDataType = {
  openPool: "open_pool",
  joinPool: "join_pool",
  JoinRejected: "join_rejected",
  Offer: "offer",
  Answer: "answer",
  HostCandidate: "host-candidate",
  AnswerCandidate: "answer-candidate",
};

// this api key has to be public anyways. this jumbling is just to prevent naive
// scanning bots to send me ridiculus emails every so often threatening something
// (this is just for funsies, please don't care.)

function getNotSoSecretMeteredApiKey() {
  let str = "fa94c40a3450effec69e410ae8d2b6e";
  const isPrime = (n) => {
    if (n < 2) return false;
    if (n === 2) return true;
    if (n % 2 === 0) return false;
    for (let i = 3; i <= Math.sqrt(n); i += 2) {
      if (n % i === 0) return false;
    }
    return true;
  };

  let count = 0;
  for (let i = 0; true; i++) {
    if (isPrime(i)) {
      count++;
      if (count == 5425) {
        str += i.toString();
        break;
      }
    }
  }

  return str.split("").reverse().join("");
}

const notSoSecretMeteredApiKey = getNotSoSecretMeteredApiKey();

class RtcBase {
  // ms between pings to host to make sure that connection
  // is still active. Used by both host & clients
  static pingPeriod = 3000;

  closePoolApi = "https://www.noel-friedrich.de/multigolf2/api/close_pool.php";
  getSignalsApi =
    "https://www.noel-friedrich.de/multigolf2/api/get_signals.php";
  sendSignalApi =
    "https://www.noel-friedrich.de/multigolf2/api/send_signal.php";
  getIceServersApi =
    "https://multigolf2.metered.live/api/v1/turn/credentials?apiKey=" +
    notSoSecretMeteredApiKey;

  static checkForSignalsInterval = 1000;
  static clientTimeoutPeriod = 20 * 1000;
  static hostTimeoutPeriod = 10 * 1000;

  initDatachannelListeners() {
    this.dataChannel.onopen = (e) => {
      if (!this.alive) return;
      this.logFunction(Text.ConnectionEstablished);
      this.dataChannelOpen = true;
    };

    this.dataChannel.onmessage = (e) => {
      if (!this.alive) return;
      const message = DataMessage.fromString(e.data);
      if (message.receivedTime === null) {
        message.receivedTime = Date.now();
      }

      this.lastDataMessage = message;
      this.lastDataMessageTime = Date.now();
      this.onDataMessage(message);
    };

    this.dataChannel.onclose = (e) => {
      if (!this.alive) return;
      this.logFunction(Text.ConnectionDied);
      this.dataChannelOpen = false;
      this.die();
      this.onDataClose();
    };
  }

  async init() {
    if (this.hasInitted) {
      return;
    }

    if (new URLSearchParams(location.search).has("debug")) {
      this.logFunction(Text.InitializingPeerToPeer);
    }
    this.hasInitted = true;

    const response = await fetch(this.getIceServersApi);
    const iceServers = await response.json();

    if (new URLSearchParams(location.search).has("debug")) {
      console.log("[DEBUG] received ice servers from api", iceServers);
    }

    iceServers.push({ urls: "stun:stun.l.google.com:19302" });
    iceServers.push(
      ...[
        { urls: "stun:freeturn.net:5349" },
        {
          urls: "turns:freeturn.tel:5349",
          username: "free",
          credential: "free",
        },
      ],
    );

    this.peerConnection = new RTCPeerConnection({ iceServers: iceServers });

    this.dataChannel = this.peerConnection.createDataChannel("chat", {
      negotiated: true,
      id: 0,
    });

    this.initDatachannelListeners();
  }

  constructor({
    logFunction = () => {},
    onDataMessage = () => {},
    onDataClose = () => {},
    index = -1,
    poolUid = null,
  } = {}) {
    this.logFunction = logFunction;
    this.onDataMessage = onDataMessage;
    this.onDataClose = onDataClose;

    this.processedSignalIds = new Set();
    this.dataChannelOpen = false;
    this.signalingUid = null;
    this.hasInitted = false;
    this.lastDataMessage = null;
    this.lastDataMessageTime = null;
    this.alive = true;

    this.index = index;
    this.poolUid = poolUid;

    if (!poolUid) {
      throw new Error("PoolUid must be given to WebRTC Handler");
    }
  }

  die() {
    this.alive = false;
  }

  sendMessage(message) {
    if (!this.alive) return;

    if (message instanceof DataMessage) {
      if (this.delayMs !== undefined) {
        message.hostTime = Date.now() + this.delayMs;
      }

      message = message.toString();
    }

    if (this.dataChannelOpen) {
      this.dataChannel.send(message);
      return true;
    } else {
      return false;
    }
  }

  async uploadToServer(type, data, objectName, logSuccess = true) {
    try {
      let apiUrl = this.sendSignalApi;
      apiUrl += `?type=${encodeURIComponent(type)}`;
      apiUrl += `&pool_uid=${encodeURIComponent(this.poolUid)}`;
      apiUrl += `&uid=${encodeURIComponent(this.signalingUid)}`;
      apiUrl += `&data=${encodeURIComponent(JSON.stringify(data))}`;
      const response = await fetch(apiUrl);
      const textResponse = await response.text();

      if (textResponse == "worked like a charm") {
        if (logSuccess) {
          this.logFunction(Text.SuccessfullySentObject(objectName));
        }
        return true;
      } else {
        throw new Error(`Unknown Server Response: ${textResponse}`);
      }
    } catch (err) {
      this.logFunction(Text.FailedSendingObject(objectName, err.message));
      throw err;
    }
  }

  async getFromServer(type, uid) {
    try {
      let apiUrl = this.getSignalsApi;
      apiUrl += `?pool_uid=${encodeURIComponent(this.poolUid)}`;
      const response = await fetch(apiUrl);
      let rows = await response.json();

      rows = rows.filter((r) => !this.processedSignalIds.has(r.id));

      if (type !== undefined) {
        rows = rows.filter((r) => r.type == type);
      }

      if (uid !== undefined) {
        rows = rows.filter((r) => r.uid == uid);
      }

      for (let row of rows) {
        row.data = JSON.parse(row.data);
        this.processedSignalIds.add(row.id);
      }

      return rows;
    } catch (err) {
      this.logFunction(Text.CouldntFetchServer(err.message));
      throw err;
    }
  }

  async waitUntil(func, name, { timeout = 60000, checkIntervalMs = 100 } = {}) {
    const startWaitTime = Date.now();
    while (true) {
      const timeElapsed = Date.now() - startWaitTime;
      if (timeElapsed > timeout) {
        this.die();
        throw new Error(`Timeout while waiting for ${name}`);
      }

      if (!this.alive) {
        throw new Error(`Connection died while waiting for ${name}`);
      }

      if (func()) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
    }
  }

  async checkForUpdates(
    untilFunc,
    handleUpdate,
    objectName,
    {
      checkInterval = RtcBase.checkForSignalsInterval,
      timeoutPeriod = RtcBase.hostTimeoutPeriod,
    },
  ) {
    const startTime = Date.now();
    while (!untilFunc()) {
      if (!this.alive) {
        throw new Error(
          this.rejectionReason ?? `Connection died while waiting for ${objectName}`,
        );
      }

      const updates = await this.getFromServer(undefined, this.signalingUid);

      if (!this.alive) {
        throw new Error(
          this.rejectionReason ?? `Connection died while waiting for ${objectName}`,
        );
      }

      for (let update of updates) {
        await handleUpdate(update);
      }

      if (!this.alive) {
        throw new Error(
          this.rejectionReason ?? `Connection died while waiting for ${objectName}`,
        );
      }

      const timeElapsed = Date.now() - startTime;
      if (timeElapsed > timeoutPeriod) {
        this.die();
        throw new Error(`Timeout while waiting for ${objectName}`);
      }

      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }
  }

  generateSignalingUid() {
    return Math.random().toString().slice(2);
  }
}

class RtcHost extends RtcBase {
  getStatus() {
    let color = "green";
    let message = Text.GoodConnection;

    if (!this.lastDataMessageTime) {
      color = "blue";
      message = Text.ConnectionBeingInitialized;
    } else if (Date.now() - this.lastDataMessageTime > RtcBase.pingPeriod * 2) {
      color = "red";
      message = Text.ConnectionTimedOut;
    }

    if (this.lastDataMessage && color == "green") {
      // phone clocks are very out of sync
      if (this.delayMs > 500) {
        color = "orange";
        message = Text.ConnectionIsSlow(Math.round(this.delayMs * 2));
      }
    }

    return { color, message };
  }

  receivePing(pingMessage) {
    // return true when a change has been made so that
    // potential GUI changes can be made

    this.receivedPing = pingMessage;

    if (pingMessage.data.displaySize) {
      const before = this.clientDisplaySize
        ? this.clientDisplaySize.copy()
        : null;
      this.clientDisplaySize = Vector2d.fromObject(
        pingMessage.data.displaySize,
      );
      if (
        !before ||
        before.x != this.clientDisplaySize.x ||
        before.y != this.clientDisplaySize.y
      ) {
        return true;
      }
    }

    return false;
  }

  async startPinging() {
    while (true) {
      const pingStartTime = Date.now();
      this.sendMessage(DataMessage.Ping({ index: this.index }));

      this.receivedPing = null;
      await this.waitUntil(() => this.receivedPing, "Pinging");

      const timeElapsed = this.receivedPing.receivedTime - pingStartTime;

      // the time between host and client (pingTime) is approximated as
      // time delay between back and forth ping halved

      // using a complementary filter to make the delayMs converge on
      // something steady instead of making it jump around a lot
      this.delayMs = (timeElapsed / 2) * 0.1 + this.delayMs * 0.9;

      await new Promise((resolve) => setTimeout(resolve, RtcBase.pingPeriod));
    }
  }

  async start(signalingUid) {
    this.delayMs = 0;
    this.signalingUid = signalingUid;
    this.clientDisplaySize = null;

    await this.init();

    this.peerConnection.addEventListener("icecandidateerror", (event) => {
      if (!this.alive) return;
      if (new URLSearchParams(location.search).has("debug")) {
        console.log(`[DEBUG] ICE candidate error: ${event.errorText}`);
      }
    });

    this.peerConnection.addEventListener("icecandidate", (event) => {
      if (!this.alive) return;
      if (event.candidate == null) return;
      this.uploadToServer(
        rtcDataType.HostCandidate,
        {
          candidate: event.candidate,
        },
        "Ice Candidate",
        false,
      );
    });

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    if (!this.alive) return;

    this.uploadToServer(
      rtcDataType.Offer,
      {
        sdp: this.peerConnection.localDescription,
      },
      "Connection Offer",
      new URLSearchParams(location.search).has("debug"),
    );

    await this.checkForUpdates(
      () => this.dataChannelOpen,
      async (signal, abort) => {
        if (signal.type == rtcDataType.AnswerCandidate) {
          const candidate = new RTCIceCandidate(signal.data.candidate);
          this.peerConnection.addIceCandidate(candidate);
        }

        if (signal.type == rtcDataType.Answer) {
          if (this.peerConnection.signalingState != "have-local-offer") {
            return;
          }

          const description = new RTCSessionDescription(signal.data.sdp);
          await this.peerConnection.setRemoteDescription(description);

          if (signal.data.sdp.type == "offer") {
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            // client needs to realise that this answer is coming from the
            // server and not himself, so mask it to be an "rtcDataType.Offer"
            this.uploadToServer(
              rtcDataType.Offer,
              {
                sdp: this.peerConnection.localDescription,
              },
              Text.ConnectionAnswer,
            );
          }
        }
      },
      Text.RTCAnswer,
      { timeoutPeriod: RtcBase.hostTimeoutPeriod },
    );
  }
}

class RtcClient extends RtcBase {
  getStatus() {
    let color = "green";
    let message = Text.GoodConnection;

    if (!this.lastDataMessageTime) {
      color = "blue";
      message = Text.ConnectionBeingInitialized;
    } else if (Date.now() - this.lastDataMessageTime > RtcBase.pingPeriod * 2) {
      color = "red";
      message = Text.ConnectionTimedOut;
    }

    return { color, message };
  }

  async joinPool({ deviceId = null } = {}) {
    await this.uploadToServer(
      rtcDataType.joinPool,
      {
        signalingUid: this.signalingUid,
        deviceId,
      },
      Text.ConnectionInvitation,
    );
  }

  async start({ deviceId = null } = {}) {
    await this.init();

    this.answerSdp = null;
    this.offerSdp = null;
    this.signalingUid = this.generateSignalingUid();

    await this.joinPool({ deviceId });
    if (!this.alive) return;

    this.peerConnection.addEventListener("icecandidateerror", (event) => {
      if (!this.alive) return;
      if (new URLSearchParams(location.search).has("debug")) {
        console.log(`[DEBUG] ICE candidate error: ${event.errorText}`);
      }
    });

    this.peerConnection.addEventListener("icecandidate", (event) => {
      if (!this.alive) return;
      if (event.candidate == null) return;
      this.uploadToServer(
        rtcDataType.AnswerCandidate,
        {
          candidate: event.candidate,
        },
        "Ice Candidate",
        false,
      );
    });

    await this.checkForUpdates(
      () => this.dataChannelOpen,
      async (signal) => {
        if (signal.type == rtcDataType.JoinRejected) {
          this.rejectionReason = signal.data?.reason ?? "join-not-allowed";
          this.die();
          return;
        }

        if (signal.type == rtcDataType.HostCandidate) {
          const candidate = new RTCIceCandidate(signal.data.candidate);
          this.peerConnection.addIceCandidate(candidate);
        }

        if (signal.type == rtcDataType.Offer) {
          const description = new RTCSessionDescription(signal.data.sdp);
          await this.peerConnection.setRemoteDescription(description);

          if (signal.data.sdp.type == "offer") {
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            this.uploadToServer(
              rtcDataType.Answer,
              {
                sdp: this.peerConnection.localDescription,
              },
              Text.ConnectionAnswer,
            );
          }
        }
      },
      "RTC Offer",
      { timeoutPeriod: RtcBase.clientTimeoutPeriod },
    );
  }
}

class RtcHostManager {
  static checkForJoinsPeriod = 5000;
  static clientUrl = "https://noel-friedrich.de/cards/";
  static openPoolApi =
    "https://www.noel-friedrich.de/multigolf2/api/open_pool.php";

  constructor({
    logFunction = () => {},
    onDataMessage = () => {},
    onClientUrlAvailable = () => {},
    allowConnectionOverride = () => true,
    allowNewConnections = () => true,
    allowPollingCalls = () => true,
    shouldAcceptJoinRequest = () => true,
    resolveJoinDeviceIndex = () => null,
    getJoinPollingPeriodMs = () => RtcHostManager.checkForJoinsPeriod,
  } = {}) {
    this.gameState = gameState;

    this.logFunction = logFunction;
    this.onDataMessage = onDataMessage;
    this.onClientUrlAvailable = onClientUrlAvailable;
    this.allowConnectionOverride = allowConnectionOverride;
    this.allowNewConnections = allowNewConnections;
    this.allowPollingCalls = allowPollingCalls;
    this.shouldAcceptJoinRequest = shouldAcceptJoinRequest;
    this.resolveJoinDeviceIndex = resolveJoinDeviceIndex;
    this.getJoinPollingPeriodMs = getJoinPollingPeriodMs;

    this.poolUid = null;
    this.connections = [];
    this.polling = false;
  }

  makeConnection(deviceIndex, joinInfo = {}) {
    const connection = new RtcHost({
      logFunction: (message) => {
        if (!connection.alive) {
          return;
        }
        this.logFunction(`[${connection.index}] ${message}`);
      },
      onDataMessage: (message) => {
        this.onDataMessage(message, connection);
      },
      poolUid: this.poolUid,
    });
    connection.deviceId = joinInfo.deviceId ?? null;

    if (deviceIndex != null && deviceIndex <= this.connections.length) {
      const previousConnection = this.connections[deviceIndex - 1];
      if (previousConnection) {
        previousConnection.die();
      }
      connection.index = deviceIndex;
      this.connections[deviceIndex - 1] = connection;
    } else if (this.allowNewConnections()) {
      const reusableIndex = this.connections.findIndex(
        (existingConnection) => !existingConnection,
      );

      if (reusableIndex >= 0) {
        connection.index = reusableIndex + 1;
        this.connections[reusableIndex] = connection;
      } else {
        connection.index = this.connections.length + 1;
        this.connections.push(connection);
      }
    } else {
      return null;
    }

    return connection;
  }

  getActiveConnectionByDeviceId(deviceId) {
    if (!deviceId) {
      return null;
    }

    return (
      this.connections.find((connection) => {
        if (!connection?.alive || connection.deviceId != deviceId) {
          return false;
        }

        const status = connection.getStatus?.();
        return status?.color != "red";
      }) ?? null
    );
  }

  sortConnections() {
    this.connections.sort((a, b) => {
      return a.randomOffset - b.randomOffset;
    });

    for (let i = 0; i < this.connections.length; i++) {
      // index=0 is reserved for host (legacy)
      this.connections[i].index = i + 1;
    }
  }

  async openPool() {
    const urlParams = new URLSearchParams(location.search);
    if (urlParams.has("debug") && urlParams.has("p")) {
      return urlParams.get("p");
    }

    const response = await fetch(RtcHostManager.openPoolApi);
    const jsonData = await response.json();
    return jsonData["pool_uid"];
  }

  makeClientUrl() {
    return (
      RtcHostManager.clientUrl + `?client&p=${encodeURIComponent(this.poolUid)}`
    );
  }

  async start() {
    this.poolUid = await this.openPool();
    this.onClientUrlAvailable(this.makeClientUrl());
    this.logFunction(Text.CreatedPool(this.poolUid));

    // the baseConnection is just used to get updates from
    // the signalling server, not to form a peer-to-peer
    // webrtc connection with another device
    this.baseConnection = new RtcBase({ poolUid: this.poolUid });

    this.startPolling();
  }

  async rejectJoinRequest(signalingUid, reason) {
    if (!signalingUid) {
      return;
    }

    const rejectionSignal = new RtcBase({ poolUid: this.poolUid });
    rejectionSignal.signalingUid = signalingUid;
    await rejectionSignal.uploadToServer(
      rtcDataType.JoinRejected,
      { reason },
      "Join Rejection",
      false,
    );
  }

  async startPolling() {
    this.polling = true;
    while (this.polling) {
      while (!this.allowPollingCalls()) {
        // check if we're allowing polling now over and over once per second
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // if an update is older than 3 minutes, ignore immediately
      const currDate = new Date();
      const updates = (
        await this.baseConnection.getFromServer(rtcDataType.joinPool)
      )
        .filter((u) => currDate - new Date(u.create_timestamp) < 3 * 60 * 1000)
        .sort(
          (a, b) => new Date(b.create_timestamp) - new Date(a.create_timestamp),
        );
      const processedJoinKeys = new Set();

      for (let update of updates) {
        const joinInfo = {
          signalingUid: update.data.signalingUid,
          deviceId: update.data.deviceId ?? null,
        };
        const joinDedupKey = joinInfo.deviceId || joinInfo.signalingUid;
        if (processedJoinKeys.has(joinDedupKey)) {
          continue;
        }
        processedJoinKeys.add(joinDedupKey);

        if (!this.shouldAcceptJoinRequest(joinInfo)) {
          await this.rejectJoinRequest(joinInfo.signalingUid, "join-not-allowed");
          continue;
        }

        const allowNewConnections = this.allowNewConnections();
        let deviceIndex = this.resolveJoinDeviceIndex(joinInfo);
        const activeConnectionForDevice = this.getActiveConnectionByDeviceId(
          joinInfo.deviceId,
        );
        if (
          !Number.isInteger(deviceIndex) &&
          activeConnectionForDevice &&
          this.allowConnectionOverride(activeConnectionForDevice, joinInfo)
        ) {
          deviceIndex = activeConnectionForDevice.index;
        }

        if (Number.isInteger(deviceIndex)) {
          const existingConnection = this.connections[deviceIndex - 1];
          if (
            existingConnection &&
            existingConnection.alive &&
            existingConnection.getStatus().color !== "red"
          ) {
            const isSameDevice =
              existingConnection.deviceId &&
              joinInfo.deviceId &&
              existingConnection.deviceId == joinInfo.deviceId;

            if (allowNewConnections && !isSameDevice) {
              deviceIndex = null;
            } else if (
              !isSameDevice ||
              !this.allowConnectionOverride(existingConnection, joinInfo)
            ) {
              await this.rejectJoinRequest(
                joinInfo.signalingUid,
                "slot-unavailable",
              );
              continue;
            }
          }
        }

        const connection = this.makeConnection(deviceIndex, joinInfo);

        if (connection !== null) {
          connection
            .start(joinInfo.signalingUid)
            .then(() => {
              connection.startPinging();
            })
            .catch((error) => {
              connection.die();
              this.logFunction(
                `[${connection.index}] Failed to establish connection: ${error.message}`,
              );
            });
        } else {
          await this.rejectJoinRequest(joinInfo.signalingUid, "join-not-allowed");
        }
      }

      await new Promise((resolve) =>
        setTimeout(resolve, this.getJoinPollingPeriodMs()),
      );
    }
  }

  removeLostConnections() {
    const lostConnections = [];

    // kill connections
    for (let i = 0; i < this.connections.length; i++) {
      const connection = this.connections[i];
      if (!connection) {
        continue;
      }

      const shouldRemove = !connection.alive || connection.getStatus().color == "red";
      if (!shouldRemove) {
        continue;
      }

      if (connection.alive) {
        connection.die();
      }

      this.connections[i] = null;
      lostConnections.push(connection);
    }

    return lostConnections;
  }
}
