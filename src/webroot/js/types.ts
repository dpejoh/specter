export interface KsuBridge {
  exec(command: string, options: string, callback: string): void;
  spawn?(program: string, args: string, options: string, name: string): void;
}

export interface ChildProcess {
  stdout: {
    on(ev: 'data', fn: (data: string) => void): void;
    emit(ev: 'data', data: string): void;
  };
  stderr: {
    on(ev: 'data', fn: (data: string) => void): void;
    emit(ev: 'data', data: string): void;
  };
  stdin: { on(): void; emit(): void };
  on(ev: 'exit' | 'error', fn: (...args: any[]) => void): void;
  emit(ev: string, ...args: any[]): void;
}

export interface ModulePaths {
  MODDIR: string;
}

export interface InfoJson {
  android?: string;
  kernel?: string;
  root?: string;
  root_sol?: string;
  version?: string;
  tee_status?: string;
  security_patch?: string;
  build_patch?: string;
  flags?: { twrp?: boolean; blacklist?: boolean; recovery_detected?: boolean };
}

export interface KeyboxInfoJson {
  installed: boolean;
  source?: string;
  source_version?: string;
  text?: string;
  up_to_date?: boolean;
  revoked?: boolean;
  softbanned?: boolean;
  serial?: string;
  is_private?: boolean;
}

export interface DevEntry {
  name: string;
  role: string;
  github: string;
  avatar: string;
}

export interface CatalogEntry {
  source: string;
  version: string;
  text: string;
  revoked: boolean;
  softbanned: boolean;
  serial: string;
  last_checked: string;
  timestamp: string;
}

export interface CatalogJson {
  entries: CatalogEntry[];
  latest: Record<string, string>;
  working: { source: string; version: string };
}

export interface ScriptResult {
  success: boolean;
  output?: string;
  rawOutput: string;
}

export interface ExecResult {
  code?: number;
  stdout: string;
  stderr: string;
}

declare global {
  interface Window {
    ksu: KsuBridge;
    [key: string]: unknown;
  }
}
