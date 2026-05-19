// Interactive Telegram menu using inline keyboard buttons.
// Listens for callbacks, handles edit flow with pending state.
import TelegramBot from "node-telegram-bot-api";
import { CONFIG } from "./config.js";
import * as settings from "./settings.js";

let bot = null;

// Tracks "pending edit" — when user taps Edit X, we wait for their next text message.
// Format: { [chatId]: { key, label, validate, format } }
const pendingEdits = new Map();

function escapeMd(s) {
  return String(s).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function fmtUsd(n) {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

// Define every editable setting: how to display, validate, and format it.
// `field` matches the SETTINGS key. `kind` controls input parsing.
const EDITABLE = [
  { field: "MIN_LIQUIDITY_USD", label: "Min Liquidity ($)", kind: "int", min: 0 },
  { field: "MIN_MARKET_CAP_USD", label: "Min Market Cap ($)", kind: "int", min: 0 },
  { field: "MAX_MARKET_CAP_USD", label: "Max Market Cap ($)", kind: "int", min: 0 },
  { field: "MIN_VOLUME_H1_USD", label: "Min 1h Volume ($)", kind: "int", min: 0 },
  { field: "MIN_BUY_RATIO_H1", label: "Min Buy Ratio (0-1)", kind: "float", min: 0, max: 1 },
  { field: "MIN_HOLDERS", label: "Min Holders", kind: "int", min: 0 },
  { field: "MAX_TOP_HOLDER_PCT", label: "Max Top Holder %", kind: "float", min: 0, max: 100 },
  { field: "MAX_TOP_10_HOLDERS_PCT", label: "Max Top 10 %", kind: "float", min: 0, max: 100 },
  { field: "MIN_AGE_MINUTES", label: "Min Age (min)", kind: "float", min: 0 },
  { field: "MAX_AGE_MINUTES", label: "Max Age (min)", kind: "float", min: 0 },
  { field: "MAX_RUGCHECK_RISK_SCORE", label: "Max RugCheck Score", kind: "int", min: 0 },
  { field: "POLL_INTERVAL_MS", label: "Poll Interval (ms)", kind: "int", min: 5000 },
];

// Toggle (boolean) settings
const TOGGLES = [
  { field: "REQUIRE_MINT_REVOKED", label: "Require Mint Revoked" },
  { field: "REQUIRE_FREEZE_REVOKED", label: "Require Freeze Revoked" },
  { field: "REQUIRE_LP_LOCKED_OR_BURNED", label: "Require LP Locked/Burned" },
];

function findEditable(field) {
  return EDITABLE.find((e) => e.field === field);
}

// Only the configured chat ID can interact with the bot. Everyone else is ignored.
function isAuthorized(chatId) {
  return String(chatId) === String(CONFIG.TELEGRAM_CHAT_ID);
}

// ----- Menu builders -----

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "⚙️ Filters", callback_data: "menu:filters" }, { text: "🛡 Safety", callback_data: "menu:safety" }],
      [{ text: "📊 Stats", callback_data: "menu:stats" }, { text: "⏯ Scan Control", callback_data: "menu:scan" }],
      [{ text: "♻️ Reset to Defaults", callback_data: "menu:reset_confirm" }],
    ],
  };
}

function filtersMenuKeyboard() {
  const s = settings.getAll();
  const rows = [];
  for (let i = 0; i < EDITABLE.length; i += 2) {
    const a = EDITABLE[i];
    const b = EDITABLE[i + 1];
    const row = [{ text: `${a.label}: ${fmtVal(a, s[a.field])}`, callback_data: `edit:${a.field}` }];
    if (b) row.push({ text: `${b.label}: ${fmtVal(b, s[b.field])}`, callback_data: `edit:${b.field}` });
    rows.push(row);
  }
  rows.push([{ text: "⬅️ Back", callback_data: "menu:main" }]);
  return { inline_keyboard: rows };
}

