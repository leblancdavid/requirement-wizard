import React, { useState, type ReactNode } from "react";
import { Pagination, usePagination } from "./pagination.js";

export function matchesRequirementSearch(query: string, fields: string[]) {
  const text = fields.join(" ").toLowerCase();
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean).every((term) => text.includes(term));
}

export interface EpicRequirementGroup<T> {
  id: string;
  title: string;
  items: T[];
  summary?: ReactNode;
  introduction?: ReactNode;
}

/** Each epic owns its navigation; hiding a page does not discard review drafts. */
export function EpicRequirements<T>({ groups, scope, label, itemID, target, children }: {
  groups: EpicRequirementGroup<T>[]; scope: string; label: string;
  itemID: (item: T) => string; target?: string | null; children: (item: T) => ReactNode;
}) {
  const targetEpic = target ? groups.find((group) => group.items.some((item) => itemID(item) === target))?.id : undefined;
  const targetKey = target ? `${scope}:${target}` : undefined;
  const [dismissedTarget, setDismissedTarget] = useState<string>();
  const paging = usePagination(groups.map((group) => group.id), scope, targetKey !== dismissedTarget ? targetEpic : undefined);
  return <div className="epic-requirements">
    <Pagination paging={paging} label={`${label} epics`} onNavigate={() => setDismissedTarget(targetKey)} />
    {groups.slice(paging.start, paging.end).map((group) => <EpicRequirementsPage key={group.id} group={group} scope={scope} label={label} itemID={itemID} target={targetEpic === group.id ? target : undefined}>{children}</EpicRequirementsPage>)}
    {paging.pages > 1 && <Pagination paging={paging} label={`${label} epics bottom`} onNavigate={() => setDismissedTarget(targetKey)} />}
  </div>;
}

function EpicRequirementsPage<T>({ group, scope, label, itemID, target, children }: {
  group: EpicRequirementGroup<T>; scope: string; label: string; itemID: (item: T) => string;
  target?: string | null; children: (item: T) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const targetKey = target ? `${scope}:${target}` : undefined;
  const [dismissedTarget, setDismissedTarget] = useState<string>();
  const [navigationTarget, setNavigationTarget] = useState<string>();
  const open = expanded || !!targetKey && targetKey !== dismissedTarget;
  const paging = usePagination(group.items.map(itemID), `${scope}:${group.id}`, targetKey !== navigationTarget ? target : undefined);
  const pageLabel = `${label} ${group.title} requirements`;
  return <details className="feature-group" open={open}>
    <summary aria-expanded={open} onClick={(event) => {
      event.preventDefault();
      setExpanded(!open); if (open) setDismissedTarget(targetKey);
    }}><strong>{group.title}</strong><span>{group.items.length} {group.items.length === 1 ? "requirement" : "requirements"}{group.summary}</span></summary>
    {open && <div className="epic-requirement-page">
      {group.introduction}
      <Pagination paging={paging} label={pageLabel} onNavigate={() => setNavigationTarget(targetKey)} />
      {group.items.slice(paging.start, paging.end).map((item) => <React.Fragment key={itemID(item)}>{children(item)}</React.Fragment>)}
      {paging.pages > 1 && <Pagination paging={paging} label={`${pageLabel} bottom`} onNavigate={() => setNavigationTarget(targetKey)} />}
    </div>}
  </details>;
}
