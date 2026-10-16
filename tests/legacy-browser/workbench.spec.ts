import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

async function range(control: Locator, value: number, min: number) {
  await control.focus();
  await control.press("Home");
  for (let v = min; v < value; v += 5) await control.press("ArrowRight");
}
async function run(page: Page) {
  await page.locator(".run-simulation").click();
  await openChallenge(page);
  await expect(page.getByText("DRAFT CHANGED", { exact: true })).toHaveCount(0);
}

async function openChallenge(page: Page) {
  const details = page.locator(".steady-benchmark");
  if (!(await details.evaluate((e) => e.hasAttribute("open"))))
    await details.locator("summary").first().click();
}

test("a non-limiting upgrade explains its lower workload and resting cost", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await range(page.getByLabel("Oxygen-exchange capacity", { exact: true }), 20, -30);
  await run(page);
  await expect(page.getByTestId("workload-score")).toHaveText("99.8");
  await expect(page.getByTestId("workload-explanation")).toContainText(
    "Workload fell from 225.00 to 224.50 W",
  );
  await expect(page.getByTestId("workload-explanation")).toContainText(
    "Resting demand rose from 100.00 to 102.00 W",
  );
  await expect(page.getByTestId("workload-explanation")).toContainText(
    "Lung exchange gained 59.50 W",
  );
  await expect(page.getByTestId("injury-coverage")).toContainText("organ injury not assessed");
  await expect(page.getByTestId("lung-coverage")).toContainText("uncalibrated assumptions");
  await page.locator(".results").screenshot({ path: "artifacts/playtest/lung-regression.png" });
  await page.getByRole("button", { name: "Lung mechanisms & evidence ↗", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Harms et al., 1997 ↗", exact: true }),
  ).toHaveAttribute("href", "https://pubmed.ncbi.nlm.nih.gov/9134907/");
  await expect(
    page.getByText("Lung edits: mechanism determines the tradeoff", { exact: true }),
  ).toBeVisible();
});

test("fork, modify, benchmark, diagnose, save, reload, compare, restore, and reproduce a submission", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const health = await page.request.get("/api/health");
  expect((await health.json()).context.modelVersion).toBe("energy-balance-1.0.0");
  await expect(page.getByTestId("workload-score")).toHaveText("100.0");
  await range(page.getByLabel("Pumping capacity", { exact: true }), 20, -30);
  await expect(page.getByRole("button", { name: "Save experiment", exact: true })).toBeDisabled();
  await expect(page.getByTestId("timeline-stale")).toBeVisible();
  await run(page);
  await expect(page.getByTestId("workload-score")).toHaveText("103.4");
  await expect(page.getByTestId("limiting-system")).toHaveText("Cooling");
  await range(page.getByLabel("Cooling capacity", { exact: true }), 20, -30);
  await run(page);
  await expect(page.getByTestId("workload-score")).toHaveText("121.9");
  await expect(page.getByTestId("limiting-system")).toHaveText("Heart + Lungs");
  await range(page.getByLabel("Muscle efficiency", { exact: true }), 10, -20);
  await run(page);
  await expect(page.getByTestId("workload-score")).toHaveText("133.3");
  await expect(page.getByTestId("limiting-system")).toHaveText("Muscles");
  await page.getByLabel("Experiment name").fill("Three-system discovery");
  await page.getByRole("button", { name: "Save experiment", exact: true }).click();
  await page.getByRole("button", { name: "Experiments", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "Three-system discovery" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Experiments", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "Three-system discovery" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Restore", exact: true }).click();
  await openChallenge(page);
  await expect(page.getByTestId("workload-score")).toHaveText("133.3");
  await page.getByLabel("Compare with").selectOption({ label: "Three-system discovery" });
  await expect(page.locator(".score-row>span")).toContainText("+0.0%");
  await page.getByLabel("Experiment name").fill("Three-system discovery");
  await page.getByRole("button", { name: "Submit to challenge", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Sustainable workload.", exact: true }),
  ).toBeVisible();
  const entry = page.getByRole("row").filter({ hasText: "Three-system discovery" });
  await expect(entry).toBeVisible();
  await entry.getByRole("button", { name: "Reproduce & fork", exact: false }).click();
  await expect(page.getByTestId("workload-score")).toHaveText("133.3");
  await expect(page.getByRole("status").first()).toContainText("verified by server and browser");
  expect(errors).toEqual([]);
});

