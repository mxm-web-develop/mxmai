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
    // 预留：后续可以在这里追加系统知识库初始化脚本
    {
      name: 'init-system-knowledge-bases',
      command: 'pnpm --filter @mxmai/mxmcgi init:system-kb',
    },
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

