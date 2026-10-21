import { expect, test } from "@playwright/test";

const echo = process.env.ECHO_URL;

test("loads the demo collection and edits a request", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("item-List posts")).toBeVisible();
  await page.getByTestId("item-Create post").click();
  await expect(page.getByTestId("method")).toHaveValue("POST");
  await page.getByRole("button", { name: "body" }).click();
  await expect(page.locator("textarea.code")).toContainText("{{title}}");
});

test("imports a curl command and shows a code snippet", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("import-open").click();
  await page.getByTestId("import-text").fill("curl -X PUT https://example.com/things/1 -H 'X-A: 1' -d '{\"a\":1}'");
  await page.getByTestId("import-go").click();
  await expect(page.getByText("Imported curl")).toBeVisible();
  await page.getByTestId("item-https://example.com/things/1").click();
  await page.getByTestId("code-open").click();
  await expect(page.getByTestId("snippet")).toContainText("curl --location --request PUT 'https://example.com/things/1'");
});

test("sends a request and runs tests against a local echo server", async ({ page }) => {
  test.skip(!echo, "ECHO_URL not set");
  await page.goto("/");
  await page.getByTestId("import-open").click();
  const coll = {
    info: { name: "Local", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    item: [{ name: "echo get", event: [{ listen: "test", script: { exec: ["pm.test('ok', () => pm.response.to.have.status(200));", "pm.test('arg', () => pm.expect(pm.response.json().args.x).to.equal('1'));"] } }], request: { method: "GET", url: `${echo}/get?x=1` } }],
  };
  await page.getByTestId("import-text").fill(JSON.stringify(coll));
  await page.getByTestId("import-go").click();
  await page.getByTestId("item-echo get").click();
  await page.getByTestId("send").click();
  await expect(page.getByTestId("status")).toContainText("200");
  await page.getByRole("button", { name: /tests \(2\/2\)/ }).click();
  await expect(page.getByTestId("test-results")).toContainText("PASS arg");
});
