class CardDeck {

    constructor(name, imageUrls) {
        this.name = name
        this.imageUrls = imageUrls

        this.images = imageUrls.map(url => null)
        this.loadedImages = false
    }

    static fromInfoObject(infoObject) {
        return new CardDeck(
            infoObject.name,
            infoObject.image_urls
                .map(url => `assets/decks/${encodeURIComponent(infoObject.name)}/${url}`)
        )
    }

    async load() {
        await Promise.all(this.imageUrls.map(async (url, i) => {
            await new Promise((resolve, reject) => {
                const img = new Image()
                img.addEventListener("load", () => {
                    // rasterize image to precompute svg calculation

                    const rasterResolution = GameDrawer.imgHeightPx * 1.5
                    const rasterSize = new Vector2d(img.naturalWidth / img.naturalHeight, 1)
                        .scale(rasterResolution).round()

                    const offscreenCanvas = new OffscreenCanvas(rasterSize.x, rasterSize.y)
                    const context = offscreenCanvas.getContext("2d")

                    const padding = 0.05
                    context.drawImage(
                        img,
                        padding * rasterSize.x,
                        padding * rasterSize.y,
                        rasterSize.x * (1 - padding * 2),
                        rasterSize.y * (1 - padding * 2),
                    )
                    this.images[i] = offscreenCanvas.transferToImageBitmap()
                    resolve()
                })
                img.src = url
            })
        }))
    }
    
    get size() {
        return this.imageUrls.length
    }

}

class CardDecks {

    constructor(decks) {
        this.decks = decks
        this.deckNameMap = new Map()
        for (const deck of decks) {
            this.deckNameMap.set(deck.name, deck)
        }
    }

    static fromInfoObjects(infoObjects) {
        return new CardDecks(infoObjects.map(io => CardDeck.fromInfoObject(io)))
    }

    getDeckByName(name) {
        return this.deckNameMap.get(name)
    }

    get deckNames() {
        return this.decks.map(deck => deck.name)
    }

    get numDecks() {
        return this.decks.length
    }

    async loadAll() {
        await Promise.all(this.decks.map(deck => deck.load()))   
    }

}

const cardDecks = CardDecks.fromInfoObjects(cardDeckInfos)