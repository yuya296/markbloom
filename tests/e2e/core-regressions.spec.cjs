const { expect, test } = require("@playwright/test");

test("markdown semantics exposes heading ids and link href metadata", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".cm-line#webview-demo-sample")).toHaveCount(1);
  await expect(
    page.locator('.cm-content [data-href="#webview-demo-sample"]').first()
  ).toBeVisible();
  await expect(
    page.locator('.cm-content [data-href="#links-and-images"]').first()
  ).toBeVisible();
});
