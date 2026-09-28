const fs = require('fs');
const path = require('path');

const targets = [
  { src: 'manga/index.json', dest: 'manga/index.min.json', label: 'manga' },
  { src: 'media/index.json', dest: 'media/index.min.json', label: 'media' },
];

let allOk = true;
for (const { src, dest, label } of targets) {
  try {
    const raw = fs.readFileSync(path.join(__dirname, src), 'utf8');
    const data = JSON.parse(raw);
    const minified = JSON.stringify(data);
    fs.writeFileSync(path.join(__dirname, dest), minified, 'utf8');
    console.log(`✅ [${label}] index.min.json generated (${data.length} sources, ${minified.length} bytes)`);
  } catch (e) {
    console.error(`❌ [${label}] Build failed:`, e.message);
    allOk = false;
  }
}
if (!allOk) process.exit(1);