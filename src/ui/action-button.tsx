import React, { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DisabledReason = createContext("Wait for the current action to finish.");

/** Applies accessible disabled buttons to JSX owned by this view, including lazy drawers.
 * Component boundaries inherit the reason; their own scopes prepare their JSX.
 */
export function ActionScope({ reason, children }: { reason?: string; children: React.ReactNode }) {
  const inheritedReason = useContext(DisabledReason);
  reason ||= inheritedReason;
  function prepare(nodes: React.ReactNode, inheritedDisabled = false): React.ReactNode {
    if (Array.isArray(nodes)) {
      const children = nodes.map((node: React.ReactNode) => prepare(node, inheritedDisabled));
      return children.every((child, index) => child === nodes[index]) ? nodes : children;
    }
    if (!React.isValidElement<Record<string, unknown>>(nodes)) {
      if (nodes && typeof nodes === "object" && Symbol.iterator in nodes) return prepare(Array.from(nodes as Iterable<React.ReactNode>), inheritedDisabled);
      return nodes;
    }
    const node = nodes;
    const props = node.props;
    const fieldset = node.type === "fieldset" && !!props.disabled;
    const disabled = inheritedDisabled || !!props.disabled;
    const child = typeof props.children === "function"
      ? (...args: unknown[]) => prepare((props.children as (...args: unknown[]) => React.ReactNode)(...args), inheritedDisabled || fieldset)
      : prepare(props.children as React.ReactNode, inheritedDisabled || fieldset);
    if (node.type === "button" && disabled) return <ActionButton key={node.key} {...props} disabled reason={typeof props.title === "string" ? props.title : reason}>{child as React.ReactNode}</ActionButton>;
    if (!fieldset && !(inheritedDisabled && (["input", "textarea", "select"].includes(String(node.type)) || node.type === ActionButton)) && child === props.children) return node;
    return React.cloneElement(node, {
      ...(fieldset ? { disabled: false, "aria-disabled": true } : {}),
      ...(inheritedDisabled && ["input", "textarea", "select"].includes(String(node.type)) ? { disabled: true } : {}),
      ...(inheritedDisabled && node.type === ActionButton ? { disabled: true } : {}),
      ...(props.children !== undefined ? { children: child } : {}),
    });
  }
  return <DisabledReason.Provider value={reason}>{prepare(children)}</DisabledReason.Provider>;
}

/** Disabled actions stay focusable so their explanation works with keyboard and touch. */
export function ActionButton({ disabled, reason, title, onClick, onKeyDown, onBlur, onPointerEnter, onPointerLeave, onFocus, ...props }:
  React.ComponentPropsWithRef<"button"> & { reason?: string }) {
  const id = useId();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const cancelHide = () => { clearTimeout(hideTimer.current); };
  const hide = () => { cancelHide(); hideTimer.current = setTimeout(() => setAnchor(null), 180); };
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  useEffect(() => { if (!disabled) setAnchor(null); }, [disabled]);
  useEffect(() => {
    if (!anchor) return;
    // A disabled action may remain mounted inside a hidden tab. Do not leave
    // its body/dialog portal covering a different action after navigation.
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target)) setAnchor(null);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("focusin", dismissOutside, true);
    return () => { document.removeEventListener("pointerdown", dismissOutside, true); document.removeEventListener("focusin", dismissOutside, true); };
  }, [anchor]);
  const inheritedReason = useContext(DisabledReason);
  const explanation = disabled ? reason || title || inheritedReason : undefined;
  const show = (element: HTMLButtonElement) => { trigger.current = element; cancelHide(); setDismissed(false); setAnchor(element.getBoundingClientRect()); setPortal(element.closest("dialog") ?? document.body); };
  return <>
    <button {...props} aria-disabled={disabled || undefined} title={disabled ? undefined : title}
      aria-describedby={[props["aria-describedby"], explanation ? id : undefined].filter(Boolean).join(" ") || undefined}
      onClick={(event) => { if (disabled) { event.preventDefault(); event.stopPropagation(); show(event.currentTarget); } else onClick?.(event); }}
      onKeyDown={(event) => { if (event.key === "Escape" && anchor) { event.preventDefault(); event.stopPropagation(); setDismissed(true); setAnchor(null); } onKeyDown?.(event); }}
      onFocus={(event) => { if (disabled) show(event.currentTarget); onFocus?.(event); }}
      onBlur={(event) => { hide(); onBlur?.(event); }}
      onPointerEnter={(event) => { if (disabled) show(event.currentTarget); onPointerEnter?.(event); }}
      onPointerLeave={(event) => { if (document.activeElement !== event.currentTarget) hide(); onPointerLeave?.(event); }} />
    {explanation && <span id={id} className="sr-only">{explanation}</span>}
    {explanation && anchor && portal && !dismissed && createPortal(<span role="tooltip" className="action-tooltip" onPointerEnter={cancelHide} onPointerLeave={hide} style={{ left: Math.max(8, Math.min(anchor.left, window.innerWidth - Math.min(360, window.innerWidth - 16) - 8)), top: anchor.bottom < window.innerHeight - 120 ? anchor.bottom + 8 : Math.max(8, anchor.top - 112), maxHeight: 104 }}>{explanation}</span>, portal)}
  </>;
}
