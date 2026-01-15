"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/index.ts
var import_express6 = __toESM(require("express"));
var import_dotenv = __toESM(require("dotenv"));
var import_path = require("path");

// src/routes/health.ts
var import_express = require("express");
var router = (0, import_express.Router)();
router.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "mxmagent" });
});
var health_default = router;

// src/routes/smartflow.ts
var import_express2 = require("express");

// src/core/smartflow/service.ts
var import_mxmdata2 = require("@mxmai/mxmdata");

// src/core/smartflow/executors/start-executor.ts
var StartExecutor = class {
  /**
   * 执行 start 节点
   */
  static async execute(node, context) {
    try {
      const inputParams = node.input || [];
      const processedInput = {};
      const inputByType = {};
      for (const inputItem of inputParams) {
        const name = inputItem.name || inputItem.type;
        if (inputItem.name) {
          processedInput[inputItem.name] = {
            content: inputItem.content,
            type: inputItem.type
          };
        }
        if (!inputByType[inputItem.type]) {
          inputByType[inputItem.type] = [];
        }
        inputByType[inputItem.type].push({
          name: inputItem.name,
          content: inputItem.content
        });
        if (!inputItem.name) {
          processedInput[inputItem.type] = inputItem.content;
        }
      }
      context.input = {
        ...context.input,
        ...processedInput
      };
      context.input_types = inputByType;
      if (node.trigger_words && node.trigger_words.length > 0) {
        const textInputs = inputByType.text || [];
        const allText = textInputs.map((item) => String(item.content || "")).join(" ");
        const matched = node.trigger_words.some(
          (word) => allText.includes(word)
        );
        if (!matched) {
          return {
            success: false,
            error: `\u7528\u6237\u8F93\u5165\u4E0D\u5339\u914D\u89E6\u53D1\u8BCD: ${node.trigger_words.join(", ")}`
          };
        }
      }
      const expectedOutputs = node.expected_outputs || [];
      const outputStructure = {};
      for (const expected of expectedOutputs) {
        outputStructure[expected.name] = null;
      }
      if (node.smartflow_name) {
        context.smartflow_name = node.smartflow_name;
      }
      context.expected_outputs = expectedOutputs;
      return {
        success: true,
        output: {
          input: processedInput,
          input_types: inputByType,
          expected_outputs: expectedOutputs,
          smartflow_name: node.smartflow_name,
          output_structure: outputStructure
        },
        metadata: {
          trigger_words: node.trigger_words,
          input_count: inputParams.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

// src/core/smartflow/executors/variable-resolver.ts
var VariableResolver = class {
  /**
   * 解析变量表达式
   */
  static resolve(expression2, context) {
    if (!expression2.includes("{{")) {
      return expression2;
    }
    const singleVariablePattern = /^\s*\{\{([^}]+)\}\}\s*$/;
    const singleMatch = expression2.match(singleVariablePattern);
    if (singleMatch) {
      const varPath = singleMatch[1].trim();
      return this.resolveVariable(varPath, context);
    }
    let resolved = expression2;
    const variablePattern = /\{\{([^}]+)\}\}/g;
    let match;
    while ((match = variablePattern.exec(expression2)) !== null) {
      const fullMatch = match[0];
      const varPath = match[1];
      const value = this.resolveVariable(varPath, context);
      resolved = resolved.replace(fullMatch, String(value ?? ""));
    }
    return resolved;
  }
  /**
   * 解析单个变量路径
   */
  static resolveVariable(varPath, context) {
    const parts = varPath.trim().split(".");
    if (parts.length === 0) {
      return void 0;
    }
    const [scope, ...path] = parts;
    let base;
    switch (scope) {
      case "input":
        base = context.input;
        break;
      default:
        const nodeOutput = context.nodeOutputs[scope];
        if (nodeOutput !== void 0) {
          base = nodeOutput;
        } else {
          base = context[scope];
        }
        break;
    }
    if (base === void 0) {
      return void 0;
    }
    if (path.length === 0) {
      if (scope === "input" && typeof base === "object" && base !== null && "content" in base) {
        return base.content;
      }
      return base;
    }
    let current = base;
    for (const key of path) {
      if (current === null || current === void 0) {
        return void 0;
      }
      if (typeof current === "object" && key in current) {
        current = current[key];
      } else if (typeof current === "string" && (key === "image_urls" || key === "mediaUrls")) {
        return current;
      } else {
        return void 0;
      }
    }
    if (scope === "input" && typeof current === "object" && current !== null && "content" in current) {
      return current.content;
    }
    return current;
  }
  /**
   * 检查表达式是否包含变量引用
   */
  static hasVariables(expression2) {
    return /\{\{([^}]+)\}\}/.test(expression2);
  }
  /**
   * 提取表达式中的所有变量引用
   */
  static extractVariables(expression2) {
    const variables = [];
    const variablePattern = /\{\{([^}]+)\}\}/g;
    let match;
    while ((match = variablePattern.exec(expression2)) !== null) {
      variables.push(match[1].trim());
    }
    return variables;
  }
};

// src/core/smartflow/model-registry.ts
var MODEL_REGISTRY = {
  // ========== Text 模型 ==========
  "gpt-5-nano": {
    name: "gpt-5-nano",
    displayName: "GPT-5 Nano",
    description: "\u5FEB\u901F\u6587\u672C\u751F\u6210\uFF08\u4F7F\u7528 GPT-4o-mini \u4F5C\u4E3A\u5360\u4F4D\uFF09",
    modelType: "text",
    supportedProviders: ["deer"],
    defaultParams: {
      temperature: 0.7,
      max_tokens: 1e3
    }
  },
  "deepseek-r1": {
    name: "deepseek-r1",
    displayName: "DeepSeek R1",
    description: "\u5927\u8BED\u8A00\u6A21\u578B\uFF0C\u652F\u6301\u63A8\u7406",
    modelType: "text",
    supportedProviders: ["deer"],
    defaultParams: {
      temperature: 0.7,
      max_tokens: 2e3
    }
  },
  "gemini-2.5-flash": {
    name: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    description: "\u5FEB\u901F\u591A\u6A21\u6001\u6A21\u578B",
    modelType: "text",
    supportedProviders: ["deer"],
    defaultParams: {
      temperature: 0.8,
      max_tokens: 1e3
    }
  },
  "claude-4.5-sonnet": {
    name: "claude-4.5-sonnet",
    displayName: "Claude 4.5 Sonnet",
    description: "\u5BF9\u8BDD\u6A21\u578B",
    modelType: "text",
    supportedProviders: ["deer"],
    defaultParams: {
      temperature: 0.7,
      max_tokens: 2e3
    }
  },
  "gemini-3-pro": {
    name: "gemini-3-pro",
    displayName: "Gemini 3 Pro",
    description: "\u9AD8\u6027\u80FD\u591A\u6A21\u6001\u6A21\u578B",
    modelType: "text",
    supportedProviders: ["deer"],
    defaultParams: {
      temperature: 0.7,
      max_tokens: 2e3
    }
  },
  // ========== Image 模型 ==========
  "nano-banana": {
    name: "nano-banana",
    displayName: "Nano Banana",
    description: "\u652F\u6301\u56FE\u7247\u751F\u6210\u548C\u7F16\u8F91\uFF0C\u591A\u56FE\u7406\u89E3",
    modelType: "image",
    supportedProviders: ["replicate", "ppio"],
    defaultParams: {
      aspect_ratio: "1:1",
      image_size: "1K"
    }
  },
  "flux-kontext-fast": {
    name: "flux-kontext-fast",
    displayName: "Flux Kontext Fast",
    description: "\u5FEB\u901F\u56FE\u7247\u7F16\u8F91",
    modelType: "image",
    supportedProviders: ["replicate"],
    defaultParams: {
      aspect_ratio: "1:1"
    }
  },
  "flux-fast": {
    name: "flux-fast",
    displayName: "Flux Fast",
    description: "\u5FEB\u901F\u56FE\u7247\u751F\u6210",
    modelType: "image",
    supportedProviders: ["replicate"],
    defaultParams: {
      aspect_ratio: "1:1"
    }
  },
  "ideogram-v2a": {
    name: "ideogram-v2a",
    displayName: "Ideogram V2A",
    description: "\u64C5\u957F\u751F\u6210\u5305\u542B\u6587\u5B57\u7684\u56FE\u7247",
    modelType: "image",
    supportedProviders: ["replicate"],
    defaultParams: {
      aspect_ratio: "1:1"
    }
  },
  "recraft-crisp-upscale": {
    name: "recraft-crisp-upscale",
    displayName: "Recraft Crisp Upscale",
    description: "\u9AD8\u8D28\u91CF\u56FE\u7247\u653E\u5927",
    modelType: "image",
    supportedProviders: ["replicate"],
    defaultParams: {}
  },
  "seedream-4": {
    name: "seedream-4",
    displayName: "Seedream 4",
    description: "\u7EDF\u4E00\u7684\u6587\u672C\u751F\u6210\u56FE\u7247\u548C\u56FE\u7247\u7F16\u8F91\u6A21\u578B\uFF0C\u652F\u6301\u9AD8\u5206\u8FA8\u7387\uFF08\u6700\u9AD8 4K\uFF09\u3001\u591A\u53C2\u8003\u56FE\u7247\u3001\u6279\u91CF\u751F\u6210",
    modelType: "image",
    supportedProviders: ["replicate"],
    defaultParams: {
      size: "2K",
      aspect_ratio: "match_input_image"
    }
  }
  // ========== Video 模型 ==========
  // 待 mxmcgi 支持后添加
  // ========== Sound 模型 ==========
  // 待 mxmcgi 支持后添加
  // ========== Embedding 模型 ==========
  // 待 mxmcgi 支持后添加
};
function getModelsByType(modelType) {
  return Object.values(MODEL_REGISTRY).filter((model) => model.modelType === modelType);
}
function getModelInfo(modelName) {
  return MODEL_REGISTRY[modelName];
}
function validateModel(modelName, modelType) {
  const model = MODEL_REGISTRY[modelName];
  if (!model) {
    return false;
  }
  if (modelType && model.modelType !== modelType) {
    return false;
  }
  return true;
}

// src/core/smartflow/http-client.ts
async function callTextGeneration(modelName, prompt, parameters, token) {
  const gatewayUrl = process.env.GATEWAY_URL || "http://localhost:3000";
  const url = `${gatewayUrl}/api/v1/cgi/text/${modelName}`;
  const headers = {
    "Content-Type": "application/json"
  };
  const apiKey = token || process.env.GATEWAY_API_KEY;
  if (apiKey) {
    const authHeader = apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`;
    headers["Authorization"] = authHeader;
  }
  const requestBody = {
    prompt,
    outputFormat: "json"
  };
  const imageParams = ["image", "images", "image_input", "image_urls", "image_base64s"];
  const otherParams = {};
  if (parameters) {
    for (const [key, value] of Object.entries(parameters)) {
      if (imageParams.includes(key)) {
        requestBody[key] = value;
      } else {
        otherParams[key] = value;
      }
    }
  }
  if (Object.keys(otherParams).length > 0) {
    requestBody.parameters = otherParams;
  } else if (parameters) {
    requestBody.parameters = parameters;
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `\u6587\u672C\u751F\u6210\u8BF7\u6C42\u5931\u8D25: ${response.status} ${response.statusText} - ${errorText}`
    );
  }
  const data = await response.json();
  return data;
}
async function callImageGeneration(modelName, prompt, parameters, token) {
  const gatewayUrl = process.env.GATEWAY_URL || "http://localhost:3000";
  const url = `${gatewayUrl}/api/v1/cgi/graph/${modelName}`;
  const headers = {
    "Content-Type": "application/json"
  };
  const apiKey = token || process.env.GATEWAY_API_KEY;
  if (apiKey) {
    const authHeader = apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`;
    headers["Authorization"] = authHeader;
  }
  const requestBody = {
    prompt
  };
  const imageParams = ["image", "images", "image_input", "image_urls", "image_base64s", "input_image"];
  const otherParams = {};
  if (parameters) {
    for (const [key, value] of Object.entries(parameters)) {
      if (key === "prompt") {
        continue;
      }
      if (imageParams.includes(key)) {
        if (!requestBody[key]) {
          requestBody[key] = value;
          console.log(`[callImageGeneration] \u8BBE\u7F6E\u56FE\u7247\u53C2\u6570 ${key}:`, {
            type: Array.isArray(value) ? `\u6570\u7EC4(${value.length}\u9879)` : typeof value,
            preview: Array.isArray(value) ? value.slice(0, 2) : typeof value === "string" && value.length > 100 ? value.substring(0, 100) + "..." : value
          });
        } else {
          console.warn(`[callImageGeneration] \u56FE\u7247\u53C2\u6570 ${key} \u91CD\u590D\uFF0C\u4F7F\u7528\u5DF2\u5B58\u5728\u7684\u503C`);
        }
      } else {
        otherParams[key] = value;
      }
    }
  }
  if (Object.keys(otherParams).length > 0) {
    requestBody.parameters = otherParams;
  }
  console.log(`[callImageGeneration] \u8BF7\u6C42\u4F53\u9884\u89C8:`, {
    prompt: requestBody.prompt?.substring(0, 100),
    imageParams: Object.keys(requestBody).filter((k) => imageParams.includes(k)),
    hasParameters: !!requestBody.parameters,
    parametersKeys: requestBody.parameters ? Object.keys(requestBody.parameters) : []
  });
  try {
    const timeoutMs = 30 * 60 * 1e3;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `\u56FE\u7247\u751F\u6210\u8BF7\u6C42\u5931\u8D25: ${response.status} ${response.statusText} - ${errorText}`
      );
    }
    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError" || error.message.includes("timeout")) {
        throw new Error(`\u56FE\u7247\u751F\u6210\u8BF7\u6C42\u8D85\u65F6: Gateway \u670D\u52A1\u54CD\u5E94\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5\u6216\u7A0D\u540E\u91CD\u8BD5`);
      }
      if (error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED")) {
        throw new Error(`\u56FE\u7247\u751F\u6210\u8BF7\u6C42\u5931\u8D25: \u65E0\u6CD5\u8FDE\u63A5\u5230 Gateway \u670D\u52A1 (${gatewayUrl})\uFF0C\u8BF7\u68C0\u67E5\u670D\u52A1\u662F\u5426\u6B63\u5E38\u8FD0\u884C`);
      }
      throw error;
    }
    throw new Error(`\u56FE\u7247\u751F\u6210\u8BF7\u6C42\u5931\u8D25: ${String(error)}`);
  }
}
async function callVideoGeneration(modelName, prompt, parameters, token) {
  const gatewayUrl = process.env.GATEWAY_URL || "http://localhost:3000";
  const url = `${gatewayUrl}/api/v1/cgi/video/${modelName}`;
  const headers = {
    "Content-Type": "application/json"
  };
  const apiKey = token || process.env.GATEWAY_API_KEY;
  if (apiKey) {
    const authHeader = apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`;
    headers["Authorization"] = authHeader;
  }
  const requestBody = {
    prompt
  };
  const mediaParams = ["image", "image_input", "image_urls", "image_base64s", "input_image", "video", "video_urls"];
  const otherParams = {};
  if (parameters) {
    for (const [key, value] of Object.entries(parameters)) {
      if (mediaParams.includes(key)) {
        requestBody[key] = value;
      } else {
        otherParams[key] = value;
      }
    }
  }
  if (Object.keys(otherParams).length > 0) {
    requestBody.parameters = otherParams;
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `\u89C6\u9891\u751F\u6210\u8BF7\u6C42\u5931\u8D25: ${response.status} ${response.statusText} - ${errorText}`
    );
  }
  const data = await response.json();
  return data;
}
async function callSoundGeneration(modelName, prompt, parameters, token) {
  const gatewayUrl = process.env.GATEWAY_URL || "http://localhost:3000";
  const url = `${gatewayUrl}/api/v1/cgi/sound/${modelName}`;
  const headers = {
    "Content-Type": "application/json"
  };
  const apiKey = token || process.env.GATEWAY_API_KEY;
  if (apiKey) {
    const authHeader = apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`;
    headers["Authorization"] = authHeader;
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt,
      parameters: parameters || {}
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `\u97F3\u9891\u751F\u6210\u8BF7\u6C42\u5931\u8D25: ${response.status} ${response.statusText} - ${errorText}`
    );
  }
  const data = await response.json();
  return data;
}
async function callEmbeddingGeneration(modelName, text, parameters, token) {
  const gatewayUrl = process.env.GATEWAY_URL || "http://localhost:3000";
  const url = `${gatewayUrl}/api/v1/cgi/embedding/${modelName}`;
  const headers = {
    "Content-Type": "application/json"
  };
  const apiKey = token || process.env.GATEWAY_API_KEY;
  if (apiKey) {
    const authHeader = apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`;
    headers["Authorization"] = authHeader;
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text,
      parameters: parameters || {}
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Embedding \u751F\u6210\u8BF7\u6C42\u5931\u8D25: ${response.status} ${response.statusText} - ${errorText}`
    );
  }
  const data = await response.json();
  return data;
}

