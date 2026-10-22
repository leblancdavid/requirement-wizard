import { useEffect, useRef, useState } from "react";
import "./app-menu.css";

type ProjectItem = { id: string; name: string };
const recentKey = "reqwizit-recent-workspaces";
function savedRecents(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(recentKey) ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string"))].slice(0, 100) : [];
  } catch { return []; }
}

export function AppMenu({ projects, activeID, newProject, openProject, selectProject, settings, reportError }: {
  projects: ProjectItem[]; activeID: string | null;
  newProject: () => void; openProject: () => void; selectProject: (id: string) => void;
  settings: () => void; reportError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [recents, setRecents] = useState(savedRecents);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!activeID) return;
    setRecents((previous) => {
      return [activeID, ...previous.filter((id) => id !== activeID)].slice(0, 100);
    });
  }, [activeID]);
  useEffect(() => {
    try { localStorage.setItem(recentKey, JSON.stringify(recents)); } catch { /* Session-only ordering if storage is unavailable. */ }
  }, [recents]);
  function close(restore = true) {
    setOpen(false); setRecentOpen(false);
    if (restore) trigger.current?.focus({ preventScroll: true });
  }
  function choose(action: () => void) { close(); action(); }
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const rank = new Map(recents.map((id, index) => [id, index]));
  const ordered = [...projects].sort((a, b) => (rank.get(a.id) ?? recents.length) - (rank.get(b.id) ?? recents.length));
  return <div className="app-menu" ref={root} onBlur={(event) => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close(false);
  }} onKeyDown={(event) => {
    if (!open) {
      if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); }
      return;
    }
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>("button") ?? []).filter((button) => !button.closest("[hidden]"));
    if (!buttons.length) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }}>
    <button className="app-menu-toggle" ref={trigger} aria-label="Application menu" title="Application menu" aria-expanded={open} aria-controls="application-menu" onClick={() => open ? close() : setOpen(true)}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
    </button>
    {open && <nav id="application-menu" className="app-menu-panel" aria-label="Application" ref={panel}>
      <div className="app-menu-brand"><img src="/reqwizit.svg" width="24" height="24" alt="" /> Reqwizit</div>
      <button onClick={() => choose(newProject)}>New project</button>
      <button onClick={() => choose(openProject)}>Open project</button>
      <button aria-expanded={recentOpen} aria-controls="recent-workspaces" onClick={() => setRecentOpen(!recentOpen)}>Recent workspaces <span aria-hidden="true">{recentOpen ? "▾" : "▸"}</span></button>
      <div id="recent-workspaces" className="recent-workspaces" hidden={!recentOpen}>
        {ordered.length ? ordered.map((item) => <button key={item.id} className={`project-link ${activeID === item.id ? "selected" : ""}`} aria-current={activeID === item.id ? "page" : undefined} onClick={() => choose(() => selectProject(item.id))}>{item.name}</button>) : <p>No saved workspaces yet.</p>}
      </div>
      <button onClick={() => choose(settings)}>Settings</button>
      {window.reqwizitDesktop && <><hr /><button onClick={() => choose(() => {
        void window.reqwizitDesktop!.quit().catch(() => reportError("Could not quit Reqwizit. Try closing the window."));
      })}>Quit</button></>}
    </nav>}
  </div>;
}
