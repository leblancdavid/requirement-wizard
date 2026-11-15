/** Classify only a known V8 fatal marker. Never retain or expose raw child stderr:
 * it can contain local paths, project evidence or credentials from dependencies. */
export function publicationFailureClassifier() {
  let tail = "", heapExhausted = false;
  return {
    observe(chunk: Buffer) {
      const text = tail + chunk.toString("utf8");
      if (/FATAL ERROR:[^\r\n]*JavaScript heap out of memory/u.test(text)) heapExhausted = true;
      tail = text.slice(-512);
    },
    description() { return heapExhausted ? "child reported JavaScript heap exhaustion" : "cause not established"; },
  };
}
