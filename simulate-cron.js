const http = require('http');

console.log("Menjalankan simulasi Vercel Cron secara lokal...");
console.log("Script ini akan memanggil /api/push/cron setiap detik ke-0 pada setiap menit (seperti Vercel Cron aktual).");
console.log("Pastikan server utama Next.js (npm run dev) sedang berjalan di port 3000.");
console.log("Tekan Ctrl+C untuk berhenti.\n");

function hitCron() {
    const now = new Date();
    // Hit only on the 0th second of every minute
    if (now.getSeconds() === 0) {
        console.log(`[${now.toLocaleTimeString()}] Memanggil background engine /api/push/cron...`);
        http.get('http://localhost:3000/api/push/cron', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => console.log('✅ Cron Result:', data));
        }).on('error', (err) => {
            console.error('❌ Gagal menghubungi localhost:3000 (Pastikan npm run dev hidup):', err.message);
        });
    }
}

// Check every second, but only fire on the exact 0th second of the minute
setInterval(hitCron, 1000);
