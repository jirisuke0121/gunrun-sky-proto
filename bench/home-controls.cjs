// Reach a folded home control through its normal, visible summary button.
// Keep the same inputs and assertions; never force-click hidden controls.
async function revealHomeControl(page, selector) {
  const target = typeof selector === 'string' ? page.locator(selector).first() : selector;
  await target.waitFor({ state: 'attached' });
  for (const details of await target.locator('xpath=ancestor::details[not(@open)]').all()) {
    await details.locator(':scope > summary').click();
  }
}
module.exports = { revealHomeControl };
