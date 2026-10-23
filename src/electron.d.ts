export {};
declare global {
  interface Window {
    sicovenStore?: {
      login: (credentials: { username: string; password: string }) => Promise<{ ok: boolean; message?: string; token?: string; user?: { username: string; role: string; isSeed: boolean } }>;
      logout: (token: string) => Promise<{ ok: boolean }>;
      listAdmins: (token: string) => Promise<{ ok: boolean; message?: string; admins?: Array<{ id: number; username: string; isSeed: boolean; createdAt: string }> }>;
      createAdmin: (token: string, input: { username: string; password: string }) => Promise<{ ok: boolean; message?: string }>;
      deleteSeedAdmin: (token: string) => Promise<{ ok: boolean; message?: string }>;
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
