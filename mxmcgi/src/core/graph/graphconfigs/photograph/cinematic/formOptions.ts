/**
 * 电影画面表单选项配置
 */
import type { FormOption, FormOptionsConfig } from '../../../formOptions';

export const cinematicFormOptionsZh: FormOptionsConfig = {
  filmStyle: [
    { value: 'cyberpunk', label: '赛博朋克', labelEn: 'Cyberpunk' },
    { value: 'noir', label: '黑色电影', labelEn: 'Film Noir' },
    { value: 'sci-fi', label: '科幻', labelEn: 'Sci-Fi' },
    { value: 'drama', label: '文艺', labelEn: 'Drama' },
    { value: 'action', label: '动作', labelEn: 'Action' },
    { value: 'horror', label: '恐怖', labelEn: 'Horror' },
    { value: 'romance', label: '浪漫', labelEn: 'Romance' },
  ],
  mood: [
    { value: 'mysterious', label: '神秘', labelEn: 'Mysterious' },
    { value: 'tense', label: '紧张', labelEn: 'Tense' },
    { value: 'romantic', label: '浪漫', labelEn: 'Romantic' },
    { value: 'sad', label: '悲伤', labelEn: 'Sad' },
    { value: 'epic', label: '史诗', labelEn: 'Epic' },
    { value: 'dramatic', label: '戏剧性', labelEn: 'Dramatic' },
    { value: 'melancholic', label: '忧郁', labelEn: 'Melancholic' },
  ],
  cameraAngle: [
    { value: 'high-angle', label: '俯视', labelEn: 'High Angle' },
    { value: 'low-angle', label: '仰视', labelEn: 'Low Angle' },
    { value: 'dutch-angle', label: '倾斜', labelEn: 'Dutch Angle' },
    { value: 'eye-level', label: '平视', labelEn: 'Eye Level' },
    { value: 'bird-eye', label: '鸟瞰', labelEn: 'Bird Eye' },
    { value: 'worm-eye', label: '虫眼', labelEn: 'Worm Eye' },
  ],
};

export const cinematicFormOptionsEn: FormOptionsConfig = {
  filmStyle: cinematicFormOptionsZh.filmStyle.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
  mood: cinematicFormOptionsZh.mood.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
  cameraAngle: cinematicFormOptionsZh.cameraAngle.map(opt => ({
    value: opt.value,
    label: opt.labelEn || opt.value,
  })),
};

export function getCinematicFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  return language === 'en' ? cinematicFormOptionsEn : cinematicFormOptionsZh;
}