// src/core/smartflow/executors/model-executor.ts
var ModelExecutor = class {
  /**
   * 执行 model 节点
   */
  static async execute(node, context) {
    try {
      if (!node.model_type) {
        return {
          success: false,
          error: "Model \u8282\u70B9\u7F3A\u5C11\u5FC5\u9700\u5B57\u6BB5: model_type"
        };
      }
      if (!node.model) {
        return {
          success: false,
          error: "Model \u8282\u70B9\u7F3A\u5C11\u5FC5\u9700\u5B57\u6BB5: model"
        };
      }
      if (!node.prompt) {
        return {
          success: false,
          error: "Model \u8282\u70B9\u7F3A\u5C11\u5FC5\u9700\u5B57\u6BB5: prompt"
        };
      }
      if (!validateModel(node.model, node.model_type)) {
        return {
          success: false,
          error: `\u6A21\u578B "${node.model}" \u4E0D\u5B58\u5728\u6216\u4E0D\u652F\u6301\u7C7B\u578B "${node.model_type}"`
        };
      }
      const modelInfo = getModelInfo(node.model);
      if (!modelInfo) {
        return {
          success: false,
          error: `\u65E0\u6CD5\u83B7\u53D6\u6A21\u578B\u4FE1\u606F: ${node.model}`
        };
      }
      const resolvedPrompt = VariableResolver.resolve(node.prompt, context);
      const params = {
        ...modelInfo.defaultParams,
        ...node.params,
        prompt: resolvedPrompt
      };
      if (node.model_type === "image" || node.model_type === "video" || node.model_type === "text") {
        const imageInputParams = ["image", "images", "image_input", "image_urls", "image_base64s", "input_image"];
        let hasExplicitImageParam = false;
        for (const paramKey of imageInputParams) {
          if (params[paramKey] && typeof params[paramKey] === "string" && params[paramKey].includes("{{")) {
            delete params[paramKey];
          }
          if (node.params && node.params[paramKey]) {
            const paramValue = node.params[paramKey];
            if (typeof paramValue === "string" && paramValue.includes("{{")) {
              const resolvedValue = VariableResolver.resolve(paramValue, context);
              if (resolvedValue !== void 0 && resolvedValue !== null && !(Array.isArray(resolvedValue) && resolvedValue.length === 0)) {
                params[paramKey] = resolvedValue;
                hasExplicitImageParam = true;
                console.log(`[ModelExecutor] \u89E3\u6790\u56FE\u7247\u53C2\u6570 ${paramKey}:`, {
                  original: paramValue,
                  resolved: Array.isArray(resolvedValue) ? `\u6570\u7EC4(${resolvedValue.length}\u9879)` : typeof resolvedValue,
                  value: Array.isArray(resolvedValue) ? resolvedValue.slice(0, 2) : typeof resolvedValue === "string" && resolvedValue.length > 100 ? resolvedValue.substring(0, 100) + "..." : resolvedValue
                });
              } else {
                console.warn(`[ModelExecutor] \u56FE\u7247\u53C2\u6570 ${paramKey} \u89E3\u6790\u540E\u65E0\u6548:`, {
                  original: paramValue,
                  resolved: resolvedValue,
                  type: typeof resolvedValue,
                  isArray: Array.isArray(resolvedValue),
                  length: Array.isArray(resolvedValue) ? resolvedValue.length : "N/A"
                });
                delete params[paramKey];
              }
            } else {
              if (paramValue !== void 0 && paramValue !== null && !(Array.isArray(paramValue) && paramValue.length === 0)) {
                params[paramKey] = paramValue;
                hasExplicitImageParam = true;
              } else {
                delete params[paramKey];
              }
            }
          }
        }
        const promptText = node.prompt || "";
        const hasImageReference = promptText.includes("{{input.") && (promptText.includes("image") || promptText.includes("reference_images") || promptText.includes("reference_image"));
        const shouldAutoExtractImages = node.model_type === "image" || node.model_type === "video" || node.model_type === "text" && hasImageReference;
        if (shouldAutoExtractImages && !hasExplicitImageParam && !params.image && !params.images && !params.image_input && !params.image_urls && !params.image_base64s && !params.input_image) {
          const imageInputs = context.input_types?.image || [];
          const fileInputs = context.input_types?.file || [];
          const availableImages = imageInputs.length > 0 ? imageInputs : fileInputs;
          if (availableImages.length > 0) {
            const extractImageContent = (item) => {
              if (typeof item === "string") {
                return item;
              }
              if (typeof item === "object" && item !== null && "content" in item) {
                return item.content;
              }
              return item;
            };
            if (node.model === "seedream-4") {
              const imageContents = [];
              for (const item of availableImages) {
                const content = extractImageContent(item);
                if (Array.isArray(content)) {
                  imageContents.push(...content);
                } else {
                  imageContents.push(content);
                }
              }
              params.image_input = imageContents;
            } else if (node.model === "nano-banana" || node.model === "flux-kontext-fast") {
              const imageContents = [];
              for (const item of availableImages) {
                const content = extractImageContent(item);
                if (Array.isArray(content)) {
                  imageContents.push(...content);
                } else {
                  imageContents.push(content);
                }
              }
              if (imageContents.length === 1) {
                const imageContent = imageContents[0];
                const isBase64 = typeof imageContent === "string" && (imageContent.startsWith("data:image") || imageContent.startsWith("data:") || imageContent.length > 500 && !imageContent.startsWith("http://") && !imageContent.startsWith("https://"));
                if (isBase64) {
                  params.image_base64s = [imageContent];
                } else {
                  params.image = imageContent;
                }
              } else {
                const firstImage = imageContents[0];
                const isBase64 = typeof firstImage === "string" && (firstImage.startsWith("data:image") || firstImage.startsWith("data:") || firstImage.length > 500 && !firstImage.startsWith("http://") && !firstImage.startsWith("https://"));
                if (isBase64) {
                  params.image_base64s = imageContents;
                } else {
                  params.image_urls = imageContents;
                }
              }
            } else if (node.model_type === "text") {
              const imageContents = [];
              for (const item of availableImages) {
                const content = extractImageContent(item);
                if (Array.isArray(content)) {
                  imageContents.push(...content);
                } else {
                  imageContents.push(content);
                }
              }
              if (node.model === "gemini-3-pro" || node.model === "gemini-2.5-flash") {
                params.images = imageContents;
              } else {
                params.image_input = imageContents;
              }
            } else {
              const imageContents = [];
              for (const item of availableImages) {
                const content = extractImageContent(item);
                if (Array.isArray(content)) {
                  imageContents.push(...content);
                } else {
                  imageContents.push(content);
                }
              }
              params.image_input = imageContents;
            }
          }
        }
      }
      const userToken = context.token;
      if (node.model_type === "image" || node.model_type === "video") {
        const imageParams = ["image", "images", "image_input", "image_urls", "image_base64s", "input_image"];
        const imageParamsInParams = Object.keys(params).filter((k) => imageParams.includes(k));
        console.log(`[ModelExecutor] \u51C6\u5907\u8C03\u7528\u56FE\u7247\u751F\u6210API (${node.model}):`, {
          hasImageParams: imageParamsInParams.length > 0,
          imageParams: imageParamsInParams,
          image_urls: params.image_urls ? Array.isArray(params.image_urls) ? `\u6570\u7EC4(${params.image_urls.length}\u9879)` : typeof params.image_urls : "undefined",
          image_urls_preview: params.image_urls ? Array.isArray(params.image_urls) ? params.image_urls.slice(0, 2) : [params.image_urls] : []
        });
      }
      let result;
      switch (node.model_type) {
        case "text":
          result = await callTextGeneration(
            node.model,
            resolvedPrompt,
            params,
            userToken
          );
          break;
        case "image":
          result = await callImageGeneration(
            node.model,
            resolvedPrompt,
            params,
            userToken
          );
          break;
        case "video":
          result = await callVideoGeneration(
            node.model,
            resolvedPrompt,
            params,
            userToken
          );
          break;
        case "sound":
          result = await callSoundGeneration(
            node.model,
            resolvedPrompt,
            params,
            userToken
          );
          break;
        case "embedding":
          result = await callEmbeddingGeneration(
            node.model,
            resolvedPrompt,
            params,
            userToken
          );
          break;
        default:
          return {
            success: false,
            error: `\u4E0D\u652F\u6301\u7684\u6A21\u578B\u7C7B\u578B: ${node.model_type}`
          };
      }
      const formattedOutput = this.formatOutput(node.model_type, result);
      if (node.model_type === "image") {
        if (typeof formattedOutput === "string") {
          if (!formattedOutput || formattedOutput.trim().length === 0) {
            return {
              success: false,
              error: "\u56FE\u7247\u751F\u6210\u5931\u8D25\uFF1A\u672A\u751F\u6210\u4EFB\u4F55\u56FE\u7247\u3002\u53EF\u80FD\u662F\u6A21\u578B\u8FD4\u56DE\u4E86\u7A7A\u7ED3\u679C\uFF0C\u6216\u8005\u751F\u6210\u8FC7\u7A0B\u4E2D\u51FA\u73B0\u4E86\u95EE\u9898\u3002"
            };
          }
        } else if (formattedOutput && typeof formattedOutput === "object") {
          const imageUrls = formattedOutput.image_urls || formattedOutput.mediaUrls || [];
          if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
            return {
              success: false,
              error: "\u56FE\u7247\u751F\u6210\u5931\u8D25\uFF1A\u672A\u751F\u6210\u4EFB\u4F55\u56FE\u7247\u3002\u53EF\u80FD\u662F\u6A21\u578B\u8FD4\u56DE\u4E86\u7A7A\u7ED3\u679C\uFF0C\u6216\u8005\u751F\u6210\u8FC7\u7A0B\u4E2D\u51FA\u73B0\u4E86\u95EE\u9898\u3002"
            };
          }
        } else {
          return {
            success: false,
            error: "\u56FE\u7247\u751F\u6210\u5931\u8D25\uFF1A\u672A\u751F\u6210\u4EFB\u4F55\u56FE\u7247\u3002\u53EF\u80FD\u662F\u6A21\u578B\u8FD4\u56DE\u4E86\u7A7A\u7ED3\u679C\uFF0C\u6216\u8005\u751F\u6210\u8FC7\u7A0B\u4E2D\u51FA\u73B0\u4E86\u95EE\u9898\u3002"
          };
        }
      }
      return {
        success: true,
        output: formattedOutput,
        metadata: {
          model: node.model,
          model_type: node.model_type,
          tokens: result.result?.tokens || result.tokens || 0
        }
      };
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : String(error);
      const isImageOrVideo = node.model_type === "image" || node.model_type === "video";
      const isTimeoutOrQueueError = errorMessage.includes("timeout") || errorMessage.includes("Timeout") || errorMessage.includes("\u8D85\u65F6") || errorMessage.includes("queued") || errorMessage.includes("processing") || errorMessage.includes("\u6392\u961F") || errorMessage.includes("\u5904\u7406\u4E2D");
      const isNetworkError = errorMessage.includes("fetch failed") || errorMessage.includes("ECONNREFUSED") || errorMessage.includes("\u7F51\u7EDC") || errorMessage.includes("\u8FDE\u63A5") || errorMessage.includes("AbortError");
      if (isImageOrVideo && (isTimeoutOrQueueError || isNetworkError)) {
        return {
          success: false,
          error: `\u4EFB\u52A1\u6B63\u5728\u5904\u7406\u4E2D\uFF0C\u53EF\u80FD\u9700\u8981\u8F83\u957F\u65F6\u95F4\u3002\u9519\u8BEF\u4FE1\u606F\uFF1A${errorMessage}\u3002\u5982\u679C\u4EFB\u52A1\u5DF2\u63D0\u4EA4\u5230replicate\u961F\u5217\uFF0C\u8BF7\u7A0D\u540E\u67E5\u8BE2\u72B6\u6001\u3002`,
          isProcessing: true
          // 标记为处理中，不是真正的失败
        };
      }
      if (errorMessage.includes("flagged as sensitive") || errorMessage.includes("sensitive content") || errorMessage.includes("E005")) {
        errorMessage = "\u751F\u6210\u5185\u5BB9\u88AB\u6807\u8BB0\u4E3A\u654F\u611F\u5185\u5BB9\uFF0C\u8BF7\u5C1D\u8BD5\u4FEE\u6539\u8F93\u5165\u5185\u5BB9\u540E\u91CD\u8BD5\u3002\u5982\u679C\u95EE\u9898\u6301\u7EED\uFF0C\u8BF7\u8054\u7CFB\u652F\u6301\u56E2\u961F\u3002";
      }
      return {
        success: false,
        error: errorMessage,
        isProcessing: false
        // 真正的失败
      };
    }
  }
  /**
   * 格式化输出（根据模型类型）
   */
  static formatOutput(modelType, result) {
    const actualResult = result.data?.result || result.result || result;
    switch (modelType) {
      case "text":
        return {
          text: actualResult.text || "",
          response: actualResult.text || ""
        };
      case "image":
        if (typeof actualResult === "string") {
          return actualResult;
        } else if (Array.isArray(actualResult)) {
          return {
            image_urls: actualResult,
            mediaUrls: actualResult
          };
        } else if (actualResult && typeof actualResult === "object") {
          const imageUrls = actualResult.image_urls || actualResult.mediaUrls || [];
          return {
            image_urls: imageUrls,
            mediaUrls: imageUrls
          };
        } else {
          return {
            image_urls: [],
            mediaUrls: []
          };
        }
      case "video":
        return {
          video_urls: actualResult.video_urls || actualResult.mediaUrls || []
        };
      case "sound":
        return {
          audio_urls: actualResult.audio_urls || actualResult.mediaUrls || []
        };
      case "embedding":
        return {
          embedding: actualResult.embedding || []
        };
      default:
        return actualResult;
    }
  }
};

