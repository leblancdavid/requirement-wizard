export {};
declare global {
  interface Window {
    reqwizitDesktop?: {
      chooseDirectory(): Promise<string | null>;
      openExternal(url: string): Promise<void>;
    };
  }
}
