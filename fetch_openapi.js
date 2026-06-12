const fs = require('fs');
const path = require('path');
const https = require('https');

const envFile = fs.readFileSync(path.resolve(__dirname, '.env.local'), 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1]] = match[2].replace(/\r$/, '');
  }
});

const url = new URL(env['NEXT_PUBLIC_SUPABASE_URL'] + '/rest/v1/');

const options = {
  hostname: url.hostname,
  path: url.pathname,
  method: 'GET',
  headers: {
    'apikey': env['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    'Authorization': 'Bearer ' + env['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    'Accept': 'application/openapi+json'
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const openapi = JSON.parse(data);
      // look for box_status or boxes table definition
      const boxes = openapi.definitions && openapi.definitions.boxes;
      if (boxes) {
        console.log("Boxes schema:", JSON.stringify(boxes.properties.status, null, 2));
      } else {
        console.log("Could not find boxes definition.");
      }
      // search globally for box_status
      console.log("Full definitions keys:", Object.keys(openapi.definitions || {}));
      
    } catch(e) {
      console.error(e);
      console.log(data.substring(0, 500));
    }
  });
});

req.end();
