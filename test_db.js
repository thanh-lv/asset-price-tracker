const { supabase } = require('./supabaseClient');

async function test() {
  try {
    const { data, error } = await supabase.from('asset_prices').select('*').limit(5);
    if (error) {
      console.error('Error fetching asset_prices:', error.message);
    } else {
      console.log('Sample asset_prices data:', data);
    }
  } catch (err) {
    console.error('Connection failed:', err.message);
  }
}
test();
