
export default async function run(page, ui) {
  const out = {};
  await page.goto('http://127.0.0.1:5001/register');
  await page.waitForTimeout(1500);
  out.registerSnapshot = await ui.snapshot();
  return out;
}
