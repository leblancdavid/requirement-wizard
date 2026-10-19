import React, { useState, type ReactNode } from "react";

/** Native disclosure semantics without constructing its hidden subtree. */
export function LazyDetails({ summary, children, className }: {
  summary: ReactNode; children: () => ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false);
  return <details className={className} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{summary}</summary>{open && children()}
  </details>;
}
