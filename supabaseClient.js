const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn('⚠️ Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env');
}

// Use service role key to bypass Row Level Security (RLS) - server-side only
const supabase = createClient(supabaseUrl || '', supabaseServiceRoleKey || '');

module.exports = { supabase };

