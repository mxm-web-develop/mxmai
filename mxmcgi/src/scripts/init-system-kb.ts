/**
 * 系统知识库初始化脚本
 * 
 * 用法：
 *   tsx src/scripts/init-system-kb.ts
 * 
 * 功能：
 *   1. 查找 admin 用户（如果不存在则报错）
 *   2. 创建所有系统知识库（graph-photograph-*, graph-design-*, graph-painting-*）
 *   3. 创建 systemKnowledge 文件夹结构，方便后期存放知识库文档
 */

import dotenv from 'dotenv';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { KnowledgeService } from '../core/knowledge/knowledge-service';

// 使用进程工作目录作为 mxmcgi 包根目录
const MXMCGI_ROOT = process.cwd();
// 项目根目录（mxmcgi 的上一级）
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

// 从 mxmcgi 目录加载 .env 文件（优先本包 .env，其次仓库根 .env）
dotenv.config({ path: join(MXMCGI_ROOT, '.env') });
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

// 系统知识库配置
const SYSTEM_KNOWLEDGE_BASES = [
  // Photograph 类型
  {
    name: 'graph-photograph-portrait',
    display_name: '人像摄影知识库',
    description: '系统知识库：用于人像摄影（portrait）的构图、光线、风格、摄影师参考等专业知识',
    category: 'photograph',
    subType: 'portrait',
  },
  {
    name: 'graph-photograph-landscape',
    display_name: '风景摄影知识库',
    description: '系统知识库：用于风景摄影（landscape）的构图、光线、时间、天气等专业知识',
    category: 'photograph',
    subType: 'landscape',
  },
  {
    name: 'graph-photograph-cinematic',
    display_name: '电影画面知识库',
    description: '系统知识库：用于电影画面（cinematic）的构图、色调、氛围、镜头语言等专业知识',
    category: 'photograph',
    subType: 'cinematic',
  },
  {
    name: 'graph-photograph-commercial',
    display_name: '产品商业拍摄知识库',
    description: '系统知识库：用于产品商业拍摄（commercial）的构图、光线、产品展示等专业知识',
    category: 'photograph',
    subType: 'commercial',
  },
  {
    name: 'graph-photograph-documentary',
    display_name: '纪事摄影知识库',
    description: '系统知识库：用于纪事摄影（documentary）的真实记录、叙事构图等专业知识',
    category: 'photograph',
    subType: 'documentary',
  },
  // Design 类型
  {
    name: 'graph-design-3d',
    display_name: '3D设计知识库',
    description: '系统知识库：用于3D设计的建模、材质、光照、渲染等专业知识',
    category: 'design',
    subType: '3d',
  },
  {
    name: 'graph-design-manual',
    display_name: '使用手册知识库',
    description: '系统知识库：用于使用手册设计的排版、图标、说明文字等专业知识',
    category: 'design',
    subType: 'manual',
  },
  {
    name: 'graph-design-poster',
    display_name: '画报知识库',
    description: '系统知识库：用于画报设计的排版、色彩、视觉冲击力等专业知识',
    category: 'design',
    subType: 'poster',
  },
  {
    name: 'graph-design-icon',
    display_name: '图标知识库',
    description: '系统知识库：用于图标设计的简洁性、识别度、风格统一等专业知识',
    category: 'design',
    subType: 'icon',
  },
  // Painting 类型
  {
    name: 'graph-painting-illustration',
    display_name: '插图知识库',
    description: '系统知识库：用于插图（illustration）的风格、构图、色彩搭配等专业知识',
    category: 'painting',
    subType: 'illustration',
  },
  {
    name: 'graph-painting-comic',
    display_name: '漫画知识库',
    description: '系统知识库：用于漫画（comic）的分镜、线条、对话气泡等专业知识',
    category: 'painting',
    subType: 'comic',
  },
  {
    name: 'graph-painting-concept-art',
    display_name: '原画知识库',
    description: '系统知识库：用于原画（concept art）的概念设计、世界观构建等专业知识',
    category: 'painting',
    subType: 'concept-art',
  },
  {
    name: 'graph-painting-cartoon',
    display_name: '卡通知识库',
    description: '系统知识库：用于卡通（cartoon）的简化、夸张、趣味性等专业知识',
    category: 'painting',
    subType: 'cartoon',
  },
];

