const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'quickchat-platform-pitch.html');
const content = fs.readFileSync(filePath, 'utf8');

const imgMatches = [...content.matchAll(/<img[^>]*src="([^"]*)"[^>]*>/g)];
console.log('Total img tags:', imgMatches.length);
imgMatches.forEach((m, idx) => {
  const full = m[0];
  const src = m[1];
  console.log(`Image ${idx + 1}: ${full.slice(0, 100)}... length=${src.length}`);
});
