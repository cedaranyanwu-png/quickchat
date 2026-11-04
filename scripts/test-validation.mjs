import fs from 'node:fs';

const html = fs.readFileSync('promo-video/quickchat-platform-pitch.html', 'utf8');
console.log('File size:', html.length);
console.log('Has deckStage:', html.includes('id="deckStage"'));
console.log('Slide count:', (html.match(/class="slide /g) || []).length);
console.log('Script tag count:', (html.match(/<script>/g) || []).length);
console.log('Style tag count:', (html.match(/<style>/g) || []).length);

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (scriptMatch) {
  try {
    new Function(scriptMatch[1]);
    console.log('JavaScript syntax: VALID');
  } catch(e) {
    console.error('JavaScript syntax error:', e.message);
  }
}
