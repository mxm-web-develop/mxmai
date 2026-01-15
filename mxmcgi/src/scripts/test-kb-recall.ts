/**
 * 系统知识库召回测试脚本
 * 
 * 用法：
 *   tsx src/scripts/test-kb-recall.ts
 * 
 * 功能：
 *   1. 测试系统知识库是否存在
 *   2. 测试 admin 用户访问权限
 *   3. 测试知识库搜索功能
 *   4. 测试不同的查询词和参数
 *   5. 打印详细的调试信息
 */

import dotenv from 'dotenv';
import { join } from 'path';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { KnowledgeService } from '../core/knowledge/knowledge-service';

// 使用进程工作目录作为 mxmcgi 包根目录
const MXMCGI_ROOT = process.cwd();
// 项目根目录（mxmcgi 的上一级）
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

// 从 mxmcgi 目录加载 .env 文件（优先本包 .env，其次仓库根 .env）
dotenv.config({ path: join(MXMCGI_ROOT, '.env') });
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

// 测试参数
const TEST_CONFIG = {
  knowledgeBaseName: 'graph-photograph-portrait',
  testQueries: [
    {
      name: '查询1: 构图/光线/风格',
      query: '现代 柔和 侧光 人像摄影',
      description: '模拟 graph-service 中的查询1',
    },
    {
      name: '查询2: 背景/环境/姿势/妆容',
      query: '室内 躺姿 淡妆 人像',
      description: '模拟 graph-service 中的查询2',
    },
    {
      name: '简单查询',
      query: '人像摄影',
      description: '基础测试查询',
    },
    {
      name: '英文查询',
      query: 'portrait photography modern style',
      description: '英文查询测试',
    },
  ],
  recallLimit: 3,
  similarityThreshold: 0.6, // 降低到 0.6 以提高召回率（测试显示 0.7 阈值过高）
  maxTotalChunks: 10,
};

