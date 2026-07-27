/**
 * 从 LLM 文本输出中提取 JSON（支持 ```json 围栏或裸对象）
 */
export function extractJsonFromLlmText(text: string): unknown {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();

  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      // fall through
    }
  }

  try {
    return JSON.parse(t);
  } catch {
    // fall through
  }

  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  const arrStart = t.indexOf('[');
  const arrEnd = t.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) {
    try {
      return JSON.parse(t.slice(arrStart, arrEnd + 1));
    } catch {
      return null;
    }
  }

  return null;
}
