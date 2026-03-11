/**
 * 系统知识库文档向量化脚本
 * 
 * 用法：
 *   tsx embedding-systemkb.ts
 * 
 * 功能：
 *   1. 遍历 systemKnowledge 目录下的所有知识库文件夹
 *   2. 对每个知识库目录下的文档进行向量化
 *   3. 如果文档已经做过向量化且文件没有更新，则跳过
 */

import dotenv from 'dotenv';
import { join } from 'path';
import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';

// 使用 createRequire 来导入 CommonJS 模块（mxmcgi 使用 CommonJS）
const require = createRequire(import.meta.url);

// 动态导入 ES modules（mxmdata 使用 ES modules）
const mxmdataModule = await import('./mxmdata/src/index.js');
const RepositoryFactory = mxmdataModule.RepositoryFactory;

// 使用 require 导入 CommonJS 模块（mxmcgi 使用 CommonJS）
const mxmcgiKnowledgeModule = require('./mxmcgi/src/knowledge/knowledge-service.ts');
const KnowledgeService = mxmcgiKnowledgeModule.KnowledgeService;

// 项目根目录
const PROJECT_ROOT = process.cwd();

// 加载环境变量（优先根目录，其次 mxmcgi 目录）
dotenv.config({ path: join(PROJECT_ROOT, '.env') });
dotenv.config({ path: join(PROJECT_ROOT, 'mxmcgi', '.env') });

// 系统知识库目录
const SYSTEM_KNOWLEDGE_DIR = join(PROJECT_ROOT, 'systemKnowledge');

// 支持的文件扩展名
const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.pdf'];

interface FileInfo {
  path: string;
  name: string;
  mtime: Date; // 文件修改时间
  size: number;
}

/**
 * 获取目录下的所有文件（递归）
 */
function getAllFiles(dirPath: string, fileList: FileInfo[] = []): FileInfo[] {
  if (!existsSync(dirPath)) {
    return fileList;
  }

  const files = readdirSync(dirPath, { withFileTypes: true });

  for (const file of files) {
    const filePath = join(dirPath, file.name);

    if (file.isDirectory()) {
      // 递归处理子目录
      getAllFiles(filePath, fileList);
    } else if (file.isFile()) {
      // 检查文件扩展名
      const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        const stats = statSync(filePath);
        fileList.push({
          path: filePath,
          name: file.name,
          mtime: stats.mtime,
          size: stats.size,
        });
      }
    }
  }

  return fileList;
}

/**
 * 检查文档是否已存在且未更新
 */
async function isDocumentUpToDate(
  knowledgeBaseName: string,
  fileName: string,
  fileMtime: Date,
  adminUserId: string
): Promise<boolean> {
  const kbRepo = RepositoryFactory.createKnowledgeBaseRepository();
  
  try {
    // 列出知识库中的所有文档（获取所有文档，不分页）
    let allDocuments: any[] = [];
    let offset = 0;
    const limit = 100;
    
    while (true) {
      const result = await kbRepo.listDocuments(knowledgeBaseName, {
        user_id: adminUserId,
        limit,
        offset,
      });
      
      allDocuments.push(...result.documents);
      
      if (result.documents.length < limit) {
        break; // 已获取所有文档
      }
      
      offset += limit;
    }

    // 查找同名文件的文档
    const sameFileDocs = allDocuments.filter((doc) => {
      return doc.metadata?.originalFileName === fileName;
    });

    if (sameFileDocs.length === 0) {
      return false; // 文档不存在，需要上传
    }

    // 检查文件的最后修改时间
    // 从 metadata 中获取文件的上传时间或修改时间
    const doc = sameFileDocs[0];
    const docFileMtime = doc.metadata?.fileMtime 
      ? new Date(doc.metadata.fileMtime as string)
      : doc.created_at 
        ? new Date(doc.created_at)
        : null;

    if (!docFileMtime) {
      // 如果没有记录文件修改时间，认为需要更新（安全起见）
      return false;
    }

    // 比较文件修改时间（允许 1 秒的误差，因为文件系统时间精度问题）
    const timeDiff = Math.abs(fileMtime.getTime() - docFileMtime.getTime());
    return timeDiff < 1000; // 如果时间差小于 1 秒，认为文件未更新
  } catch (error) {
    console.error(`检查文档状态失败: ${error instanceof Error ? error.message : String(error)}`);
    return false; // 出错时，安全起见认为需要更新
  }
}

