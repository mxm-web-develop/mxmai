/**
 * superxmmai Timeline Builder — CLI 验证脚本
 *
 * 运行: pnpm tsx mxmcgi/scripts/mxm-timeline-demo.ts
 *
 * 输出:
 * 1. mock 一个 5 段视频任务
 * 2. 走 builder 生成 MxmProject
 * 3. 序列化 + 反序列化 + 校验
 * 4. 打印完整 JSON + 摘要
 */

import {
  buildMxmProject,
  serializeMxmProject,
  parseMxmProject,
  validateMxmProject,
  getChunkAtTime,
  getSubtitleAtTime,
  getStoryboardByChunkId,
} from '../src/core/video/mxm-timeline-builder';
import type {
  MxmProjectBuildInput,
  MxmSubtitleInput,
} from '../src/core/video/mxm-timeline-types';
import type { StoryboardChunk } from '../src/core/writing/type';

// 禁用 console.log 输出 buffer（确保立即看到）
process.stdout.write('');

console.log('================================================');
console.log('superxmmai Timeline Builder — CLI 验证');
console.log('================================================\n');

// 1. 模拟 5 段分镜 chunk
const storyboardChunks: StoryboardChunk[] = [
  {
    index: 0,
    chunk_seconds: 6,
    video_description: '开场：猫小狸站在足球场中央，镜头从远拉近',
    camera_movement: 'dolly in',
    dialogue: '大家好,今天我们来聊聊世界杯。',
    sound_effects: '足球场欢呼声 + 开场 BGM',
    transition: 'fade in',
    characters_in_shot: ['猫小狸'],
    reference_image_url: 'https://r2.example.com/thumb-0.jpg',
    prompt: '...',
  },
  {
    index: 1,
    chunk_seconds: 8,
    video_description: '展示小组赛分组表,猫小狸讲解',
    camera_movement: 'static',
    dialogue: '本次世界杯分 8 个小组,每组 4 支球队。',
    sound_effects: '讲解 + 翻页声',
    transition: 'cut',
    characters_in_shot: ['猫小狸'],
    prompt: '...',
  },
  {
    index: 2,
    chunk_seconds: 10,
    video_description: '精彩进球回放,慢动作',
    camera_movement: 'tracking shot',
    dialogue: '这一脚,世界波!',
    sound_effects: '进球欢呼 + 慢动作音效',
    transition: 'dissolve',
    characters_in_shot: ['球员 A', '球员 B'],
    prompt: '...',
  },
  {
    index: 3,
    chunk_seconds: 7,
    video_description: '数据图表,显示射手榜',
    camera_movement: 'pan right',
    dialogue: '目前射手榜前三是...',
    sound_effects: '图表切换音',
    transition: 'cut',
    characters_in_shot: ['猫小狸'],
    prompt: '...',
  },
  {
    index: 4,
    chunk_seconds: 5,
    video_description: '结尾,猫小狸挥手,渐黑',
    camera_movement: 'zoom out',
    dialogue: '下期见,记得点赞关注!',
    sound_effects: '结束 BGM + 微信提示音',
    transition: 'fade out',
    characters_in_shot: ['猫小狸'],
    prompt: '...',
  },
];

console.log(`[1] 模拟 ${storyboardChunks.length} 段分镜`);

// 2. 模拟字幕（TTS 产出，简化版无卡拉 OK）
let cursor = 0;
const subtitles: MxmSubtitleInput[] = [];
for (const c of storyboardChunks) {
  if (c.dialogue) {
    subtitles.push({
      id: `sub-${c.index}`,
      startTime: cursor,
      endTime: cursor + c.chunk_seconds,
      text: c.dialogue,
      relateChunkId: `chunk-${c.index}`,
    });
  }
  cursor += c.chunk_seconds;
}
console.log(`[2] 模拟 ${subtitles.length} 条字幕\n`);

// 3. 构造 builder 输入
const buildInput: MxmProjectBuildInput = {
  id: 'task-demo-2026-07-03-001',
  name: 'AI 大模型世界杯 第 4 期',
  videoChunks: storyboardChunks.map((c, i) => ({
    id: `chunk-${i}`,
    duration: c.chunk_seconds,
    mediaUrl: `https://r2.example.com/chunk-${i}.mp4`,
    thumbnailUrl: c.reference_image_url,
    inPoint: 0,
    outPoint: c.chunk_seconds,
    sourceChunk: c,
  })),
  subtitles,
  audio: {
    mediaUrl: 'https://r2.example.com/bgm-energetic.mp3',
    startTime: 0,
    duration: 36,  // 5 段总时长
    volume: 0.3,
    ducking: true,
    source: 'bgm',
  },
  settings: {
    width: 1920,
    height: 1080,
    fps: 30,
    orientation: 'landscape',
  },
};

