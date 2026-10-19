import React, { createContext, useContext, useEffect, useId, useState, type ReactNode } from "react";
import "./activity.css";

type Activity = { id: string; label: string };
const ActivityContext = createContext<{ activities: Activity[]; update: (id: string, label?: string) => void }>({ activities: [], update: () => {} });

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [update] = useState(() => (id: string, label?: string) => setActivities((items) => {
    const remaining = items.filter((item) => item.id !== id);
    return label ? [...remaining, { id, label }] : remaining;
  }));
  return <ActivityContext.Provider value={{ activities, update }}>{children}</ActivityContext.Provider>;
}

// Register foreground work once; periodic snapshot polling is deliberately excluded.
export function useActivity(active: boolean, label: string) {
  const id = useId();
  const { update } = useContext(ActivityContext);
  useEffect(() => { if (active) update(id, label); return () => update(id); }, [active, label, id, update]);
}

export function Spinner() {
  return <span className="activity-spinner" aria-hidden="true" />;
}

export function ActivityBar({ label, completed, total }: { label: string; completed?: number; total?: number }) {
  const measured = total !== undefined && Number.isFinite(total) && total > 0 && completed !== undefined && Number.isFinite(completed);
  const value = measured ? Math.max(0, Math.min(100, completed / total * 100)) : undefined;
  return <span className={`activity-bar ${measured ? "" : "indeterminate"}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={measured ? `${completed} of ${total}` : "In progress"}><span style={measured ? { width: `${value}%` } : undefined} /></span>;
}

export function ActivityFeedback({ label, completed, total }: { label: string; completed?: number; total?: number }) {
  return <div className="activity-feedback"><span className="activity-label" role="status"><Spinner />{label}</span><ActivityBar label={label} completed={completed} total={total} /></div>;
}

export function HeaderActivity() {
  const { activities } = useContext(ActivityContext);
  if (!activities.length) return null;
  const label = activities.length > 1 ? `${activities.length} actions in progress` : activities[0]!.label;
  return <div className="header-activity" aria-label="Workspace activity"><ActivityFeedback label={label} />{activities.length > 1 && <small>{activities.map((item) => item.label).join(" · ")}</small>}</div>;
}
