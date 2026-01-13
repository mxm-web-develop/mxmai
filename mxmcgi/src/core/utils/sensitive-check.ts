/**
 * 敏感词检查工具
 * 检查文本中是否包含敏感词
 */

/**
 * 检查文本中是否包含敏感词
 * @param text 要检查的文本
 * @param sensitives 敏感词数组
 * @returns 如果包含敏感词，返回 true；否则返回 false
 */
export function containsSensitiveWords(text: string, sensitives: string[]): boolean {
  if (!text || !sensitives || sensitives.length === 0) {
    return false;
  }

  const textLower = text.toLowerCase();
  
  for (const sensitive of sensitives) {
    if (!sensitive || sensitive.trim().length === 0) {
      continue;
    }
    
    // 检查是否包含敏感词（不区分大小写）
    if (textLower.includes(sensitive.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * 检查对象中所有字符串字段是否包含敏感词
 * @param obj 要检查的对象
 * @param sensitives 敏感词数组
 * @returns 如果包含敏感词，返回 true；否则返回 false
 */
export function checkObjectForSensitiveWords(obj: any, sensitives: string[]): boolean {
  if (!obj || !sensitives || sensitives.length === 0) {
    return false;
  }

  // 递归检查对象中的所有字符串值
  function checkValue(value: any): boolean {
    if (typeof value === 'string') {
      return containsSensitiveWords(value, sensitives);
    } else if (Array.isArray(value)) {
      return value.some(item => checkValue(item));
    } else if (value && typeof value === 'object') {
      return Object.values(value).some(val => checkValue(val));
    }
    return false;
  }

  return checkValue(obj);
}

