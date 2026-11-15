import React from "react";
import type { Project } from "../core/model.js";
import type { Organization } from "../core/epics.js";
import { PagedList } from "./pagination.js";

export function OrganizationPreview({ project, operations }: { project: Project; operations: Organization[] }) {
  const splitDestinations = new Set(operations.flatMap(op => op.type === "split" ? op.destinations.map(d => d.epicID) : []));
  const title = (id: string) => {
    const proposed = operations.find(op => op.type === "upsert" && op.epicID === id);
    return proposed?.type === "upsert" ? proposed.title : project.epics.find(e => e.id === id)?.title ?? id;
  };
  const records = [
    ...project.requirements.map(r => ({ id: r.id, label: `Requirement: ${r.statement}` })),
    ...project.questions.map(q => ({ id: q.id, label: `${q.status === "retired" ? "Historical question" : "Question"}: ${q.text}` })),
    ...project.research.map(r => ({ id: r.id, label: `Research: ${r.title}` })),
    ...project.sources.filter(s => s.kind === "note").map(s => ({ id: s.id, label: `Note: ${s.text}` })),
  ];
  return <details><summary>Suggested changes</summary>{operations.map((op, index) => op.type === "split"
    ? <section key={index}><h4>Split {title(op.epicID)} into {op.destinations.length} features</h4><p>{op.reason}</p>
      <p>The original feature will be archived. Answers, requirement decisions and original records stay saved. New features need their own definition reviews; related plans and checks may become outdated.</p>
      {project.epics.some(e => !e.archived && e.dependencies.includes(op.epicID)) && <p>Features currently depending on {title(op.epicID)} ({project.epics.filter(e => !e.archived && e.dependencies.includes(op.epicID)).map(e => e.title).join(", ")}) will depend on all the new features.</p>}
      {op.destinations.map(destination => { const definition = operations.find(item => item.type === "upsert" && item.epicID === destination.epicID);
        return <section key={destination.epicID}><h5>{title(destination.epicID)} · {destination.recordIDs.length} {destination.recordIDs.length === 1 ? "record" : "records"}</h5>
          {definition?.type === "upsert" && <><p>{definition.purpose}</p><p>Depends on: {[...new Set([...definition.dependencies, ...project.epics.find(e => e.id === op.epicID)?.dependencies ?? []])].filter(id => id !== destination.epicID && id !== op.epicID).map(title).join(", ") || "No earlier feature"}</p></>}
          <PagedList items={destination.recordIDs.map(id => records.find(r => r.id === id) ?? { id, label: id })} itemID={r => r.id} label={`Proposed ${title(destination.epicID)}`}>{record => <p>{record.label}</p>}</PagedList>
        </section>; })}</section>
    : op.type === "upsert" ? splitDestinations.has(op.epicID) ? null : <p key={index}>{op.title} — {op.purpose}</p>
      : <p key={index}>{op.type === "merge" ? op.reason : `Move a record to ${title(op.epicID)}`}</p>)}</details>;
}
