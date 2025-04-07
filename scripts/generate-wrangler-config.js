import { writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 基础配置
const baseConfig = {
  name: "notion-tools-bot",
  main: "src/worker.ts",
  compatibility_date: "2024-03-31",
  compatibility_flags: ["nodejs_compat"],
  // 添加触发器配置
  triggers: {
    crons: ["* * * * *"] // 每分钟执行一次
  }
};

// 从环境变量获取 KV 配置
function getKVNamespaces() {
  const kvConfig = [];
  
  // 获取 KV 命名空间 ID
  const namespaceId = process.env.KV_NAMESPACE_ID;
  
  if (namespaceId) {
    kvConfig.push({
      binding: "NOTION_TOOLS_BOT",
      id: namespaceId.trim()
    });
  }
  
  return kvConfig;
}

// 生成 TOML 格式的字符串
function generateTomlString(config) {
  let tomlContent = '';
  
  // 处理基础配置
  for (const [key, value] of Object.entries(config)) {
    // 跳过 kv_namespaces 和 triggers，后面单独处理
    if (key === 'kv_namespaces' || key === 'triggers') continue;
    
    if (Array.isArray(value)) {
      tomlContent += `${key} = [${value.map(v => `"${v}"`).join(', ')}]\n`;
    } else if (typeof value === 'boolean') {
      tomlContent += `${key} = ${value}\n`;
    } else if (typeof value === 'string') {
      tomlContent += `${key} = "${value}"\n`;
    } else if (typeof value === 'number') {
      tomlContent += `${key} = ${value}\n`;
    }
  }
  
  // 处理 KV 命名空间配置
  if (config.kv_namespaces && config.kv_namespaces.length > 0) {
    tomlContent += '\n# KV 命名空间配置\n';
    config.kv_namespaces.forEach(namespace => {
      tomlContent += `[[kv_namespaces]]\n`;
      for (const [key, value] of Object.entries(namespace)) {
        tomlContent += `${key} = "${value}"\n`;
      }
    });
  }
  
  // 处理触发器配置
  if (config.triggers) {
    tomlContent += '\n# 定时任务配置\n';
    tomlContent += '[triggers]\n';
    
    // 处理 crons 数组
    if (config.triggers.crons && config.triggers.crons.length > 0) {
      tomlContent += `crons = [${config.triggers.crons.map(cron => `"${cron}"`).join(', ')}]\n`;
    }
  }
  
  return tomlContent;
}

// 生成配置
function generateConfig() {
  const config = { ...baseConfig };
  
  // 添加 KV 命名空间配置
  const kvNamespaces = getKVNamespaces();
  if (kvNamespaces.length > 0) {
    config.kv_namespaces = kvNamespaces;
  }
  
  // 保留 Workers 控制台中的变量配置
  config.keep_vars = true;
  
  return generateTomlString(config);
}

// 写入配置文件
function writeConfig() {
  const configPath = resolve(__dirname, '../wrangler.toml');
  const config = generateConfig();
  
  try {
    writeFileSync(configPath, config, 'utf8');
    console.log('✅ generate toml success');
  } catch (error) {
    console.error('❌ generate toml failed:', error);
    process.exit(1);
  }
}

// 执行配置生成
writeConfig(); 
