import { createLogger } from '../utils/logger';

const logger = createLogger('GitHubActions');

interface GitHubError {
  message?: string;
  documentation_url?: string;
}

/**
 * 触发 GitHub repository_dispatch 事件
 */
export async function triggerGitHubAction(
  token: string,
  owner: string,
  repo: string
): Promise<void> {
  logger.info(`触发 GitHub Action: ${owner}/${repo}`);
  
  const url = `https://api.github.com/repos/${owner}/${repo}/dispatches`;
  logger.info(`请求 URL: ${url}`);
  
  const requestBody = {
    event_type: 'notion-update',
    client_payload: {
      timestamp: new Date().toISOString(),
      source: 'notion-tools-bot'
    }
  };
  
  try {
    logger.info('发送请求:', {
      url,
      method: 'POST',
      headers: {
        'Authorization': 'token [REDACTED]',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Notion-Tools-Bot'
      },
      body: requestBody
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Notion-Tools-Bot'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json() as GitHubError;
      logger.error(`触发 GitHub Action 失败:`, {
        status: response.status,
        statusText: response.statusText,
        error: error.message,
        documentation: error.documentation_url,
        responseHeaders: Object.fromEntries(response.headers.entries())
      });
      throw new Error(`触发 GitHub Action 失败: ${error.message || response.statusText}`);
    }
    
    logger.info(`GitHub Action 触发成功: ${owner}/${repo}`, {
      status: response.status,
      responseHeaders: Object.fromEntries(response.headers.entries())
    });
  } catch (error) {
    logger.error(`触发 GitHub Action 时发生错误:`, {
      error: error instanceof Error ? error.message : '未知错误',
      owner,
      repo
    });
    throw error;
  }
} 
