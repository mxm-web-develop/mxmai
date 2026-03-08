/**
 * 摄影-人像 表单选项（客户端）
 */
import type { FormOptionsConfig } from '../../shared/formOptions';

export const formOptionsZh: FormOptionsConfig = {
  style: [
    { value: 'modern', label: '现代', labelEn: 'Modern' },
    { value: 'vintage', label: '复古', labelEn: 'Vintage' },
    { value: 'fashion', label: '时尚', labelEn: 'Fashion' },
    { value: 'minimalist', label: '极简', labelEn: 'Minimalist' },
    { value: 'classic', label: '经典', labelEn: 'Classic' },
    { value: 'artistic', label: '艺术', labelEn: 'Artistic' },
    { value: 'editorial', label: '编辑', labelEn: 'Editorial' },
    { value: 'commercial', label: '商业', labelEn: 'Commercial' },
  ],
  tone: [
    { value: 'warm', label: '暖色调', labelEn: 'Warm' },
    { value: 'cool', label: '冷色调', labelEn: 'Cool' },
    { value: 'neutral', label: '中性', labelEn: 'Neutral' },
    { value: 'high-contrast', label: '高对比', labelEn: 'High Contrast' },
    { value: 'low-contrast', label: '低对比', labelEn: 'Low Contrast' },
    { value: 'vibrant', label: '鲜艳', labelEn: 'Vibrant' },
    { value: 'muted', label: '柔和', labelEn: 'Muted' },
    { value: 'monochrome', label: '单色', labelEn: 'Monochrome' },
  ],
  environment: [
    { value: 'indoor', label: '室内', labelEn: 'Indoor' },
    { value: 'outdoor', label: '室外', labelEn: 'Outdoor' },
    { value: 'studio', label: '影棚', labelEn: 'Studio' },
    { value: 'natural', label: '自然', labelEn: 'Natural' },
    { value: 'urban', label: '城市', labelEn: 'Urban' },
    { value: 'rural', label: '乡村', labelEn: 'Rural' },
    { value: 'beach', label: '海滩', labelEn: 'Beach' },
    { value: 'forest', label: '森林', labelEn: 'Forest' },
  ],
  makeup: [
    { value: 'natural', label: '自然', labelEn: 'Natural' },
    { value: 'light', label: '淡妆', labelEn: 'Light' },
    { value: 'heavy', label: '浓妆', labelEn: 'Heavy' },
    { value: 'no-makeup', label: '无妆', labelEn: 'No Makeup' },
    { value: 'editorial', label: '编辑妆', labelEn: 'Editorial' },
    { value: 'glamour', label: '魅力妆', labelEn: 'Glamour' },
    { value: 'artistic', label: '艺术妆', labelEn: 'Artistic' },
    { value: 'minimal', label: '极简妆', labelEn: 'Minimal' },
  ],
  pose: [
    { value: 'standing', label: '站立', labelEn: 'Standing' },
    { value: 'sitting', label: '坐姿', labelEn: 'Sitting' },
    { value: 'lying', label: '躺姿', labelEn: 'Lying' },
    { value: 'walking', label: '行走', labelEn: 'Walking' },
    { value: 'candid', label: '抓拍', labelEn: 'Candid' },
    { value: 'portrait', label: '肖像', labelEn: 'Portrait' },
    { value: 'full-body', label: '全身', labelEn: 'Full Body' },
    { value: 'close-up', label: '特写', labelEn: 'Close Up' },
    { value: 'three-quarter', label: '四分之三', labelEn: 'Three Quarter' },
    { value: 'profile', label: '侧面', labelEn: 'Profile' },
  ],
  lighting: [
    { value: 'natural', label: '自然光', labelEn: 'Natural' },
    { value: 'soft', label: '柔光', labelEn: 'Soft' },
    { value: 'hard', label: '硬光', labelEn: 'Hard' },
    { value: 'rim', label: '轮廓光', labelEn: 'Rim' },
    { value: 'backlight', label: '逆光', labelEn: 'Backlight' },
    { value: 'side', label: '侧光', labelEn: 'Side' },
    { value: 'studio', label: '影棚光', labelEn: 'Studio' },
    { value: 'golden-hour', label: '黄金时刻', labelEn: 'Golden Hour' },
    { value: 'blue-hour', label: '蓝色时刻', labelEn: 'Blue Hour' },
    { value: 'dramatic', label: '戏剧性', labelEn: 'Dramatic' },
  ],
};

export const formOptionsEn: FormOptionsConfig = {
  style: formOptionsZh.style.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value })),
  tone: formOptionsZh.tone.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value })),
  environment: formOptionsZh.environment.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value })),
  makeup: formOptionsZh.makeup.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value })),
  pose: formOptionsZh.pose.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value })),
  lighting: formOptionsZh.lighting.map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value })),
};

export function getFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  return language === 'en' ? formOptionsEn : formOptionsZh;
}
