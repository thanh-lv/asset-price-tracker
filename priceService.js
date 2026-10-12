const { supabase } = require('./supabaseClient');

// Bảng giá công khai của Phú Quý (HTML). API cũ be.phuquy.com.vn đã bị Cloudflare chặn.
const PRICE_PAGE_URL = process.env.PHUQUY_PRICE_PAGE_URL || 'https://phuquygroup.vn/';
// Tên dòng bạc trên bảng giá -> tên đang lưu trong database
const SILVER_ROW_PREFIX = 'Bạc thỏi Phú Quý 999';
const SILVER_DB_NAME = 'Bạc PQ';
const PHUQUY_BRAND_ID = 1;

// Bảo Tín Mạnh Hải: API GraphQL công khai mà trang bang-gia-vang đang dùng
const BTMH_API_URL = process.env.BTMH_API_URL || 'https://baotinmanhhai.vn/api/graphql';
const BTMH_BRAND_ID = 2;
// Mã sản phẩm vàng cần theo dõi (KGB = Kim Gia Bảo 24K), nhiều mã thì cách nhau bằng dấu phẩy
const BTMH_RATE_CODES = (process.env.BTMH_RATE_CODES || 'KGB')
  .split(',').map(code => code.trim()).filter(Boolean);
const BTMH_GOLD_RATES_QUERY = `
  query GetGoldRates($rate_codes: [String!]) {
    goldRates(rate_codes: $rate_codes) {
      items { code name buy_price sell_price unit last_updated }
    }
  }
`;
const COIN_MARKET_CAP_API_URL = 'https://pro-api.coinmarketcap.com/v1/simple/price?ids=';

// Giải mã HTML entity (vd: "Ph&#250; Qu&#253;" -> "Phú Quý") và bỏ thẻ HTML
function cellText(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// "210,500" -> 210500
function parsePrice(text) {
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

/**
 * Lấy giá bạc Phú Quý (VNĐ/chỉ) từ bảng giá HTML.
 */
function parseSilverPrice(html) {
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map(cellText);
    if (cells.length < 3 || !cells[0].startsWith(SILVER_ROW_PREFIX)) continue;

    const buyPrice = parsePrice(cells[1]);
    const sellPrice = parsePrice(cells[2]);
    if (buyPrice === null || sellPrice === null) {
      throw new Error(`Silver row found but prices are missing: ${cells.join(' | ')}`);
    }
    return { buyPrice, sellPrice };
  }
  throw new Error(`Silver row "${SILVER_ROW_PREFIX}" not found on ${PRICE_PAGE_URL}`);
}

/**
 * So sánh với giá đang lưu của một brand và chỉ insert/update những dòng
 * mới hoặc có giá mua/bán thay đổi. Trả về các dòng đã được ghi.
 */
async function saveChangedPrices(brandId, rowsToInsert) {
  // Lấy dữ liệu hiện tại từ database để so sánh
  const { data: existingPrices, error: fetchError } = await supabase
    .from('asset_prices')
    .select('name, buy_price, sell_price')
    .eq('brand_id', brandId);

  if (fetchError) {
    console.warn('Could not fetch existing prices, will attempt to upsert all:', fetchError.message);
  }

  // Chỉ lấy ra những bản ghi mới hoặc có sự thay đổi về giá
  const rowsToUpsert = rowsToInsert.filter(row => {
    if (!existingPrices) return true;
    const existing = existingPrices.find(e => e.name === row.name);
    // Trả về true nếu chưa có trong DB, hoặc giá mua/bán thay đổi
    return !existing || existing.buy_price !== row.buy_price || existing.sell_price !== row.sell_price;
  });

  const updatedRows = [];

  // Cập nhật hoặc thêm mới từng dòng dựa trên việc nó đã tồn tại trong DB chưa
  if (rowsToUpsert.length > 0) {
    for (const row of rowsToUpsert) {
      // Kiểm tra xem bản ghi đã có trong existingPrices hay chưa
      const isExisting = existingPrices && existingPrices.some(e => e.name === row.name);

      let query = supabase.from('asset_prices');
      if (isExisting) {
        // Nếu đã tồn tại, dùng update kết hợp với eq (tương đương where)
        query = query.update(row).eq('brand_id', brandId).eq('name', row.name);
      } else {
        // Nếu chưa tồn tại, dùng insert
        query = query.insert(row);
      }

      const { data, error } = await query.select();

      if (error) {
        console.error(`Error ${isExisting ? 'updating' : 'inserting'} row ${row.name}:`, error.message);
        continue;
      }
      if (data && data.length > 0) {
        updatedRows.push(data[0]);
      }
    }
  }

  return updatedRows;
}

/**
 * Fetches the current silver price from the Phu Quy price board
 * and inserts/updates it in the Supabase database.
 */
async function fetchAndSaveOrUpdatePrices() {
  try {
    const response = await fetch(PRICE_PAGE_URL);
    if (!response.ok) {
      throw new Error(`Phu Quy price page responded with status ${response.status}`);
    }
    const { buyPrice, sellPrice } = parseSilverPrice(await response.text());

    const rowsToInsert = [{
      name: SILVER_DB_NAME,
      buy_price: buyPrice,
      sell_price: sellPrice,
      price_change_percent: null,   // bảng giá HTML không có % thay đổi
      unit_name: 'Chỉ',
      price_source: PRICE_PAGE_URL,
      brand_id: PHUQUY_BRAND_ID,
      updated_at: new Date().toISOString()
    }];

    const updatedRows = await saveChangedPrices(PHUQUY_BRAND_ID, rowsToInsert);

    console.log(`[${new Date().toISOString()}] Successfully saved/updated ${updatedRows.length} price records to Supabase.`);
    return updatedRows;
  } catch (error) {
    console.error('Error in fetchAndSaveOrUpdatePrices:', error.message);
    throw error;
  }
}

/**
 * Fetches the tracked gold prices (VNĐ/chỉ) from the Bao Tin Manh Hai API
 * and inserts/updates them in the Supabase database.
 */
async function fetchAndSaveOrUpdateBtmhPrices() {
  try {
    const response = await fetch(BTMH_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: BTMH_GOLD_RATES_QUERY,
        variables: { rate_codes: BTMH_RATE_CODES }
      })
    });
    if (!response.ok) {
      throw new Error(`BTMH API responded with status ${response.status}`);
    }
    const result = await response.json();
    const items = result.data?.goldRates?.items;
    if (result.errors || !Array.isArray(items)) {
      throw new Error(`Invalid API response format: ${result.errors?.[0]?.message || 'Unknown error'}`);
    }

    const rowsToInsert = items
      // API trả sell_price = 0 hoặc 1 cho sản phẩm không niêm yết giá bán
      .filter(item => BTMH_RATE_CODES.includes(item.code) && item.buy_price > 1 && item.sell_price > 1)
      .map(item => ({
        name: (item.name || item.code).trim(),
        buy_price: item.buy_price,
        sell_price: item.sell_price,
        price_change_percent: null,   // API chỉ trả mức thay đổi theo VNĐ, không có %
        unit_name: 'Chỉ',
        price_source: BTMH_API_URL,
        brand_id: BTMH_BRAND_ID,
        updated_at: new Date().toISOString()
      }));
    if (rowsToInsert.length === 0) {
      throw new Error(`No prices returned for codes: ${BTMH_RATE_CODES.join(', ')}`);
    }

    const updatedRows = await saveChangedPrices(BTMH_BRAND_ID, rowsToInsert);

    console.log(`[${new Date().toISOString()}] Successfully saved/updated ${updatedRows.length} BTMH price records to Supabase.`);
    return updatedRows;
  } catch (error) {
    console.error('Error in fetchAndSaveOrUpdateBtmhPrices:', error.message);
    throw error;
  }
}

