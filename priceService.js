const { supabase } = require('./supabaseClient');

const API_URL = process.env.PHUQUY_API_URL || 'https://be.phuquy.com.vn/jewelry/product-payment-service/api/products/get-price';
const COIN_MARKET_CAP_API_URL = 'https://pro-api.coinmarketcap.com/v1/simple/price?ids=';

/**
 * Fetches the current gold and silver prices from the Phu Quy API
 * and inserts them into the Supabase database.
 */
async function fetchAndSaveOrUpdatePrices() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`Phu Quy API responded with status ${response.status}`);
    }
    const result = await response.json();
    if (result.errorCode !== "0" || !Array.isArray(result.data)) {
      throw new Error(`Invalid API response format: ${result.message || 'Unknown error'}`);
    }

    const rowsToInsert = result.data.map(item => ({
      name: (item.name || '').trim(),
      buy_price: item.buyprice,
      sell_price: item.sellprice,
      price_change_percent: item.priceChangePercent,
      unit_name: item.unit_name,
      price_source: API_URL,
      brand_id: 1,           // nullable FK - set later if brands table is populated
      updated_at: new Date().toISOString()
    }));

    // Lấy dữ liệu hiện tại từ database để so sánh
    const { data: existingPrices, error: fetchError } = await supabase
      .from('asset_prices')
      .select('name, buy_price, sell_price')
      .eq('brand_id', 1);

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

    let updatedRows = [];

    // Cập nhật hoặc thêm mới từng dòng dựa trên việc nó đã tồn tại trong DB chưa
    if (rowsToUpsert.length > 0) {
      for (const row of rowsToUpsert) {
        // Kiểm tra xem bản ghi đã có trong existingPrices hay chưa
        const isExisting = existingPrices && existingPrices.some(e => e.name === row.name);

        let query = supabase.from('asset_prices');
        if (isExisting) {
          // Nếu đã tồn tại, dùng update kết hợp với eq (tương đương where)
          query = query.update(row).eq('brand_id', 1).eq('name', row.name);
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

    console.log(`[${new Date().toISOString()}] Successfully saved/updated ${updatedRows.length} price records to Supabase.`);
    return updatedRows;
  } catch (error) {
    console.error('Error in fetchAndSaveOrUpdatePrices:', error.message);
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
  getLatestPrices,
  fetchAndSaveCryptoPrices,
  getLatestCryptoPrices
};
