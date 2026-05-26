const { Telegraf } = require("telegraf");
const express = require("express");
const cors = require("cors");
const {
  fetchAndSaveOrUpdatePrices,
  getLatestPrices,
} = require("./priceService");
const { supabase } = require("./supabaseClient");

require("dotenv").config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error(
    "Error: TELEGRAM_BOT_TOKEN is not defined in environment variables.",
  );
  console.error("Please create a .env file and set TELEGRAM_BOT_TOKEN.");
  process.exit(1);
}

/**
 * =========================
 * EXPRESS API
 * =========================
 */

const app = express();

app.use(cors());
app.use(express.json());

// Test API
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Asset Price Tracker API is running",
  });
});

// API: lấy giá vàng/bạc mới nhất
app.get("/api/prices/latest", async (req, res) => {
  try {
    const prices = await getLatestPrices();
    console.log("ping from thang-nm");
    return res.json({
      success: true,
      data: prices,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Start Express API
app.listen(PORT, () => {
  console.log(`🌐 API server is running on port ${PORT}`);
});

/**
 * =========================
 * TELEGRAM BOT
 * =========================
 */

const bot = new Telegraf(BOT_TOKEN);

// Helper: format VND
function formatVND(amount) {
  if (amount === undefined || amount === null) return "N/A";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount);
}

// Helper: format USD
function formatUSD(amount) {
  if (amount === undefined || amount === null) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

// In bot.js
bot.start(async (ctx) => {
  const chatId = ctx.from.id;
  const { data, error } = await supabase
    .from("telegram_chats")
    .select("telegram_chat_id")
    .eq("telegram_chat_id", chatId)
    .single();

  if (!data) {
    const { error: insertError } = await supabase
      .from("telegram_chats")
      .insert({ telegram_chat_id: chatId, created_at: new Date() });
    if (insertError) console.error(insertError);
  }

  ctx.reply("👋 Xin chào! Chào mừng đến với Asset Price Tracker Bot!");
});

// // /help
// bot.help((ctx) => {
//   ctx.reply(
//     "Danh sách lệnh khả dụng:\n" +
//       "/start - Bắt đầu sử dụng bot\n" +
//       "/help - Xem hướng dẫn này\n" +
//       "/price - Xem giá vàng & bạc mới nhất (Phú Quý)\n" +
//       "/crypto - Xem giá BTC & ETH mới nhất\n" +
//       "/sync - Đồng bộ tất cả giá mới nhất vào database",
//   );
// });

// Start the bot
bot.launch().then(() => {
  console.log("🚀 Telegram bot is successfully running...");
});

// Background job: fetch all prices every 1 minute
const ONE_MINUTE = 1 * 60 * 1000;

async function broadcastMessage(messageText) {
  const { data: users = [], error } = await supabase
    .from("telegram_chats")
    .select("telegram_chat_id");
  if (error) {
    console.error("Failed to fetch users from Supabase:", error);
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const user of users) {
    const chatId = user.telegram_chat_id;
    try {
      await bot.telegram.sendMessage(chatId, messageText);
      successCount++;

      // IMPORTANT: Add a small delay to respect Telegram's rate limits
      // (Telegram allows ~30 messages per second, but 1 message per second is safer for large lists)
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (error) {
      console.error(`Failed to send message to ${chatId}:`, error.message);
      failCount++;
      // This happens if the user blocks the bot or deletes their account.
      // You might want to remove this chatId from your database here.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(
    `Broadcast finished. Success: ${successCount}, Failed: ${failCount}`,
  );
}

setInterval(async () => {
  try {
    console.log("Running scheduled background fetch...");

    const updatedRows = await fetchAndSaveOrUpdatePrices();
    const prices = await getLatestPrices();

    if (updatedRows?.length && prices && prices.length > 0) {
      const message = `
⏰ Thời gian: ${new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
      })}
🥇 ${prices[0].name}
🔻 Mua vào: ${formatVND(prices[0].buy_price * 10)} VNĐ/lượng
🔺 Bán ra:  ${formatVND(prices[0].sell_price * 10)} VNĐ/lượng
`;
      await broadcastMessage(message);
    }
  } catch (error) {
    console.error("Scheduled background fetch failed:", error.message);
  }
}, ONE_MINUTE);

// Enable graceful stop
process.once("SIGINT", () => {
  bot.stop("SIGINT");
  process.exit(0);
});

process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  process.exit(0);
});