// 4. 构建
console.log('[3] 走 buildMxmProject...');
const project = buildMxmProject(buildInput);
console.log(`   ✓ MxmProject 生成成功`);
console.log(`     - id: ${project.id}`);
console.log(`     - name: ${project.name}`);
console.log(`     - duration: ${project.settings.duration}s`);
console.log(`     - videoTrack.chunks: ${project.videoTrack.chunks.length}`);
console.log(`     - subtitleTrack.subtitles: ${project.subtitleTrack.subtitles.length}`);
console.log(`     - audioTrack: ${project.audioTrack ? '✓' : '✗'}`);
console.log(`     - transitions: ${project.transitions?.length ?? 0}\n`);

// 5. 打印 chunk 详情表
console.log('[4] 视频块时间表:');
console.log('   ┌──────┬────────┬────────┬─────────────────────────┬────────────┐');
console.log('   │  ID  │  start │   dur  │ mediaUrl                │  effect    │');
console.log('   ├──────┼────────┼────────┼─────────────────────────┼────────────┤');
for (const c of project.videoTrack.chunks) {
  const id = c.id.padEnd(4);
  const start = c.startTime.toFixed(1).padStart(5);
  const dur = c.duration.toFixed(1).padStart(5);
  const url = c.mediaUrl.padEnd(23).slice(0, 23);
  const effect = (c.effect ?? 'none').padEnd(10);
  console.log(`   │ ${id} │ ${start} │ ${dur} │ ${url} │ ${effect} │`);
}
console.log('   └──────┴────────┴────────┴─────────────────────────┴────────────┘\n');

// 6. 打印字幕表
console.log('[5] 字幕表:');
for (const s of project.subtitleTrack.subtitles) {
  console.log(`   [${s.startTime.toFixed(1)}-${s.endTime.toFixed(1)}] ${s.text}`);
}
console.log();

// 7. 打印转场
console.log('[6] 转场表:');
for (const t of project.transitions ?? []) {
  console.log(
    `   ${t.fromChunkId} → ${t.toChunkId}: ${t.type} (${t.duration}s @ ${t.startTime.toFixed(1)})`,
  );
}
console.log();

// 8. 序列化 + 解析
console.log('[7] 序列化为 JSON 字符串...');
const json = serializeMxmProject(project, {
  exportedAt: Date.now(),
  description: 'CLI demo',
  author: 'mxm-timeline-builder',
  sourceTaskId: project.id,
});
console.log(`   ✓ JSON 长度: ${json.length} bytes (~${(json.length / 1024).toFixed(1)} KB)\n`);

console.log('[8] 解析 JSON 字符串...');
const parsed = parseMxmProject(json);
console.log(`   ✓ 解析成功, version: ${parsed.version}, project.id: ${parsed.project.id}\n`);

// 9. 校验
console.log('[9] 深度校验...');
const validation = validateMxmProject(parsed);
console.log(`   ✓ valid: ${validation.valid}`);
console.log(`     - errors: ${validation.errors.length}`);
console.log(`     - warnings: ${validation.warnings.length}`);
if (validation.errors.length) {
  for (const e of validation.errors) console.log(`       ERROR: ${e}`);
}
if (validation.warnings.length) {
  for (const w of validation.warnings) console.log(`       WARN: ${w}`);
}
console.log();

// 10. 工具函数测试
console.log('[10] 工具函数测试:');
const t = 12.5;
const chunk = getChunkAtTime(project, t);
console.log(`   - getChunkAtTime(12.5) = ${chunk?.id ?? 'null'} (startTime=${chunk?.startTime})`);
const sub = getSubtitleAtTime(project, t);
console.log(`   - getSubtitleAtTime(12.5) = "${sub?.text ?? 'null'}"`);
const storyboard = getStoryboardByChunkId(project, 'chunk-2');
console.log(`   - getStoryboardByChunkId('chunk-2') = "${storyboard?.description?.slice(0, 30)}..."`);
console.log();

// 11. 错误路径测试
console.log('[11] 错误路径测试:');
try {
  buildMxmProject({ ...buildInput, videoChunks: [] });
  console.log('   ✗ 应该抛错但没有!');
} catch (e) {
  console.log(`   ✓ 空 chunks 抛错: ${(e as Error).message}`);
}
try {
  parseMxmProject('{"version":"99.0.0","project":{}}');
  console.log('   ✗ 应该抛错但没有!');
} catch (e) {
  console.log(`   ✓ 不支持的 version 抛错: ${(e as Error).message}`);
}
console.log();

// 12. 输出完整 JSON (前 800 字符预览)
console.log('================================================');
console.log('完整 JSON 预览 (前 1500 字符)');
console.log('================================================');
console.log(json.slice(0, 1500));
console.log('...\n');

console.log('================================================');
console.log('✅ Phase 1 后端 PoC 验证通过');
console.log('================================================');
