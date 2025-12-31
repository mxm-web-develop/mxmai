/**
 * HTTP 客户端
 * 通过 Gateway 调用 mxmcgi 服务，不直接引用
 */

/**
 * 调用文本生成接口（通过 Gateway）
 */
export async function callTextGeneration(
  modelName: string,
  prompt: string,
  parameters?: Record<string, any>,
  token?: string
): Promise<any> {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const url = `${gatewayUrl}/api/v1/cgi/text/${modelName}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 优先使用传入的 token，否则使用环境变量
  const apiKey = token || process.env.GATEWAY_API_KEY;
  if (apiKey) {
    const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = authHeader;
  }

  // 构建请求体，支持图片输入参数（某些文本模型也支持图片输入）
  const requestBody: Record<string, any> = {
    prompt,
    outputFormat: 'json',
  };
  
  // 提取图片相关参数到顶层（如果文本模型支持图片输入）
  const imageParams = ['image', 'images', 'image_input', 'image_urls', 'image_base64s'];
  const otherParams: Record<string, any> = {};
  
  if (parameters) {
    for (const [key, value] of Object.entries(parameters)) {
      if (imageParams.includes(key)) {
        // 图片参数放在顶层
        requestBody[key] = value;
      } else {
        // 其他参数放在parameters对象中
        otherParams[key] = value;
      }
    }
  }
  
  // 添加parameters对象（包含非图片参数）
  if (Object.keys(otherParams).length > 0) {
    requestBody.parameters = otherParams;
  } else if (parameters) {
    // 如果没有其他参数，但parameters不为空，也添加（向后兼容）
    requestBody.parameters = parameters;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `文本生成请求失败: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = await response.json();
  return data;
}

/**
 * 调用图片生成接口（通过 Gateway）
 */
export async function callImageGeneration(
  modelName: string,
  prompt: string,
  parameters?: Record<string, any>,
  token?: string
): Promise<any> {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const url = `${gatewayUrl}/api/v1/cgi/graph/${modelName}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 优先使用传入的 token，否则使用环境变量
  const apiKey = token || process.env.GATEWAY_API_KEY;
  if (apiKey) {
    const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = authHeader;
  }

  // 构建请求体，支持图片输入参数
  // mxmcgi的graph路由期望图片参数在顶层（如 image, image_input, image_urls, image_base64s）
  const requestBody: Record<string, any> = {
    prompt,
  };
  
  // 提取图片相关参数到顶层
  const imageParams = ['image', 'images', 'image_input', 'image_urls', 'image_base64s', 'input_image'];
  const otherParams: Record<string, any> = {};
  
  if (parameters) {
    for (const [key, value] of Object.entries(parameters)) {
      // 跳过 prompt，因为已经在顶层
      if (key === 'prompt') {
        continue;
      }
      
      if (imageParams.includes(key)) {
        // 图片参数放在顶层（避免重复）
        if (!requestBody[key]) {
          requestBody[key] = value;
          // 调试日志：记录图片参数
          console.log(`[callImageGeneration] 设置图片参数 ${key}:`, {
            type: Array.isArray(value) ? `数组(${value.length}项)` : typeof value,
            preview: Array.isArray(value) ? value.slice(0, 2) : (typeof value === 'string' && value.length > 100 ? value.substring(0, 100) + '...' : value)
          });
        } else {
          // 如果已经存在，使用数组合并（避免重复）
          console.warn(`[callImageGeneration] 图片参数 ${key} 重复，使用已存在的值`);
        }
      } else {
        // 其他参数放在parameters对象中
        otherParams[key] = value;
      }
    }
  }
  
  // 添加parameters对象（包含非图片参数）
  if (Object.keys(otherParams).length > 0) {
    requestBody.parameters = otherParams;
  }
  
  // 调试日志：记录最终请求体（隐藏敏感信息）
  console.log(`[callImageGeneration] 请求体预览:`, {
    prompt: requestBody.prompt?.substring(0, 100),
    imageParams: Object.keys(requestBody).filter(k => imageParams.includes(k)),
    hasParameters: !!requestBody.parameters,
    parametersKeys: requestBody.parameters ? Object.keys(requestBody.parameters) : []
  });

  try {
    // 创建超时控制器（30分钟，图片生成可能需要较长时间）
    const timeoutMs = 30 * 60 * 1000; // 30分钟
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `图片生成请求失败: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    // 处理网络错误，提供更清晰的错误信息
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        throw new Error(`图片生成请求超时: Gateway 服务响应超时，请检查网络连接或稍后重试`);
      }
      if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
        throw new Error(`图片生成请求失败: 无法连接到 Gateway 服务 (${gatewayUrl})，请检查服务是否正常运行`);
      }
      throw error;
    }
    throw new Error(`图片生成请求失败: ${String(error)}`);
  }
}

/**
 * 调用视频生成接口（通过 Gateway，待实现）
 */
export async function callVideoGeneration(
  modelName: string,
  prompt: string,
  parameters?: Record<string, any>,
  token?: string
): Promise<any> {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const url = `${gatewayUrl}/api/v1/cgi/video/${modelName}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 优先使用传入的 token，否则使用环境变量
  const apiKey = token || process.env.GATEWAY_API_KEY;
  if (apiKey) {
    const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = authHeader;
  }

  // 构建请求体，支持图片/视频输入参数
  const requestBody: Record<string, any> = {
    prompt,
  };
  
  // 提取图片/视频相关参数到顶层
  const mediaParams = ['image', 'image_input', 'image_urls', 'image_base64s', 'input_image', 'video', 'video_urls'];
  const otherParams: Record<string, any> = {};
  
  if (parameters) {
    for (const [key, value] of Object.entries(parameters)) {
      if (mediaParams.includes(key)) {
        // 媒体参数放在顶层
        requestBody[key] = value;
      } else {
        // 其他参数放在parameters对象中
        otherParams[key] = value;
      }
    }
  }
  
  // 添加parameters对象（包含非媒体参数）
  if (Object.keys(otherParams).length > 0) {
    requestBody.parameters = otherParams;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `视频生成请求失败: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = await response.json();
  return data;
}

/**
 * 调用音频生成接口（通过 Gateway，待实现）
 */
export async function callSoundGeneration(
  modelName: string,
  prompt: string,
  parameters?: Record<string, any>,
  token?: string
): Promise<any> {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const url = `${gatewayUrl}/api/v1/cgi/sound/${modelName}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 优先使用传入的 token，否则使用环境变量
  const apiKey = token || process.env.GATEWAY_API_KEY;
  if (apiKey) {
    const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = authHeader;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      parameters: parameters || {},
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `音频生成请求失败: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = await response.json();
  return data;
}

/**
 * 调用 Embedding 接口（通过 Gateway，待实现）
 */
export async function callEmbeddingGeneration(
  modelName: string,
  text: string,
  parameters?: Record<string, any>,
  token?: string
): Promise<any> {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const url = `${gatewayUrl}/api/v1/cgi/embedding/${modelName}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 优先使用传入的 token，否则使用环境变量
  const apiKey = token || process.env.GATEWAY_API_KEY;
  if (apiKey) {
    const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = authHeader;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      text,
      parameters: parameters || {},
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Embedding 生成请求失败: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = await response.json();
  return data;
}
