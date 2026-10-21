// Launches the packaged-layout app with Playwright's Electron driver, checks the
// UI renders, and sends a request through the Node bridge to a local echo server.
import { _electron as electron } from "@playwright/test";
import { startEchoServer } from "@postbench/echo";
import { fileURLToPath } from "node:url";

const echo = await startEchoServer();
const app = await electron.launch({ args: [fileURLToPath(new URL("..", import.meta.url)), "--no-sandbox"] });
try {
  const win = await app.firstWindow();
  await win.waitForLoadState("domcontentloaded");
  const title = await win.title();
  const bridged = await win.evaluate(() => typeof window.postbenchDesktop?.send === "function");
  const res = await win.evaluate((url) => window.postbenchDesktop.send({ method: "GET", url: `${url}/get?x=1`, headers: [], body: { kind: "none" } }), echo.url);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(Object.values(res.body))));
  if (!bridged || res.code !== 200 || json.args.x !== "1") throw new Error(`smoke failed: ${JSON.stringify({ bridged, code: res.code })}`);
  console.log(`desktop smoke ok: title="${title}", bridge send -> ${res.code}`);
} finally {
  await app.close();
  await echo.close();
}