function safetyMenuKeyboard() {
  const rows = TOGGLES.map((t) => [
    {
      text: `${settings.getBool(t.field) ? "✅" : "❌"} ${t.label}`,
      callback_data: `toggle:${t.field}`,
    },
  ]);
  rows.push([{ text: "⬅️ Back", callback_data: "menu:main" }]);
  return { inline_keyboard: rows };
}

function scanMenuKeyboard() {
  const paused = settings.getBool("SCAN_PAUSED");
  return {
    inline_keyboard: [
      [{
        text: paused ? "▶️ Resume Scanning" : "⏸ Pause Scanning",
        callback_data: "toggle:SCAN_PAUSED",
      }],
      [{ text: `Poll: ${settings.getNum("POLL_INTERVAL_MS") / 1000}s — Edit`, callback_data: "edit:POLL_INTERVAL_MS" }],
      [{ text: "⬅️ Back", callback_data: "menu:main" }],
    ],
  };
}

function fmtVal(spec, v) {
  if (spec.field.endsWith("_USD")) return fmtUsd(v);
  if (spec.field === "POLL_INTERVAL_MS") return `${v / 1000}s`;
  if (spec.field.endsWith("_PCT")) return `${v}%`;
  if (spec.field === "MIN_BUY_RATIO_H1") return v.toFixed(2);
  return String(v);
}

// ----- Senders -----

async function sendMainMenu(chatId, messageId = null) {
  const text = "🤖 *Sniper Bot Menu*\n\nPick a section:";
  await sendOrEdit(chatId, messageId, text, mainMenuKeyboard());
}

async function sendFiltersMenu(chatId, messageId = null) {
  const text = "⚙️ *Filter Thresholds*\n\nTap any filter to change its value\\.";
  await sendOrEdit(chatId, messageId, text, filtersMenuKeyboard());
}

async function sendSafetyMenu(chatId, messageId = null) {
  const text = "🛡 *Safety Requirements*\n\nTap to toggle on/off\\.";
  await sendOrEdit(chatId, messageId, text, safetyMenuKeyboard());
}

async function sendScanMenu(chatId, messageId = null) {
  const text = "⏯ *Scan Control*";
  await sendOrEdit(chatId, messageId, text, scanMenuKeyboard());
}

async function sendStatsMenu(chatId, messageId = null) {
  const now = Date.now();
  const day = now - 24 * 60 * 60 * 1000;
  const week = now - 7 * 24 * 60 * 60 * 1000;
  const dayCount = settings.alertCountSince(day);
  const weekCount = settings.alertCountSince(week);
  const recent = settings.alertsSince(day).slice(0, 5);

  const lines = [
    "📊 *Stats*",
    "",
    `*Alerts last 24h:* ${dayCount}`,
    `*Alerts last 7d:* ${weekCount}`,
    "",
    "*Last 5 alerts:*",
  ];
  if (recent.length === 0) {
    lines.push("_None yet_");
  } else {
    for (const a of recent) {
      const ago = Math.round((now - a.alerted_at) / 60_000);
      lines.push(`• ${escapeMd(a.symbol || "?")} \\(${escapeMd(fmtUsd(a.mc))}\\) — ${ago}m ago`);
    }
  }

  await sendOrEdit(chatId, messageId, lines.join("\n"), {
    inline_keyboard: [[{ text: "⬅️ Back", callback_data: "menu:main" }]],
  });
}

async function sendResetConfirm(chatId, messageId = null) {
  const text = "♻️ *Reset all settings to defaults?*";
  await sendOrEdit(chatId, messageId, text, {
    inline_keyboard: [
      [{ text: "✅ Yes, reset", callback_data: "do:reset" }],
      [{ text: "❌ Cancel", callback_data: "menu:main" }],
    ],
  });
}

