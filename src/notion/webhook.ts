import { Bot } from 'grammy';
import { triggerGitHubAction } from '../github/actions';
import { getAllNotionDatabasesFromKV } from '../models/notionDatabase';
import { canTriggerActions, clearTriggerStatus, updateTriggerStatus } from '../models/triggerStatus';
import type { Env } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('NotionWebhook');

// 处理 Notion 数据库 ID 格式，去掉短横线
function formatNotionId(id: string): string {
  return id.replace(/-/g, '');
}

interface NotionWebhookBody {
  type: string;
  data: {
    parent: {
      id: string;
      type: string;
    };
  };
  entity: {
    id: string;
    type: string;
  };
  timestamp: string;
}

interface NotionVerificationBody {
  verification_token: string;
}

type NotionWebhookRequest = NotionWebhookBody | NotionVerificationBody;

// 验证请求头
function validateRequestHeaders(request: Request): string | null {
  const signature = request.headers.get('x-notion-signature');
  if (!signature) {
    logger.error('缺少 Notion 签名');
    return '未授权';
  }
  return null;
}

// 发送 Telegram 消息
async function sendTelegramMessage(env: Env, message: string): Promise<void> {
  try {
    if (!env.TELEGRAM_ADMIN_USER_ID) {
      logger.error('未配置 Telegram 管理员 ID');
      return;
    }

    const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
    await bot.init();
    await bot.api.sendMessage(env.TELEGRAM_ADMIN_USER_ID, message, {
      parse_mode: 'HTML'
    });
  } catch (error) {
    logger.error('发送机器人通知失败:', error);
  }
}

// 处理验证请求
async function handleVerificationRequest(body: NotionVerificationBody, env: Env): Promise<Response> {
  logger.info('收到 Notion webhook 验证请求');
  await sendTelegramMessage(env, 
    `🔔 <b>Notion Webhook 验证请求</b>\n\n` +
    `验证令牌：\n` +
    `<code>${body.verification_token}</code>\n\n` +
    `请点击上方令牌复制，然后添加到 Notion webhook 配置中。`
  );
  return new Response('OK', { status: 200 });
}

// 处理数据库更新事件
async function handleDatabaseUpdate(body: NotionWebhookBody, env: Env): Promise<Response> {
  const eventType = body.type;
  if (!eventType?.startsWith('page.') && !eventType?.startsWith('database.')) {
    logger.info(`忽略非页面或数据库事件: ${eventType}`);
    return new Response('已接收', { status: 200 });
  }

  const rawDatabaseId = body.data?.parent?.id;
  if (!rawDatabaseId) {
    logger.error('无法从事件中获取数据库 ID');
    return new Response('无效的事件数据', { status: 400 });
  }

  const databaseId = formatNotionId(rawDatabaseId);
  logger.info(`处理后的数据库 ID: ${databaseId}`);

  const databases = await getAllNotionDatabasesFromKV(env.NOTION_TOOLS_BOT);
  const updatedDatabase = databases.find(db => formatNotionId(db.id) === databaseId);
  
  if (!updatedDatabase) {
    logger.info(`数据库 ${databaseId} 未在监听列表中`);
    return new Response('已接收', { status: 200 });
  }

  if (!updatedDatabase.githubRepoId) {
    logger.info(`数据库 ${databaseId} 未关联 GitHub 仓库`);
    return new Response('已接收', { status: 200 });
  }

  const [owner, repo] = updatedDatabase.githubRepoId.split('/') as [string, string];
  if (!owner || !repo) {
    logger.error(`GitHub 仓库 ID 格式错误: ${updatedDatabase.githubRepoId}`);
    return new Response('GitHub 仓库 ID 格式错误', { status: 400 });
  }

  if (!env.GITHUB_TOKEN) {
    logger.error('未配置 GitHub Token');
    return new Response('未配置 GitHub Token', { status: 500 });
  }

  // 获取延迟时间（分钟），默认为5分钟
  const delayMinutes = parseInt(env.TRIGGER_DELAY_MINUTES || '5', 10);
  
  // 更新触发状态，设置延迟时间
  await updateTriggerStatus(env.NOTION_TOOLS_BOT, databaseId, delayMinutes);
  
  // 检查是否应该立即触发，通常情况下这里会返回false，因为我们刚刚设置了触发状态
  // 仅作为安全检查，防止状态设置失败
  if (await canTriggerActions(env.NOTION_TOOLS_BOT, databaseId)) {
    logger.info(`立即触发 GitHub Action: ${owner}/${repo}`);
    await triggerGitHubAction(env.GITHUB_TOKEN, owner, repo);
    await clearTriggerStatus(env.NOTION_TOOLS_BOT, databaseId);
    
    const message = `📝 <b>Notion 数据库更新通知</b>\n\n` +
      `数据库：${updatedDatabase.name || updatedDatabase.id}\n` +
      `ID：${updatedDatabase.id}\n` +
      `关联仓库：${updatedDatabase.githubRepoId}\n` +
      `更新时间：${new Date().toLocaleString()}\n\n` +
      `✅ 已立即触发 GitHub Action 同步`;
    
    await sendTelegramMessage(env, message);
  } else {
    const message = `📝 <b>Notion 数据库更新通知</b>\n\n` +
      `数据库：${updatedDatabase.name || updatedDatabase.id}\n` +
      `ID：${updatedDatabase.id}\n` +
      `关联仓库：${updatedDatabase.githubRepoId}\n` +
      `更新时间：${new Date().toLocaleString()}\n\n` +
      `⏳ 已设置延迟触发，将在 ${delayMinutes} 分钟后触发 GitHub Action（如无新通知）`;
    
    await sendTelegramMessage(env, message);
  }

  logger.info(`成功处理 Notion 更新事件，设置了 ${delayMinutes} 分钟延迟触发`);
  return new Response('已接收', { 
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
    }
  });
}

export async function handleNotionWebhook(request: Request, env: Env): Promise<Response> {
  logger.info('收到 Notion webhook 请求');

  // 处理 OPTIONS 请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // 只处理 POST 请求
  if (request.method !== 'POST') {
    return new Response('不支持的请求方法', { status: 405 });
  }

  try {
    // 验证请求头
    const headerError = validateRequestHeaders(request);
    if (headerError) {
      return new Response(headerError, { status: 401 });
    }

    // 解析请求体
    const body = await request.json() as NotionWebhookRequest;
    logger.info('Notion webhook 数据:', body);

    // 根据请求类型处理
    if ('verification_token' in body) {
      return await handleVerificationRequest(body, env);
    } else {
      return await handleDatabaseUpdate(body, env);
    }

  } catch (error) {
    logger.error('处理 Notion webhook 时发生错误:', error);
    return new Response('服务器错误', { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}
