const { Telegraf } = require('telegraf');
const { supabase } = require('./supabaseClient');
const { fetchAndSavePrices, getLatestPrices, fetchAndSaveCryptoPrices, getLatestCryptoPrices } = require('./priceService');

require('dotenv').config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not defined in environment variables.');
  console.error('Please create a .env file and set TELEGRAM_BOT_TOKEN.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Helper: format VND
function formatVND(amount) {
  if (amount === undefined || amount === null) return 'N/A';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

// Helper: format USD
function formatUSD(amount) {
  if (amount === undefined || amount === null) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// /start
bot.start((ctx) => {
  ctx.reply('👋 Xin chào! Chào mừng đến với Asset Price Tracker Bot!\nSử dụng /help để xem danh sách lệnh.');
});

// /help
bot.help((ctx) => {
  ctx.reply(
    'Danh sách lệnh khả dụng:\n' +
    '/start - Bắt đầu sử dụng bot\n' +
    '/help - Xem hướng dẫn này\n' +
    '/price - Xem giá vàng & bạc mới nhất (Phú Quý)\n' +
    '/crypto - Xem giá BTC & ETH mới nhất\n' +
    '/sync - Đồng bộ tất cả giá mới nhất vào database'
  );
});

// Start the bot
bot.launch().then(() => {
  console.log('🚀 Telegram bot is successfully running...');
});

// Background job: fetch all prices every 30 minutes
const ONE_MINUTE = 1 * 60 * 1000;
setInterval(async () => {
  try {
    console.log('Running scheduled background fetch...');
    await Promise.all([fetchAndSavePrices()]);
    const prices = await getLatestPrices();
    bot.telegram.sendMessage(process.env.ALERT_CHAT_ID, `
    🟡 BẢNG GIÁ VÀNG CẬP NHẬT

    ⏰ Thời gian: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}

    ━━━━━━━━━━━━━━
    🥇 ${prices[0].name}
    🔻 Mua vào: ${formatVND(prices[0].buy_price * 10)} VNĐ/lượng
    🔺 Bán ra:  ${formatVND(prices[0].sell_price * 10)} VNĐ/lượng
    ━━━━━━━━━━━━━━
`);
 
  } catch (error) {
    console.error('Scheduled background fetch failed:', error.message);
  }
}, ONE_MINUTE);

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
