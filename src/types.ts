export interface KVNamespace {
  get(key: string, options?: { type: 'text' }): Promise<string | null>;
  get(key: string, options?: { type: 'json' }): Promise<unknown>;
  get(key: string, options?: { type: 'arrayBuffer' }): Promise<ArrayBuffer | null>;
  get(key: string, options?: { type: 'stream' }): Promise<ReadableStream | null>;
  put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream, options?: KVNamespacePutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: KVNamespaceListOptions): Promise<KVNamespaceListResult>;
}

export interface KVNamespacePutOptions {
  expiration?: number;
  expirationTtl?: number;
  metadata?: Record<string, unknown>;
}

export interface KVNamespaceListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

export interface KVNamespaceListResult {
  keys: Array<{
    name: string;
    expiration?: number;
    metadata?: Record<string, unknown>;
  }>;
  list_complete: boolean;
  cursor?: string;
}

export interface Env {
  // Telegram 配置
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_ADMIN_USER_ID?: string;
  
  // GitHub 配置
  GITHUB_TOKEN?: string;
  
  // Notion 配置
  NOTION_TOKEN: string;
  NOTION_TOOLS_BOT: KVNamespace;
  
  // 触发延迟配置
  TRIGGER_DELAY_MINUTES?: string; // 延迟触发时间（分钟），默认为 5 分钟
} 
