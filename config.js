window.APP_CONFIG = {
  useProxy: true,
  nightscoutBaseUrl: "",
  apiPath: "/nightscout/api/v1/entries.json?count=1",
  units: "mg/dL",
  refreshSeconds: 60,
  targetLow: 70,
  targetHigh: 180,
  staleMinutes: 12,

  // Visual settings
  colors: {
    background: "#000000",
    panel: "#24262d",
    display: "#050505",
    meta: "#dedede",
    system: "#63f28c",
    low: "#ff3b30",
    high: "#ff9f1a",
    veryHigh: "#ff3b30",
    arrow: "#f0f0f0",
    dim: "#7f7f7f",
    off: "#101010",
  },

  // Emojis by state
  emojis: {
    ok: "❤️",
    low: "🧃",
    high: "🚨",
    stale: "⌛",
    error: "❌",
  },

  // Optional custom emoji range overrides (first match wins)
  // Example:
  emojiRanges: [
    { max: 59, emoji: "🆘" },
    { min: 60, max: 69, emoji: "🧃" },
    { min: 70, max: 180, emoji: "❤️" },
    { min: 181, max: 250, emoji: "🚨" },
    { min: 251, emoji: "🔥" },
  ],
};
