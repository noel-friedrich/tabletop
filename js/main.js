const fullscreenCanvas = document.getElementById("fullscreen-canvas");
const fullscreenContext = fullscreenCanvas.getContext("2d");

let rtc = null;

if (deviceInfo.role == DeviceRole.Host) {
  mainHost();
} else {
  mainClient();
}
