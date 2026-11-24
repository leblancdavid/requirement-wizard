export {};
declare global {
  interface Window {
    reqwizitDesktop?: {
      readWorkspaceHistory(): import("../core/workspace-history.js").WorkspaceHistorySnapshot;
      saveWorkspaceHistory(history: import("../core/workspace-history.js").WorkspaceHistory): Promise<void>;
      titleBarOverlay: boolean;
      setTitleBarColors(color: string, symbolColor: string): Promise<void>;
      chooseDirectory(): Promise<string | null>;
      openExternal(url: string): Promise<void>;
      quit(): Promise<void>;
      copyText(text: string): Promise<void>;
    };
  }
}
