const qrImg = document.getElementById("join-qr-code")
const gameIdOutput = document.getElementById("gameid-output")
const openMenuButton = document.getElementById("open-menu-button")
const closeMenuButton = document.getElementById("close-menu-button")
const menuContainer = document.getElementById("menu-container")
const copyGameIdButton = document.getElementById("copy-gameid")

const playerListContainer = document.getElementById("player-list-container")
const playerListFieldset = document.getElementById("player-list-fieldset")

const clientStatusTitle = document.getElementById("client-status-title")

function initCommonMenu() {
    openMenuButton.addEventListener("click", () => {
        menuContainer.classList.remove("hidden")
    })

    closeMenuButton.addEventListener("click", () => {
        menuContainer.classList.add("hidden")
    })
}

function initHostMenu() {
    menuContainer.classList.add("host")
    initCommonMenu()

    copyGameIdButton.addEventListener("click", async () => {
        navigator.clipboard.writeText(gameIdOutput.textContent)
            .then(() => {
                const originalText = copyGameIdButton.textContent
                copyGameIdButton.textContent = "Copied!"
                copyGameIdButton.disabled = true

                setTimeout(() => {
                    copyGameIdButton.textContent = originalText
                    copyGameIdButton.disabled = false
                }, 2000)
            })
            .catch(() => {
                const originalText = copyGameIdButton.textContent
                copyGameIdButton.textContent = "Couldn't copy."
                copyGameIdButton.disabled = true

                setTimeout(() => {
                    copyGameIdButton.textContent = originalText
                    copyGameIdButton.disabled = false
                }, 2000)
            })
    })
}

function updateRtcConnectionsTable() {
    if (!rtc) {
        return
    }

    playerListFieldset.style.display = "grid"
    playerListContainer.innerHTML = ""
    if (rtc.connections.length == 0) {
        playerListContainer.textContent = Text.OnceYouConnectPlayers
    }

    for (let i = 0; i < rtc.connections.length; i++) {
        const playerContainer = document.createElement("div")
        playerContainer.classList.add("player-status-container")
        const circularIndicator = document.createElement("div")
        circularIndicator.classList.add("circle-indicator")
        const playerNameElement = document.createElement("div")
        playerNameElement.classList.add("player-name")

        playerContainer.appendChild(circularIndicator)
        playerContainer.appendChild(playerNameElement)

        const connection = rtc.connections[i]

        playerNameElement.textContent = Text.DeviceNum(connection.index)

        const connectionStatus = connection.getStatus()
        circularIndicator.classList.add(connectionStatus.color)
        playerContainer.title = connectionStatus.message ?? ""

        playerListContainer.appendChild(playerContainer)
    }
}

function initClientMenu() {
    initCommonMenu()
    menuContainer.classList.add("client")
}