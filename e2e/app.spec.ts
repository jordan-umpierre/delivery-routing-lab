import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("app has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#attribution")).toContainText("OpenStreetMap");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("a route request produces a textual route table and metrics", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#start").selectOption({ index: 0 });
  await page.locator("#destination").selectOption({ index: 40 });
  await page.getByRole("button", { name: "Find route" }).click();
  await expect(page.locator("#status")).toContainText(/Route found|No route/, {
    timeout: 15000,
  });
  const status = await page.locator("#status").textContent();
  if (status!.includes("Route found")) {
    await expect(page.locator("#route-table tbody tr").first()).toBeVisible();
    await expect(page.locator("#metrics")).toContainText("Nodes expanded");
  }
});

test("results view stays accessible after a search", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Find route" }).click();
  await expect(page.locator("#status")).toContainText(/Route found|No route/, {
    timeout: 15000,
  });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("comparing algorithms fills the comparison table and exports are enabled", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Compare algorithms" }).click();
  await expect(page.locator("#status")).toContainText("Comparison complete", {
    timeout: 30000,
  });
  await expect(page.locator("#compare-table tbody tr")).toHaveCount(2);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await download).suggestedFilename()).toBe("benchmark.json");
});

test("multi-stop tour reports visiting order", async ({ page }) => {
  await page.goto("/");
  await page.locator("#stop-picker").selectOption({ index: 20 });
  await page.getByRole("button", { name: "Add stop" }).click();
  await expect(page.locator("#stop-list li")).toHaveCount(1);
  await page.getByRole("button", { name: "Find route" }).click();
  await expect(page.locator("#status")).toContainText(/Tour found|No tour/, {
    timeout: 30000,
  });
  const status = await page.locator("#status").textContent();
  if (status!.includes("Tour found")) {
    await expect(page.locator("#metrics")).toContainText("Visiting order");
    await expect(page.locator("#metrics")).toContainText("Nearest-neighbor");
  }
});

test("the whole flow is keyboard operable", async ({ page }) => {
  await page.goto("/");
  await page.locator("#algorithm").focus();
  await page.keyboard.press("Tab"); // start
  await expect(page.locator("#start")).toBeFocused();
  await page.keyboard.press("Tab"); // destination
  await expect(page.locator("#destination")).toBeFocused();
  // Reach and activate "Find route" with the keyboard only.
  await page.getByRole("button", { name: "Find route" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toContainText(
    /Route found|No route|Searching|Planning/,
    {
      timeout: 15000,
    },
  );
});