test("invalid high headline scores stay inspectable but cannot be submitted", async ({ page }) => {
  await page.goto("/");
  await range(page.getByLabel("Pumping capacity", { exact: true }), 50, -30);
  await range(page.getByLabel("Cooling capacity", { exact: true }), 50, -30);
  await range(page.getByLabel("Muscle efficiency", { exact: true }), 20, -20);
  await run(page);
  await expect(page.getByText("INVALID", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit to challenge", exact: false }),
  ).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Outside challenge constraints" })).toBeVisible();
  await expect(page.getByTestId("workload-score")).toHaveText("133.3");
});

test("history export/import is lossless, malformed import preserves existing data", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Experiment name").fill("Export me");
  await page.getByRole("button", { name: "Save experiment", exact: true }).click();
  await page.getByRole("button", { name: "Experiments", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  if (stream) for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  expect(JSON.parse(bytes.toString()).experiments[0].context.modelVersion).toBe(
    "energy-balance-1.0.0",
  );
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "roundtrip.json", mimeType: "application/json", buffer: bytes });
  await expect(page.getByRole("row").filter({ hasText: "Export me" })).toHaveCount(1);
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"wrong":true}'),
  });
  await expect(page.getByRole("status").first()).toContainText("Missing or unexpected fields");
  await expect(page.getByRole("row").filter({ hasText: "Export me" })).toHaveCount(1);
});

test("corrupt history is preserved and storage errors are visible", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("human-v2.experiments.v1", "broken history"));
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("original data is preserved");
  await expect(page.getByRole("button", { name: "Save experiment", exact: true })).toBeDisabled();
});

test("network failure offers a retry and never fabricates leaderboard entries", async ({
  page,
}) => {
  await page.route("**/api/leaderboard", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Challenge", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Your experiment is unchanged");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.unroute("**/api/leaderboard");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(1);
});
test("simultaneous same-profile tabs merge saves rather than losing snapshots", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await Promise.all([page.goto("/"), other.goto("/")]);
  await page.getByLabel("Experiment name").fill("Saved in tab A");
  await other.getByLabel("Experiment name").fill("Saved in tab B");
  await Promise.all([
    page.getByRole("button", { name: "Save experiment", exact: true }).click(),
    other.getByRole("button", { name: "Save experiment", exact: true }).click(),
  ]);
  await expect(page.getByRole("status").first()).toContainText("Saved “Saved in tab A”");
  await expect(other.getByRole("status").first()).toContainText("Saved “Saved in tab B”");
  await other.reload();
  await other.getByRole("button", { name: "Experiments", exact: true }).click();
  await expect(other.getByRole("row").filter({ hasText: "Saved in tab A" })).toBeVisible();
  await expect(other.getByRole("row").filter({ hasText: "Saved in tab B" })).toBeVisible();
});
test("body systems have separate targets and mobile selection reveals the joint control", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const boxes = await page.locator(".person-callouts button").evaluateAll((buttons) =>
    buttons.map((button) => {
      const r = button.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
    }),
  );
  expect(boxes).toHaveLength(5);
  for (let i = 0; i < boxes.length; i++) {
    expect(boxes[i].height).toBeGreaterThanOrEqual(44);
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(
        true,
      );
    }
  }
  await page.getByRole("button", { name: "Cooling · heat loss", exact: true }).click();
  await expect(page.getByLabel("Cooling capacity", { exact: true })).toBeInViewport();
  await expect(page.getByLabel("Pumping capacity", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Simulate this person & routine", exact: false }).click();
  await expect(page.getByTestId("live-work")).toBeInViewport();
});

for (const width of [390, 768, 1440])
  test(`responsive, keyboard, and accessibility review at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await range(page.getByLabel("Pumping capacity", { exact: true }), 20, -30);
    await run(page);
    await page.getByLabel("Pumping capacity", { exact: true }).focus();
    await expect(page.getByLabel("Pumping capacity", { exact: true })).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      report.violations.map((x) => ({ id: x.id, nodes: x.nodes.map((n) => n.target) })),
    ).toEqual([]);
    await page.getByRole("heading", { name: "Body simulator", exact: true }).click();
    await page.screenshot({ path: `artifacts/design/after-${width}.png`, fullPage: true });
    for (const nav of ["Experiments", "Challenge", "Model notes"]) {
      await page.getByRole("button", { name: nav, exact: true }).click();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const extra = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        extra.violations.map((x) => ({ id: x.id, nodes: x.nodes.map((n) => n.target) })),
      ).toEqual([]);
    }
  });
