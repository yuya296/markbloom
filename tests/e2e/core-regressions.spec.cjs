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

test("task checkbox is large enough and toggles checked state", async ({ page }) => {
  await page.goto("/");

  await page.locator(".cm-content").click();
  await page.mouse.wheel(0, 8000);

  const taskCheckbox = page.locator(".cm-lp-task-checkbox-input").first();
  await expect(taskCheckbox).toBeVisible();

  const box = await taskCheckbox.boundingBox();
  if (!box) {
    throw new Error("Failed to resolve checkbox bounding box");
  }
  expect(box.width).toBeGreaterThanOrEqual(16);
  expect(box.height).toBeGreaterThanOrEqual(16);

  const initiallyChecked = await taskCheckbox.isChecked();
  await taskCheckbox.click();
  if (initiallyChecked) {
    await expect(taskCheckbox).not.toBeChecked();
  } else {
    await expect(taskCheckbox).toBeChecked();
  }

  await taskCheckbox.click();
  if (initiallyChecked) {
    await expect(taskCheckbox).toBeChecked();
  } else {
    await expect(taskCheckbox).not.toBeChecked();
  }
});
