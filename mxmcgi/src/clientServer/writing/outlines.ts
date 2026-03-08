/**
 * 大纲（outlines）写作类型 - 客户端表单选项
 * 表单数据统一放在 clientServer，wtconfigs 仅保留 rules / outputformat / getParamsForType
 */
import type { FormOption, FormOptionsConfig } from '../shared/formOptions';

const outlinesFormOptionsZh: FormOptionsConfig = {
  maxDepth: [
    { value: '1', label: '一级标题', labelEn: 'Level 1' },
    { value: '2', label: '二级标题', labelEn: 'Level 2' },
    { value: '3', label: '三级标题', labelEn: 'Level 3' },
    { value: '4', label: '四级标题', labelEn: 'Level 4' },
  ],
  applyto: [
    { value: 'articles', label: '文章', labelEn: 'Articles' },
    { value: 'voice-scripts', label: '口播稿', labelEn: 'Voice Scripts' },
    { value: 'storyboard-scripts', label: '分镜脚本', labelEn: 'Storyboard Scripts' },
  ],
  outline_type: [
    { value: 'tech-article', label: '科技文章', labelEn: 'Tech Article' },
    { value: 'story-novel', label: '故事小说', labelEn: 'Story Novel' },
    { value: 'academic-paper', label: '学术论文', labelEn: 'Academic Paper' },
    { value: 'sales-voice', label: '带货口播', labelEn: 'Sales Voice' },
    { value: 'emotional-story-voice', label: '情感故事口播', labelEn: 'Emotional Story Voice' },
    { value: 'knowledge-sharing-voice', label: '知识分享口播', labelEn: 'Knowledge Sharing Voice' },
    { value: 'short-video-storyboard', label: '短视频分镜', labelEn: 'Short Video Storyboard' },
    { value: 'movie-storyboard', label: '电影分镜', labelEn: 'Movie Storyboard' },
    { value: 'animation-storyboard', label: '动画分镜', labelEn: 'Animation Storyboard' },
    { value: 'music-video-storyboard', label: '音乐视频分镜', labelEn: 'Music Video Storyboard' },
    { value: 'commercial-storyboard', label: '广告分镜', labelEn: 'Commercial Storyboard' },
    { value: 'documentary-storyboard', label: '纪录片分镜', labelEn: 'Documentary Storyboard' },
    { value: 'motion-graphics-storyboard', label: '概念动效分镜', labelEn: 'Motion Graphics Storyboard' },
    { value: 'educational-storyboard', label: '教育片分镜', labelEn: 'Educational Storyboard' },
    { value: 'game-cg-storyboard', label: '游戏CG分镜', labelEn: 'Game CG Storyboard' },
  ],
  outline_structure_type: [
    { value: 'three-act', label: '三段式', labelEn: 'Three-Act Structure' },
    { value: 'aida', label: 'AIDA', labelEn: 'AIDA' },
    { value: 'pas', label: 'PAS', labelEn: 'PAS' },
    { value: 'bab', label: 'BAB', labelEn: 'BAB' },
    { value: 'hero-journey', label: '英雄之旅', labelEn: "Hero's Journey" },
    { value: 'imrad', label: 'IMRaD', labelEn: 'IMRaD' },
    { value: 'hook-value-cta', label: '钩子-干货-CTA', labelEn: 'Hook-Value-CTA' },
    { value: 'act-scene-storyboard', label: '幕式分镜', labelEn: 'Act/Scene Storyboard' },
  ],
  stance: [
    { value: 'neutral', label: '中立客观', labelEn: 'Neutral' },
    { value: 'supportive', label: '支持赞同', labelEn: 'Supportive' },
    { value: 'critical', label: '批判质疑', labelEn: 'Critical' },
    { value: 'balanced', label: '平衡辩证', labelEn: 'Balanced' },
  ],
  tone: [
    { value: 'formal', label: '正式严谨', labelEn: 'Formal' },
    { value: 'casual', label: '轻松随意', labelEn: 'Casual' },
    { value: 'professional', label: '专业权威', labelEn: 'Professional' },
    { value: 'friendly', label: '友好亲切', labelEn: 'Friendly' },
    { value: 'energetic', label: '充满活力', labelEn: 'Energetic' },
    { value: 'calm', label: '平静温和', labelEn: 'Calm' },
  ],
  speech_rate: [
    { value: '150', label: '150 CPM（很慢）', labelEn: '150 CPM (Very slow)' },
    { value: '180', label: '180 CPM（偏慢）', labelEn: '180 CPM (Slow)' },
    { value: '210', label: '210 CPM（正常）', labelEn: '210 CPM (Normal)' },
    { value: '240', label: '240 CPM（偏快）', labelEn: '240 CPM (Fast)' },
    { value: '270', label: '270 CPM（很快）', labelEn: '270 CPM (Very fast)' },
  ],
  rhythm: [
    { value: '10', label: '慢（10 镜头/分钟）', labelEn: 'Slow (10 shots/min)' },
    { value: '18', label: '正常（18 镜头/分钟）', labelEn: 'Normal (18 shots/min)' },
    { value: '28', label: '快（28 镜头/分钟）', labelEn: 'Fast (28 shots/min)' },
  ],
  _metadata: {
    speech_rate: {
      type: 'select',
      label: '语速',
      labelEn: 'Speech Rate',
      helpText: '仅用于口播稿：可计算参数（字/分钟）。用于把总时长换算成总字数，并分配到每个节点。',
      helpTextEn: 'Voice-scripts only: numeric (chars/min). Used to convert total duration to total chars and allocate per node.',
    },
    rhythm: {
      type: 'select',
      label: '节奏',
      labelEn: 'Rhythm',
      helpText: '仅用于分镜脚本：可计算参数（镜头/分钟）。用于把总时长换算成镜头密度，并分配到每个节点。',
      helpTextEn: 'Storyboard-scripts only: numeric (shots/min). Used to derive shot density under total duration and allocate per node.',
    },
    expectedNodes: {
      type: 'number',
      label: '期望节点数',
      labelEn: 'Expected Nodes',
      placeholder: '例如：10',
      placeholderEn: 'e.g., 10',
      helpText: '大致控制大纲的篇幅（节点总数）',
      helpTextEn: 'Roughly control the outline length (total nodes)',
      min: 1,
      max: 100,
    },
    total_textcount: {
      type: 'number',
      label: '文字总量',
      labelEn: 'Total Text Count',
      placeholder: '例如：5000',
      placeholderEn: 'e.g., 5000',
      helpText: '文章的总字数，将根据 applyto 类型和节点重要性进行智能分布（重点章节分配更多字数）。仅用于文章类型。',
      helpTextEn: 'Total word count, will be intelligently distributed based on applyto type and node importance (key sections get more words). Only for articles type.',
      min: 100,
      max: 100000,
    },
    total_duration_seconds: {
      type: 'number',
      label: '总时长（秒）',
      labelEn: 'Total Duration (seconds)',
      placeholder: '可选，例如：300',
      placeholderEn: 'Optional, e.g., 300',
      helpText: '口播稿或分镜脚本的总时长（秒），可选。将根据类型和节点重要性进行智能分布。仅用于口播稿和分镜脚本类型；不填则可在写作分镜/口播时再补充。',
      helpTextEn: 'Total duration in seconds for voice scripts or storyboard scripts, optional. Distributed by type and node importance. Only for voice-scripts and storyboard-scripts; can be filled when writing instead.',
      min: 4,
      max: 7200,
    },
  },
};

