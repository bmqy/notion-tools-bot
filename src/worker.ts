import { Bot } from 'grammy';
import { triggerGitHubAction } from './github/actions';
import { getAllNotionDatabasesFromKV } from './models/notionDatabase';
import { canTriggerActions, clearTriggerStatus, getTriggerStatus } from './models/triggerStatus';
import { handleNotionWebhook } from './notion/webhook';
import { handleTelegramWebhook, setupTelegramWebhook } from './telegram/webhook';
import type { Env } from './types';
import { createLogger } from './utils/logger';

const logger = createLogger('Worker');

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // 获取当前域名
    const webhookBaseUrl = `${url.protocol}//${url.host}`;
    
    // 路由处理
    switch (url.pathname) {
      case '/api/telegram/webhook':
        if (request.method === 'GET') {
          return new Response('请使用 POST 方法发送 Telegram 更新', { 
            status: 405,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8'
            }
          });
        }
        return handleTelegramWebhook(request, env);
      
      case '/api/telegram/setup':
        if (request.method === 'GET') {
          try {
            await setupTelegramWebhook(request, env);
            return new Response('Webhook setup completed', { 
              status: 200,
              headers: {
                'Content-Type': 'text/plain; charset=utf-8'
              }
            });
          } catch (error) {
            return new Response(`Webhook setup failed: ${error instanceof Error ? error.message : '未知错误'}`, { 
              status: 500,
              headers: {
                'Content-Type': 'text/plain; charset=utf-8'
              }
            });
          }
        }
        return new Response('Method not allowed', { 
          status: 405,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        });
      
      case '/api/notion/webhook':
        return handleNotionWebhook(request, env);
      
      case '/health':
        return new Response('OK', { status: 200 });
      
      default:
        return new Response(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Notion 工具人 Bot</title>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                :root {
                  --primary-color: #1A1F36;
                  --secondary-color: #697386;
                  --accent-color: #3B82F6;
                  --success-color: #10B981;
                  --error-color: #EF4444;
                  --background-color: #F8FAFC;
                  --card-background: #FFFFFF;
                  --gradient-start: #3B82F6;
                  --gradient-end: #10B981;
                }

                * {
                  margin: 0;
                  padding: 0;
                  box-sizing: border-box;
                }

                body {
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                  line-height: 1.4;
                  background-color: var(--background-color);
                  color: var(--primary-color);
                  min-height: 100vh;
                  display: flex;
                  align-items: center;
                  background: linear-gradient(135deg, rgba(59, 130, 246, 0.03) 0%, rgba(16, 185, 129, 0.03) 100%);
                }

                .container {
                  max-width: 1000px;
                  width: 100%;
                  margin: 0 auto;
                  padding: 1rem;
                }

                .content-wrapper {
                  display: grid;
                  grid-template-columns: 300px 1fr;
                  gap: 1.2rem;
                  align-items: start;
                  position: relative;
                  background: rgba(255, 255, 255, 0.9);
                  border-radius: 12px;
                  padding: 1.2rem;
                  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
                  border: 1px solid rgba(59, 130, 246, 0.1);
                }

                .left-panel {
                  display: flex;
                  flex-direction: column;
                  gap: 0.8rem;
                  padding-right: 1.2rem;
                  border-right: 1px solid rgba(59, 130, 246, 0.1);
                }

                header {
                  text-align: left;
                  position: relative;
                  padding-bottom: 0.8rem;
                  border-bottom: 2px solid rgba(59, 130, 246, 0.1);
                }

                h1 {
                  font-size: 1.8rem;
                  margin-bottom: 0.2rem;
                  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
                  -webkit-background-clip: text;
                  -webkit-text-fill-color: transparent;
                  font-weight: 600;
                }

                .subtitle {
                  font-size: 0.9rem;
                  color: var(--secondary-color);
                }

                .status-card {
                  padding: 0.8rem;
                  background: linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(16, 185, 129, 0.05));
                  border-radius: 12px;
                  border: 1px solid rgba(59, 130, 246, 0.1);
                  position: relative;
                  overflow: hidden;
                }

                .status-card::before {
                  content: '';
                  position: absolute;
                  top: 0;
                  left: 0;
                  right: 0;
                  bottom: 0;
                  background: linear-gradient(45deg, 
                    transparent 0%,
                    rgba(59, 130, 246, 0.03) 50%,
                    transparent 100%
                  );
                  animation: shine 3s infinite;
                }

                .status {
                  display: flex;
                  flex-direction: column;
                  gap: 0.8rem;
                  position: relative;
                  z-index: 1;
                }

                .status-header {
                  display: flex;
                  align-items: center;
                  gap: 0.8rem;
                }

                .status-dot {
                  width: 8px;
                  height: 8px;
                  border-radius: 50%;
                  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
                  box-shadow: 0 0 12px rgba(59, 130, 246, 0.5);
                  position: relative;
                  animation: pulse 2s infinite;
                }

                .status-dot::after {
                  content: '';
                  position: absolute;
                  top: 0;
                  left: 0;
                  right: 0;
                  bottom: 0;
                  border-radius: 50%;
                  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
                  opacity: 0.3;
                  animation: ripple 2s infinite;
                }

                .status span {
                  font-size: 0.9rem;
                  color: var(--primary-color);
                  font-weight: 500;
                  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
                  -webkit-background-clip: text;
                  -webkit-text-fill-color: transparent;
                }

                .battery-status {
                  display: flex;
                  gap: 1px;
                  height: 12px;
                  background: rgba(59, 130, 246, 0.1);
                  border-radius: 6px;
                  padding: 2px;
                  overflow: hidden;
                  position: relative;
                }

                .battery-segment {
                  width: 2px;
                  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
                  border-radius: 1px;
                  opacity: 0.3;
                  position: relative;
                  flex: none;
                }

                .battery-status::before {
                  content: '';
                  position: absolute;
                  top: 0;
                  left: 0;
                  right: 0;
                  bottom: 0;
                  background: linear-gradient(90deg,
                    transparent 0%,
                    rgba(59, 130, 246, 0.2) 45%,
                    rgba(16, 185, 129, 0.2) 55%,
                    transparent 100%
                  );
                  animation: gradientFlow 3s infinite;
                }

                .battery-status::after {
                  content: '';
                  position: absolute;
                  top: 0;
                  left: 0;
                  right: 0;
                  bottom: 0;
                  background: linear-gradient(90deg,
                    transparent 0%,
                    rgba(59, 130, 246, 0.1) 25%,
                    rgba(16, 185, 129, 0.2) 50%,
                    rgba(59, 130, 246, 0.1) 75%,
                    transparent 100%
                  );
                  animation: gradientFlow 3s infinite reverse;
                }

                .instructions {
                  padding: 0.8rem;
                  background: linear-gradient(135deg, rgba(59, 130, 246, 0.03), rgba(16, 185, 129, 0.03));
                  border-radius: 8px;
                  border: 1px solid rgba(59, 130, 246, 0.1);
                }

                .instructions h2 {
                  font-size: 1rem;
                  margin-bottom: 0.6rem;
                  color: var(--primary-color);
                  font-weight: 600;
                }

                .instructions ol {
                  margin-left: 0.8rem;
                  font-size: 0.9rem;
                }

                .instructions li {
                  margin-bottom: 0.4rem;
                  padding-left: 0.8rem;
                  position: relative;
                }

                .instructions li::before {
                  content: '';
                  position: absolute;
                  left: -0.4rem;
                  top: 0.5rem;
                  width: 4px;
                  height: 4px;
                  border-radius: 50%;
                  background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
                }

                .endpoints {
                  display: grid;
                  grid-template-columns: repeat(2, 1fr);
                  gap: 0.8rem;
                  margin-bottom: 1rem;
                }

                .right-panel {
                  display: flex;
                  flex-direction: column;
                  gap: 1rem;
                }

                .info-section {
                  border-top: 1px solid rgba(59, 130, 246, 0.1);
                  padding-top: 1rem;
                  display: grid;
                  grid-template-columns: repeat(2, 1fr);
                  gap: 1rem;
                }

                .info-card {
                  background: linear-gradient(135deg, rgba(59, 130, 246, 0.02), rgba(16, 185, 129, 0.02));
                  border-radius: 8px;
                  padding: 0.8rem;
                  border: 1px solid rgba(59, 130, 246, 0.1);
                }

                .info-card h3 {
                  font-size: 0.9rem;
                  color: var(--accent-color);
                  margin-bottom: 0.4rem;
                  font-weight: 500;
                }

                .info-card p {
                  font-size: 0.85rem;
                  color: var(--secondary-color);
                  margin-bottom: 0.4rem;
                }

                .info-card ul {
                  list-style: none;
                  margin: 0;
                  padding: 0;
                }

                .info-card li {
                  font-size: 0.85rem;
                  color: var(--secondary-color);
                  margin-bottom: 0.3rem;
                  display: flex;
                  align-items: center;
                  gap: 0.3rem;
                  word-break: break-all;
                }

                .info-card li code {
                  max-width: 100%;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  word-break: break-all;
                }

                .info-card li a {
                  display: inline-block;
                  max-width: 100%;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  word-break: break-all;
                }

                .version-tag {
                  display: inline-block;
                  font-size: 0.75rem;
                  padding: 0.1rem 0.4rem;
                  background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(16, 185, 129, 0.1));
                  border-radius: 4px;
                  color: var(--accent-color);
                  margin-left: 0.4rem;
                }

                .endpoint-card {
                  padding: 0.8rem;
                  background: linear-gradient(135deg, rgba(59, 130, 246, 0.03), rgba(16, 185, 129, 0.03));
                  border-radius: 8px;
                  border: 1px solid rgba(59, 130, 246, 0.1);
                  transition: all 0.2s ease;
                }

                .endpoint-card:hover {
                  transform: translateY(-2px);
                  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
                  border-color: rgba(59, 130, 246, 0.2);
                }

                .endpoint-title {
                  font-size: 0.95rem;
                  margin-bottom: 0.3rem;
                  color: var(--accent-color);
                  font-weight: 500;
                }

                .endpoint-card p {
                  font-size: 0.85rem;
                  margin-top: 0.3rem;
                  color: var(--secondary-color);
                }

                code {
                  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
                  font-size: 0.85rem;
                  padding: 0.15rem 0.3rem;
                  background: rgba(59, 130, 246, 0.08);
                  border-radius: 4px;
                  color: var(--accent-color);
                  border: 1px solid rgba(59, 130, 246, 0.1);
                }

                @keyframes gradientFlow {
                  0% { transform: translateX(-100%); }
                  100% { transform: translateX(100%); }
                }

                @keyframes pulse {
                  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
                  70% { transform: scale(1.2); box-shadow: 0 0 12px rgba(59, 130, 246, 0); }
                  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
                }

                @keyframes ripple {
                  0% { transform: scale(1); opacity: 0.3; }
                  100% { transform: scale(2); opacity: 0; }
                }

                @keyframes shine {
                  0% { transform: translateX(-100%); }
                  100% { transform: translateX(100%); }
                }

                @media (max-width: 1024px) {
                  .content-wrapper {
                    grid-template-columns: 1fr;
                    gap: 1rem;
                  }

                  .left-panel {
                    padding-right: 0;
                    padding-bottom: 1rem;
                    border-right: none;
                    border-bottom: 1px solid rgba(59, 130, 246, 0.1);
                  }

                  .info-section {
                    grid-template-columns: 1fr;
                  }
                }

                @media (max-width: 640px) {
                  .container {
                    padding: 0.8rem;
                  }

                  .content-wrapper {
                    padding: 1rem;
                  }

                  .endpoints {
                    grid-template-columns: 1fr;
                  }

                  h1 {
                    font-size: 1.6rem;
                  }
                }

                .toast {
                  position: fixed;
                  bottom: 20px;
                  left: 50%;
                  transform: translateX(-50%);
                  background: rgba(59, 130, 246, 0.9);
                  color: white;
                  padding: 0.8rem 1.2rem;
                  border-radius: 8px;
                  font-size: 0.9rem;
                  opacity: 0;
                  transition: opacity 0.3s ease;
                  pointer-events: none;
                  z-index: 1000;
                }

                .toast.show {
                  opacity: 1;
                }

                .copy-wrapper {
                  position: relative;
                  display: inline-flex;
                  align-items: center;
                  gap: 0.3rem;
                  cursor: pointer;
                }

                .copy-wrapper:hover code {
                  background: rgba(59, 130, 246, 0.15);
                }

                .copy-wrapper::after {
                  content: '点击复制';
                  position: absolute;
                  bottom: 100%;
                  left: 50%;
                  transform: translateX(-50%);
                  background: rgba(0, 0, 0, 0.8);
                  color: white;
                  padding: 0.3rem 0.6rem;
                  border-radius: 4px;
                  font-size: 0.75rem;
                  opacity: 0;
                  transition: opacity 0.2s ease;
                  pointer-events: none;
                  margin-bottom: 5px;
                  white-space: nowrap;
                }

                .copy-wrapper:hover::after {
                  opacity: 1;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="content-wrapper">
                  <div class="left-panel">
                    <header>
                      <h1>Notion 工具人 Bot</h1>
                      <p class="subtitle">自动化你的 Notion 和 GitHub 工作流</p>
                    </header>

                    <div class="status-card">
                      <div class="status">
                        <div class="status-header">
                          <div class="status-dot"></div>
                          <span>系统状态：正常运行中</span>
                        </div>
                        <div class="battery-status">
                          ${Array(100).fill('<div class="battery-segment"></div>').join('')}
                        </div>
                      </div>
                    </div>

                    <div class="instructions">
                      <h2>快速开始</h2>
                      <ol>
                        <li>访问 <a href="${webhookBaseUrl}/api/telegram/setup" target="_blank" rel="noopener noreferrer"><code>/api/telegram/setup</code></a> 设置 Webhook</li>
                        <li>配置 Notion Webhook 到 <span class="copy-wrapper" onclick="copyWebhookUrl('${webhookBaseUrl}/api/notion/webhook')"><code>/api/notion/webhook</code></span></li>
                        <li>使用 Telegram 机器人管理关联</li>
                        <li>开始享受自动化体验！</li>
                      </ol>
                    </div>
                  </div>

                  <div class="right-panel">
                    <div class="endpoints">
                      <div class="endpoint-card">
                        <div class="endpoint-title">Telegram Webhook</div>
                        <a href="${webhookBaseUrl}/api/telegram/webhook" target="_blank" rel="noopener noreferrer"><code>/api/telegram/webhook</code></a>
                        <p>处理 Telegram 更新消息</p>
                      </div>
                      <div class="endpoint-card">
                        <div class="endpoint-title">Webhook 设置</div>
                        <a href="${webhookBaseUrl}/api/telegram/setup" target="_blank" rel="noopener noreferrer"><code>/api/telegram/setup</code></a>
                        <p>配置 Telegram Webhook</p>
                      </div>
                      <div class="endpoint-card">
                        <div class="endpoint-title">Notion Webhook</div>
                        <a href="${webhookBaseUrl}/api/notion/webhook" target="_blank" rel="noopener noreferrer"><code>/api/notion/webhook</code></a>
                        <p>处理数据库更新</p>
                      </div>
                      <div class="endpoint-card">
                        <div class="endpoint-title">健康检查</div>
                        <a href="${webhookBaseUrl}/health" target="_blank" rel="noopener noreferrer"><code>/health</code></a>
                        <p>检查服务状态</p>
                      </div>
                    </div>

                    <div class="info-section">
                      <div class="info-card">
                        <h3>功能特性</h3>
                        <ul>
                          <li>实时监听 Notion 数据库更新</li>
                          <li>自动触发 GitHub 仓库操作</li>
                          <li>支持多个数据库同步管理</li>
                          <li>完整的错误处理和日志记录</li>
                        </ul>
                      </div>
                      <div class="info-card">
                        <h3>技术栈</h3>
                        <ul>
                          <li>Cloudflare Workers</li>
                          <li>TypeScript</li>
                          <li>Notion API</li>
                          <li>Telegram Bot API</li>
                        </ul>
                      </div>
                      <div class="info-card">
                        <h3>使用提示</h3>
                        <ul>
                          <li>确保配置正确的环境变量</li>
                          <li>定期检查 Webhook 状态</li>
                          <li>查看日志了解同步详情</li>
                          <li>使用 /help 获取更多帮助</li>
                        </ul>
                      </div>
                      <div class="info-card">
                        <h3>联系作者</h3>
                        <ul>
                          <li>GitHub: <a href="https://github.com/bmqy/notion-tools-bot/issues" target="_blank" rel="noopener noreferrer"><code>@Issue</code></a></li>
                          <li>频道: <a href="https://t.me/tcbmqy" target="_blank" rel="noopener noreferrer"><code>@tcbmqy</code></a></li>
                          <li>群组: <a href="https://t.me/tgbmqy" target="_blank" rel="noopener noreferrer"><code>@tgbmqy</code></a></li>
                          <li>私聊: <a href="https://t.me/bmqyChatBot" target="_blank" rel="noopener noreferrer"><code>@bmqyChatBot</code></a></li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
                <div id="toast" class="toast">链接已复制到剪贴板</div>
              </div>
              <script>
                function copyWebhookUrl(url) {
                  navigator.clipboard.writeText(url).then(() => {
                    const toast = document.getElementById('toast');
                    toast.classList.add('show');
                    setTimeout(() => {
                      toast.classList.remove('show');
                    }, 2000);
                  });
                }
              </script>
            </body>
          </html>
        `, {
          headers: {
            'Content-Type': 'text/html;charset=UTF-8'
          }
        });
    }
  },

  /**
   * 定时任务，检查并触发延迟的操作
   */
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    logger.info('开始执行定时任务：检查延迟触发');
    
    try {
      // 获取所有 Notion 数据库
      const databases = await getAllNotionDatabasesFromKV(env.NOTION_TOOLS_BOT);
      logger.info(`找到 ${databases.length} 个数据库配置`);
      
      // 检查每个数据库的触发状态
      for (const database of databases) {
        if (!database.githubRepoId) {
          logger.debug(`跳过未绑定 GitHub 仓库的数据库: ${database.id}`);
          continue;
        }
        
        const databaseId = database.id.replace(/-/g, '');
        logger.info(`检查数据库 ${databaseId} 的触发状态...`);
        
        // 获取当前触发状态进行日志记录
        const currentStatus = await getTriggerStatus(env.NOTION_TOOLS_BOT, databaseId);
        if (currentStatus) {
          logger.info(`数据库 ${databaseId} 的触发状态: pending=${currentStatus.pending}, nextTriggerTime=${new Date(currentStatus.nextTriggerTime).toLocaleString()}, 当前时间=${new Date().toLocaleString()}`);
        } else {
          logger.info(`数据库 ${databaseId} 没有触发状态记录`);
        }
        
        // 检查是否可以触发操作
        if (await canTriggerActions(env.NOTION_TOOLS_BOT, databaseId)) {
          logger.info(`数据库 ${databaseId} 可以触发操作`);
          
          // 只要可以触发，就执行触发逻辑
          const [owner, repo] = database.githubRepoId.split('/') as [string, string];
          if (!owner || !repo) {
            logger.error(`GitHub 仓库 ID 格式错误: ${database.githubRepoId}`);
            continue;
          }
          
          if (!env.GITHUB_TOKEN) {
            logger.error('未配置 GitHub Token');
            continue;
          }
          
          logger.info(`触发 GitHub Action: ${owner}/${repo} (延迟触发)`);
          try {
            await triggerGitHubAction(env.GITHUB_TOKEN, owner, repo);
            await clearTriggerStatus(env.NOTION_TOOLS_BOT, databaseId);
            
            // 发送 Telegram 通知（如果配置了）
            if (env.TELEGRAM_ADMIN_USER_ID && env.TELEGRAM_BOT_TOKEN) {
              const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
              await bot.init();
              
              const message = `⏰ <b>延迟触发通知</b>\n\n` +
                `数据库：${database.name || database.id}\n` +
                `ID：${database.id}\n` +
                `关联仓库：${database.githubRepoId}\n` +
                `触发时间：${new Date().toLocaleString()}\n\n` +
                `✅ 已完成延迟触发 GitHub Action`;
              
              await bot.api.sendMessage(env.TELEGRAM_ADMIN_USER_ID, message, {
                parse_mode: 'HTML'
              });
            }
            
            logger.info(`成功触发 GitHub Action: ${owner}/${repo}`);
          } catch (error) {
            logger.error(`触发 GitHub Action 失败: ${owner}/${repo}`, error);
          }
        } else {
          logger.info(`数据库 ${databaseId} 不能触发操作，可能等待时间未到或已触发`);
        }
      }
      
      logger.info('定时任务完成');
    } catch (error) {
      logger.error('定时任务执行失败', error);
    }
  }
}; 
