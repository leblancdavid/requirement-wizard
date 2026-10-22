import "./desktop-titlebar.css";

export function DesktopTitleBar() {
  if (!window.reqwizitDesktop?.titleBarOverlay) return null;
  return <div className="desktop-titlebar"><img src="/reqwizit.svg" alt="" width="22" height="22" /><span>Reqwizit</span></div>;
}
