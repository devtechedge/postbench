#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { runCommand } from "./run-command.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
const collect = (v: string, prev: string[] = []) => [...prev, v];
const program = new Command();
program.name("postbench").description("Run Postman collections from the command line").version(pkg.version);

program
  .command("run")
  .argument("<collection>", "collection file path or URL")
  .description("Run a collection (flags follow newman run)")
  .option("-e, --environment <path>", "environment file path or URL")
  .option("-g, --globals <path>", "globals file path or URL")
  .option("-d, --iteration-data <path>", "CSV or JSON data file")
  .option("-n, --iteration-count <n>", "number of iterations")
  .option("--folder <name>", "run only this folder or request (repeatable)", collect)
  .option("--env-var <key=value>", "set an environment variable (repeatable)", collect)
  .option("--global-var <key=value>", "set a global variable (repeatable)", collect)
  .option("-r, --reporters <list>", "comma separated reporters: cli, json, junit", "cli")
  .option("--reporter-json-export <path>", "JSON report path")
  .option("--reporter-junit-export <path>", "JUnit XML report path")
  .option("--export-environment <path>", "write the final environment")
  .option("--export-globals <path>", "write the final globals")
  .option("--export-collection <path>", "write the collection with final collection variables")
  .option("--delay-request <ms>", "delay between requests")
  .option("--timeout-request <ms>", "request timeout")
  .option("--timeout-script <ms>", "script timeout")
  .option("--bail", "stop on the first failure")
  .option("-k, --insecure", "disable TLS verification")
  .option("--ignore-redirects", "do not follow redirects")
  .option("--disable-cookies", "do not keep a cookie jar")
  .option("--working-dir <path>", "base directory for file bodies")
  .option("-x, --suppress-exit-code", "always exit 0")
  .option("--color <on|off>", "colored output", "on")
  .option("--verbose", "show console output from scripts")
  .option("--ssl-client-cert <path>", "client certificate (PEM)")
  .option("--ssl-client-key <path>", "client key (PEM)")
  .option("--ssl-client-passphrase <pass>", "client key passphrase")
  .option("--ssl-extra-ca-certs <path>", "extra trusted CA (PEM)")
  .option("--proxy <url>", "HTTP proxy URL")
  .action(async (collection: string, flags) => {
    try {
      const { code } = await runCommand(collection, flags);
      process.exitCode = code;
    } catch (err) {
      process.stderr.write(`error: ${(err as Error).message}\n`);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
