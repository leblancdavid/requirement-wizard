import { parentPort, workerData } from "node:worker_threads";

if (workerData.directory === "startup-failure") throw new Error("Fixture startup failure");
if (workerData.directory === "unexpected-exit") parentPort.close();
else {
  // Deliberately CPU-bound startup and teardown must not block the owning thread.
  const until = Date.now() + 350;
  while (Date.now() < until) { /* simulate checkpoint generation */ }
  parentPort.postMessage({ type: "ready", origin: "http://127.0.0.1:12345" });
  if (workerData.directory === "runtime-failure") setTimeout(() => { throw new Error("Fixture runtime failure"); }, 30);
  parentPort.on("message", (message) => {
    if (message.type !== "close") return;
    const until = Date.now() + 100;
    while (Date.now() < until) { /* simulate durable flush */ }
    parentPort.close();
  });
}
