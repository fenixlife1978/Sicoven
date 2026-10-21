export {};
declare global {
  interface Window {
    sicovenStore?: {
      load: () => Promise<Record<string, unknown> | null>;
      save: (state: Record<string, unknown>) => Promise<{ ok: boolean; savedAt: string }>;
      getDemoUsage: () => Record<string, number>;
      consumeDemoAction: (moduleKey: string) => {
        ok: boolean;
        used?: number;
        usage?: Record<string, number>;
        error?: string;
      };
    };
  }
}
