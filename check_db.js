const fs = require('fs');
const https = require('https');
const env = fs.readFileSync('.env.local', 'utf8').split('\n');
const url = env.find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')).split('=')[1].trim();
const key = env.find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')).split('=')[1].trim();

const options = {
  hostname: url.replace('https://', ''),
  path: '/rest/v1/?apikey=' + key,
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + key
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const defs = JSON.parse(data).definitions;
      console.log(Object.keys(defs.agendas.properties));
    } catch(e) { console.log(data); }
  });
});
req.end();
