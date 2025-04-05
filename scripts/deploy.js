import { execSync } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

// 读取环境变量
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const WORKER_NAME = 'notion-tools-bot';

if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
  console.error('请设置 CLOUDFLARE_ACCOUNT_ID 和 CLOUDFLARE_API_TOKEN 环境变量');
  process.exit(1);
}

async function deployWorker() {
  try {
    // 构建项目
    console.log('正在构建项目...');
    execSync('npm run build', { stdio: 'inherit' });

    // 检查构建输出目录
    const distDir = path.join(__dirname, '../dist');
    if (!fs.existsSync(distDir)) {
      throw new Error(`构建输出目录不存在：${distDir}`);
    }

    // 读取构建后的文件
    const workerPath = path.join(distDir, 'worker.js');
    if (!fs.existsSync(workerPath)) {
      throw new Error(`构建输出文件不存在：${workerPath}`);
    }

    const workerCode = fs.readFileSync(workerPath, 'utf8');
    if (!workerCode) {
      throw new Error('构建输出文件为空');
    }

    // 准备部署请求
    const deployUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${WORKER_NAME}`;
    
    // 部署 Worker
    console.log('正在部署 Worker...');
    const response = await fetch(deployUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/javascript',
      },
      body: workerCode
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('Worker 代码部署成功！');

      // 配置 Worker 设置
      const settingsUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/settings`;
      
      // 读取 wrangler.toml 中的 KV 配置
      const wranglerConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../wrangler.toml'), 'utf8'));
      const kvNamespaces = wranglerConfig.kv_namespaces || [];

      // 更新 Worker 设置
      const settingsResponse = await fetch(settingsUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kv_namespaces: kvNamespaces,
          compatibility_date: wranglerConfig.compatibility_date || '2024-01-01',
        })
      });

      const settingsData = await settingsResponse.json();
      
      if (settingsData.success) {
        console.log('Worker 设置更新成功！');
        console.log('Worker URL:', `https://${WORKER_NAME}.${CLOUDFLARE_ACCOUNT_ID}.workers.dev`);
      } else {
        console.error('Worker 设置更新失败：', settingsData.errors);
        process.exit(1);
      }
    } else {
      console.error('部署失败：', data.errors);
      process.exit(1);
    }
  } catch (error) {
    console.error('部署过程出错：', error.message);
    process.exit(1);
  }
}

// 执行部署
deployWorker(); 
