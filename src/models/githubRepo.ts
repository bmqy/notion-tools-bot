import { GithubRepo, KV_PREFIXES } from './types';

/**
 * 创建仓库 ID
 */
export function createRepoId(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

/**
 * 获取所有 GitHub 仓库
 */
export async function getAllGithubRepos(kv: KVNamespace): Promise<GithubRepo[]> {
  // 获取仓库 ID 列表
  const repoIdListStr = await kv.get(KV_PREFIXES.GITHUB_REPO_LIST);
  if (!repoIdListStr) {
    return [];
  }
  
  const repoIds = JSON.parse(repoIdListStr) as string[];
  
  // 并行获取所有仓库
  const repos = await Promise.all(
    repoIds.map(id => getGithubRepo(kv, id))
  );
  
  // 过滤掉可能不存在的仓库
  return repos.filter(repo => repo !== null) as GithubRepo[];
}

/**
 * 获取单个 GitHub 仓库
 */
export async function getGithubRepo(kv: KVNamespace, id: string): Promise<GithubRepo | null> {
  const key = `${KV_PREFIXES.GITHUB_REPO}${id}`;
  const repo = await kv.get(key, 'json');
  return repo as GithubRepo | null;
}

/**
 * 获取或创建 GitHub 仓库
 */
export async function getOrCreateGithubRepo(kv: KVNamespace, owner: string, repo: string): Promise<GithubRepo> {
  const id = createRepoId(owner, repo);
  
  // 检查仓库是否已存在
  const existingRepo = await getGithubRepo(kv, id);
  if (existingRepo) {
    return existingRepo;
  }
  
  // 创建新仓库
  return addGithubRepo(kv, { id, owner, repo });
}

/**
 * 添加 GitHub 仓库
 */
export async function addGithubRepo(kv: KVNamespace, repoData: Omit<GithubRepo, 'createdAt' | 'updatedAt'>): Promise<GithubRepo> {
  // 获取现有仓库 ID 列表
  const repoIdListStr = await kv.get(KV_PREFIXES.GITHUB_REPO_LIST);
  const repoIds = repoIdListStr ? JSON.parse(repoIdListStr) as string[] : [];
  
  // 检查仓库是否已存在
  if (!repoIds.includes(repoData.id)) {
    repoIds.push(repoData.id);
    await kv.put(KV_PREFIXES.GITHUB_REPO_LIST, JSON.stringify(repoIds));
  }
  
  // 创建新仓库记录
  const now = new Date().toISOString();
  const newRepo: GithubRepo = {
    ...repoData,
    createdAt: now,
    updatedAt: now
  };
  
  // 保存到 KV
  const key = `${KV_PREFIXES.GITHUB_REPO}${repoData.id}`;
  await kv.put(key, JSON.stringify(newRepo));
  
  return newRepo;
}

/**
 * 删除 GitHub 仓库
 */
export async function deleteGithubRepo(kv: KVNamespace, id: string): Promise<boolean> {
  // 获取现有仓库 ID 列表
  const repoIdListStr = await kv.get(KV_PREFIXES.GITHUB_REPO_LIST);
  if (!repoIdListStr) {
    return false;
  }
  
  const repoIds = JSON.parse(repoIdListStr) as string[];
  
  // 检查仓库是否存在
  const index = repoIds.indexOf(id);
  if (index === -1) {
    return false;
  }
  
  // 从列表中移除
  repoIds.splice(index, 1);
  await kv.put(KV_PREFIXES.GITHUB_REPO_LIST, JSON.stringify(repoIds));
  
  // 删除仓库记录
  const key = `${KV_PREFIXES.GITHUB_REPO}${id}`;
  await kv.delete(key);
  
  return true;
} 
