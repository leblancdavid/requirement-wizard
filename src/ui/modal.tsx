import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./modal.css";

let openModals = 0;
let previousOverflow = "";

export function Modal({ id, className = "", titleID, title, description, close, closeLabel, closeText = "Close ×", headerClassName = "", bodyClassName = "", children }: {
  id?: string; className?: string; titleID: string; title: React.ReactNode; description?: React.ReactNode;
  close: () => void; closeLabel?: string; closeText?: string; headerClassName?: string; bodyClassName?: string; children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  function isBackdrop(event: React.MouseEvent<HTMLDialogElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX >= bounds.right || event.clientY < bounds.top || event.clientY >= bounds.bottom);
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    if (openModals++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    element.showModal();
    return () => {
      element.close();
      if (--openModals === 0) document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<dialog ref={dialog} id={id} className={`modal ${className}`} aria-labelledby={titleID} onCancel={close}
    onKeyDown={(event) => {
      if (event.key !== "Tab" || !event.currentTarget.contains(document.activeElement)) return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]'))
        .filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
      const target = event.shiftKey ? controls.at(-1) : controls[0];
      if (!controls.length || (event.shiftKey ? document.activeElement === controls[0] : document.activeElement === controls.at(-1))) {
        event.preventDefault();
        (target ?? event.currentTarget).focus();
      }
    }}
    onPointerDown={(event) => { backdropPress.current = event.button === 0 && isBackdrop(event); }}
    onPointerCancel={() => { backdropPress.current = false; }}
    onClick={(event) => { const dismiss = backdropPress.current && isBackdrop(event); backdropPress.current = false; if (dismiss) close(); }}>
    <header className={`modal-heading ${headerClassName}`}><div><h2 id={titleID}>{title}</h2>{description}</div><button type="button" autoFocus className="secondary" aria-label={closeLabel} onClick={close}>{closeText}</button></header>
    <div className={`modal-body ${bodyClassName}`}>{children}</div>
  </dialog>, document.body);
}