// src/core/smartflow/executors/builtin-tools.ts
var webSearchTool = async (params, context) => {
  try {
    const { query, max_results = 5 } = params;
    if (!query) {
      return {
        success: false,
        error: "Web Search \u5DE5\u5177\u7F3A\u5C11\u5FC5\u9700\u53C2\u6570: query"
      };
    }
    return {
      success: true,
      data: {
        results: [
          {
            title: `\u641C\u7D22\u7ED3\u679C: ${query}`,
            url: "https://example.com",
            snippet: "\u8FD9\u662F\u4E00\u4E2A\u6A21\u62DF\u641C\u7D22\u7ED3\u679C"
          }
        ]
      },
      metadata: {
        query,
        result_count: 1
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};
var webScraperTool = async (params, context) => {
  try {
    const { url, selectors } = params;
    if (!url) {
      return {
        success: false,
        error: "Web Scraper \u5DE5\u5177\u7F3A\u5C11\u5FC5\u9700\u53C2\u6570: url"
      };
    }
    return {
      success: true,
      data: {
        url,
        content: "\u8FD9\u662F\u4ECE\u7F51\u9875\u6293\u53D6\u7684\u5185\u5BB9",
        extracted: selectors ? {} : void 0
      },
      metadata: {
        url,
        timestamp: Date.now()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};
var httpRequestTool = async (params, context) => {
  try {
    const { url, method = "GET", headers = {}, body } = params;
    if (!url) {
      return {
        success: false,
        error: "HTTP Request \u5DE5\u5177\u7F3A\u5C11\u5FC5\u9700\u53C2\u6570: url"
      };
    }
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: body ? JSON.stringify(body) : void 0
    });
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP \u8BF7\u6C42\u5931\u8D25: ${response.status} ${response.statusText}`
      };
    }
    const data = await response.json();
    return {
      success: true,
      data,
      metadata: {
        url,
        method,
        status: response.status,
        statusText: response.statusText
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};
var builtinTools = {
  web_search: {
    function: webSearchTool,
    displayName: "\u7F51\u7EDC\u641C\u7D22",
    description: "\u5728\u7F51\u7EDC\u4E0A\u641C\u7D22\u4FE1\u606F"
  },
  web_scraper: {
    function: webScraperTool,
    displayName: "\u7F51\u9875\u722C\u866B",
    description: "\u4ECE\u7F51\u9875\u6293\u53D6\u5185\u5BB9"
  },
  http_request: {
    function: httpRequestTool,
    displayName: "HTTP \u8BF7\u6C42",
    description: "\u53D1\u9001 HTTP \u8BF7\u6C42"
  }
};

// src/core/smartflow/executors/tools-executor.ts
var ToolsExecutor = class {
  /**
   * 执行 tools 节点
   */
  static async execute(node, context) {
    try {
      if (!node.tool_type) {
        return {
          success: false,
          error: "Tools \u8282\u70B9\u7F3A\u5C11\u5FC5\u9700\u5B57\u6BB5: tool_type"
        };
      }
      const resolvedParams = {};
      if (node.tool_params) {
        for (const [key, value] of Object.entries(node.tool_params)) {
          if (typeof value === "string") {
            resolvedParams[key] = VariableResolver.resolve(value, context);
          } else {
            resolvedParams[key] = value;
          }
        }
      }
      let result;
      if (node.tool_type === "custom") {
        result = await this.executeCustomTool(node, resolvedParams, context);
      } else {
        result = await this.executeBuiltinTool(node.tool_type, resolvedParams, context);
      }
      if (!result.success) {
        return {
          success: false,
          error: result.error || "\u5DE5\u5177\u6267\u884C\u5931\u8D25"
        };
      }
      return {
        success: true,
        output: result.data,
        metadata: result.metadata
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  /**
   * 执行内置工具
   */
  static async executeBuiltinTool(toolType, params, context) {
    const tool = builtinTools[toolType];
    if (!tool) {
      return {
        success: false,
        error: `\u5185\u7F6E\u5DE5\u5177 "${toolType}" \u4E0D\u5B58\u5728`
      };
    }
    const toolContext = {
      input: context.input,
      nodeOutputs: context.nodeOutputs
    };
    return await tool.function(params, toolContext);
  }
  /**
   * 执行用户自定义工具
   */
  static async executeCustomTool(node, params, context) {
    if (!node.custom_code) {
      return {
        success: false,
        error: "\u81EA\u5B9A\u4E49\u5DE5\u5177\u7F3A\u5C11\u4EE3\u7801"
      };
    }
    return {
      success: false,
      error: "\u81EA\u5B9A\u4E49\u5DE5\u5177\u6267\u884C\u529F\u80FD\u5F85\u5B9E\u73B0\uFF08\u9700\u8981\u4EE3\u7801\u6C99\u7BB1\uFF09"
    };
  }
};

// src/core/smartflow/templates/prompt-templates.ts
var BUILTIN_TEMPLATES = {
  "nano-banana-photo-prompt": {
    name: "nano-banana-photo-prompt",
    displayName: "Nano Banana \u6444\u5F71\u751F\u56FE Prompt",
    description: "\u4E13\u4E1A\u6444\u5F71\u98CE\u683C\u63D0\u793A\u8BCD\u6A21\u677F\uFF0C\u9002\u7528\u4E8E Nano Banana \u6A21\u578B",
    template: `\u4E13\u4E1A\u6444\u5F71\u98CE\u683C\u63D0\u793A\u8BCD\uFF1A
\u4E3B\u9898\uFF1A{{theme}}
\u98CE\u683C\uFF1A{{style}}
\u7EC6\u8282\uFF1A{{details}}
\u8D28\u91CF\u8981\u6C42\uFF1A{{quality}}`,
    variables: ["theme", "style", "details", "quality"],
    category: "image"
  },
  // 可以继续添加更多内置模板
  "text-summary": {
    name: "text-summary",
    displayName: "\u6587\u672C\u6458\u8981\u6A21\u677F",
    description: "\u5C06\u957F\u6587\u672C\u8F6C\u6362\u4E3A\u7B80\u6D01\u6458\u8981",
    template: `\u8BF7\u5C06\u4EE5\u4E0B\u5185\u5BB9\u603B\u7ED3\u4E3A\u7B80\u6D01\u7684\u6458\u8981\uFF08\u4E0D\u8D85\u8FC7 {{max_length}} \u5B57\uFF09\uFF1A

{{content}}`,
    variables: ["content", "max_length"],
    category: "text"
  },
  "json-formatter": {
    name: "json-formatter",
    displayName: "JSON \u683C\u5F0F\u5316\u6A21\u677F",
    description: "\u5C06\u6587\u672C\u5185\u5BB9\u8F6C\u6362\u4E3A\u89C4\u8303\u7684 JSON \u683C\u5F0F",
    template: `\u8BF7\u5C06\u4EE5\u4E0B\u5185\u5BB9\u8F6C\u6362\u4E3A JSON \u683C\u5F0F\uFF1A

{{content}}

\u8981\u6C42\uFF1A
1. \u786E\u4FDD JSON \u683C\u5F0F\u6B63\u786E
2. \u5305\u542B\u6240\u6709\u5173\u952E\u4FE1\u606F
3. \u4F7F\u7528\u4E2D\u6587\u952E\u540D`,
    variables: ["content"],
    category: "formatter"
  }
};
function getTemplate(templateName) {
  return BUILTIN_TEMPLATES[templateName];
}
function fillTemplate(template, variables) {
  let templateContent;
  if (typeof template === "string") {
    templateContent = template;
  } else {
    templateContent = template.template;
  }
  let filled = templateContent;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    filled = filled.replace(placeholder, String(value));
  }
  const remainingPlaceholders = filled.match(/\{\{(\w+)\}\}/g);
  if (remainingPlaceholders && remainingPlaceholders.length > 0) {
    console.warn(`\u26A0\uFE0F  \u6A21\u677F\u4E2D\u4ECD\u6709\u672A\u586B\u5145\u7684\u53D8\u91CF: ${remainingPlaceholders.join(", ")}`);
  }
  return filled;
}
function validateTemplateVariables(template, variables) {
  const missing = [];
  for (const varName of template.variables) {
    if (!(varName in variables)) {
      missing.push(varName);
    }
  }
  return {
    valid: missing.length === 0,
    missing
  };
}

// src/core/smartflow/executors/formatter-executor.ts
var import_mxmdata = require("@mxmai/mxmdata");
var FormatterExecutor = class {
  /**
   * 执行 formatter 节点
   */
  static async execute(node, context) {
    try {
      if (!node.template && !node.format_prompt) {
        return {
          success: false,
          error: "Formatter \u8282\u70B9\u7F3A\u5C11\u5FC5\u9700\u5B57\u6BB5: \u5FC5\u987B\u63D0\u4F9B template \u6216 format_prompt \u4E4B\u4E00"
        };
      }
      let formatPrompt = "";
      let templateVariables = {};
      if (node.template) {
        let template = getTemplate(node.template);
        if (!template) {
          try {
            const templateRepo = import_mxmdata.RepositoryFactory.createPromptTemplateRepository();
            const dbTemplate = await templateRepo.findByName(node.template);
            if (dbTemplate) {
              template = {
                name: dbTemplate.name,
                displayName: dbTemplate.display_name,
                description: dbTemplate.description || "",
                template: dbTemplate.template,
                variables: dbTemplate.variables || [],
                category: dbTemplate.category
              };
              await templateRepo.incrementUsageCount(dbTemplate.id).catch((err) => {
                console.warn(`Failed to increment usage count for template ${dbTemplate.id}:`, err);
              });
            }
          } catch (error) {
            console.warn(`Failed to load template from database: ${node.template}`, error);
          }
        }
        if (template) {
          templateVariables = this.collectTemplateVariables(
            template,
            node.reference_nodes || [],
            context
          );
          const validation = validateTemplateVariables(template, templateVariables);
          if (!validation.valid) {
            return {
              success: false,
              error: `\u6A21\u677F\u53D8\u91CF\u7F3A\u5931: ${validation.missing.join(", ")}`
            };
          }
          const filledTemplate = fillTemplate(template, templateVariables);
          formatPrompt = filledTemplate;
        } else {
          templateVariables = this.collectTemplateVariables(
            { template: node.template, variables: [] },
            node.reference_nodes || [],
            context
          );
          formatPrompt = fillTemplate(node.template, templateVariables);
        }
      } else if (node.format_prompt) {
        templateVariables = this.collectTemplateVariables(
          { template: node.format_prompt, variables: [] },
          node.reference_nodes || [],
          context
        );
        formatPrompt = fillTemplate(node.format_prompt, templateVariables);
      } else {
        return {
          success: false,
          error: "Formatter \u8282\u70B9\u7F3A\u5C11\u5FC5\u9700\u5B57\u6BB5: \u5FC5\u987B\u63D0\u4F9B template \u6216 format_prompt"
        };
      }
      const referenceData = this.collectReferenceData(
        node.reference_nodes || [],
        context
      );
      const conversionPrompt = this.buildConversionPrompt(
        formatPrompt,
        referenceData,
        node.output_format
      );
      const model = node.formatter_model || "gpt-5-nano";
      const userToken = context.token;
      const response = await callTextGeneration(
        model,
        conversionPrompt,
        {
          temperature: 0.7,
          max_tokens: 2e3
        },
        userToken
      );
      const actualResult = response.data?.result || response.result || response;
      const formattedText = actualResult.text || "";
      const formattedOutput = this.formatOutput(
        formattedText,
        node.output_format || "text"
      );
      return {
        success: true,
        output: {
          formatted: formattedOutput,
          original: referenceData
        },
        metadata: {
          template: node.template,
          output_format: node.output_format,
          model
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  /**
   * 收集模板变量
   */
  static collectTemplateVariables(template, referenceNodes, context) {
    const variables = {};
    for (const nodeId of referenceNodes) {
      const nodeOutput = context.nodeOutputs[nodeId];
      if (nodeOutput) {
        if (typeof nodeOutput === "object") {
          Object.assign(variables, nodeOutput);
        } else {
          variables[nodeId] = nodeOutput;
        }
      }
    }
    if (context.input) {
      Object.assign(variables, context.input);
    }
    for (const nodeId of referenceNodes) {
      const nodeOutput = context.nodeOutputs[nodeId];
      if (nodeOutput && typeof nodeOutput === "object") {
        if (nodeOutput.text && !variables.content && !variables.text) {
          variables.content = nodeOutput.text;
          variables.text = nodeOutput.text;
        }
        if (nodeOutput.response && !variables.content) {
          variables.content = nodeOutput.response;
        }
      }
    }
    const requiredVars = template.variables || [];
    const missingVars = requiredVars.filter((v) => !variables[v]);
    if (missingVars.length > 0 && variables.content) {
      for (const varName of missingVars) {
        if (!variables[varName]) {
          if (varName === "theme" || varName === "details") {
            variables[varName] = variables.content;
          } else if (varName === "quality") {
            variables[varName] = "hd";
          } else if (varName === "style") {
            variables[varName] = variables.content;
          } else {
            variables[varName] = variables.content;
          }
        }
      }
    }
    return variables;
  }
  /**
   * 收集参考节点数据
   */
  static collectReferenceData(referenceNodes, context) {
    const data = {};
    for (const nodeId of referenceNodes) {
      const nodeOutput = context.nodeOutputs[nodeId];
      if (nodeOutput !== void 0) {
        data[nodeId] = nodeOutput;
      }
    }
    return data;
  }
  /**
   * 构建格式转换提示词
   */
  static buildConversionPrompt(formatPrompt, referenceData, outputFormat) {
    let prompt = formatPrompt;
    if (Object.keys(referenceData).length > 0) {
      prompt += `

\u53C2\u8003\u6570\u636E\uFF1A
${JSON.stringify(referenceData, null, 2)}`;
    }
    if (outputFormat) {
      switch (outputFormat) {
        case "json":
          prompt += "\n\n\u8981\u6C42\uFF1A\u8F93\u51FA\u683C\u5F0F\u4E3A JSON";
          break;
        case "markdown":
          prompt += "\n\n\u8981\u6C42\uFF1A\u8F93\u51FA\u683C\u5F0F\u4E3A Markdown";
          break;
        case "html":
          prompt += "\n\n\u8981\u6C42\uFF1A\u8F93\u51FA\u683C\u5F0F\u4E3A HTML";
          break;
        case "prompt":
          prompt += "\n\n\u8981\u6C42\uFF1A\u8F93\u51FA\u683C\u5F0F\u4E3A\u63D0\u793A\u8BCD";
          break;
      }
    }
    return prompt;
  }
  /**
   * 格式化输出
   */
  static formatOutput(text, outputFormat) {
    switch (outputFormat) {
      case "json":
        try {
          return JSON.parse(text);
        } catch {
          return { text };
        }
      case "prompt":
        return this.cleanPromptOutput(text);
      case "markdown":
      case "html":
      case "text":
      default:
        return text;
    }
  }
  /**
   * 清理 prompt 输出
   * 移除多余的描述性文本和特殊字符
   */
  static cleanPromptOutput(text) {
    if (!text || typeof text !== "string") {
      return "";
    }
    let cleaned = text.trim();
    const quotedPatterns = [
      /["""]([^"""]+)["""]/,
      // 中文引号
      /"([^"]+)"/,
      // 英文双引号
      /'([^']+)'/
      // 英文单引号
    ];
    for (const pattern of quotedPatterns) {
      const match = cleaned.match(pattern);
      if (match && match[1] && match[1].length > 20) {
        cleaned = match[1].trim();
        break;
      }
    }
    const patternsToRemove = [
      /输出格式[：:].*?可直接用于AI生成的提示词集合.*?/gi,
      /以上为.*?可直接用于AI生成的提示词集合.*?/gi,
      /按需组合成完整提示句[，,].*?如[：:]\s*/gi,
      /输出格式[：:].*?/gi,
      /^提示词[：:]\s*/gi,
      /^输出[：:]\s*/gi,
      /这是.*?最后生成的提示词[，,].*?/gi,
      /这些.*?多余描述.*?/gi
    ];
    for (const pattern of patternsToRemove) {
      cleaned = cleaned.replace(pattern, "");
    }
    cleaned = cleaned.replace(/[^\x20-\x7E\n\r\u4e00-\u9fa5，。、；：？！""''（）【】《》]/g, "");
    cleaned = cleaned.replace(/[ \t]+/g, " ");
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
    cleaned = cleaned.replace(/^[，。、；：？！\s]+/, "");
    cleaned = cleaned.replace(/[，。、；：？！\s]+$/, "");
    if (!cleaned || cleaned.length < 10) {
      cleaned = text.replace(/^(输出格式|以上为|提示词|输出|这是|这些)[：:，,]\s*/gi, "").trim();
      for (const pattern of quotedPatterns) {
        const match = cleaned.match(pattern);
        if (match && match[1]) {
          cleaned = match[1].trim();
          break;
        }
      }
      cleaned = cleaned.replace(/[^\x20-\x7E\n\r\u4e00-\u9fa5，。、；：？！""''（）【】《》]/g, "");
    }
    return cleaned.trim() || text.trim();
  }
};

// src/core/smartflow/knowledge-base/registry.ts
var BUILTIN_KNOWLEDGE_BASES = {
  "general": {
    name: "general",
    displayName: "\u901A\u7528\u77E5\u8BC6\u5E93",
    description: "\u901A\u7528\u9886\u57DF\u77E5\u8BC6\u5E93\uFF0C\u5305\u542B\u5404\u79CD\u5E38\u89C1\u77E5\u8BC6",
    type: "hybrid",
    tableName: "knowledge_base_general",
    embeddingModel: "text-embedding-3-small",
    isBuiltin: true,
    isPublic: true
  },
  "technical": {
    name: "technical",
    displayName: "\u6280\u672F\u77E5\u8BC6\u5E93",
    description: "\u6280\u672F\u76F8\u5173\u4E13\u4E1A\u77E5\u8BC6\u5E93",
    type: "hybrid",
    tableName: "knowledge_base_technical",
    embeddingModel: "text-embedding-3-small",
    isBuiltin: true,
    isPublic: true
  }
  // 可以继续添加更多内置知识库
};
var userKnowledgeBases = /* @__PURE__ */ new Map();
function getKnowledgeBase(name) {
  if (BUILTIN_KNOWLEDGE_BASES[name]) {
    return BUILTIN_KNOWLEDGE_BASES[name];
  }
  return userKnowledgeBases.get(name);
}

// src/core/smartflow/executors/recall-executor.ts
var RecallExecutor = class {
  /**
   * 执行 recall 节点
   */
  static async execute(node, context) {
    try {
      if (!node.knowledge_base) {
        return {
          success: false,
          error: "Recall \u8282\u70B9\u7F3A\u5C11\u5FC5\u9700\u5B57\u6BB5: knowledge_base"
        };
      }
      if (!node.query) {
        return {
          success: false,
          error: "Recall \u8282\u70B9\u7F3A\u5C11\u5FC5\u9700\u5B57\u6BB5: query"
        };
      }
      const kb = getKnowledgeBase(node.knowledge_base);
      if (!kb) {
        return {
          success: false,
          error: `\u77E5\u8BC6\u5E93 "${node.knowledge_base}" \u4E0D\u5B58\u5728`
        };
      }
      const resolvedQuery = VariableResolver.resolve(node.query, context);
      const params = node.recall_params || {};
      const topK = params.top_k || 5;
      const similarityThreshold = params.similarity_threshold || 0.7;
      const searchType = params.search_type || "hybrid";
      const results = await this.performRetrieval(
        kb,
        resolvedQuery,
        {
          topK,
          similarityThreshold,
          searchType
        },
        context.userId
      );
      const retrievedContent = results.map((r, index) => {
        const similarity = (r.similarity || r.score || 0).toFixed(2);
        return `[\u6587\u6863 ${index + 1}, \u76F8\u4F3C\u5EA6: ${similarity}]
${r.content}`;
      }).join("\n\n---\n\n");
      return {
        success: true,
        output: {
          query: resolvedQuery,
          results,
          retrieved_content: retrievedContent,
          // 格式化后的内容，方便直接使用
          count: results.length
        },
        metadata: {
          knowledge_base: node.knowledge_base,
          search_type: searchType,
          top_k: topK,
          similarity_threshold: similarityThreshold
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  /**
   * 执行检索
   * 实际调用知识库 API 进行检索
   */
  static async performRetrieval(kb, query, options, userId) {
    try {
      const mxmcgiUrl = process.env.MXMCGI_URL || "http://localhost:4003";
      const searchUrl = `${mxmcgiUrl}/knowledge/bases/${kb.name}/search`;
      const response = await fetch(searchUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...userId && { "x-user-id": userId }
        },
        body: JSON.stringify({
          query,
          search_type: options.searchType || "hybrid",
          limit: options.topK,
          threshold: options.similarityThreshold
        })
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`\u77E5\u8BC6\u5E93\u68C0\u7D22\u5931\u8D25: ${response.status} ${errorText}`);
      }
      const result = await response.json();
      if (!result.success || !result.data || !result.data.results) {
        throw new Error("\u77E5\u8BC6\u5E93\u68C0\u7D22\u8FD4\u56DE\u683C\u5F0F\u9519\u8BEF");
      }
      return result.data.results.map((item) => ({
        content: item.content,
        score: item.similarity || item.combined_score || 0,
        similarity: item.similarity,
        metadata: {
          ...item.metadata,
          id: item.id,
          title: item.title,
          tags: item.tags
        }
      }));
    } catch (error) {
      console.error("[RecallExecutor] \u77E5\u8BC6\u5E93\u68C0\u7D22\u5931\u8D25:", error);
      return [];
    }
  }
};

// src/core/smartflow/executors/condition-executor.ts
var ConditionExecutor = class {
  /**
   * 执行 condition 节点
   */
  static async execute(node, context) {
    try {
      if (!node.if) {
        return {
          success: false,
          error: "Condition \u8282\u70B9\u7F3A\u5C11\u5FC5\u9700\u5B57\u6BB5: if"
        };
      }
      if (!node.then) {
        return {
          success: false,
          error: "Condition \u8282\u70B9\u7F3A\u5C11\u5FC5\u9700\u5B57\u6BB5: then"
        };
      }
      if (!node.else) {
        return {
          success: false,
          error: "Condition \u8282\u70B9\u7F3A\u5C11\u5FC5\u9700\u5B57\u6BB5: else"
        };
      }
      const ifResult = this.evaluateCondition(node.if, context);
      if (ifResult) {
        return {
          success: true,
          output: {
            condition: node.if,
            result: true,
            matched: "if"
          },
          nextNodes: [node.then]
        };
      }
      if (node.else_if && node.else_if.length > 0) {
        for (const branch of node.else_if) {
          const elseIfResult = this.evaluateCondition(branch.condition, context);
          if (elseIfResult) {
            return {
              success: true,
              output: {
                condition: branch.condition,
                result: true,
                matched: "else_if"
              },
              nextNodes: [branch.then]
            };
          }
        }
      }
      return {
        success: true,
        output: {
          condition: node.if,
          result: false,
          matched: "else"
        },
        nextNodes: [node.else]
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  /**
   * 评估条件表达式
   */
  static evaluateCondition(condition, context) {
    try {
      const resolvedCondition = VariableResolver.resolve(condition, context);
      const result = this.safeEvaluate(resolvedCondition);
      return Boolean(result);
    } catch (error) {
      console.error("\u6761\u4EF6\u8868\u8FBE\u5F0F\u6C42\u503C\u5931\u8D25:", error);
      return false;
    }
  }
  /**
   * 安全地求值表达式（简化版）
   * 注意：生产环境应该使用更安全的表达式求值器
   */
  static safeEvaluate(expression) {
    let expr = expression.trim();
    try {
      if (expr === "true" || expr === "false") {
        return expr === "true";
      }
      const numberMatch = expr.match(/^(\d+(?:\.\d+)?)\s*(==|===|!=|!==|>|<|>=|<=)\s*(\d+(?:\.\d+)?)$/);
      if (numberMatch) {
        const [, left, op, right] = numberMatch;
        const leftNum = parseFloat(left);
        const rightNum = parseFloat(right);
        switch (op) {
          case "==":
          case "===":
            return leftNum === rightNum;
          case "!=":
          case "!==":
            return leftNum !== rightNum;
          case ">":
            return leftNum > rightNum;
          case "<":
            return leftNum < rightNum;
          case ">=":
            return leftNum >= rightNum;
          case "<=":
            return leftNum <= rightNum;
        }
      }
      const stringMatch = expr.match(/^(['"]?)(.+?)\1\s*(==|===|!=|!==)\s*(['"]?)(.+?)\4$/);
      if (stringMatch) {
        const [, , left, op, , right] = stringMatch;
        switch (op) {
          case "==":
          case "===":
            return left === right;
          case "!=":
          case "!==":
            return left !== right;
        }
      }
      return eval(expr);
    } catch {
      return false;
    }
  }
};

// src/core/smartflow/executors/loop-executor.ts
var LoopExecutor = class {
  /**
   * 执行 loop 节点
   * 
   * 注意：loop 节点需要访问 nodeMap 来执行 loop_nodes 中的节点
   * 但当前设计下，执行器无法直接访问 nodeMap
   * 因此，我们需要通过 context 传递 nodeMap，或者修改引擎逻辑
   * 
   * 方案：在 context 中添加 nodeMap 和 executeNode 函数
   */
  static async execute(node, context) {
    try {
      if (!node.iterable) {
        return {
          success: false,
          error: "Loop \u8282\u70B9\u7F3A\u5C11\u5FC5\u9700\u5B57\u6BB5: iterable"
        };
      }
      if (!node.item_variable) {
        return {
          success: false,
          error: "Loop \u8282\u70B9\u7F3A\u5C11\u5FC5\u9700\u5B57\u6BB5: item_variable"
        };
      }
      if (!node.loop_nodes || node.loop_nodes.length === 0) {
        return {
          success: false,
          error: "Loop \u8282\u70B9\u7F3A\u5C11\u5FC5\u9700\u5B57\u6BB5: loop_nodes\uFF08\u5FC5\u987B\u81F3\u5C11\u5305\u542B\u4E00\u4E2A\u8282\u70B9 ID\uFF09"
        };
      }
      const iterable = VariableResolver.resolve(node.iterable, context);
      if (!Array.isArray(iterable)) {
        return {
          success: false,
          error: `Loop \u8282\u70B9\u7684 iterable \u5FC5\u987B\u662F\u6570\u7EC4\uFF0C\u5F53\u524D\u7C7B\u578B: ${typeof iterable}\uFF0C\u503C: ${JSON.stringify(iterable).substring(0, 100)}`
        };
      }
      const maxIterations = node.max_iterations || 100;
      if (iterable.length > maxIterations) {
        return {
          success: false,
          error: `\u5FAA\u73AF\u6B21\u6570\u8D85\u8FC7\u6700\u5927\u9650\u5236: ${maxIterations}\uFF08\u5F53\u524D\u6570\u7EC4\u957F\u5EA6: ${iterable.length}\uFF09`
        };
      }
      const nodeMap = context.nodeMap;
      const executeNodeFunc = context.executeNode;
      if (!nodeMap || !executeNodeFunc) {
        return {
          success: false,
          error: "Loop \u8282\u70B9\u6267\u884C\u9700\u8981 nodeMap \u548C executeNode \u51FD\u6570\uFF0C\u8BF7\u786E\u4FDD\u5F15\u64CE\u6B63\u786E\u4F20\u9012\u8FD9\u4E9B\u53C2\u6570"
        };
      }
      const results = [];
      const collectedOutputs = [];
      for (let i = 0; i < iterable.length; i++) {
        const item = iterable[i];
        const loopContext = {
          ...context,
          // 设置循环变量
          [node.item_variable]: item,
          [`${node.id}.item`]: item
        };
        if (node.index_variable) {
          loopContext[node.index_variable] = i;
          loopContext[`${node.id}.index`] = i;
        }
        const nodeOutputs = {};
        let shouldBreak = false;
        for (const loopNodeId of node.loop_nodes) {
          const loopNode = nodeMap.get(loopNodeId);
          if (!loopNode) {
            return {
              success: false,
              error: `Loop \u8282\u70B9\u4E2D\u6307\u5B9A\u7684\u8282\u70B9\u4E0D\u5B58\u5728: ${loopNodeId}`
            };
          }
          const result = await executeNodeFunc(loopNode, loopContext);
          if (!result.success) {
            return {
              success: false,
              error: `\u5FAA\u73AF\u4E2D\u8282\u70B9\u6267\u884C\u5931\u8D25: ${loopNodeId} - ${result.error}`
            };
          }
          nodeOutputs[loopNodeId] = result.output;
          loopContext.nodeOutputs[loopNodeId] = result.output;
          if (node.break_condition) {
            const breakResult = VariableResolver.resolve(node.break_condition, loopContext);
            if (breakResult === true || breakResult === "true") {
              shouldBreak = true;
              break;
            }
          }
        }
        results.push({
          index: i,
          item,
          node_outputs: nodeOutputs
        });
        if (node.collect_output !== false) {
          for (const nodeOutput of Object.values(nodeOutputs)) {
            if (nodeOutput && typeof nodeOutput === "object") {
              if (Array.isArray(nodeOutput.image_urls)) {
                collectedOutputs.push(...nodeOutput.image_urls);
              } else if (Array.isArray(nodeOutput.mediaUrls)) {
                collectedOutputs.push(...nodeOutput.mediaUrls);
              } else if (nodeOutput.image_urls && typeof nodeOutput.image_urls === "string") {
                collectedOutputs.push(nodeOutput.image_urls);
              } else if (nodeOutput.mediaUrls && typeof nodeOutput.mediaUrls === "string") {
                collectedOutputs.push(nodeOutput.mediaUrls);
              } else if (typeof nodeOutput === "string") {
                collectedOutputs.push(nodeOutput);
              }
            } else if (typeof nodeOutput === "string") {
              collectedOutputs.push(nodeOutput);
            }
          }
        }
        if (shouldBreak) {
          break;
        }
      }
      const output = {
        iterations: results.length,
        results
      };
      if (node.collect_output !== false) {
        const outputVarName = node.output_variable || "collected_outputs";
        output[outputVarName] = collectedOutputs;
        context[outputVarName] = collectedOutputs;
        context[`${node.id}.${outputVarName}`] = collectedOutputs;
      }
      return {
        success: true,
        output,
        metadata: {
          iterations: results.length,
          total_items: iterable.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

// src/core/smartflow/executors/end-executor.ts
var EndExecutor = class {
  /**
   * 执行 end 节点
   */
  static async execute(node, context) {
    try {
      const expectedOutputs = context.expected_outputs || [];
      const nullableOutputs = node.nullable_outputs || [];
      const mappedOutputs = {};
      if (node.output_mapping) {
        for (const [outputName, sourceExpression] of Object.entries(node.output_mapping)) {
          let expression2 = sourceExpression;
          if (typeof expression2 === "string" && !expression2.includes("{{")) {
            expression2 = `{{${expression2}}}`;
          }
          const value = VariableResolver.resolve(expression2, context);
          mappedOutputs[outputName] = value;
        }
      }
      if (node.validate_outputs !== false) {
        const validation = this.validateOutputs(
          expectedOutputs,
          mappedOutputs,
          nullableOutputs
        );
        if (!validation.valid) {
          return {
            success: false,
            error: validation.error || "\u8F93\u51FA\u9A8C\u8BC1\u5931\u8D25"
          };
        }
      }
      const finalOutput = {};
      for (const expected of expectedOutputs) {
        const outputName = expected.name;
        const value = mappedOutputs[outputName];
        if (value === null || value === void 0) {
          if (nullableOutputs.includes(outputName)) {
            finalOutput[outputName] = null;
          } else if (expected.required) {
            return {
              success: false,
              error: `\u5FC5\u9700\u8F93\u51FA "${outputName}" \u4E3A\u7A7A`
            };
          } else {
            finalOutput[outputName] = null;
          }
        } else {
          if (!this.validateOutputType(value, expected.type)) {
            return {
              success: false,
              error: `\u8F93\u51FA "${outputName}" \u7C7B\u578B\u4E0D\u5339\u914D\uFF0C\u671F\u671B ${expected.type}`
            };
          }
          finalOutput[outputName] = value;
        }
      }
      return {
        success: true,
        output: finalOutput,
        metadata: {
          output_count: Object.keys(finalOutput).length,
          validated: node.validate_outputs !== false
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  /**
   * 验证输出
   */
  static validateOutputs(expectedOutputs, actualOutputs, nullableOutputs) {
    for (const expected of expectedOutputs) {
      const outputName = expected.name;
      const value = actualOutputs[outputName];
      if (expected.required && (value === null || value === void 0)) {
        if (!nullableOutputs.includes(outputName)) {
          return {
            valid: false,
            error: `\u5FC5\u9700\u8F93\u51FA "${outputName}" \u7F3A\u5931`
          };
        }
      }
      if (value !== null && value !== void 0) {
        if (!this.validateOutputType(value, expected.type)) {
          return {
            valid: false,
            error: `\u8F93\u51FA "${outputName}" \u7C7B\u578B\u4E0D\u5339\u914D\uFF0C\u671F\u671B ${expected.type}`
          };
        }
      }
    }
    return { valid: true };
  }
  /**
   * 验证输出类型
   */
  static validateOutputType(value, expectedType) {
    switch (expectedType) {
      case "text":
        return typeof value === "string" && value.length > 0;
      case "image":
        if (Array.isArray(value)) {
          if (value.length === 0) {
            return false;
          }
          return value.every((v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("data:")));
        }
        if (typeof value === "string") {
          return value.startsWith("http") || value.startsWith("data:");
        }
        if (typeof value === "object" && value !== null) {
          if ("image_urls" in value) {
            const urls = value.image_urls;
            if (Array.isArray(urls)) {
              if (urls.length === 0) {
                return false;
              }
              return urls.every((v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("data:")));
            }
            return typeof urls === "string" && (urls.startsWith("http") || urls.startsWith("data:"));
          }
          if ("mediaUrls" in value) {
            const urls = value.mediaUrls;
            if (Array.isArray(urls)) {
              if (urls.length === 0) {
                return false;
              }
              return urls.every((v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("data:")));
            }
            return typeof urls === "string" && (urls.startsWith("http") || urls.startsWith("data:"));
          }
        }
        return false;
      case "video":
        if (Array.isArray(value)) {
          if (value.length === 0) {
            return false;
          }
          return value.every((v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("data:")));
        }
        if (typeof value === "string") {
          return value.startsWith("http") || value.startsWith("data:");
        }
        if (typeof value === "object" && value !== null && "video_urls" in value) {
          const urls = value.video_urls;
          if (Array.isArray(urls)) {
            if (urls.length === 0) {
              return false;
            }
            return urls.every((v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("data:")));
          }
          return typeof urls === "string" && (urls.startsWith("http") || urls.startsWith("data:"));
        }
        return false;
      case "sound":
        if (Array.isArray(value)) {
          if (value.length === 0) {
            return false;
          }
          return value.every((v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("data:")));
        }
        if (typeof value === "string") {
          return value.startsWith("http") || value.startsWith("data:");
        }
        if (typeof value === "object" && value !== null && "audio_urls" in value) {
          const urls = value.audio_urls;
          if (Array.isArray(urls)) {
            if (urls.length === 0) {
              return false;
            }
            return urls.every((v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("data:")));
          }
          return typeof urls === "string" && (urls.startsWith("http") || urls.startsWith("data:"));
        }
        return false;
      case "embedding":
        return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "number");
      default:
        return true;
    }
  }
};

// src/core/smartflow/engine.ts
var SmartflowEngine = class {
  smartflowRepo;
  executionRepo;
  // 跟踪正在执行的任务，用于取消功能
  runningTasks = /* @__PURE__ */ new Map();
  constructor(smartflowRepo, executionRepo) {
    this.smartflowRepo = smartflowRepo;
    this.executionRepo = executionRepo;
  }
  /**
   * 执行 Smartflow（创建 Task 并异步执行）
   * 立即返回 task，实际执行在后台进行
   */
  async execute(smartflowId, userId, input, conversationId, token) {
    const smartflow = await this.smartflowRepo.findById(smartflowId);
    if (!smartflow) {
      throw new Error(`Smartflow not found: ${smartflowId}`);
    }
    const executionDto = {
      smartflow_id: smartflowId,
      conversation_id: conversationId,
      user_id: userId,
      input_data: {
        input
        // 将 input 数组存储到 input_data
      }
    };
    let execution = await this.executionRepo.create(executionDto);
    execution = await this.executionRepo.updateStatus(execution.id, "pending", 0);
    const abortController = new AbortController();
    this.runningTasks.set(execution.id, {
      cancelled: false,
      abortController
    });
    setImmediate(async () => {
      try {
        const taskInfo = this.runningTasks.get(execution.id);
        if (taskInfo?.cancelled) {
          await this.executionRepo.updateError(execution.id, "Task was cancelled by user");
          await this.executionRepo.updateStatus(execution.id, "failed", 0);
          this.runningTasks.delete(execution.id);
          return;
        }
        await this.executionRepo.updateStatus(execution.id, "running", 0);
        const result = await this.runWorkflow(smartflow, execution, input, token, execution.id);
        const finalTaskInfo = this.runningTasks.get(execution.id);
        if (finalTaskInfo?.cancelled) {
          await this.executionRepo.updateError(execution.id, "Task was cancelled by user");
          await this.executionRepo.updateStatus(execution.id, "failed", 0);
          this.runningTasks.delete(execution.id);
          return;
        }
        await this.executionRepo.updateOutput(execution.id, result.output);
        await this.executionRepo.updateStatus(
          execution.id,
          "completed",
          100
        );
        this.runningTasks.delete(execution.id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const taskInfo = this.runningTasks.get(execution.id);
        if (taskInfo?.cancelled) {
          await this.executionRepo.updateError(execution.id, "Task was cancelled by user");
          await this.executionRepo.updateStatus(execution.id, "failed", 0);
          this.runningTasks.delete(execution.id);
          return;
        }
        const isImageVideoTimeoutError = errorMessage.includes("IMAGE_VIDEO_PROCESSING_TIMEOUT") || errorMessage.includes("Node execution failed") && (errorMessage.includes("timeout") || errorMessage.includes("Timeout") || errorMessage.includes("\u8D85\u65F6") || errorMessage.includes("\u4EFB\u52A1\u6B63\u5728\u5904\u7406\u4E2D"));
        if (isImageVideoTimeoutError) {
          console.warn(`[SmartflowEngine] Image/Video generation timeout detected, keeping task in running state: ${errorMessage}`);
          await this.executionRepo.updateError(
            execution.id,
            `\u4EFB\u52A1\u5904\u7406\u4E2D\uFF1A\u56FE\u7247/\u89C6\u9891\u751F\u6210\u53EF\u80FD\u9700\u8981\u8F83\u957F\u65F6\u95F4\uFF0C\u4EFB\u52A1\u4ECD\u5728replicate\u961F\u5217\u4E2D\u5904\u7406\uFF0C\u8BF7\u7A0D\u540E\u67E5\u8BE2\u72B6\u6001\u3002\u539F\u59CB\u9519\u8BEF\uFF1A${errorMessage.replace("IMAGE_VIDEO_PROCESSING_TIMEOUT: ", "")}`
          );
          this.runningTasks.delete(execution.id);
          return;
        }
        await this.executionRepo.updateError(execution.id, errorMessage);
        await this.executionRepo.updateStatus(
          execution.id,
          "failed",
          0
        );
        this.runningTasks.delete(execution.id);
      }
    });
    return execution;
  }
  /**
   * 停止执行任务
   */
  async stopExecution(executionId) {
    const taskInfo = this.runningTasks.get(executionId);
    if (!taskInfo) {
      const execution = await this.executionRepo.findById(executionId);
      if (!execution) {
        throw new Error(`Task not found: ${executionId}`);
      }
      if (execution.status === "completed" || execution.status === "failed") {
        throw new Error(`Task already ${execution.status}: ${executionId}`);
      }
      this.runningTasks.set(executionId, { cancelled: true });
      return;
    }
    taskInfo.cancelled = true;
    if (taskInfo.abortController) {
      taskInfo.abortController.abort();
    }
    await this.executionRepo.updateError(executionId, "Task was cancelled by user");
    await this.executionRepo.updateStatus(executionId, "failed", 0);
  }
  /**
   * 检查任务是否已取消
   */
  isCancelled(executionId) {
    const taskInfo = this.runningTasks.get(executionId);
    return taskInfo?.cancelled === true;
  }
  /**
   * 运行工作流
   */
  async runWorkflow(smartflow, execution, input, token, executionId) {
    const execId = executionId || execution.id;
    if (this.isCancelled(execId)) {
      throw new Error("Task was cancelled");
    }
    const schema = smartflow.schema;
    const nodes = schema.nodes;
    const edges = schema.edges;
    const nodeMap = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }
    const edgeMap = /* @__PURE__ */ new Map();
    for (const edge of edges) {
      if (!edgeMap.has(edge.from)) {
        edgeMap.set(edge.from, []);
      }
      edgeMap.get(edge.from).push(edge.to);
    }
    const loopNodeIds = /* @__PURE__ */ new Set();
    for (const node of nodes) {
      if (node.type === "loop" && node.loop_nodes) {
        for (const loopNodeId of node.loop_nodes) {
          loopNodeIds.add(loopNodeId);
        }
      }
    }
    const context = {
      input: {},
      // 将在 start 节点中填充
      nodeOutputs: {},
      flowChain: [],
      token,
      // 传递用户 token 用于调用 mxmcgi
      // 为 loop 节点提供 nodeMap 和 executeNode 函数
      nodeMap,
      executeNode: async (node, ctx) => {
        return await this.executeNode(node, ctx, execution.id);
      }
    };
    const startNode = nodes.find((n) => n.type === "start");
    if (!startNode) {
      throw new Error("Workflow must have a start node");
    }
    startNode.input = input;
    await this.executeNode(startNode, context, execId);
    if (this.isCancelled(execId)) {
      throw new Error("Task was cancelled");
    }
    const visited = /* @__PURE__ */ new Set();
    await this.executeNodeRecursive(
      startNode.id,
      nodeMap,
      edgeMap,
      context,
      execId,
      visited,
      loopNodeIds
    );
    if (this.isCancelled(execId)) {
      throw new Error("Task was cancelled");
    }
    const endNode = nodes.find((n) => n.type === "end");
    if (!endNode) {
      throw new Error("Workflow must have an end node");
    }
    const endResult = await this.executeNode(endNode, context, execId);
    if (!endResult.success || !endResult.output) {
      throw new Error("End node execution failed");
    }
    return { output: endResult.output };
  }
  /**
   * 递归执行节点
   */
  async executeNodeRecursive(nodeId, nodeMap, edgeMap, context, executionId, visited, loopNodeIds) {
    if (this.isCancelled(executionId)) {
      throw new Error("Task was cancelled");
    }
    if (visited.has(nodeId)) {
      return;
    }
    if (loopNodeIds && loopNodeIds.has(nodeId)) {
      return;
    }
    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    const result = await this.executeNode(node, context, executionId);
    if (this.isCancelled(executionId)) {
      throw new Error("Task was cancelled");
    }
    if (!result.success) {
      if (result.isProcessing && (node.type === "model" && (node.model_type === "image" || node.model_type === "video"))) {
        throw new Error(`IMAGE_VIDEO_PROCESSING_TIMEOUT: Node ${nodeId} is still processing (image/video generation may take longer): ${result.error}`);
      } else {
        throw new Error(`Node execution failed: ${nodeId} - ${result.error}`);
      }
    }
    context.nodeOutputs[nodeId] = result.output;
    let nextNodeIds = [];
    if (node.type === "condition" && result.nextNodes) {
      nextNodeIds = result.nextNodes;
    } else {
      nextNodeIds = edgeMap.get(nodeId) || [];
    }
    for (const nextNodeId of nextNodeIds) {
      if (this.isCancelled(executionId)) {
        throw new Error("Task was cancelled");
      }
      await this.executeNodeRecursive(
        nextNodeId,
        nodeMap,
        edgeMap,
        context,
        executionId,
        visited,
        loopNodeIds
      );
    }
  }
  /**
   * 执行单个节点
   */
  async executeNode(node, context, executionId) {
    if (this.isCancelled(executionId)) {
      return {
        success: false,
        error: "Task was cancelled"
      };
    }
    const startTime = Date.now();
    await this.executionRepo.updateNodeOutput(
      executionId,
      node.id,
      node.name || node.id,
      "processing",
      context.input
    );
    if (this.isCancelled(executionId)) {
      return {
        success: false,
        error: "Task was cancelled"
      };
    }
    let result;
    try {
      switch (node.type) {
        case "start":
          result = await StartExecutor.execute(node, context);
          break;
        case "model":
          result = await ModelExecutor.execute(node, context);
          break;
        case "tools":
          result = await ToolsExecutor.execute(node, context);
          break;
        case "formatter":
          result = await FormatterExecutor.execute(node, context);
          break;
        case "recall":
          result = await RecallExecutor.execute(node, context);
          break;
        case "condition":
          result = await ConditionExecutor.execute(node, context);
          break;
        case "loop":
          result = await LoopExecutor.execute(node, context);
          break;
        case "end":
          result = await EndExecutor.execute(node, context);
          break;
        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }
      const duration = Date.now() - startTime;
      await this.executionRepo.updateNodeOutput(
        executionId,
        node.id,
        node.name || node.id,
        result.success ? "completed" : "failed",
        context.input,
        result.output,
        result.error,
        duration
      );
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.executionRepo.updateNodeOutput(
        executionId,
        node.id,
        node.name || node.id,
        "failed",
        context.input,
        void 0,
        errorMessage,
        duration
      );
      return {
        success: false,
        error: errorMessage
      };
    }
  }
  /**
   * 获取执行实例（Task）详情
   */
  async getExecution(executionId) {
    return await this.executionRepo.findById(executionId);
  }
  /**
   * 获取用户的执行实例列表
   */
  async getUserExecutions(userId, limit, offset) {
    return await this.executionRepo.findByUserId(userId, limit, offset);
  }
};

// src/core/smartflow/service.ts
var SmartflowService = class {
  engine;
  constructor() {
    const smartflowRepo = (0, import_mxmdata2.createSmartflowRepository)();
    const executionRepo = (0, import_mxmdata2.createSmartflowExecutionRepository)();
    this.engine = new SmartflowEngine(smartflowRepo, executionRepo);
  }
  /**
   * 创建 Smartflow
   */
  async createSmartflow(data) {
    const repo = (0, import_mxmdata2.createSmartflowRepository)();
    return await repo.create(data);
  }
  /**
   * 获取 Smartflow
   */
  async getSmartflow(id) {
    const repo = (0, import_mxmdata2.createSmartflowRepository)();
    return await repo.findById(id);
  }
  /**
   * 更新 Smartflow
   */
  async updateSmartflow(id, data) {
    const repo = (0, import_mxmdata2.createSmartflowRepository)();
    return await repo.update(id, data);
  }
  /**
   * 删除 Smartflow
   */
  async deleteSmartflow(id) {
    const repo = (0, import_mxmdata2.createSmartflowRepository)();
    return await repo.delete(id);
  }
  /**
   * 获取用户的 Smartflow 列表
   */
  async getUserSmartflows(userId, limit, offset) {
    const repo = (0, import_mxmdata2.createSmartflowRepository)();
    return await repo.findByUserId(userId, limit, offset);
  }
  /**
   * 获取公开的 Smartflow 列表
   */
  async getPublicSmartflows(limit, offset) {
    const repo = (0, import_mxmdata2.createSmartflowRepository)();
    return await repo.findPublic(limit, offset);
  }
  /**
   * 获取所有 Smartflow 列表（默认返回所有）
   */
  async getAllSmartflows(limit, offset) {
    const repo = (0, import_mxmdata2.createSmartflowRepository)();
    return await repo.findAll(limit, offset);
  }
  /**
   * 执行 Smartflow（创建 Task 并执行）
   */
  async executeSmartflow(smartflowId, userId, input, conversationId, token) {
    return await this.engine.execute(smartflowId, userId, input, conversationId, token);
  }
  /**
   * 获取执行实例（Task）详情
   */
  async getExecution(executionId) {
    return await this.engine.getExecution(executionId);
  }
  /**
   * 获取用户的执行实例列表
   */
  async getUserExecutions(userId, limit, offset) {
    return await this.engine.getUserExecutions(userId, limit, offset);
  }
  /**
   * 停止执行任务
   */
  async stopExecution(executionId) {
    return await this.engine.stopExecution(executionId);
  }
};
function createSmartflowService() {
  return new SmartflowService();
}

// src/routes/smartflow.ts
var import_mxmdata3 = require("@mxmai/mxmdata");
var router2 = (0, import_express2.Router)();
var serviceInstance = null;
function getService() {
  if (!serviceInstance) {
    serviceInstance = createSmartflowService();
  }
  return serviceInstance;
}
router2.get("/", async (req, res) => {
  try {
    const service = getService();
    const { userId, public: isPublic, limit, offset } = req.query;
    if (isPublic === "true") {
      const smartflows = await service.getPublicSmartflows(
        limit ? Number(limit) : void 0,
        offset ? Number(offset) : void 0
      );
      return res.json({
        success: true,
        data: smartflows,
        count: smartflows.length
      });
    } else if (userId) {
      const smartflows = await service.getUserSmartflows(
        userId,
        limit ? Number(limit) : void 0,
        offset ? Number(offset) : void 0
      );
      return res.json({
        success: true,
        data: smartflows,
        count: smartflows.length
      });
    } else {
      const smartflows = await service.getAllSmartflows(
        limit ? Number(limit) : void 0,
        offset ? Number(offset) : void 0
      );
      return res.json({
        success: true,
        data: smartflows,
        count: smartflows.length
      });
    }
  } catch (error) {
    console.error("Error getting smartflows:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
router2.get("/:id/status", async (req, res) => {
  try {
    const service = getService();
    const { id } = req.params;
    const execution = await service.getExecution(id);
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: "Task not found"
      });
    }
    return res.json({
      success: true,
      data: execution
    });
  } catch (error) {
    console.error("Error getting task status:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
router2.get("/:id/execute", async (req, res) => {
  try {
    const service = getService();
    const { id } = req.params;
    const execution = await service.getExecution(id);
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: "Task not found"
      });
    }
    return res.json({
      success: true,
      data: execution
    });
  } catch (error) {
    console.error("Error getting task status:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
router2.get("/:id", async (req, res) => {
  try {
    const service = getService();
    const { id } = req.params;
    const smartflow = await service.getSmartflow(id);
    if (!smartflow) {
      return res.status(404).json({
        success: false,
        error: "Smartflow not found"
      });
    }
    return res.json({
      success: true,
      data: smartflow
    });
  } catch (error) {
    console.error("Error getting smartflow:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
router2.post("/", async (req, res) => {
  try {
    const service = getService();
    const data = req.body;
    if (!data.name || !data.schema) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: name, schema"
      });
    }
    const userIdFromHeader = req.headers["x-user-id"];
    if (userIdFromHeader) {
      if (data.author_id && data.author_id !== userIdFromHeader) {
        return res.status(403).json({
          success: false,
          error: "author_id in body does not match authenticated user"
        });
      }
      data.author_id = userIdFromHeader;
    } else if (!data.author_id) {
      return res.status(400).json({
        success: false,
        error: "Missing author_id: either provide Authorization token or author_id in body"
      });
    }
    const smartflow = await service.createSmartflow(data);
    return res.status(201).json({
      success: true,
      data: smartflow
    });
  } catch (error) {
    console.error("Error creating smartflow:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
router2.put("/:id", async (req, res) => {
  try {
    const service = getService();
    const { id } = req.params;
    const data = req.body;
    const userIdFromHeader = req.headers["x-user-id"];
    if (!userIdFromHeader) {
      return res.status(401).json({
        success: false,
        error: "Authentication required: missing user ID"
      });
    }
    const existingSmartflow = await service.getSmartflow(id);
    if (!existingSmartflow) {
      return res.status(404).json({
        success: false,
        error: "Smartflow not found"
      });
    }
    if (existingSmartflow.author_id && existingSmartflow.author_id !== userIdFromHeader) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: you can only update your own smartflows"
      });
    }
    const smartflow = await service.updateSmartflow(id, data);
    return res.json({
      success: true,
      data: smartflow
    });
  } catch (error) {
    console.error("Error updating smartflow:", error);
    if (error instanceof import_mxmdata3.NotFoundError) {
      return res.status(404).json({
        success: false,
        error: error.message || "Smartflow not found"
      });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
router2.delete("/:id", async (req, res) => {
  try {
    const service = getService();
    const { id } = req.params;
    await service.deleteSmartflow(id);
    return res.json({
      success: true,
      message: "Smartflow deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting smartflow:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
router2.post("/:id/execute", async (req, res) => {
  try {
    const service = getService();
    const { id } = req.params;
    const { userId: userIdFromBody, input, conversationId } = req.body;
    if (!input || !Array.isArray(input)) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: input (array)"
      });
    }
    const userIdFromHeader = req.headers["x-user-id"];
    let userId;
    if (userIdFromHeader) {
      if (userIdFromBody && userIdFromBody !== userIdFromHeader) {
        return res.status(403).json({
          success: false,
          error: "userId in body does not match authenticated user"
        });
      }
      userId = userIdFromHeader;
    } else if (userIdFromBody) {
      userId = userIdFromBody;
    } else {
      return res.status(400).json({
        success: false,
        error: "Missing userId: either provide Authorization token or userId in body"
      });
    }
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : authHeader || void 0;
    const execution = await service.executeSmartflow(
      id,
      userId,
      input,
      conversationId,
      token
    );
    return res.status(202).json({
      success: true,
      data: {
        id: execution.id,
        smartflow_id: execution.smartflow_id,
        user_id: execution.user_id,
        status: execution.status,
        progress: execution.progress,
        created_at: execution.created_at,
        message: "Task created successfully. Use the task ID to query execution status.",
        status_url: `/api/v1/smartflows/${execution.id}/status`
        // 提供查询状态的 URL
      }
    });
  } catch (error) {
    console.error("Error executing smartflow:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
router2.post("/:id/stop", async (req, res) => {
  try {
    const service = getService();
    const { id } = req.params;
    const userIdFromHeader = req.headers["x-user-id"];
    if (!userIdFromHeader) {
      return res.status(401).json({
        success: false,
        error: "Authentication required: missing user ID"
      });
    }
    const execution = await service.getExecution(id);
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: "Task not found"
      });
    }
    if (execution.user_id !== userIdFromHeader) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: you can only stop your own tasks"
      });
    }
    if (execution.status === "completed") {
      return res.status(400).json({
        success: false,
        error: "Task already completed"
      });
    }
    if (execution.status === "failed") {
      return res.status(400).json({
        success: false,
        error: "Task already failed"
      });
    }
    await service.stopExecution(id);
    return res.json({
      success: true,
      message: "Task stopped successfully",
      data: {
        id: execution.id,
        status: "failed"
      }
    });
  } catch (error) {
    console.error("Error stopping task:", error);
    if (error instanceof Error) {
      if (error.message.includes("not found")) {
        return res.status(404).json({
          success: false,
          error: error.message
        });
      }
      if (error.message.includes("already")) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
var smartflow_default = router2;

// src/routes/task.ts
var import_express3 = require("express");
var router3 = (0, import_express3.Router)();
var serviceInstance2 = null;
function getService2() {
  if (!serviceInstance2) {
    serviceInstance2 = createSmartflowService();
  }
  return serviceInstance2;
}
router3.get("/", async (req, res) => {
  try {
    const service = getService2();
    const { status, limit, offset } = req.query;
    const userIdFromHeader = req.headers["x-user-id"];
    if (!userIdFromHeader) {
      return res.status(401).json({
        success: false,
        error: "Authentication required: missing user ID"
      });
    }
    let executions = await service.getUserExecutions(
      userIdFromHeader,
      limit ? Number(limit) : void 0,
      offset ? Number(offset) : void 0
    );
    if (status) {
      executions = executions.filter((exec) => exec.status === status);
    }
    return res.json({
      success: true,
      data: executions,
      count: executions.length
    });
  } catch (error) {
    console.error("Error getting tasks:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
router3.get("/:id", async (req, res) => {
  try {
    const service = getService2();
    const { id } = req.params;
    const userIdFromHeader = req.headers["x-user-id"];
    const execution = await service.getExecution(id);
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: "Task not found"
      });
    }
    if (userIdFromHeader && execution.user_id !== userIdFromHeader) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: you can only access your own tasks"
      });
    }
    return res.json({
      success: true,
      data: execution
    });
  } catch (error) {
    console.error("Error getting task:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
var task_default = router3;

// src/routes/prompt-template.ts
var import_express4 = require("express");

// src/core/prompt-template/service.ts
var import_mxmdata4 = require("@mxmai/mxmdata");
function createPromptTemplateService() {
  const repo = import_mxmdata4.RepositoryFactory.createPromptTemplateRepository();
  return {
    /**
     * 根据 ID 获取模板
     */
    async getTemplateById(id) {
      return await repo.findById(id);
    },
    /**
     * 根据名称获取模板
     */
    async getTemplateByName(name) {
      return await repo.findByName(name);
    },
    /**
     * 获取用户的模板列表
     */
    async getUserTemplates(userId, limit, offset) {
      return await repo.findByUserId(userId, limit, offset);
    },
    /**
     * 获取公开的模板列表
     */
    async getPublicTemplates(limit, offset) {
      return await repo.findPublic(limit, offset);
    },
    /**
     * 获取所有模板（包括公开和私有的）
     */
    async getAllTemplates(limit, offset) {
      return await repo.findAll(limit, offset);
    },
    /**
     * 按分类获取模板
     */
    async getTemplatesByCategory(category, limit, offset) {
      return await repo.findByCategory(category, limit, offset);
    },
    /**
     * 创建模板
     */
    async createTemplate(data) {
      return await repo.create(data);
    },
    /**
     * 更新模板
     */
    async updateTemplate(id, data) {
      return await repo.update(id, data);
    },
    /**
     * 删除模板
     */
    async deleteTemplate(id) {
      return await repo.delete(id);
    },
    /**
     * 增加模板使用次数
     */
    async incrementUsageCount(id) {
      return await repo.incrementUsageCount(id);
    }
  };
}

// src/routes/prompt-template.ts
var router4 = (0, import_express4.Router)();
var serviceInstance3 = null;
function getService3() {
  if (!serviceInstance3) {
    serviceInstance3 = createPromptTemplateService();
  }
  return serviceInstance3;
}
router4.get("/", async (req, res) => {
  try {
    const service = getService3();
    const { userId, public: isPublic, category, limit, offset } = req.query;
    if (isPublic === "true") {
      const templates = await service.getPublicTemplates(
        limit ? Number(limit) : void 0,
        offset ? Number(offset) : void 0
      );
      return res.json({
        success: true,
        data: templates,
        count: templates.length
      });
    } else if (category) {
      const templates = await service.getTemplatesByCategory(
        category,
        limit ? Number(limit) : void 0,
        offset ? Number(offset) : void 0
      );
      return res.json({
        success: true,
        data: templates,
        count: templates.length
      });
    } else if (userId) {
      const templates = await service.getUserTemplates(
        userId,
        limit ? Number(limit) : void 0,
        offset ? Number(offset) : void 0
      );
      return res.json({
        success: true,
        data: templates,
        count: templates.length
      });
    } else {
      const templates = await service.getAllTemplates(
        limit ? Number(limit) : void 0,
        offset ? Number(offset) : void 0
      );
      return res.json({
        success: true,
        data: templates,
        count: templates.length
      });
    }
  } catch (error) {
    console.error("Error getting prompt templates:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
router4.get("/:id", async (req, res) => {
  try {
    const service = getService3();
    const { id } = req.params;
    const template = await service.getTemplateById(id);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: "Template not found"
      });
    }
    return res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error("Error getting prompt template:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
router4.get("/name/:name", async (req, res) => {
  try {
    const service = getService3();
    const { name } = req.params;
    const template = await service.getTemplateByName(name);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: "Template not found"
      });
    }
    return res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error("Error getting prompt template by name:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
router4.post("/", async (req, res) => {
  try {
    const service = getService3();
    const data = req.body;
    if (!data.name || !data.display_name || !data.template) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: name, display_name, template"
      });
    }
    const template = await service.createTemplate(data);
    return res.status(201).json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error("Error creating prompt template:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
router4.put("/:id", async (req, res) => {
  try {
    const service = getService3();
    const { id } = req.params;
    const data = req.body;
    const template = await service.updateTemplate(id, data);
    return res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error("Error updating prompt template:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
router4.delete("/:id", async (req, res) => {
  try {
    const service = getService3();
    const { id } = req.params;
    await service.deleteTemplate(id);
    return res.json({
      success: true,
      message: "Template deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting prompt template:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
var prompt_template_default = router4;

// src/routes/models.ts
var import_express5 = require("express");
var router5 = (0, import_express5.Router)();
var MODEL_PARAMS = {
  // Text 模型参数
  "gpt-5-nano": {
    parameters: [
      {
        name: "max_completion_tokens",
        type: "number",
        description: "\u6700\u5927\u5B8C\u6210 token \u6570",
        required: false
      },
      {
        name: "temperature",
        type: "number",
        description: "\u6E29\u5EA6\u53C2\u6570 (0-2)",
        required: false,
        default: 0.7,
        range: { min: 0, max: 2 }
      },
      {
        name: "top_p",
        type: "number",
        description: "\u6838\u91C7\u6837 (0-1)",
        required: false,
        range: { min: 0, max: 1 }
      },
      {
        name: "frequency_penalty",
        type: "number",
        description: "\u9891\u7387\u60E9\u7F5A (-2 \u5230 2)",
        required: false,
        range: { min: -2, max: 2 }
      },
      {
        name: "presence_penalty",
        type: "number",
        description: "\u5B58\u5728\u60E9\u7F5A (-2 \u5230 2)",
        required: false,
        range: { min: -2, max: 2 }
      },
      {
        name: "system_prompt",
        type: "string",
        description: "\u7CFB\u7EDF\u63D0\u793A\u8BCD",
        required: false
      },
      {
        name: "image_input",
        type: "array",
        description: "\u8F93\u5165\u56FE\u7247\u6570\u7EC4\uFF08\u591A\u6A21\u6001\uFF09",
        required: false
      }
    ]
  },
  "deepseek-r1": {
    parameters: [
      {
        name: "max_tokens",
        type: "number",
        description: "\u6700\u5927\u8F93\u51FA token \u6570",
        required: false,
        default: 20480
      },
      {
        name: "temperature",
        type: "number",
        description: "\u6E29\u5EA6\u53C2\u6570",
        required: false,
        default: 0.1,
        range: { min: 0, max: 2 }
      },
      {
        name: "presence_penalty",
        type: "number",
        description: "\u5B58\u5728\u60E9\u7F5A",
        required: false,
        default: 0,
        range: { min: -2, max: 2 }
      },
      {
        name: "frequency_penalty",
        type: "number",
        description: "\u9891\u7387\u60E9\u7F5A",
        required: false,
        default: 0,
        range: { min: -2, max: 2 }
      },
      {
        name: "top_p",
        type: "number",
        description: "\u6838\u91C7\u6837\u53C2\u6570",
        required: false,
        default: 1,
        range: { min: 0, max: 1 }
      },
      {
        name: "system_prompt",
        type: "string",
        description: "\u7CFB\u7EDF\u63D0\u793A\u8BCD",
        required: false
      }
    ]
  },
  "gemini-2.5-flash": {
    parameters: [
      {
        name: "temperature",
        type: "number",
        description: "\u6E29\u5EA6\u53C2\u6570",
        required: false,
        default: 0.8,
        range: { min: 0, max: 2 }
      },
      {
        name: "max_tokens",
        type: "number",
        description: "\u6700\u5927\u8F93\u51FA token \u6570",
        required: false,
        default: 1e3
      },
      {
        name: "top_p",
        type: "number",
        description: "\u6838\u91C7\u6837\u53C2\u6570",
        required: false,
        range: { min: 0, max: 1 }
      },
      {
        name: "system_prompt",
        type: "string",
        description: "\u7CFB\u7EDF\u63D0\u793A\u8BCD",
        required: false
      }
    ]
  },
  "claude-4.5-sonnet": {
    parameters: [
      {
        name: "temperature",
        type: "number",
        description: "\u6E29\u5EA6\u53C2\u6570",
        required: false,
        default: 0.7,
        range: { min: 0, max: 2 }
      },
      {
        name: "max_tokens",
        type: "number",
        description: "\u6700\u5927\u8F93\u51FA token \u6570",
        required: false,
        default: 2e3
      },
      {
        name: "system_prompt",
        type: "string",
        description: "\u7CFB\u7EDF\u63D0\u793A\u8BCD",
        required: false
      }
    ]
  },
  "gemini-3-pro": {
    parameters: [
      {
        name: "temperature",
        type: "number",
        description: "\u6E29\u5EA6\u53C2\u6570",
        required: false,
        default: 0.7,
        range: { min: 0, max: 2 }
      },
      {
        name: "max_tokens",
        type: "number",
        description: "\u6700\u5927\u8F93\u51FA token \u6570",
        required: false,
        default: 2e3
      },
      {
        name: "top_p",
        type: "number",
        description: "\u6838\u91C7\u6837\u53C2\u6570",
        required: false,
        range: { min: 0, max: 1 }
      },
      {
        name: "system_prompt",
        type: "string",
        description: "\u7CFB\u7EDF\u63D0\u793A\u8BCD",
        required: false
      }
    ]
  },
  // Image 模型参数
  "nano-banana": {
    parameters: [
      {
        name: "aspect_ratio",
        type: "string",
        description: "\u5BBD\u9AD8\u6BD4",
        required: false,
        default: "1:1",
        enum: ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]
      },
      {
        name: "image_size",
        type: "string",
        description: "\u56FE\u7247\u5C3A\u5BF8",
        required: false,
        default: "1K",
        enum: ["1K", "2K", "4K"]
      },
      {
        name: "image",
        type: "string",
        description: "\u56FE\u7247 URL \u6216 base64\uFF08\u7528\u4E8E\u7F16\u8F91\uFF09",
        required: false
      },
      {
        name: "image_urls",
        type: "array",
        description: "\u591A\u56FE URL \u5217\u8868\uFF08\u7528\u4E8E\u591A\u56FE\u7406\u89E3\uFF09",
        required: false
      },
      {
        name: "image_base64s",
        type: "array",
        description: "\u591A\u56FE base64 \u5217\u8868\uFF08\u7528\u4E8E\u591A\u56FE\u7406\u89E3\uFF09",
        required: false
      },
      {
        name: "enableProgress",
        type: "boolean",
        description: "\u662F\u5426\u542F\u7528\u8FDB\u5EA6\u76D1\u63A7\uFF08\u9ED8\u8BA4 true\uFF09",
        required: false,
        default: true
      }
    ]
  },
  "flux-fast": {
    parameters: [
      {
        name: "aspect_ratio",
        type: "string",
        description: "\u5BBD\u9AD8\u6BD4",
        required: false,
        default: "1:1",
        enum: ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]
      },
      {
        name: "num_outputs",
        type: "number",
        description: "\u8F93\u51FA\u56FE\u7247\u6570\u91CF",
        required: false
      },
      {
        name: "output_format",
        type: "string",
        description: "\u8F93\u51FA\u683C\u5F0F",
        required: false,
        enum: ["png", "jpg", "webp"]
      },
      {
        name: "safety_tolerance",
        type: "number",
        description: "\u5B89\u5168\u5BB9\u5FCD\u5EA6",
        required: false
      }
    ]
  },
  "flux-kontext-fast": {
    parameters: [
      {
        name: "aspect_ratio",
        type: "string",
        description: "\u5BBD\u9AD8\u6BD4",
        required: false,
        default: "1:1",
        enum: ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]
      },
      {
        name: "input_image",
        type: "string",
        description: "\u8F93\u5165\u56FE\u7247 URL \u6216 base64\uFF08\u7528\u4E8E\u7F16\u8F91\uFF09",
        required: false
      },
      {
        name: "num_outputs",
        type: "number",
        description: "\u751F\u6210\u56FE\u7247\u6570\u91CF",
        required: false
      },
      {
        name: "output_format",
        type: "string",
        description: "\u8F93\u51FA\u683C\u5F0F",
        required: false,
        enum: ["png", "jpg", "webp"]
      },
      {
        name: "safety_tolerance",
        type: "number",
        description: "\u5B89\u5168\u8FC7\u6EE4\u7EA7\u522B",
        required: false
      }
    ]
  },
  "ideogram-v2a": {
    parameters: [
      {
        name: "aspect_ratio",
        type: "string",
        description: "\u5BBD\u9AD8\u6BD4",
        required: false,
        default: "1:1",
        enum: ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]
      },
      {
        name: "resolution",
        type: "string",
        description: "\u5206\u8FA8\u7387\uFF08Auto \u6216\u5176\u4ED6\uFF09",
        required: false,
        default: "Auto"
      },
      {
        name: "turbo",
        type: "boolean",
        description: "\u662F\u5426\u4F7F\u7528\u5FEB\u901F\u6A21\u5F0F",
        required: false,
        default: false
      },
      {
        name: "magic_prompt_option",
        type: "string",
        description: "Magic Prompt \u9009\u9879",
        required: false,
        enum: ["AUTO", "ON", "OFF"]
      },
      {
        name: "seed",
        type: "number",
        description: "\u968F\u673A\u79CD\u5B50 (0-2147483647)",
        required: false,
        range: { min: 0, max: 2147483647 }
      },
      {
        name: "style_type",
        type: "string",
        description: "\u98CE\u683C\u7C7B\u578B",
        required: false,
        enum: ["None", "Auto", "General", "Realistic", "Design", "Render 3D", "Anime"]
      },
      {
        name: "num_images",
        type: "number",
        description: "\u751F\u6210\u56FE\u7247\u6570\u91CF (1-8)",
        required: false,
        range: { min: 1, max: 8 }
      },
      {
        name: "negative_prompt",
        type: "string",
        description: "\u8D1F\u9762\u63D0\u793A\u8BCD",
        required: false
      }
    ]
  },
  "recraft-crisp-upscale": {
    parameters: [
      {
        name: "image_size",
        type: "string",
        description: "\u56FE\u7247\u5C3A\u5BF8",
        required: false,
        enum: ["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"]
      },
      {
        name: "style",
        type: "string",
        description: "\u98CE\u683C\u7C7B\u578B",
        required: false,
        enum: ["realistic_image", "digital_illustration", "vector_illustration", "realistic_image/b_and_w", "digital_illustration/pixel_art", "vector_illustration/line_art"]
      },
      {
        name: "colors",
        type: "array",
        description: "\u989C\u8272\u7EA6\u675F\u6570\u7EC4",
        required: false
      },
      {
        name: "num_images",
        type: "number",
        description: "\u751F\u6210\u56FE\u7247\u6570\u91CF",
        required: false
      },
      {
        name: "input_image",
        type: "string",
        description: "\u8F93\u5165\u56FE\u7247 URL \u6216 base64\uFF08\u7528\u4E8E\u7F16\u8F91\u6216\u653E\u5927\uFF09",
        required: false
      }
    ]
  },
  "seedream-4": {
    parameters: [
      {
        name: "size",
        type: "string",
        description: "\u56FE\u7247\u5C3A\u5BF8",
        required: false,
        enum: ["1K", "2K", "4K", "custom"]
      },
      {
        name: "aspect_ratio",
        type: "string",
        description: "\u5BBD\u9AD8\u6BD4\uFF08\u9ED8\u8BA4 match_input_image\uFF09",
        required: false,
        default: "match_input_image"
      },
      {
        name: "width",
        type: "number",
        description: "\u81EA\u5B9A\u4E49\u5BBD\u5EA6\uFF081024-4096\uFF09\uFF0C\u5F53 size=custom \u65F6\u4F7F\u7528",
        required: false,
        range: { min: 1024, max: 4096 }
      },
      {
        name: "height",
        type: "number",
        description: "\u81EA\u5B9A\u4E49\u9AD8\u5EA6\uFF081024-4096\uFF09\uFF0C\u5F53 size=custom \u65F6\u4F7F\u7528",
        required: false,
        range: { min: 1024, max: 4096 }
      },
      {
        name: "image_input",
        type: "array",
        description: "\u8F93\u5165\u56FE\u7247\u6570\u7EC4\uFF081-10\u5F20\uFF09\uFF0C\u7528\u4E8E\u56FE\u7247\u7F16\u8F91\u6216\u591A\u53C2\u8003\u751F\u6210",
        required: false
      },
      {
        name: "sequential_image_generation",
        type: "string",
        description: "\u662F\u5426\u542F\u7528\u5E8F\u5217\u56FE\u7247\u751F\u6210",
        required: false,
        enum: ["disabled", "auto"]
      },
      {
        name: "max_images",
        type: "number",
        description: "\u6700\u5927\u751F\u6210\u56FE\u7247\u6570\uFF081-15\uFF09\uFF0C\u5F53 sequential_image_generation=auto \u65F6\u4F7F\u7528",
        required: false,
        range: { min: 1, max: 15 }
      },
      {
        name: "negative_prompt",
        type: "string",
        description: "\u8D1F\u9762\u63D0\u793A\u8BCD",
        required: false
      }
    ]
  }
};
router5.get("/", async (req, res) => {
  try {
    const { type } = req.query;
    let models;
    if (type) {
      models = getModelsByType(type);
    } else {
      models = Object.values(MODEL_REGISTRY);
    }
    const modelsWithParams = models.map((model) => {
      const params = MODEL_PARAMS[model.name] || { parameters: [] };
      return {
        name: model.name,
        display_name: model.displayName,
        description: model.description,
        type: model.modelType,
        supported_providers: model.supportedProviders || [],
        default_params: model.defaultParams || {},
        parameters: params.parameters
      };
    });
    return res.json({
      success: true,
      data: modelsWithParams,
      count: modelsWithParams.length
    });
  } catch (error) {
    console.error("Error getting models:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
router5.get("/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const modelInfo = getModelInfo(name);
    if (!modelInfo) {
      return res.status(404).json({
        success: false,
        error: "Model not found"
      });
    }
    const params = MODEL_PARAMS[name] || { parameters: [] };
    return res.json({
      success: true,
      data: {
        name: modelInfo.name,
        display_name: modelInfo.displayName,
        description: modelInfo.description,
        type: modelInfo.modelType,
        supported_providers: modelInfo.supportedProviders || [],
        default_params: modelInfo.defaultParams || {},
        parameters: params.parameters
      }
    });
  } catch (error) {
    console.error("Error getting model:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
router5.get("/types/list", async (req, res) => {
  try {
    const types = ["text", "image", "video", "sound", "embedding"];
    const typesWithModels = types.map((type) => {
      const models = getModelsByType(type);
      return {
        type,
        count: models.length,
        models: models.map((m) => ({
          name: m.name,
          display_name: m.displayName
        }))
      };
    });
    return res.json({
      success: true,
      data: typesWithModels
    });
  } catch (error) {
    console.error("Error getting model types:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
var models_default = router5;

// src/index.ts
process.env.DOTENV_CONFIG_DEBUG = "false";
import_dotenv.default.config({ path: (0, import_path.resolve)(__dirname, "../../.env") });
import_dotenv.default.config();
var app = (0, import_express6.default)();
var port = process.env.PORT ? Number(process.env.PORT) : 4004;
app.use(import_express6.default.json({
  strict: false,
  // 允许非数组/对象的 JSON
  verify: (req, res, buf) => {
    if (buf.length === 0) {
      req.body = {};
    }
  }
}));
app.use("/", health_default);
app.use("/api/v1/smartflows", smartflow_default);
app.use("/api/v1/tasks", task_default);
app.use("/api/v1/prompt-templates", prompt_template_default);
app.use("/api/v1/models", models_default);
app.listen(port, () => {
  console.log("mxmagent service listening on port " + port);
});
//# sourceMappingURL=index.js.map