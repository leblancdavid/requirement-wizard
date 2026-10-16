import { createServer } from "node:http";
import { defaultDataDirectory } from "../storage/paths.js";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CredentialStore } from "./credentials.js";
import { AuthorizationDeclined, ProviderError, authorize, callback, exchange, listModels, probe, refresh, revoke, type Registration } from "./chatgpt.js";

const help = `Direct ChatGPT compatibility spike (no OpenCode required)
npm run provider -- login [--account <registration-id>]
npm run provider -- accounts
npm run provider -- models --account <registration-id>
npm run provider -- probe --account <registration-id> --model <catalog-id>
npm run provider -- logout --account <registration-id>

Options: --data-dir <protected-state-directory>, --timeout-ms <1000..300000>,
         --cancel-after-ms <milliseconds> (probe only)
Login prints a fresh authorization link for your system browser; it does not open it automatically.
Only probe performs inference and consumes allowance. No project context is sent.
Default credentials are separate from project storage; Windows uses DPAPI CurrentUser.
Choose and save a discovery connection in the app's Settings → AI connections.`;

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    help: { type: "boolean" }, account: { type: "string" }, model: { type: "string" },
    "data-dir": { type: "string" }, "timeout-ms": { type: "string" }, "cancel-after-ms": { type: "string" },
  } });
  if (values.help) { console.log(help); return; }
  const command = positionals[0];
  if (positionals.length !== 1 || !["login", "accounts", "models", "probe", "logout"].includes(command!)) throw new ProviderError("Choose login, accounts, models, probe or logout. See --help.");
  if (["models", "probe", "logout"].includes(command!) && !values.account) throw new ProviderError("Select --account from the accounts command.");
  if (command === "probe" && !values.model) throw new ProviderError("Probe requires --model from this account's catalog.");
  const timeout = Number(values["timeout-ms"] ?? 180_000);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 300_000) throw new ProviderError("Timeout must be 1000..300000 milliseconds.");
  const cancelAfter = values["cancel-after-ms"] === undefined ? undefined : Number(values["cancel-after-ms"]);
  if (cancelAfter !== undefined && (command !== "probe" || !Number.isInteger(cancelAfter) || cancelAfter < 1 || cancelAfter > timeout)) throw new ProviderError("Cancellation must be a positive probe delay within the timeout.");
  const store = new CredentialStore(values["data-dir"] ? resolve(values["data-dir"]) : join(defaultDataDirectory(), "providers"));
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  const timer = setTimeout(stop, timeout);
  let cancelTimer: NodeJS.Timeout | undefined;
  const signal = controller.signal;
  const select = (accounts: Registration[]) => {
    const account = accounts.find((item) => item.id === values.account);
    if (!account) throw new ProviderError("Saved account not found. Run accounts or login.");
    return account;
  };
  try {
    if (command === "accounts") {
      const accounts = await store.transaction(async (state) => state.accounts.map((account) => ({ id: account.id, email: account.email,
        expiresAt: new Date(account.expiresAt).toISOString() })), signal);
      console.log(JSON.stringify({ accounts })); return;
    }
    if (command === "login") {
      // Persist the stable host ID before opening authorization; do not hold a lock during human interaction.
      const { hostID, saved } = await store.transaction(async (state) => ({ hostID: state.hostID, saved: values.account ? select(state.accounts) : undefined }), signal);
      const server = createServer();
      try {
        await new Promise<void>((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Cannot start authorization callback listener.");
        const attempt = authorize(hostID, `http://127.0.0.1:${address.port}/auth/callback`, saved);
        const result = await new Promise<ReturnType<typeof callback>>((accept, reject) => {
          const abort = () => reject(new ProviderError("Authorization cancelled or timed out."));
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
          server.on("request", (request, response) => {
            if (request.method !== "GET" || request.headers.host !== `127.0.0.1:${address.port}` || !request.url || request.url.length > 16384) { response.writeHead(400).end(); return; }
            const url = new URL(request.url, attempt.redirectURI);
            if (url.pathname !== "/auth/callback") { response.writeHead(404).end(); return; }
            response.setHeader("Content-Type", "text/plain; charset=utf-8");
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("Referrer-Policy", "no-referrer");
            try {
              const result = callback(attempt, url);
              signal.removeEventListener("abort", abort);
              response.end("Authorization received. Return to Reqwizit to check the result."); accept(result);
            } catch (error) {
              if (error instanceof AuthorizationDeclined) {
                signal.removeEventListener("abort", abort);
                response.writeHead(400).end("Authorization declined. Return to Reqwizit.");
                reject(error); return;
              }
              // Untrusted callbacks cannot cancel the real pending attempt.
              response.writeHead(400).end("Authorization callback rejected. Return to the terminal or retry sign-in.");
            }
          });
          console.error("Open this one-time link in your system browser (do not share it):\n" + attempt.url);
        });
        const account = await exchange(attempt, result, signal);
        await store.transaction(async (state) => {
          const previous = state.accounts.find((item) => item.id === account.id);
          if (previous && previous.subject !== account.subject) throw new Error("Registration identity conflict; credentials were not replaced.");
          state.accounts = state.accounts.filter((item) => item.id !== account.id).concat(account);
        }, signal);
        console.log(JSON.stringify({ connected: true, account: account.id, email: account.email, usage: "ChatGPT plan", manageUsage: "https://chatgpt.com/settings/usage" }));
      } finally { server.closeAllConnections(); await new Promise<void>((done) => server.close(() => done())); }
      return;
    }
    if (command === "logout") {
      await store.transaction(async (state) => {
        const account = select(state.accounts);
        // Keep local credentials on failed revocation so the user can retry explicitly.
        await revoke(account, signal);
        state.accounts = state.accounts.filter((item) => item.id !== account.id);
      }, signal);
      console.log(JSON.stringify({ signedOut: true })); return;
    }
    const account = await store.transaction(async (state) => {
      const selected = select(state.accounts);
      const renewed = await refresh(selected, signal);
      state.accounts[state.accounts.indexOf(selected)] = renewed;
      return renewed;
    }, signal);
    if (command === "models") console.log(JSON.stringify({ models: await listModels(account, signal) }));
    if (command === "probe") {
      if (cancelAfter !== undefined) cancelTimer = setTimeout(stop, cancelAfter);
      console.error("Running one bounded inference request using your ChatGPT plan.");
      console.log(JSON.stringify({ verified: true, ...await probe(account, values.model!, signal) }));
    }
  } finally { clearTimeout(timer); clearTimeout(cancelTimer); process.removeListener("SIGINT", stop); }
}

main().catch((error: unknown) => {
  // Validation/network exceptions may contain tokens, URLs, or raw provider response bodies.
  console.error(error instanceof ProviderError ? error.message : "Direct provider command failed or was cancelled. Check command arguments, account connection, and ChatGPT usage settings. No project changes were made. See docs/direct-providers.md.");
  process.exitCode = 1;
});