async function initSystemKnowledgeBases() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📚 初始化系统知识库');
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

    // 3. 初始化知识库服务
    const knowledgeService = new KnowledgeService();
    console.log('✅ KnowledgeService 已初始化');
    console.log('');

    // 4. 创建系统知识库
    let createdCount = 0;
    let skippedCount = 0;
    const kbRepo = RepositoryFactory.createKnowledgeBaseRepository();

    for (const kbConfig of SYSTEM_KNOWLEDGE_BASES) {
      try {
        // 检查知识库是否已存在
        const existing = await kbRepo.findKnowledgeBaseByName(kbConfig.name);
        if (existing) {
          // 检查是否需要更新 embedding 模型
          if (existing.embedding_model !== 'text-embedding-3-large') {
            console.log(`🔧 更新知识库 "${kbConfig.name}" 的 embedding 模型: ${existing.embedding_model} -> text-embedding-3-large`);
            try {
              await knowledgeService.updateKnowledgeBase({
                name: kbConfig.name,
                embedding_model: 'text-embedding-3-large',
                config: {
                  ...existing.config,
                  dimensions: 1536, // 降维到 1536 以兼容当前数据库 schema
                },
              });
              console.log(`✅ 已更新知识库 "${kbConfig.name}" 的 embedding 模型`);
            } catch (updateError: any) {
              console.error(`⚠️  更新知识库 "${kbConfig.name}" 的 embedding 模型失败: ${updateError.message}`);
            }
          } else {
            console.log(`⏭️  知识库 "${kbConfig.name}" 已存在且模型正确，跳过`);
          }
          skippedCount++;
          continue;
        }

        // 创建知识库
        // 使用 text-embedding-3-large 以获得更好的召回效果
        // 性能对比：
        // - text-embedding-3-small: MIRACL 44.0%, MTEB 62.3%, 1536维, $0.00002/1K tokens
        // - text-embedding-3-large: MIRACL 54.9%, MTEB 64.6%, 3072维, $0.00013/1K tokens
        // 
        // 注意：当前数据库 schema 支持 vector(1536)，text-embedding-3-large 默认是 3072 维
        // 方案1：使用 text-embedding-3-large 并降维到 1536（OpenAI 支持，性能损失很小）
        // 方案2：修改 schema 支持 3072 维（需要数据库迁移）
        // 当前使用方案1，后续可根据需要切换到方案2
        const knowledgeBase = await knowledgeService.createKnowledgeBase({
          name: kbConfig.name,
          display_name: kbConfig.display_name,
          description: kbConfig.description,
          type: 'hybrid', // 使用混合检索
          embedding_model: 'text-embedding-3-large', // 使用更好的模型以获得更好的召回效果
          is_builtin: true, // 标记为内置知识库
          is_public: false, // 私密知识库，仅系统使用
          owner_id: adminUser.id, // 设置为 admin 用户所有
          config: {
            category: kbConfig.category,
            subType: kbConfig.subType,
            system: true, // 标记为系统知识库
            dimensions: 1536, // 降维到 1536 以兼容当前数据库 schema (vector(1536))
            // 注意：text-embedding-3-large 默认是 3072 维，降维到 1536 性能损失很小
            // 如果后续数据库 schema 支持 3072 维，可以移除 dimensions 限制使用完整维度
          },
        });

        console.log(`✅ 创建知识库: ${kbConfig.name} (${kbConfig.display_name})`);
        createdCount++;
      } catch (error: any) {
        console.error(`❌ 创建知识库 "${kbConfig.name}" 失败:`, error.message);
        // 继续创建其他知识库，不中断流程
      }
    }

    console.log('');
    console.log(`📊 统计: 创建 ${createdCount} 个，跳过 ${skippedCount} 个`);
    console.log('');

    // 5. 创建文件夹结构（在项目根目录）
    const systemKnowledgeDir = join(PROJECT_ROOT, 'systemKnowledge');
    
    if (!existsSync(systemKnowledgeDir)) {
      mkdirSync(systemKnowledgeDir, { recursive: true });
      console.log(`✅ 创建目录: systemKnowledge/`);
    } else {
      console.log(`⏭️  目录已存在: systemKnowledge/`);
    }

    // 为每个知识库创建对应的子文件夹
    for (const kbConfig of SYSTEM_KNOWLEDGE_BASES) {
      const kbDir = join(systemKnowledgeDir, kbConfig.name);
      if (!existsSync(kbDir)) {
        mkdirSync(kbDir, { recursive: true });
        console.log(`✅ 创建目录: systemKnowledge/${kbConfig.name}/`);
      } else {
        console.log(`⏭️  目录已存在: systemKnowledge/${kbConfig.name}/`);
      }
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 系统知识库初始化完成！');
    console.log('');
    console.log('💡 下一步：');
    console.log('   1. 在 systemKnowledge/ 目录下找到对应的知识库文件夹');
    console.log('   2. 将知识库文档放入对应的文件夹中');
    console.log('   3. 使用知识库上传接口批量导入文档');
    console.log('');
  } catch (error: any) {
    console.error('');
    console.error('❌ 初始化失败:', error.message);
    console.error('');
    process.exit(1);
  }
}

initSystemKnowledgeBases();
