/**
 * =============================================================================
 *  DUK BUS TRACKER — Realtime WebSocket to Supabase Database Bridge
 * =============================================================================
 *  Listens to the ESP32 WebSocket broadcasts in real-time and automatically
 *  inserts every point into the `gps_realtime` Supabase database table.
 * =============================================================================
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://mtkdzcdzxtfjwpgnpujc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10a2R6Y2R6eHRmandwZ25wdWpjIiwi' +
  'cm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NDA5NCwiZXhwIjoyMTAw' +
  'NDcwMDk0fQ.6s-3g9eEmxTP7tYdw22xqC6scLq7f7IC_1YFdv9NAOE';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

console.log('---------------------------------------------------------');
console.log('🚀 Supabase Realtime WebSocket Bridge is RUNNING...');
console.log('📡 Listening for incoming ESP32 WebSocket broadcasts...');
console.log('---------------------------------------------------------\n');

// Subscribe to the exact channel the ESP32 broadcasts to
const channel = supabase.channel('realtime:gps_realtime');

channel
  // ── Handle GPS Coordinates ─────────────────────────────────────────
  .on('broadcast', { event: 'GPS' }, async ({ payload }) => {
    const data = payload?.payload || payload;
    const lat = data.lat;
    const lon = data.lon;
    const speed = data.speed;

    console.log(`[GPS RECEIVED] Lat: ${lat}, Lon: ${lon}, Speed: ${speed} km/h`);

    const { error } = await supabase.from('gps_realtime').insert([
      {
        lat: lat,
        lon: lon,
        speed: speed,
        event: 'GPS',
      },
    ]);

    if (error) {
      console.error('❌ Error saving to DB:', error.message);
    } else {
      console.log('✅ [SAVED TO TABLE] Row added to gps_realtime!\n');
    }
  })

  // ── Handle POWER_ON Event ──────────────────────────────────────────
  .on('broadcast', { event: 'POWER_ON' }, async () => {
    console.log('⚡ [EVENT] POWER_ON received!');
    const { error } = await supabase.from('gps_realtime').insert([
      { event: 'POWER_ON' },
    ]);
    if (!error) console.log('✅ [SAVED TO TABLE] POWER_ON logged.\n');
  })

  // ── Handle POWER_OFF Event ─────────────────────────────────────────
  .on('broadcast', { event: 'POWER_OFF' }, async () => {
    console.log('🔌 [EVENT] POWER_OFF received!');
    const { error } = await supabase.from('gps_realtime').insert([
      { event: 'POWER_OFF' },
    ]);
    if (!error) console.log('✅ [SAVED TO TABLE] POWER_OFF logged.\n');
  })

  .subscribe((status) => {
    console.log(`[SUBSCRIPTION STATUS] → ${status}`);
  });
