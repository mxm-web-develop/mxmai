import type { ReactNode } from 'react';
import { pageCardTitle } from '../components/PageHint';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="form-group" style={{ overflow: 'hidden' }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {children}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <code
      style={{
        background: 'rgba(148, 163, 184, 0.18)',
        padding: '2px 6px',
        borderRadius: 4,
        fontSize: '0.9em',
        wordBreak: 'break-all',
        overflowWrap: 'break-word',
        maxWidth: '100%',
        display: 'inline-block',
      }}
    >
      {children}
    </code>
  );
}

export default function Prompts() {
  return (
    <section className="page-card prompts-page">
      <h2>
        {pageCardTitle('提示词工程索引', {
          title: '配置来源',
          description: (
            <>
              线上业务以 Admin「业务管理」中的 <Code>prompt_engineering_config</Code>（Task V2：
              <Code>GET /api/v2/tasks/form-config</Code>）为准。下列代码目录多为历史参考或 graph rules
              回退，改生产行为请优先在 Admin 中编辑对应 scope 的配置。
            </>
          ),
        })}
      </h2>

      <Section title="写作与大纲">
        <p>配置目录：<Code>mxmcgi/src/core/writing/wtconfigs/</Code></p>
        <ul style={{ margin: '0.5rem 0', paddingLeft: '1.2rem', overflowX: 'auto', maxWidth: '100%' }}>
          <li><Code>index.ts</Code> — 加载入口，buildPromptWithConfig、getWritingTypeConfig</li>
          <li><Code>articles.ts</Code> — 科技文章 / 故事小说 / 学术论文（rules、outputformat、getFormOptions）</li>
          <li><Code>storyboard-scripts.ts</Code> — 分镜脚本（rules、outputformat、多镜头说明）</li>
          <li><Code>voice-scripts.ts</Code> — 口播稿、TTS 格式</li>
          <li><Code>lyrics.ts</Code> — 歌词、Suno 格式</li>
          <li><Code>outlines.ts</Code> — 大纲生成规则与结构</li>
          <li><Code>media-post.ts</Code>、<Code>reviews.ts</Code>、<Code>resumes.ts</Code> — 其他类型</li>
        </ul>
      </Section>

      <Section title="图文生成">
        <p>配置目录：<Code>mxmcgi/src/core/graph/graphconfigs/</Code></p>
        <ul style={{ margin: '0.5rem 0', paddingLeft: '1.2rem', overflowX: 'auto', maxWidth: '100%' }}>
          <li><Code>getFormOptions.ts</Code> — 按 graphType + type 返回表单</li>
          <li><Code>photograph/</Code> — portrait、landscape、cinematic、commercial、documentary（rules、outputformat）</li>
          <li><Code>design/</Code> — 3d、manual、poster、icon、coverImage、ui-design</li>
          <li><Code>painting/</Code> — illustration、comic、conceptArt、cartoon</li>
        </ul>
      </Section>

      <Section title="视频">
        <p>视频生成无独立提示词文件，分镜内容由<strong>写作 - storyboard-scripts</strong> 生成；视频接口仅接收 chunks 与 reference_image_url。优化视频画面描述请改 <Code>wtconfigs/storyboard-scripts.ts</Code>。</p>
      </Section>

      <Section title="优化流程建议">
        <ol style={{ margin: '0.5rem 0', paddingLeft: '1.2rem' }}>
          <li>在「表单选项」页拉取 <Code>form-config</Code>，与 Admin 中 rules / outputFormat 对照。</li>
          <li>若仍依赖代码内 <Code>wtconfigs/*.ts</Code> 或 <Code>graphconfigs/**/*.ts</Code>，修改后需重启 mxmcgi；推荐将变更同步到 Admin 配置以免与仓库代码双源。</li>
          <li>用「任务」页轮询结果，用「媒体」页查看最终产出，迭代调整提示词。</li>
        </ol>
      </Section>

      <Section title="全功能说明文档">
        <p>完整 API 与模块说明见：<Code>docs/系统全功能说明.md</Code></p>
      </Section>
    </section>
  );
}
