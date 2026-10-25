export {};
declare global {
  interface Window {
    reqwizitDesktop?: {
      titleBarOverlay: boolean;
      setTitleBarColors(color: string, symbolColor: string): Promise<void>;
      chooseDirectory(): Promise<string | null>;
      openExternal(url: string): Promise<void>;
      quit(): Promise<void>;
      copyText(text: string): Promise<void>;
    };
  }
}
