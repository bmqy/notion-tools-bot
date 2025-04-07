import { createLogger } from '../utils/logger';
import { KVNamespace } from './types';

const logger = createLogger('TriggerStatus');

// 添加触发状态前缀到KV_PREFIXES中
export const TRIGGER_STATUS_PREFIX = 'trigger_status:';

/**
 * 触发状态接口
 */
export interface TriggerStatus {
  databaseId: string;         // Notion数据库ID
  nextTriggerTime: number;    // 下次触发时间的时间戳
  pending: boolean;           // 是否处于等待触发状态
  updatedAt: number;          // 最后更新时间
}

/**
 * 获取触发状态
 * @param kv KV命名空间
 * @param databaseId 数据库ID
 * @returns 触发状态或null
 */
export async function getTriggerStatus(
  kv: KVNamespace,
  databaseId: string
): Promise<TriggerStatus | null> {
  const key = `${TRIGGER_STATUS_PREFIX}${databaseId}`;
  try {
    const status = await kv.get(key, { type: 'json' }) as TriggerStatus | null;
    logger.debug(`获取触发状态: ${databaseId}, 状态: ${status ? JSON.stringify(status) : 'null'}`);
    return status;
  } catch (error) {
    logger.error(`获取触发状态失败: ${databaseId}`, error);
    return null;
  }
}

/**
 * 更新触发状态
 * @param kv KV命名空间
 * @param databaseId 数据库ID
 * @param delayMinutes 延迟分钟数
 */
export async function updateTriggerStatus(
  kv: KVNamespace,
  databaseId: string,
  delayMinutes: number
): Promise<void> {
  const key = `${TRIGGER_STATUS_PREFIX}${databaseId}`;
  const now = Date.now();
  
  try {
    // 获取当前的触发状态
    const currentStatus = await getTriggerStatus(kv, databaseId);
    
    let nextTriggerTime: number;
    
    // 如果已经存在触发状态且处于pending状态，则从当前的nextTriggerTime开始计算新的延迟
    if (currentStatus && currentStatus.pending) {
      // 从当前的预定触发时间计算新的触发时间
      nextTriggerTime = currentStatus.nextTriggerTime + (delayMinutes * 60 * 1000);
      logger.info(`更新延迟触发时间: ${databaseId}, 原触发时间: ${new Date(currentStatus.nextTriggerTime).toLocaleString()}, 新触发时间: ${new Date(nextTriggerTime).toLocaleString()}, 延迟了${delayMinutes}分钟`);
    } else {
      // 首次触发，从当前时间开始计算
      nextTriggerTime = now + (delayMinutes * 60 * 1000);
      logger.info(`设置初始触发时间: ${databaseId}, 触发时间: ${new Date(nextTriggerTime).toLocaleString()}, 延迟了${delayMinutes}分钟`);
    }
    
    // 创建或更新触发状态
    const status: TriggerStatus = {
      databaseId,
      nextTriggerTime,
      pending: true,
      updatedAt: now
    };
    
    await kv.put(key, JSON.stringify(status));
    logger.info(`触发状态更新成功: ${databaseId}`);
  } catch (error) {
    logger.error(`更新触发状态失败: ${databaseId}`, error);
    throw error;
  }
}

/**
 * 清除触发状态
 * @param kv KV命名空间
 * @param databaseId 数据库ID
 */
export async function clearTriggerStatus(
  kv: KVNamespace,
  databaseId: string
): Promise<void> {
  const key = `${TRIGGER_STATUS_PREFIX}${databaseId}`;
  
  try {
    // 直接删除状态
    await kv.delete(key);
    logger.info(`清除触发状态成功: ${databaseId}`);
  } catch (error) {
    logger.error(`清除触发状态失败: ${databaseId}`, error);
    throw error;
  }
}

/**
 * 检查是否可以触发动作
 * @param kv KV命名空间
 * @param databaseId 数据库ID
 * @returns 是否可以触发
 */
export async function canTriggerActions(
  kv: KVNamespace,
  databaseId: string
): Promise<boolean> {
  const status = await getTriggerStatus(kv, databaseId);
  
  // 如果没有状态，可以立即触发
  if (!status) {
    logger.info(`可以立即触发动作: ${databaseId}, 未设置触发状态`);
    return true;
  }
  
  const now = Date.now();
  const nextTriggerTime = status.nextTriggerTime;
  
  // 如果当前时间已经超过了下次触发时间，可以触发
  if (now >= nextTriggerTime) {
    logger.info(`可以触发动作: ${databaseId}, 当前时间: ${new Date(now).toLocaleString()}, 已超过触发时间: ${new Date(nextTriggerTime).toLocaleString()}`);
    return true;
  }
  
  // 否则，还不能触发
  logger.info(`不能触发动作: ${databaseId}, 当前时间: ${new Date(now).toLocaleString()}, 触发时间: ${new Date(nextTriggerTime).toLocaleString()}`);
  return false;
} 
