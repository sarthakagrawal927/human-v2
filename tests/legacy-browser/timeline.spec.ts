import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function simulate(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Simulate this person & routine", exact: false }).click();
  await expect(page.getByTestId("timeline-stale")).toHaveCount(0);
  await page.getByRole("button", { name: "Restart", exact: true }).click();
}
async function trait(page: import("@playwright/test").Page, id: string, value: number) {
  await page.locator(`#range-${id}`).fill(String(value));
}

test("guided coupled experiment is explicit and undo restores the joint draft", async ({
  page,
}) => {
  await page.goto("/");
  await trait(page, "exchange", 10);
  await page.getByLabel("Repeat for", { exact: true }).selectOption("30");
  await page.getByText("Try a coupled experiment", { exact: true }).click();
  await page.getByRole("button", { name: "Load cooling in a hot world", exact: true }).click();
  await expect(page.locator("#range-cooling")).toHaveValue("20");
  await expect(page.locator("#range-exchange")).toHaveValue("0");
  await expect(page.getByLabel("Repeat for", { exact: true })).toHaveValue("7");
  await expect(page.getByLabel("Phase temperature (°C)", { exact: true })).toHaveValue("30");
  await expect(page.getByLabel("Workload (W)", { exact: true })).toHaveValue("180");
  await expect(page.getByTestId("timeline-stale")).toBeVisible();
  await page.getByRole("button", { name: "Undo example", exact: true }).click();
  await expect(page.locator("#range-exchange")).toHaveValue("10");
  await expect(page.locator("#range-cooling")).toHaveValue("0");
  await expect(page.getByLabel("Repeat for", { exact: true })).toHaveValue("30");
});

test("routine edits undo in reverse order without losing the daily duration", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Phase temperature (°C)", { exact: true }).fill("31");
  await page.getByLabel("Phase humidity (%)", { exact: true }).fill("70");
  await page.getByRole("button", { name: "+ Add phase", exact: true }).click();
  await expect(page.locator(".phase-composer button")).toHaveCount(4);
  await page.getByRole("button", { name: "Undo routine edit", exact: true }).click();
  await expect(page.locator(".phase-composer button")).toHaveCount(3);
  await page.getByRole("button", { name: "Undo routine edit", exact: true }).click();
  await expect(page.getByLabel("Phase humidity (%)", { exact: true })).toHaveValue("40");
  await expect(page.getByLabel("Phase temperature (°C)", { exact: true })).toHaveValue("31");
  await page.getByRole("button", { name: "Undo routine edit", exact: true }).click();
  await expect(page.getByLabel("Phase temperature (°C)", { exact: true })).toHaveValue("22");
  await expect(page.getByRole("button", { name: "Undo routine edit", exact: true })).toHaveCount(0);
});

