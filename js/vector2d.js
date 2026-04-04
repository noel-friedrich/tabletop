class Vector2d extends Serializable {
  constructor(x, y) {
    super();
    this.x = x;
    this.y = y;
  }

  static get zero() {
    return new Vector2d(0, 0);
  }

  static get unit00() {
    return new Vector2d(0, 0);
  }

  static get unit01() {
    return new Vector2d(0, 1);
  }

  static get unit10() {
    return new Vector2d(1, 0);
  }

  static get unit11() {
    return new Vector2d(1, 1);
  }

  static get unitm11() {
    return new Vector2d(-1, 1);
  }

  static get unitm1m1() {
    return new Vector2d(-1, -1);
  }

  static get unit1m1() {
    return new Vector2d(1, -1);
  }

  copy() {
    return new Vector2d(this.x, this.y);
  }

  add(v) {
    return new Vector2d(this.x + v.x, this.y + v.y);
  }

  iadd(v) {
    this.x += v.x;
    this.y += v.y;
  }

  sub(v) {
    return new Vector2d(this.x - v.x, this.y - v.y);
  }

  isub(v) {
    this.x -= v.x;
    this.y -= v.y;
  }

  mul(v) {
    return new Vector2d(this.x * v.x, this.y * v.y);
  }

  imul(v) {
    this.x *= v.x;
    this.y *= v.y;
  }

  div(v) {
    return new Vector2d(this.x / v.x, this.y / v.y);
  }

  idiv(v) {
    this.x /= v.x;
    this.y /= v.y;
  }

  get length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  get normalized() {
    let m = this.length;
    return new Vector2d(this.x / m, this.y / m);
  }

  scale(x) {
    return new Vector2d(this.x * x, this.y * x);
  }

  scaleX(x) {
    return new Vector2d(this.x * x, this.y);
  }

  scaleY(x) {
    return new Vector2d(this.x, this.y * x);
  }

  lerp(v, t) {
    const delta = v.sub(this);
    return this.add(delta.scale(t));
  }

  ilerp(v, t) {
    const delta = v.sub(this);
    this.iadd(delta.scale(t));
  }

  dot(v) {
    return this.x * v.x + this.y * v.y;
  }

  iscale(x) {
    this.x *= x;
    this.y *= x;
  }

  distance(v) {
    return this.sub(v).length;
  }

  cross(v) {
    return this.x * v.y - this.y * v.x;
  }

  round() {
    return new Vector2d(Math.round(this.x), Math.round(this.y));
  }

  static fromAngle(angle) {
    return new Vector2d(Math.cos(angle), Math.sin(angle));
  }

  static fromPolar(mag, angle) {
    return new Vector2d(mag * Math.cos(angle), mag * Math.sin(angle));
  }

  static fromArray(arr) {
    return new Vector2d(arr[0], arr[1]);
  }

  set(x, y) {
    if (x instanceof Vector2d && y == undefined) {
      this.x = x.x;
      this.y = x.y;
    } else {
      this.x = x;
      this.y = y;
    }
  }

  addX(x) {
    return new Vector2d(this.x + x, this.y);
  }

  addY(y) {
    return new Vector2d(this.x, this.y + y);
  }

  rotate(angle) {
    let x = this.x * Math.cos(angle) - this.y * Math.sin(angle);
    let y = this.x * Math.sin(angle) + this.y * Math.cos(angle);
    return new Vector2d(x, y);
  }

  irotate(angle) {
    let x = this.x * Math.cos(angle) - this.y * Math.sin(angle);
    let y = this.x * Math.sin(angle) + this.y * Math.cos(angle);
    this.x = x;
    this.y = y;
  }

  static randomDirection() {
    let direction = Math.random() * Math.PI * 2;
    return Vector2d.fromAngle(direction);
  }

  static fromFunc(f) {
    return new Vector2d(f(), f());
  }

  static random() {
    return Vector2d.fromFunc(Math.random);
  }

  round() {
    return this.map((v) => Math.round(v));
  }

  ceil() {
    return this.map((v) => Math.ceil(v));
  }

  floor() {
    return this.map((v) => Math.floor(v));
  }

  applyFunc(func) {
    return new Vector2d();
  }

  get angle() {
    return Math.atan2(this.y, this.x);
  }

  angleDifference(v) {
    return angleDifference(this.angle, v.angle);
  }

  angleTo(v) {
    return Math.atan2(v.y - this.y, v.x - this.x);
  }

  equals(v) {
    return this.x == v.x && this.y == v.y;
  }

  map(f) {
    return new Vector2d(f(this.x), f(this.y));
  }

  product() {
    return this.x * this.y;
  }

  get array() {
    return [this.x, this.y];
  }

  get min() {
    return Math.min(...this.array);
  }

  get max() {
    return Math.max(...this.array);
  }

  abs() {
    return new Vector2d(Math.abs(this.x), Math.abs(this.y));
  }

  toArray() {
    return [this.x, this.y];
  }

  static fromEvent(event, element) {
    let x = 0,
      y = 0;

    if (event.touches && event.touches[0]) {
      x = event.touches[0].clientX;
      y = event.touches[0].clientY;
    } else if (event.originalEvent && event.originalEvent.changedTouches[0]) {
      x = event.originalEvent.changedTouches[0].clientX;
      y = event.originalEvent.changedTouches[0].clientY;
    } else if (event.clientX !== undefined && event.clientY !== undefined) {
      x = event.clientX;
      y = event.clientY;
    } else if (event.changedTouches && event.changedTouches.length > 0) {
      x = event.changedTouches[0].clientX;
      y = event.changedTouches[0].clientY;
    }

    const rect = element.getBoundingClientRect();
    return new Vector2d(x - rect.left, y - rect.top);
  }

  serialize() {
    return [this.x, this.y];
  }

  static fromSerialized(serialized) {
    return Vector2d.fromArray(serialized);
  }
}