async function sendOrEdit(chatId, messageId, text, keyboard) {
  if (!bot) return;
  try {
    if (messageId) {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "MarkdownV2",
        reply_markup: keyboard,
      });
    } else {
      await bot.sendMessage(chatId, text, {
        parse_mode: "MarkdownV2",
        reply_markup: keyboard,
      });
    }
  } catch (e) {
    // editMessageText fails if content is identical — ignore that case
    if (!String(e.message).includes("message is not modified")) {
      console.error("[telegram] sendOrEdit error:", e.message);
    }
  }
}

// ----- Edit flow -----

async function promptEdit(chatId, messageId, field) {
  const spec = findEditable(field);
  if (!spec) return;
  const current = settings.getNum(field);
  pendingEdits.set(chatId, spec);

  const text = `✏️ *Editing:* ${escapeMd(spec.label)}\n\n*Current:* ${escapeMd(fmtVal(spec, current))}\n\nReply with the new value\\. Send /cancel to abort\\.`;
  await sendOrEdit(chatId, messageId, text, {
    inline_keyboard: [[{ text: "❌ Cancel", callback_data: "menu:main" }]],
  });
}

async function handleEditReply(chatId, text) {
  const spec = pendingEdits.get(chatId);
  if (!spec) return false;

  if (text.trim() === "/cancel") {
    pendingEdits.delete(chatId);
    await bot.sendMessage(chatId, "Cancelled.");
    await sendMainMenu(chatId);
    return true;
  }

  let value;
  if (spec.kind === "int") {
    value = parseInt(text.replace(/[$,_\s]/g, ""), 10);
    if (!Number.isFinite(value)) {
      await bot.sendMessage(chatId, "❌ Not a valid integer. Try again or /cancel.");
      return true;
    }
  } else {
    value = parseFloat(text.replace(/[$,_\s]/g, ""));
    if (!Number.isFinite(value)) {
      await bot.sendMessage(chatId, "❌ Not a valid number. Try again or /cancel.");
      return true;
    }
  }

  if (spec.min !== undefined && value < spec.min) {
    await bot.sendMessage(chatId, `❌ Min allowed is ${spec.min}. Try again or /cancel.`);
    return true;
  }
  if (spec.max !== undefined && value > spec.max) {
    await bot.sendMessage(chatId, `❌ Max allowed is ${spec.max}. Try again or /cancel.`);
    return true;
  }

  settings.setNum(spec.field, value);
  pendingEdits.delete(chatId);

  await bot.sendMessage(
    chatId,
    `✅ *${escapeMd(spec.label)}* set to *${escapeMd(fmtVal(spec, value))}*`,
    { parse_mode: "MarkdownV2" }
  );
  await sendMainMenu(chatId);
  return true;
}

// ----- Callback router -----

async function handleCallback(query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  if (!isAuthorized(chatId)) {
    await bot.answerCallbackQuery(query.id, { text: "Unauthorized." });
    return;
  }

  await bot.answerCallbackQuery(query.id);

  if (data === "menu:main") return sendMainMenu(chatId, messageId);
  if (data === "menu:filters") return sendFiltersMenu(chatId, messageId);
  if (data === "menu:safety") return sendSafetyMenu(chatId, messageId);
  if (data === "menu:scan") return sendScanMenu(chatId, messageId);
  if (data === "menu:stats") return sendStatsMenu(chatId, messageId);
  if (data === "menu:reset_confirm") return sendResetConfirm(chatId, messageId);

  if (data === "do:reset") {
    settings.resetAll();
    await bot.sendMessage(chatId, "♻️ All settings reset to defaults.");
    return sendMainMenu(chatId, messageId);
  }

  if (data.startsWith("edit:")) {
    const field = data.slice(5);
    return promptEdit(chatId, messageId, field);
  }

  if (data.startsWith("toggle:")) {
    const field = data.slice(7);
    const current = settings.getBool(field);
    settings.setBool(field, !current);
    // Re-render the menu the toggle was in
    if (field === "SCAN_PAUSED") return sendScanMenu(chatId, messageId);
    return sendSafetyMenu(chatId, messageId);
  }
}

