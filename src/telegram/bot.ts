import type { Update } from '@grammyjs/types';
import { Client } from '@notionhq/client';
import type { GetDatabaseResponse } from '@notionhq/client/build/src/api-endpoints';
import { Bot, Context, InlineKeyboard } from 'grammy';
import { triggerGitHubAction } from '../github/actions';
import { addNotionDatabase, deleteNotionDatabase, formatDatabaseId, getAllNotionDatabasesFromKV, getNotionDatabase, updateNotionDatabase } from '../models/notionDatabase';
import type { Env } from '../types';
import { createLogger } from '../utils/logger';

/**
 * Telegram Bot 处理模块
 */

interface NotionDatabase {
  id: string;
  name?: string;
  title: string;
  url: string;
  last_synced: string;
  updatedAt: string;
  githubRepoId?: string | null;
}

/**
 * 创建数据库列表按钮
 */
function createDatabaseButtons(databases: NotionDatabase[], action: string, page: number = 1): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const startIndex = (page - 1) * 5;
  const endIndex = startIndex + 5;
  const pageDatabases = databases.slice(startIndex, endIndex);
  
  for (const db of pageDatabases) {
    keyboard.text(db.name || db.title, `${action}_${db.id}`);
  }
  
  if (page > 1) {
    keyboard.row().text('⬅️ 上一页', `${action}_page_${String(page - 1)}`);
  }
  
  if (endIndex < databases.length) {
    keyboard.row().text('下一页 ➡️', `${action}_page_${String(page + 1)}`);
  }
  
  return keyboard;
}

/**
 * 消息接口，简化从 node-telegram-bot-api 导入的类型
 */
export interface Message {
  // This interface is now empty as the original implementation used
  // node-telegram-bot-api types, which are not available in the new implementation
}

const logger = createLogger('TelegramBot');

/**
 * 处理 Telegram 消息
 */
