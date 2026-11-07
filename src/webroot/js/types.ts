export interface PackageInfo { packageName: string; appLabel: string; }

export interface KsuBridge {
  exec(command: string, options: string, callback: string): void;
  spawn?(program: string, args: string, options: string, name: string): void;
  getPackagesInfo?(packagesJson: string): string;
}

export interface ModulePaths { MODDIR: string; SPECTER_DIR?: string; }

export interface InfoJson { android?: string; kernel?: string; root?: string; root_sol?: string; version?: string; security_patch?: string; build_patch?: string; pif_model?: string; }

export interface KeyboxInfoJson {
  installed: boolean;
  source?: string;
  source_version?: string;
  text?: string;
  up_to_date?: boolean;
  latest_version?: string;
  revoked?: boolean;
  softbanned?: boolean;
  serial?: string;
  is_private?: boolean;
  rkp?: boolean;
  expires_at?: string | null;
  expired?: boolean;
  cert_validity?: 'valid' | 'expired' | 'not_yet_valid' | 'unknown';
  checked_at?: string;
  revocation_status?: string;
  revocation_reason?: string;
  revocation_source?: string;
  revocation_checked_at?: string;
  file_path?: string;
  file_size?: number;
  file_modified?: string;
}

export interface ConflictModule {
  key: string;
  friendlyName: string;
  detected: boolean;
  prioritySpecter: boolean;
  type?: string;
  features?: string;
}

export interface ModulesStateJson {
  modules: Record<string, boolean>;
  conflicts: ConflictModule[];
  checked_at?: string;
}

export interface SetupInfoRow {
  label: string;
  value: string;
}

export interface SetupInfoModule {
  id: string;
  name: string;
  version?: string;
  rows: SetupInfoRow[];
}

export interface SetupInfoJson {
  generated_at?: string;
  device?: Record<string, string>;
  modules?: SetupInfoModule[];
  features?: SetupInfoRow[];
  warnings?: string[];
}

export interface KeystoreManagerJson { id: string; name?: string; format?: string; dir?: string; targets?: string; config?: string; perAppModes?: boolean; }

export interface DevEntry { name: string; role: string; github: string; avatar: string; }

export interface CatalogEntry {
  source: string;
  version: string;
  text: string;
  revoked: boolean;
  softbanned: boolean;
  serial: string;
  last_checked: string;
  timestamp: string;
  rkp?: boolean;
  expires_at?: string | null;
  revocation_status?: string;
  revocation_reason?: string;
  revocation_checked_at?: string;
}

export interface CatalogJson { entries: CatalogEntry[]; latest: Record<string, string>; working: { source: string; version: string }; workingEntries: { source: string; version: string; text: string }[]; }

export interface ScriptResult { success: boolean; output?: string; rawOutput: string; }

export interface ExecResult { code?: number; stdout: string; stderr: string; }

export type ChildEventCallback = (...args: unknown[]) => void;

export interface ChildProcess {
  stdout: { on(ev: 'data', fn: (data: string) => void): void; emit(ev: 'data', data: string): void };
  stderr: { on(ev: 'data', fn: (data: string) => void): void; emit(ev: 'data', data: string): void };
  on(ev: 'exit', fn: (code: number) => void): void;
  on(ev: 'error', fn: (err: Error) => void): void;
  on(ev: string, fn: ChildEventCallback): void;
  emit(ev: string, ...args: unknown[]): void;
}

declare global { interface Window { ksu: KsuBridge; isOverlayOpen: boolean; } }
