import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

for (const faction of ["simple", "buzzword", "engineering", "academic", "training"] as const) {
  test(`${faction} 可以从选择流派走到业务结算`, async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("home-start").click();
    await page.getByTestId(`faction-${faction}`).click();

    for (const decision of [
      "db-unique",
      "transactional-request-record",
      "database-fallback",
      "measure-and-scale",
      "sql-business-key",
    ]) {
      await page.getByTestId(`decision-${decision}`).click();
      await expect(page.getByTestId("review-status")).toHaveText("PASS");
      await page.getByTestId("advance-incident").click();
    }

    await expect(page.getByTestId("settlement")).toBeVisible();
    await expect(page.getByTestId("settlement").getByText("PASS", { exact: true }).first()).toBeVisible();
  });
}

test("培训派完成完整周目，课程分数与陌生任务分别结算", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("home-start").click();
  await page.getByTestId("faction-training").click();

  await page.getByTestId("decision-db-unique").click();
  await expect(page.getByTestId("review-status")).toHaveText("PASS");
  await page.getByTestId("advance-incident").click();

  await expect(page.getByTestId("training-goalpost")).toContainText("满分线已经升到 120");
  await expect(page.getByText("80/120", { exact: true })).toBeVisible();
  await page.getByTestId("complete-course").click();
  await expect(page.getByText("110/120", { exact: true })).toBeVisible();
  await page.getByTestId("decision-transactional-request-record").click();
  await page.getByTestId("advance-incident").click();

  await expect(page.getByTestId("training-goalpost")).toContainText("满分线已经升到 150");
  await page.getByTestId("complete-course").click();
  await page.getByTestId("decision-outbox-consumer").click();
  await page.getByTestId("advance-incident").click();

  await expect(page.getByTestId("training-goalpost")).toContainText("满分线已经升到 180");
  await page.getByTestId("complete-course").click();
  await expect(page.getByText("170/180", { exact: true })).toBeVisible();
  await page.getByTestId("decision-measure-and-scale").click();
  await page.getByTestId("advance-incident").click();

  await page.getByTestId("decision-sql-business-key").click();
  await expect(page.getByTestId("review-status")).toHaveText("PASS");
  await page.getByTestId("advance-incident").click();

  await expect(page.getByTestId("settlement")).toBeVisible();
  await expect(page.getByTestId("settlement").getByText("PASS", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("achievement-course-transferred")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await page.screenshot({
    path: "test-results/evidence/training-settlement.png",
    fullPage: true,
    animations: "disabled",
  });

  await page.getByTestId("new-run").click();
  await expect(page.getByText("你准备相信什么？")).toBeVisible();
});

test("学院派移出课程验收，业务失败仍留在原处", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("home-start").click();
  await page.getByTestId("faction-academic").click();
  await page.getByTestId("decision-count-every-request").click();

  await expect(page.getByTestId("review-status")).toHaveText("FAIL");
  await page.getByTestId("toggle-scope").click();
  await expect(page.getByText("业务裁决仍为 FAIL。", { exact: false })).toBeVisible();
  await expect(page.getByTestId("review-status")).toHaveText("FAIL");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/evidence/academic-two-ledgers.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("移动端首页没有横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /面试官/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: "test-results/evidence/mobile-home.png",
    fullPage: true,
    animations: "disabled",
  });
});
