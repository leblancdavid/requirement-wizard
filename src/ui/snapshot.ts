// Keep equal sections referentially stable across JSON polling responses. Do not
// compare only revisions: job/lease/workspace outcomes can change independently.
const serialized = new WeakMap<object, string>();
function signature(value: object) {
  let text = serialized.get(value);
  if (text === undefined) { text = JSON.stringify(value); serialized.set(value, text); }
  return text;
}

/** Inputs are immutable JSON snapshots; retained cache entries follow their lifetime. */
export function shareSnapshot<T extends object>(previous: T | null, next: T): T {
  if (!previous) return next;
  const result = { ...next };
  let unchanged = Object.keys(previous).length === Object.keys(next).length;
  for (const key of Object.keys(next) as (keyof T)[]) {
    const before = previous[key], after = next[key];
    if (Object.is(before, after) || before !== null && after !== null && typeof before === "object" && typeof after === "object" && signature(before) === signature(after)) result[key] = before;
    else unchanged = false;
  }
  return unchanged ? previous : result;
}
