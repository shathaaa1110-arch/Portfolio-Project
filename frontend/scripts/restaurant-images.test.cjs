const test = require("node:test");
const assert = require("node:assert/strict");
const { load, render, act, plain } = require("./helpers/render-feature.cjs");
const { useRestaurantImage } = load("features/restaurants/useRestaurantImage.ts", {
  "./categoryImage": { restaurantCategoryImage: () => 42 },
}, { URL });

test("photo URLs fall back for missing, invalid and failed images and recover on URL change", async () => {
  let photo;
  function Probe({ url }) { photo = useRestaurantImage(url, ["saudi"]); return null; }
  const screen = await render(Probe);
  for (const url of [undefined, null, "", "broken", "http://example.org/a.jpg", "javascript:alert(1)", "https://user:pass@example.org/a.jpg"]) {
    await screen.update({ url });
    assert.equal(photo.source, 42);
    assert.equal(photo.illustrative, true);
  }
  await screen.update({ url: "https://example.org/a.jpg" });
  assert.deepEqual(plain(photo.source), { uri: "https://example.org/a.jpg" });
  assert.equal(photo.illustrative, false);
  await act(async () => photo.onError());
  assert.equal(photo.source, 42);
  assert.equal(photo.illustrative, true);
  await screen.update({ url: "https://example.org/b.jpg" });
  assert.equal(photo.illustrative, false);
  await screen.update({ url: "https://example.org/a.jpg" });
  assert.equal(photo.illustrative, false);
  await screen.close();
});