async function testKnowledgeBaseRecall() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 系统知识库召回测试');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  try {
    // 1. 初始化 RepositoryFactory
    RepositoryFactory.init();
    console.log('✅ RepositoryFactory 已初始化');
    console.log('');

    // 2. 查找 admin 用户
    const userRepo = RepositoryFactory.createUserRepository();
    let adminUser;
    
    try {
      // 优先查找 username='admin' 的用户
      adminUser = await userRepo.findByUsername('admin');
      if (!adminUser) {
        throw new Error('NOT_FOUND');
      }
    } catch (error: any) {
      if (error.code === 'NOT_FOUND' || error.message === 'NOT_FOUND') {
        // 如果找不到，尝试查找 role='admin' 的用户
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

    // 验证是否为 admin 角色
    if (adminUser.role !== 'admin') {
      throw new Error(`用户 "${adminUser.username}" 不是 admin 角色，当前角色: ${adminUser.role || 'user'}`);
    }

    console.log(`✅ 找到 admin 用户: ${adminUser.username} (ID: ${adminUser.id})`);
    console.log('');

    // 3. 检查知识库是否存在
    const kbRepo = RepositoryFactory.createKnowledgeBaseRepository();
    console.log(`🔍 检查知识库是否存在: ${TEST_CONFIG.knowledgeBaseName}`);
    
    let knowledgeBase;
    try {
      knowledgeBase = await kbRepo.findKnowledgeBaseByName(TEST_CONFIG.knowledgeBaseName);
      if (!knowledgeBase) {
        throw new Error('NOT_FOUND');
      }
      console.log(`✅ 知识库存在: ${knowledgeBase.name}`);
      console.log(`   - 显示名称: ${knowledgeBase.display_name}`);
      console.log(`   - 描述: ${knowledgeBase.description || '无'}`);
      console.log(`   - 类型: ${knowledgeBase.type}`);
      console.log(`   - 嵌入模型: ${knowledgeBase.embedding_model || '默认'}`);
      console.log(`   - 是否内置: ${knowledgeBase.is_builtin ? '是' : '否'}`);
      console.log(`   - 是否公开: ${knowledgeBase.is_public ? '是' : '否'}`);
      console.log(`   - 所有者ID: ${knowledgeBase.owner_id}`);
      console.log(`   - 文档数量: ${knowledgeBase.document_count || 0}`);
      console.log('');
    } catch (error: any) {
      if (error.code === 'NOT_FOUND' || error.message === 'NOT_FOUND') {
        console.error(`❌ 知识库 "${TEST_CONFIG.knowledgeBaseName}" 不存在！`);
        console.error('');
        console.error('💡 请先运行初始化脚本创建系统知识库:');
        console.error('   tsx src/scripts/init-system-kb.ts');
        console.error('');
        process.exit(1);
      } else {
        throw error;
      }
    }

    // 4. 检查知识库是否有文档
    if (!knowledgeBase.document_count || knowledgeBase.document_count === 0) {
      console.warn('⚠️  知识库中没有文档！');
      console.warn('');
      console.warn('💡 请先上传文档到知识库:');
      console.warn('   1. 在 systemKnowledge/graph-photograph-portrait/ 目录下放置文档');
      console.warn('   2. 运行向量化脚本: tsx embedding-systemkb.ts');
      console.warn('');
    } else {
      console.log(`✅ 知识库包含 ${knowledgeBase.document_count} 个文档`);
      console.log('');
      
      // 4.1 检查知识库中的实际文档数量（通过查询数据库）
      try {
        const docRepo = RepositoryFactory.createKnowledgeBaseRepository();
        const docList = await docRepo.listDocuments(TEST_CONFIG.knowledgeBaseName, {
          user_id: adminUser.id,
          limit: 100,
        });
        console.log(`📊 实际查询到的文档数量: ${docList.total}`);
        if (docList.total > 0) {
          console.log(`   前 ${Math.min(5, docList.documents.length)} 个文档:`);
          docList.documents.slice(0, 5).forEach((doc, idx) => {
            console.log(`   [${idx + 1}] ${doc.title || '无标题'}`);
            console.log(`       是否有向量: ${doc.embedding ? '是' : '否'}`);
            console.log(`       是否公开: ${doc.is_public ? '是' : '否'}`);
            console.log(`       所属用户: ${doc.user_id || '无'}`);
            console.log('');
          });
        }
        console.log('');
      } catch (error: any) {
        console.warn(`⚠️  无法查询文档列表: ${error.message}`);
        console.log('');
      }
    }

    // 5. 初始化知识库服务
    const knowledgeService = new KnowledgeService();
    console.log('✅ KnowledgeService 已初始化');
    console.log('');

    // 6. 测试不同的查询
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 开始测试知识库召回');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    for (const testQuery of TEST_CONFIG.testQueries) {
      console.log(`\n🔍 ${testQuery.name}`);
      console.log(`   查询词: "${testQuery.query}"`);
      console.log(`   说明: ${testQuery.description}`);
      console.log(`   参数: limit=${TEST_CONFIG.recallLimit}, threshold=${TEST_CONFIG.similarityThreshold}`);
      console.log('');

      try {
        const results = await knowledgeService.search({
          knowledgeBaseName: TEST_CONFIG.knowledgeBaseName,
          query: testQuery.query,
          searchType: 'hybrid',
          limit: TEST_CONFIG.recallLimit,
          threshold: TEST_CONFIG.similarityThreshold,
          userId: adminUser.id, // 使用 admin userId 访问系统知识库
        });

        console.log(`   ✅ 召回成功: ${results.length} 条结果`);
        
        if (results.length === 0) {
          console.log('   ⚠️  未召回任何结果，可能的原因：');
          console.log('      1. 知识库中没有相关文档');
          console.log('      2. 相似度阈值过高（当前: ' + TEST_CONFIG.similarityThreshold + '）');
          console.log('      3. 查询词与文档内容不匹配');
          console.log('      4. 文档尚未向量化');
        } else {
          console.log('');
          console.log('   📊 召回结果详情:');
          results.forEach((result, index) => {
            const similarity = 'similarity' in result ? result.similarity : ('combined_score' in result ? (result as any).combined_score : null);
            console.log(`   [${index + 1}] ${result.title || '无标题'}`);
            console.log(`       相似度: ${similarity ? (similarity * 100).toFixed(2) + '%' : 'N/A'}`);
            console.log(`       内容预览: ${(result.content || '').substring(0, 100)}${(result.content || '').length > 100 ? '...' : ''}`);
            console.log('');
          });
        }
      } catch (error: any) {
        console.error(`   ❌ 召回失败: ${error.message}`);
        console.error(`   错误详情:`, error);
        console.log('');
      }
    }

    // 7. 测试不同的阈值
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 测试不同相似度阈值的影响');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const testQuery = '人像摄影 现代风格';
    const thresholds = [0.5, 0.6, 0.7, 0.8, 0.9];

    for (const threshold of thresholds) {
      try {
        const results = await knowledgeService.search({
          knowledgeBaseName: TEST_CONFIG.knowledgeBaseName,
          query: testQuery,
          searchType: 'hybrid',
          limit: TEST_CONFIG.recallLimit,
          threshold: threshold,
          userId: adminUser.id,
        });

        console.log(`   阈值 ${threshold}: 召回 ${results.length} 条结果`);
        if (results.length > 0) {
          const firstResult = results[0];
          const sim = 'similarity' in firstResult ? firstResult.similarity : ('combined_score' in firstResult ? (firstResult as any).combined_score : null);
          console.log(`     最高相似度: ${sim ? (sim * 100).toFixed(2) + '%' : 'N/A'}`);
        }
      } catch (error: any) {
        console.error(`   阈值 ${threshold}: 错误 - ${error.message}`);
      }
    }

    // 8. 额外诊断：检查知识库权限和文档状态
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 额外诊断信息');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
      const docRepo = RepositoryFactory.createKnowledgeBaseRepository();
      const docList = await docRepo.listDocuments(TEST_CONFIG.knowledgeBaseName, {
        user_id: adminUser.id,
        limit: 10,
      });
      
      console.log(`📊 文档统计:`);
      console.log(`   - 总文档数: ${docList.total}`);
      console.log(`   - 有向量的文档数: ${docList.documents.filter(d => d.embedding).length}`);
      console.log(`   - 公开文档数: ${docList.documents.filter(d => d.is_public).length}`);
      console.log(`   - 私有文档数: ${docList.documents.filter(d => !d.is_public).length}`);
      console.log(`   - 属于 admin 的文档数: ${docList.documents.filter(d => d.user_id === adminUser.id).length}`);
      console.log('');
      
      if (docList.total > 0 && docList.documents.filter(d => d.embedding).length === 0) {
        console.warn('⚠️  所有文档都没有向量！请运行向量化脚本:');
        console.warn('   tsx embedding-systemkb.ts');
        console.log('');
      }
    } catch (error: any) {
      console.warn(`⚠️  诊断查询失败: ${error.message}`);
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 测试完成！');
    console.log('');
    console.log('💡 如果召回结果为空，请检查：');
    console.log('   1. 知识库是否有文档（document_count > 0）');
    console.log('   2. 文档是否已向量化（运行 embedding-systemkb.ts）');
    console.log('   3. 相似度阈值是否过高（尝试降低 threshold）');
    console.log('   4. 查询词是否与文档内容匹配');
    console.log('   5. admin userId 是否正确（用于访问私有知识库）');
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error('❌ 测试失败:', error.message);
    console.error('');
    if (error.stack) {
      console.error('错误堆栈:', error.stack);
    }
    console.error('');
    process.exit(1);
  }
}

testKnowledgeBaseRecall();
