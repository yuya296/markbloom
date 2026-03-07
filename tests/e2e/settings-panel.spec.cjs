const { expect, test } = require("@playwright/test");

async function openSettings(page) {
  const toggle = page.locator("#settings-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#settings-panel")).toBeVisible();
}

test("settings panel opens from a button and closes with escape", async ({ page }) => {
  await page.goto("/");

  const toggle = page.locator("#settings-toggle");
  const panel = page.locator("#settings-panel");

  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();

  await openSettings(page);

  await page.keyboard.press("Escape");

  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("settings panel closes on outside click and restores focus to toggle", async ({
  page,
}) => {
  await page.goto("/");
  await openSettings(page);

  await page.locator("#tab-size").focus();
  await page.dispatchEvent("#editor", "pointerdown");

  const toggle = page.locator("#settings-toggle");
  const panel = page.locator("#settings-panel");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("apply reflects line number and wrapping settings", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);

  await page.locator("#toggle-line-numbers").check();
  await page.locator("#toggle-wrap").uncheck();
  await page.locator("#apply").click();

  await expect(page.locator("#settings-panel")).toBeHidden();
  await expect(page.locator(".cm-lineNumbers")).toHaveCount(1);
  expect(await page.locator(".cm-lineNumbers .cm-gutterElement").count()).toBeGreaterThan(0);
  await expect(page.locator(".cm-content")).not.toHaveClass(/cm-lineWrapping/);
});

test("tab size input is normalized when out of range", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);

  const tabSize = page.locator("#tab-size");
  await tabSize.fill("1");
  await page.locator("#apply").click();
  await expect(tabSize).toHaveValue("2");

  await openSettings(page);
  await tabSize.fill("999");
  await page.locator("#apply").click();
  await expect(tabSize).toHaveValue("8");
});

test("theme toggle, editing status, and mermaid pause state are visible", async ({ page }) => {
  await page.goto("/");

  const themeToggle = page.locator("#toggle-theme");
  const initialTheme = await page.locator("html").getAttribute("data-theme");
  await themeToggle.click();

  const nextTheme = await page.locator("html").getAttribute("data-theme");
  expect(nextTheme).not.toBe(initialTheme);

  await page.locator(".cm-content").click();
  await page.keyboard.type("X");

  await expect(page.locator("#change-info")).toContainText("Last change at");
  await expect(page.locator(".cm-lp-mermaid")).toHaveCount(0);
});
