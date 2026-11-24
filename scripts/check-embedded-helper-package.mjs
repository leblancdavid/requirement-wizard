import { cp, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

const args = process.argv.slice(2);
if (![2, 3].includes(args.length) || args[0] !== "--bundle" || (args.length === 3 && args[2] !== "--auth-guards")) throw new Error("Use --bundle <staged-helper-directory> [--auth-guards].");
const authGuards = args[2] === "--auth-guards";
const source = resolve(args[1]);
const manifest = JSON.parse(await readFile(join(source, "helper-bundle.json"), "utf8"));
if (![1, 2].includes(manifest.format) || manifest.profile !== "metadata-only-v1") throw new Error("Unsupported helper bundle.");
if (authGuards && manifest.format !== 2) throw new Error("An authentication-capable bundle is required; no profile downgrade was attempted.");
const base = process.platform === "win32" ? join(tmpdir(), "opencode") : tmpdir();
await mkdir(base, { recursive: true });
const root = await mkdtemp(join(base, "reqwizit-helper-package-")), bundle = join(root, "relocated helper");
// Fresh external directory with a space in its path; preserve originals and evidence.
await cp(source, bundle, { recursive: true, force: false, errorOnExist: true });
const entry = pathToFileURL(join(bundle, authGuards ? "auth-pilot.js" : "pilot.js")).href;
const code = `
const { parentPort } = require('node:worker_threads');
import(${JSON.stringify(entry)})
  .then(module => module.${authGuards ? "runEmbeddedAuthGuardPilot" : "runEmbeddedHelperPilot"}(${JSON.stringify(bundle)}))
  .then(result => parentPort.postMessage(result))
  .catch(() => { parentPort.postMessage({ status: 'failed' }); process.exitCode = 1; });
`;
const worker = new Worker(code, { eval: true, stdout: true, stderr: true });
worker.stdout.resume(); worker.stderr.resume(); // Never forward SDK/worker diagnostics.
try {
  const result = await new Promise((accept, reject) => {
    let result;
    worker.on("message", value => { result = value; });
    worker.once("error", () => reject(new Error("Packaged helper owner-worker failed.")));
    worker.once("exit", code => {
      const valid = authGuards ? result?.prompts === 0 && result?.providerRequests === 0 && result?.authorizedAccounts === 0
        : result?.health?.prompts === 0 && result?.health?.networkAttempts === 0 && result?.health?.listenerAttempts === 0;
      if (code !== 0 || result?.status !== "passed" || !valid)
        reject(new Error("Packaged helper owner-worker did not finish its offline check."));
      else accept(result);
    });
  });
  console.log(JSON.stringify({ status: "passed", callerNode: process.versions.node, ...(process.versions.electron ? { callerElectron: process.versions.electron } : {}),
    callerWorker: true, relocatedBundle: bundle, profile: result.profile,
    ...(authGuards ? { providerRequests: result.providerRequests, prompts: result.prompts, authorizedAccounts: result.authorizedAccounts,
      callbackRejection: result.callbackRejection, cancelledAttempt: result.cancelledAttempt } : { health: result.health }), artifacts: result.artifacts }, null, 2));
} catch {
  console.error(`Packaged helper check failed; disposable artifacts retained at ${root}. No app state or model requests were involved.`);
  process.exitCode = 1;
}