// ----- Public API -----

export function initTelegramMenu() {
  if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) {
    console.warn("[telegram] Token or chat ID missing — menu disabled.");
    return null;
  }
  bot = new TelegramBot(CONFIG.TELEGRAM_BOT_TOKEN, { polling: true });

  bot.on("callback_query", (q) => {
    handleCallback(q).catch((e) => console.error("[telegram] callback error:", e.message));
  });

  bot.on("message", async (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    const text = msg.text || "";

    // If we're awaiting an edit reply, handle it first
    if (pendingEdits.has(msg.chat.id)) {
      const handled = await handleEditReply(msg.chat.id, text);
      if (handled) return;
    }

    if (text === "/start" || text === "/menu" || text === "/settings") {
      await sendMainMenu(msg.chat.id);
    } else if (text === "/stats") {
      await sendStatsMenu(msg.chat.id);
    } else if (text === "/help") {
      await bot.sendMessage(
        msg.chat.id,
        "Commands:\n/menu — main settings menu\n/stats — show alert stats\n/cancel — abort an edit"
      );
    }
  });

  bot.on("polling_error", (e) => {
    // Don't crash on transient network errors
    console.error("[telegram] polling error:", e.message);
  });

  return bot;
}

// Used by index.js for outbound alerts (alongside menu)
export async function sendAlert({ pair, rug, evalData }) {
  const sym = pair.baseToken?.symbol || "?";
  const name = pair.baseToken?.name || "?";
  const mint = pair.baseToken?.address || "?";
  const dex = pair.dexId || "?";
  const ageMin = evalData.ageMin?.toFixed(1) ?? "?";

  const lines = [
    `🚀 *${escapeMd(sym)}* — ${escapeMd(name)}`,
    ``,
    `📍 \`${escapeMd(mint)}\``,
    ``,
    `*Age:* ${escapeMd(ageMin)}m  *DEX:* ${escapeMd(dex)}`,
    `*MC:* ${escapeMd(fmtUsd(evalData.mc))}  *Liq:* ${escapeMd(fmtUsd(evalData.liq))}`,
    `*Vol 1h:* ${escapeMd(fmtUsd(evalData.volH1))}  *Buys/Sells:* ${evalData.buys}/${evalData.sells}`,
  ];

  if (rug) {
    lines.push(
      `*Holders:* ${rug.holders ?? "?"}  *Top:* ${rug.topHolderPct?.toFixed(1) ?? "?"}%  *Top10:* ${rug.top10Pct?.toFixed(1) ?? "?"}%`,
      `*Safety:* mint ${rug.mintRevoked ? "✅" : "❌"}  freeze ${rug.freezeRevoked ? "✅" : "❌"}  LP ${rug.lpLockedOrBurned ? "✅" : "❌"}`,
      `*RugCheck score:* ${rug.score ?? "?"}`,
    );
  }

  lines.push(
    ``,
    `[DexScreener](https://dexscreener.com/solana/${mint}) \\| [RugCheck](https://rugcheck.xyz/tokens/${mint}) \\| [Birdeye](https://birdeye.so/token/${mint}?chain=solana)`,
  );

  const text = lines.join("\n");

  if (!bot) {
    console.log("[alert]\n" + text.replace(/\\/g, ""));
    return;
  }

  try {
    await bot.sendMessage(CONFIG.TELEGRAM_CHAT_ID, text, {
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    });
    // Record alert in history for /stats
    settings.recordAlertHistory(mint, sym, evalData.mc, evalData.liq);
  } catch (e) {
    console.error("[telegram] send alert failed:", e.message);
  }
}

export async function sendStartupPing() {
  if (!bot) return;
  try {
    await bot.sendMessage(
      CONFIG.TELEGRAM_CHAT_ID,
      "🟢 Sniper bot online. Send /menu to open settings.",
    );
  } catch (e) {
    console.error("[telegram] startup ping failed:", e.message);
  }
}

