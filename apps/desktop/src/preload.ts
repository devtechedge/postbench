// Exposes a minimal, typed bridge to the renderer. Only request sending crosses
// the process boundary; the renderer never gets Node access.
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("postbenchDesktop", {
  send: (req: unknown) => ipcRenderer.invoke("postbench:send", req),
});
