import { runGenerator, ProjectConfig } from './index.js';

/**
 * 快速测试运行
 */
async function main() {
  const projects: ProjectConfig[] = [
    {
      absolute_path: '/Users/mxm_pro/Desktop/codes/gientech/apps/AIChat',
      title: 'AI 对话助手',
      description: '智能对话系统',
      hasDoc: true,
    },
    {
      absolute_path: '/Users/mxm_pro/Desktop/codes/gientech/base/slate',
      title: '富文本编辑器',
      description: '基于 Slate 的强大富文本编辑器',
      hasDoc: true,
    },
    {
      absolute_path: '/Users/mxm_pro/Desktop/codes/gientech/apps/Nodegraph',
      title: '流程图编辑器',
      description: '基于 Nodegraph 的流程图编辑器',
      hasDoc: true,
    }
  ];

  console.log('🚀 启动文档生成器');
  console.log('项目:');
  projects.forEach(p => console.log(`  - ${p.title}: ${p.absolute_path}`));
  console.log('');

  await runGenerator(projects, 'dev', { port: 3000 });
}

main().catch(console.error);
