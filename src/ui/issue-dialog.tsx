import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./issue-dialog.css";

export function IssueDialog({ close, children }: { close: () => void; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  function isBackdrop(event: React.MouseEvent<HTMLDialogElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX >= bounds.right || event.clientY < bounds.top || event.clientY >= bounds.bottom);
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => { dialog.current?.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="issue-dialog" aria-labelledby="issue-dialog-title" onCancel={close}
    onPointerDown={(event) => { backdropPress.current = event.button === 0 && isBackdrop(event); }}
    onPointerCancel={() => { backdropPress.current = false; }}
    onClick={(event) => { const dismiss = backdropPress.current && isBackdrop(event); backdropPress.current = false; if (dismiss) close(); }}>
    <header><h2 id="issue-dialog-title">View &amp; resolve</h2><button type="button" autoFocus className="secondary" onClick={close}>Close ×</button></header>
    <div className="issue-dialog-body">{children}</div>
  </dialog>, document.body);
}
