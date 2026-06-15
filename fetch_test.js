const fs = require('fs');

async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: '123' })
    });
    const text = await res.text();
    fs.writeFileSync('error_dump.html', text);
    console.log("Status:", res.status);
    console.log("Response saved to error_dump.html");
  } catch (e) {
    console.error("Fetch failed", e);
  }
}
test();
