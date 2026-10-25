export {};
declare global {
  interface Window {
    sicovenStore?: {
      getLicenseStatus: () => Promise<{ authorized: boolean; needsActivation: boolean; status: string; customer?: string; product?: string; offlineUntil?: string | null; lastCheckedAt?: string | null; message?: string }>;
      activateLicense: (key: string) => Promise<{ ok: boolean; message?: string; license?: { authorized: boolean; needsActivation: boolean; status: string; message?: string; customer?: string; product?: string; offlineUntil?: string | null; lastCheckedAt?: string | null } }>;
      revalidateLicense: () => Promise<{ authorized: boolean; needsActivation: boolean; status: string; message?: string; customer?: string; product?: string }>;
      onLicenseStatusChanged: (callback: (status: { authorized: boolean; status: string; message?: string }) => void) => () => void;
      login: (credentials: { username: string; password: string }) => Promise<{ ok: boolean; message?: string; token?: string; user?: { username: string; role: string; isSeed: boolean } }>;
      restoreSession: (token: string) => Promise<{ ok: boolean; message?: string; token?: string; user?: { username: string; role: string; isSeed: boolean } }>;
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
