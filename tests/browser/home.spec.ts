import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const record = JSON.parse(
  readFileSync("artifacts/research/pulse/combined-integrated.json", "utf8"),
);
async function configure(page: import("@playwright/test").Page) {
  await page.getByLabel("Experiment", { exact: true }).selectOption("combined");
  await page.getByText("Body changes", { exact: false }).first().click();
  await page.locator("#home-volume").fill("20");
  await page.locator("#home-breathing").fill("100");
}
async function fixture(page: import("@playwright/test").Page) {
  await page.route("**/api/physiology", (route) => route.fulfill({ json: record }));
  await page.goto("/");
  await configure(page);
}

test("real native API runs four changes together, returns reproducible data and rejects invalid settings", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Simulation results" })).toHaveCount(0);
  await configure(page);
  const responsePromise = page.waitForResponse("**/api/physiology");
  await page.getByRole("button", { name: "Simulate", exact: true }).click();
  await expect(page.getByRole("button", { name: "Simulating…" })).toBeDisabled();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const actual = await response.json();
  expect(actual.modified.rows).toEqual(record.modified.rows);
  expect(actual.modified.dense_rows).toEqual(record.modified.dense_rows);
  expect(actual.baseline.rows).toEqual(record.baseline.rows);
  await expect(page.getByRole("region", { name: "Simulation results" })).toBeVisible();
  await expect(page.getByText("Heart-rate ceiling remains", { exact: false })).toBeVisible();
  const repeated = await request.post("/api/physiology", { data: record.configuration });
  expect(await repeated.json()).toEqual(actual);
  const invalid = await request.post("/api/physiology", {
    data: { ...record.configuration, surface: 999 },
  });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).error).toContain("outside");
  expect((await request.get("/api/physiology")).status()).toBe(405);
});

test("recorded playback drives rates, pauses and invalidates old inputs", async ({ page }) => {
  await fixture(page);
  await page.getByRole("button", { name: "Simulate", exact: true }).click();
  await expect(page.getByRole("region", { name: "Simulation results" })).toBeFocused();
  await page.getByLabel("Timeline seconds").fill("180");
  const rates = await page
    .locator(".organ.lungs")
    .first()
    .evaluate((el) => ({
      period: getComputedStyle(el).animationDuration,
      expected: getComputedStyle(el).getPropertyValue("--breath-period"),
      state: getComputedStyle(el).animationPlayState,
    }));
  expect(Number.parseFloat(rates.period)).toBeCloseTo(Number.parseFloat(rates.expected), 4);
  expect(rates.state).toBe("paused");
  await page.getByRole("button", { name: "Restart", exact: true }).click();
  await expect(page.getByLabel("Timeline seconds")).toHaveValue("0");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => page.getByLabel("Timeline seconds").inputValue()).not.toBe("0");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByLabel("Activity", { exact: true }).selectOption("0");
  await expect(page.getByText("Inputs changed. Simulate again", { exact: false })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("full export retains both native trajectories, source, exact inputs and untouched legacy history", async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(() => localStorage.setItem("human-v2-history", "preserved"));
  await page.getByRole("button", { name: "Simulate", exact: true }).click();
  await page.getByText("Model, assumptions and recorded data", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export recorded result" }).click();
  const stream = await (await download).createReadStream();
  const parts: Buffer[] = [];
  if (stream) for await (const part of stream) parts.push(part);
  const exported = JSON.parse(Buffer.concat(parts).toString());
  expect(exported.run).toEqual(record);
  expect(exported.run.modified.dense_rows).toHaveLength(1500);
  expect(await page.evaluate(() => localStorage.getItem("human-v2-history"))).toBe("preserved");
});

test("native errors remain recoverable and a late response cannot replace changed inputs", async ({
  page,
}) => {
  await page.route("**/api/physiology", (route) =>
    route.fulfill({ status: 422, json: { error: "The body did not stabilize." } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Simulate", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("The body did not stabilize.");
  await expect(page.getByRole("button", { name: "Simulate", exact: true })).toBeEnabled();
  await page.unroute("**/api/physiology");
  let release: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/physiology", async (route) => {
    await waiting;
    await route.fulfill({ json: record }).catch(() => {});
  });
  await page.getByRole("button", { name: "Simulate", exact: true }).click();
  await page.getByLabel("Experiment", { exact: true }).selectOption("capacity");
  release?.();
  await expect(page.getByRole("region", { name: "Simulation results" })).toHaveCount(0);
});

for (const width of [390, 768, 1440]) {
  test(`one-page combined experiment, keyboard and accessibility at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await fixture(page);
    await page.getByRole("button", { name: "Heart · delivery" }).click();
    await expect(page.getByRole("button", { name: "Heart · delivery" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Simulate", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "Simulation results" })).toBeFocused();
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await page.getByLabel("Timeline seconds").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByLabel("Timeline seconds")).toHaveValue("10");
    expect(
      await page
        .locator(".organ.lungs")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    await page.getByText("Model, assumptions and recorded data", { exact: true }).click();
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      report.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByText("Body changes", { exact: false }).first().click();
    await page.getByText("Model, assumptions and recorded data", { exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `artifacts/design/native-home-${width}.png`, fullPage: true });
  });
}
