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
    // 获取当前的触发状态（仅用于日志记录）
    const currentStatus = await getTriggerStatus(kv, databaseId);
    
    // 总是从当前时间开始计算新的触发时间
    const nextTriggerTime = now + (delayMinutes * 60 * 1000);
    
    if (currentStatus) {
      logger.info(`更新延迟触发时间: ${databaseId}, 原触发时间: ${new Date(currentStatus.nextTriggerTime).toLocaleString()}, 新触发时间: ${new Date(nextTriggerTime).toLocaleString()}, 延迟了${delayMinutes}分钟`);
    } else {
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
  
  // 如果没有状态记录，说明不需要触发
  if (!status) {
    logger.info(`数据库 ${databaseId} 没有触发状态记录，不需要触发`);
    return false;
  }
  
  const now = Date.now();
  const nextTriggerTime = status.nextTriggerTime;
  
  // 只有在状态为 pending 且当前时间超过触发时间时才能触发
  if (status.pending && now >= nextTriggerTime) {
    logger.info(`数据库 ${databaseId} 可以触发操作，当前时间: ${new Date(now).toLocaleString()}, 触发时间: ${new Date(nextTriggerTime).toLocaleString()}`);
    return true;
  }
  
  logger.info(`数据库 ${databaseId} 不能触发操作，状态: pending=${status.pending}, 当前时间: ${new Date(now).toLocaleString()}, 触发时间: ${new Date(nextTriggerTime).toLocaleString()}`);
  return false;
} 
