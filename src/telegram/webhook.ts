import type { Update } from '@grammyjs/types';
import type { Env } from '../types';
import { createLogger } from '../utils/logger';
import { handleTelegramMessage } from './bot';

const logger = createLogger('TelegramWebhook');

interface TelegramError {
  description?: string;
  error_code?: number;
  ok: boolean;
}

/**
 * 处理 Telegram Webhook 请求
 */
export async function handleTelegramWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  // 检查 Telegram Bot Token
  if (!env.TELEGRAM_BOT_TOKEN) {
    return new Response('Telegram Bot Token 未配置', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
  }

  // 处理 OPTIONS 请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  // 处理 POST 请求
  if (request.method === 'POST') {
    try {
      const update = await request.json() as Update;
      logger.info(`收到 Telegram 更新: ${JSON.stringify(update)}`);
      
      await handleTelegramMessage(update, env);
      return new Response('OK', { status: 200 });
    } catch (error) {
      logger.error(`处理 Telegram 更新失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return new Response('处理更新失败', { status: 500 });
    }
  }

  return new Response('不支持的请求方法', { status: 405 });
}

/**
 * 设置 Telegram Webhook
 */
export async function setupTelegramWebhook(request: Request, env: Env): Promise<void> {
  logger.info('开始设置 Telegram Webhook...');
  
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.error('Telegram Bot Token 未配置');
    throw new Error('Telegram Bot Token 未配置');
  }

  // 从请求 URL 获取当前域名
  const url = new URL(request.url);
  const webhookBaseUrl = `${url.protocol}//${url.host}`;
  const webhookUrl = `${webhookBaseUrl}/api/telegram/webhook`;
  logger.info(`准备设置 Webhook URL: ${webhookUrl}`);
  
  const telegramApiUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`;
  logger.info(`调用 Telegram API: ${telegramApiUrl}`);
  
  try {
    const response = await fetch(telegramApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: webhookUrl
      })
    });

    const responseText = await response.text();
    logger.info(`Telegram API 响应: ${responseText}`);

    if (!response.ok) {
      let errorMessage = `设置 Webhook 失败: ${response.status} ${response.statusText}`;
      try {
        const error = JSON.parse(responseText) as TelegramError;
        errorMessage = `设置 Webhook 失败: ${error.description || response.statusText}`;
      } catch (e) {
        errorMessage += `\n响应内容: ${responseText}`;
      }
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    logger.info(`Telegram Webhook 设置成功: ${webhookUrl}`);
  } catch (error) {
    logger.error(`设置 Webhook 时发生错误: ${error instanceof Error ? error.message : '未知错误'}`);
    throw error;
  }
} 
