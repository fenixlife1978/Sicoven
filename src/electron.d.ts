export {};
declare global {
  interface Window {
    sicovenStore?: {
      load: () => Promise<Record<string, unknown> | null>;
      save: (state: Record<string, unknown>) => Promise<{ ok: boolean; savedAt: string }>;
    };
  }
}
