// Electron main process: hosts the web UI and sends requests with the Node
// engine so the desktop app has no CORS limits and full auth support.
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import { CookieJar, send } from "@postbench/engine";
import type { PreparedRequest } from "@postbench/engine/prepare";

const jar = new CookieJar();

ipcMain.handle("postbench:send", async (_e, req: PreparedRequest) => {
  const res = await send(req, { cookieJar: jar, timeout: 30000 });
  return { ...res, body: new Uint8Array(res.body) };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: "Postbench",
    icon: join(__dirname, "icon.png"),
    webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: false, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  void win.loadFile(join(__dirname, "web", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
