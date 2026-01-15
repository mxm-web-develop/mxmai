/**
 * 修复知识库文档统计脚本
 * 
 * 用法：
 *   tsx src/scripts/fix-kb-document-count.ts
 * 
 * 功能：
 *   修复知识库的 document_count 统计字段（如果触发器未正确更新）
 */

import dotenv from 'dotenv';
import { join } from 'path';
import { RepositoryFactory } from '@mxmai/mxmdata';

// 使用进程工作目录作为 mxmcgi 包根目录
const MXMCGI_ROOT = process.cwd();
// 项目根目录（mxmcgi 的上一级）
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

// 从 mxmcgi 目录加载 .env 文件（优先本包 .env，其次仓库根 .env）
dotenv.config({ path: join(MXMCGI_ROOT, '.env') });
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

async function fixKnowledgeBaseDocumentCount() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 修复知识库文档统计');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  try {
    // 1. 初始化 RepositoryFactory
    RepositoryFactory.init();
    console.log('✅ RepositoryFactory 已初始化');
    console.log('');

    // 2. 获取知识库和文档仓库
    const kbRepo = RepositoryFactory.createKnowledgeBaseRepository();
    const docRepo = RepositoryFactory.createKnowledgeBaseRepository();
    
    // 3. 获取所有知识库
    console.log('📚 获取所有知识库...');
    const allKbs = await kbRepo.listKnowledgeBases({ limit: 1000 });
    console.log(`✅ 找到 ${allKbs.knowledge_bases.length} 个知识库`);
    console.log('');

    let fixedSystemCount = 0;
    let fixedUserCount = 0;
    const systemKbs: Array<{ kb: typeof allKbs.knowledge_bases[0]; actualCount: number; storedCount: number }> = [];
    const userKbs: Array<{ kb: typeof allKbs.knowledge_bases[0]; actualCount: number; storedCount: number }> = [];

    // 4. 对每个知识库，重新计算文档数量并分类
    for (const kb of allKbs.knowledge_bases) {
      try {
        // 查询该知识库的实际文档数量
        const docList = await docRepo.listDocuments(kb.name, {
          limit: 10000, // 获取所有文档
        });
        
        const actualCount = docList.total;
        const storedCount = kb.document_count || 0;

        if (actualCount !== storedCount) {
          // 根据 is_builtin 字段区分系统知识库和用户知识库
          if (kb.is_builtin) {
            systemKbs.push({ kb, actualCount, storedCount });
            fixedSystemCount++;
          } else {
            userKbs.push({ kb, actualCount, storedCount });
            fixedUserCount++;
          }
        } else {
          const kbType = kb.is_builtin ? '系统' : '用户';
          console.log(`✅ [${kbType}] ${kb.name}: 文档统计正确 (${actualCount} 个文档)`);
        }
      } catch (error: any) {
        console.error(`❌ 处理知识库 ${kb.name} 时出错: ${error.message}`);
      }
    }

    // 5. 显示需要修复的系统知识库
    if (systemKbs.length > 0) {
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔧 系统知识库（需要修复）');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      
      for (const { kb, actualCount, storedCount } of systemKbs) {
        console.log(`🔧 系统知识库: ${kb.name}`);
        console.log(`   显示名称: ${kb.display_name}`);
        console.log(`   存储的文档数: ${storedCount}`);
        console.log(`   实际文档数: ${actualCount}`);
        console.log(`   ⚠️  需要手动修复或添加更新方法`);
        console.log('');
      }
    }

    // 6. 显示需要修复的用户知识库
    if (userKbs.length > 0) {
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('👤 用户知识库（需要修复）');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      
      for (const { kb, actualCount, storedCount } of userKbs) {
        console.log(`👤 用户知识库: ${kb.name}`);
        console.log(`   显示名称: ${kb.display_name}`);
        console.log(`   所有者ID: ${kb.owner_id || 'N/A'}`);
        console.log(`   存储的文档数: ${storedCount}`);
        console.log(`   实际文档数: ${actualCount}`);
        console.log(`   ⚠️  需要手动修复或添加更新方法`);
        console.log('');
      }
    }

    const fixedCount = fixedSystemCount + fixedUserCount;

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (fixedCount > 0) {
      console.log(`⚠️  发现 ${fixedCount} 个知识库的文档统计需要修复`);
      if (fixedSystemCount > 0) {
        console.log(`   - 系统知识库: ${fixedSystemCount} 个`);
      }
      if (fixedUserCount > 0) {
        console.log(`   - 用户知识库: ${fixedUserCount} 个`);
      }
      console.log('');
      console.log('💡 解决方案：');
      console.log('   1. 检查数据库触发器 trigger_update_kb_document_count 是否正常工作');
      console.log('   2. 如果触发器不存在，运行数据库迁移脚本创建触发器');
      console.log('   3. 或者手动执行 SQL 更新 document_count:');
      console.log('');
      if (fixedSystemCount > 0) {
        console.log('   📌 修复系统知识库:');
        console.log('      UPDATE knowledge_bases kb');
        console.log('      SET document_count = (');
        console.log('        SELECT COUNT(*) FROM knowledge_base_documents kbd');
        console.log('        WHERE kbd.knowledge_base_name = kb.name');
        console.log('      )');
        console.log('      WHERE kb.is_builtin = true;');
        console.log('');
      }
      if (fixedUserCount > 0) {
        console.log('   👤 修复用户知识库:');
        console.log('      UPDATE knowledge_bases kb');
        console.log('      SET document_count = (');
        console.log('        SELECT COUNT(*) FROM knowledge_base_documents kbd');
        console.log('        WHERE kbd.knowledge_base_name = kb.name');
        console.log('      )');
        console.log('      WHERE kb.is_builtin = false;');
        console.log('');
      }
      console.log('   或者修复所有知识库:');
      console.log('      UPDATE knowledge_bases kb');
      console.log('      SET document_count = (');
      console.log('        SELECT COUNT(*) FROM knowledge_base_documents kbd');
      console.log('        WHERE kbd.knowledge_base_name = kb.name');
      console.log('      );');
    } else {
      console.log('✅ 所有知识库的文档统计都是正确的！');
    }
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error('❌ 修复失败:', error.message);
    console.error('');
    if (error.stack) {
      console.error('错误堆栈:', error.stack);
    }
    console.error('');
    process.exit(1);
  }
}

fixKnowledgeBaseDocumentCount();
