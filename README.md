# Notion Tools Bot

一个强迫`AI`开发的可部署到`Cloudflare Workers`上的`Telegram`机器人，用于管理`Notion`数据库和`GitHub`仓库绑定的`Bot`应用。

## 功能特点

- 🤖 `Telegram`机器人管理界面
- 📦 适用于基于`Notion`作为数据库的静态站点
- 🔄 指令化关联`Notion`数据库和`GitHub`仓库绑定
- 🔗 支持多个数据库和仓库的绑定
- 📝 `Notion`数据库更新时自动触发`GitHub Actions`工作流
- 📝 指令式触发`Notion`数据库绑定仓库的`GitHub Actions`工作流
- 🔔 实时接收工作流执行状态消息

## 准备工作

### 申请 Telegram Bot
- 访问 [Telegram Bot Father](https://t.me/BotFather)
- 输入`/newbot`，然后输入机器人的名称和描述
- 获取`BOT_TOKEN`

### Notion Token 获取与 Webhook 配置

#### 1. 创建 Notion 集成

1. 访问 [Notion Integrations](https://www.notion.so/profile/integrations)
2. 点击`New integration`
3. 填写集成名称和选择工作区
4. 保存并获取 `NOTION_TOKEN`

#### 2. 配置数据库权限

1. 在`Notion`中打开要集成的数据库
2. 点击右上角的`...`菜单
3. 选择`Add connections`
4. 选择你创建的集成

#### 3. 设置 Webhook

后续步骤需要等待`workers`项目部署成功后方可继续。

1. 访问 [Notion Webhooks](https://www.notion.so/profile/integrations)
2. 点击`New webhook`
3. 选择要监听的数据库
4. 设置`webhook URL`为你的`Worker URL`（例如：`https://your-worker.workers.dev/api/notion/webhook`）
5. 保存配置

#### 4. 验证 Webhook

当你设置`webhook URL`时，`Notion`会发送一个验证请求。我们的`Workers`会自动处理这个请求：

1. 当你收到验证请求时，机器人会发送一条消息给你，包含验证令牌
2. 消息格式如下：
   ```
   🔔 Notion Webhook 验证请求

   验证令牌：
   <code>your-verification-token</code>

   请点击上方令牌复制，然后添加到`Notion webhook`配置中。
   ```
3. 点击消息中的令牌即可复制
4. 将令牌添加到`Notion webhook`配置中完成验证

### 环境变量

准备好`workers`项目运行时所需的环境变量：

```env
# Notion API 令牌
NOTION_TOKEN=your_notion_integration_token

# Telegram 配置
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_ADMIN_USER_ID=your_telegram_user_id

# GitHub 配置
GITHUB_TOKEN=your_github_personal_access_token
```

### 获取 KV 命名空间id

- 访问 [Cloudflare Dashboard](https://dash.cloudflare.com)
- 打开`存储和数据库`
- 创建一个`KV`
- 记录下`KV`命名空间`ID`

## 安装部署

1. `fork`本仓库

2. 创建`cloudflare workers`项目
   - 选择`fork`的仓库
   - 输入构建变量：
      - `KV_NAMESPACE_ID`: `KV`命名空间`ID`
   - 部署项目
3. 创建完成后，打开`workers`设置面板，填写`运行时`所需的`环境变量`（变量名称处支持多个变量的复制粘贴）

4. 部署成功后，访问 `https://your-worker.workers.dev/`，即可看到机器人的欢迎界面

5. 访问`https://your-worker.workers.dev/api/telegram/setup`，你应该看到`Webhook setup completed`的成功提示

6. 此时可以继续完成`notion webhook`的验证步骤

7. Enjoy the bot!

## 使用说明

1. 发送 `/start` 开始使用
2. 发送 `/help` 查看帮助
```
/list - 列出所有监听的 Notion 数据库
/bind [数据库ID] [owner/repo] - 添加 Notion 数据库和 GitHub 仓库的绑定
/unbind - 移除 Notion 数据库和 GitHub 仓库的绑定
/trigger - 手动触发 GitHub repository_dispatch 事件

使用说明：
1. 数据库 ID 可以从 Notion 数据库页面的 URL 中获取，格式为 32 位字符串
2. 添加/移除数据库需要管理员权限
3. 使用 /list 可以查看当前所有监听的数据库
4. 使用 /trigger 可以手动触发已关联的 GitHub Action
```

## 许可证

MIT 
