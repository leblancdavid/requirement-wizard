import React, { useEffect, useState, type ReactNode } from "react";

export function pageWindow(total: number, offset: number, size: number) {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages - 1, Math.max(0, Math.floor(offset / size)));
  const start = page * size;
  return { page, pages, start, end: Math.min(total, start + size) };
}

/** Local navigation, with stable first-row IDs to anchor background updates. */
export function usePagination(ids: string[], scope: string, target?: string | null) {
  const [size, setSize] = useState(25);
  const [position, setPosition] = useState({ scope, offset: 0, anchor: ids[0] });
  const anchorIndex = position.scope === scope && position.anchor ? ids.indexOf(position.anchor) : -1;
  const offset = position.scope !== scope ? 0 : anchorIndex >= 0 ? anchorIndex : position.offset;
  const base = pageWindow(ids.length, offset, size);
  const targetIndex = target ? ids.indexOf(target) : -1;
  const window = targetIndex >= 0 && (targetIndex < base.start || targetIndex >= base.end)
    ? pageWindow(ids.length, targetIndex, size) : base;
  function go(page: number) {
    const next = pageWindow(ids.length, page * size, size);
    setPosition({ scope, offset: next.start, anchor: ids[next.start] });
  }
  // Follow explicit links and review auto-advance, not ordinary polling.
  useEffect(() => {
    const index = target ? ids.indexOf(target) : -1;
    if (index >= 0) setPosition({ scope, offset: index, anchor: ids[Math.floor(index / size) * size] });
    else setPosition((current) => current.scope === scope ? current : { scope, offset: 0, anchor: ids[0] });
  }, [target, scope]);
  return { ...window, size, total: ids.length, go, setSize: (value: number) => {
    const next = pageWindow(ids.length, window.start, value);
    setSize(value); setPosition({ scope, offset: next.start, anchor: ids[next.start] });
  } };
}

export function Pagination({ paging, label, onNavigate }: {
  paging: ReturnType<typeof usePagination>; label: string; onNavigate?: () => void;
}) {
  if (!paging.total) return null;
  return <nav className="list-pagination" aria-label={`${label} pages`}>
    <span role="status">{paging.start + 1}–{paging.end} of {paging.total}</span>
    <label>Items per page<select aria-label={`${label} items per page`} value={paging.size} onChange={(event) => { onNavigate?.(); paging.setSize(Number(event.target.value)); }}>
      {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
    </select></label>
    <button type="button" className="secondary" disabled={paging.page === 0} onClick={() => { onNavigate?.(); paging.go(paging.page - 1); }}>Previous</button>
    <span>Page {paging.page + 1} of {paging.pages}</span>
    <button type="button" className="secondary" disabled={paging.page + 1 >= paging.pages} onClick={() => { onNavigate?.(); paging.go(paging.page + 1); }}>Next</button>
  </nav>;
}

/** Secondary histories own no editable row state. */
export function PagedList<T>({ items, itemID, label, children, as: List = "div" }: {
  items: T[]; itemID: (item: T) => string; label: string; children: (item: T, index: number) => ReactNode; as?: "div" | "ul" | "ol";
}) {
  const paging = usePagination(items.map(itemID), label);
  return <><Pagination paging={paging} label={label} /><List {...(List === "ol" ? { start: paging.start + 1 } : {})}>{items.slice(paging.start, paging.end).map((item, index) =>
    <React.Fragment key={itemID(item)}>{children(item, paging.start + index)}</React.Fragment>)}</List>
    {paging.pages > 1 && <Pagination paging={paging} label={`${label} bottom`} />}</>;
}
