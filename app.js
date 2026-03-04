(() => {
  const cfg = window.APP_CONFIG || {};
  const canvas = document.getElementById("matrixCanvas");
  const unitsEl = document.getElementById("unitsLabel");
  const updatedEl = document.getElementById("lastUpdated");
  const emojiEl = document.getElementById("emojiLabel");
  const ctx = canvas.getContext("2d", { alpha: false });

  const GRID_WIDTH = 60;
  const GRID_HEIGHT = 16;

  const DIGITS = {
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
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  };

  const ARROWS = {
    right: ["10000", "11000", "11100", "11110", "11100", "11000", "10000"],
    up1: ["00100", "01110", "11111", "00000", "00000", "00000", "00000"],
    up2: ["0010000100", "0111001110", "11111011111", "00000000000", "00000000000", "00000000000", "00000000000"],
    down1: ["00000", "00000", "00000", "00000", "11111", "01110", "00100"],
    down2: ["00000000000", "00000000000", "00000000000", "00000000000", "11111011111", "0111001110", "0010000100"],
    stale: ["00100", "01010", "10001", "10001", "10001", "01010", "00100"],
    alert: ["00100", "00100", "00100", "00100", "00000", "00100", "00000"],
  };

  const ICONS = {
    ok: [
      "0110110",
      "1111111",
      "1111111",
      "1111111",
      "0111110",
      "0011100",
      "0001000",
    ],
    low: [
      "0011100",
      "0111110",
      "1111111",
      "1111111",
      "0011100",
      "0011100",
      "0011100",
    ],
    high: [
      "0011100",
      "0111110",
      "1111111",
      "1111111",
      "1111111",
      "0111110",
      "0011100",
    ],
    stale: [
      "0011100",
      "0100010",
      "1000001",
      "0000111",
      "0000100",
      "0000000",
      "0000100",
    ],
    error: [
      "1000001",
      "0100010",
      "0010100",
      "0001000",
      "0010100",
      "0100010",
      "1000001",
    ],
  };

  const model = {
    valueText: "---",
    valueNumber: NaN,
    state: "ok",
    arrow: "right",
    updatedText: "Waiting for data...",
    emoji: "❤️",
  };

  unitsEl.textContent = cfg.units || "mg/dL";
  applyTheme(cfg.colors || {});

  function applyTheme(colors) {
    const root = document.documentElement;
    const entries = {
      "--page-bg": colors.background,
      "--panel-color": colors.panel,
      "--display-bg": colors.display,
      "--meta-color": colors.meta,
    };
    Object.entries(entries).forEach(([key, value]) => {
      if (value) root.style.setProperty(key, value);
    });
  }

  function paletteForValue(value, state) {
    const colors = cfg.colors || {};
    if (state === "error") return colors.high || "#ff3b30";
    if (typeof value === "number" && Number.isFinite(value)) {
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
    const map = {
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
      RATE_OUT_OF_RANGE: "alert",
    };
    return map[direction] || "right";
  }

  function pickEmoji(value, state) {
    const ranges = Array.isArray(cfg.emojiRanges) ? cfg.emojiRanges : [];
    for (const r of ranges) {
      const minOk = typeof r.min !== "number" || value >= r.min;
      const maxOk = typeof r.max !== "number" || value <= r.max;
      if (minOk && maxOk && r.emoji) return r.emoji;
    }

    const emojis = cfg.emojis || {};
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
    const low = Number(cfg.targetLow ?? 70);
    const high = Number(cfg.targetHigh ?? 180);
    const staleMinutes = Number(cfg.staleMinutes ?? 12);

    if (!Number.isFinite(value)) return "error";
    if (Number.isFinite(ageMinutes) && ageMinutes > staleMinutes) return "stale";
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
    const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (minutes === 0) return "Updated now";
    if (minutes === 1) return "Updated 1 min ago";
    return `Updated ${minutes} mins ago`;
  }

  function setCanvasSize() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function cellMetrics() {
    const stepX = canvas.width / GRID_WIDTH;
    const stepY = canvas.height / GRID_HEIGHT;
    const pixelSize = Math.max(1, Math.min(stepX, stepY) * 0.9);
    const offsetX = (canvas.width - GRID_WIDTH * stepX) / 2;
    const offsetY = (canvas.height - GRID_HEIGHT * stepY) / 2;
    return { stepX, stepY, pixelSize, offsetX, offsetY };
  }

  function patternWidth(pattern) {
    return pattern.length > 0 ? pattern[0].length : 0;
  }

  function drawCell(col, row, color, m) {
    const x = m.offsetX + col * m.stepX + (m.stepX - m.pixelSize) * 0.5;
    const y = m.offsetY + row * m.stepY + (m.stepY - m.pixelSize) * 0.5;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, m.pixelSize, m.pixelSize);
  }

  function drawPattern(pattern, startCol, startRow, color, scale, m) {
    for (let y = 0; y < pattern.length; y += 1) {
      const row = pattern[y];
      for (let x = 0; x < row.length; x += 1) {
        if (row[x] !== "1") continue;
        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) {
            drawCell(startCol + x * scale + sx, startRow + y * scale + sy, color, m);
          }
        }
      }
    }
  }

  function drawOffGrid(m) {
    const color = offColor();
    for (let r = 0; r < GRID_HEIGHT; r += 1) {
      for (let c = 0; c < GRID_WIDTH; c += 1) {
        drawCell(c, r, color, m);
      }
    }
  }

  function render() {
    setCanvasSize();
    const m = cellMetrics();
    ctx.fillStyle = (cfg.colors && cfg.colors.display) || "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawOffGrid(m);

    const valueColor = paletteForValue(model.valueNumber, model.state);
    const iconColor = model.state === "stale" ? dimColor() : valueColor;
    const arrowPattern = ARROWS[model.arrow] || ARROWS.alert;
    const iconPattern = iconFromState(model.state);

    const scale = 2;
    const arrowScale = 1;
    const digitWidth = patternWidth(DIGITS["0"]) * scale;
    const digitHeight = DIGITS["0"].length * scale;
    const iconWidth = patternWidth(iconPattern) * scale;
    const arrowWidth = patternWidth(arrowPattern) * arrowScale;
    const arrowHeight = arrowPattern.length * arrowScale;
    const chars = model.valueText.split("").slice(0, 3);
    const digitGap = 1;
    const blockGap = 2;
    const digitsBlockWidth =
      chars.length * digitWidth + Math.max(0, chars.length - 1) * digitGap;
    const contentWidth = iconWidth + blockGap + digitsBlockWidth + blockGap + arrowWidth;
    const startCol = Math.max(0, Math.floor((GRID_WIDTH - contentWidth) / 2));
    const startRow = Math.max(0, Math.floor((GRID_HEIGHT - digitHeight) / 2));

    drawPattern(iconPattern, startCol, startRow, iconColor, scale, m);

    const digitStart = startCol + iconWidth + blockGap;
    chars.forEach((ch, idx) => {
      const glyph = DIGITS[ch] || DIGITS["-"];
      const x = digitStart + idx * (digitWidth + digitGap);
      drawPattern(glyph, x, startRow, valueColor, scale, m);
    });

    const arrowX = digitStart + digitsBlockWidth + blockGap;
    const arrowY = startRow + Math.max(0, Math.floor((digitHeight - arrowHeight) / 2));
    drawPattern(arrowPattern, arrowX, arrowY, arrowColor(), arrowScale, m);
  }

  async function fetchLatest() {
    const useProxy = Boolean(cfg.useProxy);
    const base = String(cfg.nightscoutBaseUrl || "").replace(/\/$/, "");
    const path = cfg.apiPath || "/api/v1/entries.json?count=1";
    let url = "";

    if (useProxy) {
      url = path;
    } else if (/^https?:\/\//i.test(path)) {
      url = path;
    } else {
      if (!base || base.includes("YOUR-NIGHTSCOUT")) {
        throw new Error("nightscoutBaseUrl not configured");
      }
      url = `${base}${path}`;
    }

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("No Nightscout entries returned");
    }
    return data[0];
  }

  async function refresh() {
    try {
      const entry = await fetchLatest();
      const value = Number(entry.sgv ?? entry.mbsg);
      const direction = entry.direction || "NONE";
      const timestamp = parseEntryTimestamp(entry);
      const ageMinutes = timestamp ? (Date.now() - timestamp.getTime()) / 60000 : NaN;
      const state = readState(value, ageMinutes);

      const rounded = Number.isFinite(value) ? Math.round(value) : NaN;
      model.valueText = Number.isFinite(rounded) ? String(Math.max(0, Math.min(rounded, 999))) : "---";
      model.valueNumber = rounded;
      model.state = state;
      model.arrow = state === "stale" ? "stale" : mapDirection(direction);
      model.updatedText = timestamp ? formatAgeText(timestamp) : "No timestamp";
      model.emoji = pickEmoji(rounded, state);

      updatedEl.textContent = model.updatedText;
      emojiEl.textContent = model.emoji;
      render();
    } catch (err) {
      model.valueText = "---";
      model.valueNumber = NaN;
      model.state = "error";
      model.arrow = "alert";
      model.updatedText = `Error: ${err.message}`;
      model.emoji = (cfg.emojis && cfg.emojis.error) || "❌";
      updatedEl.textContent = model.updatedText;
      emojiEl.textContent = model.emoji;
      render();
    }
  }

  window.addEventListener("resize", render);

  render();
  refresh();
  const intervalMs = Math.max(15, Number(cfg.refreshSeconds || 45)) * 1000;
  setInterval(refresh, intervalMs);
})();
