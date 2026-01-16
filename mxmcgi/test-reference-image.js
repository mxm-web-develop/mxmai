/**
 * 测试参考图上传功能
 * 使用 nvhai.png 作为 main-subject，beijing.png 作为 background
 * 
 * 使用方法：
 *   node test-reference-image.js
 * 
 * 参数调整：
 *   1. CONFIG 区域：调整 API 地址、Token、用户 ID、图片路径
 *   2. requestData 区域：调整所有业务参数（type, prompt, style, tone 等）
 *   3. 参考图：在 referenceImage 数组中添加或修改参考图
 * 
 * 获取可用选项：
 *   curl http://localhost:3000/api/v1/cgi/graph/getformOptions?photograph
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ========== 配置区域 ==========
// 在这里调整所有配置参数
const CONFIG = {
  // API 地址
  url: 'http://localhost:3000/api/v1/cgi/graph/photograph',
  
  // 认证 Token（需要有效的 JWT token）
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIzZjZjZjBkNy0xYWM1LTQ0ZWItODM1Yi01YTU5ZWM5NzM5MDkiLCJ1c2VybmFtZSI6Im14bW1vYmlsZSIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3Njg0NDA4ODIsImV4cCI6MTc2ODQ5ODQ4Mn0.LMfQsadF1wQnlxAKinx1hIB9_aO9yEQArC1XLSva9dE',
  
  // 用户 ID
  userId: '3f6cf0d7-1ac5-44eb-835b-5a59ec973909',
  
  // 参考图文件路径
  nvhaiPath: path.join(__dirname, 'nvhai.jpg'),      // 主体参考图
  beijingPath: path.join(__dirname, 'beijing.png'),  // 背景参考图
};

// 读取图片并转换为 base64
function readImageAsBase64(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).slice(1).toLowerCase();
    return `data:image/${ext};base64,${base64}`;
  } catch (error) {
    console.error(`读取图片失败 ${imagePath}:`, error.message);
    throw error;
  }
}

// 发送请求
function sendRequest(data) {
  return new Promise((resolve, reject) => {
    const url = new URL(CONFIG.url);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${CONFIG.token}`,
        'x-user-id': CONFIG.userId,
      },
    };

    console.log(`\n发送请求到: ${CONFIG.url}`);
    console.log(`请求大小: ${(Buffer.byteLength(postData) / 1024 / 1024).toFixed(2)} MB`);
    console.log(`参考图数量: ${data.referenceImage.length}`);
    console.log(`  - ${data.referenceImage[0].type}: ${(data.referenceImage[0].content.length / 1024).toFixed(2)} KB`);
    console.log(`  - ${data.referenceImage[1].type}: ${(data.referenceImage[1].content.length / 1024).toFixed(2)} KB`);
    console.log('');

    const req = client.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// 主函数
async function main() {
  try {
    // 检查图片文件是否存在
    if (!fs.existsSync(CONFIG.nvhaiPath)) {
      throw new Error(`找不到文件: ${CONFIG.nvhaiPath}`);
    }
    if (!fs.existsSync(CONFIG.beijingPath)) {
      throw new Error(`找不到文件: ${CONFIG.beijingPath}`);
    }

    console.log('正在读取图片文件...');
    const nvhaiBase64 = readImageAsBase64(CONFIG.nvhaiPath);
    const beijingBase64 = readImageAsBase64(CONFIG.beijingPath);
    console.log('✓ 图片读取完成\n');

    // ========== 请求参数配置 ==========
    // 可以在这里调整所有参数
    const requestData = {
      // ========== 必需参数 ==========
      type: 'portrait',        // 类型：'portrait' | 'landscape' | 'cinematic' | 'commercial' | 'documentary'
      prompt: '九宫格图片，室内写真，每格图片中包含人物使用不同的动作和镜头构图，不要过度虚化背景',          // 用户需求描述
      
      // ========== Portrait 相关参数（可选）==========
      // 提示：可以通过 GET /api/v1/cgi/graph/getformOptions?photograph 获取所有可用选项
      style: 'modern',         // 风格：'modern' | 'vintage' | 'fashion' | 'classic' | 'minimalist' | 等
      tone: 'high-contrast',            // 色调：'warm' | 'cool' | 'high-contrast' | 'soft' | 'vibrant' | 等
      environment: 'indoor',   // 环境：'indoor' | 'outdoor' | 'studio' | 'urban' | 'nature' | 等
      makeup: 'natural',       // 妆容：'natural' | 'heavy' | 'light' | 'glamour' | 'editorial' | 等
      pose: 'dynamic',       // 姿势：'standing' | 'sitting' | 'lying' | 'walking' | 'dynamic' | 等
      lighting: 'rim',        // 光线：'soft' | 'hard' | 'natural' | 'dramatic' | 'rim' | 等
      
      // ========== 通用参数 ==========
      quality: 'high',         // 质量：'high' (nano-banana) | 'fast' (seedream-4)
      aspect_ratio: '9:16',    // 宽高比：'16:9' | '9:16' | '1:1' | '4:3' | '3:4' | 等
      
      // ========== 参考图（新格式）==========
      // 参考图类型：
      //   - 'main-subject': 主体（人物、物体等，保持完全一致）
      //   - 'background': 背景场景和光线
      //   - 'outfits': 服装、道具、次要角色
      //   - 'color-reference': 风格和色彩参考
      referenceImage: [
        {
          content: nvhaiBase64,
          type: 'main-subject',    // 主体参考图
        },
        {
          content: beijingBase64,
          type: 'background',     // 背景参考图
        },
        // 可以添加更多参考图，例如：
        // {
        //   content: 'data:image/png;base64,...',
        //   type: 'color-reference',  // 色彩参考
        // },
        // {
        //   content: 'https://example.com/image.jpg',  // 也支持 URL
        //   type: 'outfits',  // 服装参考
        // },
      ],
      
      // ========== 其他可选参数 ==========
      // storeToMinio: true,        // 是否存储到 MinIO（默认 true）
      // storageConfig: {            // 存储配置（可选，覆盖默认配置）
      //   bucket: 'user-media',
      //   pathTemplate: '{userId}/graph/photograph/{timestamp}-{randomId}.{ext}',
      // },
    };

    // 发送请求
    console.log('正在发送请求...');
    const response = await sendRequest(requestData);

    console.log(`\n响应状态码: ${response.status}`);
    console.log('响应内容:');
    console.log(JSON.stringify(response.data, null, 2));

    if (response.status === 200 || response.status === 201) {
      if (response.data.success && response.data.data?.taskId) {
        console.log(`\n✅ 任务创建成功！`);
        console.log(`任务ID: ${response.data.data.taskId}`);
        console.log(`\n查询任务状态: curl http://localhost:3000/api/v1/cgi/tasks/${response.data.data.taskId} -H "Authorization: Bearer ${CONFIG.token}"`);
      }
    } else {
      console.log(`\n❌ 请求失败 (状态码: ${response.status})`);
    }
  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