/**
 * Retrieves the latest saved prices from Supabase.
 */
async function getLatestPrices() {
  try {
    const { data, error } = await supabase
      .from('asset_prices')
      .select('*')
      .eq('name', 'Bạc PQ');

    if (error) {
      throw error;
    }
    return data;
  } catch (error) {
    console.error('Error in getLatestPrices:', error.message);
    throw error;
  }
}

/**
 * Fetches BTC and ETH prices from CoinGecko API
 * and inserts them into the Supabase database.
 */
async function fetchAndSaveCryptoPrices() {
  try {
    const response = await fetch(COIN_MARKET_CAP_API_URL);
    if (!response.ok) {
      throw new Error(`CoinGecko API responded with status ${response.status}`);
    }
    const result = await response.json();

    const now = new Date().toISOString();
    const rowsToInsert = [
      {
        name: 'Bitcoin (BTC)',
        buy_price: result.bitcoin.usd,
        sell_price: result.bitcoin.usd,
        price_change_percent: null,   // CoinGecko simple price API does not return % change
        unit_name: 'USD',
        price_source: COIN_MARKET_CAP_API_URL,
        brand_id: 2,
        updated_at: now
      }
    ];

    const { data, error } = await supabase
      .from('asset_prices')
      .insert(rowsToInsert)
      .select();

    if (error) {
      throw error;
    }

    console.log(`[${new Date().toISOString()}] Successfully saved ${rowsToInsert.length} crypto price records to Supabase.`);
    return data;
  } catch (error) {
    console.error('Error in fetchAndSaveCryptoPrices:', error.message);
    throw error;
  }
}

/**
 * Retrieves the latest saved crypto prices from Supabase.
 */
async function getLatestCryptoPrices() {
  try {
    const { data, error } = await supabase
      .from('asset_prices')
      .select('*')
      .eq('unit_name', 'USD')
      .order('created_at', { ascending: false })
      .limit(2);

    if (error) {
      throw error;
    }
    return data;
  } catch (error) {
    console.error('Error in getLatestCryptoPrices:', error.message);
    throw error;
  }
}

module.exports = {
  fetchAndSaveOrUpdatePrices,
  fetchAndSaveOrUpdateBtmhPrices,
  getLatestPrices,
  fetchAndSaveCryptoPrices,
  getLatestCryptoPrices
};
