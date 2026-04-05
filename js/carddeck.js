class CardDeck {
  constructor(name, imageUrls, backImageUrl = null) {
    this.name = name;
    this.imageUrls = imageUrls;
    this.backImageUrl = backImageUrl;

    this.images = imageUrls.map((url) => null);
    this.backImage = null;
    this.frontPreviewUrl = null;
    this.backPreviewUrl = null;
    this.loadedImages = false;
  }

  static fromInfoObject(infoObject) {
    return new CardDeck(
      infoObject.name,
      infoObject.image_urls.map(
        (url) => `assets/decks/${encodeURIComponent(infoObject.name)}/${url}`,
      ),
      infoObject.back_image_url
        ? `assets/decks/${encodeURIComponent(infoObject.name)}/${infoObject.back_image_url}`
        : null,
    );
  }

  async loadRasterizedImage(url) {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.addEventListener("load", () => {
        const rasterResolution = GameDrawer.imgHeightPx * 1.5;
        const rasterSize = new Vector2d(img.naturalWidth / img.naturalHeight, 1)
          .scale(rasterResolution)
          .round();

        const offscreenCanvas = new OffscreenCanvas(rasterSize.x, rasterSize.y);
        const context = offscreenCanvas.getContext("2d");

        const padding = GameDrawer.cardRenderPadding;
        context.drawImage(
          img,
          padding * rasterSize.x,
          padding * rasterSize.y,
          rasterSize.x * (1 - padding * 2),
          rasterSize.y * (1 - padding * 2),
        );
        resolve(offscreenCanvas.transferToImageBitmap());
      });
      img.addEventListener("error", reject);
      img.src = url;
    });
  }

  makePreviewUrlFromBitmap(bitmap) {
    if (!bitmap) {
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    return canvas.toDataURL("image/png");
  }

  async load() {
    this.images = await Promise.all(
      this.imageUrls.map((url) => this.loadRasterizedImage(url)),
    );
    this.frontPreviewUrl = this.makePreviewUrlFromBitmap(this.images[0] ?? null);

    if (this.backImageUrl) {
      this.backImage = await this.loadRasterizedImage(this.backImageUrl);
      this.backPreviewUrl = this.makePreviewUrlFromBitmap(this.backImage);
    }

    this.loadedImages = true;
  }

  get size() {
    return this.imageUrls.length;
  }
}

class CardDecks {
  constructor(decks) {
    this.decks = decks;
    this.deckNameMap = new Map();
    for (const deck of decks) {
      this.deckNameMap.set(deck.name, deck);
    }
  }

  static fromInfoObjects(infoObjects) {
    const sortedInfoObjects = [...infoObjects].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    return new CardDecks(
      sortedInfoObjects.map((io) => CardDeck.fromInfoObject(io)),
    );
  }

  getDeckByName(name) {
    return this.deckNameMap.get(name);
  }

  get deckNames() {
    return this.decks.map((deck) => deck.name);
  }

  get numDecks() {
    return this.decks.length;
  }

  async loadAll() {
    await Promise.all(this.decks.map((deck) => deck.load()));
  }
}

const cardDecks = CardDecks.fromInfoObjects(cardDeckInfos);
