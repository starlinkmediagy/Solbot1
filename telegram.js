import TelegramBot from "node-telegram-bot-api";
import { CONFIG } from "./config.js";

let bot = null;

export function initTelegram() {
  if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) {
    console.warn("[telegram] Token or chat ID missing — alerts will be logged to console only.");
    return null;
  }
  // polling: false because we're a push-only bot, not handling user commands
  bot = new TelegramBot(CONFIG.TELEGRAM_BOT_TOKEN, { polling: false });
  return bot;
}

function escapeMd(s) {
  // Telegram MarkdownV2 requires escaping these characters.
  return String(s).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function fmtUsd(n) {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

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
  } catch (e) {
    console.error("[telegram] send failed:", e.message);
  }
}

export async function sendStartupPing() {
  if (!bot) return;
  try {
    await bot.sendMessage(
      CONFIG.TELEGRAM_CHAT_ID,
      "🟢 Sniper bot online. Scanning Solana for new launches…",
    );
  } catch (e) {
    console.error("[telegram] startup ping failed:", e.message);
  }
}