test("combined traits and editable phases are recorded, saved, restored and independently replayed", async ({
  page,
}) => {
  await page.goto("/");
  for (const [id, value] of Object.entries({
    pumping: 20,
    exchange: 10,
    transport: 5,
    power: 5,
    efficiency: 10,
    cooling: 20,
  }))
    await trait(page, id, value);
  await page.getByLabel("Starting routine", { exact: true }).selectOption("hot-shift");
  await page.getByLabel("Repeat for", { exact: true }).selectOption("7");
  await page.getByLabel("Phase duration (hours)", { exact: true }).fill("5");
  await page.getByLabel("Phase temperature (°C)", { exact: true }).fill("32");
  await page.getByLabel("Phase humidity (%)", { exact: true }).fill("60");
  await page.getByLabel("Workload (W)", { exact: true }).fill("220");
  await page.getByRole("button", { name: "+ Add phase", exact: true }).click();
  await expect(page.locator(".phase-composer button")).toHaveCount(4);
  await page.getByRole("button", { name: "Remove selected phase", exact: true }).click();
  await expect(page.locator(".phase-composer button")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Save experiment", exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Export timeline replay", exact: true }),
  ).toBeDisabled();
  await simulate(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export timeline replay", exact: true }).click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  if (stream) for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const replay = JSON.parse(bytes.toString());
  expect(replay.configuration).toEqual({
    pumping: 20,
    exchange: 10,
    transport: 5,
    power: 5,
    efficiency: 10,
    cooling: 20,
  });
  expect(replay.settings.scenarioVersion).toBe("editable-day-2.0.0");
  expect(
    replay.settings.phases.reduce((sum: number, p: { hours: number }) => sum + p.hours, 0),
  ).toBe(24);
  expect(replay.settings.phases.find((p: { kind: string }) => p.kind === "activity")).toMatchObject(
    { hours: 5, temperatureC: 32, humidityPercent: 60, requestedWorkW: 220 },
  );
  await page.getByLabel("Experiment name", { exact: true }).fill("Combined life");
  await page.getByRole("button", { name: "Save experiment", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Saved “");
  await page.reload();
  await page.getByRole("button", { name: "Experiments", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "Combined life" })
    .getByRole("button", { name: "Restore", exact: true })
    .click();
  await expect(page.locator("#range-exchange")).toHaveValue("10");
  await page.locator(".phase-composer button").nth(1).click();
  await expect(page.getByLabel("Phase temperature (°C)", { exact: true })).toHaveValue("32");
  await page.getByLabel("Starting routine", { exact: true }).selectOption("temperate");
  await page
    .getByLabel("Import timeline replay JSON", { exact: true })
    .setInputFiles({ name: "replay.json", mimeType: "application/json", buffer: bytes });
  await expect(page.getByRole("status").first()).toContainText("independently checked");
  await expect(page.getByLabel("Starting routine", { exact: true })).toHaveValue("hot-shift");
  replay.recorded.run.final.excessHeatJ += 100;
  await page.getByLabel("Import timeline replay JSON", { exact: true }).setInputFiles({
    name: "tampered.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(replay)),
  });
  await expect(page.getByRole("alert")).toContainText("do not reproduce");
  await expect(page.getByRole("alert")).toContainText("Your experiment is unchanged");
  await expect(page.getByRole("alert")).toContainText("Export a timeline replay");
  await expect(page.locator("#range-exchange")).toHaveValue("10");
});

test("delayed accumulation is resolved by recovery replacement, with preserved daily conditions", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Starting routine", { exact: true }).selectOption("scarce-water");
  await simulate(page);
  await expect(page.getByTestId("timeline-ending")).toContainText("model boundary at 2d");
  await page.locator(".phase-composer button").nth(2).click();
  await page.getByLabel("Phase replacement (L/h)", { exact: true }).fill("0.25");
  await simulate(page);
  await expect(page.getByTestId("timeline-ending")).toHaveText("Computed 30 repeated days");
  await page.getByLabel("Experiment name", { exact: true }).fill("Recovered daily life");
  await page.getByRole("button", { name: "Save experiment", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Saved “");
  await page.reload();
  await page.getByRole("button", { name: "Experiments", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "Recovered daily life" });
  await row.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByTestId("timeline-ending")).toHaveText("Computed 30 repeated days");
  await page.locator(".phase-composer button").nth(2).click();
  await expect(page.getByLabel("Phase replacement (L/h)", { exact: true })).toHaveValue("0.25");
});

test("cooling trades heat relief for water on the matched interval, with evidence and conditional replays", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Starting routine", { exact: true }).selectOption("hot-shift");
  await trait(page, "cooling", 20);
  await simulate(page);
  await expect(page.getByTestId("timeline-ending")).toHaveText("Computed 30 repeated days");
  await expect(page.locator(".consequence-cards")).toContainText("Stored heat: −");
  await expect(page.locator(".consequence-cards")).toContainText("Sweat loss: +");
  await page.getByText("Calculation, recovery & model limits", { exact: true }).click();
  await page
    .getByRole("button", { name: "Calculate remove-one-edit replays", exact: true })
    .click();
  await expect(page.locator(".temporal-details")).toContainText("cooling removed:");
  await page.getByText("Chosen coefficients & physical provenance", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Partitional calorimetry, 2019 ↗", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("timeline-coverage")).toContainText("No aging, chronic damage");
});

test("playback, scrubbing, phase changes, boundary stops and reduced motion share recorded results", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Starting routine", { exact: true }).selectOption("hot-shift");
  await page.getByLabel("Repeat for", { exact: true }).selectOption("1");
  await simulate(page);
  const scrub = page.getByLabel("Replay time", { exact: false });
  await scrub.fill("32400");
  await expect(page.getByTestId("live-work")).toHaveText("180 W");
  await expect(page.locator(".scene-phase")).toContainText("Working");
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  const before = Number(await scrub.inputValue());
  await expect.poll(async () => Number(await scrub.inputValue())).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Ⅱ Pause", exact: true }).click();
  const paused = await scrub.inputValue();
  await page.waitForTimeout(150);
  expect(await scrub.inputValue()).toBe(paused);
  await scrub.press("End");
  await expect(page.locator(".scene-boundary")).toContainText("Later state is unknown");
  await expect(page.getByRole("button", { name: "▶ Play", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restart", exact: true }).click();
  await expect(page.getByTestId("live-work")).toHaveText("0 W");
  await expect(page.locator(".scene-phase")).toContainText("Resting");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  expect(
    await page.locator(".person-flow").evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  await expect.poll(async () => Number(await scrub.inputValue())).toBeGreaterThan(0);
  await trait(page, "exchange", 20);
  await expect(page.getByRole("button", { name: "▶ Play", exact: true })).toBeDisabled();
  await expect(page.getByTestId("timeline-stale")).toBeVisible();
});

for (const width of [390, 768, 1440])
  test(`Life Theatre and expanded ledgers remain accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page.getByLabel("Starting routine", { exact: true }).selectOption("scarce-water");
    await simulate(page);
    await page.getByText("Calculation, recovery & model limits", { exact: true }).click();
    await page.getByText("Chosen coefficients & physical provenance", { exact: true }).click();
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      report.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 390) {
      const region = page.getByRole("region", {
        name: "Phase energy and fluid ledger",
        exact: true,
      });
      await region.focus();
      await region.press("ArrowRight");
      await expect.poll(() => region.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
    }
    await page.getByLabel("Pumping capacity", { exact: true }).focus();
    await expect(page.getByLabel("Pumping capacity", { exact: true })).toBeFocused();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: `artifacts/design/life-theatre-${width}.png`, fullPage: true });
  });
