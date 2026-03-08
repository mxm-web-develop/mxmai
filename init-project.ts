import { spawn } from 'node:child_process';

type Step = {
  name: string;
  command: string;
  cwd?: string;
};

function runStep(step: Step): Promise<void> {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = step.command.split(' ');
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      cwd: step.cwd || process.cwd(),
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Step "${step.name}" failed with code ${code}. Command: ${step.command}`,
          ),
        );
      }
    });
  });
}

async function main() {
  const steps: Step[] = [
    {
      name: 'init-database',
      // 初始化所有基础表结构（supabase-init.sql + 各业务模块 schema）
      command: 'pnpm --filter @mxmai/mxmdata init:db',
    },

    {
      name: 'create-admin-user',
      // 创建或升级一个管理员账号（role=admin），用于系统管理和内部知识库
      command: 'pnpm --filter @mxmai/mxmdata create:admin',
    },
    {
      name: 'migrate-kb-defaults',
      // 创建 knowledge_base_defaults 表，供 Admin 配置默认知识库
      command: 'pnpm --filter @mxmai/mxmdata migrate:kb-defaults',
    },
    // 系统知识库改为由 Admin 通过 API 管理（GET/PUT/DELETE /knowledge/admin/*）
    // 可选：首次部署可手动运行 pnpm --filter @mxmai/mxmcgi init:system-kb 创建种子知识库
  ];

  console.log('🚀 开始执行项目初始化脚本（project_init/init-project.ts）');

  for (const step of steps) {
    console.log(`\n▶︎ [${step.name}] 开始执行: ${step.command}`);
    await runStep(step);
    console.log(`✅ [${step.name}] 执行完成`);
  }

  console.log('\n🎉 项目初始化全部完成');
}

main().catch((err) => {
  console.error('\n❌ 项目初始化失败:', err.message);
  process.exit(1);
});

