#!/usr/bin/env node
import { startEchoServer } from "./index.js";
const port = Number(process.argv[2] ?? 5555);
startEchoServer(port).then((s) => console.log(`echo server on ${s.url}`));
