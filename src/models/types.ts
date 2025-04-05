/**
 * Notion 数据库类型定义
 */
export interface NotionDatabase {
  id: string;  // Notion 数据库 ID
  name?: string;  // 数据库名称
  createdAt: string;  // 创建时间
  updatedAt: string;  // 更新时间
  githubRepoId?: string | null;  // 关联的 GitHub 仓库 ID
}

/**
 * GitHub 仓库类型定义
 */
export interface GithubRepo {
  id: string;  // 仓库唯一 ID (使用 owner_repo 格式作为唯一键)
  owner: string;  // 仓库所有者
  repo: string;  // 仓库名称
  createdAt: string;  // 创建时间
  updatedAt: string;  // 更新时间
}

/**
 * KV 存储前缀常量
 */
export const KV_PREFIXES = {
  NOTION_DB: 'notion_db:',
  GITHUB_REPO: 'github_repo:',
  NOTION_DB_LIST: 'notion_db_list',
  GITHUB_REPO_LIST: 'github_repo_list',
} as const;

// 导出 Cloudflare Workers 的类型
export type { ExecutionContext } from '@cloudflare/workers-types';

/**
 * Cloudflare KV 命名空间接口
 */
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

/**
 * 日志记录器接口
 */
export interface Logger {
  info(message: string): void;
  error(message: string): void;
  warn(message: string): void;
  debug(message: string): void;
  log(message: string): void;
}

