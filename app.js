(function () {
  var cfg = window.APP_CONFIG || {};
  var canvas = document.getElementById("matrixCanvas");
  var unitsEl = document.getElementById("unitsLabel");
  var updatedEl = document.getElementById("lastUpdated");
  var emojiEl = document.getElementById("emojiLabel");
  var ctx = canvas.getContext("2d", { alpha: false });

  var GRID_WIDTH = 60;
  var GRID_HEIGHT = 16;

  var DIGITS = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"]
  };

  var ARROWS = {
    right: ["10000", "11000", "11100", "11110", "11100", "11000", "10000"],
    up1: ["00100", "01110", "11111", "00000", "00000", "00000", "00000"],
    up2: ["0010000100", "0111001110", "11111011111", "00000000000", "00000000000", "00000000000", "00000000000"],
    down1: ["00000", "00000", "00000", "00000", "11111", "01110", "00100"],
    down2: ["00000000000", "00000000000", "00000000000", "00000000000", "11111011111", "0111001110", "0010000100"],
    stale: ["00100", "01010", "10001", "10001", "10001", "01010", "00100"],
    alert: ["00100", "00100", "00100", "00100", "00000", "00100", "00000"]
  };

  var ICONS = {
    ok: ["0110110", "1111111", "1111111", "1111111", "0111110", "0011100", "0001000"],
    low: ["0011100", "0111110", "1111111", "1111111", "0011100", "0011100", "0011100"],
    high: ["0011100", "0111110", "1111111", "1111111", "1111111", "0111110", "0011100"],
    stale: ["0011100", "0100010", "1000001", "0000111", "0000100", "0000000", "0000100"],
    error: ["1000001", "0100010", "0010100", "0001000", "0010100", "0100010", "1000001"]
  };

  var model = {
    valueText: "---",
    valueNumber: NaN,
    state: "ok",
    arrow: "right",
    updatedText: "Waiting for data...",
    emoji: "❤️"
  };

  unitsEl.textContent = cfg.units || "mg/dL";
  applyTheme(cfg.colors || {});

  function numOrDefault(value, fallback) {
    var n = Number(value);
    if (isFinite(n)) return n;
    return fallback;
  }

  function applyTheme(colors) {
    var root = document.documentElement;
    if (colors.background) root.style.setProperty("--page-bg", colors.background);
    if (colors.display) root.style.setProperty("--display-bg", colors.display);
    if (colors.meta) root.style.setProperty("--meta-color", colors.meta);
  }

  function paletteForValue(value, state) {
    var colors = cfg.colors || {};
    if (state === "error") return colors.high || "#ff3b30";
    if (typeof value === "number" && isFinite(value)) {
      if (value < 70) return colors.low || "#ff3b30";
      if (value <= 180) return colors.system || "#63f28c";
      if (value <= 250) return colors.high || "#ff9f1a";
      return colors.veryHigh || colors.low || "#ff3b30";
    }
    return colors.system || "#63f28c";
  }

  function arrowColor() {
    return (cfg.colors && cfg.colors.arrow) || "#f0f0f0";
  }

  function dimColor() {
    return (cfg.colors && cfg.colors.dim) || "#808080";
  }

  function offColor() {
    return (cfg.colors && cfg.colors.off) || "#101010";
  }

  function mapDirection(direction) {
    var map = {
      TripleUp: "up2",
      DoubleUp: "up2",
      SingleUp: "up1",
      FortyFiveUp: "up1",
      Flat: "right",
      FortyFiveDown: "down1",
      SingleDown: "down1",
      DoubleDown: "down2",
      TripleDown: "down2",
      NONE: "right",
      NOT_COMPUTABLE: "alert",
      RATE_OUT_OF_RANGE: "alert"
    };
    return map[direction] || "right";
  }

  function pickEmoji(value, state) {
    var ranges = Array.isArray(cfg.emojiRanges) ? cfg.emojiRanges : [];
    var i;
    for (i = 0; i < ranges.length; i += 1) {
      var r = ranges[i];
      var minOk = typeof r.min !== "number" || value >= r.min;
      var maxOk = typeof r.max !== "number" || value <= r.max;
      if (minOk && maxOk && r.emoji) return r.emoji;
    }

    var emojis = cfg.emojis || {};
    if (state === "low") return emojis.low || "🧃";
    if (state === "high") return emojis.high || "🚨";
    if (state === "stale") return emojis.stale || "⌛";
    if (state === "error") return emojis.error || "❌";
    return emojis.ok || "❤️";
  }

  function iconFromState(state) {
    if (state === "low") return ICONS.low;
    if (state === "high") return ICONS.high;
    if (state === "stale") return ICONS.stale;
    if (state === "error") return ICONS.error;
    return ICONS.ok;
  }

  function readState(value, ageMinutes) {
    var low = numOrDefault(cfg.targetLow, 70);
    var high = numOrDefault(cfg.targetHigh, 180);
    var staleMinutes = numOrDefault(cfg.staleMinutes, 12);

    if (!isFinite(value)) return "error";
    if (isFinite(ageMinutes) && ageMinutes > staleMinutes) return "stale";
    if (value < low) return "low";
    if (value > high) return "high";
    return "ok";
  }

  function parseEntryTimestamp(entry) {
    if (!entry) return null;
    if (entry.dateString) return new Date(entry.dateString);
    if (entry.date) return new Date(Number(entry.date));
    return null;
  }

  function formatAgeText(date) {
    var minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (minutes === 0) return "Updated now";
    if (minutes === 1) return "Updated 1 min ago";
    return "Updated " + minutes + " mins ago";
  }

  function setCanvasSize() {
    var dpr = window.devicePixelRatio || 1;
    var width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    var height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function cellMetrics() {
    var stepX = canvas.width / GRID_WIDTH;
    var stepY = canvas.height / GRID_HEIGHT;
    var pixelSize = Math.max(1, Math.min(stepX, stepY) * 0.9);
    var offsetX = (canvas.width - GRID_WIDTH * stepX) / 2;
    var offsetY = (canvas.height - GRID_HEIGHT * stepY) / 2;
    return { stepX: stepX, stepY: stepY, pixelSize: pixelSize, offsetX: offsetX, offsetY: offsetY };
  }

  function patternWidth(pattern) {
    return pattern.length > 0 ? pattern[0].length : 0;
  }

  function drawCell(col, row, color, m) {
    var x = m.offsetX + col * m.stepX + (m.stepX - m.pixelSize) * 0.5;
    var y = m.offsetY + row * m.stepY + (m.stepY - m.pixelSize) * 0.5;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, m.pixelSize, m.pixelSize);
  }

  function drawPattern(pattern, startCol, startRow, color, scale, m) {
    var y;
    for (y = 0; y < pattern.length; y += 1) {
      var row = pattern[y];
      var x;
      for (x = 0; x < row.length; x += 1) {
        if (row[x] !== "1") continue;
        var sy;
        for (sy = 0; sy < scale; sy += 1) {
          var sx;
          for (sx = 0; sx < scale; sx += 1) {
            drawCell(startCol + x * scale + sx, startRow + y * scale + sy, color, m);
          }
        }
      }
    }
  }

  function drawOffGrid(m) {
    var color = offColor();
    var r;
    for (r = 0; r < GRID_HEIGHT; r += 1) {
      var c;
      for (c = 0; c < GRID_WIDTH; c += 1) {
        drawCell(c, r, color, m);
      }
    }
  }

  function render() {
    setCanvasSize();
    var m = cellMetrics();
    ctx.fillStyle = (cfg.colors && cfg.colors.display) || "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawOffGrid(m);

    var valueColor = paletteForValue(model.valueNumber, model.state);
    var iconColor = model.state === "stale" ? dimColor() : valueColor;
    var arrowPattern = ARROWS[model.arrow] || ARROWS.alert;
    var iconPattern = iconFromState(model.state);

    var scale = 2;
    var arrowScale = 1;
    var digitWidth = patternWidth(DIGITS["0"]) * scale;
    var digitHeight = DIGITS["0"].length * scale;
    var iconWidth = patternWidth(iconPattern) * scale;
    var arrowWidth = patternWidth(arrowPattern) * arrowScale;
    var arrowHeight = arrowPattern.length * arrowScale;
    var chars = model.valueText.split("").slice(0, 3);
    var digitGap = 1;
    var blockGap = 2;
    var digitsBlockWidth = chars.length * digitWidth + Math.max(0, chars.length - 1) * digitGap;
    var contentWidth = iconWidth + blockGap + digitsBlockWidth + blockGap + arrowWidth;
    var startCol = Math.max(0, Math.floor((GRID_WIDTH - contentWidth) / 2));
    var startRow = Math.max(0, Math.floor((GRID_HEIGHT - digitHeight) / 2));

    drawPattern(iconPattern, startCol, startRow, iconColor, scale, m);

    var digitStart = startCol + iconWidth + blockGap;
    var i;
    for (i = 0; i < chars.length; i += 1) {
      var ch = chars[i];
      var glyph = DIGITS[ch] || DIGITS["-"];
      var x = digitStart + i * (digitWidth + digitGap);
      drawPattern(glyph, x, startRow, valueColor, scale, m);
    }

    var arrowX = digitStart + digitsBlockWidth + blockGap;
    var arrowY = startRow + Math.max(0, Math.floor((digitHeight - arrowHeight) / 2));
    drawPattern(arrowPattern, arrowX, arrowY, arrowColor(), arrowScale, m);
  }

  function getJson(url, done) {
    if (window.fetch) {
      window.fetch(url, { cache: "no-store" })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (data) {
          done(null, data);
        })
        .catch(function (err) {
          done(err);
        });
      return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status < 200 || xhr.status >= 300) {
        done(new Error("HTTP " + xhr.status));
        return;
      }
      try {
        var data = JSON.parse(xhr.responseText);
        done(null, data);
      } catch (e) {
        done(e);
      }
    };
    xhr.onerror = function () {
      done(new Error("Load failed"));
    };
    xhr.send();
  }

  function fetchLatest(done) {
    var useProxy = !!cfg.useProxy;
    var base = String(cfg.nightscoutBaseUrl || "").replace(/\/$/, "");
    var path = cfg.apiPath || "/api/v1/entries.json?count=1";
    var url = "";

    if (useProxy) {
      url = path;
    } else if (/^https?:\/\//i.test(path)) {
      url = path;
    } else {
      if (!base || base.indexOf("YOUR-NIGHTSCOUT") >= 0) {
        done(new Error("nightscoutBaseUrl not configured"));
        return;
      }
      url = base + path;
    }

    getJson(url, function (err, data) {
      if (err) {
        done(err);
        return;
      }
      if (!Array.isArray(data) || data.length === 0) {
        done(new Error("No Nightscout entries returned"));
        return;
      }
      done(null, data[0]);
    });
  }

  function refresh() {
    fetchLatest(function (err, entry) {
      if (err) {
        model.valueText = "---";
        model.valueNumber = NaN;
        model.state = "error";
        model.arrow = "alert";
        model.updatedText = "Error: " + err.message;
        model.emoji = (cfg.emojis && cfg.emojis.error) || "❌";
        updatedEl.textContent = model.updatedText;
        emojiEl.textContent = model.emoji;
        render();
        return;
      }

      var value = Number((entry && entry.sgv) || (entry && entry.mbsg));
      var direction = (entry && entry.direction) || "NONE";
      var timestamp = parseEntryTimestamp(entry);
      var ageMinutes = timestamp ? (Date.now() - timestamp.getTime()) / 60000 : NaN;
      var state = readState(value, ageMinutes);
      var rounded = isFinite(value) ? Math.round(value) : NaN;

      model.valueText = isFinite(rounded) ? String(Math.max(0, Math.min(rounded, 999))) : "---";
      model.valueNumber = rounded;
      model.state = state;
      model.arrow = state === "stale" ? "stale" : mapDirection(direction);
      model.updatedText = timestamp ? formatAgeText(timestamp) : "No timestamp";
      model.emoji = pickEmoji(rounded, state);

      updatedEl.textContent = model.updatedText;
      emojiEl.textContent = model.emoji;
      render();
    });
  }

  window.addEventListener("resize", render);

  render();
  refresh();
  var intervalMs = Math.max(15, Number(cfg.refreshSeconds || 45)) * 1000;
  setInterval(refresh, intervalMs);
})();