async function embedSystemKnowledgeBases() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📚 系统知识库文档向量化');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  try {
    // 1. 初始化 RepositoryFactory
    RepositoryFactory.init();
    console.log('✅ RepositoryFactory 已初始化');

    // 2. 查找 admin 用户
    const userRepo = RepositoryFactory.createUserRepository();
    let adminUser;
    
    try {
      adminUser = await userRepo.findByUsername('admin');
      if (!adminUser) {
        throw new Error('NOT_FOUND');
      }
    } catch (error: any) {
      if (error.code === 'NOT_FOUND' || error.message === 'NOT_FOUND') {
        console.log('⚠️  未找到 username="admin" 的用户，尝试查找 role="admin" 的用户...');
        const result = await userRepo.findAll({
          page: 1,
          limit: 1,
          filters: {
            role: 'admin',
          },
        });
        
        if (result.users.length === 0) {
          throw new Error('未找到 admin 用户，请先运行: pnpm --filter @mxmai/mxmdata create:admin');
        }
        
        adminUser = result.users[0];
      } else {
        throw error;
      }
    }

    if (adminUser.role !== 'admin') {
      throw new Error(`用户 "${adminUser.username}" 不是 admin 角色，当前角色: ${adminUser.role || 'user'}`);
    }

    console.log(`✅ 找到 admin 用户: ${adminUser.username} (ID: ${adminUser.id})`);
    console.log('');

    // 3. 检查 systemKnowledge 目录是否存在
    if (!existsSync(SYSTEM_KNOWLEDGE_DIR)) {
      console.warn(`⚠️  systemKnowledge 目录不存在: ${SYSTEM_KNOWLEDGE_DIR}`);
      console.warn('   请先运行: pnpm --filter @mxmai/mxmcgi init:system-kb');
      return;
    }

    // 4. 获取所有知识库目录
    const kbDirs = readdirSync(SYSTEM_KNOWLEDGE_DIR, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    if (kbDirs.length === 0) {
      console.log('ℹ️  systemKnowledge 目录下没有知识库文件夹');
      return;
    }

    console.log(`📁 找到 ${kbDirs.length} 个知识库目录`);
    console.log('');

    // 5. 初始化知识库服务
    const knowledgeService = new KnowledgeService();
    const kbRepo = RepositoryFactory.createKnowledgeBaseRepository();

    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    // 6. 遍历每个知识库目录
    for (const kbDirName of kbDirs) {
      const kbDirPath = join(SYSTEM_KNOWLEDGE_DIR, kbDirName);
      
      console.log(`\n📂 处理知识库: ${kbDirName}`);
      console.log(`   目录: ${kbDirPath}`);

      try {
        // 6.1 查找对应的知识库
        const knowledgeBase = await kbRepo.findKnowledgeBaseByName(kbDirName);
        if (!knowledgeBase) {
          console.warn(`   ⚠️  知识库 "${kbDirName}" 不存在，跳过该目录`);
          console.warn(`   提示: 请先运行: pnpm --filter @mxmai/mxmcgi init:system-kb`);
          continue;
        }

        console.log(`   ✅ 找到知识库: ${knowledgeBase.display_name}`);

        // 6.2 获取目录下的所有文件
        const files = getAllFiles(kbDirPath);
        
        if (files.length === 0) {
          console.log(`   ℹ️  目录下没有支持的文件（支持: ${SUPPORTED_EXTENSIONS.join(', ')}）`);
          continue;
        }

        console.log(`   📄 找到 ${files.length} 个文件`);

        // 6.3 处理每个文件
        for (const fileInfo of files) {
          try {
            // 检查文件是否已存在且未更新
            const isUpToDate = await isDocumentUpToDate(
              kbDirName,
              fileInfo.name,
              fileInfo.mtime,
              adminUser.id
            );

            if (isUpToDate) {
              console.log(`   ⏭️  跳过: ${fileInfo.name} (已向量化且未更新)`);
              totalSkipped++;
              continue;
            }

            // 读取文件内容
            const fileBuffer = readFileSync(fileInfo.path);
            
            // 确定 MIME 类型
            const ext = fileInfo.name.toLowerCase().substring(fileInfo.name.lastIndexOf('.'));
            let mimeType = 'text/plain';
            if (ext === '.md' || ext === '.markdown') {
              mimeType = 'text/markdown';
            } else if (ext === '.pdf') {
              mimeType = 'application/pdf';
            }

            console.log(`   📤 上传: ${fileInfo.name} (${(fileInfo.size / 1024).toFixed(2)} KB)`);

            // 上传文件
            const result = await knowledgeService.uploadFile({
              knowledgeBaseName: kbDirName,
              file: {
                buffer: fileBuffer,
                originalname: fileInfo.name,
                mimetype: mimeType,
                size: fileInfo.size,
              },
              userId: adminUser.id,
              tags: ['system', 'auto-imported'],
              metadata: {
                source: 'systemKnowledge',
                filePath: fileInfo.path,
                fileMtime: fileInfo.mtime.toISOString(),
                fileSize: fileInfo.size,
              },
              isPublic: false, // 系统知识库文档不公开
            });

            if (result.replaced) {
              console.log(`   ✅ 已更新: ${fileInfo.name} (${result.documents.length} 个 chunks)`);
            } else {
              console.log(`   ✅ 已上传: ${fileInfo.name} (${result.documents.length} 个 chunks)`);
            }
            totalProcessed++;
          } catch (error: any) {
            console.error(`   ❌ 处理文件 "${fileInfo.name}" 失败:`, error.message);
            totalErrors++;
          }
        }
      } catch (error: any) {
        console.error(`❌ 处理知识库 "${kbDirName}" 失败:`, error.message);
        totalErrors++;
      }
    }

    // 7. 输出统计信息
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 处理完成');
    console.log('');
    console.log(`   处理: ${totalProcessed} 个文件`);
    console.log(`   跳过: ${totalSkipped} 个文件（已向量化且未更新）`);
    console.log(`   错误: ${totalErrors} 个文件`);
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error: any) {
    console.error('');
    console.error('❌ 执行失败:', error.message);
    console.error('');
    process.exit(1);
  }
}

embedSystemKnowledgeBases();