const asOptions = (arr: FormOption[] | undefined) =>
  (arr || []).map((opt: FormOption) => ({ value: opt.value, label: opt.labelEn || opt.value }));

export function getOutlinesFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  if (language === 'en') {
    return {
      maxDepth: asOptions(outlinesFormOptionsZh.maxDepth as FormOption[]),
      applyto: asOptions(outlinesFormOptionsZh.applyto as FormOption[]),
      outline_type: asOptions(outlinesFormOptionsZh.outline_type as FormOption[]),
      outline_structure_type: asOptions(outlinesFormOptionsZh.outline_structure_type as FormOption[]),
      _metadata: {
        expectedNodes: {
          ...outlinesFormOptionsZh._metadata!.expectedNodes,
          label: outlinesFormOptionsZh._metadata!.expectedNodes.labelEn || 'Expected Nodes',
          placeholder: outlinesFormOptionsZh._metadata!.expectedNodes.placeholderEn,
          helpText: outlinesFormOptionsZh._metadata!.expectedNodes.helpTextEn,
        },
        total_textcount: {
          ...outlinesFormOptionsZh._metadata!.total_textcount,
          label: outlinesFormOptionsZh._metadata!.total_textcount.labelEn || 'Total Text Count',
          placeholder: outlinesFormOptionsZh._metadata!.total_textcount.placeholderEn,
          helpText: outlinesFormOptionsZh._metadata!.total_textcount.helpTextEn,
        },
        total_duration_seconds: {
          ...outlinesFormOptionsZh._metadata!.total_duration_seconds!,
          label: outlinesFormOptionsZh._metadata!.total_duration_seconds!.labelEn || 'Total Duration (seconds)',
          placeholder: outlinesFormOptionsZh._metadata!.total_duration_seconds!.placeholderEn,
          helpText: outlinesFormOptionsZh._metadata!.total_duration_seconds!.helpTextEn,
        },
      },
    };
  }
  return outlinesFormOptionsZh;
}
