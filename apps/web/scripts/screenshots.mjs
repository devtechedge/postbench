// Captures the README screenshots and the GitHub social preview from a running
// build (defaults to the live demo). Usage: node scripts/screenshots.mjs [url]
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

const base = process.argv[2] ?? "https://postbench.vercel.app";
const out = (f) => fileURLToPath(new URL(`../../../docs/screenshots/${f}`, import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

await page.goto(base);
await page.getByTestId("item-List posts").click();
await page.getByRole("button", { name: "tests", exact: true }).first().click();
await page.getByTestId("send").click();
await page.getByTestId("status").waitFor();
await page.screenshot({ path: out("01-request-and-response.png") });

await page.getByRole("button", { name: /tests \(\d+\/\d+\)/ }).click();
await page.getByTestId("test-results").waitFor();
await page.screenshot({ path: out("02-test-results.png") });

await page.getByTestId("run-0").click();
await page.getByTestId("runner-summary").waitFor();
await page.waitForTimeout(1500);
await page.screenshot({ path: out("03-collection-runner.png") });
await page.keyboard.press("Escape");
await page.goto(base);

await page.getByTestId("item-Create post").click();
await page.getByTestId("code-open").click();
await page.getByTestId("snippet").waitFor();
await page.screenshot({ path: out("04-code-snippets.png") });

await page.goto(base);
await page.getByTestId("theme-toggle").click();
await page.getByTestId("item-Get post by id").click();
await page.getByTestId("send").click();
await page.getByTestId("status").waitFor();
await page.screenshot({ path: out("05-light-mode.png") });
await page.getByTestId("theme-toggle").click();

const social = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await social.goto(base);
await social.getByTestId("item-List posts").click();
await social.getByTestId("send").click();
await social.getByTestId("status").waitFor();
await social.screenshot({ path: out("social-preview.png") });
await browser.close();
console.log("screenshots written to docs/screenshots");
