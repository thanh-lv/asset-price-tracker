const { Telegraf } = require('telegraf');
require('dotenv').config();
const {
  fetchAndSavePrices, getLatestPrices,
  fetchAndSaveCryptoPrices, getLatestCryptoPrices
} = require('./priceService');

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

// // /price - gold & silver
// bot.command('price', async (ctx) => {
//   try {
//     ctx.reply('📈 Đang lấy thông tin giá vàng/bạc mới nhất...');
//     let prices = await getLatestPrices();

//     if (!prices || prices.length === 0) {
//       await fetchAndSavePrices();
//       prices = await getLatestPrices();
//     }

//     if (!prices || prices.length === 0) {
//       return ctx.reply('❌ Không tìm thấy thông tin giá. Vui lòng thử lệnh /sync trước.');
//     }

//     let message = '🔔 *BẢNG GIÁ VÀNG & BẠC (PHÚ QUÝ)*\n\n';
//     prices.forEach(p => {
//       const changeSign = p.price_change_percent >= 0 ? '+' : '';
//       message += `📌 *${p.name}* (${p.unit_name})\n`;
//       message += `🔹 Mua vào: \`${formatVND(p.buy_price)}\`\n`;
//       message += `🔸 Bán ra: \`${formatVND(p.sell_price)}\`\n`;
//       message += `📊 Biến động: \`${changeSign}${p.price_change_percent}%\`\n\n`;
//     });

//     const time = new Date(prices[0].created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
//     message += `🕒 _Cập nhật lúc: ${time}_`;

//     await ctx.replyWithMarkdown(message);
//   } catch (error) {
//     console.error('Error handling /price:', error.message);
//     ctx.reply(`❌ Lỗi: ${error.message}`);
//   }
// });

// // /crypto - BTC & ETH
// bot.command('crypto', async (ctx) => {
//   try {
//     ctx.reply('₿ Đang lấy thông tin giá BTC & ETH mới nhất...');
//     let prices = await getLatestCryptoPrices();

//     if (!prices || prices.length === 0) {
//       await fetchAndSaveCryptoPrices();
//       prices = await getLatestCryptoPrices();
//     }

//     if (!prices || prices.length === 0) {
//       return ctx.reply('❌ Không tìm thấy thông tin giá crypto. Vui lòng thử lệnh /sync trước.');
//     }

//     let message = '🪙 *BẢNG GIÁ CRYPTO*\n\n';
//     prices.forEach(p => {
//       message += `📌 *${p.name}*\n`;
//       message += `💵 Giá: \`${formatUSD(p.buy_price)}\`\n\n`;
//     });

//     const time = new Date(prices[0].created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
//     message += `🕒 _Cập nhật lúc: ${time}_\n`;
//     message += `_Nguồn: CoinGecko_`;

//     await ctx.replyWithMarkdown(message);
//   } catch (error) {
//     console.error('Error handling /crypto:', error.message);
//     ctx.reply(`❌ Lỗi: ${error.message}`);
//   }
// });

// // /sync - sync all prices
// bot.command('sync', async (ctx) => {
//   try {
//     ctx.reply('🔄 Đang đồng bộ tất cả giá mới nhất vào database...');
//     await Promise.all([fetchAndSavePrices(), fetchAndSaveCryptoPrices()]);
//     ctx.reply('✅ Đồng bộ thành công!\n/price - xem giá vàng/bạc\n/crypto - xem giá BTC & ETH');
//   } catch (error) {
//     console.error('Error handling /sync:', error.message);
//     ctx.reply(`❌ Lỗi đồng bộ: ${error.message}`);
//   }
// });

bot.telegram.sendMessage(process.env.ALERT_CHAT_ID, 'Hello, this is a direct message!');

// Start the bot
bot.launch().then(() => {
  console.log('🚀 Telegram bot is successfully running...');
});

// Background job: fetch all prices every 30 minutes
const THIRTY_MINUTES = 30 * 60 * 1000;
setInterval(async () => {
  try {
    console.log('Running scheduled background fetch...');
    await Promise.all([fetchAndSavePrices(), fetchAndSaveCryptoPrices()]);
  } catch (error) {
    console.error('Scheduled background fetch failed:', error.message);
  }
}, THIRTY_MINUTES);

// Initial fetch on startup
setTimeout(async () => {
  try {
    console.log('Running initial startup fetch...');
    await Promise.all([fetchAndSavePrices(), fetchAndSaveCryptoPrices()]);
  } catch (error) {
    console.error('Initial startup fetch failed:', error.message);
  }
}, 5000);

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
