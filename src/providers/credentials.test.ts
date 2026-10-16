import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CredentialStore, type Protection } from "./credentials.js";

// Test codec is explicitly injected; production never uses it.
const protection: Protection = { seal: async (text) => Buffer.from(text).toString("base64"), open: async (text) => Buffer.from(text, "base64").toString() };

test("credential transactions serialize across instances, persist host identity, and preserve failed writes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wizard-credentials-"));
  try {
    const first = new CredentialStore(directory, protection), second = new CredentialStore(directory, protection);
    const signal = AbortSignal.timeout(10000);
    const host = await first.transaction(async (state) => state.hostID, signal);
    await Promise.all(Array.from({ length: 4 }, (_, index) => (index % 2 ? first : second).transaction(async (state) => {
      assert.equal(state.hostID, host);
      state.accounts.push({ id: String(index), clientID: String(index), subject: "person", accessToken: "private", refreshToken: "private-refresh",
        idToken: "private-id", expiresAt: 0, scopes: ["chatgpt.tokens.use.direct"] });
    }, signal)));
    assert.equal(await first.transaction(async (state) => state.accounts.length, signal), 4);
    await assert.rejects(first.transaction(async (state) => { state.accounts = []; throw new Error("failure"); }, signal));
    assert.equal(await second.transaction(async (state) => state.accounts.length, signal), 4);
    assert.deepEqual(await readdir(directory), ["credentials"]);
    const bytes = await readFile(join(directory, "credentials"));
    assert.equal(bytes.includes(Buffer.from("private-refresh")), false);
    await writeFile(join(directory, "credentials"), "corrupt");
    await assert.rejects(first.transaction(async () => {}, signal), /not replaced/);
    assert.equal(await readFile(join(directory, "credentials"), "utf8"), "corrupt");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("native credential protection round trips on the current OS", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wizard-native-credentials-"));
  try {
    const store = new CredentialStore(directory);
    const hostID = await store.transaction(async (state) => state.hostID, AbortSignal.timeout(20000));
    assert.equal(await store.transaction(async (state) => state.hostID, AbortSignal.timeout(20000)), hostID);
    if (process.platform === "win32") assert.ok((await readFile(join(directory, "credentials"), "utf8")).startsWith("dpapi:"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
