/* eslint-disable */

// ../options-chart/node_modules/fancy-canvas/size.mjs
function size(_a) {
  var width = _a.width, height = _a.height;
  if (width < 0) {
    throw new Error("Negative width is not allowed for Size");
  }
  if (height < 0) {
    throw new Error("Negative height is not allowed for Size");
  }
  return {
    width,
    height
  };
}
function equalSizes(first, second) {
  return first.width === second.width && first.height === second.height;
}

// ../options-chart/node_modules/fancy-canvas/device-pixel-ratio.mjs
var Observable = (
  /** @class */
  (function() {
    function Observable2(win) {
      var _this = this;
      this._resolutionListener = function() {
        return _this._onResolutionChanged();
      };
      this._resolutionMediaQueryList = null;
      this._observers = [];
      this._window = win;
      this._installResolutionListener();
    }
    Observable2.prototype.dispose = function() {
      this._uninstallResolutionListener();
      this._window = null;
    };
    Object.defineProperty(Observable2.prototype, "value", {
      get: function() {
        return this._window.devicePixelRatio;
      },
      enumerable: false,
      configurable: true
    });
    Observable2.prototype.subscribe = function(next) {
      var _this = this;
      var observer = { next };
      this._observers.push(observer);
      return {
        unsubscribe: function() {
          _this._observers = _this._observers.filter(function(o2) {
            return o2 !== observer;
          });
        }
      };
    };
    Observable2.prototype._installResolutionListener = function() {
      if (this._resolutionMediaQueryList !== null) {
        throw new Error("Resolution listener is already installed");
      }
      var dppx = this._window.devicePixelRatio;
      this._resolutionMediaQueryList = this._window.matchMedia("all and (resolution: ".concat(dppx, "dppx)"));
      this._resolutionMediaQueryList.addListener(this._resolutionListener);
    };
    Observable2.prototype._uninstallResolutionListener = function() {
      if (this._resolutionMediaQueryList !== null) {
        this._resolutionMediaQueryList.removeListener(this._resolutionListener);
        this._resolutionMediaQueryList = null;
      }
    };
    Observable2.prototype._reinstallResolutionListener = function() {
      this._uninstallResolutionListener();
      this._installResolutionListener();
    };
    Observable2.prototype._onResolutionChanged = function() {
      var _this = this;
      this._observers.forEach(function(observer) {
        return observer.next(_this._window.devicePixelRatio);
      });
      this._reinstallResolutionListener();
    };
    return Observable2;
  })()
);
function createObservable(win) {
  return new Observable(win);
}

// ../options-chart/node_modules/fancy-canvas/canvas-element-bitmap-size.mjs
var DevicePixelContentBoxBinding = (
  /** @class */
  (function() {
    function DevicePixelContentBoxBinding2(canvasElement, transformBitmapSize, options) {
      var _a;
      this._canvasElement = null;
      this._bitmapSizeChangedListeners = [];
      this._suggestedBitmapSize = null;
      this._suggestedBitmapSizeChangedListeners = [];
      this._devicePixelRatioObservable = null;
      this._canvasElementResizeObserver = null;
      this._canvasElement = canvasElement;
      this._canvasElementClientSize = size({
        width: this._canvasElement.clientWidth,
        height: this._canvasElement.clientHeight
      });
      this._transformBitmapSize = transformBitmapSize !== null && transformBitmapSize !== void 0 ? transformBitmapSize : (function(size2) {
        return size2;
      });
      this._allowResizeObserver = (_a = options === null || options === void 0 ? void 0 : options.allowResizeObserver) !== null && _a !== void 0 ? _a : true;
      this._chooseAndInitObserver();
    }
    DevicePixelContentBoxBinding2.prototype.dispose = function() {
      var _a, _b;
      if (this._canvasElement === null) {
        throw new Error("Object is disposed");
      }
      (_a = this._canvasElementResizeObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
      this._canvasElementResizeObserver = null;
      (_b = this._devicePixelRatioObservable) === null || _b === void 0 ? void 0 : _b.dispose();
      this._devicePixelRatioObservable = null;
      this._suggestedBitmapSizeChangedListeners.length = 0;
      this._bitmapSizeChangedListeners.length = 0;
      this._canvasElement = null;
    };
    Object.defineProperty(DevicePixelContentBoxBinding2.prototype, "canvasElement", {
      get: function() {
        if (this._canvasElement === null) {
          throw new Error("Object is disposed");
        }
        return this._canvasElement;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(DevicePixelContentBoxBinding2.prototype, "canvasElementClientSize", {
      get: function() {
        return this._canvasElementClientSize;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(DevicePixelContentBoxBinding2.prototype, "bitmapSize", {
      get: function() {
        return size({
          width: this.canvasElement.width,
          height: this.canvasElement.height
        });
      },
      enumerable: false,
      configurable: true
    });
    DevicePixelContentBoxBinding2.prototype.resizeCanvasElement = function(clientSize) {
      this._canvasElementClientSize = size(clientSize);
      this.canvasElement.style.width = "".concat(this._canvasElementClientSize.width, "px");
      this.canvasElement.style.height = "".concat(this._canvasElementClientSize.height, "px");
      this._invalidateBitmapSize();
    };
    DevicePixelContentBoxBinding2.prototype.subscribeBitmapSizeChanged = function(listener) {
      this._bitmapSizeChangedListeners.push(listener);
    };
    DevicePixelContentBoxBinding2.prototype.unsubscribeBitmapSizeChanged = function(listener) {
      this._bitmapSizeChangedListeners = this._bitmapSizeChangedListeners.filter(function(l2) {
        return l2 !== listener;
      });
    };
    Object.defineProperty(DevicePixelContentBoxBinding2.prototype, "suggestedBitmapSize", {
      get: function() {
        return this._suggestedBitmapSize;
      },
      enumerable: false,
      configurable: true
    });
    DevicePixelContentBoxBinding2.prototype.subscribeSuggestedBitmapSizeChanged = function(listener) {
      this._suggestedBitmapSizeChangedListeners.push(listener);
    };
    DevicePixelContentBoxBinding2.prototype.unsubscribeSuggestedBitmapSizeChanged = function(listener) {
      this._suggestedBitmapSizeChangedListeners = this._suggestedBitmapSizeChangedListeners.filter(function(l2) {
        return l2 !== listener;
      });
    };
    DevicePixelContentBoxBinding2.prototype.applySuggestedBitmapSize = function() {
      if (this._suggestedBitmapSize === null) {
        return;
      }
      var oldSuggestedSize = this._suggestedBitmapSize;
      this._suggestedBitmapSize = null;
      this._resizeBitmap(oldSuggestedSize);
      this._emitSuggestedBitmapSizeChanged(oldSuggestedSize, this._suggestedBitmapSize);
    };
    DevicePixelContentBoxBinding2.prototype._resizeBitmap = function(newSize) {
      var oldSize = this.bitmapSize;
      if (equalSizes(oldSize, newSize)) {
        return;
      }
      this.canvasElement.width = newSize.width;
      this.canvasElement.height = newSize.height;
      this._emitBitmapSizeChanged(oldSize, newSize);
    };
    DevicePixelContentBoxBinding2.prototype._emitBitmapSizeChanged = function(oldSize, newSize) {
      var _this = this;
      this._bitmapSizeChangedListeners.forEach(function(listener) {
        return listener.call(_this, oldSize, newSize);
      });
    };
    DevicePixelContentBoxBinding2.prototype._suggestNewBitmapSize = function(newSize) {
      var oldSuggestedSize = this._suggestedBitmapSize;
      var finalNewSize = size(this._transformBitmapSize(newSize, this._canvasElementClientSize));
      var newSuggestedSize = equalSizes(this.bitmapSize, finalNewSize) ? null : finalNewSize;
      if (oldSuggestedSize === null && newSuggestedSize === null) {
        return;
      }
      if (oldSuggestedSize !== null && newSuggestedSize !== null && equalSizes(oldSuggestedSize, newSuggestedSize)) {
        return;
      }
      this._suggestedBitmapSize = newSuggestedSize;
      this._emitSuggestedBitmapSizeChanged(oldSuggestedSize, newSuggestedSize);
    };
    DevicePixelContentBoxBinding2.prototype._emitSuggestedBitmapSizeChanged = function(oldSize, newSize) {
      var _this = this;
      this._suggestedBitmapSizeChangedListeners.forEach(function(listener) {
        return listener.call(_this, oldSize, newSize);
      });
    };
    DevicePixelContentBoxBinding2.prototype._chooseAndInitObserver = function() {
      var _this = this;
      if (!this._allowResizeObserver) {
        this._initDevicePixelRatioObservable();
        return;
      }
      isDevicePixelContentBoxSupported().then(function(isSupported) {
        return isSupported ? _this._initResizeObserver() : _this._initDevicePixelRatioObservable();
      });
    };
    DevicePixelContentBoxBinding2.prototype._initDevicePixelRatioObservable = function() {
      var _this = this;
      if (this._canvasElement === null) {
        return;
      }
      var win = canvasElementWindow(this._canvasElement);
      if (win === null) {
        throw new Error("No window is associated with the canvas");
      }
      this._devicePixelRatioObservable = createObservable(win);
      this._devicePixelRatioObservable.subscribe(function() {
        return _this._invalidateBitmapSize();
      });
      this._invalidateBitmapSize();
    };
    DevicePixelContentBoxBinding2.prototype._invalidateBitmapSize = function() {
      var _a, _b;
      if (this._canvasElement === null) {
        return;
      }
      var win = canvasElementWindow(this._canvasElement);
      if (win === null) {
        return;
      }
      var ratio = (_b = (_a = this._devicePixelRatioObservable) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : win.devicePixelRatio;
      var canvasRects = this._canvasElement.getClientRects();
      var newSize = (
        // eslint-disable-next-line no-negated-condition
        canvasRects[0] !== void 0 ? predictedBitmapSize(canvasRects[0], ratio) : size({
          width: this._canvasElementClientSize.width * ratio,
          height: this._canvasElementClientSize.height * ratio
        })
      );
      this._suggestNewBitmapSize(newSize);
    };
    DevicePixelContentBoxBinding2.prototype._initResizeObserver = function() {
      var _this = this;
      if (this._canvasElement === null) {
        return;
      }
      this._canvasElementResizeObserver = new ResizeObserver(function(entries) {
        var entry = entries.find(function(entry2) {
          return entry2.target === _this._canvasElement;
        });
        if (!entry || !entry.devicePixelContentBoxSize || !entry.devicePixelContentBoxSize[0]) {
          return;
        }
        var entrySize = entry.devicePixelContentBoxSize[0];
        var newSize = size({
          width: entrySize.inlineSize,
          height: entrySize.blockSize
        });
        _this._suggestNewBitmapSize(newSize);
      });
      this._canvasElementResizeObserver.observe(this._canvasElement, { box: "device-pixel-content-box" });
    };
    return DevicePixelContentBoxBinding2;
  })()
);
function bindTo(canvasElement, target) {
  if (target.type === "device-pixel-content-box") {
    return new DevicePixelContentBoxBinding(canvasElement, target.transform, target.options);
  }
  throw new Error("Unsupported binding target");
}
function canvasElementWindow(canvasElement) {
  return canvasElement.ownerDocument.defaultView;
}
function isDevicePixelContentBoxSupported() {
  return new Promise(function(resolve) {
    var ro = new ResizeObserver(function(entries) {
      resolve(entries.every(function(entry) {
        return "devicePixelContentBoxSize" in entry;
      }));
      ro.disconnect();
    });
    ro.observe(document.body, { box: "device-pixel-content-box" });
  }).catch(function() {
    return false;
  });
}
function predictedBitmapSize(canvasRect, ratio) {
  return size({
    width: Math.round(canvasRect.left * ratio + canvasRect.width * ratio) - Math.round(canvasRect.left * ratio),
    height: Math.round(canvasRect.top * ratio + canvasRect.height * ratio) - Math.round(canvasRect.top * ratio)
  });
}

// ../options-chart/node_modules/fancy-canvas/canvas-rendering-target.mjs
var CanvasRenderingTarget2D = (
  /** @class */
  (function() {
    function CanvasRenderingTarget2D2(context, mediaSize, bitmapSize) {
      if (mediaSize.width === 0 || mediaSize.height === 0) {
        throw new TypeError("Rendering target could only be created on a media with positive width and height");
      }
      this._mediaSize = mediaSize;
      if (bitmapSize.width === 0 || bitmapSize.height === 0) {
        throw new TypeError("Rendering target could only be created using a bitmap with positive integer width and height");
      }
      this._bitmapSize = bitmapSize;
      this._context = context;
    }
    CanvasRenderingTarget2D2.prototype.useMediaCoordinateSpace = function(f2) {
      try {
        this._context.save();
        this._context.setTransform(1, 0, 0, 1, 0, 0);
        this._context.scale(this._horizontalPixelRatio, this._verticalPixelRatio);
        return f2({
          context: this._context,
          mediaSize: this._mediaSize
        });
      } finally {
        this._context.restore();
      }
    };
    CanvasRenderingTarget2D2.prototype.useBitmapCoordinateSpace = function(f2) {
      try {
        this._context.save();
        this._context.setTransform(1, 0, 0, 1, 0, 0);
        return f2({
          context: this._context,
          mediaSize: this._mediaSize,
          bitmapSize: this._bitmapSize,
          horizontalPixelRatio: this._horizontalPixelRatio,
          verticalPixelRatio: this._verticalPixelRatio
        });
      } finally {
        this._context.restore();
      }
    };
    Object.defineProperty(CanvasRenderingTarget2D2.prototype, "_horizontalPixelRatio", {
      get: function() {
        return this._bitmapSize.width / this._mediaSize.width;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(CanvasRenderingTarget2D2.prototype, "_verticalPixelRatio", {
      get: function() {
        return this._bitmapSize.height / this._mediaSize.height;
      },
      enumerable: false,
      configurable: true
    });
    return CanvasRenderingTarget2D2;
  })()
);
function tryCreateCanvasRenderingTarget2D(binding, contextOptions) {
  var mediaSize = binding.canvasElementClientSize;
  if (mediaSize.width === 0 || mediaSize.height === 0) {
    return null;
  }
  var bitmapSize = binding.bitmapSize;
  if (bitmapSize.width === 0 || bitmapSize.height === 0) {
    return null;
  }
  var context = binding.canvasElement.getContext("2d", contextOptions);
  if (context === null) {
    return null;
  }
  return new CanvasRenderingTarget2D(context, mediaSize, bitmapSize);
}

// ../options-chart/node_modules/lightweight-charts/dist/lightweight-charts.production.mjs
var e = { title: "", visible: true, hitTestTolerance: 3, lastValueVisible: true, priceLineVisible: true, priceLineSource: 0, priceLineWidth: 1, priceLineColor: "", priceLineStyle: 2, baseLineVisible: true, baseLineWidth: 1, baseLineColor: "#B2B5BE", baseLineStyle: 0, priceFormat: { type: "price", precision: 2, minMove: 0.01 } };
var r;
var h;
function a(t, i) {
  const n = (function(t2, i2) {
    switch (t2) {
      case 0:
      default:
        return [];
      case 1:
        return [i2, i2];
      case 2:
        return [2 * i2, 2 * i2];
      case 3:
        return [6 * i2, 6 * i2];
      case 4:
        return [i2, 4 * i2];
    }
  })(i, t.lineWidth);
  return t.setLineDash(n), n;
}
function l(t, i, n, s) {
  t.beginPath();
  const e2 = t.lineWidth % 2 ? 0.5 : 0;
  t.moveTo(n, i + e2), t.lineTo(s, i + e2), t.stroke();
}
function o(t, i) {
  if (!t) throw new Error("Assertion failed" + (i ? ": " + i : ""));
}
function _(t) {
  if (void 0 === t) throw new Error("Value is undefined");
  return t;
}
function u(t) {
  if (null === t) throw new Error("Value is null");
  return t;
}
function c(t) {
  return u(_(t));
}
!(function(t) {
  t[t.Simple = 0] = "Simple", t[t.WithSteps = 1] = "WithSteps", t[t.Curved = 2] = "Curved";
})(r || (r = {})), (function(t) {
  t[t.Solid = 0] = "Solid", t[t.Dotted = 1] = "Dotted", t[t.Dashed = 2] = "Dashed", t[t.LargeDashed = 3] = "LargeDashed", t[t.SparseDotted = 4] = "SparseDotted";
})(h || (h = {}));
var d = class {
  constructor() {
    this.t = [];
  }
  i(t, i, n) {
    const s = { h: t, l: i, o: true === n };
    this.t.push(s);
  }
  _(t) {
    const i = this.t.findIndex(((i2) => t === i2.h));
    i > -1 && this.t.splice(i, 1);
  }
  u(t) {
    this.t = this.t.filter(((i) => i.l !== t));
  }
  p(t, i, n) {
    const s = [...this.t];
    this.t = this.t.filter(((t2) => !t2.o)), s.forEach(((s2) => s2.h(t, i, n)));
  }
  v() {
    return this.t.length > 0;
  }
  m() {
    this.t = [];
  }
};
function f(t, ...i) {
  for (const n of i) for (const i2 in n) void 0 !== n[i2] && Object.prototype.hasOwnProperty.call(n, i2) && !["__proto__", "constructor", "prototype"].includes(i2) && ("object" != typeof n[i2] || void 0 === t[i2] || Array.isArray(n[i2]) ? t[i2] = n[i2] : f(t[i2], n[i2]));
  return t;
}
function p(t) {
  return "number" == typeof t && isFinite(t);
}
function v(t) {
  return "number" == typeof t && t % 1 == 0;
}
function m(t) {
  return "string" == typeof t;
}
function w(t) {
  return "boolean" == typeof t;
}
function M(t) {
  const i = t;
  if (!i || "object" != typeof i) return i;
  let n, s, e2;
  for (s in n = Array.isArray(i) ? [] : {}, i) i.hasOwnProperty(s) && (e2 = i[s], n[s] = e2 && "object" == typeof e2 ? M(e2) : e2);
  return n;
}
function g(t) {
  return null !== t;
}
function b(t) {
  return null === t ? void 0 : t;
}
var S = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";
function x(t, i, n) {
  return void 0 === i && (i = S), `${n = void 0 !== n ? `${n} ` : ""}${t}px ${i}`;
}
var C = class {
  constructor(t) {
    this.M = { S: 1, C: 5, P: NaN, k: "", T: "", R: "", D: "", I: 0, V: 0, B: 0, A: 0, L: 0 }, this.O = t;
  }
  N() {
    const t = this.M, i = this.F(), n = this.W();
    return t.P === i && t.T === n || (t.P = i, t.T = n, t.k = x(i, n), t.A = 2.5 / 12 * i, t.I = t.A, t.V = i / 12 * t.C, t.B = i / 12 * t.C, t.L = 0), t.R = this.H(), t.D = this.U(), this.M;
  }
  H() {
    return this.O.N().layout.textColor;
  }
  U() {
    return this.O.$();
  }
  F() {
    return this.O.N().layout.fontSize;
  }
  W() {
    return this.O.N().layout.fontFamily;
  }
};
function y(t) {
  return t < 0 ? 0 : t > 255 ? 255 : Math.round(t) || 0;
}
function P(t) {
  return 0.199 * t[0] + 0.687 * t[1] + 0.114 * t[2];
}
var k = class {
  constructor(t, i) {
    this.j = /* @__PURE__ */ new Map(), this.q = t, i && (this.j = i);
  }
  Y(t, i) {
    if ("transparent" === t) return t;
    const n = this.K(t), s = n[3];
    return `rgba(${n[0]}, ${n[1]}, ${n[2]}, ${i * s})`;
  }
  G(t) {
    const i = this.K(t);
    return { Z: `rgb(${i[0]}, ${i[1]}, ${i[2]})`, X: P(i) > 160 ? "black" : "white" };
  }
  J(t) {
    return P(this.K(t));
  }
  tt(t, i, n) {
    const [s, e2, r2, h2] = this.K(t), [a2, l2, o2, _2] = this.K(i), u2 = [y(s + n * (a2 - s)), y(e2 + n * (l2 - e2)), y(r2 + n * (o2 - r2)), (c2 = h2 + n * (_2 - h2), c2 <= 0 || c2 > 1 ? Math.min(Math.max(c2, 0), 1) : Math.round(1e4 * c2) / 1e4)];
    var c2;
    return `rgba(${u2[0]}, ${u2[1]}, ${u2[2]}, ${u2[3]})`;
  }
  K(t) {
    const i = this.j.get(t);
    if (i) return i;
    const n = (function(t2) {
      const i2 = document.createElement("div");
      i2.style.display = "none", document.body.appendChild(i2), i2.style.color = t2;
      const n2 = window.getComputedStyle(i2).color;
      return document.body.removeChild(i2), n2;
    })(t), s = n.match(/^rgba?\s*\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d*\.?\d+))?\)$/);
    if (!s) {
      if (this.q.length) for (const i2 of this.q) {
        const n2 = i2(t);
        if (n2) return this.j.set(t, n2), n2;
      }
      throw new Error(`Failed to parse color: ${t}`);
    }
    const e2 = [parseInt(s[1], 10), parseInt(s[2], 10), parseInt(s[3], 10), s[4] ? parseFloat(s[4]) : 1];
    return this.j.set(t, e2), e2;
  }
};
var T = class {
  constructor() {
    this.it = [];
  }
  nt(t) {
    this.it = t;
  }
  st(t, i, n) {
    this.it.forEach(((s) => {
      s.st(t, i, n);
    }));
  }
};
var R = class {
  st(t, i, n) {
    t.useBitmapCoordinateSpace(((t2) => this.et(t2, i, n)));
  }
};
var D = class extends R {
  constructor() {
    super(...arguments), this.rt = null;
  }
  ht(t) {
    this.rt = t;
  }
  et({ context: t, horizontalPixelRatio: i, verticalPixelRatio: n }) {
    if (null === this.rt || null === this.rt.lt) return;
    const s = this.rt.lt, e2 = this.rt, r2 = Math.max(1, Math.floor(i)) % 2 / 2, h2 = (h3) => {
      t.beginPath();
      for (let a2 = s.to - 1; a2 >= s.from; --a2) {
        const s2 = e2.ot[a2], l2 = Math.round(s2._t * i) + r2, o2 = s2.ut * n, _2 = h3 * n + r2;
        t.moveTo(l2, o2), t.arc(l2, o2, _2, 0, 2 * Math.PI);
      }
      t.fill();
    };
    e2.ct > 0 && (t.fillStyle = e2.dt, h2(e2.ft + e2.ct)), t.fillStyle = e2.vt, h2(e2.ft);
  }
};
function I() {
  return { ot: [{ _t: 0, ut: 0, wt: 0, Mt: 0 }], vt: "", dt: "", ft: 0, ct: 0, lt: null };
}
var V = { from: 0, to: 1 };
var B = class {
  constructor(t, i, n) {
    this.gt = new T(), this.bt = [], this.St = [], this.xt = true, this.O = t, this.Ct = i, this.yt = n, this.gt.nt(this.bt);
  }
  Pt(t) {
    this.kt(), this.xt = true;
  }
  Tt() {
    return this.xt && (this.Rt(), this.xt = false), this.gt;
  }
  kt() {
    const t = this.yt.Dt();
    t.length !== this.bt.length && (this.St = t.map(I), this.bt = this.St.map(((t2) => {
      const i = new D();
      return i.ht(t2), i;
    })), this.gt.nt(this.bt));
  }
  Rt() {
    const t = 2 === this.Ct.N().mode || !this.Ct.It(), i = this.yt.Vt(), n = this.Ct.Bt(), s = this.O.Et();
    this.kt(), i.forEach(((i2, e2) => {
      const r2 = this.St[e2], h2 = i2.At(n), a2 = i2.Lt();
      !t && null !== h2 && i2.It() && null !== a2 ? (r2.vt = h2.zt, r2.ft = h2.ft, r2.ct = h2.Ot, r2.ot[0].Mt = h2.Mt, r2.ot[0].ut = i2.Ft().Nt(h2.Mt, a2.Wt), r2.dt = h2.Ht ?? this.O.Ut(r2.ot[0].ut / i2.Ft().$t()), r2.ot[0].wt = n, r2.ot[0]._t = s.jt(n), r2.lt = V) : r2.lt = null;
    }));
  }
};
var E = class extends R {
  constructor(t) {
    super(), this.qt = t;
  }
  et({ context: t, bitmapSize: i, horizontalPixelRatio: n, verticalPixelRatio: s }) {
    if (null === this.qt) return;
    const e2 = this.qt.Yt.It, r2 = this.qt.Kt.It;
    if (!e2 && !r2) return;
    const h2 = Math.round(this.qt._t * n), o2 = Math.round(this.qt.ut * s);
    t.lineCap = "butt", e2 && h2 >= 0 && (t.lineWidth = Math.floor(this.qt.Yt.ct * n), t.strokeStyle = this.qt.Yt.R, t.fillStyle = this.qt.Yt.R, a(t, this.qt.Yt.Gt), (function(t2, i2, n2, s2) {
      t2.beginPath();
      const e3 = t2.lineWidth % 2 ? 0.5 : 0;
      t2.moveTo(i2 + e3, n2), t2.lineTo(i2 + e3, s2), t2.stroke();
    })(t, h2, 0, i.height)), r2 && o2 >= 0 && (t.lineWidth = Math.floor(this.qt.Kt.ct * s), t.strokeStyle = this.qt.Kt.R, t.fillStyle = this.qt.Kt.R, a(t, this.qt.Kt.Gt), l(t, o2, 0, i.width));
  }
};
var A = class {
  constructor(t, i) {
    this.xt = true, this.Zt = { Yt: { ct: 1, Gt: 0, R: "", It: false }, Kt: { ct: 1, Gt: 0, R: "", It: false }, _t: 0, ut: 0 }, this.Xt = new E(this.Zt), this.Jt = t, this.yt = i;
  }
  Pt() {
    this.xt = true;
  }
  Tt(t) {
    return this.xt && (this.Rt(), this.xt = false), this.Xt;
  }
  Rt() {
    const t = this.Jt.It(), i = this.yt.Qt().N().crosshair, n = this.Zt;
    if (2 === i.mode) return n.Kt.It = false, void (n.Yt.It = false);
    n.Kt.It = t && this.Jt.ti(this.yt), n.Yt.It = t && this.Jt.ii(), n.Kt.ct = i.horzLine.width, n.Kt.Gt = i.horzLine.style, n.Kt.R = i.horzLine.color, n.Yt.ct = i.vertLine.width, n.Yt.Gt = i.vertLine.style, n.Yt.R = i.vertLine.color, n._t = this.Jt.ni(), n.ut = this.Jt.si();
  }
};
function L(t, i, n, s, e2, r2) {
  t.fillRect(i + r2, n, s - 2 * r2, r2), t.fillRect(i + r2, n + e2 - r2, s - 2 * r2, r2), t.fillRect(i, n, r2, e2), t.fillRect(i + s - r2, n, r2, e2);
}
function z(t, i, n, s, e2, r2) {
  t.save(), t.globalCompositeOperation = "copy", t.fillStyle = r2, t.fillRect(i, n, s, e2), t.restore();
}
function O(t, i, n, s, e2, r2) {
  t.beginPath(), t.roundRect ? t.roundRect(i, n, s, e2, r2) : (t.lineTo(i + s - r2[1], n), 0 !== r2[1] && t.arcTo(i + s, n, i + s, n + r2[1], r2[1]), t.lineTo(i + s, n + e2 - r2[2]), 0 !== r2[2] && t.arcTo(i + s, n + e2, i + s - r2[2], n + e2, r2[2]), t.lineTo(i + r2[3], n + e2), 0 !== r2[3] && t.arcTo(i, n + e2, i, n + e2 - r2[3], r2[3]), t.lineTo(i, n + r2[0]), 0 !== r2[0] && t.arcTo(i, n, i + r2[0], n, r2[0]));
}
function N(t, i, n, s, e2, r2, h2 = 0, a2 = [0, 0, 0, 0], l2 = "") {
  if (t.save(), !h2 || !l2 || l2 === r2) return O(t, i, n, s, e2, a2), t.fillStyle = r2, t.fill(), void t.restore();
  const o2 = h2 / 2;
  var _2;
  O(t, i + o2, n + o2, s - h2, e2 - h2, (_2 = -o2, a2.map(((t2) => 0 === t2 ? t2 : t2 + _2)))), "transparent" !== r2 && (t.fillStyle = r2, t.fill()), "transparent" !== l2 && (t.lineWidth = h2, t.strokeStyle = l2, t.closePath(), t.stroke()), t.restore();
}
function F(t, i, n, s, e2, r2, h2) {
  t.save(), t.globalCompositeOperation = "copy";
  const a2 = t.createLinearGradient(0, 0, 0, e2);
  a2.addColorStop(0, r2), a2.addColorStop(1, h2), t.fillStyle = a2, t.fillRect(i, n, s, e2), t.restore();
}
var W = class {
  constructor(t, i) {
    this.ht(t, i);
  }
  ht(t, i) {
    this.qt = t, this.ei = i;
  }
  $t(t, i) {
    return this.qt.It ? t.P + t.A + t.I : 0;
  }
  st(t, i, n, s) {
    if (!this.qt.It || 0 === this.qt.ri.length) return;
    const e2 = this.qt.R, r2 = this.ei.Z, h2 = t.useBitmapCoordinateSpace(((t2) => {
      const h3 = t2.context;
      h3.font = i.k;
      const a2 = this.hi(t2, i, n, s), l2 = a2.ai;
      return a2.li ? N(h3, l2.oi, l2._i, l2.ui, l2.ci, r2, l2.di, [l2.ft, 0, 0, l2.ft], r2) : N(h3, l2.fi, l2._i, l2.ui, l2.ci, r2, l2.di, [0, l2.ft, l2.ft, 0], r2), this.qt.pi && (h3.fillStyle = e2, h3.fillRect(l2.fi, l2.mi, l2.wi - l2.fi, l2.Mi)), this.qt.gi && (h3.fillStyle = i.D, h3.fillRect(a2.li ? l2.bi - l2.di : 0, l2._i, l2.di, l2.Si - l2._i)), a2;
    }));
    t.useMediaCoordinateSpace((({ context: t2 }) => {
      const n2 = h2.xi;
      t2.font = i.k, t2.textAlign = h2.li ? "right" : "left", t2.textBaseline = "middle", t2.fillStyle = e2, t2.fillText(this.qt.ri, n2.Ci, (n2._i + n2.Si) / 2 + n2.yi);
    }));
  }
  hi(t, i, n, s) {
    const { context: e2, bitmapSize: r2, mediaSize: h2, horizontalPixelRatio: a2, verticalPixelRatio: l2 } = t, o2 = this.qt.pi || !this.qt.Pi ? i.C : 0, _2 = this.qt.ki ? i.S : 0, u2 = i.A + this.ei.Ti, c2 = i.I + this.ei.Ri, d2 = i.V, f2 = i.B, p2 = this.qt.ri, v2 = i.P, m2 = n.Di(e2, p2), w2 = Math.ceil(n.Ii(e2, p2)), M2 = v2 + u2 + c2, g2 = i.S + d2 + f2 + w2 + o2, b2 = Math.max(1, Math.floor(l2));
    let S2 = Math.round(M2 * l2);
    S2 % 2 != b2 % 2 && (S2 += 1);
    const x2 = _2 > 0 ? Math.max(1, Math.floor(_2 * a2)) : 0, C2 = Math.round(g2 * a2), y2 = Math.round(o2 * a2), P2 = this.ei.Vi ?? this.ei.Bi ?? this.ei.Ei, k2 = Math.round(P2 * l2) - Math.floor(0.5 * l2), T2 = Math.floor(k2 + b2 / 2 - S2 / 2), R2 = T2 + S2, D2 = "right" === s, I2 = D2 ? h2.width - _2 : _2, V2 = D2 ? r2.width - x2 : x2;
    let B2, E2, A2;
    return D2 ? (B2 = V2 - C2, E2 = V2 - y2, A2 = I2 - o2 - d2 - _2) : (B2 = V2 + C2, E2 = V2 + y2, A2 = I2 + o2 + d2), { li: D2, ai: { _i: T2, mi: k2, Si: R2, ui: C2, ci: S2, ft: 2 * a2, di: x2, oi: B2, fi: V2, wi: E2, Mi: b2, bi: r2.width }, xi: { _i: T2 / l2, Si: R2 / l2, Ci: A2, yi: m2 } };
  }
};
var H = class {
  constructor(t) {
    this.Ai = { Ei: 0, Z: "#000", Ri: 0, Ti: 0 }, this.Li = { ri: "", It: false, pi: true, Pi: false, Ht: "", R: "#FFF", gi: false, ki: false }, this.zi = { ri: "", It: false, pi: false, Pi: true, Ht: "", R: "#FFF", gi: true, ki: true }, this.xt = true, this.Oi = new (t || W)(this.Li, this.Ai), this.Ni = new (t || W)(this.zi, this.Ai);
  }
  ri() {
    return this.Fi(), this.Li.ri;
  }
  Ei() {
    return this.Fi(), this.Ai.Ei;
  }
  Pt() {
    this.xt = true;
  }
  $t(t, i = false) {
    return Math.max(this.Oi.$t(t, i), this.Ni.$t(t, i));
  }
  Wi() {
    return this.Ai.Vi ?? null;
  }
  Hi() {
    return this.Ai.Vi ?? this.Ai.Bi ?? this.Ei();
  }
  Ui(t) {
    this.Ai.Bi = t ?? void 0;
  }
  $i() {
    return this.Fi(), this.Li.It || this.zi.It;
  }
  ji() {
    return this.Fi(), this.Li.It;
  }
  Tt(t) {
    return this.Fi(), this.Li.pi = this.Li.pi && t.N().ticksVisible, this.zi.pi = this.zi.pi && t.N().ticksVisible, this.Oi.ht(this.Li, this.Ai), this.Ni.ht(this.zi, this.Ai), this.Oi;
  }
  qi() {
    return this.Fi(), this.Oi.ht(this.Li, this.Ai), this.Ni.ht(this.zi, this.Ai), this.Ni;
  }
  Fi() {
    this.xt && (this.Li.pi = true, this.zi.pi = false, this.Yi(this.Li, this.zi, this.Ai));
  }
};
var U = class extends H {
  constructor(t, i, n) {
    super(), this.Jt = t, this.Ki = i, this.Gi = n;
  }
  Yi(t, i, n) {
    if (t.It = false, 2 === this.Jt.N().mode) return;
    const s = this.Jt.N().horzLine;
    if (!s.labelVisible) return;
    const e2 = this.Ki.Lt();
    if (!this.Jt.It() || this.Ki.Zi() || null === e2) return;
    const r2 = this.Ki.Xi().G(s.labelBackgroundColor);
    n.Z = r2.Z, t.R = r2.X;
    const h2 = 2 / 12 * this.Ki.P();
    n.Ti = h2, n.Ri = h2;
    const a2 = this.Gi(this.Ki);
    n.Ei = a2.Ei, t.ri = this.Ki.Ji(a2.Mt, e2), t.It = true;
  }
};
var $ = /[1-9]/g;
var j = class {
  constructor() {
    this.qt = null;
  }
  ht(t) {
    this.qt = t;
  }
  st(t, i) {
    if (null === this.qt || false === this.qt.It || 0 === this.qt.ri.length) return;
    const n = t.useMediaCoordinateSpace((({ context: t2 }) => (t2.font = i.k, Math.round(i.Qi.Ii(t2, u(this.qt).ri, $)))));
    if (n <= 0) return;
    const s = i.tn, e2 = n + 2 * s, r2 = e2 / 2, h2 = this.qt.nn;
    let a2 = this.qt.Ei, l2 = Math.floor(a2 - r2) + 0.5;
    l2 < 0 ? (a2 += Math.abs(0 - l2), l2 = Math.floor(a2 - r2) + 0.5) : l2 + e2 > h2 && (a2 -= Math.abs(h2 - (l2 + e2)), l2 = Math.floor(a2 - r2) + 0.5);
    const o2 = l2 + e2, _2 = Math.ceil(0 + i.S + i.C + i.A + i.P + i.I);
    t.useBitmapCoordinateSpace((({ context: t2, horizontalPixelRatio: n2, verticalPixelRatio: s2 }) => {
      const e3 = u(this.qt);
      t2.fillStyle = e3.Z;
      const r3 = Math.round(l2 * n2), h3 = Math.round(0 * s2), a3 = Math.round(o2 * n2), c2 = Math.round(_2 * s2), d2 = Math.round(2 * n2);
      if (t2.beginPath(), t2.moveTo(r3, h3), t2.lineTo(r3, c2 - d2), t2.arcTo(r3, c2, r3 + d2, c2, d2), t2.lineTo(a3 - d2, c2), t2.arcTo(a3, c2, a3, c2 - d2, d2), t2.lineTo(a3, h3), t2.fill(), e3.pi) {
        const r4 = Math.round(e3.Ei * n2), a4 = h3, l3 = Math.round((a4 + i.C) * s2);
        t2.fillStyle = e3.R;
        const o3 = Math.max(1, Math.floor(n2)), _3 = Math.floor(0.5 * n2);
        t2.fillRect(r4 - _3, a4, o3, l3 - a4);
      }
    })), t.useMediaCoordinateSpace((({ context: t2 }) => {
      const n2 = u(this.qt), e3 = 0 + i.S + i.C + i.A + i.P / 2;
      t2.font = i.k, t2.textAlign = "left", t2.textBaseline = "middle", t2.fillStyle = n2.R;
      const r3 = i.Qi.Di(t2, "Apr0");
      t2.translate(l2 + s, e3 + r3), t2.fillText(n2.ri, 0, 0);
    }));
  }
};
var q = class {
  constructor(t, i, n) {
    this.xt = true, this.Xt = new j(), this.Zt = { It: false, Z: "#4c525e", R: "white", ri: "", nn: 0, Ei: NaN, pi: true }, this.Ct = t, this.sn = i, this.Gi = n;
  }
  Pt() {
    this.xt = true;
  }
  Tt() {
    return this.xt && (this.Rt(), this.xt = false), this.Xt.ht(this.Zt), this.Xt;
  }
  Rt() {
    const t = this.Zt;
    if (t.It = false, 2 === this.Ct.N().mode) return;
    const i = this.Ct.N().vertLine;
    if (!i.labelVisible) return;
    const n = this.sn.Et();
    if (n.Zi()) return;
    t.nn = n.nn();
    const s = this.Gi();
    if (null === s) return;
    t.Ei = s.Ei;
    const e2 = n.en(this.Ct.Bt());
    t.ri = n.rn(u(e2)), t.It = true;
    const r2 = this.sn.Xi().G(i.labelBackgroundColor);
    t.Z = r2.Z, t.R = r2.X, t.pi = n.N().ticksVisible;
  }
};
var Y = class {
  constructor() {
    this.hn = null, this.an = 0;
  }
  ln() {
    return this.an;
  }
  _n(t) {
    this.an = t;
  }
  Ft() {
    return this.hn;
  }
  un(t) {
    this.hn = t;
  }
  cn(t) {
    return [];
  }
  dn() {
    return [];
  }
  It() {
    return true;
  }
};
var K;
!(function(t) {
  t[t.Normal = 0] = "Normal", t[t.Magnet = 1] = "Magnet", t[t.Hidden = 2] = "Hidden", t[t.MagnetOHLC = 3] = "MagnetOHLC";
})(K || (K = {}));
var G = class extends Y {
  constructor(t, i) {
    super(), this.yt = null, this.fn = NaN, this.pn = 0, this.vn = false, this.mn = /* @__PURE__ */ new Map(), this.wn = false, this.Mn = /* @__PURE__ */ new WeakMap(), this.gn = /* @__PURE__ */ new WeakMap(), this.bn = NaN, this.Sn = NaN, this.xn = NaN, this.Cn = NaN, this.sn = t, this.yn = i;
    this.Pn = /* @__PURE__ */ ((t2, i2) => (n2) => {
      const s = i2(), e2 = t2();
      if (n2 === u(this.yt).kn()) return { Mt: e2, Ei: s };
      {
        const t3 = u(n2.Lt());
        return { Mt: n2.Tn(s, t3), Ei: s };
      }
    })((() => this.fn), (() => this.Sn));
    const n = /* @__PURE__ */ ((t2, i2) => () => {
      const n2 = this.sn.Et().Rn(t2()), s = i2();
      return n2 && Number.isFinite(s) ? { wt: n2, Ei: s } : null;
    })((() => this.pn), (() => this.ni()));
    this.Dn = new q(this, t, n);
  }
  N() {
    return this.yn;
  }
  In(t, i) {
    this.xn = t, this.Cn = i;
  }
  Vn() {
    this.xn = NaN, this.Cn = NaN;
  }
  Bn() {
    return this.xn;
  }
  En() {
    return this.Cn;
  }
  An(t, i, n) {
    this.wn || (this.wn = true), this.vn = true, this.Ln(t, i, n);
  }
  Bt() {
    return this.pn;
  }
  ni() {
    return this.bn;
  }
  si() {
    return this.Sn;
  }
  It() {
    return this.vn;
  }
  zn() {
    this.vn = false, this.On(), this.fn = NaN, this.bn = NaN, this.Sn = NaN, this.yt = null, this.Vn(), this.Nn();
  }
  Fn(t) {
    if (!this.yn.doNotSnapToHiddenSeriesIndices) return t;
    const i = this.sn, n = i.Et();
    let s = null, e2 = null;
    for (const n2 of i.Wn()) {
      const i2 = n2.Un().Hn(t, -1);
      if (i2) {
        if (i2.$n === t) return t;
        (null === s || i2.$n > s) && (s = i2.$n);
      }
      const r3 = n2.Un().Hn(t, 1);
      if (r3) {
        if (r3.$n === t) return t;
        (null === e2 || r3.$n < e2) && (e2 = r3.$n);
      }
    }
    const r2 = [s, e2].filter(g);
    if (0 === r2.length) return t;
    const h2 = n.jt(t), a2 = r2.map(((t2) => Math.abs(h2 - n.jt(t2))));
    return r2[a2.indexOf(Math.min(...a2))];
  }
  jn(t) {
    let i = this.Mn.get(t);
    i || (i = new A(this, t), this.Mn.set(t, i));
    let n = this.gn.get(t);
    return n || (n = new B(this.sn, this, t), this.gn.set(t, n)), [i, n];
  }
  ti(t) {
    return t === this.yt && this.yn.horzLine.visible;
  }
  ii() {
    return this.yn.vertLine.visible;
  }
  qn(t, i) {
    this.vn && this.yt === t || this.mn.clear();
    const n = [];
    return this.yt === t && n.push(this.Yn(this.mn, i, this.Pn)), n;
  }
  dn() {
    return this.vn ? [this.Dn] : [];
  }
  Kn() {
    return this.yt;
  }
  Nn() {
    this.sn.Gn().forEach(((t) => {
      this.Mn.get(t)?.Pt(), this.gn.get(t)?.Pt();
    })), this.mn.forEach(((t) => t.Pt())), this.Dn.Pt();
  }
  Zn(t) {
    return t && !t.kn().Zi() ? t.kn() : null;
  }
  Ln(t, i, n) {
    this.Xn(t, i, n) && this.Nn();
  }
  Xn(t, i, n) {
    const s = this.bn, e2 = this.Sn, r2 = this.fn, h2 = this.pn, a2 = this.yt, l2 = this.Zn(n);
    this.pn = t, this.bn = isNaN(t) ? NaN : this.sn.Et().jt(t), this.yt = n;
    const o2 = null !== l2 ? l2.Lt() : null;
    return null !== l2 && null !== o2 ? (this.fn = i, this.Sn = l2.Nt(i, o2)) : (this.fn = NaN, this.Sn = NaN), s !== this.bn || e2 !== this.Sn || h2 !== this.pn || r2 !== this.fn || a2 !== this.yt;
  }
  On() {
    const t = this.sn.Jn().map(((t2) => t2.Un().Qn())).filter(g), i = 0 === t.length ? null : Math.max(...t);
    this.pn = null !== i ? i : NaN;
  }
  Yn(t, i, n) {
    let s = t.get(i);
    return void 0 === s && (s = new U(this, i, n), t.set(i, s)), s;
  }
};
function Z(t) {
  return "left" === t || "right" === t;
}
var X = class _X {
  constructor(t) {
    this.ts = /* @__PURE__ */ new Map(), this.ns = [], this.ss = t;
  }
  es(t, i) {
    const n = (function(t2, i2) {
      return void 0 === t2 ? i2 : { rs: Math.max(t2.rs, i2.rs), hs: t2.hs || i2.hs };
    })(this.ts.get(t), i);
    this.ts.set(t, n);
  }
  ls() {
    return this.ss;
  }
  _s(t) {
    const i = this.ts.get(t);
    return void 0 === i ? { rs: this.ss } : { rs: Math.max(this.ss, i.rs), hs: i.hs };
  }
  us() {
    this.cs(), this.ns = [{ ds: 0 }];
  }
  fs(t) {
    this.cs(), this.ns = [{ ds: 1, Wt: t }];
  }
  ps(t) {
    this.vs(), this.ns.push({ ds: 5, Wt: t });
  }
  cs() {
    this.vs(), this.ns.push({ ds: 6 });
  }
  ws() {
    this.cs(), this.ns = [{ ds: 4 }];
  }
  Ms(t) {
    this.cs(), this.ns.push({ ds: 2, Wt: t });
  }
  gs(t) {
    this.cs(), this.ns.push({ ds: 3, Wt: t });
  }
  bs() {
    return this.ns;
  }
  Ss(t) {
    for (const i of t.ns) this.xs(i);
    this.ss = Math.max(this.ss, t.ss), t.ts.forEach(((t2, i) => {
      this.es(i, t2);
    }));
  }
  static Cs() {
    return new _X(2);
  }
  static ys() {
    return new _X(3);
  }
  xs(t) {
    switch (t.ds) {
      case 0:
        this.us();
        break;
      case 1:
        this.fs(t.Wt);
        break;
      case 2:
        this.Ms(t.Wt);
        break;
      case 3:
        this.gs(t.Wt);
        break;
      case 4:
        this.ws();
        break;
      case 5:
        this.ps(t.Wt);
        break;
      case 6:
        this.vs();
    }
  }
  vs() {
    const t = this.ns.findIndex(((t2) => 5 === t2.ds));
    -1 !== t && this.ns.splice(t, 1);
  }
};
var J = class {
  formatTickmarks(t) {
    return t.map(((t2) => this.format(t2)));
  }
};
var Q = ".";
function tt(t, i) {
  if (!p(t)) return "n/a";
  if (!v(i)) throw new TypeError("invalid length");
  if (i < 0 || i > 16) throw new TypeError("invalid length");
  if (0 === i) return t.toString();
  return ("0000000000000000" + t.toString()).slice(-i);
}
var it = class extends J {
  constructor(t, i) {
    if (super(), i || (i = 1), p(t) && v(t) || (t = 100), t < 0) throw new TypeError("invalid base");
    this.Ki = t, this.Ps = i, this.ks();
  }
  format(t) {
    const i = t < 0 ? "\u2212" : "";
    return t = Math.abs(t), i + this.Ts(t);
  }
  ks() {
    if (this.Rs = 0, this.Ki > 0 && this.Ps > 0) {
      let t = this.Ki;
      for (; t > 1; ) t /= 10, this.Rs++;
    }
  }
  Ts(t) {
    const i = this.Ki / this.Ps;
    let n = Math.floor(t), s = "";
    const e2 = void 0 !== this.Rs ? this.Rs : NaN;
    if (i > 1) {
      let r2 = +(Math.round(t * i) - n * i).toFixed(this.Rs);
      r2 >= i && (r2 -= i, n += 1), s = Q + tt(+r2.toFixed(this.Rs) * this.Ps, e2);
    } else n = Math.round(n * i) / i, e2 > 0 && (s = Q + tt(0, e2));
    return n.toFixed(0) + s;
  }
};
var nt = class extends it {
  constructor(t = 100) {
    super(t);
  }
  format(t) {
    return `${super.format(t)}%`;
  }
};
var st = class extends J {
  constructor(t) {
    super(), this.Ds = t;
  }
  format(t) {
    let i = "";
    return t < 0 && (i = "-", t = -t), t < 995 ? i + this.Is(t) : t < 999995 ? i + this.Is(t / 1e3) + "K" : t < 999999995 ? (t = 1e3 * Math.round(t / 1e3), i + this.Is(t / 1e6) + "M") : (t = 1e6 * Math.round(t / 1e6), i + this.Is(t / 1e9) + "B");
  }
  Is(t) {
    let i;
    const n = Math.pow(10, this.Ds);
    return i = (t = Math.round(t * n) / n) >= 1e-15 && t < 1 ? t.toFixed(this.Ds).replace(/\.?0+$/, "") : String(t), i.replace(/(\.[1-9]*)0+$/, ((t2, i2) => i2));
  }
};
var et = /[2-9]/g;
var rt = class {
  constructor(t = 50) {
    this.Vs = 0, this.Bs = 1, this.Es = 1, this.As = {}, this.Ls = /* @__PURE__ */ new Map(), this.zs = t;
  }
  Os() {
    this.Vs = 0, this.Ls.clear(), this.Bs = 1, this.Es = 1, this.As = {};
  }
  Ii(t, i, n) {
    return this.Ns(t, i, n).width;
  }
  Di(t, i, n) {
    const s = this.Ns(t, i, n);
    return ((s.actualBoundingBoxAscent || 0) - (s.actualBoundingBoxDescent || 0)) / 2;
  }
  Ns(t, i, n) {
    const s = n || et, e2 = String(i).replace(s, "0");
    if (this.Ls.has(e2)) return _(this.Ls.get(e2)).Fs;
    if (this.Vs === this.zs) {
      const t2 = this.As[this.Es];
      delete this.As[this.Es], this.Ls.delete(t2), this.Es++, this.Vs--;
    }
    t.save(), t.textBaseline = "middle";
    const r2 = t.measureText(e2);
    return t.restore(), 0 === r2.width && i.length || (this.Ls.set(e2, { Fs: r2, Ws: this.Bs }), this.As[this.Bs] = e2, this.Vs++, this.Bs++), r2;
  }
};
var ht = class {
  constructor(t) {
    this.Hs = null, this.M = null, this.Us = "right", this.$s = t;
  }
  js(t, i, n) {
    this.Hs = t, this.M = i, this.Us = n;
  }
  st(t) {
    null !== this.M && null !== this.Hs && this.Hs.st(t, this.M, this.$s, this.Us);
  }
};
var at = class {
  constructor(t, i, n) {
    this.qs = t, this.$s = new rt(50), this.Ys = i, this.O = n, this.F = -1, this.Xt = new ht(this.$s);
  }
  Tt() {
    const t = this.O.Ks(this.Ys);
    if (null === t) return null;
    const i = t.Gs(this.Ys) ? t.Zs() : this.Ys.Ft();
    if (null === i) return null;
    const n = t.Xs(i);
    if ("overlay" === n) return null;
    const s = this.O.Js();
    return s.P !== this.F && (this.F = s.P, this.$s.Os()), this.Xt.js(this.qs.qi(), s, n), this.Xt;
  }
};
var lt = class extends R {
  constructor() {
    super(...arguments), this.qt = null;
  }
  ht(t) {
    this.qt = t;
  }
  Qs(t, i) {
    if (!this.qt?.It) return null;
    const { ut: n, ct: s, te: e2 } = this.qt;
    return i >= n - s - 7 && i <= n + s + 7 ? { ie: this.qt, ne: Math.abs(i - n), se: 2, ee: "price-line", te: e2 } : null;
  }
  et({ context: t, bitmapSize: i, horizontalPixelRatio: n, verticalPixelRatio: s }) {
    if (null === this.qt) return;
    if (false === this.qt.It) return;
    const e2 = Math.round(this.qt.ut * s);
    e2 < 0 || e2 > i.height || (t.lineCap = "butt", t.strokeStyle = this.qt.R, t.lineWidth = Math.floor(this.qt.ct * n), a(t, this.qt.Gt), l(t, e2, 0, i.width));
  }
};
var ot = class {
  constructor(t) {
    this.re = { ut: 0, R: "rgba(0, 0, 0, 0)", ct: 1, Gt: 0, It: false }, this.he = new lt(), this.xt = true, this.ae = t, this.le = t.Qt(), this.he.ht(this.re);
  }
  Pt() {
    this.xt = true;
  }
  Tt() {
    return this.ae.It() ? (this.xt && (this.oe(), this.xt = false), this.he) : null;
  }
};
var _t = class extends ot {
  constructor(t) {
    super(t);
  }
  oe() {
    this.re.It = false;
    const t = this.ae.Ft(), i = t._e()._e;
    if (2 !== i && 3 !== i) return;
    const n = this.ae.N();
    if (!n.baseLineVisible || !this.ae.It()) return;
    const s = this.ae.Lt();
    null !== s && (this.re.It = true, this.re.ut = t.Nt(s.Wt, s.Wt), this.re.R = n.baseLineColor, this.re.ct = n.baseLineWidth, this.re.Gt = n.baseLineStyle);
  }
};
var ut = class extends R {
  constructor() {
    super(...arguments), this.qt = null;
  }
  ht(t) {
    this.qt = t;
  }
  ue() {
    return this.qt;
  }
  et({ context: t, horizontalPixelRatio: i, verticalPixelRatio: n }) {
    const s = this.qt;
    if (null === s) return;
    const e2 = Math.max(1, Math.floor(i)), r2 = e2 % 2 / 2, h2 = Math.round(s.ce.x * i) + r2, a2 = s.ce.y * n;
    t.fillStyle = s.de, t.beginPath();
    const l2 = Math.max(2, 1.5 * s.fe) * i;
    t.arc(h2, a2, l2, 0, 2 * Math.PI, false), t.fill(), t.fillStyle = s.pe, t.beginPath(), t.arc(h2, a2, s.ft * i, 0, 2 * Math.PI, false), t.fill(), t.lineWidth = e2, t.strokeStyle = s.ve, t.beginPath(), t.arc(h2, a2, s.ft * i + e2 / 2, 0, 2 * Math.PI, false), t.stroke();
  }
};
var ct = [{ me: 0, we: 0.25, Me: 4, ge: 10, be: 0.25, Se: 0, xe: 0.4, Ce: 0.8 }, { me: 0.25, we: 0.525, Me: 10, ge: 14, be: 0, Se: 0, xe: 0.8, Ce: 0 }, { me: 0.525, we: 1, Me: 14, ge: 14, be: 0, Se: 0, xe: 0, Ce: 0 }];
var dt = class {
  constructor(t) {
    this.Xt = new ut(), this.xt = true, this.ye = true, this.Pe = performance.now(), this.ke = this.Pe - 1, this.Te = t;
  }
  Re() {
    this.ke = this.Pe - 1, this.Pt();
  }
  De() {
    if (this.Pt(), 2 === this.Te.N().lastPriceAnimation) {
      const t = performance.now(), i = this.ke - t;
      if (i > 0) return void (i < 650 && (this.ke += 2600));
      this.Pe = t, this.ke = t + 2600;
    }
  }
  Pt() {
    this.xt = true;
  }
  Ie() {
    this.ye = true;
  }
  It() {
    return 0 !== this.Te.N().lastPriceAnimation;
  }
  Ve() {
    switch (this.Te.N().lastPriceAnimation) {
      case 0:
        return false;
      case 1:
        return true;
      case 2:
        return performance.now() <= this.ke;
    }
  }
  Tt() {
    return this.xt ? (this.Rt(), this.xt = false, this.ye = false) : this.ye && (this.Be(), this.ye = false), this.Xt;
  }
  Rt() {
    this.Xt.ht(null);
    const t = this.Te.Qt().Et(), i = t.Ee(), n = this.Te.Lt();
    if (null === i || null === n) return;
    const s = this.Te.Ae(true);
    if (s.Le || !i.ze(s.$n)) return;
    const e2 = { x: t.jt(s.$n), y: this.Te.Ft().Nt(s.Mt, n.Wt) }, r2 = s.R, h2 = this.Te.N().lineWidth, a2 = this.Oe(this.Ne(), r2);
    this.Xt.ht({ de: r2, fe: h2, pe: a2.pe, ve: a2.ve, ft: a2.ft, ce: e2 });
  }
  Be() {
    const t = this.Xt.ue();
    if (null !== t) {
      const i = this.Oe(this.Ne(), t.de);
      t.pe = i.pe, t.ve = i.ve, t.ft = i.ft;
    }
  }
  Ne() {
    return this.Ve() ? performance.now() - this.Pe : 2599;
  }
  Fe(t, i, n, s) {
    const e2 = n + (s - n) * i;
    return this.Te.Qt().Xi().Y(t, e2);
  }
  Oe(t, i) {
    const n = t % 2600 / 2600;
    let s;
    for (const t2 of ct) if (n >= t2.me && n <= t2.we) {
      s = t2;
      break;
    }
    o(void 0 !== s, "Last price animation internal logic error");
    const e2 = (n - s.me) / (s.we - s.me);
    return { pe: this.Fe(i, e2, s.be, s.Se), ve: this.Fe(i, e2, s.xe, s.Ce), ft: (r2 = e2, h2 = s.Me, a2 = s.ge, h2 + (a2 - h2) * r2) };
    var r2, h2, a2;
  }
};
var ft = class extends ot {
  constructor(t) {
    super(t);
  }
  oe() {
    const t = this.re;
    t.It = false;
    const i = this.ae.N();
    if (!i.priceLineVisible || !this.ae.It()) return;
    const n = this.ae.Ae(0 === i.priceLineSource);
    n.Le || (t.It = true, t.ut = n.Ei, t.R = this.ae.We(n.R), t.ct = i.priceLineWidth, t.Gt = i.priceLineStyle);
  }
};
var pt = class extends H {
  constructor(t) {
    super(), this.Jt = t;
  }
  Yi(t, i, n) {
    t.It = false, i.It = false;
    const s = this.Jt;
    if (!s.It()) return;
    const e2 = s.N(), r2 = e2.lastValueVisible, h2 = "" !== s.He(), a2 = 0 === e2.seriesLastValueMode, l2 = s.Ae(false);
    if (l2.Le) return;
    r2 && (t.ri = this.Ue(l2, r2, a2), t.It = 0 !== t.ri.length), (h2 || a2) && (i.ri = this.$e(l2, r2, h2, a2), i.It = i.ri.length > 0);
    const o2 = s.We(l2.R), _2 = this.Jt.Qt().Xi().G(o2);
    n.Z = _2.Z, n.Ei = l2.Ei, i.Ht = s.Qt().Ut(l2.Ei / s.Ft().$t()), t.Ht = o2, t.R = _2.X, i.R = _2.X;
  }
  $e(t, i, n, s) {
    let e2 = "";
    const r2 = this.Jt.He();
    return n && 0 !== r2.length && (e2 += `${r2} `), i && s && (e2 += this.Jt.Ft().je() ? t.qe : t.Ye), e2.trim();
  }
  Ue(t, i, n) {
    return i ? n ? this.Jt.Ft().je() ? t.Ye : t.qe : t.ri : "";
  }
};
function vt(t, i, n, s) {
  const e2 = Number.isFinite(i), r2 = Number.isFinite(n);
  return e2 && r2 ? t(i, n) : e2 || r2 ? e2 ? i : n : s;
}
var mt = class _mt {
  constructor(t, i) {
    this.Ke = t, this.Ge = i;
  }
  Ze(t) {
    return null !== t && (this.Ke === t.Ke && this.Ge === t.Ge);
  }
  Xe() {
    return new _mt(this.Ke, this.Ge);
  }
  Je() {
    return this.Ke;
  }
  Qe() {
    return this.Ge;
  }
  tr() {
    return this.Ge - this.Ke;
  }
  Zi() {
    return this.Ge === this.Ke || Number.isNaN(this.Ge) || Number.isNaN(this.Ke);
  }
  Ss(t) {
    return null === t ? this : new _mt(vt(Math.min, this.Je(), t.Je(), -1 / 0), vt(Math.max, this.Qe(), t.Qe(), 1 / 0));
  }
  ir(t) {
    if (!p(t)) return;
    if (0 === this.Ge - this.Ke) return;
    const i = 0.5 * (this.Ge + this.Ke);
    let n = this.Ge - i, s = this.Ke - i;
    n *= t, s *= t, this.Ge = i + n, this.Ke = i + s;
  }
  nr(t) {
    p(t) && (this.Ge += t, this.Ke += t);
  }
  sr() {
    return { minValue: this.Ke, maxValue: this.Ge };
  }
  static er(t) {
    return null === t ? null : new _mt(t.minValue, t.maxValue);
  }
};
var wt = class _wt {
  constructor(t, i) {
    this.rr = t, this.hr = i || null;
  }
  ar() {
    return this.rr;
  }
  lr() {
    return this.hr;
  }
  sr() {
    return { priceRange: null === this.rr ? null : this.rr.sr(), margins: this.hr || void 0 };
  }
  static er(t) {
    return null === t ? null : new _wt(mt.er(t.priceRange), t.margins);
  }
};
var Mt = [2, 4, 8, 16, 32, 64, 128, 256, 512];
var gt = "Custom series with conflation reducer must have a priceValueBuilder method";
var bt = class extends ot {
  constructor(t, i) {
    super(t), this._r = i;
  }
  oe() {
    const t = this.re;
    t.It = false;
    const i = this._r.N();
    if (!this.ae.It() || !i.lineVisible) return;
    const n = this._r.ur();
    null !== n && (t.It = true, t.ut = n, t.R = i.color, t.ct = i.lineWidth, t.Gt = i.lineStyle, t.te = this._r.N().id);
  }
};
var St = class extends H {
  constructor(t, i) {
    super(), this.Te = t, this._r = i;
  }
  Yi(t, i, n) {
    t.It = false, i.It = false;
    const s = this._r.N(), e2 = s.axisLabelVisible, r2 = "" !== s.title, h2 = this.Te;
    if (!e2 || !h2.It()) return;
    const a2 = this._r.ur();
    if (null === a2) return;
    r2 && (i.ri = s.title, i.It = true), i.Ht = h2.Qt().Ut(a2 / h2.Ft().$t()), t.ri = this.cr(s.price), t.It = true;
    const l2 = this.Te.Qt().Xi().G(s.axisLabelColor || s.color);
    n.Z = l2.Z;
    const o2 = s.axisLabelTextColor || l2.X;
    t.R = o2, i.R = o2, n.Ei = a2;
  }
  cr(t) {
    const i = this.Te.Lt();
    return null === i ? "" : this.Te.Ft().Ji(t, i.Wt);
  }
};
var xt = class {
  constructor(t, i) {
    this.Te = t, this.yn = i, this.dr = new bt(t, this), this.qs = new St(t, this), this.pr = new at(this.qs, t, t.Qt());
  }
  vr(t) {
    f(this.yn, t), this.Pt(), this.Te.Qt().mr();
  }
  N() {
    return this.yn;
  }
  wr() {
    return this.dr;
  }
  Mr() {
    return this.pr;
  }
  gr() {
    return this.qs;
  }
  Pt() {
    this.dr.Pt(), this.qs.Pt();
  }
  ur() {
    const t = this.Te, i = t.Ft();
    if (t.Qt().Et().Zi() || i.Zi()) return null;
    const n = t.Lt();
    return null === n ? null : i.Nt(this.yn.price, n.Wt);
  }
};
var Ct = class {
  constructor() {
    this.br = /* @__PURE__ */ new WeakMap();
  }
  Sr(t, i, n) {
    const s = 1 / i * n;
    if (t >= s) return 1;
    const e2 = s / t, r2 = Math.pow(2, Math.floor(Math.log2(e2)));
    return Math.min(r2, 512);
  }
  Cr(t, i, n, s = false, e2) {
    if (0 === t.length || i <= 1) return t;
    const r2 = this.yr(i);
    if (r2 <= 1) return t;
    const h2 = this.Pr(t);
    let a2 = h2.kr.get(r2);
    return void 0 !== a2 || (a2 = this.Tr(t, r2, n, s, e2, h2.kr), h2.kr.set(r2, a2)), a2;
  }
  Rr(t, i, n, s, e2 = false, r2) {
    if (n < 1 || 0 === t.length) return t;
    const h2 = this.Pr(t), a2 = h2.kr.get(n);
    if (!a2) return this.Cr(t, n, s, e2, r2);
    const l2 = this.Dr(t, i, n, a2, e2, s, r2);
    return h2.kr.set(n, l2), l2;
  }
  yr(t) {
    if (t <= 2) return 2;
    for (const i of Mt) if (t <= i) return i;
    return 512;
  }
  Ir(t) {
    if (0 === t.length) return 0;
    const i = t[0], n = t[t.length - 1];
    return 31 * t.length + 17 * i.$n + 13 * n.$n;
  }
  Tr(t, i, n, s = false, e2, r2 = /* @__PURE__ */ new Map()) {
    if (2 === i) return this.Vr(t, 2, n, s, e2);
    const h2 = i / 2;
    let a2 = r2.get(h2);
    return a2 || (a2 = this.Tr(t, h2, n, s, e2, r2), r2.set(h2, a2)), this.Br(a2, n, s, e2);
  }
  Vr(t, i, n, s = false, e2) {
    const r2 = this.Er(t, i, n, s, e2);
    return this.Ar(r2, s);
  }
  Br(t, i, n = false, s) {
    const e2 = this.Er(t, 2, i, n, s);
    return this.Ar(e2, n);
  }
  Er(t, i, n, s = false, e2) {
    const r2 = [];
    for (let h2 = 0; h2 < t.length; h2 += i) {
      if (t.length - h2 >= i) {
        const i2 = this.Lr(t[h2], t[h2 + 1], n, s, e2);
        i2.zr = false, r2.push(i2);
      } else if (0 === r2.length) r2.push(this.Or(t[h2], true));
      else {
        const i2 = r2[r2.length - 1];
        r2[r2.length - 1] = this.Nr(i2, t[h2], n, s, e2);
      }
    }
    return r2;
  }
  Fr(t, i) {
    return (t ?? 1) + (i ?? 1);
  }
  Lr(t, i, n, s = false, e2) {
    if (!s || !n || !e2) {
      const n2 = t.Wt[1] > i.Wt[1] ? t.Wt[1] : i.Wt[1], s2 = t.Wt[2] < i.Wt[2] ? t.Wt[2] : i.Wt[2];
      return { Wr: t.$n, Hr: i.$n, Ur: t.wt, $r: i.wt, jr: t.Wt[0], qr: n2, Yr: s2, Kr: i.Wt[3], Gr: this.Fr(t.Gr, i.Gr), Zr: void 0, zr: false };
    }
    const r2 = n(this.Xr(t, e2), this.Xr(i, e2)), h2 = e2(r2), a2 = h2.length ? h2[h2.length - 1] : 0;
    return { Wr: t.$n, Hr: i.$n, Ur: t.wt, $r: i.wt, jr: t.Wt[0], qr: Math.max(t.Wt[1], a2), Yr: Math.min(t.Wt[2], a2), Kr: a2, Gr: this.Fr(t.Gr, i.Gr), Zr: r2, zr: false };
  }
  Nr(t, i, n, s = false, e2) {
    if (!s || !n || !e2) return { Wr: t.Wr, Hr: i.$n, Ur: t.Ur, $r: i.wt, jr: t.jr, qr: t.qr > i.Wt[1] ? t.qr : i.Wt[1], Yr: t.Yr < i.Wt[2] ? t.Yr : i.Wt[2], Kr: i.Wt[3], Gr: t.Gr + (i.Gr ?? 1), Zr: t.Zr, zr: false };
    const r2 = t.Zr, h2 = this.Xr(i, e2), a2 = r2 ? { data: r2, index: t.Wr, originalTime: t.Ur, time: t.Ur, priceValues: e2(r2) } : null, l2 = a2 ? n(a2, h2) : h2.data, o2 = a2 ? e2(l2) : h2.priceValues, _2 = o2.length ? o2[o2.length - 1] : 0;
    return { Wr: t.Wr, Hr: i.$n, Ur: t.Ur, $r: i.wt, jr: t.jr, qr: Math.max(t.qr, _2), Yr: Math.min(t.Yr, _2), Kr: _2, Gr: t.Gr + (i.Gr ?? 1), Zr: l2, zr: false };
  }
  Jr(t, i, n, s, e2, r2, h2 = false, a2) {
    const l2 = i === s ? e2 : t[i];
    if (n - i == 1) return this.Or(l2, true);
    const o2 = i + 1 === s ? e2 : t[i + 1];
    let _2 = this.Lr(l2, o2, r2, h2, a2);
    for (let l3 = i + 2; l3 < n; l3++) {
      const i2 = l3 === s ? e2 : t[l3];
      _2 = this.Nr(_2, i2, r2, h2, a2);
    }
    return _2;
  }
  Xr(t, i) {
    const n = t.ue ?? {};
    return { data: t.ue, index: t.$n, originalTime: t.Qr, time: t.wt, priceValues: i(n) };
  }
  th(t, i = false) {
    const n = true === i, s = !!t.Zr;
    return { ...{ $n: t.Wr, wt: t.Ur, Qr: t.Ur, Wt: [n ? t.Kr : t.jr, t.qr, t.Yr, t.Kr], Gr: t.Gr }, ue: n ? s ? t.Zr : { wt: t.Ur } : void 0 };
  }
  Ar(t, i = false) {
    return t.map(((t2) => this.th(t2, i)));
  }
  Dr(t, i, n, s, e2 = false, r2, h2) {
    if (0 === s.length) return s;
    const a2 = t.length - 1, l2 = Math.floor(a2 / n) * n;
    if (Math.min(l2 + n, t.length) - l2 < n && t.length > n) {
      const s2 = t.slice();
      return s2[s2.length - 1] = i, this.Cr(s2, n, r2, e2, h2);
    }
    if (Math.floor((a2 - 1) / n) === Math.floor(a2 / n) || 1 === s.length) {
      const o2 = Math.min(l2 + n, t.length), _2 = o2 - l2;
      if (_2 <= 0) return s;
      const u2 = 1 === _2 ? this.Or(l2 === a2 ? i : t[l2], true) : this.Jr(t, l2, o2, a2, i, r2, e2, h2);
      return s[s.length - 1] = this.th(u2, e2), s;
    }
    {
      const s2 = t.slice();
      return s2[s2.length - 1] = i, this.Cr(s2, n, r2, e2, h2);
    }
  }
  Or(t, i = false) {
    return { Wr: t.$n, Hr: t.$n, Ur: t.wt, $r: t.wt, jr: t.Wt[0], qr: t.Wt[1], Yr: t.Wt[2], Kr: t.Wt[3], Gr: t.Gr ?? 1, Zr: t.ue, zr: i };
  }
  Pr(t) {
    const i = this.ih(t), n = this.Ir(t);
    return i.nh !== n && (i.kr.clear(), i.nh = n), i;
  }
  ih(t) {
    let i = this.br.get(t);
    return void 0 === i && (i = { nh: this.Ir(t), kr: /* @__PURE__ */ new Map() }, this.br.set(t, i)), i;
  }
};
var yt = class extends Y {
  constructor(t) {
    super(), this.sn = t;
  }
  Qt() {
    return this.sn;
  }
};
var Pt = { Bar: (t, i, n, s) => {
  const e2 = i.upColor, r2 = i.downColor, h2 = u(t(n, s)), a2 = c(h2.Wt[0]) <= c(h2.Wt[3]);
  return { sh: h2.R ?? (a2 ? e2 : r2) };
}, Candlestick: (t, i, n, s) => {
  const e2 = i.upColor, r2 = i.downColor, h2 = i.borderUpColor, a2 = i.borderDownColor, l2 = i.wickUpColor, o2 = i.wickDownColor, _2 = u(t(n, s)), d2 = c(_2.Wt[0]) <= c(_2.Wt[3]);
  return { sh: _2.R ?? (d2 ? e2 : r2), eh: _2.Ht ?? (d2 ? h2 : a2), rh: _2.hh ?? (d2 ? l2 : o2) };
}, Custom: (t, i, n, s) => ({ sh: u(t(n, s)).R ?? i.color }), Area: (t, i, n, s) => {
  const e2 = u(t(n, s));
  return { sh: e2.vt ?? i.lineColor, vt: e2.vt ?? i.lineColor, ah: e2.ah ?? i.topColor, oh: e2.oh ?? i.bottomColor };
}, Baseline: (t, i, n, s) => {
  const e2 = u(t(n, s));
  return { sh: e2.Wt[3] >= i.baseValue.price ? i.topLineColor : i.bottomLineColor, _h: e2._h ?? i.topLineColor, uh: e2.uh ?? i.bottomLineColor, dh: e2.dh ?? i.topFillColor1, fh: e2.fh ?? i.topFillColor2, ph: e2.ph ?? i.bottomFillColor1, mh: e2.mh ?? i.bottomFillColor2 };
}, Line: (t, i, n, s) => {
  const e2 = u(t(n, s));
  return { sh: e2.R ?? i.color, vt: e2.R ?? i.color };
}, Histogram: (t, i, n, s) => ({ sh: u(t(n, s)).R ?? i.color }) };
var kt = class {
  constructor(t) {
    this.wh = (t2, i) => void 0 !== i ? i.Wt : this.Te.Un().Mh(t2), this.Te = t, this.gh = Pt[t.bh()];
  }
  Sh(t, i) {
    return this.gh(this.wh, this.Te.N(), t, i);
  }
};
function Tt(t, i, n, s, e2 = 0, r2 = i.length) {
  let h2 = r2 - e2;
  for (; 0 < h2; ) {
    const r3 = h2 >> 1, a2 = e2 + r3;
    s(i[a2], n) === t ? (e2 = a2 + 1, h2 -= r3 + 1) : h2 = r3;
  }
  return e2;
}
var Rt = Tt.bind(null, true);
var Dt = Tt.bind(null, false);
var It;
!(function(t) {
  t[t.NearestLeft = -1] = "NearestLeft", t[t.None = 0] = "None", t[t.NearestRight = 1] = "NearestRight";
})(It || (It = {}));
var Vt = 30;
var Bt = class {
  constructor() {
    this.xh = [], this.Ch = /* @__PURE__ */ new Map(), this.yh = /* @__PURE__ */ new Map(), this.Ph = [];
  }
  kh() {
    return this.Th() > 0 ? this.xh[this.xh.length - 1] : null;
  }
  Rh() {
    return this.Th() > 0 ? this.Dh(0) : null;
  }
  Qn() {
    return this.Th() > 0 ? this.Dh(this.xh.length - 1) : null;
  }
  Th() {
    return this.xh.length;
  }
  Zi() {
    return 0 === this.Th();
  }
  ze(t) {
    return null !== this.Ih(t, 0);
  }
  Mh(t) {
    return this.Hn(t);
  }
  Hn(t, i = 0) {
    const n = this.Ih(t, i);
    return null === n ? null : { ...this.Vh(n), $n: this.Dh(n) };
  }
  Bh() {
    return this.xh;
  }
  Eh(t, i, n) {
    if (this.Zi()) return null;
    let s = null;
    for (const e2 of n) {
      s = Et(s, this.Ah(t, i, e2));
    }
    return s;
  }
  ht(t) {
    this.yh.clear(), this.Ch.clear(), this.xh = t, this.Ph = t.map(((t2) => t2.$n));
  }
  Lh() {
    return this.Ph;
  }
  Dh(t) {
    return this.xh[t].$n;
  }
  Vh(t) {
    return this.xh[t];
  }
  Ih(t, i) {
    const n = this.zh(t);
    if (null === n && 0 !== i) switch (i) {
      case -1:
        return this.Oh(t);
      case 1:
        return this.Nh(t);
      default:
        throw new TypeError("Unknown search mode");
    }
    return n;
  }
  Oh(t) {
    let i = this.Fh(t);
    return i > 0 && (i -= 1), i !== this.xh.length && this.Dh(i) < t ? i : null;
  }
  Nh(t) {
    const i = this.Wh(t);
    return i !== this.xh.length && t < this.Dh(i) ? i : null;
  }
  zh(t) {
    const i = this.Fh(t);
    return i === this.xh.length || t < this.xh[i].$n ? null : i;
  }
  Fh(t) {
    return Rt(this.xh, t, ((t2, i) => t2.$n < i));
  }
  Wh(t) {
    return Dt(this.xh, t, ((t2, i) => t2.$n > i));
  }
  Hh(t, i, n) {
    let s = null;
    for (let e2 = t; e2 < i; e2++) {
      const t2 = this.xh[e2].Wt[n];
      Number.isNaN(t2) || (null === s ? s = { Uh: t2, $h: t2 } : (t2 < s.Uh && (s.Uh = t2), t2 > s.$h && (s.$h = t2)));
    }
    return s;
  }
  Ah(t, i, n) {
    if (this.Zi()) return null;
    let s = null;
    const e2 = u(this.Rh()), r2 = u(this.Qn()), h2 = Math.max(t, e2), a2 = Math.min(i, r2), l2 = Math.ceil(h2 / Vt) * Vt, o2 = Math.max(l2, Math.floor(a2 / Vt) * Vt);
    {
      const t2 = this.Fh(h2), e3 = this.Wh(Math.min(a2, l2, i));
      s = Et(s, this.Hh(t2, e3, n));
    }
    let _2 = this.Ch.get(n);
    void 0 === _2 && (_2 = /* @__PURE__ */ new Map(), this.Ch.set(n, _2));
    for (let t2 = Math.max(l2 + 1, h2); t2 < o2; t2 += Vt) {
      const i2 = Math.floor(t2 / Vt);
      let e3 = _2.get(i2);
      if (void 0 === e3) {
        const t3 = this.Fh(i2 * Vt), s2 = this.Wh((i2 + 1) * Vt - 1);
        e3 = this.Hh(t3, s2, n), _2.set(i2, e3);
      }
      s = Et(s, e3);
    }
    {
      const t2 = this.Fh(o2), i2 = this.Wh(a2);
      s = Et(s, this.Hh(t2, i2, n));
    }
    return s;
  }
};
function Et(t, i) {
  if (null === t) return i;
  if (null === i) return t;
  return { Uh: Math.min(t.Uh, i.Uh), $h: Math.max(t.$h, i.$h) };
}
function At() {
  return new Bt();
}
var Lt = { setLineStyle: a };
var zt = class {
  constructor(t) {
    this.jh = t;
  }
  st(t, i, n) {
    this.jh.draw(t, Lt);
  }
  qh(t, i, n) {
    this.jh.drawBackground?.(t, Lt);
  }
};
var Ot = class {
  constructor(t) {
    this.Ls = null, this.Yh = t;
  }
  Tt() {
    const t = this.Yh.renderer();
    if (null === t) return null;
    if (this.Ls?.Kh === t) return this.Ls.Gh;
    const i = new zt(t);
    return this.Ls = { Kh: t, Gh: i }, i;
  }
  Zh() {
    return this.Yh.zOrder?.() ?? "normal";
  }
};
var Nt = class {
  constructor(t) {
    this.Xh = null, this.Jh = t;
  }
  Qh() {
    return this.Jh;
  }
  Nn() {
    this.Jh.updateAllViews?.();
  }
  jn() {
    const t = this.Jh.paneViews?.() ?? [];
    if (this.Xh?.Kh === t) return this.Xh.Gh;
    const i = t.map(((t2) => new Ot(t2)));
    return this.Xh = { Kh: t, Gh: i }, i;
  }
  Qs(t, i) {
    return this.Jh.hitTest?.(t, i) ?? null;
  }
};
var Ft = class extends Nt {
  cn() {
    return [];
  }
};
var Wt = class {
  constructor(t) {
    this.jh = t;
  }
  st(t, i, n) {
    this.jh.draw(t, Lt);
  }
  qh(t, i, n) {
    this.jh.drawBackground?.(t, Lt);
  }
};
var Ht = class {
  constructor(t) {
    this.Ls = null, this.Yh = t;
  }
  Tt() {
    const t = this.Yh.renderer();
    if (null === t) return null;
    if (this.Ls?.Kh === t) return this.Ls.Gh;
    const i = new Wt(t);
    return this.Ls = { Kh: t, Gh: i }, i;
  }
  Zh() {
    return this.Yh.zOrder?.() ?? "normal";
  }
};
function Ut(t) {
  return { ri: t.text(), Ei: t.coordinate(), Vi: t.fixedCoordinate?.(), R: t.textColor(), Z: t.backColor(), It: t.visible?.() ?? true, pi: t.tickVisible?.() ?? true };
}
var $t = class {
  constructor(t, i) {
    this.Xt = new j(), this.ta = t, this.ia = i;
  }
  Tt() {
    return this.Xt.ht({ nn: this.ia.nn(), ...Ut(this.ta) }), this.Xt;
  }
};
var jt = class extends H {
  constructor(t, i) {
    super(), this.ta = t, this.Ki = i;
  }
  Yi(t, i, n) {
    const s = Ut(this.ta);
    n.Z = s.Z, t.R = s.R;
    const e2 = 2 / 12 * this.Ki.P();
    n.Ti = e2, n.Ri = e2, n.Ei = s.Ei, n.Vi = s.Vi, t.ri = s.ri, t.It = s.It, t.pi = s.pi;
  }
};
var qt = class extends Nt {
  constructor(t, i) {
    super(t), this.na = null, this.sa = null, this.ea = null, this.ra = null, this.Te = i;
  }
  dn() {
    const t = this.Jh.timeAxisViews?.() ?? [];
    if (this.na?.Kh === t) return this.na.Gh;
    const i = this.Te.Qt().Et(), n = t.map(((t2) => new $t(t2, i)));
    return this.na = { Kh: t, Gh: n }, n;
  }
  qn() {
    const t = this.Jh.priceAxisViews?.() ?? [];
    if (this.sa?.Kh === t) return this.sa.Gh;
    const i = this.Te.Ft(), n = t.map(((t2) => new jt(t2, i)));
    return this.sa = { Kh: t, Gh: n }, n;
  }
  ha() {
    const t = this.Jh.priceAxisPaneViews?.() ?? [];
    if (this.ea?.Kh === t) return this.ea.Gh;
    const i = t.map(((t2) => new Ht(t2)));
    return this.ea = { Kh: t, Gh: i }, i;
  }
  aa() {
    const t = this.Jh.timeAxisPaneViews?.() ?? [];
    if (this.ra?.Kh === t) return this.ra.Gh;
    const i = t.map(((t2) => new Ht(t2)));
    return this.ra = { Kh: t, Gh: i }, i;
  }
  la(t, i) {
    return this.Jh.autoscaleInfo?.(t, i) ?? null;
  }
};
function Yt(t, i, n, s) {
  t.forEach(((t2) => {
    i(t2).forEach(((t3) => {
      t3.Zh() === n && s.push(t3);
    }));
  }));
}
function Kt(t) {
  return t.jn();
}
function Gt(t) {
  return t.ha();
}
function Zt(t) {
  return t.aa();
}
var Xt = ["Area", "Line", "Baseline"];
var Jt = class extends yt {
  constructor(t, i, n, s, e2) {
    super(t), this.qt = At(), this.dr = new ft(this), this.oa = [], this._a = new _t(this), this.ua = null, this.ca = null, this.da = null, this.fa = [], this.pa = new Ct(), this.va = /* @__PURE__ */ new Map(), this.ma = null, this.yn = n, this.wa = i;
    const r2 = new pt(this);
    if (this.mn = [r2], this.pr = new at(r2, this, t), Xt.includes(this.wa) && (this.ua = new dt(this)), this.Ma(), this.Yh = s(this, this.Qt(), e2), "Custom" === this.wa) {
      const t2 = this.Yh;
      t2.ga && this.ba(t2.ga);
    }
  }
  m() {
    null !== this.da && clearTimeout(this.da);
  }
  We(t) {
    return this.yn.priceLineColor || t;
  }
  Ae(t) {
    const i = { Le: true }, n = this.Ft();
    if (this.Qt().Et().Zi() || n.Zi() || this.qt.Zi()) return i;
    const s = this.Qt().Et().Ee(), e2 = this.Lt();
    if (null === s || null === e2) return i;
    let r2, h2;
    if (t) {
      const t2 = this.qt.kh();
      if (null === t2) return i;
      r2 = t2, h2 = t2.$n;
    } else {
      const t2 = this.qt.Hn(s.bi(), -1);
      if (null === t2) return i;
      if (r2 = this.qt.Mh(t2.$n), null === r2) return i;
      h2 = t2.$n;
    }
    const a2 = r2.Wt[3], l2 = this.Sa().Sh(h2, { Wt: r2 }), o2 = n.Nt(a2, e2.Wt);
    return { Le: false, Mt: a2, ri: n.Ji(a2, e2.Wt), qe: n.xa(a2), Ye: n.Ca(a2, e2.Wt), R: l2.sh, Ei: o2, $n: h2 };
  }
  Sa() {
    return null !== this.ca || (this.ca = new kt(this)), this.ca;
  }
  N() {
    return this.yn;
  }
  vr(t) {
    const i = this.Qt(), { priceScaleId: n, visible: s, priceFormat: e2 } = t;
    void 0 !== n && n !== this.yn.priceScaleId && i.ya(this, n), void 0 !== s && s !== this.yn.visible && i.Pa();
    const r2 = void 0 !== t.conflationThresholdFactor;
    f(this.yn, t), Object.prototype.hasOwnProperty.call(t, "autoscaleInfoProvider") && void 0 === t.autoscaleInfoProvider && (this.yn.autoscaleInfoProvider = void 0), r2 && (this.va.clear(), this.Qt().mr()), void 0 !== e2 && (this.Ma(), i.ka()), i.Ta(this), i.Ra(), this.Yh.Pt("options");
  }
  ht(t, i) {
    this.qt.ht(t), this.va.clear();
    const n = this.Qt().Et().N();
    n.enableConflation && n.precomputeConflationOnInit && this.Da(n.precomputeConflationPriority), this.Ia(), null !== this.ua && (i && i.Va ? this.ua.De() : 0 === t.length && this.ua.Re());
    const s = this.Qt().Ks(this);
    this.Qt().Ba(s), this.Qt().Ta(this), this.Qt().Ra(), this.Qt().mr();
  }
  Ia() {
    this.Yh.Pt("data");
  }
  Ea(t) {
    const i = new xt(this, t);
    return this.oa.push(i), this.Qt().Ta(this), i;
  }
  Aa(t) {
    const i = this.oa.indexOf(t);
    -1 !== i && this.oa.splice(i, 1), this.Qt().Ta(this);
  }
  La() {
    return this.oa;
  }
  bh() {
    return this.wa;
  }
  Lt() {
    const t = this.za();
    return null === t ? null : { Wt: t.Wt[3], Oa: t.wt };
  }
  za() {
    const t = this.Qt().Et().Ee();
    if (null === t) return null;
    const i = t.Na();
    return this.qt.Hn(i, 1);
  }
  Un() {
    return this.qt;
  }
  ba(t) {
    this.ma = t, this.va.clear();
  }
  Fa() {
    return !!this.Qt().Et().N().enableConflation && this.Wa() > 1;
  }
  Rr(t) {
    if (!this.Fa()) return;
    const i = this.Wa();
    if (!this.va.has(i)) return;
    const n = "Custom" === this.wa, s = n && this.ma || void 0, e2 = n && this.Yh.Ha ? (t2) => {
      const i2 = t2, n2 = this.Yh.Ha(i2);
      return Array.isArray(n2) ? n2 : ["number" == typeof n2 ? n2 : 0];
    } : void 0, r2 = this.pa.Rr(this.qt.Bh(), t, i, s, n, e2), h2 = At();
    h2.ht(r2), this.va.set(i, h2);
  }
  Ua() {
    const t = this.Qt().Et().N().enableConflation;
    if ("Custom" === this.wa && null === this.ma) return this.qt;
    if (!t) return this.qt;
    const i = this.Wa(), n = this.va.get(i);
    if (n) return n;
    this.$a(i);
    return this.va.get(i) ?? this.qt;
  }
  ja(t) {
    const i = this.qt.Mh(t);
    return null === i ? null : "Bar" === this.wa || "Candlestick" === this.wa || "Custom" === this.wa ? { jr: i.Wt[0], qr: i.Wt[1], Yr: i.Wt[2], Kr: i.Wt[3] } : i.Wt[3];
  }
  qa(t) {
    const i = [];
    Yt(this.fa, Kt, "top", i);
    const n = this.ua;
    return null !== n && n.It() ? (null === this.da && n.Ve() && (this.da = setTimeout((() => {
      this.da = null, this.Qt().Ya();
    }), 0)), n.Ie(), i.unshift(n), i) : i;
  }
  jn() {
    const t = [];
    this.Ka() || t.push(this._a), t.push(this.Yh, this.dr);
    const i = this.oa.map(((t2) => t2.wr()));
    return t.push(...i), Yt(this.fa, Kt, "normal", t), t;
  }
  Ga() {
    const t = this.Yh.Ga?.() ?? null;
    if (null === t) return null;
    const i = [];
    this.Ka() || i.push(this._a), i.push(...t.Za), Yt(this.fa, Kt, "normal", i);
    const n = [];
    n.push(...t.qa, this.dr);
    const s = this.oa.map(((t2) => t2.wr()));
    return n.push(...s), { Za: i, qa: n };
  }
  Xa() {
    return this.Ja(Kt, "bottom");
  }
  Qa(t) {
    return this.Ja(Gt, t);
  }
  tl(t) {
    return this.Ja(Zt, t);
  }
  il(t, i) {
    return this.fa.map(((n) => n.Qs(t, i))).filter(((t2) => null !== t2));
  }
  cn() {
    return [this.pr, ...this.oa.map(((t) => t.Mr()))];
  }
  qn(t, i) {
    if (i !== this.hn && !this.Ka()) return [];
    const n = [...this.mn];
    for (const t2 of this.oa) n.push(t2.gr());
    return this.fa.forEach(((t2) => {
      n.push(...t2.qn());
    })), n;
  }
  dn() {
    const t = [];
    return this.fa.forEach(((i) => {
      t.push(...i.dn());
    })), t;
  }
  la(t, i) {
    if (void 0 !== this.yn.autoscaleInfoProvider) {
      const n = this.yn.autoscaleInfoProvider((() => {
        const n2 = this.nl(t, i);
        return null === n2 ? null : n2.sr();
      }));
      return wt.er(n);
    }
    return this.nl(t, i);
  }
  Kh() {
    const t = this.yn.priceFormat;
    return t.base ?? 1 / t.minMove;
  }
  sl() {
    return this.el;
  }
  Nn() {
    this.Yh.Pt();
    for (const t of this.mn) t.Pt();
    for (const t of this.oa) t.Pt();
    this.dr.Pt(), this._a.Pt(), this.ua?.Pt(), this.fa.forEach(((t) => t.Nn()));
  }
  Ft() {
    return u(super.Ft());
  }
  At(t) {
    if (!(("Line" === this.wa || "Area" === this.wa || "Baseline" === this.wa) && this.yn.crosshairMarkerVisible)) return null;
    const i = this.qt.Mh(t);
    if (null === i) return null;
    return { Mt: i.Wt[3], ft: this.rl(), Ht: this.hl(), Ot: this.al(), zt: this.ll(t) };
  }
  He() {
    return this.yn.title;
  }
  It() {
    return this.yn.visible;
  }
  ol(t) {
    this.fa.push(new qt(t, this));
  }
  _l(t) {
    this.fa = this.fa.filter(((i) => i.Qh() !== t));
  }
  ul() {
    if ("Custom" === this.wa) return (t) => this.Yh.Ha(t);
  }
  cl() {
    if ("Custom" === this.wa) return (t) => this.Yh.dl(t);
  }
  fl() {
    return this.qt.Lh();
  }
  Ka() {
    return !Z(this.Ft().pl());
  }
  nl(t, i) {
    if (!v(t) || !v(i) || this.qt.Zi()) return null;
    const n = "Line" === this.wa || "Area" === this.wa || "Baseline" === this.wa || "Histogram" === this.wa ? [3] : [2, 1], s = this.qt.Eh(t, i, n);
    let e2 = null !== s ? new mt(s.Uh, s.$h) : null, r2 = null;
    if ("Histogram" === this.bh()) {
      const t2 = this.yn.base, i2 = new mt(t2, t2);
      e2 = null !== e2 ? e2.Ss(i2) : i2;
    }
    return this.fa.forEach(((n2) => {
      const s2 = n2.la(t, i);
      if (s2?.priceRange) {
        const t2 = new mt(s2.priceRange.minValue, s2.priceRange.maxValue);
        e2 = null !== e2 ? e2.Ss(t2) : t2;
      }
      s2?.margins && (r2 = s2.margins);
    })), new wt(e2, r2);
  }
  rl() {
    switch (this.wa) {
      case "Line":
      case "Area":
      case "Baseline":
        return this.yn.crosshairMarkerRadius;
    }
    return 0;
  }
  hl() {
    switch (this.wa) {
      case "Line":
      case "Area":
      case "Baseline": {
        const t = this.yn.crosshairMarkerBorderColor;
        if (0 !== t.length) return t;
      }
    }
    return null;
  }
  al() {
    switch (this.wa) {
      case "Line":
      case "Area":
      case "Baseline":
        return this.yn.crosshairMarkerBorderWidth;
    }
    return 0;
  }
  ll(t) {
    switch (this.wa) {
      case "Line":
      case "Area":
      case "Baseline": {
        const t2 = this.yn.crosshairMarkerBackgroundColor;
        if (0 !== t2.length) return t2;
      }
    }
    return this.Sa().Sh(t).sh;
  }
  Ma() {
    switch (this.yn.priceFormat.type) {
      case "custom": {
        const t = this.yn.priceFormat.formatter;
        this.el = { format: t, formatTickmarks: this.yn.priceFormat.tickmarksFormatter ?? ((i) => i.map(t)) };
        break;
      }
      case "volume":
        this.el = new st(this.yn.priceFormat.precision);
        break;
      case "percent":
        this.el = new nt(this.yn.priceFormat.precision);
        break;
      default: {
        const t = Math.pow(10, this.yn.priceFormat.precision);
        this.el = new it(t, this.yn.priceFormat.minMove * t);
      }
    }
    null !== this.hn && this.hn.vl();
  }
  Ja(t, i) {
    const n = [];
    return Yt(this.fa, t, i, n), n;
  }
  Wa() {
    const { ml: t, wl: i, Ml: n } = this.gl();
    return this.pa.Sr(t, i, n);
  }
  gl() {
    const t = this.Qt().Et(), i = t.ml(), n = window.devicePixelRatio || 1, s = t.N().conflationThresholdFactor;
    return { ml: i, wl: n, Ml: this.yn.conflationThresholdFactor ?? s ?? 1 };
  }
  bl(t) {
    const i = this.qt.Bh();
    let n;
    if ("Custom" === this.wa && null !== this.ma) {
      const s2 = this.ul();
      if (!s2) throw new Error(gt);
      n = this.pa.Cr(i, t, this.ma, true, ((t2) => s2(t2)));
    } else n = this.pa.Cr(i, t);
    const s = At();
    return s.ht(n), s;
  }
  $a(t) {
    const i = this.bl(t);
    this.va.set(t, i);
  }
  Da(t) {
    if ("Custom" === this.wa && (null === this.ma || !this.ul())) return;
    this.va.clear();
    const i = this.Qt().Et().Sl();
    for (const n of i) {
      const i2 = () => {
        this.xl(n);
      }, s = "object" == typeof window && window || "object" == typeof self && self;
      s?.yl?.Cl ? s.yl.Cl((() => {
        i2();
      }), { se: t }) : Promise.resolve().then((() => i2()));
    }
  }
  xl(t) {
    if (this.va.has(t)) return;
    if (0 === this.qt.Bh().length) return;
    const i = this.bl(t);
    this.va.set(t, i);
  }
};
var Qt = [3];
var ti = [0, 1, 2, 3];
var ii = class {
  constructor(t) {
    this.yn = t;
  }
  Pl(t, i, n) {
    let s = t;
    if (0 === this.yn.mode) return s;
    const e2 = n.kn(), r2 = e2.Lt();
    if (null === r2) return s;
    const h2 = e2.Nt(t, r2), a2 = n.kl().filter(((t2) => t2 instanceof Jt)).reduce(((t2, s2) => {
      if (n.Gs(s2) || !s2.It()) return t2;
      const e3 = s2.Ft(), r3 = s2.Un();
      if (e3.Zi() || !r3.ze(i)) return t2;
      const h3 = r3.Mh(i);
      if (null === h3) return t2;
      const a3 = c(s2.Lt()), l3 = 3 === this.yn.mode ? ti : Qt;
      return t2.concat(l3.map(((t3) => e3.Nt(h3.Wt[t3], a3.Wt))));
    }), []);
    if (0 === a2.length) return s;
    a2.sort(((t2, i2) => Math.abs(t2 - h2) - Math.abs(i2 - h2)));
    const l2 = a2[0];
    return s = e2.Tn(l2, r2), s;
  }
};
function ni(t, i, n) {
  return Math.min(Math.max(t, i), n);
}
function si(t, i, n) {
  return i - t <= n;
}
var ri = class extends R {
  constructor() {
    super(...arguments), this.qt = null;
  }
  ht(t) {
    this.qt = t;
  }
  et({ context: t, bitmapSize: i, horizontalPixelRatio: n, verticalPixelRatio: s }) {
    if (null === this.qt) return;
    const e2 = Math.max(1, Math.floor(n));
    t.lineWidth = e2, (function(t2, i2) {
      t2.save(), t2.lineWidth % 2 && t2.translate(0.5, 0.5), i2(), t2.restore();
    })(t, (() => {
      const r2 = u(this.qt);
      if (r2.Tl) {
        t.strokeStyle = r2.Rl, a(t, r2.Dl), t.beginPath();
        for (const s2 of r2.Il) {
          const r3 = Math.round(s2.Vl * n);
          t.moveTo(r3, -e2), t.lineTo(r3, i.height + e2);
        }
        t.stroke();
      }
      if (r2.Bl) {
        t.strokeStyle = r2.El, a(t, r2.Al), t.beginPath();
        for (const n2 of r2.Ll) {
          const r3 = Math.round(n2.Vl * s);
          t.moveTo(-e2, r3), t.lineTo(i.width + e2, r3);
        }
        t.stroke();
      }
    }));
  }
};
var hi = class {
  constructor(t) {
    this.Xt = new ri(), this.xt = true, this.yt = t;
  }
  Pt() {
    this.xt = true;
  }
  Tt() {
    if (this.xt) {
      const t = this.yt.Qt().N().grid, i = { Bl: t.horzLines.visible, Tl: t.vertLines.visible, El: t.horzLines.color, Rl: t.vertLines.color, Al: t.horzLines.style, Dl: t.vertLines.style, Ll: this.yt.kn().zl(), Il: (this.yt.Qt().Et().zl() || []).map(((t2) => ({ Vl: t2.coord }))) };
      this.Xt.ht(i), this.xt = false;
    }
    return this.Xt;
  }
};
var ai = class {
  constructor(t) {
    this.Yh = new hi(t);
  }
  wr() {
    return this.Yh;
  }
};
var li = { Ol: 4, Nl: 1e-4 };
function oi(t, i) {
  const n = 100 * (t - i) / i;
  return i < 0 ? -n : n;
}
function _i(t, i) {
  const n = oi(t.Je(), i), s = oi(t.Qe(), i);
  return new mt(n, s);
}
function ui(t, i) {
  const n = 100 * (t - i) / i + 100;
  return i < 0 ? -n : n;
}
function ci(t, i) {
  const n = ui(t.Je(), i), s = ui(t.Qe(), i);
  return new mt(n, s);
}
function di(t, i) {
  const n = Math.abs(t);
  if (n < 1e-15) return 0;
  const s = Math.log10(n + i.Nl) + i.Ol;
  return t < 0 ? -s : s;
}
function fi(t, i) {
  const n = Math.abs(t);
  if (n < 1e-15) return 0;
  const s = Math.pow(10, n - i.Ol) - i.Nl;
  return t < 0 ? -s : s;
}
function pi(t, i) {
  if (null === t) return null;
  const n = di(t.Je(), i), s = di(t.Qe(), i);
  return new mt(n, s);
}
function vi(t, i) {
  if (null === t) return null;
  const n = fi(t.Je(), i), s = fi(t.Qe(), i);
  return new mt(n, s);
}
function mi(t) {
  if (null === t) return li;
  const i = Math.abs(t.Qe() - t.Je());
  if (i >= 1 || i < 1e-15) return li;
  const n = Math.ceil(Math.abs(Math.log10(i))), s = li.Ol + n;
  return { Ol: s, Nl: 1 / Math.pow(10, s) };
}
var wi = class {
  constructor(t, i) {
    if (this.Fl = t, this.Wl = i, (function(t2) {
      if (t2 < 0) return false;
      if (t2 > 1e18) return true;
      for (let i2 = t2; i2 > 1; i2 /= 10) if (i2 % 10 != 0) return false;
      return true;
    })(this.Fl)) this.Hl = [2, 2.5, 2];
    else {
      this.Hl = [];
      for (let t2 = this.Fl; 1 !== t2; ) {
        if (t2 % 2 == 0) this.Hl.push(2), t2 /= 2;
        else {
          if (t2 % 5 != 0) throw new Error("unexpected base");
          this.Hl.push(2, 2.5), t2 /= 5;
        }
        if (this.Hl.length > 100) throw new Error("something wrong with base");
      }
    }
  }
  Ul(t, i, n) {
    const s = 0 === this.Fl ? 0 : 1 / this.Fl;
    let e2 = Math.pow(10, Math.max(0, Math.ceil(Math.log10(t - i)))), r2 = 0, h2 = this.Wl[0];
    for (; ; ) {
      const t2 = si(e2, s, 1e-14) && e2 > s + 1e-14, i2 = si(e2, n * h2, 1e-14), a3 = si(e2, 1, 1e-14);
      if (!(t2 && i2 && a3)) break;
      e2 /= h2, h2 = this.Wl[++r2 % this.Wl.length];
    }
    if (e2 <= s + 1e-14 && (e2 = s), e2 = Math.max(1, e2), this.Hl.length > 0 && (a2 = e2, l2 = 1, o2 = 1e-14, Math.abs(a2 - l2) < o2)) for (r2 = 0, h2 = this.Hl[0]; si(e2, n * h2, 1e-14) && e2 > s + 1e-14; ) e2 /= h2, h2 = this.Hl[++r2 % this.Hl.length];
    var a2, l2, o2;
    return e2;
  }
};
var Mi = class {
  constructor(t, i, n, s) {
    this.$l = [], this.Ki = t, this.Fl = i, this.jl = n, this.ql = s;
  }
  Ul(t, i) {
    if (t < i) throw new Error("high < low");
    const n = this.Ki.$t(), s = (t - i) * this.Yl() / n, e2 = new wi(this.Fl, [2, 2.5, 2]), r2 = new wi(this.Fl, [2, 2, 2.5]), h2 = new wi(this.Fl, [2.5, 2, 2]), a2 = [];
    return a2.push(e2.Ul(t, i, s), r2.Ul(t, i, s), h2.Ul(t, i, s)), (function(t2) {
      if (t2.length < 1) throw Error("array is empty");
      let i2 = t2[0];
      for (let n2 = 1; n2 < t2.length; ++n2) t2[n2] < i2 && (i2 = t2[n2]);
      return i2;
    })(a2);
  }
  Kl() {
    const t = this.Ki, i = t.Lt();
    if (null === i) return void (this.$l = []);
    const n = t.$t(), s = this.jl(n - 1, i), e2 = this.jl(0, i), r2 = this.Ki.N().entireTextOnly ? this.Gl() / 2 : 0, h2 = r2, a2 = n - 1 - r2, l2 = Math.max(s, e2), o2 = Math.min(s, e2);
    if (l2 === o2) return void (this.$l = []);
    const _2 = this.Ul(l2, o2);
    if (this.Zl(i, _2, l2, o2, h2, a2), t.Xl() && this.Jl(_2, o2, l2)) {
      const t2 = this.Ki.Ql();
      this.io(i, _2, h2, a2, t2, 2 * t2);
    }
    const u2 = this.$l.map(((t2) => t2.no)), c2 = this.Ki.so(u2);
    for (let t2 = 0; t2 < this.$l.length; t2++) this.$l[t2].eo = c2[t2];
  }
  zl() {
    return this.$l;
  }
  Gl() {
    return this.Ki.P();
  }
  Yl() {
    return Math.ceil(this.Gl() * this.Ki.N().tickMarkDensity);
  }
  Zl(t, i, n, s, e2, r2) {
    const h2 = this.$l, a2 = this.Ki;
    let l2 = n % i;
    l2 += l2 < 0 ? i : 0;
    const o2 = n >= s ? 1 : -1;
    let _2 = null, u2 = 0;
    for (let c2 = n - l2; c2 > s; c2 -= i) {
      const n2 = this.ql(c2, t, true);
      null !== _2 && Math.abs(n2 - _2) < this.Yl() || (n2 < e2 || n2 > r2 || (u2 < h2.length ? (h2[u2].Vl = n2, h2[u2].eo = a2.ro(c2), h2[u2].no = c2) : h2.push({ Vl: n2, eo: a2.ro(c2), no: c2 }), u2++, _2 = n2, a2.ho() && (i = this.Ul(c2 * o2, s))));
    }
    h2.length = u2;
  }
  io(t, i, n, s, e2, r2) {
    const h2 = this.$l, a2 = this.ao(t, n, e2, r2), l2 = this.ao(t, s, -r2, -e2), o2 = this.ql(0, t, true) - this.ql(i, t, true);
    h2.length > 0 && h2[0].Vl - a2.Vl < o2 / 2 && h2.shift(), h2.length > 0 && l2.Vl - h2[h2.length - 1].Vl < o2 / 2 && h2.pop(), h2.unshift(a2), h2.push(l2);
  }
  ao(t, i, n, s) {
    const e2 = (n + s) / 2, r2 = this.jl(i + n, t), h2 = this.jl(i + s, t), a2 = Math.min(r2, h2), l2 = Math.max(r2, h2), o2 = Math.max(0.1, this.Ul(l2, a2)), _2 = this.jl(i + e2, t), u2 = _2 - _2 % o2, c2 = this.ql(u2, t, true);
    return { eo: this.Ki.ro(u2), Vl: c2, no: u2 };
  }
  Jl(t, i, n) {
    let s = c(this.Ki.ar());
    return this.Ki.ho() && (s = vi(s, this.Ki.lo())), s.Je() - i < t && n - s.Qe() < t;
  }
};
function gi(t) {
  return t.slice().sort(((t2, i) => u(t2.ln()) - u(i.ln())));
}
var bi;
!(function(t) {
  t[t.Normal = 0] = "Normal", t[t.Logarithmic = 1] = "Logarithmic", t[t.Percentage = 2] = "Percentage", t[t.IndexedTo100 = 3] = "IndexedTo100";
})(bi || (bi = {}));
var Si = new nt();
var xi = new it(100, 1);
var Ci = class {
  constructor(t, i, n, s, e2) {
    this.oo = 0, this._o = null, this.rr = null, this.uo = null, this.co = { do: false, fo: null }, this.po = false, this.vo = 0, this.mo = 0, this.wo = new d(), this.Mo = new d(), this.bo = [], this.So = null, this.xo = null, this.Co = null, this.yo = null, this.Po = null, this.el = xi, this.ko = mi(null), this.To = t, this.yn = i, this.Ro = n, this.Do = s, this.Io = e2, this.Vo = new Mi(this, 100, this.Bo.bind(this), this.Eo.bind(this));
  }
  pl() {
    return this.To;
  }
  N() {
    return this.yn;
  }
  vr(t) {
    if (f(this.yn, t), this.vl(), void 0 !== t.mode && this.Ao({ _e: t.mode }), void 0 !== t.scaleMargins) {
      const i = _(t.scaleMargins.top), n = _(t.scaleMargins.bottom);
      if (i < 0 || i > 1) throw new Error(`Invalid top margin - expect value between 0 and 1, given=${i}`);
      if (n < 0 || n > 1) throw new Error(`Invalid bottom margin - expect value between 0 and 1, given=${n}`);
      if (i + n > 1) throw new Error(`Invalid margins - sum of margins must be less than 1, given=${i + n}`);
      this.Lo(), this.Co = null;
    }
  }
  zo() {
    return this.yn.autoScale;
  }
  Oo() {
    return this.po;
  }
  ho() {
    return 1 === this.yn.mode;
  }
  je() {
    return 2 === this.yn.mode;
  }
  No() {
    return 3 === this.yn.mode;
  }
  lo() {
    return this.ko;
  }
  _e() {
    return { hs: this.yn.autoScale, Fo: this.yn.invertScale, _e: this.yn.mode };
  }
  Ao(t) {
    const i = this._e();
    let n = null;
    void 0 !== t.hs && (this.yn.autoScale = t.hs), void 0 !== t._e && (this.yn.mode = t._e, 2 !== t._e && 3 !== t._e || (this.yn.autoScale = true), this.co.do = false), 1 === i._e && t._e !== i._e && (!(function(t2, i2) {
      if (null === t2) return false;
      const n2 = fi(t2.Je(), i2), s2 = fi(t2.Qe(), i2);
      return isFinite(n2) && isFinite(s2);
    })(this.rr, this.ko) ? this.yn.autoScale = true : (n = vi(this.rr, this.ko), null !== n && this.Wo(n))), 1 === t._e && t._e !== i._e && (n = pi(this.rr, this.ko), null !== n && this.Wo(n));
    const s = i._e !== this.yn.mode;
    s && (2 === i._e || this.je()) && this.vl(), s && (3 === i._e || this.No()) && this.vl(), void 0 !== t.Fo && i.Fo !== t.Fo && (this.yn.invertScale = t.Fo, this.Ho()), this.Mo.p(i, this._e());
  }
  Uo() {
    return this.Mo;
  }
  P() {
    return this.Ro.fontSize;
  }
  $t() {
    return this.oo;
  }
  $o(t) {
    this.oo !== t && (this.oo = t, this.Lo(), this.Co = null);
  }
  jo() {
    if (this._o) return this._o;
    const t = this.$t() - this.qo() - this.Yo();
    return this._o = t, t;
  }
  ar() {
    return this.Ko(), this.rr;
  }
  Wo(t, i) {
    const n = this.rr;
    (i || null === n && null !== t || null !== n && !n.Ze(t)) && (this.Co = null, this.rr = t);
  }
  Go(t) {
    this.Wo(t), this.Zo(null !== t);
  }
  Zi() {
    return this.Ko(), 0 === this.oo || !this.rr || this.rr.Zi();
  }
  Xo(t) {
    return this.Fo() ? t : this.$t() - 1 - t;
  }
  Nt(t, i) {
    return this.je() ? t = oi(t, i) : this.No() && (t = ui(t, i)), this.Eo(t, i);
  }
  Jo(t, i, n) {
    this.Ko();
    const s = this.Yo(), e2 = u(this.ar()), r2 = e2.Je(), h2 = e2.Qe(), a2 = this.jo() - 1, l2 = this.Fo(), o2 = a2 / (h2 - r2), _2 = void 0 === n ? 0 : n.from, c2 = void 0 === n ? t.length : n.to, d2 = this.Qo();
    for (let n2 = _2; n2 < c2; n2++) {
      const e3 = t[n2], h3 = e3.Mt;
      if (isNaN(h3)) continue;
      let a3 = h3;
      null !== d2 && (a3 = d2(e3.Mt, i));
      const _3 = s + o2 * (a3 - r2), u2 = l2 ? _3 : this.oo - 1 - _3;
      e3.ut = u2;
    }
  }
  t_(t, i, n) {
    this.Ko();
    const s = this.Yo(), e2 = u(this.ar()), r2 = e2.Je(), h2 = e2.Qe(), a2 = this.jo() - 1, l2 = this.Fo(), o2 = a2 / (h2 - r2), _2 = void 0 === n ? 0 : n.from, c2 = void 0 === n ? t.length : n.to, d2 = this.Qo();
    for (let n2 = _2; n2 < c2; n2++) {
      const e3 = t[n2];
      let h3 = e3.jr, a3 = e3.qr, _3 = e3.Yr, u2 = e3.Kr;
      null !== d2 && (h3 = d2(e3.jr, i), a3 = d2(e3.qr, i), _3 = d2(e3.Yr, i), u2 = d2(e3.Kr, i));
      let c3 = s + o2 * (h3 - r2), f2 = l2 ? c3 : this.oo - 1 - c3;
      e3.i_ = f2, c3 = s + o2 * (a3 - r2), f2 = l2 ? c3 : this.oo - 1 - c3, e3.n_ = f2, c3 = s + o2 * (_3 - r2), f2 = l2 ? c3 : this.oo - 1 - c3, e3.s_ = f2, c3 = s + o2 * (u2 - r2), f2 = l2 ? c3 : this.oo - 1 - c3, e3.e_ = f2;
    }
  }
  Tn(t, i) {
    const n = this.Bo(t, i);
    return this.r_(n, i);
  }
  r_(t, i) {
    let n = t;
    return this.je() ? n = (function(t2, i2) {
      return i2 < 0 && (t2 = -t2), t2 / 100 * i2 + i2;
    })(n, i) : this.No() && (n = (function(t2, i2) {
      return t2 -= 100, i2 < 0 && (t2 = -t2), t2 / 100 * i2 + i2;
    })(n, i)), n;
  }
  kl() {
    return this.bo;
  }
  Dt() {
    return this.xo || (this.xo = gi(this.bo)), this.xo;
  }
  h_(t) {
    -1 === this.bo.indexOf(t) && (this.bo.push(t), this.vl(), this.a_());
  }
  l_(t) {
    const i = this.bo.indexOf(t);
    if (-1 === i) throw new Error("source is not attached to scale");
    this.bo.splice(i, 1), 0 === this.bo.length && (this.Ao({ hs: true }), this.Wo(null)), this.vl(), this.a_();
  }
  Lt() {
    let t = null;
    for (const i of this.bo) {
      const n = i.Lt();
      null !== n && ((null === t || n.Oa < t.Oa) && (t = n));
    }
    return null === t ? null : t.Wt;
  }
  Fo() {
    return this.yn.invertScale;
  }
  zl() {
    const t = null === this.Lt();
    if (null !== this.Co && (t || this.Co.o_ === t)) return this.Co.zl;
    this.Vo.Kl();
    const i = this.Vo.zl();
    return this.Co = { zl: i, o_: t }, this.wo.p(), i;
  }
  __() {
    return this.wo;
  }
  u_(t) {
    this.je() || this.No() || null === this.yo && null === this.uo && (this.Zi() || (this.yo = this.oo - t, this.uo = u(this.ar()).Xe()));
  }
  c_(t) {
    if (this.je() || this.No()) return;
    if (null === this.yo) return;
    this.Ao({ hs: false }), (t = this.oo - t) < 0 && (t = 0);
    let i = (this.yo + 0.2 * (this.oo - 1)) / (t + 0.2 * (this.oo - 1));
    const n = u(this.uo).Xe();
    i = Math.max(i, 0.1), n.ir(i), this.Wo(n);
  }
  d_() {
    this.je() || this.No() || (this.yo = null, this.uo = null);
  }
  f_(t) {
    this.zo() || null === this.Po && null === this.uo && (this.Zi() || (this.Po = t, this.uo = u(this.ar()).Xe()));
  }
  p_(t) {
    if (this.zo()) return;
    if (null === this.Po) return;
    const i = u(this.ar()).tr() / (this.jo() - 1);
    let n = t - this.Po;
    this.Fo() && (n *= -1);
    const s = n * i, e2 = u(this.uo).Xe();
    e2.nr(s), this.Wo(e2, true), this.Co = null;
  }
  v_() {
    this.zo() || null !== this.Po && (this.Po = null, this.uo = null);
  }
  sl() {
    return this.el || this.vl(), this.el;
  }
  Ji(t, i) {
    switch (this.yn.mode) {
      case 2:
        return this.m_(oi(t, i));
      case 3:
        return this.sl().format(ui(t, i));
      default:
        return this.cr(t);
    }
  }
  ro(t) {
    switch (this.yn.mode) {
      case 2:
        return this.m_(t);
      case 3:
        return this.sl().format(t);
      default:
        return this.cr(t);
    }
  }
  so(t) {
    switch (this.yn.mode) {
      case 2:
        return this.w_(t);
      case 3:
        return this.sl().formatTickmarks(t);
      default:
        return this.M_(t);
    }
  }
  xa(t) {
    return this.cr(t, u(this.So).sl());
  }
  Ca(t, i) {
    return t = oi(t, i), this.m_(t, Si);
  }
  g_() {
    return this.bo;
  }
  b_(t) {
    this.co = { fo: t, do: false };
  }
  Nn() {
    this.bo.forEach(((t) => t.Nn()));
  }
  Xl() {
    return this.yn.ensureEdgeTickMarksVisible && this.zo();
  }
  Ql() {
    return this.P() / 2;
  }
  vl() {
    this.Co = null;
    let t = 1 / 0;
    this.So = null;
    for (const i2 of this.bo) i2.ln() < t && (t = i2.ln(), this.So = i2);
    let i = 100;
    null !== this.So && (i = Math.round(this.So.Kh())), this.el = xi, this.je() ? (this.el = Si, i = 100) : this.No() ? (this.el = new it(100, 1), i = 100) : null !== this.So && (this.el = this.So.sl()), this.Vo = new Mi(this, i, this.Bo.bind(this), this.Eo.bind(this)), this.Vo.Kl();
  }
  a_() {
    this.xo = null;
  }
  S_() {
    return null === this.So || this.je() || this.No() ? 1 : 1 / this.So.Kh();
  }
  Xi() {
    return this.Io;
  }
  Zo(t) {
    this.po = t;
  }
  qo() {
    return this.Fo() ? this.yn.scaleMargins.bottom * this.$t() + this.mo : this.yn.scaleMargins.top * this.$t() + this.vo;
  }
  Yo() {
    return this.Fo() ? this.yn.scaleMargins.top * this.$t() + this.vo : this.yn.scaleMargins.bottom * this.$t() + this.mo;
  }
  Ko() {
    this.co.do || (this.co.do = true, this.x_());
  }
  Lo() {
    this._o = null;
  }
  Eo(t, i) {
    if (this.Ko(), this.Zi()) return 0;
    t = this.ho() && t ? di(t, this.ko) : t;
    const n = u(this.ar()), s = this.Yo() + (this.jo() - 1) * (t - n.Je()) / n.tr();
    return this.Xo(s);
  }
  Bo(t, i) {
    if (this.Ko(), this.Zi()) return 0;
    const n = this.Xo(t), s = u(this.ar()), e2 = s.Je() + s.tr() * ((n - this.Yo()) / (this.jo() - 1));
    return this.ho() ? fi(e2, this.ko) : e2;
  }
  Ho() {
    this.Co = null, this.Vo.Kl();
  }
  x_() {
    if (this.Oo() && !this.zo()) return;
    const t = this.co.fo;
    if (null === t) return;
    let i = null;
    const n = this.g_();
    let s = 0, e2 = 0;
    for (const r3 of n) {
      if (!r3.It()) continue;
      const n2 = r3.Lt();
      if (null === n2) continue;
      const h3 = r3.la(t.Na(), t.bi());
      let a2 = h3 && h3.ar();
      if (null !== a2) {
        switch (this.yn.mode) {
          case 1:
            a2 = pi(a2, this.ko);
            break;
          case 2:
            a2 = _i(a2, n2.Wt);
            break;
          case 3:
            a2 = ci(a2, n2.Wt);
        }
        if (i = null === i ? a2 : i.Ss(u(a2)), null !== h3) {
          const t2 = h3.lr();
          null !== t2 && (s = Math.max(s, t2.above), e2 = Math.max(e2, t2.below));
        }
      }
    }
    if (this.Xl() && (s = Math.max(s, this.Ql()), e2 = Math.max(e2, this.Ql())), s === this.vo && e2 === this.mo || (this.vo = s, this.mo = e2, this.Co = null, this.Lo()), null !== i) {
      if (i.Je() === i.Qe()) {
        const t2 = 5 * this.S_();
        this.ho() && (i = vi(i, this.ko)), i = new mt(i.Je() - t2, i.Qe() + t2), this.ho() && (i = pi(i, this.ko));
      }
      if (this.ho()) {
        const t2 = vi(i, this.ko), n2 = mi(t2);
        if (r2 = n2, h2 = this.ko, r2.Ol !== h2.Ol || r2.Nl !== h2.Nl) {
          const s2 = null !== this.uo ? vi(this.uo, this.ko) : null;
          this.ko = n2, i = pi(t2, n2), null !== s2 && (this.uo = pi(s2, n2));
        }
      }
      this.Wo(i);
    } else null === this.rr && (this.Wo(new mt(-0.5, 0.5)), this.ko = mi(null));
    var r2, h2;
  }
  Qo() {
    return this.je() ? oi : this.No() ? ui : this.ho() ? (t) => di(t, this.ko) : null;
  }
  C_(t, i, n) {
    return void 0 === i ? (void 0 === n && (n = this.sl()), n.format(t)) : i(t);
  }
  y_(t, i, n) {
    return void 0 === i ? (void 0 === n && (n = this.sl()), n.formatTickmarks(t)) : i(t);
  }
  cr(t, i) {
    return this.C_(t, this.Do.priceFormatter, i);
  }
  M_(t, i) {
    const n = this.Do.priceFormatter;
    return this.y_(t, this.Do.tickmarksPriceFormatter ?? (n ? (t2) => t2.map(n) : void 0), i);
  }
  m_(t, i) {
    return this.C_(t, this.Do.percentageFormatter, i);
  }
  w_(t, i) {
    const n = this.Do.percentageFormatter;
    return this.y_(t, this.Do.tickmarksPercentageFormatter ?? (n ? (t2) => t2.map(n) : void 0), i);
  }
};
function yi(t) {
  return t instanceof Jt;
}
var Pi = class {
  constructor(t, i) {
    this.bo = [], this.P_ = /* @__PURE__ */ new Map(), this.oo = 0, this.k_ = 0, this.T_ = 1, this.xo = null, this.R_ = null, this.D_ = false, this.I_ = new d(), this.fa = [], this.ia = t, this.sn = i, this.V_ = new ai(this);
    const n = i.N();
    this.B_ = this.E_("left", n.leftPriceScale), this.A_ = this.E_("right", n.rightPriceScale), this.B_.Uo().i(this.L_.bind(this, this.B_), this), this.A_.Uo().i(this.L_.bind(this, this.A_), this), this.z_(n);
  }
  z_(t) {
    if (t.leftPriceScale && this.B_.vr(t.leftPriceScale), t.rightPriceScale && this.A_.vr(t.rightPriceScale), t.localization && (this.B_.vl(), this.A_.vl()), t.overlayPriceScales) {
      const i = Array.from(this.P_.values());
      for (const n of i) {
        const i2 = u(n[0].Ft());
        i2.vr(t.overlayPriceScales), t.localization && i2.vl();
      }
    }
  }
  O_(t) {
    switch (t) {
      case "left":
        return this.B_;
      case "right":
        return this.A_;
    }
    return this.P_.has(t) ? _(this.P_.get(t))[0].Ft() : null;
  }
  m() {
    this.Qt().N_().u(this), this.B_.Uo().u(this), this.A_.Uo().u(this), this.bo.forEach(((t) => {
      t.m && t.m();
    })), this.fa = this.fa.filter(((t) => {
      const i = t.Qh();
      return i.detached && i.detached(), false;
    })), this.I_.p();
  }
  F_() {
    return this.T_;
  }
  W_(t) {
    this.T_ = t;
  }
  Qt() {
    return this.sn;
  }
  nn() {
    return this.k_;
  }
  $t() {
    return this.oo;
  }
  H_(t) {
    this.k_ = t, this.U_();
  }
  $o(t) {
    this.oo = t, this.B_.$o(t), this.A_.$o(t), this.bo.forEach(((i) => {
      if (this.Gs(i)) {
        const n = i.Ft();
        null !== n && n.$o(t);
      }
    })), this.U_();
  }
  j_(t) {
    this.D_ = t;
  }
  q_() {
    return this.D_;
  }
  Y_() {
    return this.bo.filter(yi);
  }
  kl() {
    return this.bo;
  }
  Gs(t) {
    const i = t.Ft();
    return null === i || this.B_ !== i && this.A_ !== i;
  }
  h_(t, i, n) {
    this.K_(t, i, n ? t.ln() : this.bo.length);
  }
  l_(t, i) {
    const n = this.bo.indexOf(t);
    o(-1 !== n, "removeDataSource: invalid data source"), this.bo.splice(n, 1), i || this.bo.forEach(((t2, i2) => t2._n(i2)));
    const s = u(t.Ft()).pl();
    if (this.P_.has(s)) {
      const i2 = _(this.P_.get(s)), n2 = i2.indexOf(t);
      -1 !== n2 && (i2.splice(n2, 1), 0 === i2.length && this.P_.delete(s));
    }
    const e2 = t.Ft();
    e2 && e2.kl().indexOf(t) >= 0 && (e2.l_(t), this.G_(e2)), this.Z_();
  }
  Xs(t) {
    return t === this.B_ ? "left" : t === this.A_ ? "right" : "overlay";
  }
  X_() {
    return this.B_;
  }
  J_() {
    return this.A_;
  }
  Q_(t, i) {
    t.u_(i);
  }
  tu(t, i) {
    t.c_(i), this.U_();
  }
  iu(t) {
    t.d_();
  }
  nu(t, i) {
    t.f_(i);
  }
  su(t, i) {
    t.p_(i), this.U_();
  }
  eu(t) {
    t.v_();
  }
  U_() {
    this.bo.forEach(((t) => {
      t.Nn();
    }));
  }
  kn() {
    const [t, i] = this.ru();
    let n = null;
    return t.N().visible && 0 !== t.kl().length ? n = t : i.N().visible && 0 !== i.kl().length ? n = i : 0 !== this.bo.length && (n = this.bo[0].Ft()), null === n && (n = this.Zs() ?? t), n;
  }
  Zs() {
    const [t, i] = this.ru();
    return t.N().visible ? t : i.N().visible ? i : null;
  }
  G_(t) {
    null !== t && t.zo() && this.hu(t);
  }
  au(t) {
    const i = this.ia.Ee();
    t.Ao({ hs: true }), null !== i && t.b_(i), this.U_();
  }
  lu() {
    this.hu(this.B_), this.hu(this.A_);
  }
  ou() {
    this.G_(this.B_), this.G_(this.A_), this.bo.forEach(((t) => {
      this.Gs(t) && this.G_(t.Ft());
    })), this.U_(), this.sn.mr();
  }
  Dt() {
    return null === this.xo && (this.xo = gi(this.bo)), this.xo;
  }
  _u() {
    const t = this.Dt(), i = this.sn.cu()?.uu, n = this.sn.N().hoveredSeriesOnTop, s = this.R_;
    if (null !== s && s.Kh === t && s.du === i && s.fu === n) return s.pu;
    const e2 = (function(t2, i2, n2) {
      if (!n2) return t2;
      const s2 = t2.indexOf(i2);
      if (-1 === s2 || s2 === t2.length - 1) return t2;
      const e3 = [];
      for (let i3 = 0; i3 < t2.length; i3++) i3 !== s2 && e3.push(t2[i3]);
      return e3.push(t2[s2]), e3;
    })(t, i, n);
    return this.R_ = { Kh: t, du: i, fu: n, pu: e2 }, e2;
  }
  vu(t, i) {
    i = ni(i, 0, this.bo.length - 1);
    const n = this.bo.indexOf(t);
    o(-1 !== n, "setSeriesOrder: invalid data source"), this.bo.splice(n, 1), this.bo.splice(i, 0, t), this.bo.forEach(((t2, i2) => t2._n(i2))), this.Z_();
    for (const t2 of [this.B_, this.A_]) t2.a_(), t2.vl();
    this.sn.mr();
  }
  Vt() {
    return this.Dt().filter(yi);
  }
  mu() {
    return this.I_;
  }
  wu() {
    return this.V_;
  }
  ol(t) {
    this.fa.push(new Ft(t));
  }
  _l(t) {
    this.fa = this.fa.filter(((i) => i.Qh() !== t)), t.detached && t.detached(), this.sn.mr();
  }
  Mu() {
    return this.fa;
  }
  il(t, i) {
    return this.fa.map(((n) => n.Qs(t, i))).filter(((t2) => null !== t2));
  }
  hu(t) {
    const i = t.g_();
    if (i && i.length > 0 && !this.ia.Zi()) {
      const i2 = this.ia.Ee();
      null !== i2 && t.b_(i2);
    }
    t.Nn();
  }
  K_(t, i, n) {
    let s = this.O_(i);
    if (null === s && (s = this.E_(i, this.sn.N().overlayPriceScales)), this.bo.splice(n, 0, t), !Z(i)) {
      const n2 = this.P_.get(i) || [];
      n2.push(t), this.P_.set(i, n2);
    }
    t._n(n), s.h_(t), t.un(s), this.G_(s), this.Z_();
  }
  Z_() {
    this.xo = null, this.R_ = null;
  }
  ru() {
    return "left" === this.sn.N().defaultVisiblePriceScaleId ? [this.B_, this.A_] : [this.A_, this.B_];
  }
  L_(t, i, n) {
    i._e !== n._e && this.hu(t);
  }
  E_(t, i) {
    const n = { visible: true, autoScale: true, ...M(i) }, s = new Ci(t, n, this.sn.N().layout, this.sn.N().localization, this.sn.Xi());
    return s.$o(this.$t()), s;
  }
};
function ki(t, i) {
  return null === i || (2 === t.se && 2 !== i.se || (2 !== i.se || 2 === t.se) && (t.ne !== i.ne && t.ne < i.ne));
}
function Ti(t) {
  return { te: t.te, ie: t.ie };
}
function Ri(t) {
  return { ne: t.distance ?? 0, se: t.hitTestPriority ?? ("marker" === t.itemType ? 2 : 0), ee: t.itemType ?? "primitive", gu: t.cursorStyle, te: t.externalId };
}
function Di(t) {
  return { uu: t.uu, bu: Ti(t.Su), gu: t.Su.gu, ee: t.Su.ee ?? "primitive" };
}
function Ii(t, i, n, s) {
  let e2 = null;
  for (const r2 of t) {
    let t2 = r2.Qs?.(i, n, s) ?? null;
    if (null === t2) {
      const e3 = r2.Tt(s);
      t2 = null !== e3 && e3.Qs ? e3.Qs(i, n) : null;
    }
    if (null !== t2) {
      const i2 = { xu: r2, Su: t2 };
      (null === e2 || ki(i2.Su, e2.Su)) && (e2 = i2);
    }
  }
  return e2;
}
function Vi(t) {
  return void 0 !== t.jn;
}
function Bi(t, i, n) {
  const s = [t, ...t.Dt()].reverse(), e2 = (function(t2, i2, n2) {
    let s2, e3, r3;
    for (const l2 of t2) {
      const t3 = l2.il?.(i2, n2) ?? [];
      for (const i3 of t3) {
        const t4 = Ri(i3);
        h3 = i3.zOrder, a2 = s2?.zOrder, (!a2 || "top" === h3 && "top" !== a2 || "normal" === h3 && "bottom" === a2 || i3.zOrder === s2?.zOrder && void 0 !== e3 && ki(t4, e3) || i3.zOrder === s2?.zOrder && void 0 === e3) && (s2 = i3, e3 = t4, r3 = l2);
      }
    }
    var h3, a2;
    return s2 && r3 && e3 ? { Su: e3, Cu: s2, uu: r3 } : null;
  })(s, i, n);
  if ("top" === e2?.Cu.zOrder) return Di(e2);
  let r2 = null, h2 = null;
  for (const a2 of s) {
    if (e2 && e2.uu === a2 && "bottom" !== e2.Cu.zOrder && !e2.Cu.isBackground) return r2 ?? Di(e2);
    if (Vi(a2)) {
      const s2 = Ii(a2.jn(t), i, n, t);
      if (null !== s2) {
        const t2 = { uu: a2, xu: s2.xu, bu: Ti(s2.Su), gu: s2.Su.gu, ee: s2.Su.ee ?? "primitive" };
        (null === r2 || ki(s2.Su, h2)) && (r2 = t2, h2 = s2.Su);
      }
    }
    if (e2 && e2.uu === a2 && "bottom" !== e2.Cu.zOrder && e2.Cu.isBackground) return r2 ?? Di(e2);
  }
  return null !== r2 ? r2 : e2?.Cu ? Di(e2) : null;
}
var Ei = class {
  constructor(t, i, n = 50) {
    this.Vs = 0, this.Bs = 1, this.Es = 1, this.Ls = /* @__PURE__ */ new Map(), this.As = /* @__PURE__ */ new Map(), this.yu = t, this.Pu = i, this.zs = n;
  }
  ku(t) {
    const i = t.time, n = this.Pu.cacheKey(i), s = this.Ls.get(n);
    if (void 0 !== s) return s.Tu;
    if (this.Vs === this.zs) {
      const t2 = this.As.get(this.Es);
      this.As.delete(this.Es), this.Ls.delete(_(t2)), this.Es++, this.Vs--;
    }
    const e2 = this.yu(t);
    return this.Ls.set(n, { Tu: e2, Ws: this.Bs }), this.As.set(this.Bs, n), this.Vs++, this.Bs++, e2;
  }
};
var Ai = class {
  constructor(t, i) {
    o(t <= i, "right should be >= left"), this.Ru = t, this.Du = i;
  }
  Na() {
    return this.Ru;
  }
  bi() {
    return this.Du;
  }
  Iu() {
    return this.Du - this.Ru + 1;
  }
  ze(t) {
    return this.Ru <= t && t <= this.Du;
  }
  Ze(t) {
    return this.Ru === t.Na() && this.Du === t.bi();
  }
};
function Li(t, i) {
  return null === t || null === i ? t === i : t.Ze(i);
}
var zi = class {
  constructor() {
    this.Vu = /* @__PURE__ */ new Map(), this.Ls = null, this.Bu = false;
  }
  Eu(t) {
    this.Bu = t, this.Ls = null;
  }
  Au(t, i) {
    this.Lu(i), this.Ls = null;
    for (let n = i; n < t.length; ++n) {
      const i2 = t[n];
      let s = this.Vu.get(i2.timeWeight);
      void 0 === s && (s = [], this.Vu.set(i2.timeWeight, s)), s.push({ index: n, time: i2.time, weight: i2.timeWeight, originalTime: i2.originalTime });
    }
  }
  zu(t, i, n, s, e2) {
    const r2 = Math.ceil(i / t);
    return null !== this.Ls && this.Ls.Ou === r2 && e2 === this.Ls.Nu && n === this.Ls.Fu || (this.Ls = { Nu: e2, Fu: n, zl: this.Wu(r2, n, s), Ou: r2 }), this.Ls.zl;
  }
  Lu(t) {
    if (0 === t) return void this.Vu.clear();
    const i = [];
    this.Vu.forEach(((n, s) => {
      t <= n[0].index ? i.push(s) : n.splice(Rt(n, t, ((i2) => i2.index < t)), 1 / 0);
    }));
    for (const t2 of i) this.Vu.delete(t2);
  }
  Wu(t, i, n) {
    let s = [];
    const e2 = (t2) => !i || n.has(t2.index);
    for (const i2 of Array.from(this.Vu.keys()).sort(((t2, i3) => i3 - t2))) {
      if (!this.Vu.get(i2)) continue;
      const n2 = s;
      s = [];
      const r2 = n2.length;
      let h2 = 0;
      const a2 = _(this.Vu.get(i2)), l2 = a2.length;
      let o2 = 1 / 0, u2 = -1 / 0;
      for (let i3 = 0; i3 < l2; i3++) {
        const l3 = a2[i3], _2 = l3.index;
        for (; h2 < r2; ) {
          const t2 = n2[h2], i4 = t2.index;
          if (!(i4 < _2 && e2(t2))) {
            o2 = i4;
            break;
          }
          h2++, s.push(t2), u2 = i4, o2 = 1 / 0;
        }
        if (o2 - _2 >= t && _2 - u2 >= t && e2(l3)) s.push(l3), u2 = _2;
        else if (this.Bu) return n2;
      }
      for (; h2 < r2; h2++) e2(n2[h2]) && s.push(n2[h2]);
    }
    return s;
  }
};
var Oi = class _Oi {
  constructor(t) {
    this.Hu = t;
  }
  Uu() {
    return null === this.Hu ? null : new Ai(Math.floor(this.Hu.Na()), Math.ceil(this.Hu.bi()));
  }
  $u() {
    return this.Hu;
  }
  static ju() {
    return new _Oi(null);
  }
};
function Ni(t, i) {
  return t.weight > i.weight ? t : i;
}
var Fi = class {
  constructor(t, i, n, s) {
    this.k_ = 0, this.qu = null, this.Yu = [], this.Po = null, this.yo = null, this.Ku = new zi(), this.Gu = /* @__PURE__ */ new Map(), this.Zu = Oi.ju(), this.Xu = true, this.Ju = new d(), this.Qu = new d(), this.tc = new d(), this.nc = null, this.sc = null, this.ec = /* @__PURE__ */ new Map(), this.rc = -1, this.hc = [], this.ac = 1, this.yn = i, this.Do = n, this.lc = i.rightOffset, this.oc = i.barSpacing, this.sn = t, this._c(i), this.Pu = s, this.uc(), this.Ku.Eu(i.uniformDistribution), this.cc(), this.dc();
  }
  N() {
    return this.yn;
  }
  fc(t) {
    f(this.Do, t), this.vc(), this.uc();
  }
  vr(t, i) {
    f(this.yn, t), this.yn.fixLeftEdge && this.mc(), this.yn.fixRightEdge && this.wc(), void 0 !== t.barSpacing && this.sn.Ms(t.barSpacing), void 0 !== t.rightOffset && this.sn.gs(t.rightOffset), this._c(t), void 0 === t.minBarSpacing && void 0 === t.maxBarSpacing || this.sn.Ms(t.barSpacing ?? this.oc), void 0 !== t.ignoreWhitespaceIndices && t.ignoreWhitespaceIndices !== this.yn.ignoreWhitespaceIndices && this.dc(), this.vc(), this.uc(), void 0 === t.enableConflation && void 0 === t.conflationThresholdFactor || this.cc(), this.tc.p();
  }
  Rn(t) {
    return this.Yu[t]?.time ?? null;
  }
  en(t) {
    return this.Yu[t] ?? null;
  }
  Mc(t, i) {
    if (this.Yu.length < 1) return null;
    if (this.Pu.key(t) > this.Pu.key(this.Yu[this.Yu.length - 1].time)) return i ? this.Yu.length - 1 : null;
    const n = Rt(this.Yu, this.Pu.key(t), ((t2, i2) => this.Pu.key(t2.time) < i2));
    return this.Pu.key(t) < this.Pu.key(this.Yu[n].time) ? i ? n : null : n;
  }
  Zi() {
    return 0 === this.k_ || 0 === this.Yu.length || null === this.qu;
  }
  gc() {
    return this.Yu.length > 0;
  }
  Ee() {
    return this.bc(), this.Zu.Uu();
  }
  Sc() {
    return this.bc(), this.Zu.$u();
  }
  xc() {
    const t = this.Ee();
    if (null === t) return null;
    const i = { from: t.Na(), to: t.bi() };
    return this.Cc(i);
  }
  Cc(t) {
    const i = Math.round(t.from), n = Math.round(t.to), s = u(this.yc()), e2 = u(this.Pc());
    return { from: u(this.en(Math.max(s, i))), to: u(this.en(Math.min(e2, n))) };
  }
  kc(t) {
    return { from: u(this.Mc(t.from, true)), to: u(this.Mc(t.to, true)) };
  }
  nn() {
    return this.k_;
  }
  H_(t) {
    if (!isFinite(t) || t <= 0) return;
    if (this.k_ === t) return;
    const i = this.Sc(), n = this.k_;
    if (this.k_ = t, this.Xu = true, this.yn.lockVisibleTimeRangeOnResize && 0 !== n) {
      const i2 = this.oc * t / n;
      this.oc = i2;
    }
    if (this.yn.fixLeftEdge && null !== i && i.Na() <= 0) {
      const i2 = n - t;
      this.lc -= Math.round(i2 / this.oc) + 1, this.Xu = true;
    }
    this.Tc(), this.Rc();
  }
  jt(t) {
    if (this.Zi() || !v(t)) return 0;
    const i = this.Dc() + this.lc - t;
    return this.k_ - (i + 0.5) * this.oc - 1;
  }
  Ic(t, i) {
    const n = this.Dc(), s = void 0 === i ? 0 : i.from, e2 = void 0 === i ? t.length : i.to;
    for (let i2 = s; i2 < e2; i2++) {
      const s2 = t[i2].wt, e3 = n + this.lc - s2, r2 = this.k_ - (e3 + 0.5) * this.oc - 1;
      t[i2]._t = r2;
    }
  }
  Vc(t, i) {
    const n = Math.ceil(this.Bc(t));
    return i && this.yn.ignoreWhitespaceIndices && !this.Ec(n) ? this.Ac(n) : n;
  }
  gs(t) {
    this.Xu = true, this.lc = t, this.Rc(), this.sn.Lc(), this.sn.mr();
  }
  ml() {
    return this.oc;
  }
  Ms(t) {
    const i = this.oc;
    if (this.zc(t), void 0 !== this.yn.rightOffsetPixels && 0 !== i) {
      const t2 = this.lc * i / this.oc;
      this.lc = t2;
    }
    this.Rc(), this.sn.Lc(), this.sn.mr();
  }
  Oc() {
    return this.lc;
  }
  zl() {
    if (this.Zi()) return null;
    if (null !== this.sc) return this.sc;
    const t = this.oc, i = 5 * (this.sn.N().layout.fontSize + 4) / 8 * (this.yn.tickMarkMaxCharacterLength || 8), n = Math.round(i / t), s = u(this.Ee()), e2 = Math.max(s.Na(), s.Na() - n), r2 = Math.max(s.bi(), s.bi() - n), h2 = this.Ku.zu(t, i, this.yn.ignoreWhitespaceIndices, this.ec, this.rc), a2 = this.yc() + n, l2 = this.Pc() - n, o2 = this.Nc(), _2 = this.yn.fixLeftEdge || o2, c2 = this.yn.fixRightEdge || o2;
    let d2 = 0;
    for (const t2 of h2) {
      if (!(e2 <= t2.index && t2.index <= r2)) continue;
      let n2;
      d2 < this.hc.length ? (n2 = this.hc[d2], n2.coord = this.jt(t2.index), n2.label = this.Fc(t2), n2.weight = t2.weight) : (n2 = { needAlignCoordinate: false, coord: this.jt(t2.index), label: this.Fc(t2), weight: t2.weight }, this.hc.push(n2)), this.oc > i / 2 && !o2 ? n2.needAlignCoordinate = false : n2.needAlignCoordinate = _2 && t2.index <= a2 || c2 && t2.index >= l2, d2++;
    }
    return this.hc.length = d2, this.sc = this.hc, this.hc;
  }
  Wc() {
    let t;
    this.Xu = true, this.Ms(this.yn.barSpacing), t = void 0 !== this.yn.rightOffsetPixels ? this.yn.rightOffsetPixels / this.ml() : this.yn.rightOffset, this.gs(t);
  }
  Hc(t) {
    this.Xu = true, this.qu = t, this.Rc(), this.mc();
  }
  Uc(t, i) {
    const n = this.Bc(t), s = this.ml(), e2 = s + i * (s / 10);
    this.Ms(e2), this.yn.rightBarStaysOnScroll || this.gs(this.Oc() + (n - this.Bc(t)));
  }
  u_(t) {
    this.Po && this.v_(), null === this.yo && null === this.nc && (this.Zi() || (this.yo = t, this.$c()));
  }
  c_(t) {
    if (null === this.nc) return;
    const i = ni(this.k_ - t, 0, this.k_), n = ni(this.k_ - u(this.yo), 0, this.k_);
    0 !== i && 0 !== n && this.Ms(this.nc.ml * i / n);
  }
  d_() {
    null !== this.yo && (this.yo = null, this.jc());
  }
  f_(t) {
    null === this.Po && null === this.nc && (this.Zi() || (this.Po = t, this.$c()));
  }
  p_(t) {
    if (null === this.Po) return;
    const i = (this.Po - t) / this.ml();
    this.lc = u(this.nc).Oc + i, this.Xu = true, this.Rc();
  }
  v_() {
    null !== this.Po && (this.Po = null, this.jc());
  }
  qc() {
    this.Yc(this.yn.rightOffset);
  }
  Yc(t, i = 400) {
    if (!isFinite(t)) throw new RangeError("offset is required and must be finite number");
    if (!isFinite(i) || i <= 0) throw new RangeError("animationDuration (optional) must be finite positive number");
    const n = this.lc, s = performance.now();
    this.sn.ps({ Kc: (t2) => (t2 - s) / i >= 1, Gc: (e2) => {
      const r2 = (e2 - s) / i;
      return r2 >= 1 ? t : n + (t - n) * r2;
    } });
  }
  Pt(t, i) {
    this.Xu = true, this.Yu = t, this.Ku.Au(t, i), this.Rc();
  }
  Zc() {
    return this.Ju;
  }
  Xc() {
    return this.Qu;
  }
  Jc() {
    return this.tc;
  }
  Dc() {
    return this.qu || 0;
  }
  Qc(t, i) {
    const n = t.Iu(), s = i && this.yn.rightOffsetPixels || 0;
    this.zc((this.k_ - s) / n), this.lc = t.bi() - this.Dc(), i && (this.lc = s ? s / this.ml() : this.yn.rightOffset), this.Rc(), this.Xu = true, this.sn.Lc(), this.sn.mr();
  }
  td() {
    const t = this.yc(), i = this.Pc();
    if (null === t || null === i) return;
    const n = !this.yn.rightOffsetPixels && this.yn.rightOffset || 0;
    this.Qc(new Ai(t, i + n), true);
  }
  nd(t) {
    const i = new Ai(t.from, t.to);
    this.Qc(i);
  }
  rn(t) {
    return void 0 !== this.Do.timeFormatter ? this.Do.timeFormatter(t.originalTime) : this.Pu.formatHorzItem(t.time);
  }
  dc() {
    if (!this.yn.ignoreWhitespaceIndices) return;
    this.ec.clear();
    const t = this.sn.Jn();
    for (const i of t) for (const t2 of i.fl()) this.ec.set(t2, true);
    this.rc++;
  }
  sd() {
    return this.ac;
  }
  Sl() {
    const t = 1 / (window.devicePixelRatio || 1), i = this.yn.minBarSpacing;
    if (i >= t) return [1];
    const n = [1];
    let s = 2;
    for (; s <= 512; ) {
      i < t / s && n.push(s), s *= 2;
    }
    return n;
  }
  Nc() {
    const t = this.sn.N().handleScroll, i = this.sn.N().handleScale;
    return !(t.horzTouchDrag || t.mouseWheel || t.pressedMouseMove || t.vertTouchDrag || i.axisDoubleClickReset.time || i.axisPressedMouseMove.time || i.mouseWheel || i.pinch);
  }
  yc() {
    return 0 === this.Yu.length ? null : 0;
  }
  Pc() {
    return 0 === this.Yu.length ? null : this.Yu.length - 1;
  }
  ed(t) {
    return (this.k_ - 1 - t) / this.oc;
  }
  Bc(t) {
    const i = this.ed(t), n = this.Dc() + this.lc - i;
    return Math.round(1e6 * n) / 1e6;
  }
  zc(t) {
    const i = this.oc;
    this.oc = t, this.Tc(), i !== this.oc && (this.Xu = true, this.rd(), this.cc());
  }
  bc() {
    if (!this.Xu) return;
    if (this.Xu = false, this.Zi()) return void this.hd(Oi.ju());
    const t = this.Dc(), i = this.k_ / this.oc, n = this.lc + t, s = new Ai(n - i + 1, n);
    this.hd(new Oi(s));
  }
  Tc() {
    const t = ni(this.oc, this.ad(), this.ld());
    this.oc !== t && (this.oc = t, this.Xu = true);
  }
  ld() {
    return this.yn.maxBarSpacing > 0 ? this.yn.maxBarSpacing : 0.5 * this.k_;
  }
  ad() {
    return this.yn.fixLeftEdge && this.yn.fixRightEdge && 0 !== this.Yu.length ? this.k_ / this.Yu.length : this.yn.minBarSpacing;
  }
  cc() {
    if (!this.yn.enableConflation) return void (this.ac = 1);
    const t = 1 / (window.devicePixelRatio || 1) * (this.yn.conflationThresholdFactor ?? 1);
    if (this.oc >= t) return void (this.ac = 1);
    const i = t / this.oc, n = Math.pow(2, Math.floor(Math.log2(i)));
    this.ac = Math.min(n, 512);
  }
  Rc() {
    const t = this.od();
    null !== t && this.lc < t && (this.lc = t, this.Xu = true);
    const i = this._d();
    this.lc > i && (this.lc = i, this.Xu = true);
  }
  od() {
    const t = this.yc(), i = this.qu;
    if (null === t || null === i) return null;
    return t - i - 1 + (this.yn.fixLeftEdge ? this.k_ / this.oc : Math.min(2, this.Yu.length));
  }
  _d() {
    return this.yn.fixRightEdge ? 0 : this.k_ / this.oc - Math.min(2, this.Yu.length);
  }
  $c() {
    this.nc = { ml: this.ml(), Oc: this.Oc() };
  }
  jc() {
    this.nc = null;
  }
  Fc(t) {
    let i = this.Gu.get(t.weight);
    return void 0 === i && (i = new Ei(((t2) => this.ud(t2)), this.Pu), this.Gu.set(t.weight, i)), i.ku(t);
  }
  ud(t) {
    return this.Pu.formatTickmark(t, this.Do);
  }
  hd(t) {
    const i = this.Zu;
    this.Zu = t, Li(i.Uu(), this.Zu.Uu()) || this.Ju.p(), Li(i.$u(), this.Zu.$u()) || this.Qu.p(), this.rd();
  }
  rd() {
    this.sc = null;
  }
  vc() {
    this.rd(), this.Gu.clear();
  }
  uc() {
    this.Pu.updateFormatter(this.Do);
  }
  mc() {
    if (!this.yn.fixLeftEdge) return;
    const t = this.yc();
    if (null === t) return;
    const i = this.Ee();
    if (null === i) return;
    const n = i.Na() - t;
    if (n < 0) {
      const t2 = this.lc - n - 1;
      this.gs(t2);
    }
    this.Tc();
  }
  wc() {
    this.Rc(), this.Tc();
  }
  Ec(t) {
    return !this.yn.ignoreWhitespaceIndices || (this.ec.get(t) || false);
  }
  Ac(t) {
    const i = (function* (t2) {
      const i2 = Math.round(t2), n2 = i2 < t2;
      let s = 1;
      for (; ; ) n2 ? (yield i2 + s, yield i2 - s) : (yield i2 - s, yield i2 + s), s++;
    })(t), n = this.Pc();
    for (; n; ) {
      const t2 = i.next().value;
      if (this.ec.get(t2)) return t2;
      if (t2 < 0 || t2 > n) break;
    }
    return t;
  }
  _c(t) {
    if (void 0 !== t.rightOffsetPixels) {
      const i = t.rightOffsetPixels / (t.barSpacing || this.oc);
      this.sn.gs(i);
    }
  }
};
var Wi;
var Hi;
var Ui;
var $i;
var ji;
!(function(t) {
  t[t.OnTouchEnd = 0] = "OnTouchEnd", t[t.OnNextTap = 1] = "OnNextTap";
})(Wi || (Wi = {}));
var qi = class {
  constructor(t, i, n) {
    this.dd = [], this.fd = [], this.pd = null, this.k_ = 0, this.vd = null, this.md = new d(), this.wd = new d(), this.Md = null, this.gd = t, this.yn = i, this.Pu = n, this.Io = new k(this.yn.layout.colorParsers), this.bd = new C(this), this.ia = new Fi(this, i.timeScale, this.yn.localization, n), this.Ct = new G(this, i.crosshair), this.Sd = new ii(i.crosshair), i.addDefaultPane && (this.xd(0), this.dd[0].W_(2)), this.Cd = this.yd(0), this.Pd = this.yd(1);
  }
  ka() {
    this.kd(X.ys());
  }
  mr() {
    this.kd(X.Cs());
  }
  Ya() {
    this.kd(new X(1));
  }
  Ta(t) {
    const i = this.Td(t);
    this.kd(i);
  }
  cu() {
    return this.vd;
  }
  Rd(t) {
    if (this.vd?.uu === t?.uu && this.vd?.bu?.te === t?.bu?.te && this.vd?.bu?.ie === t?.bu?.ie && this.vd?.gu === t?.gu && this.vd?.ee === t?.ee) return;
    const i = this.vd;
    this.vd = t, null !== i && this.Ta(i.uu), null !== t && t.uu !== i?.uu && this.Ta(t.uu);
  }
  N() {
    return this.yn;
  }
  vr(t) {
    f(this.yn, t), this.dd.forEach(((i) => i.z_(t))), void 0 !== t.timeScale && this.ia.vr(t.timeScale), void 0 !== t.localization && this.ia.fc(t.localization), (t.leftPriceScale || t.rightPriceScale) && this.md.p(), this.Cd = this.yd(0), this.Pd = this.yd(1), this.ka();
  }
  Dd(t, i, n = 0) {
    const s = this.dd[n];
    if (void 0 === s) return;
    if ("left" === t) return f(this.yn, { leftPriceScale: i }), s.z_({ leftPriceScale: i }), this.md.p(), void this.ka();
    if ("right" === t) return f(this.yn, { rightPriceScale: i }), s.z_({ rightPriceScale: i }), this.md.p(), void this.ka();
    const e2 = this.Id(t, n);
    null !== e2 && (e2.Ft.vr(i), this.md.p());
  }
  Id(t, i) {
    const n = this.dd[i];
    if (void 0 === n) return null;
    const s = n.O_(t);
    return null !== s ? { Kn: n, Ft: s } : null;
  }
  Et() {
    return this.ia;
  }
  Gn() {
    return this.dd;
  }
  Vd() {
    return this.Ct;
  }
  Bd() {
    return this.wd;
  }
  Ed(t, i) {
    t.$o(i), this.Lc();
  }
  H_(t) {
    this.k_ = t, this.ia.H_(this.k_), this.dd.forEach(((i) => i.H_(t))), this.Lc();
  }
  Ad(t) {
    1 !== this.dd.length && (o(t >= 0 && t < this.dd.length, "Invalid pane index"), this.dd.splice(t, 1), this.ka());
  }
  Ld(t, i) {
    if (this.dd.length < 2) return;
    o(t >= 0 && t < this.dd.length, "Invalid pane index");
    const n = this.dd[t], s = this.dd.reduce(((t2, i2) => t2 + i2.F_()), 0), e2 = this.dd.reduce(((t2, i2) => t2 + i2.$t()), 0), r2 = e2 - 30 * (this.dd.length - 1);
    i = Math.min(r2, Math.max(30, i));
    const h2 = s / e2, a2 = n.$t();
    n.W_(i * h2);
    let l2 = i - a2, _2 = this.dd.length - 1;
    for (const t2 of this.dd) if (t2 !== n) {
      const i2 = Math.min(r2, Math.max(30, t2.$t() - l2 / _2));
      l2 -= t2.$t() - i2, _2 -= 1;
      const n2 = i2 * h2;
      t2.W_(n2);
    }
    this.ka();
  }
  zd(t, i) {
    o(t >= 0 && t < this.dd.length && i >= 0 && i < this.dd.length, "Invalid pane index");
    const n = this.dd[t], s = this.dd[i];
    this.dd[t] = s, this.dd[i] = n, this.ka();
  }
  Od(t, i) {
    if (o(t >= 0 && t < this.dd.length && i >= 0 && i < this.dd.length, "Invalid pane index"), t === i) return;
    const [n] = this.dd.splice(t, 1);
    this.dd.splice(i, 0, n), this.ka();
  }
  Q_(t, i, n) {
    t.Q_(i, n);
  }
  tu(t, i, n) {
    t.tu(i, n), this.Ra(), this.kd(this.Nd(t, 2));
  }
  iu(t, i) {
    t.iu(i), this.kd(this.Nd(t, 2));
  }
  nu(t, i, n) {
    i.zo() || t.nu(i, n);
  }
  su(t, i, n) {
    i.zo() || (t.su(i, n), this.Ra(), this.kd(this.Nd(t, 2)));
  }
  eu(t, i) {
    i.zo() || (t.eu(i), this.kd(this.Nd(t, 2)));
  }
  au(t, i) {
    t.au(i), this.kd(this.Nd(t, 2));
  }
  Fd(t) {
    this.ia.u_(t);
  }
  Wd(t, i) {
    const n = this.Et();
    if (n.Zi() || 0 === i) return;
    const s = n.nn();
    t = Math.max(1, Math.min(t, s)), n.Uc(t, i), this.Lc();
  }
  Hd(t) {
    this.Ud(0), this.$d(t), this.jd();
  }
  qd(t) {
    this.ia.c_(t), this.Lc();
  }
  Yd() {
    this.ia.d_(), this.mr();
  }
  Ud(t) {
    this.ia.f_(t);
  }
  $d(t) {
    this.ia.p_(t), this.Lc();
  }
  jd() {
    this.ia.v_(), this.mr();
  }
  Jn() {
    return this.fd;
  }
  Wn() {
    return null === this.pd && (this.pd = this.fd.filter(((t) => t.It()))), this.pd;
  }
  Pa() {
    this.pd = null;
  }
  Kd(t, i, n, s, e2) {
    this.Ct.In(t, i);
    let r2 = NaN, h2 = this.ia.Vc(t, true);
    const a2 = this.ia.Ee();
    null !== a2 && (h2 = Math.min(Math.max(a2.Na(), h2), a2.bi())), h2 = this.Ct.Fn(h2);
    const l2 = s.kn(), o2 = l2.Lt();
    if (null !== o2 && (r2 = l2.Tn(i, o2)), r2 = this.Sd.Pl(r2, h2, s), this.Ct.An(h2, r2, s), this.Ya(), !e2) {
      const e3 = Bi(s, t, i);
      this.Rd(e3 && { uu: e3.uu, bu: e3.bu, gu: e3.gu || null, ee: e3.ee }), this.wd.p(this.Ct.Bt(), { x: t, y: i }, n);
    }
  }
  Gd(t, i, n) {
    const s = n.kn(), e2 = s.Lt(), r2 = s.Nt(t, u(e2)), h2 = this.ia.Mc(i, true), a2 = this.ia.jt(u(h2));
    this.Kd(a2, r2, null, n, true);
  }
  Zd(t) {
    this.Vd().zn(), this.Ya(), t || this.wd.p(null, null, null);
  }
  Ra() {
    const t = this.Ct.Kn();
    if (null !== t) {
      const i = this.Ct.Bn(), n = this.Ct.En();
      this.Kd(i, n, null, t);
    }
    this.Ct.Nn();
  }
  Xd(t, i, n) {
    const s = this.ia.Rn(0);
    void 0 !== i && void 0 !== n && this.ia.Pt(i, n);
    const e2 = this.ia.Rn(0), r2 = this.ia.Dc(), h2 = this.ia.Ee();
    if (null !== h2 && null !== s && null !== e2) {
      const i2 = h2.ze(r2), a2 = this.Pu.key(s) > this.Pu.key(e2), l2 = null !== t && t > r2 && !a2, o2 = this.ia.N().allowShiftVisibleRangeOnWhitespaceReplacement, _2 = i2 && (!(void 0 === n) || o2) && this.ia.N().shiftVisibleRangeOnNewBar;
      if (l2 && !_2) {
        const i3 = t - r2;
        this.ia.gs(this.ia.Oc() - i3);
      }
    }
    this.ia.Hc(t);
  }
  Ba(t) {
    null !== t && t.ou();
  }
  Ks(t) {
    if ((function(t2) {
      return t2 instanceof Pi;
    })(t)) return t;
    const i = this.dd.find(((i2) => i2.Dt().includes(t)));
    return void 0 === i ? null : i;
  }
  Lc() {
    this.dd.forEach(((t) => t.ou())), this.Ra();
  }
  m() {
    this.dd.forEach(((t) => t.m())), this.dd.length = 0, this.yn.localization.priceFormatter = void 0, this.yn.localization.percentageFormatter = void 0, this.yn.localization.timeFormatter = void 0;
  }
  Jd() {
    return this.bd;
  }
  Js() {
    return this.bd.N();
  }
  N_() {
    return this.md;
  }
  Qd(t, i) {
    const n = this.xd(i);
    this.tf(t, n), this.fd.push(t), this.Pa(), 1 === this.fd.length ? this.ka() : this.mr();
  }
  if(t) {
    const i = this.Ks(t), n = this.fd.indexOf(t);
    o(-1 !== n, "Series not found");
    const s = u(i);
    this.fd.splice(n, 1), s.l_(t), t.m && t.m(), this.Pa(), this.ia.dc(), this.nf(s);
  }
  ya(t, i) {
    const n = u(this.Ks(t));
    n.l_(t, true), n.h_(t, i, true);
  }
  td() {
    const t = X.Cs();
    t.us(), this.kd(t);
  }
  sf(t) {
    const i = X.Cs();
    i.fs(t), this.kd(i);
  }
  ws() {
    const t = X.Cs();
    t.ws(), this.kd(t);
  }
  Ms(t) {
    const i = X.Cs();
    i.Ms(t), this.kd(i);
  }
  gs(t) {
    const i = X.Cs();
    i.gs(t), this.kd(i);
  }
  ps(t) {
    const i = X.Cs();
    i.ps(t), this.kd(i);
  }
  cs() {
    const t = X.Cs();
    t.cs(), this.kd(t);
  }
  ef() {
    const t = this.yn.defaultVisiblePriceScaleId, i = this.yn.leftPriceScale.visible;
    return i !== this.yn.rightPriceScale.visible ? i ? "left" : "right" : t;
  }
  rf(t, i) {
    o(i >= 0, "Index should be greater or equal to 0");
    if (i === this.hf(t)) return;
    const n = u(this.Ks(t));
    n.l_(t);
    const s = this.xd(i);
    this.tf(t, s);
    let e2 = false;
    0 === n.kl().length && (e2 = this.nf(n)), e2 || this.ka();
  }
  af() {
    return this.Pd;
  }
  $() {
    return this.Cd;
  }
  Ut(t) {
    const i = this.Pd, n = this.Cd;
    if (i === n) return i;
    if (t = Math.max(0, Math.min(100, Math.round(100 * t))), null === this.Md || this.Md.ah !== n || this.Md.oh !== i) this.Md = { ah: n, oh: i, lf: /* @__PURE__ */ new Map() };
    else {
      const i2 = this.Md.lf.get(t);
      if (void 0 !== i2) return i2;
    }
    const s = this.Io.tt(n, i, t / 100);
    return this.Md.lf.set(t, s), s;
  }
  _f(t) {
    return this.dd.indexOf(t);
  }
  Xi() {
    return this.Io;
  }
  uf() {
    return this.cf();
  }
  cf(t) {
    const i = new Pi(this.ia, this);
    this.dd.push(i);
    const n = t ?? this.dd.length - 1, s = X.ys();
    return s.es(n, { rs: 0, hs: true }), this.kd(s), i;
  }
  xd(t) {
    return o(t >= 0, "Index should be greater or equal to 0"), (t = Math.min(this.dd.length, t)) < this.dd.length ? this.dd[t] : this.cf(t);
  }
  hf(t) {
    return this.dd.findIndex(((i) => i.Y_().includes(t)));
  }
  Nd(t, i) {
    const n = new X(i);
    if (null !== t) {
      const s = this.dd.indexOf(t);
      n.es(s, { rs: i });
    }
    return n;
  }
  Td(t, i) {
    return void 0 === i && (i = 2), this.Nd(this.Ks(t), i);
  }
  kd(t) {
    this.gd && this.gd(t), this.dd.forEach(((t2) => t2.wu().wr().Pt()));
  }
  tf(t, i) {
    const n = t.N().priceScaleId, s = void 0 !== n ? n : this.ef();
    i.h_(t, s), Z(s) || t.vr(t.N());
  }
  yd(t) {
    const i = this.yn.layout;
    return "gradient" === i.background.type ? 0 === t ? i.background.topColor : i.background.bottomColor : i.background.color;
  }
  nf(t) {
    return !t.q_() && 0 === t.kl().length && this.dd.length > 1 && (this.dd.splice(this._f(t), 1), this.ka(), true);
  }
};
function Yi(t) {
  if (t >= 1) return 0;
  let i = 0;
  for (; i < 8; i++) {
    const n = Math.round(t);
    if (Math.abs(n - t) < 1e-8) return i;
    t *= 10;
  }
  return i;
}
function Ki(t) {
  return !p(t) && !m(t);
}
function Gi(t) {
  return p(t);
}
!(function(t) {
  t[t.Disabled = 0] = "Disabled", t[t.Continuous = 1] = "Continuous", t[t.OnDataUpdate = 2] = "OnDataUpdate";
})(Hi || (Hi = {})), (function(t) {
  t[t.LastBar = 0] = "LastBar", t[t.LastVisible = 1] = "LastVisible";
})(Ui || (Ui = {})), (function(t) {
  t.Solid = "solid", t.VerticalGradient = "gradient";
})($i || ($i = {})), (function(t) {
  t[t.Year = 0] = "Year", t[t.Month = 1] = "Month", t[t.DayOfMonth = 2] = "DayOfMonth", t[t.Time = 3] = "Time", t[t.TimeWithSeconds = 4] = "TimeWithSeconds";
})(ji || (ji = {}));
var Zi = (t) => t.getUTCFullYear();
function Xi(t, i, n) {
  return i.replace(/yyyy/g, ((t2) => tt(Zi(t2), 4))(t)).replace(/yy/g, ((t2) => tt(Zi(t2) % 100, 2))(t)).replace(/MMMM/g, ((t2, i2) => new Date(t2.getUTCFullYear(), t2.getUTCMonth(), 1).toLocaleString(i2, { month: "long" }))(t, n)).replace(/MMM/g, ((t2, i2) => new Date(t2.getUTCFullYear(), t2.getUTCMonth(), 1).toLocaleString(i2, { month: "short" }))(t, n)).replace(/MM/g, ((t2) => tt(((t3) => t3.getUTCMonth() + 1)(t2), 2))(t)).replace(/dd/g, ((t2) => tt(((t3) => t3.getUTCDate())(t2), 2))(t));
}
var Ji = class {
  constructor(t = "yyyy-MM-dd", i = "default") {
    this.df = t, this.ff = i;
  }
  ku(t) {
    return Xi(t, this.df, this.ff);
  }
};
var Qi = class {
  constructor(t) {
    this.pf = t || "%h:%m:%s";
  }
  ku(t) {
    return this.pf.replace("%h", tt(t.getUTCHours(), 2)).replace("%m", tt(t.getUTCMinutes(), 2)).replace("%s", tt(t.getUTCSeconds(), 2));
  }
};
var tn = { vf: "yyyy-MM-dd", mf: "%h:%m:%s", wf: " ", Mf: "default" };
var nn = class {
  constructor(t = {}) {
    const i = { ...tn, ...t };
    this.gf = new Ji(i.vf, i.Mf), this.bf = new Qi(i.mf), this.Sf = i.wf;
  }
  ku(t) {
    return `${this.gf.ku(t)}${this.Sf}${this.bf.ku(t)}`;
  }
};
function sn(t) {
  return 60 * t * 60 * 1e3;
}
function en(t) {
  return 60 * t * 1e3;
}
var rn = [{ xf: (hn = 1, 1e3 * hn), Cf: 10 }, { xf: en(1), Cf: 20 }, { xf: en(5), Cf: 21 }, { xf: en(30), Cf: 22 }, { xf: sn(1), Cf: 30 }, { xf: sn(3), Cf: 31 }, { xf: sn(6), Cf: 32 }, { xf: sn(12), Cf: 33 }];
var hn;
function an(t, i) {
  if (t.getUTCFullYear() !== i.getUTCFullYear()) return 70;
  if (t.getUTCMonth() !== i.getUTCMonth()) return 60;
  if (t.getUTCDate() !== i.getUTCDate()) return 50;
  for (let n = rn.length - 1; n >= 0; --n) if (Math.floor(i.getTime() / rn[n].xf) !== Math.floor(t.getTime() / rn[n].xf)) return rn[n].Cf;
  return 0;
}
function ln(t) {
  let i = t;
  if (m(t) && (i = _n(t)), !Ki(i)) throw new Error("time must be of type BusinessDay");
  const n = new Date(Date.UTC(i.year, i.month - 1, i.day, 0, 0, 0, 0));
  return { yf: Math.round(n.getTime() / 1e3), Pf: i };
}
function on(t) {
  if (!Gi(t)) throw new Error("time must be of type isUTCTimestamp");
  return { yf: t };
}
function _n(t) {
  const i = new Date(t);
  if (isNaN(i.getTime())) throw new Error(`Invalid date string=${t}, expected format=yyyy-mm-dd`);
  return { day: i.getUTCDate(), month: i.getUTCMonth() + 1, year: i.getUTCFullYear() };
}
function un(t) {
  m(t.time) && (t.time = _n(t.time));
}
var cn = class {
  options() {
    return this.yn;
  }
  setOptions(t) {
    this.yn = t, this.updateFormatter(t.localization);
  }
  preprocessData(t) {
    Array.isArray(t) ? (function(t2) {
      t2.forEach(un);
    })(t) : un(t);
  }
  createConverterToInternalObj(t) {
    return u((function(t2) {
      return 0 === t2.length ? null : Ki(t2[0].time) || m(t2[0].time) ? ln : on;
    })(t));
  }
  key(t) {
    return "object" == typeof t && "yf" in t ? t.yf : this.key(this.convertHorzItemToInternal(t));
  }
  cacheKey(t) {
    const i = t;
    return void 0 === i.Pf ? new Date(1e3 * i.yf).getTime() : new Date(Date.UTC(i.Pf.year, i.Pf.month - 1, i.Pf.day)).getTime();
  }
  convertHorzItemToInternal(t) {
    return Gi(i = t) ? on(i) : Ki(i) ? ln(i) : ln(_n(i));
    var i;
  }
  updateFormatter(t) {
    if (!this.yn) return;
    const i = t.dateFormat;
    this.yn.timeScale.timeVisible ? this.kf = new nn({ vf: i, mf: this.yn.timeScale.secondsVisible ? "%h:%m:%s" : "%h:%m", wf: "   ", Mf: t.locale }) : this.kf = new Ji(i, t.locale);
  }
  formatHorzItem(t) {
    const i = t;
    return this.kf.ku(new Date(1e3 * i.yf));
  }
  formatTickmark(t, i) {
    const n = (function(t2, i2, n2) {
      switch (t2) {
        case 0:
        case 10:
          return i2 ? n2 ? 4 : 3 : 2;
        case 20:
        case 21:
        case 22:
        case 30:
        case 31:
        case 32:
        case 33:
          return i2 ? 3 : 2;
        case 50:
          return 2;
        case 60:
          return 1;
        case 70:
          return 0;
      }
    })(t.weight, this.yn.timeScale.timeVisible, this.yn.timeScale.secondsVisible), s = this.yn.timeScale;
    if (void 0 !== s.tickMarkFormatter) {
      const e2 = s.tickMarkFormatter(t.originalTime, n, i.locale);
      if (null !== e2) return e2;
    }
    return (function(t2, i2, n2) {
      const s2 = {};
      switch (i2) {
        case 0:
          s2.year = "numeric";
          break;
        case 1:
          s2.month = "short";
          break;
        case 2:
          s2.day = "numeric";
          break;
        case 3:
          s2.hour12 = false, s2.hour = "2-digit", s2.minute = "2-digit";
          break;
        case 4:
          s2.hour12 = false, s2.hour = "2-digit", s2.minute = "2-digit", s2.second = "2-digit";
      }
      const e2 = void 0 === t2.Pf ? new Date(1e3 * t2.yf) : new Date(Date.UTC(t2.Pf.year, t2.Pf.month - 1, t2.Pf.day));
      return new Date(e2.getUTCFullYear(), e2.getUTCMonth(), e2.getUTCDate(), e2.getUTCHours(), e2.getUTCMinutes(), e2.getUTCSeconds(), e2.getUTCMilliseconds()).toLocaleString(n2, s2);
    })(t.time, n, i.locale);
  }
  maxTickMarkWeight(t) {
    let i = t.reduce(Ni, t[0]).weight;
    return i > 30 && i < 50 && (i = 30), i;
  }
  fillWeightsForPoints(t, i) {
    !(function(t2, i2 = 0) {
      if (0 === t2.length) return;
      let n = 0 === i2 ? null : t2[i2 - 1].time.yf, s = null !== n ? new Date(1e3 * n) : null, e2 = 0;
      for (let r2 = i2; r2 < t2.length; ++r2) {
        const i3 = t2[r2], h2 = new Date(1e3 * i3.time.yf);
        null !== s && (i3.timeWeight = an(h2, s)), e2 += i3.time.yf - (n || i3.time.yf), n = i3.time.yf, s = h2;
      }
      if (0 === i2 && t2.length > 1) {
        const i3 = Math.ceil(e2 / (t2.length - 1)), n2 = new Date(1e3 * (t2[0].time.yf - i3));
        t2[0].timeWeight = an(new Date(1e3 * t2[0].time.yf), n2);
      }
    })(t, i);
  }
  static Tf(t) {
    return f({ localization: { dateFormat: "dd MMM 'yy" } }, t ?? {});
  }
};
var dn = "undefined" != typeof window;
function fn() {
  return !!dn && window.navigator.userAgent.toLowerCase().indexOf("firefox") > -1;
}
function pn() {
  return !!dn && /iPhone|iPad|iPod/.test(window.navigator.platform);
}
function vn(t, i) {
  switch (t) {
    case "custom":
      return void 0 !== i ? "custom-object" : "series";
    case "price-line":
      return "custom-price-line";
    case "marker":
      return "series-marker";
    case "primitive":
      return "primitive";
    default:
      return "series";
  }
}
function mn(t) {
  return t + t % 2;
}
function wn(t) {
  dn && void 0 !== window.chrome && t.addEventListener("mousedown", ((t2) => {
    if (1 === t2.button) return t2.preventDefault(), false;
  }));
}
var Mn = class {
  constructor(t, i, n) {
    this.Rf = 0, this.Df = null, this.If = { _t: Number.NEGATIVE_INFINITY, ut: Number.POSITIVE_INFINITY }, this.Vf = 0, this.Bf = null, this.Ef = { _t: Number.NEGATIVE_INFINITY, ut: Number.POSITIVE_INFINITY }, this.Af = null, this.Lf = false, this.zf = null, this.Of = null, this.Nf = false, this.Ff = false, this.Wf = false, this.Hf = null, this.Uf = null, this.$f = null, this.jf = null, this.qf = null, this.Yf = null, this.Kf = null, this.Gf = 0, this.Zf = false, this.Xf = false, this.Jf = false, this.Qf = 0, this.tp = null, this.ip = !pn(), this.np = (t2) => {
      this.sp(t2);
    }, this.ep = (t2) => {
      if (this.rp(t2)) {
        const i2 = this.hp(t2);
        if (++this.Vf, this.Bf && this.Vf > 1) {
          const { ap: n2 } = this.lp(Sn(t2), this.Ef);
          n2 < 30 && !this.Wf && this.op(i2, this.up._p), this.cp();
        }
      } else {
        const i2 = this.hp(t2);
        if (++this.Rf, this.Df && this.Rf > 1) {
          const { ap: n2 } = this.lp(Sn(t2), this.If);
          n2 < 5 && !this.Ff && this.dp(i2, this.up.fp), this.pp();
        }
      }
    }, this.vp = t, this.up = i, this.yn = n, this.mp();
  }
  m() {
    null !== this.Hf && (this.Hf(), this.Hf = null), null !== this.Uf && (this.Uf(), this.Uf = null), null !== this.jf && (this.jf(), this.jf = null), null !== this.qf && (this.qf(), this.qf = null), null !== this.Yf && (this.Yf(), this.Yf = null), null !== this.$f && (this.$f(), this.$f = null), this.wp(), this.pp();
  }
  Mp(t) {
    this.jf && this.jf();
    const i = this.gp.bind(this);
    if (this.jf = () => {
      this.vp.removeEventListener("mousemove", i);
    }, this.vp.addEventListener("mousemove", i), this.rp(t)) return;
    const n = this.hp(t);
    this.dp(n, this.up.bp), this.ip = true;
  }
  pp() {
    null !== this.Df && clearTimeout(this.Df), this.Rf = 0, this.Df = null, this.If = { _t: Number.NEGATIVE_INFINITY, ut: Number.POSITIVE_INFINITY };
  }
  cp() {
    null !== this.Bf && clearTimeout(this.Bf), this.Vf = 0, this.Bf = null, this.Ef = { _t: Number.NEGATIVE_INFINITY, ut: Number.POSITIVE_INFINITY };
  }
  gp(t) {
    if (this.Jf || null !== this.Of) return;
    if (this.rp(t)) return;
    const i = this.hp(t);
    this.dp(i, this.up.Sp), this.ip = true;
  }
  xp(t) {
    const i = Cn(t.changedTouches, u(this.tp));
    if (null === i) return;
    if (this.Qf = xn(t), null !== this.Kf) return;
    if (this.Xf) return;
    this.Zf = true;
    const n = this.lp(Sn(i), u(this.Of)), { Cp: s, yp: e2, ap: r2 } = n;
    if (this.Nf || !(r2 < 5)) {
      if (!this.Nf) {
        const t2 = 0.5 * s, i2 = e2 >= t2 && !this.yn.Pp(), n2 = t2 > e2 && !this.yn.kp();
        i2 || n2 || (this.Xf = true), this.Nf = true, this.Wf = true, this.wp(), this.cp();
      }
      if (!this.Xf) {
        const n2 = this.hp(t, i);
        this.op(n2, this.up.Tp), bn(t);
      }
    }
  }
  Rp(t) {
    if (0 !== t.button) return;
    const i = this.lp(Sn(t), u(this.zf)), { ap: n } = i;
    if (n >= 5 && (this.Ff = true, this.pp()), this.Ff) {
      const i2 = this.hp(t);
      this.dp(i2, this.up.Dp);
    }
  }
  lp(t, i) {
    const n = Math.abs(i._t - t._t), s = Math.abs(i.ut - t.ut);
    return { Cp: n, yp: s, ap: n + s };
  }
  Ip(t) {
    let i = Cn(t.changedTouches, u(this.tp));
    if (null === i && 0 === t.touches.length && (i = t.changedTouches[0]), null === i) return;
    this.tp = null, this.Qf = xn(t), this.wp(), this.Of = null, this.Yf && (this.Yf(), this.Yf = null);
    const n = this.hp(t, i);
    if (this.op(n, this.up.Vp), ++this.Vf, this.Bf && this.Vf > 1) {
      const { ap: t2 } = this.lp(Sn(i), this.Ef);
      t2 < 30 && !this.Wf && this.op(n, this.up._p), this.cp();
    } else this.Wf || (this.op(n, this.up.Bp), this.up.Bp && bn(t));
    0 === this.Vf && bn(t), 0 === t.touches.length && this.Lf && (this.Lf = false, bn(t));
  }
  sp(t) {
    if (0 !== t.button) return;
    const i = this.hp(t);
    if (this.zf = null, this.Jf = false, this.qf && (this.qf(), this.qf = null), fn()) {
      this.vp.ownerDocument.documentElement.removeEventListener("mouseleave", this.np);
    }
    if (!this.rp(t)) if (this.dp(i, this.up.Ep), ++this.Rf, this.Df && this.Rf > 1) {
      const { ap: n } = this.lp(Sn(t), this.If);
      n < 5 && !this.Ff && this.dp(i, this.up.fp), this.pp();
    } else this.Ff || this.dp(i, this.up.Ap);
  }
  wp() {
    null !== this.Af && (clearTimeout(this.Af), this.Af = null);
  }
  Lp(t) {
    if (null !== this.tp) return;
    const i = t.changedTouches[0];
    this.tp = i.identifier, this.Qf = xn(t);
    const n = this.vp.ownerDocument.documentElement;
    this.Wf = false, this.Nf = false, this.Xf = false, this.Of = Sn(i), this.Yf && (this.Yf(), this.Yf = null);
    {
      const i2 = this.xp.bind(this), s2 = this.Ip.bind(this);
      this.Yf = () => {
        n.removeEventListener("touchmove", i2), n.removeEventListener("touchend", s2);
      }, n.addEventListener("touchmove", i2, { passive: false }), n.addEventListener("touchend", s2, { passive: false }), this.wp(), this.Af = setTimeout(this.zp.bind(this, t), 240);
    }
    const s = this.hp(t, i);
    this.op(s, this.up.Op), this.Bf || (this.Vf = 0, this.Bf = setTimeout(this.cp.bind(this), 500), this.Ef = Sn(i));
  }
  Np(t) {
    if (0 !== t.button) return;
    const i = this.vp.ownerDocument.documentElement;
    fn() && i.addEventListener("mouseleave", this.np), this.Ff = false, this.zf = Sn(t), this.qf && (this.qf(), this.qf = null);
    {
      const t2 = this.Rp.bind(this), n2 = this.sp.bind(this);
      this.qf = () => {
        i.removeEventListener("mousemove", t2), i.removeEventListener("mouseup", n2);
      }, i.addEventListener("mousemove", t2), i.addEventListener("mouseup", n2);
    }
    if (this.Jf = true, this.rp(t)) return;
    const n = this.hp(t);
    this.dp(n, this.up.Fp), this.Df || (this.Rf = 0, this.Df = setTimeout(this.pp.bind(this), 500), this.If = Sn(t));
  }
  mp() {
    this.vp.addEventListener("mouseenter", this.Mp.bind(this)), this.vp.addEventListener("touchcancel", this.wp.bind(this));
    {
      const t = this.vp.ownerDocument, i = (t2) => {
        this.up.Wp && (t2.composed && this.vp.contains(t2.composedPath()[0]) || t2.target && this.vp.contains(t2.target) || this.up.Wp());
      };
      this.Uf = () => {
        t.removeEventListener("touchstart", i);
      }, this.Hf = () => {
        t.removeEventListener("mousedown", i);
      }, t.addEventListener("mousedown", i), t.addEventListener("touchstart", i, { passive: true });
    }
    pn() && (this.$f = () => {
      this.vp.removeEventListener("dblclick", this.ep);
    }, this.vp.addEventListener("dblclick", this.ep)), this.vp.addEventListener("mouseleave", this.Hp.bind(this)), this.vp.addEventListener("touchstart", this.Lp.bind(this), { passive: true }), wn(this.vp), this.vp.addEventListener("mousedown", this.Np.bind(this)), this.Up(), this.vp.addEventListener("touchmove", (() => {
    }), { passive: false });
  }
  Up() {
    void 0 === this.up.$p && void 0 === this.up.jp && void 0 === this.up.qp || (this.vp.addEventListener("touchstart", ((t) => this.Yp(t.touches)), { passive: true }), this.vp.addEventListener("touchmove", ((t) => {
      if (2 === t.touches.length && null !== this.Kf && void 0 !== this.up.jp) {
        const i = gn(t.touches[0], t.touches[1]) / this.Gf;
        this.up.jp(this.Kf, i), bn(t);
      }
    }), { passive: false }), this.vp.addEventListener("touchend", ((t) => {
      this.Yp(t.touches);
    })));
  }
  Yp(t) {
    1 === t.length && (this.Zf = false), 2 !== t.length || this.Zf || this.Lf ? this.Kp() : this.Gp(t);
  }
  Gp(t) {
    const i = this.vp.getBoundingClientRect() || { left: 0, top: 0 };
    this.Kf = { _t: (t[0].clientX - i.left + (t[1].clientX - i.left)) / 2, ut: (t[0].clientY - i.top + (t[1].clientY - i.top)) / 2 }, this.Gf = gn(t[0], t[1]), void 0 !== this.up.$p && this.up.$p(), this.wp();
  }
  Kp() {
    null !== this.Kf && (this.Kf = null, void 0 !== this.up.qp && this.up.qp());
  }
  Hp(t) {
    if (this.jf && this.jf(), this.rp(t)) return;
    if (!this.ip) return;
    const i = this.hp(t);
    this.dp(i, this.up.Zp), this.ip = !pn();
  }
  zp(t) {
    const i = Cn(t.touches, u(this.tp));
    if (null === i) return;
    const n = this.hp(t, i);
    this.op(n, this.up.Xp), this.Wf = true, this.Lf = true;
  }
  rp(t) {
    return t.sourceCapabilities && void 0 !== t.sourceCapabilities.firesTouchEvents ? t.sourceCapabilities.firesTouchEvents : xn(t) < this.Qf + 500;
  }
  op(t, i) {
    i && i.call(this.up, t);
  }
  dp(t, i) {
    i && i.call(this.up, t);
  }
  hp(t, i) {
    const n = i || t, s = this.vp.getBoundingClientRect() || { left: 0, top: 0 };
    return { clientX: n.clientX, clientY: n.clientY, pageX: n.pageX, pageY: n.pageY, screenX: n.screenX, screenY: n.screenY, localX: n.clientX - s.left, localY: n.clientY - s.top, ctrlKey: t.ctrlKey, altKey: t.altKey, shiftKey: t.shiftKey, metaKey: t.metaKey, Jp: !t.type.startsWith("mouse") && "contextmenu" !== t.type && "click" !== t.type, Qp: t.type, tv: n.target, xu: t.view, iv: () => {
      "touchstart" !== t.type && bn(t);
    } };
  }
};
function gn(t, i) {
  const n = t.clientX - i.clientX, s = t.clientY - i.clientY;
  return Math.sqrt(n * n + s * s);
}
function bn(t) {
  t.cancelable && t.preventDefault();
}
function Sn(t) {
  return { _t: t.pageX, ut: t.pageY };
}
function xn(t) {
  return t.timeStamp || performance.now();
}
function Cn(t, i) {
  for (let n = 0; n < t.length; ++n) if (t[n].identifier === i) return t[n];
  return null;
}
var yn = class {
  constructor(t, i, n) {
    this.nv = null, this.sv = null, this.ev = true, this.rv = null, this.hv = t, this.av = t.lv()[i], this.ov = t.lv()[n], this._v = document.createElement("tr"), this._v.style.height = "1px", this.uv = document.createElement("td"), this.uv.style.position = "relative", this.uv.style.padding = "0", this.uv.style.margin = "0", this.uv.setAttribute("colspan", "3"), this.cv(), this._v.appendChild(this.uv), this.ev = this.hv.N().layout.panes.enableResize, this.ev ? this.dv() : (this.nv = null, this.sv = null);
  }
  m() {
    null !== this.sv && this.sv.m();
  }
  fv() {
    return this._v;
  }
  pv() {
    return size({ width: this.av.pv().width, height: 1 });
  }
  vv() {
    return size({ width: this.av.vv().width, height: 1 * window.devicePixelRatio });
  }
  mv(t, i, n) {
    const s = this.vv();
    t.fillStyle = this.hv.N().layout.panes.separatorColor, t.fillRect(i, n, s.width, s.height);
  }
  Pt() {
    this.cv(), this.hv.N().layout.panes.enableResize !== this.ev && (this.ev = this.hv.N().layout.panes.enableResize, this.ev ? this.dv() : (null !== this.nv && (this.uv.removeChild(this.nv.wv), this.uv.removeChild(this.nv.Mv), this.nv = null), null !== this.sv && (this.sv.m(), this.sv = null)));
  }
  dv() {
    const t = document.createElement("div"), i = t.style;
    i.position = "fixed", i.display = "none", i.zIndex = "49", i.top = "0", i.left = "0", i.width = "100%", i.height = "100%", i.cursor = "row-resize", this.uv.appendChild(t);
    const n = document.createElement("div"), s = n.style;
    s.position = "absolute", s.zIndex = "50", s.top = "-4px", s.height = "9px", s.width = "100%", s.backgroundColor = "", s.cursor = "row-resize", this.uv.appendChild(n);
    const e2 = { bp: this.gv.bind(this), Zp: this.bv.bind(this), Fp: this.Sv.bind(this), Op: this.Sv.bind(this), Dp: this.xv.bind(this), Tp: this.xv.bind(this), Ep: this.Cv.bind(this), Vp: this.Cv.bind(this) };
    this.sv = new Mn(n, e2, { Pp: () => false, kp: () => true }), this.nv = { Mv: n, wv: t };
  }
  cv() {
    this.uv.style.background = this.hv.N().layout.panes.separatorColor;
  }
  gv(t) {
    null !== this.nv && (this.nv.Mv.style.backgroundColor = this.hv.N().layout.panes.separatorHoverColor);
  }
  bv(t) {
    null !== this.nv && null === this.rv && (this.nv.Mv.style.backgroundColor = "");
  }
  Sv(t) {
    if (null === this.nv) return;
    const i = this.av.yv().F_() + this.ov.yv().F_(), n = i / (this.av.pv().height + this.ov.pv().height), s = 30 * n;
    i <= 2 * s || (this.rv = { Pv: t.pageY, kv: this.av.yv().F_(), Tv: i - s, Rv: i, Dv: n, Iv: s }, this.nv.wv.style.display = "block");
  }
  xv(t) {
    const i = this.rv;
    if (null === i) return;
    const n = (t.pageY - i.Pv) * i.Dv, s = ni(i.kv + n, i.Iv, i.Tv);
    this.av.yv().W_(s), this.ov.yv().W_(i.Rv - s), this.hv.Qt().ka();
  }
  Cv(t) {
    null !== this.rv && null !== this.nv && (this.rv = null, this.nv.wv.style.display = "none");
  }
};
function Pn(t, i) {
  return t.Vv - i.Vv;
}
function kn(t, i, n) {
  const s = (t.Vv - i.Vv) / (t.wt - i.wt);
  return Math.sign(s) * Math.min(Math.abs(s), n);
}
var Tn = class {
  constructor(t, i, n, s) {
    this.Bv = null, this.Ev = null, this.Av = null, this.Lv = null, this.zv = null, this.Ov = 0, this.Nv = 0, this.Fv = t, this.Wv = i, this.Hv = n, this.Ps = s;
  }
  Uv(t, i) {
    if (null !== this.Bv) {
      if (this.Bv.wt === i) return void (this.Bv.Vv = t);
      if (Math.abs(this.Bv.Vv - t) < this.Ps) return;
    }
    this.Lv = this.Av, this.Av = this.Ev, this.Ev = this.Bv, this.Bv = { wt: i, Vv: t };
  }
  me(t, i) {
    if (null === this.Bv || null === this.Ev) return;
    if (i - this.Bv.wt > 50) return;
    let n = 0;
    const s = kn(this.Bv, this.Ev, this.Wv), e2 = Pn(this.Bv, this.Ev), r2 = [s], h2 = [e2];
    if (n += e2, null !== this.Av) {
      const t2 = kn(this.Ev, this.Av, this.Wv);
      if (Math.sign(t2) === Math.sign(s)) {
        const i2 = Pn(this.Ev, this.Av);
        if (r2.push(t2), h2.push(i2), n += i2, null !== this.Lv) {
          const t3 = kn(this.Av, this.Lv, this.Wv);
          if (Math.sign(t3) === Math.sign(s)) {
            const i3 = Pn(this.Av, this.Lv);
            r2.push(t3), h2.push(i3), n += i3;
          }
        }
      }
    }
    let a2 = 0;
    for (let t2 = 0; t2 < r2.length; ++t2) a2 += h2[t2] / n * r2[t2];
    Math.abs(a2) < this.Fv || (this.zv = { Vv: t, wt: i }, this.Nv = a2, this.Ov = (function(t2, i2) {
      const n2 = Math.log(i2);
      return Math.log(1 * n2 / -t2) / n2;
    })(Math.abs(a2), this.Hv));
  }
  Gc(t) {
    const i = u(this.zv), n = t - i.wt;
    return i.Vv + this.Nv * (Math.pow(this.Hv, n) - 1) / Math.log(this.Hv);
  }
  Kc(t) {
    return null === this.zv || this.$v(t) === this.Ov;
  }
  $v(t) {
    const i = t - u(this.zv).wt;
    return Math.min(i, this.Ov);
  }
};
var Rn = class {
  constructor(t, i) {
    this.jv = void 0, this.qv = void 0, this.Yv = void 0, this.vn = false, this.Kv = t, this.Gv = i, this.Zv();
  }
  Pt() {
    this.Zv();
  }
  Xv() {
    this.jv && this.Kv.removeChild(this.jv), this.qv && this.Kv.removeChild(this.qv), this.jv = void 0, this.qv = void 0;
  }
  Jv() {
    return this.vn !== this.Qv() || this.Yv !== this.tm();
  }
  tm() {
    return this.Gv.Qt().Xi().J(this.Gv.N().layout.textColor) > 160 ? "dark" : "light";
  }
  Qv() {
    return this.Gv.N().layout.attributionLogo;
  }
  im() {
    const t = new URL(location.href);
    return t.hostname ? "&utm_source=" + t.hostname + t.pathname : "";
  }
  Zv() {
    this.Jv() && (this.Xv(), this.vn = this.Qv(), this.vn && (this.Yv = this.tm(), this.qv = document.createElement("style"), this.qv.innerText = "a#tv-attr-logo{--fill:#131722;--stroke:#fff;position:absolute;left:10px;bottom:10px;height:19px;width:35px;margin:0;padding:0;border:0;z-index:3;}a#tv-attr-logo[data-dark]{--fill:#D1D4DC;--stroke:#131722;}", this.jv = document.createElement("a"), this.jv.href = `https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart${this.im()}`, this.jv.title = "Charting by TradingView", this.jv.id = "tv-attr-logo", this.jv.target = "_blank", this.jv.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="35" height="19" fill="none"><g fill-rule="evenodd" clip-path="url(#a)" clip-rule="evenodd"><path fill="var(--stroke)" d="M2 0H0v10h6v9h21.4l.5-1.3 6-15 1-2.7H23.7l-.5 1.3-.2.6a5 5 0 0 0-7-.9V0H2Zm20 17h4l5.2-13 .8-2h-7l-1 2.5-.2.5-1.5 3.8-.3.7V17Zm-.8-10a3 3 0 0 0 .7-2.7A3 3 0 1 0 16.8 7h4.4ZM14 7V2H2v6h6v9h4V7h2Z"/><path fill="var(--fill)" d="M14 2H2v6h6v9h6V2Zm12 15h-7l6-15h7l-6 15Zm-7-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></g><defs><clipPath id="a"><path fill="var(--stroke)" d="M0 0h35v19H0z"/></clipPath></defs></svg>', this.jv.toggleAttribute("data-dark", "dark" === this.Yv), this.Kv.appendChild(this.qv), this.Kv.appendChild(this.jv)));
  }
};
function Dn(t, n) {
  const s = u(t.ownerDocument).createElement("canvas");
  t.appendChild(s);
  const e2 = bindTo(s, { type: "device-pixel-content-box", options: { allowResizeObserver: true }, transform: (t2, i) => ({ width: Math.max(t2.width, i.width), height: Math.max(t2.height, i.height) }) });
  return e2.resizeCanvasElement(n), e2;
}
function In(t) {
  t.width = 1, t.height = 1, t.getContext("2d")?.clearRect(0, 0, 1, 1);
}
function Vn(t, i, n, s) {
  t.qh && t.qh(i, n, s);
}
function Bn(t, i, n, s) {
  t.st(i, n, s);
}
function En(t, i, n, s) {
  An(t(n, s), i, s);
}
function An(t, i, n) {
  for (const s of t) {
    const t2 = s.Tt(n);
    null !== t2 && i(t2);
  }
}
function Ln(t, i) {
  return (n) => {
    if (!(function(t2) {
      return void 0 !== t2.Ft;
    })(n)) return [];
    return (n.Ft()?.pl() ?? "") !== i ? [] : n.Qa?.(t) ?? [];
  };
}
function zn(t, i, n, s) {
  if (!t.length) return;
  let e2 = 0;
  const r2 = t[0].$t(s, true);
  let h2 = 1 === i ? n / 2 - (t[0].Hi() - r2 / 2) : t[0].Hi() - r2 / 2 - n / 2;
  h2 = Math.max(0, h2);
  for (let r3 = 1; r3 < t.length; r3++) {
    const a2 = t[r3], l2 = t[r3 - 1], o2 = l2.$t(s, false), _2 = a2.Hi(), u2 = l2.Hi();
    if (1 === i ? _2 > u2 - o2 : _2 < u2 + o2) {
      const s2 = u2 - o2 * i;
      a2.Ui(s2);
      const r4 = s2 - i * o2 / 2;
      if ((1 === i ? r4 < 0 : r4 > n) && h2 > 0) {
        const s3 = 1 === i ? -1 - r4 : r4 - n, a3 = Math.min(s3, h2);
        for (let n2 = e2; n2 < t.length; n2++) t[n2].Ui(t[n2].Hi() + i * a3);
        h2 -= a3;
      }
    } else e2 = r3, h2 = 1 === i ? u2 - o2 - _2 : _2 - (u2 + o2);
  }
}
var On = class {
  constructor(i, n, s, e2) {
    this.Ki = null, this.nm = null, this.sm = false, this.rm = new rt(200), this.hm = null, this.am = 0, this.lm = false, this.om = () => {
      this.lm || this.yt._m().Qt().mr();
    }, this.um = () => {
      this.lm || this.yt._m().Qt().mr();
    }, this.yt = i, this.yn = n, this.Ro = n.layout, this.bd = s, this.dm = "left" === e2, this.fm = Ln("normal", e2), this.pm = Ln("top", e2), this.vm = Ln("bottom", e2), this.uv = document.createElement("div"), this.uv.style.height = "100%", this.uv.style.overflow = "hidden", this.uv.style.width = "25px", this.uv.style.left = "0", this.uv.style.position = "relative", this.wm = Dn(this.uv, size({ width: 16, height: 16 })), this.wm.subscribeSuggestedBitmapSizeChanged(this.om);
    const r2 = this.wm.canvasElement;
    r2.style.position = "absolute", r2.style.zIndex = "1", r2.style.left = "0", r2.style.top = "0", this.Mm = Dn(this.uv, size({ width: 16, height: 16 })), this.Mm.subscribeSuggestedBitmapSizeChanged(this.um);
    const h2 = this.Mm.canvasElement;
    h2.style.position = "absolute", h2.style.zIndex = "2", h2.style.left = "0", h2.style.top = "0";
    const a2 = { Fp: this.Sv.bind(this), Op: this.Sv.bind(this), Dp: this.xv.bind(this), Tp: this.xv.bind(this), Wp: this.gm.bind(this), Ep: this.Cv.bind(this), Vp: this.Cv.bind(this), fp: this.bm.bind(this), _p: this.bm.bind(this), bp: this.Sm.bind(this), Zp: this.bv.bind(this) };
    this.sv = new Mn(this.Mm.canvasElement, a2, { Pp: () => !this.yn.handleScroll.vertTouchDrag, kp: () => true });
  }
  m() {
    this.sv.m(), this.Mm.unsubscribeSuggestedBitmapSizeChanged(this.um), In(this.Mm.canvasElement), this.Mm.dispose(), this.wm.unsubscribeSuggestedBitmapSizeChanged(this.om), In(this.wm.canvasElement), this.wm.dispose(), null !== this.Ki && this.Ki.__().u(this), this.Ki = null;
  }
  fv() {
    return this.uv;
  }
  P() {
    return this.Ro.fontSize;
  }
  xm() {
    const t = this.bd.N();
    return this.hm !== t.k && (this.rm.Os(), this.hm = t.k), t;
  }
  Cm() {
    if (null === this.Ki) return 0;
    let t = 0;
    const i = this.xm(), n = u(this.wm.canvasElement.getContext("2d", { colorSpace: this.yt._m().N().layout.colorSpace }));
    n.save();
    const s = this.Ki.zl();
    n.font = this.ym(), s.length > 0 && (t = Math.max(this.rm.Ii(n, s[0].eo), this.rm.Ii(n, s[s.length - 1].eo)));
    const e2 = this.Pm();
    for (let i2 = e2.length; i2--; ) {
      const s2 = this.rm.Ii(n, e2[i2].ri());
      s2 > t && (t = s2);
    }
    const r2 = this.Ki.Lt();
    if (null !== r2 && null !== this.nm && (2 !== (h2 = this.yn.crosshair).mode && h2.horzLine.visible && h2.horzLine.labelVisible)) {
      const i2 = this.Ki.Tn(1, r2), s2 = this.Ki.Tn(this.nm.height - 2, r2);
      t = Math.max(t, this.rm.Ii(n, this.Ki.Ji(Math.floor(Math.min(i2, s2)) + 0.11111111111111, r2)), this.rm.Ii(n, this.Ki.Ji(Math.ceil(Math.max(i2, s2)) - 0.11111111111111, r2)));
    }
    var h2;
    n.restore();
    const a2 = t || 34;
    return mn(Math.ceil(i.S + i.C + i.V + i.B + 5 + a2));
  }
  km(t) {
    null !== this.nm && equalSizes(this.nm, t) || (this.nm = t, this.lm = true, this.wm.resizeCanvasElement(t), this.Mm.resizeCanvasElement(t), this.lm = false, this.uv.style.width = `${t.width}px`, this.uv.style.height = `${t.height}px`);
  }
  Tm() {
    return u(this.nm).width;
  }
  un(t) {
    this.Ki !== t && (null !== this.Ki && this.Ki.__().u(this), this.Ki = t, t.__().i(this.wo.bind(this), this));
  }
  Ft() {
    return this.Ki;
  }
  Os() {
    const t = this.yt.yv();
    this.yt._m().Qt().au(t, u(this.Ft()));
  }
  Rm(t) {
    if (null === this.nm) return;
    const i = { colorSpace: this.yt._m().N().layout.colorSpace };
    if (1 !== t) {
      this.Dm(), this.wm.applySuggestedBitmapSize();
      const t2 = tryCreateCanvasRenderingTarget2D(this.wm, i);
      null !== t2 && (t2.useBitmapCoordinateSpace(((t3) => {
        this.Im(t3), this.Vm(t3);
      })), this.yt.Bm(t2, this.vm), this.Em(t2), this.yt.Bm(t2, this.fm), this.Am(t2));
    }
    this.Mm.applySuggestedBitmapSize();
    const n = tryCreateCanvasRenderingTarget2D(this.Mm, i);
    null !== n && (n.useBitmapCoordinateSpace((({ context: t2, bitmapSize: i2 }) => {
      t2.clearRect(0, 0, i2.width, i2.height);
    })), this.Lm(n), this.yt.Bm(n, this.pm));
  }
  vv() {
    return this.wm.bitmapSize;
  }
  mv(t, i, n, s) {
    const e2 = this.vv();
    if (e2.width > 0 && e2.height > 0 && (t.drawImage(this.wm.canvasElement, i, n), s)) {
      const s2 = this.Mm.canvasElement;
      t.drawImage(s2, i, n);
    }
  }
  Pt() {
    this.Ki?.zl();
  }
  Sv(t) {
    if (null === this.Ki || this.Ki.Zi() || !this.yn.handleScale.axisPressedMouseMove.price) return;
    const i = this.yt._m().Qt(), n = this.yt.yv();
    this.sm = true, i.Q_(n, this.Ki, t.localY);
  }
  xv(t) {
    if (null === this.Ki || !this.yn.handleScale.axisPressedMouseMove.price) return;
    const i = this.yt._m().Qt(), n = this.yt.yv(), s = this.Ki;
    i.tu(n, s, t.localY);
  }
  gm() {
    if (null === this.Ki || !this.yn.handleScale.axisPressedMouseMove.price) return;
    const t = this.yt._m().Qt(), i = this.yt.yv(), n = this.Ki;
    this.sm && (this.sm = false, t.iu(i, n));
  }
  Cv(t) {
    if (null === this.Ki || !this.yn.handleScale.axisPressedMouseMove.price) return;
    const i = this.yt._m().Qt(), n = this.yt.yv();
    this.sm = false, i.iu(n, this.Ki);
  }
  bm(t) {
    this.yn.handleScale.axisDoubleClickReset.price && this.Os();
  }
  Sm(t) {
    if (null === this.Ki) return;
    !this.yt._m().Qt().N().handleScale.axisPressedMouseMove.price || this.Ki.je() || this.Ki.No() || this.zm(1);
  }
  bv(t) {
    this.zm(0);
  }
  Pm() {
    const t = [], i = null === this.Ki ? void 0 : this.Ki;
    return ((n) => {
      for (let s = 0; s < n.length; ++s) {
        const e2 = n[s].qn(this.yt.yv(), i);
        for (let i2 = 0; i2 < e2.length; i2++) t.push(e2[i2]);
      }
    })(this.yt.yv().Dt()), t;
  }
  Im({ context: t, bitmapSize: i }) {
    const { width: n, height: s } = i, e2 = this.yt.yv().Qt(), r2 = e2.$(), h2 = e2.af();
    r2 === h2 ? z(t, 0, 0, n, s, r2) : F(t, 0, 0, n, s, r2, h2);
  }
  Vm({ context: t, bitmapSize: i, horizontalPixelRatio: n }) {
    if (null === this.nm || null === this.Ki || !this.Ki.N().borderVisible) return;
    t.fillStyle = this.Ki.N().borderColor;
    const s = Math.max(1, Math.floor(this.xm().S * n));
    let e2;
    e2 = this.dm ? i.width - s : 0, t.fillRect(e2, 0, s, i.height);
  }
  Em(t) {
    if (null === this.nm || null === this.Ki) return;
    const i = this.Ki.zl(), n = this.Ki.N(), s = this.xm(), e2 = this.dm ? this.nm.width - s.C : 0;
    n.borderVisible && n.ticksVisible && t.useBitmapCoordinateSpace((({ context: t2, horizontalPixelRatio: r2, verticalPixelRatio: h2 }) => {
      t2.fillStyle = n.borderColor;
      const a2 = Math.max(1, Math.floor(h2)), l2 = Math.floor(0.5 * h2), o2 = Math.round(s.C * r2);
      t2.beginPath();
      for (const n2 of i) t2.rect(Math.floor(e2 * r2), Math.round(n2.Vl * h2) - l2, o2, a2);
      t2.fill();
    })), t.useMediaCoordinateSpace((({ context: t2 }) => {
      t2.font = this.ym(), t2.fillStyle = n.textColor ?? this.Ro.textColor, t2.textAlign = this.dm ? "right" : "left", t2.textBaseline = "middle";
      const r2 = this.dm ? Math.round(e2 - s.V) : Math.round(e2 + s.C + s.V), h2 = i.map(((i2) => this.rm.Di(t2, i2.eo)));
      for (let n2 = i.length; n2--; ) {
        const s2 = i[n2];
        t2.fillText(s2.eo, r2, s2.Vl + h2[n2]);
      }
    }));
  }
  Dm() {
    if (null === this.nm || null === this.Ki) return;
    let t = this.nm.height / 2;
    const i = [], n = this.Ki.Dt().slice(), s = this.yt.yv(), e2 = this.xm();
    this.Ki === s.Zs() && this.yt.yv().Dt().forEach(((t2) => {
      s.Gs(t2) && n.push(t2);
    }));
    const r2 = this.Ki.kl()[0], h2 = this.Ki;
    n.forEach(((n2) => {
      const e3 = n2.qn(s, h2);
      e3.forEach(((t2) => {
        t2.$i() && null === t2.Wi() && (t2.Ui(null), i.push(t2));
      })), r2 === n2 && e3.length > 0 && (t = e3[0].Ei());
    }));
    this.Ki.N().alignLabels && this.Om(i, e2, t);
  }
  Om(t, i, n) {
    if (null === this.nm) return;
    const s = t.filter(((t2) => t2.Ei() <= n)), e2 = t.filter(((t2) => t2.Ei() > n));
    s.sort(((t2, i2) => i2.Ei() - t2.Ei())), s.length && e2.length && e2.push(s[0]), e2.sort(((t2, i2) => t2.Ei() - i2.Ei()));
    for (const n2 of t) {
      const t2 = Math.floor(n2.$t(i) / 2), s2 = n2.Ei();
      s2 > -t2 && s2 < t2 && n2.Ui(t2), s2 > this.nm.height - t2 && s2 < this.nm.height + t2 && n2.Ui(this.nm.height - t2);
    }
    zn(s, 1, this.nm.height, i), zn(e2, -1, this.nm.height, i);
  }
  Am(t) {
    if (null === this.nm) return;
    const i = this.Pm(), n = this.xm(), s = this.dm ? "right" : "left";
    i.forEach(((i2) => {
      if (i2.ji()) {
        i2.Tt(u(this.Ki)).st(t, n, this.rm, s);
      }
    }));
  }
  Lm(t) {
    if (null === this.nm || null === this.Ki) return;
    const i = this.yt._m().Qt(), n = [], s = this.yt.yv(), e2 = i.Vd().qn(s, this.Ki);
    e2.length && n.push(e2);
    const r2 = this.xm(), h2 = this.dm ? "right" : "left";
    n.forEach(((i2) => {
      i2.forEach(((i3) => {
        i3.Tt(u(this.Ki)).st(t, r2, this.rm, h2);
      }));
    }));
  }
  zm(t) {
    this.uv.style.cursor = 1 === t ? "ns-resize" : "default";
  }
  wo() {
    const t = this.Cm();
    this.am < t && this.yt._m().Qt().ka(), this.am = t;
  }
  ym() {
    return x(this.Ro.fontSize, this.Ro.fontFamily);
  }
};
function Nn(t, i) {
  return t.Xa?.(i) ?? [];
}
function Fn(t, i) {
  return t.jn?.(i) ?? [];
}
function Wn(t, i) {
  return t.cn?.(i) ?? [];
}
function Hn(t, i) {
  return t.qa?.(i) ?? [];
}
var Un = class _Un {
  constructor(i, n) {
    this.nm = size({ width: 0, height: 0 }), this.Nm = null, this.Fm = null, this.Wm = null, this.Hm = null, this.Um = false, this.$m = new d(), this.jm = new d(), this.qm = 0, this.Ym = false, this.Km = null, this.Gm = false, this.Zm = null, this.Xm = null, this.lm = false, this.om = () => {
      this.lm || null === this.Jm || this.sn().mr();
    }, this.um = () => {
      this.lm || null === this.Jm || this.sn().mr();
    }, this.Gv = i, this.Jm = n, this.Jm.mu().i(this.Qm.bind(this), this, true), this.tw = document.createElement("td"), this.tw.style.padding = "0", this.tw.style.position = "relative";
    const s = document.createElement("div");
    s.style.width = "100%", s.style.height = "100%", s.style.position = "relative", s.style.overflow = "hidden", this.iw = document.createElement("td"), this.iw.style.padding = "0", this.nw = document.createElement("td"), this.nw.style.padding = "0", this.tw.appendChild(s), this.wm = Dn(s, size({ width: 16, height: 16 })), this.wm.subscribeSuggestedBitmapSizeChanged(this.om);
    const e2 = this.wm.canvasElement;
    e2.style.position = "absolute", e2.style.zIndex = "1", e2.style.left = "0", e2.style.top = "0", this.Mm = Dn(s, size({ width: 16, height: 16 })), this.Mm.subscribeSuggestedBitmapSizeChanged(this.um);
    const r2 = this.Mm.canvasElement;
    r2.style.position = "absolute", r2.style.zIndex = "2", r2.style.left = "0", r2.style.top = "0", this._v = document.createElement("tr"), this._v.appendChild(this.iw), this._v.appendChild(this.tw), this._v.appendChild(this.nw), this.sw(), this.sv = new Mn(this.Mm.canvasElement, this, { Pp: () => null === this.Km && !this.Gv.N().handleScroll.vertTouchDrag, kp: () => null === this.Km && !this.Gv.N().handleScroll.horzTouchDrag });
  }
  m() {
    null !== this.Nm && this.Nm.m(), null !== this.Fm && this.Fm.m(), this.Wm = null, this.Mm.unsubscribeSuggestedBitmapSizeChanged(this.um), In(this.Mm.canvasElement), this.Mm.dispose(), this.wm.unsubscribeSuggestedBitmapSizeChanged(this.om), In(this.wm.canvasElement), this.wm.dispose(), null !== this.Jm && (this.Jm.mu().u(this), this.Jm.m()), this.sv.m();
  }
  yv() {
    return u(this.Jm);
  }
  ew(t) {
    null !== this.Jm && this.Jm.mu().u(this), this.Jm = t, null !== this.Jm && this.Jm.mu().i(_Un.prototype.Qm.bind(this), this, true), this.sw(), this.Gv.lv().indexOf(this) === this.Gv.lv().length - 1 ? (this.Wm = this.Wm ?? new Rn(this.tw, this.Gv), this.Wm.Pt()) : (this.Wm?.Xv(), this.Wm = null);
  }
  _m() {
    return this.Gv;
  }
  fv() {
    return this._v;
  }
  sw() {
    if (null !== this.Jm && (this.rw(), 0 !== this.sn().Jn().length)) {
      if (null !== this.Nm) {
        const t = this.Jm.X_();
        this.Nm.un(u(t));
      }
      if (null !== this.Fm) {
        const t = this.Jm.J_();
        this.Fm.un(u(t));
      }
    }
  }
  hw() {
    null !== this.Nm && this.Nm.Pt(), null !== this.Fm && this.Fm.Pt();
  }
  F_() {
    return null !== this.Jm ? this.Jm.F_() : 0;
  }
  W_(t) {
    this.Jm && this.Jm.W_(t);
  }
  bp(t) {
    if (!this.Jm) return;
    this.aw();
    const i = t.localX, n = t.localY;
    this.lw(i, n, t);
  }
  Fp(t) {
    this.aw(), this.ow(), this.lw(t.localX, t.localY, t);
  }
  Sp(t) {
    if (!this.Jm) return;
    this.aw();
    const i = t.localX, n = t.localY;
    this.lw(i, n, t);
  }
  Ap(t) {
    null !== this.Jm && (this.aw(), this.lw(t.localX, t.localY, t), this._w(t));
  }
  fp(t) {
    null !== this.Jm && this.uw(this.jm, t);
  }
  _p(t) {
    this.fp(t);
  }
  Dp(t) {
    this.aw(), this.cw(t), this.lw(t.localX, t.localY, t);
  }
  Ep(t) {
    null !== this.Jm && (this.aw(), this.Ym = false, this.dw(t));
  }
  Bp(t) {
    null !== this.Jm && this._w(t);
  }
  Xp(t) {
    if (this.Ym = true, null === this.Km) {
      const i = { x: t.localX, y: t.localY };
      this.fw(i, i, t);
    }
  }
  Zp(t) {
    null !== this.Jm && (this.aw(), this.Jm.Qt().Rd(null), this.pw());
  }
  mw() {
    return this.$m;
  }
  ww() {
    return this.jm;
  }
  $p() {
    this.qm = 1, this.sn().cs();
  }
  jp(t, i) {
    if (!this.Gv.N().handleScale.pinch) return;
    const n = 5 * (i - this.qm);
    this.qm = i, this.sn().Wd(t._t, n);
  }
  Op(t) {
    this.Ym = false, this.Gm = null !== this.Km, this.ow();
    const i = this.sn().Vd();
    null !== this.Km && i.It() && (this.Zm = { x: i.ni(), y: i.si() }, this.Km = { x: t.localX, y: t.localY });
  }
  Tp(t) {
    if (null === this.Jm) return;
    const i = t.localX, n = t.localY;
    if (null === this.Km) this.cw(t);
    else {
      this.Gm = false;
      const s = u(this.Zm), e2 = s.x + (i - this.Km.x), r2 = s.y + (n - this.Km.y);
      this.lw(e2, r2, t);
    }
  }
  Vp(t) {
    0 === this._m().N().trackingMode.exitMode && (this.Gm = true), this.Mw(), this.dw(t);
  }
  Qs(t, i) {
    const n = this.Jm;
    return null === n ? null : Bi(n, t, i);
  }
  gw(i, n) {
    u("left" === n ? this.Nm : this.Fm).km(size({ width: i, height: this.nm.height }));
  }
  pv() {
    return this.nm;
  }
  km(t) {
    equalSizes(this.nm, t) || (this.nm = t, this.lm = true, this.wm.resizeCanvasElement(t), this.Mm.resizeCanvasElement(t), this.lm = false, this.tw.style.width = t.width + "px", this.tw.style.height = t.height + "px");
  }
  bw() {
    const t = u(this.Jm);
    t.G_(t.X_()), t.G_(t.J_());
    for (const i of t.kl()) if (t.Gs(i)) {
      const n = i.Ft();
      null !== n && t.G_(n), i.Nn();
    }
    for (const i of t.Mu()) i.Nn();
  }
  vv() {
    return this.wm.bitmapSize;
  }
  mv(t, i, n, s) {
    const e2 = this.vv();
    if (e2.width > 0 && e2.height > 0 && (t.drawImage(this.wm.canvasElement, i, n), s)) {
      const s2 = this.Mm.canvasElement;
      null !== t && t.drawImage(s2, i, n);
    }
  }
  Rm(t) {
    if (0 === t) return;
    if (null === this.Jm) return;
    t > 1 && this.bw(), null !== this.Nm && this.Nm.Rm(t), null !== this.Fm && this.Fm.Rm(t);
    const i = { colorSpace: this.Gv.N().layout.colorSpace };
    if (1 !== t) {
      this.wm.applySuggestedBitmapSize();
      const t2 = tryCreateCanvasRenderingTarget2D(this.wm, i);
      null !== t2 && (t2.useBitmapCoordinateSpace(((t3) => {
        this.Im(t3);
      })), this.Jm && (this.Sw(t2, Nn), this.xw(t2), this.Sw(t2, Fn), this.Sw(t2, Wn)));
    }
    this.Mm.applySuggestedBitmapSize();
    const n = tryCreateCanvasRenderingTarget2D(this.Mm, i);
    null !== n && (n.useBitmapCoordinateSpace((({ context: t2, bitmapSize: i2 }) => {
      t2.clearRect(0, 0, i2.width, i2.height);
    })), this.Cw(n), this.Sw(n, Hn), this.Sw(n, Wn));
  }
  yw() {
    return this.Nm;
  }
  Pw() {
    return this.Fm;
  }
  Bm(t, i) {
    this.Sw(t, i);
  }
  Qm() {
    null !== this.Jm && this.Jm.mu().u(this), this.Jm = null;
  }
  _w(t) {
    this.uw(this.$m, t);
  }
  uw(t, i) {
    const n = i.localX, s = i.localY;
    t.v() && t.p(this.sn().Et().Vc(n), { x: n, y: s }, i);
  }
  Im({ context: t, bitmapSize: i }) {
    const { width: n, height: s } = i, e2 = this.sn(), r2 = e2.$(), h2 = e2.af();
    r2 === h2 ? z(t, 0, 0, n, s, h2) : F(t, 0, 0, n, s, r2, h2);
  }
  xw(t) {
    const i = u(this.Jm), n = i.wu().wr().Tt(i);
    null !== n && n.st(t, false);
  }
  Cw(t) {
    this.kw(t, Fn, Bn, this.sn().Vd());
  }
  Sw(t, i) {
    const n = u(this.Jm), s = i === Fn ? this.Tw() : null, e2 = null === s ? null : this.Rw(s, n), r2 = n.Mu();
    if (null === e2 || null === s) {
      const s2 = n._u();
      return this.Dw(t, i, Vn, r2, s2), void this.Dw(t, i, Bn, r2, s2);
    }
    const h2 = n.Dt(), a2 = (t2) => t2 === s ? e2.Za : void 0;
    this.Dw(t, i, Vn, r2, h2, a2), this.Dw(t, i, Bn, r2, h2, a2), this.kw(t, i, Vn, s, e2.qa), this.kw(t, i, Bn, s, e2.qa);
  }
  Dw(t, i, n, s, e2, r2) {
    for (const e3 of s) this.kw(t, i, n, e3);
    if (void 0 !== r2) for (const s2 of e2) this.kw(t, i, n, s2, r2(s2));
    else for (const s2 of e2) this.kw(t, i, n, s2);
  }
  Tw() {
    const t = u(this.Jm), i = t.Qt().cu()?.uu;
    if (!t.Qt().N().hoveredSeriesOnTop || void 0 === i) return null;
    for (const n of t.Dt()) if (n === i) return n;
    return null;
  }
  Rw(t, i) {
    const n = t.Ga?.(i) ?? null;
    return null === n || 0 === n.qa.length ? null : n;
  }
  kw(t, i, n, s, e2) {
    const r2 = u(this.Jm), h2 = r2.Qt().cu(), a2 = null !== h2 && h2.uu === s, l2 = null !== h2 && a2 && void 0 !== h2.bu ? h2.bu.ie : void 0, o2 = (i2) => n(i2, t, a2, l2);
    void 0 === e2 ? En(i, o2, s, r2) : An(e2, o2, r2);
  }
  rw() {
    if (null === this.Jm) return;
    const t = this.Gv, i = this.Jm.X_().N().visible, n = this.Jm.J_().N().visible;
    i || null === this.Nm || (this.iw.removeChild(this.Nm.fv()), this.Nm.m(), this.Nm = null), n || null === this.Fm || (this.nw.removeChild(this.Fm.fv()), this.Fm.m(), this.Fm = null);
    const s = t.Qt().Jd();
    i && null === this.Nm && (this.Nm = new On(this, t.N(), s, "left"), this.iw.appendChild(this.Nm.fv())), n && null === this.Fm && (this.Fm = new On(this, t.N(), s, "right"), this.nw.appendChild(this.Fm.fv()));
  }
  Iw(t) {
    return t.Jp && this.Ym || null !== this.Km;
  }
  lw(t, i, n) {
    t = Math.max(0, Math.min(t, this.nm.width - 1)), i = Math.max(0, Math.min(i, this.nm.height - 1)), this.sn().Kd(t, i, n, u(this.Jm));
  }
  pw() {
    this.sn().Zd();
  }
  Mw() {
    this.Gm && (this.Km = null, this.pw());
  }
  fw(t, i, n) {
    this.Km = t, this.Gm = false, this.lw(i.x, i.y, n);
    const s = this.sn().Vd();
    this.Zm = { x: s.ni(), y: s.si() };
  }
  sn() {
    return this.Gv.Qt();
  }
  dw(t) {
    if (!this.Um) return;
    const i = this.sn(), n = this.yv();
    if (i.eu(n, n.kn()), this.Hm = null, this.Um = false, i.jd(), null !== this.Xm) {
      const t2 = performance.now(), n2 = i.Et();
      this.Xm.me(n2.Oc(), t2), this.Xm.Kc(t2) || i.ps(this.Xm);
    }
  }
  aw() {
    this.Km = null;
  }
  ow() {
    if (!this.Jm) return;
    if (this.sn().cs(), document.activeElement !== document.body && document.activeElement !== document.documentElement) u(document.activeElement).blur();
    else {
      const t = document.getSelection();
      null !== t && t.removeAllRanges();
    }
    !this.Jm.kn().Zi() && this.sn().Et().Zi();
  }
  cw(t) {
    if (null === this.Jm) return;
    const i = this.sn(), n = i.Et();
    if (n.Zi()) return;
    const s = this.Gv.N(), e2 = s.handleScroll, r2 = s.kineticScroll;
    if ((!e2.pressedMouseMove || t.Jp) && (!e2.horzTouchDrag && !e2.vertTouchDrag || !t.Jp)) return;
    const h2 = this.Jm.kn(), a2 = performance.now();
    if (null !== this.Hm || this.Iw(t) || (this.Hm = { x: t.clientX, y: t.clientY, yf: a2, Vw: t.localX, Bw: t.localY }), null !== this.Hm && !this.Um && (this.Hm.x !== t.clientX || this.Hm.y !== t.clientY)) {
      if (t.Jp && r2.touch || !t.Jp && r2.mouse) {
        const t2 = n.ml();
        this.Xm = new Tn(0.2 / t2, 7 / t2, 0.997, 15 / t2), this.Xm.Uv(n.Oc(), this.Hm.yf);
      } else this.Xm = null;
      h2.Zi() || i.nu(this.Jm, h2, t.localY), i.Ud(t.localX), this.Um = true;
    }
    this.Um && (h2.Zi() || i.su(this.Jm, h2, t.localY), i.$d(t.localX), null !== this.Xm && this.Xm.Uv(n.Oc(), a2));
  }
};
var $n = class {
  constructor(i, n, s, e2, r2) {
    this.xt = true, this.nm = size({ width: 0, height: 0 }), this.om = () => this.Rm(3), this.dm = "left" === i, this.bd = s.Jd, this.yn = n, this.Ew = e2, this.Aw = r2, this.uv = document.createElement("div"), this.uv.style.width = "25px", this.uv.style.height = "100%", this.uv.style.overflow = "hidden", this.wm = Dn(this.uv, size({ width: 16, height: 16 })), this.wm.subscribeSuggestedBitmapSizeChanged(this.om);
  }
  m() {
    this.wm.unsubscribeSuggestedBitmapSizeChanged(this.om), In(this.wm.canvasElement), this.wm.dispose();
  }
  fv() {
    return this.uv;
  }
  pv() {
    return this.nm;
  }
  km(t) {
    equalSizes(this.nm, t) || (this.nm = t, this.wm.resizeCanvasElement(t), this.uv.style.width = `${t.width}px`, this.uv.style.height = `${t.height}px`, this.xt = true);
  }
  Rm(t) {
    if (t < 3 && !this.xt) return;
    if (0 === this.nm.width || 0 === this.nm.height) return;
    this.xt = false, this.wm.applySuggestedBitmapSize();
    const i = tryCreateCanvasRenderingTarget2D(this.wm, { colorSpace: this.yn.layout.colorSpace });
    null !== i && i.useBitmapCoordinateSpace(((t2) => {
      this.Im(t2), this.Vm(t2);
    }));
  }
  vv() {
    return this.wm.bitmapSize;
  }
  mv(t, i, n) {
    const s = this.vv();
    s.width > 0 && s.height > 0 && t.drawImage(this.wm.canvasElement, i, n);
  }
  Vm({ context: t, bitmapSize: i, horizontalPixelRatio: n, verticalPixelRatio: s }) {
    if (!this.Ew()) return;
    t.fillStyle = this.yn.timeScale.borderColor;
    const e2 = Math.floor(this.bd.N().S * n), r2 = Math.floor(this.bd.N().S * s), h2 = this.dm ? i.width - e2 : 0;
    t.fillRect(h2, 0, e2, r2);
  }
  Im({ context: t, bitmapSize: i }) {
    z(t, 0, 0, i.width, i.height, this.Aw());
  }
};
function jn(t) {
  return (i) => i.tl?.(t) ?? [];
}
var qn = jn("normal");
var Yn = jn("top");
var Kn = jn("bottom");
var Gn = class {
  constructor(i, n) {
    this.Lw = null, this.zw = null, this.M = null, this.Ow = false, this.nm = size({ width: 0, height: 0 }), this.Nw = new d(), this.rm = new rt(5), this.lm = false, this.om = () => {
      this.lm || this.Gv.Qt().mr();
    }, this.um = () => {
      this.lm || this.Gv.Qt().mr();
    }, this.Gv = i, this.Pu = n, this.yn = i.N().layout, this.jv = document.createElement("tr"), this.Fw = document.createElement("td"), this.Fw.style.padding = "0", this.Ww = document.createElement("td"), this.Ww.style.padding = "0", this.uv = document.createElement("td"), this.uv.style.height = "25px", this.uv.style.padding = "0", this.Hw = document.createElement("div"), this.Hw.style.width = "100%", this.Hw.style.height = "100%", this.Hw.style.position = "relative", this.Hw.style.overflow = "hidden", this.uv.appendChild(this.Hw), this.wm = Dn(this.Hw, size({ width: 16, height: 16 })), this.wm.subscribeSuggestedBitmapSizeChanged(this.om);
    const s = this.wm.canvasElement;
    s.style.position = "absolute", s.style.zIndex = "1", s.style.left = "0", s.style.top = "0", this.Mm = Dn(this.Hw, size({ width: 16, height: 16 })), this.Mm.subscribeSuggestedBitmapSizeChanged(this.um);
    const e2 = this.Mm.canvasElement;
    e2.style.position = "absolute", e2.style.zIndex = "2", e2.style.left = "0", e2.style.top = "0", this.jv.appendChild(this.Fw), this.jv.appendChild(this.uv), this.jv.appendChild(this.Ww), this.Uw(), this.Gv.Qt().N_().i(this.Uw.bind(this), this), this.sv = new Mn(this.Mm.canvasElement, this, { Pp: () => true, kp: () => !this.Gv.N().handleScroll.horzTouchDrag });
  }
  m() {
    this.sv.m(), null !== this.Lw && this.Lw.m(), null !== this.zw && this.zw.m(), this.Mm.unsubscribeSuggestedBitmapSizeChanged(this.um), In(this.Mm.canvasElement), this.Mm.dispose(), this.wm.unsubscribeSuggestedBitmapSizeChanged(this.om), In(this.wm.canvasElement), this.wm.dispose();
  }
  fv() {
    return this.jv;
  }
  $w() {
    return this.Lw;
  }
  jw() {
    return this.zw;
  }
  Fp(t) {
    if (this.Ow) return;
    this.Ow = true;
    const i = this.Gv.Qt();
    !i.Et().Zi() && this.Gv.N().handleScale.axisPressedMouseMove.time && i.Fd(t.localX);
  }
  Op(t) {
    this.Fp(t);
  }
  Wp() {
    const t = this.Gv.Qt();
    !t.Et().Zi() && this.Ow && (this.Ow = false, this.Gv.N().handleScale.axisPressedMouseMove.time && t.Yd());
  }
  Dp(t) {
    const i = this.Gv.Qt();
    !i.Et().Zi() && this.Gv.N().handleScale.axisPressedMouseMove.time && i.qd(t.localX);
  }
  Tp(t) {
    this.Dp(t);
  }
  Ep() {
    this.Ow = false;
    const t = this.Gv.Qt();
    t.Et().Zi() && !this.Gv.N().handleScale.axisPressedMouseMove.time || t.Yd();
  }
  Vp() {
    this.Ep();
  }
  fp() {
    this.Gv.N().handleScale.axisDoubleClickReset.time && this.Gv.Qt().ws();
  }
  _p() {
    this.fp();
  }
  bp() {
    this.Gv.Qt().N().handleScale.axisPressedMouseMove.time && this.zm(1);
  }
  Zp() {
    this.zm(0);
  }
  pv() {
    return this.nm;
  }
  qw() {
    return this.Nw;
  }
  Yw(i, s, e2) {
    equalSizes(this.nm, i) || (this.nm = i, this.lm = true, this.wm.resizeCanvasElement(i), this.Mm.resizeCanvasElement(i), this.lm = false, this.uv.style.width = `${i.width}px`, this.uv.style.height = `${i.height}px`, this.Nw.p(i)), null !== this.Lw && this.Lw.km(size({ width: s, height: i.height })), null !== this.zw && this.zw.km(size({ width: e2, height: i.height }));
  }
  Kw() {
    const t = this.Gw();
    return Math.ceil(t.S + t.C + t.P + t.A + t.I + t.Zw);
  }
  Pt() {
    this.Gv.Qt().Et().zl();
  }
  vv() {
    return this.wm.bitmapSize;
  }
  mv(t, i, n, s) {
    const e2 = this.vv();
    if (e2.width > 0 && e2.height > 0 && (t.drawImage(this.wm.canvasElement, i, n), s)) {
      const s2 = this.Mm.canvasElement;
      t.drawImage(s2, i, n);
    }
  }
  Rm(t) {
    if (0 === t) return;
    const i = { colorSpace: this.yn.colorSpace };
    if (1 !== t) {
      this.wm.applySuggestedBitmapSize();
      const n2 = tryCreateCanvasRenderingTarget2D(this.wm, i);
      null !== n2 && (n2.useBitmapCoordinateSpace(((t2) => {
        this.Im(t2), this.Vm(t2), this.Xw(n2, Kn);
      })), this.Em(n2), this.Xw(n2, qn)), null !== this.Lw && this.Lw.Rm(t), null !== this.zw && this.zw.Rm(t);
    }
    this.Mm.applySuggestedBitmapSize();
    const n = tryCreateCanvasRenderingTarget2D(this.Mm, i);
    null !== n && (n.useBitmapCoordinateSpace((({ context: t2, bitmapSize: i2 }) => {
      t2.clearRect(0, 0, i2.width, i2.height);
    })), this.Jw([...this.Gv.Qt().Jn(), this.Gv.Qt().Vd()], n), this.Xw(n, Yn));
  }
  Xw(t, i) {
    const n = this.Gv.Qt().Jn();
    for (const s of n) En(i, ((i2) => Vn(i2, t, false, void 0)), s, void 0);
    for (const s of n) En(i, ((i2) => Bn(i2, t, false, void 0)), s, void 0);
  }
  Im({ context: t, bitmapSize: i }) {
    z(t, 0, 0, i.width, i.height, this.Gv.Qt().af());
  }
  Vm({ context: t, bitmapSize: i, verticalPixelRatio: n }) {
    if (this.Gv.N().timeScale.borderVisible) {
      t.fillStyle = this.Qw();
      const s = Math.max(1, Math.floor(this.Gw().S * n));
      t.fillRect(0, 0, i.width, s);
    }
  }
  Em(t) {
    const i = this.Gv.Qt().Et(), n = i.zl();
    if (!n || 0 === n.length) return;
    const s = this.Pu.maxTickMarkWeight(n), e2 = this.Gw(), r2 = i.N();
    r2.borderVisible && r2.ticksVisible && t.useBitmapCoordinateSpace((({ context: t2, horizontalPixelRatio: i2, verticalPixelRatio: s2 }) => {
      t2.strokeStyle = this.Qw(), t2.fillStyle = this.Qw();
      const r3 = Math.max(1, Math.floor(i2)), h2 = Math.floor(0.5 * i2);
      t2.beginPath();
      const a2 = Math.round(e2.C * s2);
      for (let s3 = n.length; s3--; ) {
        const e3 = Math.round(n[s3].coord * i2);
        t2.rect(e3 - h2, 0, r3, a2);
      }
      t2.fill();
    })), t.useMediaCoordinateSpace((({ context: t2 }) => {
      const i2 = e2.S + e2.C + e2.A + e2.P / 2;
      t2.textAlign = "center", t2.textBaseline = "middle", t2.fillStyle = this.H(), t2.font = this.ym();
      for (const e3 of n) if (e3.weight < s) {
        const n2 = e3.needAlignCoordinate ? this.tM(t2, e3.coord, e3.label) : e3.coord;
        t2.fillText(e3.label, n2, i2);
      }
      this.Gv.N().timeScale.allowBoldLabels && (t2.font = this.iM());
      for (const e3 of n) if (e3.weight >= s) {
        const n2 = e3.needAlignCoordinate ? this.tM(t2, e3.coord, e3.label) : e3.coord;
        t2.fillText(e3.label, n2, i2);
      }
    }));
  }
  tM(t, i, n) {
    const s = this.rm.Ii(t, n), e2 = s / 2, r2 = Math.floor(i - e2) + 0.5;
    return r2 < 0 ? i += Math.abs(0 - r2) : r2 + s > this.nm.width && (i -= Math.abs(this.nm.width - (r2 + s))), i;
  }
  Jw(t, i) {
    const n = this.Gw();
    for (const s of t) for (const t2 of s.dn()) t2.Tt().st(i, n);
  }
  Qw() {
    return this.Gv.N().timeScale.borderColor;
  }
  H() {
    return this.yn.textColor;
  }
  F() {
    return this.yn.fontSize;
  }
  ym() {
    return x(this.F(), this.yn.fontFamily);
  }
  iM() {
    return x(this.F(), this.yn.fontFamily, "bold");
  }
  Gw() {
    null === this.M && (this.M = { S: 1, L: NaN, A: NaN, I: NaN, tn: NaN, C: 5, P: NaN, k: "", Qi: new rt(), Zw: 0 });
    const t = this.M, i = this.ym();
    if (t.k !== i) {
      const n = this.F();
      t.P = n, t.k = i, t.A = 3 * n / 12, t.I = 3 * n / 12, t.tn = 9 * n / 12, t.L = 0, t.Zw = 4 * n / 12, t.Qi.Os();
    }
    return this.M;
  }
  zm(t) {
    this.uv.style.cursor = 1 === t ? "ew-resize" : "default";
  }
  Uw() {
    const t = this.Gv.Qt(), i = t.N();
    i.leftPriceScale.visible || null === this.Lw || (this.Fw.removeChild(this.Lw.fv()), this.Lw.m(), this.Lw = null), i.rightPriceScale.visible || null === this.zw || (this.Ww.removeChild(this.zw.fv()), this.zw.m(), this.zw = null);
    const n = { Jd: this.Gv.Qt().Jd() }, s = () => i.leftPriceScale.borderVisible && t.Et().N().borderVisible, e2 = () => t.af();
    i.leftPriceScale.visible && null === this.Lw && (this.Lw = new $n("left", i, n, s, e2), this.Fw.appendChild(this.Lw.fv())), i.rightPriceScale.visible && null === this.zw && (this.zw = new $n("right", i, n, s, e2), this.Ww.appendChild(this.zw.fv()));
  }
};
var Zn = !!dn && !!navigator.userAgentData && navigator.userAgentData.brands.some(((t) => t.brand.includes("Chromium"))) && !!dn && (navigator?.userAgentData?.platform ? "Windows" === navigator.userAgentData.platform : navigator.userAgent.toLowerCase().indexOf("win") >= 0);
var Xn = class {
  constructor(t, i, n) {
    var s;
    this.nM = [], this.sM = [], this.eM = 0, this.oo = 0, this.k_ = 0, this.rM = 0, this.hM = 0, this.aM = null, this.lM = false, this.$m = new d(), this.jm = new d(), this.wd = new d(), this.oM = null, this._M = null, this.Kv = t, this.yn = i, this.Pu = n, this.jv = document.createElement("div"), this.jv.classList.add("tv-lightweight-charts"), this.jv.style.overflow = "hidden", this.jv.style.direction = "ltr", this.jv.style.width = "100%", this.jv.style.height = "100%", (s = this.jv).style.userSelect = "none", s.style.webkitUserSelect = "none", s.style.msUserSelect = "none", s.style.MozUserSelect = "none", s.style.webkitTapHighlightColor = "transparent", this.uM = document.createElement("table"), this.uM.setAttribute("cellspacing", "0"), this.jv.appendChild(this.uM), this.cM = this.dM.bind(this), Jn(this.yn) && this.fM(true), this.sn = new qi(this.gd.bind(this), this.yn, n), this.Qt().Bd().i(this.pM.bind(this), this), this.vM = new Gn(this, this.Pu), this.uM.appendChild(this.vM.fv());
    const e2 = i.autoSize && this.mM();
    let r2 = this.yn.width, h2 = this.yn.height;
    if (e2 || 0 === r2 || 0 === h2) {
      const i2 = t.getBoundingClientRect();
      r2 = r2 || i2.width, h2 = h2 || i2.height;
    }
    this.wM(r2, h2), this.MM(), t.appendChild(this.jv), this.gM(), this.sn.Et().Jc().i(this.sn.ka.bind(this.sn), this), this.sn.N_().i(this.sn.ka.bind(this.sn), this);
  }
  Qt() {
    return this.sn;
  }
  N() {
    return this.yn;
  }
  lv() {
    return this.nM;
  }
  bM() {
    return this.vM;
  }
  m() {
    this.fM(false), 0 !== this.eM && window.cancelAnimationFrame(this.eM), this.sn.Bd().u(this), this.sn.Et().Jc().u(this), this.sn.N_().u(this), this.sn.m();
    for (const t of this.nM) this.uM.removeChild(t.fv()), t.mw().u(this), t.ww().u(this), t.m();
    this.nM = [];
    for (const t of this.sM) this.SM(t);
    this.sM = [], u(this.vM).m(), null !== this.jv.parentElement && this.jv.parentElement.removeChild(this.jv), this.wd.m(), this.$m.m(), this.jm.m(), this.xM();
  }
  wM(i, n, s = false) {
    if (this.oo === n && this.k_ === i) return;
    const e2 = (function(i2) {
      const n2 = Math.floor(i2.width), s2 = Math.floor(i2.height);
      return size({ width: n2 - n2 % 2, height: s2 - s2 % 2 });
    })(size({ width: i, height: n }));
    this.oo = e2.height, this.k_ = e2.width;
    const r2 = this.oo + "px", h2 = this.k_ + "px";
    if (this.CM() || (u(this.jv).style.height = r2, u(this.jv).style.width = h2), this.uM.style.height = r2, this.uM.style.width = h2, s) {
      0 !== this.eM && (window.cancelAnimationFrame(this.eM), this.eM = 0), this.lM = false;
      const t = X.ys();
      null !== this.aM && (t.Ss(this.aM), this.aM = null), this.yM(t, performance.now());
    } else this.sn.ka();
  }
  Rm(t) {
    void 0 === t && (t = X.ys());
    for (let i = 0; i < this.nM.length; i++) this.nM[i].Rm(t._s(i).rs);
    this.yn.timeScale.visible && this.vM.Rm(t.ls());
  }
  vr(t) {
    const i = Jn(this.yn);
    this.sn.vr(t);
    const n = Jn(this.yn);
    n !== i && this.fM(n), t.layout?.panes && this.PM(), this.gM(), this.kM(t);
  }
  mw() {
    return this.$m;
  }
  ww() {
    return this.jm;
  }
  Bd() {
    return this.wd;
  }
  TM(t = false) {
    null !== this.aM && (this.yM(this.aM, performance.now()), this.aM = null);
    const i = this.RM(null), n = document.createElement("canvas");
    n.width = i.width, n.height = i.height;
    const s = u(n.getContext("2d"));
    return this.RM(s, t), n;
  }
  DM(t) {
    if ("left" === t && !this.IM()) return 0;
    if ("right" === t && !this.VM()) return 0;
    if (0 === this.nM.length) return 0;
    return u("left" === t ? this.nM[0].yw() : this.nM[0].Pw()).Tm();
  }
  CM() {
    return this.yn.autoSize && null !== this.oM;
  }
  Mv() {
    return this.jv;
  }
  BM(t) {
    this._M = t, this._M ? this.Mv().style.setProperty("cursor", t) : this.Mv().style.removeProperty("cursor");
  }
  EM() {
    return this._M;
  }
  AM(t) {
    return _(this.nM[t]).pv();
  }
  PM() {
    this.sM.forEach(((t) => {
      t.Pt();
    }));
  }
  kM(t) {
    (void 0 !== t.autoSize || !this.oM || void 0 === t.width && void 0 === t.height) && (t.autoSize && !this.oM && this.mM(), false === t.autoSize && null !== this.oM && this.xM(), t.autoSize || void 0 === t.width && void 0 === t.height || this.wM(t.width || this.k_, t.height || this.oo));
  }
  RM(i, n) {
    let s = 0, e2 = 0;
    const r2 = this.nM[0], h2 = (t, s2) => {
      let e3 = 0;
      for (let r3 = 0; r3 < this.nM.length; r3++) {
        const h3 = this.nM[r3], a3 = u("left" === t ? h3.yw() : h3.Pw()), l2 = a3.vv();
        if (null !== i && a3.mv(i, s2, e3, n), e3 += l2.height, r3 < this.nM.length - 1) {
          const t2 = this.sM[r3], n2 = t2.vv();
          null !== i && t2.mv(i, s2, e3), e3 += n2.height;
        }
      }
    };
    if (this.IM()) {
      h2("left", 0);
      s += u(r2.yw()).vv().width;
    }
    for (let t = 0; t < this.nM.length; t++) {
      const r3 = this.nM[t], h3 = r3.vv();
      if (null !== i && r3.mv(i, s, e2, n), e2 += h3.height, t < this.nM.length - 1) {
        const n2 = this.sM[t], r4 = n2.vv();
        null !== i && n2.mv(i, s, e2), e2 += r4.height;
      }
    }
    if (s += r2.vv().width, this.VM()) {
      h2("right", s);
      s += u(r2.Pw()).vv().width;
    }
    const a2 = (t, n2, s2) => {
      u("left" === t ? this.vM.$w() : this.vM.jw()).mv(u(i), n2, s2);
    };
    if (this.yn.timeScale.visible) {
      const t = this.vM.vv();
      if (null !== i) {
        let s2 = 0;
        this.IM() && (a2("left", s2, e2), s2 = u(r2.yw()).vv().width), this.vM.mv(i, s2, e2, n), s2 += t.width, this.VM() && a2("right", s2, e2);
      }
      e2 += t.height;
    }
    return size({ width: s, height: e2 });
  }
  LM() {
    let i = 0, n = 0, s = 0;
    for (const t of this.nM) this.IM() && (n = Math.max(n, u(t.yw()).Cm(), this.yn.leftPriceScale.minimumWidth)), this.VM() && (s = Math.max(s, u(t.Pw()).Cm(), this.yn.rightPriceScale.minimumWidth)), i += t.F_();
    n = mn(n), s = mn(s);
    const e2 = this.k_, r2 = this.oo, h2 = Math.max(e2 - n - s, 0), a2 = 1 * this.sM.length, l2 = this.yn.timeScale.visible;
    let o2 = l2 ? Math.max(this.vM.Kw(), this.yn.timeScale.minimumHeight) : 0;
    var _2;
    o2 = (_2 = o2) + _2 % 2;
    const c2 = a2 + o2, d2 = r2 < c2 ? 0 : r2 - c2, f2 = d2 / i;
    let p2 = 0;
    const v2 = window.devicePixelRatio || 1;
    for (let i2 = 0; i2 < this.nM.length; ++i2) {
      const e3 = this.nM[i2];
      e3.ew(this.sn.Gn()[i2]);
      let r3 = 0, a3 = 0;
      a3 = i2 === this.nM.length - 1 ? Math.ceil((d2 - p2) * v2) / v2 : Math.round(e3.F_() * f2 * v2) / v2, r3 = Math.max(a3, 2), p2 += r3, e3.km(size({ width: h2, height: r3 })), this.IM() && e3.gw(n, "left"), this.VM() && e3.gw(s, "right"), e3.yv() && this.sn.Ed(e3.yv(), r3);
    }
    this.vM.Yw(size({ width: l2 ? h2 : 0, height: o2 }), l2 ? n : 0, l2 ? s : 0), this.sn.H_(h2), this.rM !== n && (this.rM = n), this.hM !== s && (this.hM = s);
  }
  fM(t) {
    t ? this.jv.addEventListener("wheel", this.cM, { passive: false }) : this.jv.removeEventListener("wheel", this.cM);
  }
  zM(t) {
    switch (t.deltaMode) {
      case t.DOM_DELTA_PAGE:
        return 120;
      case t.DOM_DELTA_LINE:
        return 32;
    }
    return Zn ? 1 / window.devicePixelRatio : 1;
  }
  dM(t) {
    if (!(0 !== t.deltaX && this.yn.handleScroll.mouseWheel || 0 !== t.deltaY && this.yn.handleScale.mouseWheel)) return;
    const i = this.zM(t), n = i * t.deltaX / 100, s = -i * t.deltaY / 100;
    if (t.cancelable && t.preventDefault(), 0 !== s && this.yn.handleScale.mouseWheel) {
      const i2 = Math.sign(s) * Math.min(1, Math.abs(s)), n2 = t.clientX - this.jv.getBoundingClientRect().left;
      this.Qt().Wd(n2, i2);
    }
    0 !== n && this.yn.handleScroll.mouseWheel && this.Qt().Hd(-80 * n);
  }
  yM(t, i) {
    const n = t.ls();
    3 === n && this.OM(), 3 !== n && 2 !== n || (this.NM(t), this.FM(t, i), this.vM.Pt(), this.nM.forEach(((t2) => {
      t2.hw();
    })), 3 === this.aM?.ls() && (this.aM.Ss(t), this.OM(), this.NM(this.aM), this.FM(this.aM, i), t = this.aM, this.aM = null)), this.Rm(t);
  }
  FM(t, i) {
    for (const n of t.bs()) this.xs(n, i);
  }
  NM(t) {
    const i = this.sn.Gn();
    for (let n = 0; n < i.length; n++) t._s(n).hs && i[n].lu();
  }
  xs(t, i) {
    const n = this.sn.Et();
    switch (t.ds) {
      case 0:
        n.td();
        break;
      case 1:
        n.nd(t.Wt);
        break;
      case 2:
        n.Ms(t.Wt);
        break;
      case 3:
        n.gs(t.Wt);
        break;
      case 4:
        n.Wc();
        break;
      case 5:
        t.Wt.Kc(i) || n.gs(t.Wt.Gc(i));
    }
  }
  gd(t) {
    null !== this.aM ? this.aM.Ss(t) : this.aM = t, this.lM || (this.lM = true, this.eM = window.requestAnimationFrame(((t2) => {
      if (this.lM = false, this.eM = 0, null !== this.aM) {
        const i = this.aM;
        this.aM = null, this.yM(i, t2);
        for (const n of i.bs()) if (5 === n.ds && !n.Wt.Kc(t2)) {
          this.Qt().ps(n.Wt);
          break;
        }
      }
    })));
  }
  OM() {
    this.MM();
  }
  SM(t) {
    this.uM.removeChild(t.fv()), t.m();
  }
  MM() {
    const t = this.sn.Gn(), i = t.length, n = this.nM.length;
    for (let t2 = i; t2 < n; t2++) {
      const t3 = _(this.nM.pop());
      this.uM.removeChild(t3.fv()), t3.mw().u(this), t3.ww().u(this), t3.m();
      const i2 = this.sM.pop();
      void 0 !== i2 && this.SM(i2);
    }
    for (let s = n; s < i; s++) {
      const i2 = new Un(this, t[s]);
      if (i2.mw().i(this.WM.bind(this, i2), this), i2.ww().i(this.HM.bind(this, i2), this), this.nM.push(i2), s > 0) {
        const t2 = new yn(this, s - 1, s);
        this.sM.push(t2), this.uM.insertBefore(t2.fv(), this.vM.fv());
      }
      this.uM.insertBefore(i2.fv(), this.vM.fv());
    }
    for (let n2 = 0; n2 < i; n2++) {
      const i2 = t[n2], s = this.nM[n2];
      s.yv() !== i2 ? s.ew(i2) : s.sw();
    }
    this.gM(), this.LM();
  }
  UM(t, i, n, s) {
    const e2 = /* @__PURE__ */ new Map();
    if (null !== t) {
      this.sn.Jn().forEach(((i2) => {
        const n2 = i2.Un().Hn(t);
        null !== n2 && e2.set(i2, n2);
      }));
    }
    let r2;
    if (null !== t) {
      const i2 = this.sn.Et().en(t)?.originalTime;
      void 0 !== i2 && (r2 = i2);
    }
    const h2 = this.Qt().cu(), a2 = this.$M(s), l2 = (function(t2, i2) {
      const n2 = null !== t2 && t2.uu instanceof Jt ? t2.uu : void 0, s2 = t2?.bu?.te, e3 = void 0 !== i2 && -1 !== i2 ? i2 : void 0;
      return null === t2 || void 0 === t2.ee ? { jM: n2, qM: s2 } : { jM: n2, qM: s2, YM: { ds: t2.ee, KM: (r3 = t2.uu, h3 = t2.ee, r3 instanceof Pi ? "pane-primitive" : "marker" === h3 || "primitive" === h3 ? "series-primitive" : "series"), GM: vn(t2.ee, s2), Y_: n2, ZM: s2, XM: e3 } };
      var r3, h3;
    })(h2, a2);
    return { Qr: r2, $n: t ?? void 0, JM: i ?? void 0, XM: -1 !== a2 ? a2 : void 0, jM: l2.jM, QM: e2, qM: l2.qM, YM: l2.YM, tg: n ?? void 0 };
  }
  $M(t) {
    let i = -1;
    if (t) i = this.nM.indexOf(t);
    else {
      const t2 = this.Qt().Vd().Kn();
      null !== t2 && (i = this.Qt().Gn().indexOf(t2));
    }
    return i;
  }
  WM(t, i, n, s) {
    this.$m.p((() => this.UM(i, n, s, t)));
  }
  HM(t, i, n, s) {
    this.jm.p((() => this.UM(i, n, s, t)));
  }
  pM(t, i, n) {
    this.BM(this.Qt().cu()?.gu ?? null), this.wd.p((() => this.UM(t, i, n)));
  }
  gM() {
    const t = this.yn.timeScale.visible ? "" : "none";
    this.vM.fv().style.display = t;
  }
  IM() {
    return this.nM[0].yv().X_().N().visible;
  }
  VM() {
    return this.nM[0].yv().J_().N().visible;
  }
  mM() {
    return "ResizeObserver" in window && (this.oM = new ResizeObserver(((t) => {
      const i = t[t.length - 1];
      if (!i) return;
      const n = i.contentRect.width, s = i.contentRect.height;
      this.wM(n, s, true);
    })), this.oM.observe(this.Kv, { box: "border-box" }), true);
  }
  xM() {
    null !== this.oM && this.oM.disconnect(), this.oM = null;
  }
};
function Jn(t) {
  return Boolean(t.handleScroll.mouseWheel || t.handleScale.mouseWheel);
}
function Qn(t) {
  return void 0 === t.open && void 0 === t.value;
}
function ts(t) {
  return (function(t2) {
    return void 0 !== t2.open;
  })(t) || (function(t2) {
    return void 0 !== t2.value;
  })(t);
}
function is(t, i, n, s) {
  const e2 = n.value, r2 = { $n: i, wt: t, Wt: [e2, e2, e2, e2], Qr: s };
  return void 0 !== n.color && (r2.R = n.color), r2;
}
function ns(t, i, n, s) {
  const e2 = n.value, r2 = { $n: i, wt: t, Wt: [e2, e2, e2, e2], Qr: s };
  return void 0 !== n.lineColor && (r2.vt = n.lineColor), void 0 !== n.topColor && (r2.ah = n.topColor), void 0 !== n.bottomColor && (r2.oh = n.bottomColor), r2;
}
function ss(t, i, n, s) {
  const e2 = n.value, r2 = { $n: i, wt: t, Wt: [e2, e2, e2, e2], Qr: s };
  return void 0 !== n.topLineColor && (r2._h = n.topLineColor), void 0 !== n.bottomLineColor && (r2.uh = n.bottomLineColor), void 0 !== n.topFillColor1 && (r2.dh = n.topFillColor1), void 0 !== n.topFillColor2 && (r2.fh = n.topFillColor2), void 0 !== n.bottomFillColor1 && (r2.ph = n.bottomFillColor1), void 0 !== n.bottomFillColor2 && (r2.mh = n.bottomFillColor2), r2;
}
function es(t, i, n, s) {
  const e2 = { $n: i, wt: t, Wt: [n.open, n.high, n.low, n.close], Qr: s };
  return void 0 !== n.color && (e2.R = n.color), e2;
}
function rs(t, i, n, s) {
  const e2 = { $n: i, wt: t, Wt: [n.open, n.high, n.low, n.close], Qr: s };
  return void 0 !== n.color && (e2.R = n.color), void 0 !== n.borderColor && (e2.Ht = n.borderColor), void 0 !== n.wickColor && (e2.hh = n.wickColor), e2;
}
function hs(t, i, n, s, e2) {
  const r2 = _(e2)(n), h2 = Math.max(...r2), a2 = Math.min(...r2), l2 = r2[r2.length - 1], o2 = [l2, h2, a2, l2], { time: u2, color: c2, ...d2 } = n;
  return { $n: i, wt: t, Wt: o2, Qr: s, ue: d2, R: c2 };
}
function as(t) {
  return void 0 !== t.Wt;
}
function ls(t, i) {
  return void 0 !== i.customValues && (t.ig = i.customValues), t;
}
function os(t) {
  return (i, n, s, e2, r2, h2) => (function(t2, i2) {
    return i2 ? i2(t2) : Qn(t2);
  })(s, h2) ? ls({ wt: i, $n: n, Qr: e2 }, s) : ls(t(i, n, s, e2, r2), s);
}
function _s(t) {
  return { Candlestick: os(rs), Bar: os(es), Area: os(ns), Baseline: os(ss), Histogram: os(is), Line: os(is), Custom: os(hs) }[t];
}
function us(t) {
  return { $n: 0, ng: /* @__PURE__ */ new Map(), Oa: t };
}
function cs(t, i) {
  if (void 0 !== t && 0 !== t.length) return { sg: i.key(t[0].wt), eg: i.key(t[t.length - 1].wt) };
}
function ds(t) {
  let i;
  return t.forEach(((t2) => {
    void 0 === i && (i = t2.Qr);
  })), _(i);
}
var fs = class {
  constructor(t) {
    this.rg = /* @__PURE__ */ new Map(), this.hg = /* @__PURE__ */ new Map(), this.ag = /* @__PURE__ */ new Map(), this.lg = [], this.Pu = t;
  }
  m() {
    this.rg.clear(), this.hg.clear(), this.ag.clear(), this.lg = [];
  }
  og(t, i) {
    let n = 0 !== this.rg.size, s = false;
    const e2 = this.hg.get(t);
    if (void 0 !== e2) if (1 === this.hg.size) n = false, s = true, this.rg.clear();
    else for (const i2 of this.lg) i2.pointData.ng.delete(t) && (s = true);
    let r2 = [];
    if (0 !== i.length) {
      const n2 = i.map(((t2) => t2.time)), e3 = this.Pu.createConverterToInternalObj(i), h3 = _s(t.bh()), a2 = t.ul(), l2 = t.cl();
      r2 = i.map(((i2, r3) => {
        const o2 = e3(i2.time), _2 = this.Pu.key(o2);
        let u2 = this.rg.get(_2);
        void 0 === u2 && (u2 = us(o2), this.rg.set(_2, u2), s = true);
        const c2 = h3(o2, u2.$n, i2, n2[r3], a2, l2);
        return u2.ng.set(t, c2), c2;
      }));
    }
    n && this._g(), this.ug(t, r2);
    let h2 = -1;
    if (s) {
      const t2 = [];
      this.rg.forEach(((i2) => {
        t2.push({ timeWeight: 0, time: i2.Oa, pointData: i2, originalTime: ds(i2.ng) });
      })), t2.sort(((t3, i2) => this.Pu.key(t3.time) - this.Pu.key(i2.time))), h2 = this.cg(t2);
    }
    return this.dg(t, h2, (function(t2, i2, n2) {
      const s2 = cs(t2, n2), e3 = cs(i2, n2);
      if (void 0 !== s2 && void 0 !== e3) return { fg: false, Va: s2.eg >= e3.eg && s2.sg >= e3.sg };
    })(this.hg.get(t), e2, this.Pu));
  }
  if(t) {
    return this.og(t, []);
  }
  pg(t, i, n) {
    if (n && t.Fa()) throw new Error("Historical updates are not supported when conflation is enabled. Conflation requires data to be processed in order.");
    const s = i;
    !(function(t2) {
      void 0 === t2.Qr && (t2.Qr = t2.time);
    })(s), this.Pu.preprocessData(i);
    const e2 = this.Pu.createConverterToInternalObj([i])(i.time), r2 = this.ag.get(t);
    if (!n && void 0 !== r2 && this.Pu.key(e2) < this.Pu.key(r2)) throw new Error(`Cannot update oldest data, last time=${r2}, new time=${e2}`);
    let h2 = this.rg.get(this.Pu.key(e2));
    if (n && void 0 === h2) throw new Error("Cannot update non-existing data point when historicalUpdate is true");
    const a2 = void 0 === h2;
    void 0 === h2 && (h2 = us(e2), this.rg.set(this.Pu.key(e2), h2));
    const l2 = _s(t.bh()), o2 = t.ul(), _2 = t.cl(), u2 = l2(e2, h2.$n, i, s.Qr, o2, _2), c2 = !n && !a2 && void 0 !== r2 && this.Pu.key(e2) === this.Pu.key(r2);
    h2.ng.set(t, u2), n ? this.vg(t, u2, h2.$n) : c2 && t.Fa() && as(u2) ? (t.Rr(u2), this.mg(t, u2)) : this.mg(t, u2);
    const d2 = { Va: as(u2), fg: n };
    if (!a2) return this.dg(t, -1, d2);
    const f2 = { timeWeight: 0, time: h2.Oa, pointData: h2, originalTime: ds(h2.ng) }, p2 = Rt(this.lg, this.Pu.key(f2.time), ((t2, i2) => this.Pu.key(t2.time) < i2));
    this.lg.splice(p2, 0, f2);
    for (let t2 = p2; t2 < this.lg.length; ++t2) ps(this.lg[t2].pointData, t2);
    return this.Pu.fillWeightsForPoints(this.lg, p2), this.dg(t, p2, d2);
  }
  wg(t, i) {
    const n = this.hg.get(t);
    if (void 0 === n || i <= 0) return [[], this.Mg()];
    i = Math.min(i, n.length);
    const s = n.splice(-i).reverse();
    0 === n.length ? this.ag.delete(t) : this.ag.set(t, n[n.length - 1].wt);
    for (const i2 of s) {
      const n2 = this.rg.get(this.Pu.key(i2.wt));
      if (n2 && (n2.ng.delete(t), 0 === n2.ng.size)) {
        this.rg.delete(this.Pu.key(n2.Oa)), this.lg.splice(n2.$n, 1);
        for (let t2 = n2.$n; t2 < this.lg.length; ++t2) ps(this.lg[t2].pointData, t2);
      }
    }
    return [s, this.dg(t, this.lg.length - 1, { fg: false, Va: false })];
  }
  mg(t, i) {
    let n = this.hg.get(t);
    void 0 === n && (n = [], this.hg.set(t, n));
    const s = 0 !== n.length ? n[n.length - 1] : null;
    null === s || this.Pu.key(i.wt) > this.Pu.key(s.wt) ? as(i) && n.push(i) : as(i) ? n[n.length - 1] = i : n.splice(-1, 1), this.ag.set(t, i.wt);
  }
  vg(t, i, n) {
    const s = this.hg.get(t);
    if (void 0 === s) return;
    const e2 = Rt(s, n, ((t2, i2) => t2.$n < i2));
    as(i) ? s[e2] = i : s.splice(e2, 1);
  }
  ug(t, i) {
    0 !== i.length ? (this.hg.set(t, i.filter(as)), this.ag.set(t, i[i.length - 1].wt)) : (this.hg.delete(t), this.ag.delete(t));
  }
  _g() {
    for (const t of this.lg) 0 === t.pointData.ng.size && this.rg.delete(this.Pu.key(t.time));
  }
  cg(t) {
    let i = -1;
    for (let n = 0; n < this.lg.length && n < t.length; ++n) {
      const s = this.lg[n], e2 = t[n];
      if (this.Pu.key(s.time) !== this.Pu.key(e2.time)) {
        i = n;
        break;
      }
      e2.timeWeight = s.timeWeight, ps(e2.pointData, n);
    }
    if (-1 === i && this.lg.length !== t.length && (i = Math.min(this.lg.length, t.length)), -1 === i) return -1;
    for (let n = i; n < t.length; ++n) ps(t[n].pointData, n);
    return this.Pu.fillWeightsForPoints(t, i), this.lg = t, i;
  }
  gg() {
    if (0 === this.hg.size) return null;
    let t = 0;
    return this.hg.forEach(((i) => {
      0 !== i.length && (t = Math.max(t, i[i.length - 1].$n));
    })), t;
  }
  dg(t, i, n) {
    const s = this.Mg();
    if (-1 !== i) this.hg.forEach(((i2, e2) => {
      s.Y_.set(e2, { ue: i2, bg: e2 === t ? n : void 0 });
    })), this.hg.has(t) || s.Y_.set(t, { ue: [], bg: n }), s.Et.Sg = this.lg, s.Et.xg = i;
    else {
      const i2 = this.hg.get(t);
      s.Y_.set(t, { ue: i2 || [], bg: n });
    }
    return s;
  }
  Mg() {
    return { Y_: /* @__PURE__ */ new Map(), Et: { Dc: this.gg() } };
  }
};
function ps(t, i) {
  t.$n = i, t.ng.forEach(((t2) => {
    t2.$n = i;
  }));
}
function vs(t, i) {
  return t._t < i;
}
function ms(t, i) {
  return i < t._t;
}
function ws(t, i, n, s) {
  return Rt(t, i, vs, n, s);
}
function Ms(t, i, n, s) {
  return Dt(t, i, ms, n, s);
}
function gs(t, i, n) {
  return { ne: t, se: i, ee: n };
}
var xs = [0, 0];
function Cs(t, i, n) {
  return void 0 === i || i.wt !== t.wt - 1 ? t._t - n / 2 : (i._t + t._t) / 2;
}
function ys(t, i, n) {
  return void 0 === i || i.wt !== t.wt + 1 ? t._t + n / 2 : (t._t + i._t) / 2;
}
function Ps(t, i, n, s, e2, r2, h2) {
  if (null === i || i.from >= i.to || 0 === t.length) return null;
  const a2 = e2 / 2 + r2, l2 = ws(t, n - a2, i.from, i.to), o2 = Ms(t, n + a2, l2, i.to);
  if (l2 >= o2) return null;
  let _2 = Number.POSITIVE_INFINITY;
  for (let a3 = l2; a3 < o2; a3++) {
    const l3 = t[a3], o3 = a3 > i.from ? t[a3 - 1] : void 0, u2 = a3 < i.to - 1 ? t[a3 + 1] : void 0, c2 = Cs(l3, o3, e2) - r2, d2 = ys(l3, u2, e2) + r2;
    if (n < c2 || n > d2) continue;
    h2(l3, xs);
    const f2 = xs[0], p2 = xs[1], v2 = Math.min(f2, p2), m2 = Math.max(f2, p2), w2 = v2 - r2, M2 = m2 + r2;
    if (s >= v2 && s <= m2) _2 = Math.min(_2, 0);
    else if (s >= w2 && s <= M2) {
      const t2 = Math.min(Math.abs(s - v2), Math.abs(m2 - s));
      _2 = Math.min(_2, t2);
    }
  }
  return Number.isFinite(_2) ? gs(_2, 0, "series-range") : null;
}
function ks(t, i) {
  return t.wt < i;
}
function Ts(t, i) {
  return i < t.wt;
}
function Rs(t, i, n) {
  const s = i.Na(), e2 = i.bi(), r2 = Rt(t, s, ks), h2 = Dt(t, e2, Ts);
  if (!n) return { from: r2, to: h2 };
  let a2 = r2, l2 = h2;
  return r2 > 0 && r2 < t.length && t[r2].wt >= s && (a2 = r2 - 1), h2 > 0 && h2 < t.length && t[h2 - 1].wt <= e2 && (l2 = h2 + 1), { from: a2, to: l2 };
}
var Ds = class {
  constructor(t, i, n) {
    this.Cg = true, this.yg = true, this.Pg = true, this.kg = [], this.Tg = null, this.Rg = -1, this.ae = t, this.le = i, this.Dg = n;
  }
  Pt(t) {
    this.Cg = true, "data" === t && (this.yg = true), "options" === t && (this.Pg = true);
  }
  Tt() {
    return this.ae.It() ? (this.Ig(), null === this.Tg ? null : this.Vg) : null;
  }
  Qs(t, i) {
    return this.ae.It() ? (this.Ig(), null === this.Tg ? null : this.Bg(t, i)) : null;
  }
  Bg(t, i) {
    return null;
  }
  Eg() {
    this.kg = this.kg.map(((t) => ({ ...t, ...this.ae.Sa().Sh(t.wt) })));
  }
  Ag() {
    this.Tg = null;
  }
  Ig() {
    const t = this.le.Et(), i = t.N().enableConflation ? t.sd() : 0;
    i !== this.Rg && (this.yg = true, this.Rg = i), this.yg && (this.Lg(), this.yg = false), this.Pg && (this.Eg(), this.Pg = false), this.Cg && (this.zg(), this.Cg = false);
  }
  zg() {
    const t = this.ae.Ft(), i = this.le.Et();
    if (this.Ag(), i.Zi() || t.Zi()) return;
    const n = i.Ee();
    if (null === n) return;
    if (0 === this.ae.Un().Th()) return;
    const s = this.ae.Lt();
    null !== s && (this.Tg = Rs(this.kg, n, this.Dg), this.Og(t, i, s.Wt), this.Ng());
  }
};
var Is = class {
  constructor(t, i) {
    this.Fg = t, this.Ki = i;
  }
  st(t, i, n) {
    this.Fg.draw(t, this.Ki, i, n);
  }
};
function Vs(t) {
  switch (t) {
    case "point":
      return 2;
    case "range":
      return 0;
    default:
      return 1;
  }
}
var Bs = class extends Ds {
  constructor(t, i, n) {
    super(t, i, false), this.Yh = n, this.Fg = this.Yh.renderer(), this.Vg = new Is(this.Fg, ((t2) => this.Wg(t2)));
  }
  get ga() {
    return this.Yh.conflationReducer;
  }
  Ha(t) {
    return this.Yh.priceValueBuilder(t);
  }
  dl(t) {
    return this.Yh.isWhitespace(t);
  }
  Bg(t, i) {
    const n = this.Fg.hitTest?.(t, i, ((t2) => this.Wg(t2)));
    if (null != n) return { ne: (s = n).distance, se: Vs(s.type), ee: "custom", gu: s.cursorStyle, te: s.objectId, ie: s.hitTestData };
    var s;
    const e2 = Ps(this.kg, this.Tg, t, i, this.le.Et().ml(), this.ae.N().hitTestTolerance, ((t2, i2) => {
      const n2 = t2.Hg;
      let s2 = NaN, e3 = NaN;
      if (void 0 !== n2 && !this.Yh.isWhitespace(n2)) for (const t3 of this.Yh.priceValueBuilder(n2)) {
        const i3 = this.Wg(t3);
        null !== i3 && (s2 = Number.isNaN(s2) ? i3 : Math.min(s2, i3), e3 = Number.isNaN(e3) ? i3 : Math.max(e3, i3));
      }
      i2[0] = s2, i2[1] = e3;
    }));
    return null === e2 ? null : { ...e2, ee: "custom" };
  }
  Lg() {
    const t = this.ae.Sa();
    this.kg = this.ae.Ua().Bh().map(((i) => ({ wt: i.$n, _t: NaN, ...t.Sh(i.$n), Hg: i.ue })));
  }
  Og(t, i) {
    i.Ic(this.kg, b(this.Tg));
  }
  Ng() {
    this.Yh.update({ bars: this.kg.map(Es), barSpacing: this.le.Et().ml(), visibleRange: this.Tg, conflationFactor: this.le.Et().sd() }, this.ae.N());
  }
  Wg(t) {
    const i = this.ae.Lt();
    return null === i ? null : this.ae.Ft().Nt(t, i.Wt);
  }
};
function Es(t) {
  return { x: t._t, time: t.wt, originalData: t.Hg, barColor: t.sh };
}
var As = { color: "#2196f3" };
var Ls = (t, i, n) => {
  const s = c(n);
  return new Bs(t, i, s);
};
function zs(t) {
  const i = { value: t.Wt[3], time: t.Qr };
  return void 0 !== t.ig && (i.customValues = t.ig), i;
}
function Os(t) {
  const i = zs(t);
  return void 0 !== t.R && (i.color = t.R), i;
}
function Ns(t) {
  const i = zs(t);
  return void 0 !== t.vt && (i.lineColor = t.vt), void 0 !== t.ah && (i.topColor = t.ah), void 0 !== t.oh && (i.bottomColor = t.oh), i;
}
function Fs(t) {
  const i = zs(t);
  return void 0 !== t._h && (i.topLineColor = t._h), void 0 !== t.uh && (i.bottomLineColor = t.uh), void 0 !== t.dh && (i.topFillColor1 = t.dh), void 0 !== t.fh && (i.topFillColor2 = t.fh), void 0 !== t.ph && (i.bottomFillColor1 = t.ph), void 0 !== t.mh && (i.bottomFillColor2 = t.mh), i;
}
function Ws(t) {
  const i = { open: t.Wt[0], high: t.Wt[1], low: t.Wt[2], close: t.Wt[3], time: t.Qr };
  return void 0 !== t.ig && (i.customValues = t.ig), i;
}
function Hs(t) {
  const i = Ws(t);
  return void 0 !== t.R && (i.color = t.R), i;
}
function Us(t) {
  const i = Ws(t), { R: n, Ht: s, hh: e2 } = t;
  return void 0 !== n && (i.color = n), void 0 !== s && (i.borderColor = s), void 0 !== e2 && (i.wickColor = e2), i;
}
function $s(t) {
  return { Area: Ns, Line: Os, Baseline: Fs, Histogram: Os, Bar: Hs, Candlestick: Us, Custom: js }[t];
}
function js(t) {
  const i = t.Qr;
  return { ...t.ue, time: i };
}
var qs = { vertLine: { color: "#9598A1", width: 1, style: 3, visible: true, labelVisible: true, labelBackgroundColor: "#131722" }, horzLine: { color: "#9598A1", width: 1, style: 3, visible: true, labelVisible: true, labelBackgroundColor: "#131722" }, mode: 1, doNotSnapToHiddenSeriesIndices: false };
var Ys = { vertLines: { color: "#D6DCDE", style: 0, visible: true }, horzLines: { color: "#D6DCDE", style: 0, visible: true } };
var Ks = { background: { type: "solid", color: "#FFFFFF" }, textColor: "#191919", fontSize: 12, fontFamily: S, panes: { enableResize: true, separatorColor: "#E0E3EB", separatorHoverColor: "rgba(178, 181, 189, 0.2)" }, attributionLogo: true, colorSpace: "srgb", colorParsers: [] };
var Gs = { autoScale: true, mode: 0, invertScale: false, alignLabels: true, borderVisible: true, borderColor: "#2B2B43", entireTextOnly: false, visible: false, ticksVisible: false, scaleMargins: { bottom: 0.1, top: 0.2 }, minimumWidth: 0, ensureEdgeTickMarksVisible: false, tickMarkDensity: 2.5 };
var Zs = { rightOffset: 0, barSpacing: 6, minBarSpacing: 0.5, maxBarSpacing: 0, fixLeftEdge: false, fixRightEdge: false, lockVisibleTimeRangeOnResize: false, rightBarStaysOnScroll: false, borderVisible: true, borderColor: "#2B2B43", visible: true, timeVisible: false, secondsVisible: true, shiftVisibleRangeOnNewBar: true, allowShiftVisibleRangeOnWhitespaceReplacement: false, ticksVisible: false, uniformDistribution: false, minimumHeight: 0, allowBoldLabels: true, ignoreWhitespaceIndices: false, enableConflation: false, conflationThresholdFactor: 1, precomputeConflationOnInit: false, precomputeConflationPriority: "background" };
function Xs() {
  return { addDefaultPane: true, hoveredSeriesOnTop: true, width: 0, height: 0, autoSize: false, layout: Ks, crosshair: qs, grid: Ys, overlayPriceScales: { ...Gs }, leftPriceScale: { ...Gs, visible: false }, rightPriceScale: { ...Gs, visible: true }, defaultVisiblePriceScaleId: "right", timeScale: Zs, localization: { locale: dn ? navigator.language : "", dateFormat: "dd MMM 'yy" }, handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true }, handleScale: { axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true }, mouseWheel: true, pinch: true }, kineticScroll: { mouse: false, touch: true }, trackingMode: { exitMode: 1 } };
}
var Js = class {
  constructor(t, i, n) {
    this.hv = t, this.Ug = i, this.$g = n ?? 0;
  }
  applyOptions(t) {
    this.hv.Qt().Dd(this.Ug, t, this.$g);
  }
  options() {
    return this.Ki().N();
  }
  width() {
    return Z(this.Ug) ? this.hv.DM(this.Ug) : 0;
  }
  setVisibleRange(t) {
    this.setAutoScale(false), this.Ki().Go(new mt(t.from, t.to));
  }
  getVisibleRange() {
    let t, i, n = this.Ki().ar();
    if (null === n) return null;
    if (this.Ki().ho()) {
      const s = this.Ki().S_(), e2 = Yi(s);
      n = vi(n, this.Ki().lo()), t = Number((Math.round(n.Je() / s) * s).toFixed(e2)), i = Number((Math.round(n.Qe() / s) * s).toFixed(e2));
    } else t = n.Je(), i = n.Qe();
    return { from: t, to: i };
  }
  setAutoScale(t) {
    this.applyOptions({ autoScale: t });
  }
  Ki() {
    return u(this.hv.Qt().Id(this.Ug, this.$g)).Ft;
  }
};
var Qs = class {
  constructor(t, i, n, s) {
    this.hv = t, this.yt = n, this.jg = i, this.qg = s;
  }
  getHeight() {
    return this.yt.$t();
  }
  setHeight(t) {
    const i = this.hv.Qt(), n = i._f(this.yt);
    i.Ld(n, t);
  }
  getStretchFactor() {
    return this.yt.F_();
  }
  setStretchFactor(t) {
    this.yt.W_(t), this.hv.Qt().ka();
  }
  paneIndex() {
    return this.hv.Qt()._f(this.yt);
  }
  moveTo(t) {
    const i = this.paneIndex();
    i !== t && (o(t >= 0 && t < this.hv.lv().length, "Invalid pane index"), this.hv.Qt().Od(i, t));
  }
  getSeries() {
    return this.yt.Y_().map(((t) => this.jg(t))) ?? [];
  }
  getHTMLElement() {
    const t = this.hv.lv();
    return t && 0 !== t.length && t[this.paneIndex()] ? t[this.paneIndex()].fv() : null;
  }
  attachPrimitive(t) {
    this.yt.ol(t), t.attached && t.attached({ chart: this.qg, requestUpdate: () => this.yt.Qt().ka() });
  }
  detachPrimitive(t) {
    this.yt._l(t);
  }
  priceScale(t) {
    if (null === this.yt.O_(t)) throw new Error(`Cannot find price scale with id: ${t}`);
    return new Js(this.hv, t, this.paneIndex());
  }
  setPreserveEmptyPane(t) {
    this.yt.j_(t);
  }
  preserveEmptyPane() {
    return this.yt.q_();
  }
  addCustomSeries(t, i = {}, n = 0) {
    return this.qg.addCustomSeries(t, i, n);
  }
  addSeries(t, i = {}) {
    return this.qg.addSeries(t, i, this.paneIndex());
  }
};
var te = { color: "#FF0000", price: 0, lineStyle: 2, lineWidth: 1, lineVisible: true, axisLabelVisible: true, title: "", axisLabelColor: "", axisLabelTextColor: "" };
var ie = class {
  constructor(t) {
    this._r = t;
  }
  applyOptions(t) {
    this._r.vr(t);
  }
  options() {
    return this._r.N();
  }
  Yg() {
    return this._r;
  }
};
var ne = class {
  constructor(t, i, n, s, e2, r2) {
    this.Kg = new d(), this.ae = t, this.Gg = i, this.Zg = n, this.Pu = e2, this.qg = s, this.Xg = r2;
  }
  m() {
    this.Kg.m();
  }
  priceFormatter() {
    return this.ae.sl();
  }
  priceToCoordinate(t) {
    const i = this.ae.Lt();
    return null === i ? null : this.ae.Ft().Nt(t, i.Wt);
  }
  coordinateToPrice(t) {
    const i = this.ae.Lt();
    return null === i ? null : this.ae.Ft().Tn(t, i.Wt);
  }
  barsInLogicalRange(t) {
    if (null === t) return null;
    const i = new Oi(new Ai(t.from, t.to)).Uu(), n = this.ae.Un();
    if (n.Zi()) return null;
    const s = n.Hn(i.Na(), 1), e2 = n.Hn(i.bi(), -1), r2 = u(n.Rh()), h2 = u(n.Qn());
    if (null !== s && null !== e2 && s.$n > e2.$n) return { barsBefore: t.from - r2, barsAfter: h2 - t.to };
    const a2 = { barsBefore: null === s || s.$n === r2 ? t.from - r2 : s.$n - r2, barsAfter: null === e2 || e2.$n === h2 ? h2 - t.to : h2 - e2.$n };
    return null !== s && null !== e2 && (a2.from = s.Qr, a2.to = e2.Qr), a2;
  }
  setData(t) {
    this.Pu, this.ae.bh(), this.Gg.Jg(this.ae, t), this.Qg("full");
  }
  update(t, i = false) {
    this.ae.bh(), this.Gg.tb(this.ae, t, i), this.Qg("update");
  }
  pop(t = 1) {
    const i = this.Gg.ib(this.ae, t);
    0 !== i.length && this.Qg("update");
    const n = $s(this.seriesType());
    return i.map(((t2) => n(t2)));
  }
  dataByIndex(t, i) {
    const n = this.ae.Un().Hn(t, i);
    if (null === n) return null;
    return $s(this.seriesType())(n);
  }
  data() {
    const t = $s(this.seriesType());
    return this.ae.Un().Bh().map(((i) => t(i)));
  }
  subscribeDataChanged(t) {
    this.Kg.i(t);
  }
  unsubscribeDataChanged(t) {
    this.Kg._(t);
  }
  applyOptions(t) {
    this.ae.vr(t);
  }
  options() {
    return M(this.ae.N());
  }
  priceScale() {
    return this.Zg.priceScale(this.ae.Ft().pl(), this.getPane().paneIndex());
  }
  createPriceLine(t) {
    const i = f(M(te), t), n = this.ae.Ea(i);
    return new ie(n);
  }
  removePriceLine(t) {
    this.ae.Aa(t.Yg());
  }
  priceLines() {
    return this.ae.La().map(((t) => new ie(t)));
  }
  seriesType() {
    return this.ae.bh();
  }
  lastValueData(t) {
    const i = this.ae.Ae(t);
    return i.Le ? { noData: true } : { noData: false, price: i.Mt, color: i.R };
  }
  attachPrimitive(t) {
    this.ae.ol(t), t.attached && t.attached({ chart: this.qg, series: this, requestUpdate: () => this.ae.Qt().ka(), horzScaleBehavior: this.Pu });
  }
  detachPrimitive(t) {
    this.ae._l(t), t.detached && t.detached(), this.ae.Qt().ka();
  }
  getPane() {
    const t = this.ae, i = u(this.ae.Qt().Ks(t));
    return this.Xg(i);
  }
  moveToPane(t) {
    this.ae.Qt().rf(this.ae, t);
  }
  seriesOrder() {
    const t = this.ae.Qt().Ks(this.ae);
    return null === t ? -1 : t.Y_().indexOf(this.ae);
  }
  setSeriesOrder(t) {
    const i = this.ae.Qt().Ks(this.ae);
    null !== i && i.vu(this.ae, t);
  }
  Qg(t) {
    this.Kg.v() && this.Kg.p(t);
  }
};
var se = class {
  constructor(t, i, n) {
    this.nb = new d(), this.Qu = new d(), this.Nw = new d(), this.sn = t, this.ia = t.Et(), this.vM = i, this.ia.Zc().i(this.sb.bind(this)), this.ia.Xc().i(this.eb.bind(this)), this.vM.qw().i(this.rb.bind(this)), this.Pu = n;
  }
  m() {
    this.ia.Zc().u(this), this.ia.Xc().u(this), this.vM.qw().u(this), this.nb.m(), this.Qu.m(), this.Nw.m();
  }
  scrollPosition() {
    return this.ia.Oc();
  }
  scrollToPosition(t, i) {
    i ? this.ia.Yc(t, 1e3) : this.sn.gs(t);
  }
  scrollToRealTime() {
    this.ia.qc();
  }
  getVisibleRange() {
    const t = this.ia.xc();
    return null === t ? null : { from: t.from.originalTime, to: t.to.originalTime };
  }
  setVisibleRange(t) {
    const i = { from: this.Pu.convertHorzItemToInternal(t.from), to: this.Pu.convertHorzItemToInternal(t.to) }, n = this.ia.kc(i);
    this.sn.sf(n);
  }
  getVisibleLogicalRange() {
    const t = this.ia.Sc();
    return null === t ? null : { from: t.Na(), to: t.bi() };
  }
  setVisibleLogicalRange(t) {
    o(t.from <= t.to, "The from index cannot be after the to index."), this.sn.sf(t);
  }
  resetTimeScale() {
    this.sn.ws();
  }
  fitContent() {
    this.sn.td();
  }
  logicalToCoordinate(t) {
    const i = this.sn.Et();
    return i.Zi() ? null : i.jt(t);
  }
  coordinateToLogical(t) {
    return this.ia.Zi() ? null : this.ia.Vc(t);
  }
  timeToIndex(t, i) {
    const n = this.Pu.convertHorzItemToInternal(t);
    return this.ia.Mc(n, i);
  }
  timeToCoordinate(t) {
    const i = this.timeToIndex(t, false);
    return null === i ? null : this.ia.jt(i);
  }
  coordinateToTime(t) {
    const i = this.sn.Et(), n = i.Vc(t), s = i.en(n);
    return null === s ? null : s.originalTime;
  }
  width() {
    return this.vM.pv().width;
  }
  height() {
    return this.vM.pv().height;
  }
  subscribeVisibleTimeRangeChange(t) {
    this.nb.i(t);
  }
  unsubscribeVisibleTimeRangeChange(t) {
    this.nb._(t);
  }
  subscribeVisibleLogicalRangeChange(t) {
    this.Qu.i(t);
  }
  unsubscribeVisibleLogicalRangeChange(t) {
    this.Qu._(t);
  }
  subscribeSizeChange(t) {
    this.Nw.i(t);
  }
  unsubscribeSizeChange(t) {
    this.Nw._(t);
  }
  applyOptions(t) {
    this.ia.vr(t);
  }
  options() {
    return { ...M(this.ia.N()), barSpacing: this.ia.ml() };
  }
  sb() {
    this.nb.v() && this.nb.p(this.getVisibleRange());
  }
  eb() {
    this.Qu.v() && this.Qu.p(this.getVisibleLogicalRange());
  }
  rb(t) {
    this.Nw.p(t.width, t.height);
  }
};
function ee(t) {
  return (function(t2) {
    if (w(t2.handleScale)) {
      const i2 = t2.handleScale;
      t2.handleScale = { axisDoubleClickReset: { time: i2, price: i2 }, axisPressedMouseMove: { time: i2, price: i2 }, mouseWheel: i2, pinch: i2 };
    } else if (void 0 !== t2.handleScale) {
      const { axisPressedMouseMove: i2, axisDoubleClickReset: n } = t2.handleScale;
      w(i2) && (t2.handleScale.axisPressedMouseMove = { time: i2, price: i2 }), w(n) && (t2.handleScale.axisDoubleClickReset = { time: n, price: n });
    }
    const i = t2.handleScroll;
    w(i) && (t2.handleScroll = { horzTouchDrag: i, vertTouchDrag: i, mouseWheel: i, pressedMouseMove: i });
  })(t), t;
}
var re = class {
  constructor(t, i, n) {
    this.hb = /* @__PURE__ */ new Map(), this.ab = /* @__PURE__ */ new Map(), this.lb = new d(), this.ob = new d(), this._b = new d(), this.dd = /* @__PURE__ */ new WeakMap(), this.ub = new fs(i);
    const s = void 0 === n ? M(Xs()) : f(M(Xs()), ee(n));
    this.cb = i, this.hv = new Xn(t, s, i), this.hv.mw().i(((t2) => {
      this.lb.v() && this.lb.p(this.fb(t2()));
    }), this), this.hv.ww().i(((t2) => {
      this.ob.v() && this.ob.p(this.fb(t2()));
    }), this), this.hv.Bd().i(((t2) => {
      this._b.v() && this._b.p(this.fb(t2()));
    }), this);
    const e2 = this.hv.Qt();
    this.pb = new se(e2, this.hv.bM(), this.cb);
  }
  remove() {
    this.hv.mw().u(this), this.hv.ww().u(this), this.hv.Bd().u(this), this.pb.m(), this.hv.m(), this.hb.clear(), this.ab.clear(), this.lb.m(), this.ob.m(), this._b.m(), this.ub.m();
  }
  resize(t, i, n) {
    this.autoSizeActive() || this.hv.wM(t, i, n);
  }
  addCustomSeries(t, i = {}, n = 0) {
    const s = ((t2) => ({ type: "Custom", isBuiltIn: false, defaultOptions: { ...As, ...t2.defaultOptions() }, mb: Ls, wb: t2 }))(c(t));
    return this.Mb(s, i, n);
  }
  addSeries(t, i = {}, n = 0) {
    return this.Mb(t, i, n);
  }
  removeSeries(t) {
    const i = _(this.hb.get(t)), n = this.ub.if(i);
    this.hv.Qt().if(i), this.gb(n), this.hb.delete(t), this.ab.delete(i);
  }
  Jg(t, i) {
    this.gb(this.ub.og(t, i));
  }
  tb(t, i, n) {
    this.gb(this.ub.pg(t, i, n));
  }
  ib(t, i) {
    const [n, s] = this.ub.wg(t, i);
    return 0 !== n.length && this.gb(s), n;
  }
  subscribeClick(t) {
    this.lb.i(t);
  }
  unsubscribeClick(t) {
    this.lb._(t);
  }
  subscribeCrosshairMove(t) {
    this._b.i(t);
  }
  unsubscribeCrosshairMove(t) {
    this._b._(t);
  }
  subscribeDblClick(t) {
    this.ob.i(t);
  }
  unsubscribeDblClick(t) {
    this.ob._(t);
  }
  priceScale(t, i = 0) {
    return new Js(this.hv, t, i);
  }
  timeScale() {
    return this.pb;
  }
  applyOptions(t) {
    this.hv.vr(ee(t));
  }
  options() {
    return this.hv.N();
  }
  takeScreenshot(t = false, i = false) {
    let n, s;
    try {
      i || (n = this.hv.Qt().N().crosshair.mode, this.hv.vr({ crosshair: { mode: 2 } })), s = this.hv.TM(t);
    } finally {
      i || void 0 === n || this.hv.Qt().vr({ crosshair: { mode: n } });
    }
    return s;
  }
  addPane(t = false) {
    const i = this.hv.Qt().uf();
    return i.j_(t), this.bb(i);
  }
  removePane(t) {
    this.hv.Qt().Ad(t);
  }
  swapPanes(t, i) {
    this.hv.Qt().zd(t, i);
  }
  autoSizeActive() {
    return this.hv.CM();
  }
  chartElement() {
    return this.hv.Mv();
  }
  panes() {
    return this.hv.Qt().Gn().map(((t) => this.bb(t)));
  }
  paneSize(t = 0) {
    const i = this.hv.AM(t);
    return { height: i.height, width: i.width };
  }
  setCrosshairPosition(t, i, n) {
    const s = this.hb.get(n);
    if (void 0 === s) return;
    const e2 = this.hv.Qt().Ks(s);
    null !== e2 && this.hv.Qt().Gd(t, i, e2);
  }
  clearCrosshairPosition() {
    this.hv.Qt().Zd(true);
  }
  horzBehaviour() {
    return this.cb;
  }
  Mb(t, i = {}, n = 0) {
    o(void 0 !== t.mb), (function(t2) {
      if (void 0 === t2 || "custom" === t2.type) return;
      const i2 = t2;
      void 0 !== i2.minMove && void 0 === i2.precision && (i2.precision = Yi(i2.minMove));
    })(i.priceFormat), "Candlestick" === t.type && (function(t2) {
      void 0 !== t2.borderColor && (t2.borderUpColor = t2.borderColor, t2.borderDownColor = t2.borderColor), void 0 !== t2.wickColor && (t2.wickUpColor = t2.wickColor, t2.wickDownColor = t2.wickColor);
    })(i);
    const s = f(M(e), M(t.defaultOptions), i), r2 = t.mb, h2 = new Jt(this.hv.Qt(), t.type, s, r2, t.wb);
    this.hv.Qt().Qd(h2, n);
    const a2 = new ne(h2, this, this, this, this.cb, ((t2) => this.bb(t2)));
    return this.hb.set(a2, h2), this.ab.set(h2, a2), a2;
  }
  gb(t) {
    const i = this.hv.Qt();
    for (const i2 of t.Y_.keys()) i2.Ia();
    i.Xd(t.Et.Dc, t.Et.Sg, t.Et.xg), t.Y_.forEach(((t2, i2) => i2.ht(t2.ue, t2.bg))), i.Et().dc(), i.Lc();
  }
  Sb(t) {
    return _(this.ab.get(t));
  }
  xb(t) {
    return void 0 !== t && this.ab.has(t) ? this.Sb(t) : void 0;
  }
  fb(t) {
    const i = /* @__PURE__ */ new Map();
    t.QM.forEach(((t2, n2) => {
      const s2 = n2.bh(), e2 = $s(s2)(t2);
      if ("Custom" !== s2) o(ts(e2));
      else {
        const t3 = n2.cl();
        o(!t3 || false === t3(e2));
      }
      i.set(this.Sb(n2), e2);
    }));
    const n = this.xb(t.jM), s = void 0 === t.YM ? void 0 : { type: t.YM.ds, sourceKind: t.YM.KM, objectKind: t.YM.GM, series: this.xb(t.YM.Y_), objectId: t.YM.ZM, paneIndex: t.YM.XM };
    return { time: t.Qr, logical: t.$n, point: t.JM, paneIndex: t.XM, hoveredInfo: s, hoveredSeries: n, hoveredObjectId: t.qM, seriesData: i, sourceEvent: t.tg };
  }
  bb(t) {
    let i = this.dd.get(t);
    return i || (i = new Qs(this.hv, ((t2) => this.Sb(t2)), t, this), this.dd.set(t, i)), i;
  }
};
function he(t) {
  if (m(t)) {
    const i = document.getElementById(t);
    return o(null !== i, `Cannot find element in DOM with id=${t}`), i;
  }
  return t;
}
function ae(t, i, n) {
  const s = he(t), e2 = new re(s, i, n);
  return i.setOptions(e2.options()), e2;
}
function le(t, i) {
  return ae(t, new cn(), cn.Tf(i));
}
var Se = class extends Ds {
  constructor(t, i) {
    super(t, i, true);
  }
  Og(t, i, n) {
    i.Ic(this.kg, b(this.Tg)), t.Jo(this.kg, n, b(this.Tg));
  }
  Tb(t, i) {
    return { wt: t, Mt: i, _t: NaN, ut: NaN };
  }
  Lg() {
    const t = this.ae.Sa();
    this.kg = this.ae.Ua().Bh().map(((i) => {
      let n;
      if ((i.Gr ?? 1) > 1) {
        const t2 = i.Wt[1], s = i.Wt[2], e2 = i.Wt[3];
        n = Math.abs(t2 - e2) > Math.abs(s - e2) ? t2 : s;
      } else n = i.Wt[3];
      return this.Rb(i.$n, n, t);
    }));
  }
};
var Ke = class extends Ds {
  constructor(t, i) {
    super(t, i, false);
  }
  Bg(t, i) {
    return Ps(this.kg, this.Tg, t, i, this.le.Et().ml(), this.ae.N().hitTestTolerance, ((t2, i2) => {
      i2[0] = t2.n_, i2[1] = t2.s_;
    }));
  }
  Og(t, i, n) {
    i.Ic(this.kg, b(this.Tg)), t.t_(this.kg, n, b(this.Tg));
  }
  fS(t, i, n) {
    return { wt: t, jr: i.Wt[0], qr: i.Wt[1], Yr: i.Wt[2], Kr: i.Wt[3], _t: NaN, i_: NaN, n_: NaN, s_: NaN, e_: NaN };
  }
  Lg() {
    const t = this.ae.Sa();
    this.kg = this.ae.Ua().Bh().map(((i) => this.Rb(i.$n, i, t)));
  }
};
var Xe = class extends R {
  constructor() {
    super(...arguments), this.qt = null, this.oS = 0;
  }
  ht(t) {
    this.qt = t;
  }
  et(t) {
    if (null === this.qt || 0 === this.qt.Un.length || null === this.qt.lt) return;
    const { horizontalPixelRatio: i } = t;
    if (this.oS = (function(t2, i2) {
      if (t2 >= 2.5 && t2 <= 4) return Math.floor(3 * i2);
      const n2 = 1 - 0.2 * Math.atan(Math.max(4, t2) - 4) / (0.5 * Math.PI), s2 = Math.floor(t2 * n2 * i2), e2 = Math.floor(t2 * i2), r2 = Math.min(s2, e2);
      return Math.max(Math.floor(i2), r2);
    })(this.qt.ml, i), this.oS >= 2) {
      Math.floor(i) % 2 != this.oS % 2 && this.oS--;
    }
    const n = this.qt.Un;
    this.qt.pS && this.vS(t, n, this.qt.lt), this.qt.gi && this.Vm(t, n, this.qt.lt);
    const s = this.mS(i);
    (!this.qt.gi || this.oS > 2 * s) && this.wS(t, n, this.qt.lt);
  }
  vS(t, i, n) {
    if (null === this.qt) return;
    const { context: s, horizontalPixelRatio: e2, verticalPixelRatio: r2 } = t;
    let h2 = "", a2 = Math.min(Math.floor(e2), Math.floor(this.qt.ml * e2));
    a2 = Math.max(Math.floor(e2), Math.min(a2, this.oS));
    const l2 = Math.floor(0.5 * a2);
    let o2 = null;
    for (let t2 = n.from; t2 < n.to; t2++) {
      const n2 = i[t2];
      n2.rh !== h2 && (s.fillStyle = n2.rh, h2 = n2.rh);
      const _2 = Math.round(Math.min(n2.i_, n2.e_) * r2), u2 = Math.round(Math.max(n2.i_, n2.e_) * r2), c2 = Math.round(n2.n_ * r2), d2 = Math.round(n2.s_ * r2);
      let f2 = Math.round(e2 * n2._t) - l2;
      const p2 = f2 + a2 - 1;
      null !== o2 && (f2 = Math.max(o2 + 1, f2), f2 = Math.min(f2, p2));
      const v2 = p2 - f2 + 1;
      s.fillRect(f2, c2, v2, _2 - c2), s.fillRect(f2, u2 + 1, v2, d2 - u2), o2 = p2;
    }
  }
  mS(t) {
    let i = Math.floor(1 * t);
    this.oS <= 2 * i && (i = Math.floor(0.5 * (this.oS - 1)));
    const n = Math.max(Math.floor(t), i);
    return this.oS <= 2 * n ? Math.max(Math.floor(t), Math.floor(1 * t)) : n;
  }
  Vm(t, i, n) {
    if (null === this.qt) return;
    const { context: s, horizontalPixelRatio: e2, verticalPixelRatio: r2 } = t;
    let h2 = "";
    const a2 = this.mS(e2);
    let l2 = null;
    for (let t2 = n.from; t2 < n.to; t2++) {
      const n2 = i[t2];
      n2.eh !== h2 && (s.fillStyle = n2.eh, h2 = n2.eh);
      let o2 = Math.round(n2._t * e2) - Math.floor(0.5 * this.oS);
      const _2 = o2 + this.oS - 1, u2 = Math.round(Math.min(n2.i_, n2.e_) * r2), c2 = Math.round(Math.max(n2.i_, n2.e_) * r2);
      if (null !== l2 && (o2 = Math.max(l2 + 1, o2), o2 = Math.min(o2, _2)), this.qt.ml * e2 > 2 * a2) L(s, o2, u2, _2 - o2 + 1, c2 - u2 + 1, a2);
      else {
        const t3 = _2 - o2 + 1;
        s.fillRect(o2, u2, t3, c2 - u2 + 1);
      }
      l2 = _2;
    }
  }
  wS(t, i, n) {
    if (null === this.qt) return;
    const { context: s, horizontalPixelRatio: e2, verticalPixelRatio: r2 } = t;
    let h2 = "";
    const a2 = this.mS(e2);
    for (let t2 = n.from; t2 < n.to; t2++) {
      const n2 = i[t2];
      let l2 = Math.round(Math.min(n2.i_, n2.e_) * r2), o2 = Math.round(Math.max(n2.i_, n2.e_) * r2), _2 = Math.round(n2._t * e2) - Math.floor(0.5 * this.oS), u2 = _2 + this.oS - 1;
      if (n2.sh !== h2) {
        const t3 = n2.sh;
        s.fillStyle = t3, h2 = t3;
      }
      this.qt.gi && (_2 += a2, l2 += a2, u2 -= a2, o2 -= a2), l2 > o2 || s.fillRect(_2, l2, u2 - _2 + 1, o2 - l2 + 1);
    }
  }
};
var Je = class extends Ke {
  constructor() {
    super(...arguments), this.Vg = new Xe();
  }
  Rb(t, i, n) {
    return { ...this.fS(t, i, n), ...n.Sh(t) };
  }
  Ng() {
    const t = this.ae.N();
    this.Vg.ht({ Un: this.kg, ml: this.le.Et().ml(), pS: t.wickVisible, gi: t.borderVisible, lt: this.Tg });
  }
};
var Qe = { type: "Candlestick", isBuiltIn: true, defaultOptions: { upColor: "#26a69a", downColor: "#ef5350", wickVisible: true, borderVisible: true, borderColor: "#378658", borderUpColor: "#26a69a", borderDownColor: "#ef5350", wickColor: "#737375", wickUpColor: "#26a69a", wickDownColor: "#ef5350" }, mb: (t, i) => new Je(t, i) };
var tr = class extends R {
  constructor() {
    super(...arguments), this.qt = null, this.MS = [];
  }
  ht(t) {
    this.qt = t, this.MS = [];
  }
  et({ context: t, horizontalPixelRatio: i, verticalPixelRatio: n }) {
    if (null === this.qt || 0 === this.qt.ot.length || null === this.qt.lt) return;
    this.MS.length || this.gS(i);
    const s = Math.max(1, Math.floor(n)), e2 = Math.round(this.qt.bS * n) - Math.floor(s / 2), r2 = e2 + s;
    for (let i2 = this.qt.lt.from; i2 < this.qt.lt.to; i2++) {
      const h2 = this.qt.ot[i2], a2 = this.MS[i2 - this.qt.lt.from], l2 = Math.round(h2.ut * n);
      let o2, _2;
      t.fillStyle = h2.sh, l2 <= e2 ? (o2 = l2, _2 = r2) : (o2 = e2, _2 = l2 - Math.floor(s / 2) + s), t.fillRect(a2.Na, o2, a2.bi - a2.Na + 1, _2 - o2);
    }
  }
  gS(t) {
    if (null === this.qt || 0 === this.qt.ot.length || null === this.qt.lt) return void (this.MS = []);
    const i = Math.ceil(this.qt.ml * t) <= 1 ? 0 : Math.max(1, Math.floor(t)), n = Math.round(this.qt.ml * t) - i;
    this.MS = new Array(this.qt.lt.to - this.qt.lt.from);
    for (let i2 = this.qt.lt.from; i2 < this.qt.lt.to; i2++) {
      const s2 = this.qt.ot[i2], e2 = Math.round(s2._t * t);
      let r2, h2;
      if (n % 2) {
        const t2 = (n - 1) / 2;
        r2 = e2 - t2, h2 = e2 + t2;
      } else {
        const t2 = n / 2;
        r2 = e2 - t2, h2 = e2 + t2 - 1;
      }
      this.MS[i2 - this.qt.lt.from] = { Na: r2, bi: h2, SS: e2, ce: s2._t * t, wt: s2.wt };
    }
    for (let t2 = this.qt.lt.from + 1; t2 < this.qt.lt.to; t2++) {
      const n2 = this.MS[t2 - this.qt.lt.from], s2 = this.MS[t2 - this.qt.lt.from - 1];
      n2.wt === s2.wt + 1 && (n2.Na - s2.bi !== i + 1 && (s2.SS > s2.ce ? s2.bi = n2.Na - i - 1 : n2.Na = s2.bi + i + 1));
    }
    let s = Math.ceil(this.qt.ml * t);
    for (let t2 = this.qt.lt.from; t2 < this.qt.lt.to; t2++) {
      const i2 = this.MS[t2 - this.qt.lt.from];
      i2.bi < i2.Na && (i2.bi = i2.Na);
      const n2 = i2.bi - i2.Na + 1;
      s = Math.min(n2, s);
    }
    if (i > 0 && s < 4) for (let t2 = this.qt.lt.from; t2 < this.qt.lt.to; t2++) {
      const i2 = this.MS[t2 - this.qt.lt.from];
      i2.bi - i2.Na + 1 > s && (i2.SS > i2.ce ? i2.bi -= 1 : i2.Na += 1);
    }
  }
};
var ir = class extends Se {
  constructor() {
    super(...arguments), this.Vg = new tr();
  }
  Bg(t, i) {
    const n = this.ae.Ft().Nt(this.ae.N().base, u(this.ae.Lt()).Wt);
    return null === n ? null : Ps(this.kg, this.Tg, t, i, this.le.Et().ml(), this.ae.N().hitTestTolerance, ((t2, i2) => {
      i2[0] = t2.ut, i2[1] = n;
    }));
  }
  Rb(t, i, n) {
    return { ...this.Tb(t, i), ...n.Sh(t) };
  }
  Ng() {
    const t = { ot: this.kg, ml: this.le.Et().ml(), lt: this.Tg, bS: this.ae.Ft().Nt(this.ae.N().base, u(this.ae.Lt()).Wt) };
    this.Vg.ht(t);
  }
};
var nr = { type: "Histogram", isBuiltIn: true, defaultOptions: { color: "#26a69a", base: 0 }, mb: (t, i) => new ir(t, i) };
var Gr = { ...e, color: "#2196f3" };

// packages/chart/src/anchored-vwap/anchored-vwap-primitive.ts
var DEFAULT_VWAP_COLOR = "#2962ff";
var DEFAULT_BAND_COLORS = [
  "rgba(41, 98, 255, 0.55)",
  "rgba(41, 98, 255, 0.35)",
  "rgba(41, 98, 255, 0.20)"
];
var DEFAULT_FILL_COLOR = "rgba(41, 98, 255, 0.08)";
var DEFAULT_ANCHOR_COLOR = "rgba(242, 193, 78, 0.7)";
var AnchoredVwapPaneRenderer = class {
  constructor(getCoords, getAnchorX, getPresentation) {
    this.getCoords = getCoords;
    this.getAnchorX = getAnchorX;
    this.getPresentation = getPresentation;
  }
  getCoords;
  getAnchorX;
  getPresentation;
  draw(target) {
    const coords = this.getCoords();
    if (coords.length === 0) {
      return;
    }
    const anchorX = this.getAnchorX();
    const presentation2 = this.getPresentation();
    const vwapColor = presentation2.vwapColor ?? DEFAULT_VWAP_COLOR;
    const vwapLineWidth = presentation2.vwapLineWidth ?? 2;
    const showBands2 = presentation2.showBands ?? true;
    const bandColors = presentation2.bandColors ?? DEFAULT_BAND_COLORS;
    const bandLineWidth = presentation2.bandLineWidth ?? 1;
    const showFill2 = presentation2.showFill ?? false;
    const bandFillColor = presentation2.bandFillColor ?? DEFAULT_FILL_COLOR;
    const showAnchorLine2 = presentation2.showAnchorLine ?? true;
    const anchorLineColor = presentation2.anchorLineColor ?? DEFAULT_ANCHOR_COLOR;
    target.useBitmapCoordinateSpace(
      ({ context, horizontalPixelRatio, verticalPixelRatio, bitmapSize }) => {
        context.save();
        if (showAnchorLine2 && anchorX !== null) {
          const x2 = Math.round(anchorX * horizontalPixelRatio);
          if (x2 >= 0 && x2 <= bitmapSize.width) {
            context.strokeStyle = anchorLineColor;
            context.lineWidth = Math.max(1, horizontalPixelRatio);
            context.setLineDash([
              4 * horizontalPixelRatio,
              3 * horizontalPixelRatio
            ]);
            context.beginPath();
            context.moveTo(x2, 0);
            context.lineTo(x2, bitmapSize.height);
            context.stroke();
          }
        }
        if (showBands2 && showFill2 && coords.length > 1) {
          const hasBand1 = coords.every((p2) => p2.bandCoords.length > 0);
          if (hasBand1) {
            context.fillStyle = bandFillColor;
            context.beginPath();
            const first = coords[0];
            const firstBand = first.bandCoords[0];
            context.moveTo(
              Math.round(first.x * horizontalPixelRatio),
              Math.round(firstBand.yUpper * verticalPixelRatio)
            );
            for (let i = 1; i < coords.length; i++) {
              const pt2 = coords[i];
              const band = pt2.bandCoords[0];
              context.lineTo(
                Math.round(pt2.x * horizontalPixelRatio),
                Math.round(band.yUpper * verticalPixelRatio)
              );
            }
            for (let i = coords.length - 1; i >= 0; i--) {
              const pt2 = coords[i];
              const band = pt2.bandCoords[0];
              context.lineTo(
                Math.round(pt2.x * horizontalPixelRatio),
                Math.round(band.yLower * verticalPixelRatio)
              );
            }
            context.closePath();
            context.fill();
          }
        }
        if (showBands2 && coords.length > 1) {
          const numBands = coords[0]?.bandCoords.length ?? 0;
          for (let b2 = 0; b2 < numBands; b2++) {
            const color = bandColors[b2 % bandColors.length] ?? DEFAULT_BAND_COLORS[0];
            context.strokeStyle = color;
            context.lineWidth = Math.max(1, bandLineWidth * horizontalPixelRatio);
            context.setLineDash([
              3 * horizontalPixelRatio,
              3 * horizontalPixelRatio
            ]);
            context.beginPath();
            let upperStarted = false;
            for (let i = 0; i < coords.length; i++) {
              const pt2 = coords[i];
              const band = pt2.bandCoords[b2];
              if (!band) continue;
              const x2 = Math.round(pt2.x * horizontalPixelRatio);
              const y2 = Math.round(band.yUpper * verticalPixelRatio);
              if (!upperStarted) {
                context.moveTo(x2, y2);
                upperStarted = true;
              } else {
                context.lineTo(x2, y2);
              }
            }
            if (upperStarted) {
              context.stroke();
            }
            context.beginPath();
            let lowerStarted = false;
            for (let i = 0; i < coords.length; i++) {
              const pt2 = coords[i];
              const band = pt2.bandCoords[b2];
              if (!band) continue;
              const x2 = Math.round(pt2.x * horizontalPixelRatio);
              const y2 = Math.round(band.yLower * verticalPixelRatio);
              if (!lowerStarted) {
                context.moveTo(x2, y2);
                lowerStarted = true;
              } else {
                context.lineTo(x2, y2);
              }
            }
            if (lowerStarted) {
              context.stroke();
            }
          }
        }
        if (coords.length > 0) {
          context.strokeStyle = vwapColor;
          context.lineWidth = Math.max(1, vwapLineWidth * horizontalPixelRatio);
          if (presentation2.vwapLineStyle === 1) {
            context.setLineDash([
              2 * horizontalPixelRatio,
              2 * horizontalPixelRatio
            ]);
          } else if (presentation2.vwapLineStyle === 2) {
            context.setLineDash([
              5 * horizontalPixelRatio,
              4 * horizontalPixelRatio
            ]);
          } else {
            context.setLineDash([]);
          }
          context.beginPath();
          const first = coords[0];
          context.moveTo(
            Math.round(first.x * horizontalPixelRatio),
            Math.round(first.yVwap * verticalPixelRatio)
          );
          for (let i = 1; i < coords.length; i++) {
            const pt2 = coords[i];
            context.lineTo(
              Math.round(pt2.x * horizontalPixelRatio),
              Math.round(pt2.yVwap * verticalPixelRatio)
            );
          }
          context.stroke();
          const anchorPoint = coords[0];
          const ax = Math.round(anchorPoint.x * horizontalPixelRatio);
          const ay = Math.round(anchorPoint.yVwap * verticalPixelRatio);
          const radius = Math.max(3, 3 * horizontalPixelRatio);
          context.fillStyle = vwapColor;
          context.beginPath();
          context.arc(ax, ay, radius, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = "#ffffff";
          context.lineWidth = Math.max(1, horizontalPixelRatio);
          context.beginPath();
          context.arc(ax, ay, radius, 0, Math.PI * 2);
          context.stroke();
        }
        context.restore();
      }
    );
  }
};
var AnchoredVwapPaneView = class {
  paneRenderer;
  constructor(getCoords, getAnchorX, getPresentation) {
    this.paneRenderer = new AnchoredVwapPaneRenderer(
      getCoords,
      getAnchorX,
      getPresentation
    );
  }
  zOrder() {
    return "normal";
  }
  renderer() {
    return this.paneRenderer;
  }
};
var AnchoredVwapPriceAxisView = class {
  constructor(coordinateValue, label, color, isVisible) {
    this.coordinateValue = coordinateValue;
    this.label = label;
    this.color = color;
    this.isVisible = isVisible;
  }
  coordinateValue;
  label;
  color;
  isVisible;
  coordinate() {
    return this.coordinateValue() ?? -1e3;
  }
  text() {
    return this.label();
  }
  textColor() {
    return "#ffffff";
  }
  backColor() {
    return this.color();
  }
  visible() {
    return this.isVisible() && this.coordinateValue() !== null;
  }
};
var AnchoredVwapPrimitive = class {
  id;
  attachedParams = null;
  result = null;
  presentation = {};
  computedCoords = [];
  anchorX = null;
  latestY = null;
  paneViewsValue;
  priceAxisViewsValue;
  constructor(renderInput) {
    this.id = renderInput.vwapId;
    this.result = renderInput.result;
    this.presentation = renderInput.presentation ?? {};
    const getCoords = () => this.computedCoords;
    const getAnchorX = () => this.anchorX;
    const getPresentation = () => this.presentation;
    this.paneViewsValue = [
      new AnchoredVwapPaneView(getCoords, getAnchorX, getPresentation)
    ];
    this.priceAxisViewsValue = [
      new AnchoredVwapPriceAxisView(
        () => this.latestY,
        () => {
          const v2 = this.result?.latestPoint?.vwap;
          const prec = this.presentation.labelPrecision ?? 2;
          return v2 !== void 0 && Number.isFinite(v2) ? `AVWAP ${v2.toFixed(prec)}` : "AVWAP";
        },
        () => this.presentation.vwapColor ?? DEFAULT_VWAP_COLOR,
        () => (this.presentation.showLabels ?? true) && this.result?.latestPoint !== null
      )
    ];
  }
  attached(param) {
    this.attachedParams = param;
    this.updateAllViews();
  }
  detached() {
    this.attachedParams = null;
    this.computedCoords = [];
    this.anchorX = null;
    this.latestY = null;
  }
  update(renderInput) {
    this.result = renderInput.result;
    this.presentation = renderInput.presentation ?? {};
    this.updateAllViews();
    this.attachedParams?.requestUpdate();
  }
  updateAllViews() {
    if (!this.attachedParams || !this.result || this.result.points.length === 0) {
      this.computedCoords = [];
      this.anchorX = null;
      this.latestY = null;
      return;
    }
    const series = this.attachedParams.series;
    const timeScale = this.attachedParams.chart.timeScale();
    const anchorChartTime = Math.floor(
      this.result.anchorTimestamp / 1e3
    );
    this.anchorX = timeScale.timeToCoordinate(anchorChartTime);
    const coords = [];
    for (const pt2 of this.result.points) {
      const chartTime = Math.floor(pt2.timestamp / 1e3);
      const x2 = timeScale.timeToCoordinate(chartTime);
      const yVwap = series.priceToCoordinate(pt2.vwap);
      if (x2 === null || yVwap === null) {
        continue;
      }
      const bandCoords = [];
      for (const band of pt2.bands) {
        const yUpper = series.priceToCoordinate(band.upper);
        const yLower = series.priceToCoordinate(band.lower);
        if (yUpper !== null && yLower !== null) {
          bandCoords.push({
            multiplier: band.multiplier,
            yUpper,
            yLower
          });
        }
      }
      coords.push({
        x: x2,
        yVwap,
        bandCoords,
        rawPoint: pt2
      });
    }
    this.computedCoords = coords;
    if (coords.length > 0) {
      const lastCoord = coords[coords.length - 1];
      this.latestY = lastCoord.yVwap;
      if (this.anchorX === null) {
        this.anchorX = coords[0].x;
      }
    } else {
      this.latestY = null;
    }
  }
  paneViews() {
    return this.paneViewsValue;
  }
  priceAxisViews() {
    return this.priceAxisViewsValue;
  }
  autoscaleInfo() {
    return null;
  }
};

// packages/chart/src/lightweight/vertical-line-primitive.ts
var VerticalLineRenderer = class {
  constructor(coordinate, color) {
    this.coordinate = coordinate;
    this.color = color;
  }
  coordinate;
  color;
  draw(target) {
    const coordinate = this.coordinate();
    if (coordinate === null) {
      return;
    }
    target.useBitmapCoordinateSpace(
      ({ context, horizontalPixelRatio, bitmapSize }) => {
        const x2 = Math.round(coordinate * horizontalPixelRatio);
        context.save();
        context.strokeStyle = this.color;
        context.lineWidth = Math.max(1, horizontalPixelRatio);
        context.setLineDash([
          5 * horizontalPixelRatio,
          4 * horizontalPixelRatio
        ]);
        context.beginPath();
        context.moveTo(x2, 0);
        context.lineTo(x2, bitmapSize.height);
        context.stroke();
        context.restore();
      }
    );
  }
};
var VerticalLinePaneView = class {
  paneRenderer;
  constructor(coordinate, color) {
    this.paneRenderer = new VerticalLineRenderer(coordinate, color);
  }
  zOrder() {
    return "normal";
  }
  renderer() {
    return this.paneRenderer;
  }
};
var VerticalLineTimeAxisView = class {
  constructor(coordinateValue, label, color) {
    this.coordinateValue = coordinateValue;
    this.label = label;
    this.color = color;
  }
  coordinateValue;
  label;
  color;
  coordinate() {
    return this.coordinateValue() ?? -1e3;
  }
  text() {
    return this.label;
  }
  textColor() {
    return "#f4f7fa";
  }
  backColor() {
    return this.color;
  }
  visible() {
    return this.coordinateValue() !== null;
  }
};
var VerticalLinePrimitive = class {
  id;
  attachedParameters = null;
  coordinate = null;
  timestamp;
  paneViewsValue;
  timeAxisViewsValue;
  constructor(options) {
    this.id = options.id;
    this.timestamp = Math.floor(options.timestamp / 1e3);
    const getCoordinate = () => this.coordinate;
    this.paneViewsValue = [
      new VerticalLinePaneView(getCoordinate, options.color)
    ];
    this.timeAxisViewsValue = [
      new VerticalLineTimeAxisView(getCoordinate, options.label, options.color)
    ];
  }
  attached(parameters) {
    this.attachedParameters = parameters;
    this.updateAllViews();
  }
  detached() {
    this.attachedParameters = null;
    this.coordinate = null;
  }
  updateAllViews() {
    this.coordinate = this.attachedParameters?.chart.timeScale().timeToCoordinate(this.timestamp) ?? null;
  }
  paneViews() {
    return this.paneViewsValue;
  }
  timeAxisViews() {
    return this.timeAxisViewsValue;
  }
};

// packages/chart/src/lightweight/lightweight-chart-adapter.ts
var LEVEL_COLORS = {
  "call-wall": "#29b57a",
  "put-wall": "#e05263",
  "gamma-flip": "#f0b44d",
  "max-pain": "#65a9ff",
  "secondary-gex": "#9aa7b6"
};
var USER_DRAWING_COLOR = "#f2c14e";
var toChartTimestamp = (timestamp) => Math.floor(timestamp / 1e3);
var toChartCandle = (candle) => ({
  time: toChartTimestamp(candle.openTime),
  open: candle.open,
  high: candle.high,
  low: candle.low,
  close: candle.close
});
var toChartVolume = (candle) => ({
  time: toChartTimestamp(candle.openTime),
  value: candle.volume,
  color: candle.close >= candle.open ? "rgba(37, 169, 119, 0.55)" : "rgba(220, 83, 98, 0.55)"
});
var formatVerticalLineLabel = (timestamp) => `${new Date(timestamp).toISOString().slice(5, 16).replace("T", " ")} UTC`;
var LightweightChartsAdapter = class {
  name = "lightweight-charts";
  version = "5.2.1";
  chart = null;
  container = null;
  series = null;
  volumeSeries = null;
  levelLines = /* @__PURE__ */ new Map();
  drawings = /* @__PURE__ */ new Map();
  horizontalDrawingLines = /* @__PURE__ */ new Map();
  verticalDrawingPrimitives = /* @__PURE__ */ new Map();
  anchoredVwapPrimitives = /* @__PURE__ */ new Map();
  viewportListeners = /* @__PURE__ */ new Set();
  drawingsChangeListeners = /* @__PURE__ */ new Set();
  drawingMode = "pointer";
  selectedDrawingId = null;
  drawingSequence = 0;
  initializedAt = 0;
  chartCreateCount = 0;
  historyReplacementCount = 0;
  realtimeUpdateCount = 0;
  resizeCount = 0;
  dataPointCount = 0;
  conflationEnabled = false;
  lastOperationDurationMs = 0;
  maxOperationDurationMs = 0;
  lastError = null;
  initialize(container2, options) {
    if (this.chart) {
      throw new Error("Chart adapter is already initialized");
    }
    this.initializedAt = Date.now();
    this.conflationEnabled = options.enableConflation ?? false;
    this.container = container2;
    this.chart = le(container2, {
      width: options.width,
      height: options.height,
      layout: {
        background: { type: $i.Solid, color: options.backgroundColor },
        textColor: options.textColor,
        fontFamily: "Arial, Helvetica, sans-serif",
        panes: {
          separatorColor: "#26323d",
          separatorHoverColor: "#40515e",
          enableResize: true
        }
      },
      grid: {
        vertLines: { color: "#202b35" },
        horzLines: { color: "#202b35" }
      },
      rightPriceScale: {
        borderColor: "#33414e",
        scaleMargins: { top: 0.08, bottom: 0.06 }
      },
      timeScale: {
        borderColor: "#33414e",
        timeVisible: true,
        secondsVisible: false,
        enableConflation: this.conflationEnabled,
        precomputeConflationOnInit: false
      },
      crosshair: {
        vertLine: { color: "#7d8b99", labelBackgroundColor: "#25313c" },
        horzLine: { color: "#7d8b99", labelBackgroundColor: "#25313c" }
      },
      handleScale: true,
      handleScroll: true
    });
    this.chartCreateCount += 1;
    this.series = this.chart.addSeries(Qe, {
      upColor: "#25a977",
      downColor: "#dc5362",
      borderVisible: false,
      wickUpColor: "#25a977",
      wickDownColor: "#dc5362",
      priceLineVisible: true,
      lastValueVisible: true
    });
    if (options.showVolumePane ?? true) {
      this.volumeSeries = this.chart.addSeries(
        nr,
        {
          priceFormat: { type: "volume" },
          priceLineVisible: false,
          lastValueVisible: false,
          priceScaleId: "right"
        },
        1
      );
      this.volumeSeries.priceScale().applyOptions({
        borderVisible: false,
        scaleMargins: { top: 0.12, bottom: 0 }
      });
      this.resizeVolumePane(options.height);
    }
    container2.addEventListener("click", this.handleContainerClick, true);
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.handleLogicalRangeChange);
  }
  setHistory(candles2, options = {}) {
    const preservedRange = options.preserveVisibleRange ? this.getVisibleRange() : null;
    this.measureOperation(() => {
      this.requireSeries().setData(candles2.map(toChartCandle));
      this.volumeSeries?.setData(candles2.map(toChartVolume));
    });
    this.historyReplacementCount += 1;
    this.dataPointCount = candles2.length;
    if (preservedRange) {
      this.setVisibleRange(preservedRange);
    } else if (options.fitContent ?? true) {
      this.requireChart().timeScale().fitContent();
    }
  }
  updateCandle(candle) {
    this.measureOperation(() => {
      this.requireSeries().update(toChartCandle(candle));
      this.volumeSeries?.update(toChartVolume(candle));
    });
    this.realtimeUpdateCount += 1;
    this.dataPointCount = Math.max(this.dataPointCount, 1);
  }
  setLevels(levels) {
    const series = this.requireSeries();
    for (const line of this.levelLines.values()) {
      series.removePriceLine(line);
    }
    this.levelLines.clear();
    for (const level of levels) {
      const line = series.createPriceLine({
        price: level.price,
        color: LEVEL_COLORS[level.kind],
        lineWidth: level.importance === "primary" ? 2 : 1,
        lineStyle: level.importance === "primary" ? h.Solid : h.Dashed,
        axisLabelVisible: false,
        title: ""
      });
      this.levelLines.set(level.id, line);
    }
  }
  removeLevel(id) {
    const line = this.levelLines.get(id);
    if (!line) return;
    this.requireSeries().removePriceLine(line);
    this.levelLines.delete(id);
  }
  setAnchoredVwap(id, renderInput) {
    const series = this.requireSeries();
    const existing = this.anchoredVwapPrimitives.get(id);
    if (existing) {
      existing.update(renderInput);
      return;
    }
    const primitive = new AnchoredVwapPrimitive(renderInput);
    series.attachPrimitive(primitive);
    this.anchoredVwapPrimitives.set(id, primitive);
  }
  removeAnchoredVwap(id) {
    const primitive = this.anchoredVwapPrimitives.get(id);
    if (!primitive) return;
    if (this.series) {
      this.series.detachPrimitive(primitive);
    }
    this.anchoredVwapPrimitives.delete(id);
  }
  setVisibleRange(range) {
    this.requireChart().timeScale().setVisibleRange({
      from: toChartTimestamp(range.fromTimestamp),
      to: toChartTimestamp(range.toTimestamp)
    });
  }
  getVisibleRange() {
    const range = this.requireChart().timeScale().getVisibleRange();
    if (!range || typeof range.from !== "number" || typeof range.to !== "number") {
      return null;
    }
    return {
      fromTimestamp: range.from * 1e3,
      toTimestamp: range.to * 1e3
    };
  }
  priceToCoordinate(price) {
    if (!Number.isFinite(price)) return null;
    return this.requireSeries().priceToCoordinate(price);
  }
  subscribeViewportChange(listener) {
    this.viewportListeners.add(listener);
    return () => this.viewportListeners.delete(listener);
  }
  setDrawingMode(mode) {
    this.drawingMode = mode;
  }
  addDrawing(drawing) {
    if (!drawing.id || !Number.isFinite(drawing.createdAt)) {
      throw new Error("Chart drawing requires a stable id and timestamp");
    }
    if (drawing.type === "horizontal-line" && !Number.isFinite(drawing.price) || drawing.type === "vertical-line" && !Number.isFinite(drawing.timestamp)) {
      throw new Error("Chart drawing coordinate must be finite");
    }
    this.removeRenderedDrawing(drawing.id);
    this.drawings.set(drawing.id, drawing);
    this.renderDrawing(drawing);
    this.selectedDrawingId = drawing.id;
    this.notifyDrawingsChange();
  }
  removeDrawing(id) {
    if (!this.drawings.has(id)) return;
    this.removeRenderedDrawing(id);
    this.drawings.delete(id);
    if (this.selectedDrawingId === id) this.selectedDrawingId = null;
    this.notifyDrawingsChange();
  }
  deleteSelectedDrawing() {
    if (this.selectedDrawingId) this.removeDrawing(this.selectedDrawingId);
  }
  clearDrawings() {
    for (const id of this.drawings.keys()) this.removeRenderedDrawing(id);
    this.drawings.clear();
    this.selectedDrawingId = null;
    this.notifyDrawingsChange();
  }
  getDrawings() {
    return Array.from(this.drawings.values());
  }
  subscribeDrawingsChange(listener) {
    this.drawingsChangeListeners.add(listener);
    return () => this.drawingsChangeListeners.delete(listener);
  }
  getDiagnostics() {
    return {
      initializedAt: this.initializedAt,
      chartCreateCount: this.chartCreateCount,
      historyReplacementCount: this.historyReplacementCount,
      realtimeUpdateCount: this.realtimeUpdateCount,
      resizeCount: this.resizeCount,
      dataPointCount: this.dataPointCount,
      drawingCount: this.drawings.size,
      listenerCount: (this.chart ? 2 : 0) + this.viewportListeners.size + this.drawingsChangeListeners.size,
      conflationEnabled: this.conflationEnabled,
      lastOperationDurationMs: this.lastOperationDurationMs,
      maxOperationDurationMs: this.maxOperationDurationMs,
      lastError: this.lastError
    };
  }
  resize(width, height) {
    this.measureOperation(() => {
      this.requireChart().resize(width, height);
      if (this.volumeSeries) this.resizeVolumePane(height);
    });
    this.resizeCount += 1;
  }
  destroy() {
    if (this.chart) {
      this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.handleLogicalRangeChange);
    }
    this.container?.removeEventListener(
      "click",
      this.handleContainerClick,
      true
    );
    this.levelLines.clear();
    this.drawings.clear();
    this.horizontalDrawingLines.clear();
    this.verticalDrawingPrimitives.clear();
    if (this.series) {
      for (const primitive of this.anchoredVwapPrimitives.values()) {
        this.series.detachPrimitive(primitive);
      }
    }
    this.anchoredVwapPrimitives.clear();
    this.viewportListeners.clear();
    this.drawingsChangeListeners.clear();
    this.chart?.remove();
    this.chart = null;
    this.container = null;
    this.series = null;
    this.volumeSeries = null;
    this.selectedDrawingId = null;
  }
  handleContainerClick = (event) => {
    if (this.drawingMode === "pointer" || !this.container) return;
    if (event.target instanceof Element && event.target.closest("a")) return;
    const bounds = this.container.getBoundingClientRect();
    const x2 = event.clientX - bounds.left;
    const y2 = event.clientY - bounds.top;
    if (x2 < 0 || y2 < 0 || x2 > bounds.width || y2 > bounds.height) return;
    const id = `drawing-${Date.now()}-${this.drawingSequence++}`;
    const createdAt = Date.now();
    if (this.drawingMode === "horizontal-line") {
      const price = this.requireSeries().coordinateToPrice(y2);
      if (price !== null) {
        this.addDrawing({ id, type: "horizontal-line", price, createdAt });
      }
      return;
    }
    const timeScale = this.requireChart().timeScale();
    let chartTime = timeScale.coordinateToTime(x2);
    const visibleRange = timeScale.getVisibleRange();
    if (chartTime === null && visibleRange && typeof visibleRange.from === "number" && typeof visibleRange.to === "number" && bounds.width > 0) {
      const ratio = Math.min(Math.max(x2 / bounds.width, 0), 1);
      chartTime = visibleRange.from + (visibleRange.to - visibleRange.from) * ratio;
    }
    if (typeof chartTime === "number") {
      this.addDrawing({
        id,
        type: "vertical-line",
        timestamp: chartTime * 1e3,
        createdAt
      });
    }
  };
  handleLogicalRangeChange = (logicalRange) => {
    if (!logicalRange || this.viewportListeners.size === 0) return;
    const bars = this.requireSeries().barsInLogicalRange(logicalRange);
    const state = {
      visibleRange: this.getVisibleRange(),
      barsBefore: bars?.barsBefore ?? Number.POSITIVE_INFINITY,
      barsAfter: bars?.barsAfter ?? Number.POSITIVE_INFINITY
    };
    for (const listener of this.viewportListeners) listener(state);
  };
  renderDrawing(drawing) {
    const series = this.requireSeries();
    if (drawing.type === "horizontal-line") {
      const line = series.createPriceLine({
        price: drawing.price,
        color: USER_DRAWING_COLOR,
        lineWidth: 1,
        lineStyle: h.Dashed,
        axisLabelVisible: true,
        title: "User"
      });
      this.horizontalDrawingLines.set(drawing.id, line);
      return;
    }
    const primitive = new VerticalLinePrimitive({
      id: drawing.id,
      timestamp: drawing.timestamp,
      color: USER_DRAWING_COLOR,
      label: formatVerticalLineLabel(drawing.timestamp)
    });
    series.attachPrimitive(primitive);
    this.verticalDrawingPrimitives.set(drawing.id, primitive);
  }
  removeRenderedDrawing(id) {
    const series = this.requireSeries();
    const horizontalLine = this.horizontalDrawingLines.get(id);
    if (horizontalLine) {
      series.removePriceLine(horizontalLine);
      this.horizontalDrawingLines.delete(id);
    }
    const verticalPrimitive = this.verticalDrawingPrimitives.get(id);
    if (verticalPrimitive) {
      series.detachPrimitive(verticalPrimitive);
      this.verticalDrawingPrimitives.delete(id);
    }
  }
  notifyDrawingsChange() {
    const drawings = this.getDrawings();
    for (const listener of this.drawingsChangeListeners) listener(drawings);
  }
  resizeVolumePane(height) {
    this.requireVolumeSeries().getPane().setHeight(Math.max(72, Math.floor(height * 0.22)));
  }
  measureOperation(operation) {
    const startedAt = performance.now();
    try {
      operation();
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Chart error";
      throw error;
    } finally {
      this.lastOperationDurationMs = performance.now() - startedAt;
      this.maxOperationDurationMs = Math.max(
        this.maxOperationDurationMs,
        this.lastOperationDurationMs
      );
    }
  }
  requireChart() {
    if (!this.chart) throw new Error("Chart adapter is not initialized");
    return this.chart;
  }
  requireSeries() {
    if (!this.series) throw new Error("Chart adapter is not initialized");
    return this.series;
  }
  requireVolumeSeries() {
    if (!this.volumeSeries) throw new Error("Chart adapter is not initialized");
    return this.volumeSeries;
  }
};

// packages/chart/src/anchored-vwap/calculate.ts
var DEFAULT_PRICE_SOURCE = "typical";
var DEFAULT_BAND_MULTIPLIERS = [1, 2, 3];
function extractCandlePrice(candle, source = DEFAULT_PRICE_SOURCE) {
  switch (source) {
    case "close":
      return candle.close;
    case "hl2":
      return (candle.high + candle.low) / 2;
    case "ohlc4":
      return (candle.open + candle.high + candle.low + candle.close) / 4;
    case "weighted":
      return (candle.high + candle.low + 2 * candle.close) / 4;
    case "typical":
    case "hlc3":
    default:
      return (candle.high + candle.low + candle.close) / 3;
  }
}
function findAnchorIndex(sortedCandles, anchorTimestamp) {
  if (sortedCandles.length === 0) {
    return null;
  }
  const first = sortedCandles[0];
  if (anchorTimestamp <= first.openTime) {
    return 0;
  }
  const last = sortedCandles[sortedCandles.length - 1];
  if (anchorTimestamp > last.closeTime) {
    return null;
  }
  let low = 0;
  let high = sortedCandles.length - 1;
  let candidate = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candle = sortedCandles[mid];
    if (anchorTimestamp >= candle.openTime && anchorTimestamp <= candle.closeTime) {
      return mid;
    }
    if (candle.openTime >= anchorTimestamp) {
      candidate = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return candidate !== -1 ? candidate : null;
}
function calculateAnchoredVwap(input) {
  const startedAt = performance.now();
  const priceSource = input.priceSource ?? DEFAULT_PRICE_SOURCE;
  const bandMultipliers = input.bandMultipliers ?? DEFAULT_BAND_MULTIPLIERS;
  const anchorTimestamp = input.anchorTimestamp;
  const replayCutoff = input.replayCutoff;
  const exclusions = [];
  if (input.candles.length === 0) {
    return {
      anchorTimestamp,
      resolvedAnchorIndex: null,
      points: [],
      latestPoint: null,
      totalCandlesConsidered: 0,
      candlesIncluded: 0,
      candlesExcluded: 0,
      exclusions: [],
      calculationDurationMs: performance.now() - startedAt,
      priceSource,
      bandMultipliers
    };
  }
  let isSorted = true;
  for (let i = 1; i < input.candles.length; i++) {
    if (input.candles[i].openTime < input.candles[i - 1].openTime) {
      isSorted = false;
      break;
    }
  }
  const sortedCandles = isSorted ? input.candles : [...input.candles].sort((a2, b2) => a2.openTime - b2.openTime);
  const anchorIndex = findAnchorIndex(sortedCandles, anchorTimestamp);
  if (anchorIndex === null) {
    for (const candle of sortedCandles) {
      exclusions.push({
        candleOpenTime: candle.openTime,
        reason: "before_anchor"
      });
    }
    return {
      anchorTimestamp,
      resolvedAnchorIndex: null,
      points: [],
      latestPoint: null,
      totalCandlesConsidered: sortedCandles.length,
      candlesIncluded: 0,
      candlesExcluded: exclusions.length,
      exclusions,
      calculationDurationMs: performance.now() - startedAt,
      priceSource,
      bandMultipliers
    };
  }
  for (let i = 0; i < anchorIndex; i++) {
    exclusions.push({
      candleOpenTime: sortedCandles[i].openTime,
      reason: "before_anchor"
    });
  }
  const points = [];
  let cumVolume = 0;
  let cumPriceVolume = 0;
  let runningVwap = 0;
  let runningM2 = 0;
  let runningVariance = 0;
  let runningStdDev = 0;
  for (let i = anchorIndex; i < sortedCandles.length; i++) {
    const candle = sortedCandles[i];
    if (replayCutoff !== void 0) {
      if (candle.closeTime > replayCutoff) {
        exclusions.push({
          candleOpenTime: candle.openTime,
          reason: "after_replay_cutoff",
          detail: `closeTime ${candle.closeTime} > replayCutoff ${replayCutoff}`
        });
        continue;
      }
      if (!candle.isClosed) {
        exclusions.push({
          candleOpenTime: candle.openTime,
          reason: "unclosed_in_replay",
          detail: "Candle is not closed in replay mode"
        });
        continue;
      }
    }
    if (candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0 || candle.high < candle.low) {
      exclusions.push({
        candleOpenTime: candle.openTime,
        reason: "non_positive_price",
        detail: `open: ${candle.open}, high: ${candle.high}, low: ${candle.low}, close: ${candle.close}`
      });
      continue;
    }
    if (!Number.isFinite(candle.open) || !Number.isFinite(candle.high) || !Number.isFinite(candle.low) || !Number.isFinite(candle.close) || !Number.isFinite(candle.volume)) {
      exclusions.push({
        candleOpenTime: candle.openTime,
        reason: "non_finite_values"
      });
      continue;
    }
    const price = extractCandlePrice(candle, priceSource);
    const volume = candle.volume;
    if (volume < 0) {
      exclusions.push({
        candleOpenTime: candle.openTime,
        reason: "non_finite_values",
        detail: `Negative volume: ${volume}`
      });
      continue;
    }
    if (volume === 0) {
      if (cumVolume === 0) {
        runningVwap = price;
        runningM2 = 0;
        runningVariance = 0;
        runningStdDev = 0;
      }
      exclusions.push({
        candleOpenTime: candle.openTime,
        reason: "zero_volume",
        detail: "Candle volume is 0, carried forward previous VWAP"
      });
    } else {
      const prevCumVolume = cumVolume;
      const prevVwap = runningVwap;
      cumVolume += volume;
      cumPriceVolume += price * volume;
      if (prevCumVolume === 0) {
        runningVwap = price;
        runningM2 = 0;
        runningVariance = 0;
        runningStdDev = 0;
      } else {
        const delta = price - prevVwap;
        const r2 = delta * (volume / cumVolume);
        runningVwap = prevVwap + r2;
        runningM2 += prevCumVolume * delta * r2;
        runningVariance = cumVolume > 0 ? Math.max(0, runningM2 / cumVolume) : 0;
        runningStdDev = Math.sqrt(runningVariance);
      }
    }
    const bands = [];
    for (const mult of bandMultipliers) {
      bands.push({
        multiplier: mult,
        upper: runningVwap + mult * runningStdDev,
        lower: runningVwap - mult * runningStdDev
      });
    }
    points.push({
      timestamp: candle.openTime,
      vwap: runningVwap,
      variance: runningVariance,
      standardDeviation: runningStdDev,
      cumulativeVolume: cumVolume,
      cumulativeTypicalPriceVolume: cumPriceVolume,
      bands
    });
  }
  const durationMs = performance.now() - startedAt;
  return {
    anchorTimestamp,
    resolvedAnchorIndex: anchorIndex,
    points,
    latestPoint: points.length > 0 ? points[points.length - 1] ?? null : null,
    totalCandlesConsidered: sortedCandles.length,
    candlesIncluded: points.length,
    candlesExcluded: exclusions.length,
    exclusions,
    calculationDurationMs: durationMs,
    priceSource,
    bandMultipliers
  };
}

// packages/chart/src/anchored-vwap/cache.ts
var ANCHORED_VWAP_CALCULATION_VERSION = "1.0.0";
function buildAnchoredVwapCacheKey(input) {
  const symbol = input.symbol ?? "BTCUSDT";
  const timeframe = input.timeframe ?? "1m";
  const priceSource = input.priceSource ?? "typical";
  const bandMultipliersStr = (input.bandMultipliers ?? [1, 2, 3]).join(",");
  const replayCutoff = input.replayCutoff ?? "live";
  let latestCandleSignature = "empty";
  if (input.candles.length > 0) {
    const last = input.candles[input.candles.length - 1];
    if (last) {
      latestCandleSignature = `${last.openTime}_${last.closeTime}_${last.close}_${last.volume}_${last.isClosed}`;
    }
  }
  const parts = [
    symbol,
    timeframe,
    input.anchorTimestamp,
    priceSource,
    bandMultipliersStr,
    replayCutoff,
    input.candles.length,
    latestCandleSignature,
    ANCHORED_VWAP_CALCULATION_VERSION
  ];
  return parts.join("|");
}
var AnchoredVwapCache = class {
  capacity;
  store = /* @__PURE__ */ new Map();
  constructor(capacity = 50) {
    this.capacity = capacity;
  }
  get(key) {
    const value = this.store.get(key);
    if (value) {
      this.store.delete(key);
      this.store.set(key, value);
    }
    return value;
  }
  set(key, result) {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.capacity) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== void 0) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, result);
  }
  has(key) {
    return this.store.has(key);
  }
  clear() {
    this.store.clear();
  }
  size() {
    return this.store.size;
  }
};

// packages/chart/src/anchored-vwap/controller.ts
var AnchoredVwapController = class {
  vwapId;
  debounceMs;
  maxDelayMs;
  onRender;
  cache;
  currentInput = null;
  currentResult = null;
  presentationOptions;
  currentGeneration = 0;
  debounceTimer = null;
  maxDelayTimer = null;
  isDisposed = false;
  constructor(options) {
    this.vwapId = options.vwapId;
    this.debounceMs = options.debounceMs ?? 100;
    this.maxDelayMs = options.maxDelayMs ?? 300;
    this.onRender = options.onRender;
    this.cache = new AnchoredVwapCache(options.cacheCapacity ?? 50);
    this.presentationOptions = options.presentation ?? {};
  }
  setInput(input, immediate = false) {
    if (this.isDisposed) return;
    this.currentInput = input;
    const generation = ++this.currentGeneration;
    const cacheKey = buildAnchoredVwapCacheKey(input);
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      this.clearTimers();
      this.currentResult = cachedResult;
      this.emitRender(cachedResult);
      return;
    }
    if (immediate) {
      this.clearTimers();
      this.executeCalculation(input, generation, cacheKey);
      return;
    }
    if (!this.maxDelayTimer) {
      this.maxDelayTimer = setTimeout(() => {
        this.maxDelayTimer = null;
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }
        if (this.currentInput && !this.isDisposed) {
          this.executeCalculation(
            this.currentInput,
            this.currentGeneration,
            buildAnchoredVwapCacheKey(this.currentInput)
          );
        }
      }, this.maxDelayMs);
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.maxDelayTimer) {
        clearTimeout(this.maxDelayTimer);
        this.maxDelayTimer = null;
      }
      if (this.currentInput && !this.isDisposed) {
        this.executeCalculation(
          this.currentInput,
          this.currentGeneration,
          buildAnchoredVwapCacheKey(this.currentInput)
        );
      }
    }, this.debounceMs);
  }
  setAnchorTimestamp(anchorTimestamp, immediate = false) {
    if (this.isDisposed || !this.currentInput) return;
    this.setInput(
      {
        ...this.currentInput,
        anchorTimestamp
      },
      immediate
    );
  }
  setReplayCutoff(replayCutoff, immediate = false) {
    if (this.isDisposed || !this.currentInput) return;
    this.setInput(
      {
        ...this.currentInput,
        replayCutoff
      },
      immediate
    );
  }
  setPresentation(presentation2) {
    if (this.isDisposed) return;
    this.presentationOptions = { ...this.presentationOptions, ...presentation2 };
    if (this.currentResult) {
      this.emitRender(this.currentResult);
    }
  }
  getCurrentResult() {
    return this.currentResult;
  }
  getCurrentGeneration() {
    return this.currentGeneration;
  }
  executeCalculation(input, generation, cacheKey) {
    if (this.isDisposed || generation !== this.currentGeneration) {
      return;
    }
    const result = calculateAnchoredVwap(input);
    if (this.isDisposed || generation !== this.currentGeneration) {
      return;
    }
    this.cache.set(cacheKey, result);
    this.currentResult = result;
    this.emitRender(result);
  }
  emitRender(result) {
    if (this.isDisposed) return;
    this.onRender({
      vwapId: this.vwapId,
      result,
      presentation: this.presentationOptions
    });
  }
  clearTimers() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.maxDelayTimer) {
      clearTimeout(this.maxDelayTimer);
      this.maxDelayTimer = null;
    }
  }
  dispose() {
    this.isDisposed = true;
    this.currentGeneration += 1;
    this.clearTimers();
    this.cache.clear();
    this.currentInput = null;
    this.currentResult = null;
  }
};

// packages/chart/src/anchored-vwap/fixture/fixture-data.ts
function createFixtureCandles(count = 250, startPrice = 62e3) {
  const baseTime = 17e11;
  const intervalMs = 6e4;
  const candles2 = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const openTime = baseTime + i * intervalMs;
    const closeTime = openTime + intervalMs - 1;
    let trend = 0;
    if (i < 80) trend = 15;
    else if (i < 150) trend = -12;
    else trend = 18;
    const noise = (i % 13 - 6) * 8;
    const open = price;
    const close = Math.round((open + trend + noise) * 100) / 100;
    const high = Math.round((Math.max(open, close) + Math.abs(i % 7 + 2) * 12) * 100) / 100;
    const low = Math.round((Math.min(open, close) - Math.abs(i % 5 + 2) * 12) * 100) / 100;
    const volume = Math.round((15 + Math.sin(i / 10) * 8 + i % 11 * 3) * 10) / 10;
    candles2.push({
      metadata: {
        source: "binance",
        sourceTimestamp: closeTime,
        receivedTimestamp: closeTime,
        normalizedTimestamp: closeTime,
        schemaVersion: "1.0.0"
      },
      symbol: "BTCUSDT",
      interval: "1m",
      openTime,
      closeTime,
      open,
      high,
      low,
      close,
      volume,
      quoteVolume: Math.round(volume * close * 100) / 100,
      tradeCount: 45 + i % 20,
      isClosed: true
    });
    price = close;
  }
  return candles2;
}

// packages/chart/src/anchored-vwap/fixture/harness.ts
var candles = createFixtureCandles(250, 62e3);
var container = document.getElementById("chart-container");
var chartFrame = document.getElementById("chart-frame");
var adapter = new LightweightChartsAdapter();
adapter.initialize(container, {
  symbol: "BTCUSDT",
  width: chartFrame.clientWidth,
  height: chartFrame.clientHeight,
  backgroundColor: "#0d1117",
  textColor: "#c9d1d9",
  showVolumePane: true
});
adapter.setHistory(candles, { fitContent: true });
var currentAnchorTime = candles[0].openTime;
var currentSource = "typical";
var showBands = true;
var showFill = false;
var showAnchorLine = true;
var isReplay = false;
var presentation = {
  vwapColor: "#2962ff",
  vwapLineWidth: 2,
  showBands: true,
  bandColors: [
    "rgba(41, 98, 255, 0.65)",
    "rgba(41, 98, 255, 0.40)",
    "rgba(41, 98, 255, 0.20)"
  ],
  bandLineWidth: 1,
  showFill: false,
  bandFillColor: "rgba(41, 98, 255, 0.08)",
  showAnchorLine: true,
  anchorLineColor: "rgba(242, 193, 78, 0.75)",
  showLabels: true
};
var controller = new AnchoredVwapController({
  vwapId: "harness-avwap",
  presentation,
  onRender: (renderInput) => {
    adapter.setAnchoredVwap("harness-avwap", renderInput);
    updateStats(renderInput);
  }
});
function updateStats(renderInput) {
  const res = renderInput.result;
  const p2 = res.latestPoint;
  const statAnchor = document.getElementById("stat-anchor");
  const statVwap = document.getElementById("stat-vwap");
  const statStddev = document.getElementById("stat-stddev");
  const statUpper = document.getElementById("stat-upper");
  const statLower = document.getElementById("stat-lower");
  const statVol = document.getElementById("stat-vol");
  const statPoints = document.getElementById("stat-points");
  if (statAnchor) {
    const d2 = new Date(res.anchorTimestamp);
    statAnchor.textContent = `${d2.toISOString().slice(11, 19)} UTC`;
  }
  if (statVwap && p2) {
    statVwap.textContent = `$${p2.vwap.toFixed(2)}`;
  }
  if (statStddev && p2) {
    statStddev.textContent = `$${p2.standardDeviation.toFixed(2)}`;
  }
  if (statUpper && p2 && p2.bands[0]) {
    statUpper.textContent = `$${p2.bands[0].upper.toFixed(2)}`;
  }
  if (statLower && p2 && p2.bands[0]) {
    statLower.textContent = `$${p2.bands[0].lower.toFixed(2)}`;
  }
  if (statVol && p2) {
    statVol.textContent = p2.cumulativeVolume.toLocaleString();
  }
  if (statPoints) {
    statPoints.textContent = `${res.candlesIncluded} / ${res.totalCandlesConsidered}`;
  }
}
function recompute() {
  const replayCutoff = isReplay ? candles[120]?.closeTime : void 0;
  const input = {
    anchorTimestamp: currentAnchorTime,
    candles,
    priceSource: currentSource,
    bandMultipliers: [1, 2, 3],
    replayCutoff
  };
  controller.setInput(input, true);
}
recompute();
var btnDesktop = document.getElementById("btn-desktop");
var btnMobile = document.getElementById("btn-mobile");
var selAnchor = document.getElementById("sel-anchor");
var selSource = document.getElementById("sel-source");
var btnBands = document.getElementById("btn-bands");
var btnFill = document.getElementById("btn-fill");
var btnAnchorLine = document.getElementById("btn-anchor-line");
var btnReplay = document.getElementById("btn-replay");
btnDesktop?.addEventListener("click", () => {
  btnDesktop.classList.add("active");
  btnMobile?.classList.remove("active");
  chartFrame.style.width = "1440px";
  chartFrame.style.height = "800px";
  adapter.resize(1440, 800);
});
btnMobile?.addEventListener("click", () => {
  btnMobile.classList.add("active");
  btnDesktop?.classList.remove("active");
  chartFrame.style.width = "370px";
  chartFrame.style.height = "700px";
  adapter.resize(370, 700);
});
selAnchor?.addEventListener("change", () => {
  const idx = parseInt(selAnchor.value, 10);
  currentAnchorTime = candles[idx]?.openTime ?? candles[0].openTime;
  recompute();
});
selSource?.addEventListener("change", () => {
  currentSource = selSource.value;
  recompute();
});
btnBands?.addEventListener("click", () => {
  showBands = !showBands;
  btnBands.classList.toggle("active", showBands);
  controller.setPresentation({ showBands });
});
btnFill?.addEventListener("click", () => {
  showFill = !showFill;
  btnFill.textContent = `Band Fill: ${showFill ? "On" : "Off"}`;
  btnFill.classList.toggle("active", showFill);
  controller.setPresentation({ showFill });
});
btnAnchorLine?.addEventListener("click", () => {
  showAnchorLine = !showAnchorLine;
  btnAnchorLine.classList.toggle("active", showAnchorLine);
  controller.setPresentation({ showAnchorLine });
});
btnReplay?.addEventListener("click", () => {
  isReplay = !isReplay;
  btnReplay.textContent = `Mode: ${isReplay ? "Replay (Cutoff: Bar 120)" : "Live"}`;
  btnReplay.classList.toggle("active", isReplay);
  recompute();
});
/*! Bundled license information:

lightweight-charts/dist/lightweight-charts.production.mjs:
  (*!
   * @license
   * TradingView Lightweight Charts™ v5.2.1
   * Copyright (c) 2026 TradingView, Inc.
   * Licensed under Apache License 2.0 https://www.apache.org/licenses/LICENSE-2.0
   *)
*/
