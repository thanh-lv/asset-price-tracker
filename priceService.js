const { supabase } = require('./supabaseClient');

const API_URL = process.env.PHUQUY_API_URL || 'https://be.phuquy.com.vn/jewelry/product-payment-service/api/products/get-price';
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd,vnd';

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

    let updatedRows = [];
    const { data, error } = await supabase
      .from('asset_prices')
      .upsert(
        rowsToInsert.map(row => ({ ...row, brand_id: 1 })),
        { onConflict: 'brand_id, name' } // Trùng 2 trường này thì tự động Update
      )
      .select();

    if (!error && data) {
      updatedRows.push(...data);
    }

    console.log(`[${new Date().toISOString()}] Successfully saved ${updatedRows.length} price records to Supabase.`);
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
    const response = await fetch(COINGECKO_API_URL);
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
        price_source: COINGECKO_API_URL,
        brand_id: null,
        updated_at: now
      },
      {
        name: 'Ethereum (ETH)',
        buy_price: result.ethereum.usd,
        sell_price: result.ethereum.usd,
        price_change_percent: null,
        unit_name: 'USD',
        price_source: COINGECKO_API_URL,
        brand_id: null,
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
