const { expect, test } = require("@playwright/test");

async function clickLineById(page, lineId) {
  const point = await page.evaluate((id) => {
    const line = document.querySelector(`.cm-line#${CSS.escape(id)}`);
    if (!(line instanceof HTMLElement)) {
      throw new Error(`Missing .cm-line#${id}`);
    }
    line.scrollIntoView({ block: "center" });
    const rect = line.getBoundingClientRect();
    return {
      x: Math.round(rect.left + 24),
      y: Math.round((rect.top + rect.bottom) / 2),
    };
  }, lineId);
  await page.mouse.click(point.x, point.y);
}

async function getSelectedLineId(page) {
  return page.evaluate(() => {
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
    const line = element?.closest(".cm-line");
    return line?.id ?? null;
  });
}

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

test("arrow up/down moves one line at a time around heading lines", async ({ page }) => {
  await page.goto("/");
  await page.locator('.cm-content [data-href="#headings"]').first().click();

  await expect(page.locator(".cm-line#headings")).toHaveCount(1);
  await expect(page.locator(".cm-line#h1")).toHaveCount(1);
  await expect(page.locator(".cm-line#h2")).toHaveCount(1);

  await clickLineById(page, "headings");
  await expect.poll(() => getSelectedLineId(page)).toBe("headings");

  await page.keyboard.press("ArrowDown");
  await expect.poll(() => getSelectedLineId(page)).toBe("h1");

  await page.keyboard.press("ArrowDown");
  await expect.poll(() => getSelectedLineId(page)).toBe("h2");

  await clickLineById(page, "h2");
  await expect.poll(() => getSelectedLineId(page)).toBe("h2");

  await page.keyboard.press("ArrowUp");
  await expect.poll(() => getSelectedLineId(page)).toBe("h1");

  await page.keyboard.press("ArrowUp");
  await expect.poll(() => getSelectedLineId(page)).toBe("headings");
});