export async function handleTelegramMessage(
  update: Update,
  env: Env
): Promise<void> {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  
  // 初始化 Bot
  await bot.init();

  // 设置命令菜单
  await bot.api.setMyCommands([
    { command: 'start', description: '开始使用' },
    { command: 'help', description: '显示帮助信息' },
    { command: 'list', description: '列出所有监听的 Notion 数据库' },
    { command: 'bind', description: '添加并绑定 Notion 数据库到 GitHub 仓库' },
    { command: 'unbind', description: '移除监听的 Notion 数据库' },
    { command: 'trigger', description: '手动触发 GitHub repository_dispatch 事件' }
  ]);

  // 设置命令处理器
  bot.command('start', async (ctx) => {
    await ctx.reply('👋 欢迎使用 Notion 工具人！\n\n使用 /help 查看可用命令。');
  });

  bot.command('help', async (ctx) => {
    const helpText = `
📝 可用命令：

/list - 列出所有监听的 Notion 数据库
/bind [数据库ID] [owner/repo] - 添加 Notion 数据库和 GitHub 仓库的绑定
/unbind - 移除 Notion 数据库和 GitHub 仓库的绑定
/trigger - 手动触发 GitHub repository_dispatch 事件

使用说明：
1. 数据库 ID 可以从 Notion 数据库页面的 URL 中获取，格式为 32 位字符串
2. 添加/移除数据库需要管理员权限
3. 使用 /list 可以查看当前所有监听的数据库
4. 使用 /trigger 可以手动触发已关联的 GitHub Action
    `.trim();
    await ctx.reply(helpText);
  });

  bot.command('list', async (ctx: Context) => {
    const isAdmin = ctx.from?.id.toString() === env.TELEGRAM_ADMIN_USER_ID;
    if (!isAdmin) {
      await ctx.reply('⚠️ 只有管理员可以查看数据库列表。');
      return;
    }
    
    try {
      const databases = await getAllNotionDatabasesFromKV(env.NOTION_TOOLS_BOT);
      
      if (databases.length === 0) {
        await ctx.reply('📝 暂无数据库');
        return;
      }
      
      await ctx.reply('📚 数据库列表：', {
        reply_markup: createDatabaseButtons(databases, 'list_dbs')
      });
    } catch (error) {
      logger.error('获取数据库列表失败', { error });
      await ctx.reply('❌ 获取数据库列表失败，请稍后重试');
    }
  });

  bot.command('bind', async (ctx: Context) => {
    const isAdmin = ctx.from?.id.toString() === env.TELEGRAM_ADMIN_USER_ID;
    if (!isAdmin) {
      await ctx.reply('⚠️ 只有管理员可以添加和绑定数据库。');
      return;
    }
    
    const args = ctx.message?.text?.split(' ').slice(1) || [];
    if (args.length !== 2) {
      await ctx.reply('❓ 使用方法: `/bind [数据库ID] [owner/repo]`\n\n数据库 ID 可以从 Notion 数据库页面的 URL 中获取，格式为 32 位字符串。');
      return;
    }
    
    const [databaseId, repoId] = args;
    
    // 验证数据库 ID 格式
    if (!/^[a-zA-Z0-9]{32}$/.test(databaseId)) {
      await ctx.reply('❌ 无效的数据库 ID 格式。数据库 ID 应为 32 位字母数字字符串。');
      return;
    }
    
    try {
      // 检查数据库是否已存在于 KV 中
      const databases = await getAllNotionDatabasesFromKV(env.NOTION_TOOLS_BOT);
      const existingDb = databases.find(db => formatDatabaseId(db.id) === formatDatabaseId(databaseId));
      
      if (existingDb) {
        // 如果数据库已存在，更新 GitHub 仓库关联
        try {
          await updateNotionDatabase(env.NOTION_TOOLS_BOT, databaseId, {
            githubRepoId: repoId,
            updatedAt: new Date().toISOString()
          });
          await ctx.reply(`✅ 已更新数据库 ${existingDb.name || existingDb.title} 的 GitHub 仓库关联为 ${repoId}`);
        } catch (error) {
          logger.error(`更新数据库失败: ${error instanceof Error ? error.message : '未知错误'}`);
          await ctx.reply('❌ 更新数据库失败，请稍后重试');
          return;
        }
      } else {
        // 如果数据库不存在，从 Notion API 获取信息并添加
        const notion = new Client({ auth: env.NOTION_TOKEN });
        let database: GetDatabaseResponse;
        try {
          database = await notion.databases.retrieve({ database_id: databaseId }) as GetDatabaseResponse;
        } catch (error) {
          logger.error(`获取 Notion 数据库信息失败: ${error instanceof Error ? error.message : '未知错误'}`);
          await ctx.reply('❌ 获取 Notion 数据库信息失败，请确保：\n1. 数据库 ID 正确\n2. Notion API Token 有权限访问该数据库');
          return;
        }
        
        // 获取数据库标题
        let databaseTitle = 'Untitled Database';
        if ('title' in database) {
          const titleProperty = database.title;
          if (Array.isArray(titleProperty) && titleProperty.length > 0) {
            databaseTitle = titleProperty[0].plain_text;
          }
        }
        
        // 检查 GitHub Token 是否配置
        if (!env.GITHUB_TOKEN) {
          await ctx.reply('❌ GitHub Token 未配置');
          return;
        }
        
        // 验证 GitHub 仓库
        const [owner, repo] = repoId.split('/');
        try {
          await triggerGitHubAction(env.GITHUB_TOKEN, owner, repo);
        } catch (error) {
          logger.error(`GitHub 仓库验证失败: ${error instanceof Error ? error.message : '未知错误'}`);
          await ctx.reply('❌ GitHub 仓库验证失败，请确保：\n1. 仓库名称正确\n2. GitHub Token 有权限访问该仓库');
          return;
        }
        
        // 添加新数据库
        try {
          const newDatabase = {
            id: databaseId,
            name: databaseTitle,
            title: databaseTitle,
            url: `https://notion.so/${databaseId}`,
            last_synced: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            githubRepoId: repoId
          };
          
          await addNotionDatabase(env.NOTION_TOOLS_BOT, newDatabase);
          await ctx.reply(`✅ 已添加数据库 ${databaseTitle} 并关联到 GitHub 仓库 ${repoId}`);
        } catch (error) {
          logger.error(`添加数据库失败: ${error instanceof Error ? error.message : '未知错误'}`);
          await ctx.reply('❌ 添加数据库失败，请稍后重试');
          return;
        }
      }
    } catch (error) {
      logger.error(`添加数据库并关联 GitHub 仓库失败: ${error instanceof Error ? error.message : '未知错误'}`);
      await ctx.reply('❌ 操作失败，请稍后重试。\n请确保：\n1. 数据库 ID 正确\n2. Notion API Token 有权限访问该数据库\n3. GitHub Token 有权限访问目标仓库');
    }
  });

  bot.command('unbind', async (ctx: Context) => {
    const isAdmin = ctx.from?.id.toString() === env.TELEGRAM_ADMIN_USER_ID;
    if (!isAdmin) {
      await ctx.reply('⚠️ 只有管理员可以删除数据库。');
      return;
    }
    
    try {
      const databases = await getAllNotionDatabasesFromKV(env.NOTION_TOOLS_BOT);
      
      if (databases.length === 0) {
        await ctx.reply('📝 暂无数据库');
        return;
      }
      
      await ctx.reply('🗑 请选择要删除的数据库：', {
        reply_markup: createDatabaseButtons(databases, 'remove_db')
      });
    } catch (error) {
      logger.error('获取数据库列表失败', { error });
      await ctx.reply('❌ 获取数据库列表失败，请稍后重试');
    }
  });

  bot.command('trigger', async (ctx: Context) => {
    try {
      const databases = await getAllNotionDatabasesFromKV(env.NOTION_TOOLS_BOT);
      const linkedDatabases = databases.filter(db => db.githubRepoId);
      
      if (linkedDatabases.length === 0) {
        await ctx.reply('📝 当前没有已关联 GitHub 仓库的数据库。');
        return;
      }
      
      await ctx.reply('请选择要触发的数据库：', {
        reply_markup: createDatabaseButtons(linkedDatabases, 'trigger')
      });
    } catch (error) {
      logger.error(`获取数据库列表失败: ${error instanceof Error ? error.message : '未知错误'}`);
      await ctx.reply('❌ 获取数据库列表失败，请稍后重试。');
    }
  });

  // 处理回调查询
  bot.on('callback_query', async (ctx: Context) => {
    if (!ctx.callbackQuery?.data) return;
    
    const query = ctx.callbackQuery.data;
    logger.info(`收到回调查询: ${query}`);
    
    try {
      // 处理数据库列表分页
      if (query.startsWith('list_dbs_page_')) {
        const page = parseInt(query.replace('list_dbs_page_', ''));
        logger.info(`处理数据库列表分页: page=${page}`);
        
        const databases = await getAllNotionDatabasesFromKV(env.NOTION_TOOLS_BOT);
        const keyboard = createDatabaseButtons(databases, 'list_dbs', page);
        
        await ctx.editMessageText('📚 数据库列表：', { reply_markup: keyboard });
        await ctx.answerCallbackQuery();
        return;
      }
      
      // 处理 trigger 命令的数据库按钮点击
      if (query.startsWith('trigger_')) {
        const databaseId = query.replace('trigger_', '');
        logger.info(`处理 trigger 命令的数据库按钮点击: databaseId=${databaseId}`);
        
        // 检查是否是分页请求
        if (databaseId.startsWith('page_')) {
          const page = parseInt(databaseId.replace('page_', ''));
          logger.info(`处理 trigger 命令的分页: page=${page}`);
          
          const databases = await getAllNotionDatabasesFromKV(env.NOTION_TOOLS_BOT);
          const linkedDatabases = databases.filter(db => db.githubRepoId);
          
          if (linkedDatabases.length === 0) {
            await ctx.editMessageText('📝 当前没有已关联 GitHub 仓库的数据库。');
            await ctx.answerCallbackQuery();
            return;
          }
          
          const keyboard = createDatabaseButtons(linkedDatabases, 'trigger', page);
          await ctx.editMessageText('请选择要触发的数据库：', { reply_markup: keyboard });
          await ctx.answerCallbackQuery();
          return;
        }
        
        const database = await getNotionDatabase({ NOTION_TOKEN: env.NOTION_TOKEN, KV: env.NOTION_TOOLS_BOT }, databaseId);
        if (!database) {
          logger.error(`数据库不存在: databaseId=${databaseId}`);
          await ctx.answerCallbackQuery({ text: '❌ 数据库不存在' });
          return;
        }

        // 显示数据库详情和确认按钮
        const message = `📝 数据库详情：\n\n` +
          `名称：${database.name || database.title}\n` +
          `ID：${database.id}\n` +
          `关联仓库：${database.githubRepoId || '未关联'}\n` +
          `最后更新：${new Date(database.updatedAt).toLocaleString()}\n` +
          `最后同步：${new Date(database.last_synced).toLocaleString()}`;
        
        const keyboard = new InlineKeyboard();
        keyboard.text('⬅️ 返回列表', 'trigger_page_1').row();
        keyboard.text('🚀 确认触发', `confirm_trigger_${database.id}`).row();
        
        await ctx.editMessageText(message, { reply_markup: keyboard });
        await ctx.answerCallbackQuery();
        return;
      }
      
      // 处理数据库详情按钮
      if (query.startsWith('list_dbs_')) {
        const databaseId = query.replace('list_dbs_', '');
        logger.info(`处理数据库详情请求: databaseId=${databaseId}`);
        
        const database = await getNotionDatabase({ NOTION_TOKEN: env.NOTION_TOKEN, KV: env.NOTION_TOOLS_BOT }, databaseId);
        if (!database) {
          logger.error(`数据库不存在: databaseId=${databaseId}`);
          await ctx.answerCallbackQuery({ text: '❌ 数据库不存在' });
          return;
        }

        // 显示数据库详情和操作按钮
        const message = `📝 数据库详情：\n\n` +
          `名称：${database.name || database.title}\n` +
          `ID：${database.id}\n` +
          `关联仓库：${database.githubRepoId || '未关联'}\n` +
          `最后更新：${new Date(database.updatedAt).toLocaleString()}\n` +
          `最后同步：${new Date(database.last_synced).toLocaleString()}`;
        
        const keyboard = new InlineKeyboard();
        keyboard.text('⬅️ 返回列表', 'list_dbs_page_1').row();
        
        // 如果已关联 GitHub 仓库，添加触发按钮
        if (database.githubRepoId) {
          keyboard.text('🚀 触发 Action', `confirm_trigger_${database.id}`).row();
        }
        
        // 添加删除按钮
        keyboard.text('❌ 删除数据库', `confirm_remove_${database.id}`).row();
        
        await ctx.editMessageText(message, { reply_markup: keyboard });
        await ctx.answerCallbackQuery();
        return;
      }
      
      // 处理删除数据库按钮点击
      if (query.startsWith('remove_db_')) {
        const databaseId = query.replace('remove_db_', '');
        logger.info(`处理删除数据库按钮点击: databaseId=${databaseId}`);
        
        // 检查是否是分页请求
        if (databaseId.startsWith('page_')) {
          const page = parseInt(databaseId.replace('page_', ''));
          logger.info(`处理删除数据库列表的分页: page=${page}`);
          
          const databases = await getAllNotionDatabasesFromKV(env.NOTION_TOOLS_BOT);
          const keyboard = createDatabaseButtons(databases, 'remove_db', page);
          
          await ctx.editMessageText('🗑 请选择要删除的数据库：', { reply_markup: keyboard });
          await ctx.answerCallbackQuery();
          return;
        }
        
        const database = await getNotionDatabase({ NOTION_TOKEN: env.NOTION_TOKEN, KV: env.NOTION_TOOLS_BOT }, databaseId);
        if (!database) {
          logger.error(`数据库不存在: databaseId=${databaseId}`);
          await ctx.answerCallbackQuery({ text: '❌ 数据库不存在' });
          return;
        }

        // 显示确认删除界面
        const message = `⚠️ 确认删除数据库？\n\n` +
          `名称：${database.name || database.title}\n` +
          `ID：${database.id}\n` +
          `关联仓库：${database.githubRepoId || '未关联'}\n\n` +
          `此操作不可撤销！`;
        
        const keyboard = new InlineKeyboard();
        keyboard.text('⬅️ 返回列表', 'remove_db_page_1').row();
        keyboard.text('❌ 确认删除', `confirm_remove_${database.id}`).row();
        
        await ctx.editMessageText(message, { reply_markup: keyboard });
        await ctx.answerCallbackQuery();
        return;
      }
      
      // 处理确认删除按钮
      if (query.startsWith('confirm_remove_')) {
        const databaseId = query.replace('confirm_remove_', '');
        logger.info(`处理确认删除操作: databaseId=${databaseId}`);
        
        const database = await getNotionDatabase({ NOTION_TOKEN: env.NOTION_TOKEN, KV: env.NOTION_TOOLS_BOT }, databaseId);
        if (!database) {
          logger.error(`数据库不存在: databaseId=${databaseId}`);
          await ctx.answerCallbackQuery({ text: '❌ 数据库不存在' });
          return;
        }
        
        // 检查管理员权限
        const isAdmin = ctx.from?.id.toString() === env.TELEGRAM_ADMIN_USER_ID;
        if (!isAdmin) {
          logger.warn(`非管理员尝试删除数据库: userId=${ctx.from?.id}`);
          await ctx.answerCallbackQuery({ text: '⚠️ 只有管理员可以执行此操作' });
          return;
        }
        
        await deleteNotionDatabase(env.NOTION_TOOLS_BOT, databaseId);
        
        // 刷新数据库列表
        const databases = await getAllNotionDatabasesFromKV(env.NOTION_TOOLS_BOT);
        if (databases.length === 0) {
          await ctx.editMessageText('✅ 已删除数据库。\n\n当前没有可删除的数据库。');
        } else {
          const keyboard = createDatabaseButtons(databases, 'list_dbs');
          await ctx.editMessageText(
            `✅ 已删除数据库：${database.name || databaseId}\n\n数据库列表：`,
            { reply_markup: keyboard }
          );
        }
        await ctx.answerCallbackQuery();
        return;
      }
      
      // 处理确认触发按钮
      if (query.startsWith('confirm_trigger_')) {
        const databaseId = query.replace('confirm_trigger_', '');
        logger.info(`处理确认触发操作: databaseId=${databaseId}`);
        
        const database = await getNotionDatabase({ NOTION_TOKEN: env.NOTION_TOKEN, KV: env.NOTION_TOOLS_BOT }, databaseId);
        if (!database) {
          logger.error(`数据库不存在: databaseId=${databaseId}`);
          await ctx.answerCallbackQuery({ text: '❌ 数据库不存在' });
          return;
        }
        
        if (!database.githubRepoId) {
          logger.warn(`数据库未关联 GitHub 仓库: databaseId=${databaseId}`);
          await ctx.answerCallbackQuery({ text: '⚠️ 该数据库未关联 GitHub 仓库' });
          return;
        }
        
        try {
          const [owner, repo] = database.githubRepoId.split('/');
          if (!owner || !repo) {
            throw new Error('无效的 GitHub 仓库格式');
          }
          if (!env.GITHUB_TOKEN) {
            throw new Error('GitHub Token 未配置');
          }
          await triggerGitHubAction(env.GITHUB_TOKEN, owner, repo);
          
          // 刷新数据库列表
          const databases = await getAllNotionDatabasesFromKV(env.NOTION_TOOLS_BOT);
          const keyboard = createDatabaseButtons(databases, 'list_dbs');
          
          await ctx.editMessageText(
            `✅ 已触发 GitHub Action：${database.name || databaseId}\n\n数据库列表：`,
            { reply_markup: keyboard }
          );
          await ctx.answerCallbackQuery({ text: '✅ 已触发 GitHub Action' });
        } catch (error) {
          logger.error(`触发 GitHub Action 失败: ${error instanceof Error ? error.message : '未知错误'}`);
          await ctx.answerCallbackQuery({ text: '❌ 触发 GitHub Action 失败' });
        }
        return;
      }
      
      await ctx.answerCallbackQuery();
    } catch (error) {
      logger.error(`处理回调查询失败: ${error instanceof Error ? error.message : '未知错误'}`);
      await ctx.answerCallbackQuery({ text: '❌ 操作失败，请稍后重试' });
    }
  });

  // 处理未知命令
  bot.on('message', async (ctx: Context) => {
    logger.info(`未知命令: ${ctx.message?.text}`);
    await ctx.reply('❓ 未知命令，使用 /help 查看可用命令。');
  });

  // 处理更新
  await bot.handleUpdate(update);
}
