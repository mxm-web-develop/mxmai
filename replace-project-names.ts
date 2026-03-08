#!/usr/bin/env tsx

/**
 * 项目名称替换脚本
 * 根据 migration-config.json 配置批量替换项目中的名称和标识符
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

interface MigrationConfig {
  oldProjectName: string;
  newProjectName: string;
  oldProjectDescription: string;
  newProjectDescription: string;
  oldAuthor: string;
  newAuthor: string;
  replacements: Record<string, string>;
  services?: Record<string, string>;
}

// 需要处理的文件扩展名
const TEXT_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.sh',
  '.yml',
  '.yaml',
  '.sql',
  '.txt',
  '.env.example',
];

// 需要排除的目录
const EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.expo',
  'ios/build',
  'android/build',
  'coverage',
  '.vscode',
  '.idea',
];

// 需要排除的文件
const EXCLUDE_FILES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'migration-config.json',
  'replace-project-names.ts',
  'migrate-project.sh',
];

function shouldProcessFile(filePath: string): boolean {
  const ext = extname(filePath);
  if (!TEXT_EXTENSIONS.includes(ext) && !filePath.endsWith('.env.example')) {
    return false;
  }

  const fileName = filePath.split('/').pop() || '';
  if (EXCLUDE_FILES.includes(fileName)) {
    return false;
  }

  for (const dir of EXCLUDE_DIRS) {
    if (filePath.includes(`/${dir}/`) || filePath.includes(`\\${dir}\\`)) {
      return false;
    }
  }

  return true;
}

function replaceInFile(filePath: string, replacements: Record<string, string>): boolean {
  try {
    let content = readFileSync(filePath, 'utf-8');
    let modified = false;

    // 按长度降序排序，先替换长的字符串
    const sortedReplacements = Object.entries(replacements).sort(
      (a, b) => b[0].length - a[0].length,
    );

    for (const [oldValue, newValue] of sortedReplacements) {
      if (content.includes(oldValue)) {
        content = content.replace(new RegExp(escapeRegExp(oldValue), 'g'), newValue);
        modified = true;
      }
    }

    if (modified) {
      writeFileSync(filePath, content, 'utf-8');
      return true;
    }

    return false;
  } catch (error) {
    console.error(`❌ 处理文件失败: ${filePath}`, error);
    return false;
  }
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function walkDirectory(dir: string, callback: (filePath: string) => void): void {
  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        const dirName = entry;
        if (!EXCLUDE_DIRS.includes(dirName)) {
          walkDirectory(fullPath, callback);
        }
      } else if (stat.isFile()) {
        if (shouldProcessFile(fullPath)) {
          callback(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`❌ 读取目录失败: ${dir}`, error);
  }
}

function loadConfig(): MigrationConfig {
  try {
    const configContent = readFileSync('migration-config.json', 'utf-8');
    return JSON.parse(configContent) as MigrationConfig;
  } catch (error) {
    console.error('❌ 无法读取 migration-config.json');
    console.error('请先运行 ./migrate-project.sh 创建配置文件');
    process.exit(1);
  }
}

function main() {
  console.log('🔄 开始替换项目名称和标识符...\n');

  const config = loadConfig();
  const replacements = {
    ...config.replacements,
    [config.oldProjectName]: config.newProjectName,
    [config.oldProjectDescription]: config.newProjectDescription,
    [config.oldAuthor]: config.newAuthor,
  };

  // 如果配置了服务重命名，添加服务相关的替换
  if (config.services) {
    for (const [oldService, newService] of Object.entries(config.services)) {
      if (oldService !== newService) {
        replacements[oldService] = newService;
        replacements[`@mxmai/${oldService}`] = `@${config.newProjectName.replace('@', '')}/${newService}`;
        replacements[`@mxmweb/${oldService}`] = `@${config.newProjectName.replace('@', '')}/${newService}`;
      }
    }
  }

  console.log('📋 替换规则:');
  for (const [old, new_] of Object.entries(replacements)) {
    if (old !== new_) {
      console.log(`   ${old} → ${new_}`);
    }
  }
  console.log('');

  let processedCount = 0;
  let modifiedCount = 0;

  walkDirectory('.', (filePath) => {
    processedCount++;
    if (replaceInFile(filePath, replacements)) {
      modifiedCount++;
      console.log(`✅ 已修改: ${filePath}`);
    }
  });

  console.log('\n📊 统计:');
  console.log(`   处理文件数: ${processedCount}`);
  console.log(`   修改文件数: ${modifiedCount}`);
  console.log('\n🎉 替换完成！');
  console.log('\n⚠️  请检查以下内容:');
  console.log('1. 检查 package.json 中的包名和描述');
  console.log('2. 检查各服务的 package.json');
  console.log('3. 检查 pnpm-workspace.yaml');
  console.log('4. 检查环境变量文件中的配置');
  console.log('5. 检查数据库连接字符串和配置');
  console.log('6. 检查 API 文档和 README 文件');
}

main();
