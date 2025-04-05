import { Client } from '@notionhq/client';
import type { DatabaseObjectResponse, PageObjectResponse, PartialDatabaseObjectResponse, PartialPageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { createLogger } from '../utils/logger';
import { KVNamespace as CloudflareKV } from './types';

const logger = createLogger('notion-database');

export interface NotionDatabase {
  id: string;
  title: string;
  url: string;
  last_synced: string;
  name?: string;
  githubRepoId?: string | null;
  updatedAt: string;
}

type NotionSearchResult = DatabaseObjectResponse | PartialDatabaseObjectResponse | PageObjectResponse | PartialPageObjectResponse;

export async function getAllNotionDatabases(env: { NOTION_TOKEN: string; KV: CloudflareKV }): Promise<NotionDatabase[]> {
  const notion = new Client({
    auth: env.NOTION_TOKEN,
  });

  try {
    const response = await notion.search({
      filter: {
        property: 'object',
        value: 'database',
      },
    });

    const databases = response.results.map((db: NotionSearchResult) => ({
      id: db.id,
      title: 'title' in db ? db.title[0]?.plain_text || 'Untitled Database' : 'Untitled Database',
      url: 'url' in db ? db.url : '',
      last_synced: new Date().toISOString(),
      name: 'title' in db ? db.title[0]?.plain_text || 'Untitled Database' : 'Untitled Database',
      updatedAt: new Date().toISOString(),
    }));

    // 保存到 KV 存储
    await env.KV.put('notion_databases', JSON.stringify(databases));

    return databases;
  } catch (error) {
    logger.error('Failed to fetch Notion databases', { error });
    throw error;
  }
}

/**
 * 格式化数据库 ID，移除连字符
 */
export function formatDatabaseId(id: string): string {
  return id.replace(/-/g, '');
}

export async function getNotionDatabase(env: { NOTION_TOKEN: string; KV: CloudflareKV }, databaseId: string, autoAdd: boolean = false): Promise<NotionDatabase | null> {
  const formattedId = formatDatabaseId(databaseId);
  
  // 从 KV 存储中获取数据
  const databases = await getAllNotionDatabasesFromKV(env.KV);
  const existingDb = databases.find(db => formatDatabaseId(db.id) === formattedId);
  
  if (existingDb) {
    return existingDb;
  }

  // 如果 KV 中没有找到，则从 Notion API 获取
  const notion = new Client({
    auth: env.NOTION_TOKEN,
  });

  try {
    const database = await notion.databases.retrieve({ database_id: formattedId });
    
    // 创建数据库对象
    const newDatabase: NotionDatabase = {
      id: database.id,
      title: 'title' in database ? database.title[0]?.plain_text || 'Untitled Database' : 'Untitled Database',
      url: 'url' in database ? database.url : '',
      last_synced: new Date().toISOString(),
      name: 'title' in database ? database.title[0]?.plain_text || 'Untitled Database' : 'Untitled Database',
      updatedAt: new Date().toISOString(),
      githubRepoId: null
    };
    
    // 只有在 autoAdd 为 true 时才自动添加到 KV 存储
    if (autoAdd) {
      await addNotionDatabase(env.KV, newDatabase);
    }
    
    return newDatabase;
  } catch (error) {
    logger.error('Failed to fetch Notion database', { error, databaseId: formattedId });
    return null;
  }
}

const NOTION_DATABASES_KEY = 'notion_databases';

/**
 * 获取所有 Notion 数据库
 */
export async function getAllNotionDatabasesFromKV(kv: CloudflareKV): Promise<NotionDatabase[]> {
  const data = await kv.get(NOTION_DATABASES_KEY, { type: 'json' });
  return data as NotionDatabase[] || [];
}

/**
 * 添加 Notion 数据库
 */
export async function addNotionDatabase(kv: CloudflareKV, database: NotionDatabase): Promise<void> {
  try {
    // 获取现有的数据库列表
    const databases = await getAllNotionDatabasesFromKV(kv);
    
    // 检查是否已存在
    const existingIndex = databases.findIndex(db => formatDatabaseId(db.id) === formatDatabaseId(database.id));
    if (existingIndex >= 0) {
      // 如果已存在，更新现有记录
      databases[existingIndex] = {
        ...databases[existingIndex],
        ...database,
        updatedAt: new Date().toISOString(),
      };
    } else {
      // 如果不存在，添加新记录
      databases.push(database);
    }
    
    // 更新 KV 存储
    await kv.put(NOTION_DATABASES_KEY, JSON.stringify(databases));
    
    logger.info('Successfully added/updated Notion database', { databaseId: database.id });
  } catch (error) {
    logger.error('Failed to add Notion database', { error, databaseId: database.id });
    throw error;
  }
}

/**
 * 更新 Notion 数据库
 */
export async function updateNotionDatabase(kv: CloudflareKV, databaseId: string, updates: Partial<NotionDatabase>): Promise<void> {
  try {
    const formattedId = formatDatabaseId(databaseId);
    
    // 获取现有的数据库列表
    const databases = await getAllNotionDatabasesFromKV(kv);
    
    // 查找要更新的数据库
    const index = databases.findIndex(db => formatDatabaseId(db.id) === formattedId);
    if (index === -1) {
      throw new Error(`Database ${databaseId} not found`);
    }
    
    // 更新数据库
    databases[index] = {
      ...databases[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    // 更新 KV 存储
    await kv.put(NOTION_DATABASES_KEY, JSON.stringify(databases));
    
    logger.info('Successfully updated Notion database', { databaseId });
  } catch (error) {
    logger.error('Failed to update Notion database', { error, databaseId });
    throw error;
  }
}

/**
 * 删除 Notion 数据库
 */
export async function deleteNotionDatabase(kv: CloudflareKV, databaseId: string): Promise<void> {
  try {
    const formattedId = formatDatabaseId(databaseId);
    
    // 获取现有的数据库列表
    const databases = await getAllNotionDatabasesFromKV(kv);
    
    // 过滤掉要删除的数据库
    const filteredDatabases = databases.filter(db => formatDatabaseId(db.id) !== formattedId);
    
    // 更新 KV 存储
    await kv.put(NOTION_DATABASES_KEY, JSON.stringify(filteredDatabases));
    
    logger.info('Successfully deleted Notion database', { databaseId });
  } catch (error) {
    logger.error('Failed to delete Notion database', { error, databaseId });
    throw error;
  }
} 
