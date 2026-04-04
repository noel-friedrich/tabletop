class GameDrawer {

    static imgHeightPx = 150
    static drawCount = null

    static getLocalNormPos(pos) {
        if (deviceInfo.role == DeviceRole.Host) {
            return pos
        } else if (deviceInfo.role == DeviceRole.Client) {
            if (pos.y <= 2 / 3) {
                return new Vector2d(pos.x, pos.y * 3 / 2)
            } else {
                return new Vector2d(pos.x, (pos.y - 2 / 3) * 3)
            }
        }
    }

    static getCardAt(canvas, gameState, normPos) {
        let bestCandidate = null

        for (const gameCard of gameState.gameCards) {
            const deck = cardDecks.getDeckByName(gameCard.deckName)
            const img = deck.images[gameCard.deckCardIndex]
            const cardSize = new Vector2d(img.width / img.height, 1)
                .scale(this.imgHeightPx).round().div(this.getCanvasSize(canvas))
            const cardNormPos = GameDrawer.getCardPosition(canvas, gameCard)
            const topLeftPos = cardNormPos.sub(cardSize.scale(0.5))
            
            const isHit = (
                normPos.x >= topLeftPos.x
                && normPos.y >= topLeftPos.y
                && normPos.x <= topLeftPos.x + cardSize.x
                && normPos.y <= topLeftPos.y + cardSize.y
            )

            if (!isHit) {
                continue
            }

            if (!bestCandidate) {
                bestCandidate = gameCard
                continue
            }

            if (bestCandidate.layerIndex < gameCard.layerIndex) {
                bestCandidate = gameCard
            }
        }

        return bestCandidate
    }

    static clearCanvas(canvas, context) {
        context.clearRect(0, 0, canvas.width, canvas.height)
    }

    static resetCanvas(canvas, context) {
        canvas.width = canvas.clientWidth
        canvas.height = canvas.clientHeight
        this.clearCanvas(canvas, context)
    }

    static screenPosToNormPos(canvas, screenPos) {
        return screenPos.div(this.getCanvasSize(canvas))
    }

    static getCanvasSize(canvas) {
        return new Vector2d(canvas.width, canvas.height)
    }

    static normPosToScreenPos(canvas, normPos) {
        return normPos.mul(this.getCanvasSize(canvas))
    }

    static drawImage(canvas, context, img, normPos) {
        const screenPos = this.normPosToScreenPos(canvas, normPos)
        const imgSize = new Vector2d(img.width / img.height, 1)
            .scale(this.imgHeightPx).round()

        context.drawImage(
            img,
            screenPos.x - imgSize.x / 2,
            screenPos.y - imgSize.y / 2,
            imgSize.x,
            imgSize.y
        )
    }

    static getCardPosition(canvas, gameCard, normalized=true) {
        const normPos = gameCard.normPosition.copy()

        if (deviceInfo.role == DeviceRole.Client) {
            if (gameCard.deviceId == DeviceIdCatalogue.Board) {
                // move to normalized upper two thirds
                normPos.y *= (2 / 3)
            } else if (gameCard.deviceId == deviceInfo.id) {
                // move to normalized lower third
                normPos.y = (2 + normPos.y) / 3
            } else {
                // don't draw cards that are home to other devides
                normPos.x = 0.5
                normPos.y = -0.5
            }
        } else if (deviceInfo.role == DeviceRole.Host) {
            if (gameCard.deviceId != DeviceIdCatalogue.Board) {
                // don't draw cards that are home to other devides
                normPos.x = 0.5
                normPos.y = -0.5
            }
        }

        if (normalized) {
            return normPos
        } else {
            return this.normPosToScreenPos(canvas, normPos)
        }
    }

    static drawGameCard(canvas, context, gameCard) {
        const deck = cardDecks.getDeckByName(gameCard.deckName)
        const img = deck.images[gameCard.deckCardIndex]
        const position = this.getCardPosition(canvas, gameCard)
        this.drawImage(canvas, context, img, position)
    }

    static drawBackground(canvas, context) {
        if (deviceInfo.role == DeviceRole.Client) {
            // draw bottom third private card holder
            context.fillStyle = "rgba(0, 0, 0, 0.3)"
            context.fillRect(0, canvas.height * 2 / 3, canvas.width, canvas.height / 3)
        }
    }

    static drawGameState(canvas, context, gameState) {
        if (gameState.drawCount === this.drawCount) {
            return
        }

        this.resetCanvas(canvas, context)
        this.drawBackground(canvas, context)

        // order is not relevant otherwise, so we can use index as a layer index
        gameState.gameCards.sort((a, b) => a.layerIndex - b.layerIndex)

        let madeMove = false
        for (const gameCard of gameState.gameCards) {
            this.drawGameCard(canvas, context, gameCard)
            
            if (gameCard.moveTowardsDesiredPos()) {
                madeMove = true
            }
        }

        this.drawCount = gameState.drawCount

        if (madeMove) {
            // we need to draw another time, yikes
            this.drawCount--
        }
    }

}

function drawLoop() {
    GameDrawer.drawGameState(fullscreenCanvas, fullscreenContext, gameState)
    window.requestAnimationFrame(drawLoop)
}

window.addEventListener("resize", () => {
    gameState.redraw()
})