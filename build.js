const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'index.json');
const dest = path.join(__dirname, 'index.min.json');

try {
  const raw = fs.readFileSync(src, 'utf8');
  const data = JSON.parse(raw);
  const minified = JSON.stringify(data);
  fs.writeFileSync(dest, minified, 'utf8');
  console.log(`✅ index.min.json generated (${data.length} sources, ${minified.length} bytes)`);
} catch (e) {
  console.error('❌ Build failed:', e.message);
  process.exit(1);
}
