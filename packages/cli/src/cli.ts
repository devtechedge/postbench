#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
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

program
  .command("mock")
  .argument("<collection>", "collection with saved examples")
  .option("-p, --port <port>", "port", "4010")
  .description("Serve saved examples as a local mock server")
  .action(async (file: string, f: { port: string }) => {
    const { parseCollection } = await import("@postbench/core");
    const { startMockServer } = await import("@postbench/mock");
    const m = await startMockServer(parseCollection(readFileSync(file, "utf8")).collection, Number(f.port));
    console.log(`mock server on ${m.url} (${m.routes.length} routes)`);
    for (const r of m.routes) console.log(`  ${r.method.padEnd(7)} ${r.path}  [${r.examples.map((e) => e.code ?? 200).join(", ")}]`);
  });

program
  .command("import")
  .argument("<file>", "OpenAPI (JSON/YAML), HAR, curl command file or Postman collection")
  .option("-o, --output <path>", "output collection path (stdout when omitted)")
  .description("Convert other formats into a Collection v2.1 file")
  .action(async (file: string, f: { output?: string }) => {
    const { importAny } = await import("@postbench/importers");
    const { serializeCollection } = await import("@postbench/core");
    const { kind, collection } = importAny(readFileSync(file, "utf8"));
    const text = serializeCollection(collection);
    if (f.output) {
      writeFileSync(f.output, text);
      console.error(`imported ${kind} into ${f.output}`);
    } else process.stdout.write(text + "\n");
  });

program
  .command("codegen")
  .argument("<collection>", "collection file")
  .argument("<request>", "request name or id")
  .option("-l, --language <id>", "curl, javascript-fetch, python-requests, httpie", "curl")
  .option("-e, --environment <path>", "environment file for variables")
  .description("Print a code snippet for one request")
  .action(async (file: string, name: string, f: { language: string; environment?: string }) => {
    const core = await import("@postbench/core");
    const { prepareRequest } = await import("@postbench/engine");
    const { generate } = await import("@postbench/codegen");
    const c = core.parseCollection(readFileSync(file, "utf8")).collection;
    const entry = [...core.walkItems(c)].find((e) => e.item.name === name || e.item.id === name);
    if (!entry) throw new Error(`No request named ${name}`);
    const scopes = [f.environment ? core.VariableScope.fromEnvironment(core.parseEnvironment(readFileSync(f.environment, "utf8"))) : new core.VariableScope("environment"), new core.VariableScope("collection", c.variable ?? [])];
    const req = prepareRequest(entry.item.request, { resolver: new core.VariableResolver(scopes, { dynamic: false }), parents: entry.parents, collectionAuth: c.auth });
    console.log(generate(f.language as never, req));
  });

program.parseAsync(process.argv);
