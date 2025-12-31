# Gemini API 图片生成完整笔记

> 基于官方文档整理：https://ai.google.dev/gemini-api/docs/image-generation?hl=zh-cn

## 📋 目录

1. [概述](#概述)
2. [模型选择](#模型选择)
3. [核心功能](#核心功能)
4. [基本用法](#基本用法)
5. [高级功能](#高级功能)
6. [配置选项](#配置选项)
7. [提示词指南](#提示词指南)
8. [最佳实践](#最佳实践)
9. [限制和注意事项](#限制和注意事项)
10. [代码示例](#代码示例)

---

## 概述

Gemini 可以通过对话方式生成和处理图片。支持：
- **文本到图片**：根据文本描述生成高质量图片
- **图片到图片**：使用文本提示编辑和调整指定图片
- **多张图片到图片**：使用多张输入图片合成新场景并转移风格
- **迭代优化**：通过多轮对话优化图片
- **高保真文本呈现**：准确生成包含清晰易读文本的图片

**重要**：所有生成的图片都包含 SynthID 水印。

---

## 模型选择

### Gemini 3 Pro Image Preview (Nano Banana Pro)
- **定位**：专业素材资源制作和复杂指令
- **特点**：
  - 使用 Google 搜索进行现实世界知识的接地
  - 默认的"思考"过程（在生成之前优化构图）
  - 能够生成分辨率高达 4K 的图像
  - 最多支持 14 张参考图片（6 张高保真对象 + 5 张人像 + 其他）
- **推荐场景**：需要高质量、复杂编辑、多轮对话的场景

### Gemini 2.5 Flash Image (Nano Banana)
- **定位**：快速高效的体验
- **特点**：
  - 优化用于大批量、低延迟任务
  - 生成 1024 像素分辨率的图片
  - 最多支持 3 张图片作为输入
- **推荐场景**：需要快速生成、批量处理的场景

### 与 Imagen 的对比

| 属性 | Imagen | Gemini 原生图片 |
|------|--------|----------------|
| **优势** | 模型擅长生成图片 | 无与伦比的灵活性、情境理解能力，简单易用的无蒙版修改功能，多轮对话式编辑 |
| **可用性** | 已全面推出 | 预览版（允许用于生产环境） |
| **延迟时间** | **低**：针对近乎实时的性能进行了优化 | 提高。其高级功能需要更多计算资源 |
| **费用** | 可经济高效地完成专业任务。$0.02/图片到 $0.12/图片 | 基于 token 的定价。图片输出每 100 万个 token 的费用为 30 美元 |
| **推荐任务** | 图片质量、写实度、艺术细节或特定风格是首要考虑因素 | 生成交织的文本和图片，组合多张图片中的创意元素，高度精细的编辑 |

---

## 核心功能

### 1. 文本到图片生成
根据文本描述生成图片。

### 2. 图片修改（文字和图片转图片）
提供图片，然后使用文本提示：
- 添加、移除或修改元素
- 更改样式
- 调整色彩分级

### 3. 多轮图片修改
通过对话方式迭代生成和修改图片。

### 4. 多张参考图片合成
- Gemini 2.5 Flash：最多 3 张图片
- Gemini 3 Pro：最多 14 张图片（6 张高保真对象 + 5 张人像）

### 5. 使用 Google 搜索建立依据
根据实时信息（天气预报、股市图表、近期活动）生成图片。

### 6. 高分辨率输出
- Gemini 3 Pro：支持 1K、2K、4K
- Gemini 2.5 Flash：固定 1024x1024

### 7. 思考过程
Gemini 3 Pro 是思考型模型，会使用推理流程处理复杂提示。可以查看促成最终图片生成的想法。

---

## 基本用法

### JavaScript 基础示例

```javascript
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

async function main() {
  const ai = new GoogleGenAI({});

  const prompt = "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme";

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: prompt,
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.text) {
      console.log(part.text);
    } else if (part.inlineData) {
      const imageData = part.inlineData.data;
      const buffer = Buffer.from(imageData, "base64");
      fs.writeFileSync("generated_image.png", buffer);
      console.log("Image saved as generated_image.png");
    }
  }
}

main();
```

### 图片编辑示例

```javascript
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

async function main() {
  const ai = new GoogleGenAI({});

  const imagePath = "path/to/cat_image.png";
  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString("base64");

  const prompt = [
    { 
      text: "Create a picture of my cat eating a nano-banana in a fancy restaurant under the Gemini constellation" 
    },
    {
      inlineData: {
        mimeType: "image/png",
        data: base64Image,
      },
    },
  ];

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: prompt,
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.text) {
      console.log(part.text);
    } else if (part.inlineData) {
      const imageData = part.inlineData.data;
      const buffer = Buffer.from(imageData, "base64");
      fs.writeFileSync("edited_image.png", buffer);
      console.log("Image saved as edited_image.png");
    }
  }
}

main();
```

### 多轮对话示例

```javascript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});

async function main() {
  const chat = ai.chats.create({
    model: "gemini-3-pro-image-preview",
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      tools: [{googleSearch: {}}],
    },
  });

  // 第一轮：生成初始图片
  let response = await chat.sendMessage({
    message: "Create a vibrant infographic that explains photosynthesis as if it were a recipe for a plant's favorite food."
  });

  // 处理响应...
  
  // 第二轮：修改图片
  const message = 'Update this infographic to be in Spanish. Do not change any other elements of the image.';
  const aspectRatio = '16:9';
  const resolution = '2K';

  response = await chat.sendMessage({
    message,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: resolution,
      },
      tools: [{googleSearch: {}}],
    },
  });
}

main();
```

---

## 高级功能

### 1. 多张参考图片（最多 14 张）

```javascript
const contents = [
  { text: "An office group photo of these people, they are making funny faces." },
  { inlineData: { mimeType: "image/jpeg", data: base64ImageFile1 } },
  { inlineData: { mimeType: "image/jpeg", data: base64ImageFile2 } },
  { inlineData: { mimeType: "image/jpeg", data: base64ImageFile3 } },
  { inlineData: { mimeType: "image/jpeg", data: base64ImageFile4 } },
  { inlineData: { mimeType: "image/jpeg", data: base64ImageFile5 } }
];

const response = await ai.models.generateContent({
  model: 'gemini-3-pro-image-preview',
  contents: contents,
  config: {
    responseModalities: ['TEXT', 'IMAGE'],
    imageConfig: {
      aspectRatio: '5:4',
      imageSize: '2K',
    },
  },
});
```

### 2. 使用 Google 搜索建立依据

```javascript
const response = await ai.models.generateContent({
  model: 'gemini-3-pro-image-preview',
  contents: "Visualize the current weather forecast for the next 5 days in San Francisco as a clean, modern weather chart.",
  config: {
    responseModalities: ['TEXT', 'IMAGE'],
    imageConfig: {
      aspectRatio: '16:9',
    },
    tools: [{"google_search": {}}],
  },
});
```

**注意**：将"依托 Google 搜索进行接地"与图片生成功能搭配使用时，基于图片的搜索结果不会传递给生成模型，并且会从回答中排除。

响应包含 `groundingMetadata`，其中包含：
- `searchEntryPoint`：包含用于呈现所需搜索建议的 HTML 和 CSS
- `groundingChunks`：返回用于为生成的图片提供依据的前 3 个网络来源

### 3. 思考过程

```javascript
for (const part of response.candidates[0].content.parts) {
  if (part.thought) {
    if (part.text) {
      console.log(part.text);
    } else if (part.inlineData) {
      const imageData = part.inlineData.data;
      const buffer = Buffer.from(imageData, 'base64');
      fs.writeFileSync('thought_image.png', buffer);
    }
  }
}
```

### 4. 思路签名（Thought Signature）

思考特征是模型内部思考过程的加密表示形式，用于在多轮互动中保留推理上下文。

**重要**：
- 所有响应都包含 `thought_signature` 字段
- 如果在模型响应中收到思考特征，应在下一轮对话中发送对话历史记录时，按原样将其传递回去
- 未能循环使用思维签名可能会导致回答失败
- **如果使用官方 Google Gen AI SDK 并使用聊天功能，系统会自动处理思路签名**

---

## 配置选项

### 输出类型

默认返回文本和图片响应。可以配置为仅返回图片：

```javascript
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash-image",
  contents: prompt,
  config: {
    responseModalities: ['Image']  // 仅返回图片
  }
});
```

### 宽高比和图片大小

#### Gemini 2.5 Flash Image 支持的宽高比

| 宽高比 | 分辨率 | 令牌 |
|--------|--------|------|
| 1:1 | 1024x1024 | 1290 |
| 2:3 | 832x1248 | 1290 |
| 3:2 | 1248x832 | 1290 |
| 3:4 | 864x1184 | 1290 |
| 4:3 | 1184x864 | 1290 |
| 4:5 | 896x1152 | 1290 |
| 5:4 | 1152x896 | 1290 |
| 9:16 | 768x1344 | 1290 |
| 16:9 | 1344x768 | 1290 |
| 21:9 | 1536x672 | 1290 |

#### Gemini 3 Pro Image 支持的宽高比和分辨率

| 宽高比 | 1K 分辨率 | 1K 令牌 | 2K 分辨率 | 2K 令牌 | 4K 分辨率 | 4K 令牌 |
|--------|-----------|--------|-----------|---------|-----------|---------|
| 1:1 | 1024x1024 | 1210 | 2048x2048 | 1210 | 4096x4096 | 2000 |
| 2:3 | 848x1264 | 1210 | 1696x2528 | 1210 | 3392x5056 | 2000 |
| 3:2 | 1264x848 | 1210 | 2528x1696 | 1210 | 5056x3392 | 2000 |
| 3:4 | 896x1200 | 1210 | 1792x2400 | 1210 | 3584x4800 | 2000 |
| 4:3 | 1200x896 | 1210 | 2400x1792 | 1210 | 4800x3584 | 2000 |
| 4:5 | 928x1152 | 1210 | 1856x2304 | 1210 | 3712x4608 | 2000 |
| 5:4 | 1152x928 | 1210 | 2304x1856 | 1210 | 4608x3712 | 2000 |
| 9:16 | 768x1376 | 1210 | 1536x2752 | 1210 | 3072x5504 | 2000 |
| 16:9 | 1376x768 | 1210 | 2752x1536 | 1210 | 5504x3072 | 2000 |
| 21:9 | 1584x672 | 1210 | 3168x1344 | 1210 | 6336x2688 | 2000 |

**注意**：必须使用大写"K"（例如，1K、2K、4K）。小写参数（例如，1k）将被拒绝。

#### 配置示例

```javascript
// Gemini 2.5 Flash
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash-image",
  contents: prompt,
  config: {
    imageConfig: {
      aspectRatio: "16:9",
    },
  }
});

// Gemini 3 Pro
const response = await ai.models.generateContent({
  model: "gemini-3-pro-image-preview",
  contents: prompt,
  config: {
    imageConfig: {
      aspectRatio: "16:9",
      imageSize: "2K",  // 1K, 2K, 4K
    },
  }
});
```

---

## 提示词指南

### 核心原则

> **描述场景，而不仅仅是列出关键字。**该模型的核心优势在于其深厚的语言理解能力。与一连串不相关的字词相比，叙述性描述段落几乎总是能生成更好、更连贯的图片。

### 提示词策略

#### 1. 逼真场景

使用摄影术语：拍摄角度、镜头类型、光线和细节。

**模板**：
```
A photorealistic [shot type] of [subject], [action or expression], set in
[environment]. The scene is illuminated by [lighting description], creating
a [mood] atmosphere. Captured with a [camera/lens details], emphasizing
[key textures and details]. The image should be in a [aspect ratio] format.
```

**示例**：
```
A photorealistic close-up portrait of an elderly Japanese ceramicist with
deep, sun-etched wrinkles and a warm, knowing smile. He is carefully
inspecting a freshly glazed tea bowl. The setting is his rustic,
sun-drenched workshop. The scene is illuminated by soft, golden hour light
streaming through a window, highlighting the fine texture of the clay.
Captured with an 85mm portrait lens, resulting in a soft, blurred background
(bokeh). The overall mood is serene and masterful. Vertical portrait
orientation.
```

#### 2. 风格化插画和贴纸

明确说明样式并要求使用透明背景。

**模板**：
```
A [style] sticker of a [subject], featuring [key characteristics] and a
[color palette]. The design should have [line style] and [shading style].
The background must be transparent.
```

#### 3. 图片中的文字准确无误

清楚说明文字、字体样式（描述性）和整体设计。

**模板**：
```
Create a [image type] for [brand/concept] with the text "[text to render]"
in a [font style]. The design should be [style description], with a
[color scheme].
```

#### 4. 产品模型和商业摄影

**模板**：
```
A high-resolution, studio-lit product photograph of a [product description]
on a [background surface/description]. The lighting is a [lighting setup,
e.g., three-point softbox setup] to [lighting purpose]. The camera angle is
a [angle type] to showcase [specific feature]. Ultra-realistic, with sharp
focus on [key detail]. [Aspect ratio].
```

#### 5. 极简风格和负空间设计

**模板**：
```
A minimalist composition featuring a single [subject] positioned in the
[bottom-right/top-left/etc.] of the frame. The background is a vast, empty
[color] canvas, creating significant negative space. Soft, subtle lighting.
[Aspect ratio].
```

#### 6. 连续艺术（漫画分格 / 故事板）

**模板**：
```
Make a 3 panel comic in a [style]. Put the character in a [type of scene].
```

### 图片修改提示词策略

#### 1. 添加和移除元素

**模板**：
```
Using the provided image of [subject], please [add/remove/modify] [element]
to/from the scene. Ensure the change is [description of how the change should
integrate].
```

#### 2. 局部重绘（语义遮盖）

**模板**：
```
Using the provided image, change only the [specific element] to [new
element/description]. Keep everything else in the image exactly the same,
preserving the original style, lighting, and composition.
```

#### 3. 风格迁移

**模板**：
```
Transform the provided photograph of [subject] into the artistic style of [artist/art style]. Preserve the original composition but render it with [description of stylistic elements].
```

#### 4. 高级合成：组合多张图片

**模板**：
```
Create a new image by combining the elements from the provided images. Take
the [element from image 1] and place it with/on the [element from image 2].
The final image should be a [description of the final scene].
```

#### 5. 高保真细节保留

**模板**：
```
Using the provided images, place [element from image 2] onto [element from
image 1]. Ensure that the features of [element from image 1] remain
completely unchanged. The added element should [description of how the
element should integrate].
```

#### 6. 让事物焕发活力

**模板**：
```
Turn this rough [medium] sketch of a [subject] into a [style description]
photo. Keep the [specific features] from the sketch but add [new details/materials].
```

#### 7. 字符一致性：360 度全景

**模板**：
```
A studio portrait of [person] against [background], [looking forward/in profile looking right/etc.]
```

---

## 最佳实践

### 1. 具体化
提供的信息越详细，对输出结果的掌控程度就越高。

❌ 不好：`"奇幻盔甲"`
✅ 好：`"华丽的精灵板甲，蚀刻着银叶图案，带有高领和猎鹰翅膀形状的肩甲。"`

### 2. 提供上下文和意图
说明图片的**用途**。模型对上下文的理解会影响最终输出。

❌ 不好：`"设计徽标"`
✅ 好：`"为高端极简护肤品牌设计徽标"`

### 3. 迭代和优化
不要指望第一次尝试就能生成完美的图片。利用模型的对话特性进行小幅更改。

示例：
- `"这很棒，但你能让光线更暖一些吗？"`
- `"保持所有内容不变，但让角色的表情更严肃一些。"`

### 4. 使用分步指令
对于包含许多元素的复杂场景，将提示拆分为多个步骤。

示例：
```
"首先，创建一个宁静、薄雾弥漫的黎明森林的背景。
然后，在前景中添加一个长满苔藓的古老石制祭坛。
最后，将一把发光的剑放在祭坛顶部。"
```

### 5. 使用"语义负面提示"
不要说"没有汽车"，而是通过正面描述所需的场景。

❌ 不好：`"没有汽车的街道"`
✅ 好：`"一条没有交通迹象的空旷、荒凉的街道"`

### 6. 控制镜头
使用摄影和电影语言来控制构图。

示例：
- `wide-angle shot`（广角镜头）
- `macro shot`（微距镜头）
- `low-angle perspective`（低角度透视）
- `bird's eye view`（鸟瞰图）

### 7. 为图片生成文字时的最佳实践
最好先生成文字，然后再要求生成包含该文字的图片，这样 Gemini 的效果最好。

---

## 限制和注意事项

### 语言支持
为获得最佳性能，请使用以下语言：
- 英语
- 阿拉伯语（埃及）
- 德语（德国）
- 西班牙语（墨西哥）
- 法语（法国）
- 印地语（印度）
- 印度尼西亚语（印度尼西亚）
- 意大利语（意大利）
- 日语（日本）
- 韩语（韩国）
- 葡萄牙语（巴西）
- 俄语（俄罗斯）
- 乌克兰语（乌克兰）
- 越南语（越南）
- 中文（中国）

### 功能限制
- 图片生成不支持音频或视频输入
- 模型不一定会严格按照用户明确要求的图片输出数量来生成图片
- `gemini-2.5-flash-image` 最多可接受 3 张图片作为输入
- `gemini-3-pro-image-preview` 支持 5 张高保真图片，总共最多可接受 14 张图片
- 所有生成的图片都包含 SynthID 水印

### 图片输入限制
- 支持 base64 编码的图片
- 支持多种 MIME 类型（image/png, image/jpeg 等）
- 对于多张图片，请参阅图片理解页面了解更大的载荷和支持的 MIME 类型

---

## 代码示例

### 完整示例：文本到图片

```javascript
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

async function generateImageFromText() {
  const ai = new GoogleGenAI({});

  const prompt = "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme";

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: prompt,
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.text) {
      console.log(part.text);
    } else if (part.inlineData) {
      const imageData = part.inlineData.data;
      const buffer = Buffer.from(imageData, "base64");
      fs.writeFileSync("generated_image.png", buffer);
      console.log("Image saved as generated_image.png");
    }
  }
}

generateImageFromText();
```

### 完整示例：图片编辑

```javascript
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

async function editImage() {
  const ai = new GoogleGenAI({});

  const imagePath = "path/to/cat_image.png";
  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString("base64");

  const prompt = [
    { 
      text: "Using the provided image of my cat, please add a small, knitted wizard hat on its head. Make it look like it's sitting comfortably and not falling off." 
    },
    {
      inlineData: {
        mimeType: "image/png",
        data: base64Image,
      },
    },
  ];

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: prompt,
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.text) {
      console.log(part.text);
    } else if (part.inlineData) {
      const imageData = part.inlineData.data;
      const buffer = Buffer.from(imageData, "base64");
      fs.writeFileSync("cat_with_hat.png", buffer);
      console.log("Image saved as cat_with_hat.png");
    }
  }
}

editImage();
```

### 完整示例：高分辨率生成（Gemini 3 Pro）

```javascript
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

async function generateHighResImage() {
  const ai = new GoogleGenAI({});

  const prompt = 'Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English.';
  const aspectRatio = '1:1';
  const resolution = '4K';  // 1K, 2K, 4K

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: prompt,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: resolution,
      },
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.text) {
      console.log(part.text);
    } else if (part.inlineData) {
      const imageData = part.inlineData.data;
      const buffer = Buffer.from(imageData, "base64");
      fs.writeFileSync("high_res_image.png", buffer);
      console.log("High resolution image saved");
    }
  }
}

generateHighResImage();
```

### 完整示例：使用 Google 搜索

```javascript
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

async function generateWithSearch() {
  const ai = new GoogleGenAI({});

  const prompt = "Visualize the current weather forecast for the next 5 days in San Francisco as a clean, modern weather chart. Add a visual on what I should wear each day";
  const aspectRatio = '16:9';

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: prompt,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: aspectRatio,
      },
      tools: [{"google_search": {}}],
    },
  });

  // 处理响应
  for (const part of response.candidates[0].content.parts) {
    if (part.text) {
      console.log(part.text);
    } else if (part.inlineData) {
      const imageData = part.inlineData.data;
      const buffer = Buffer.from(imageData, "base64");
      fs.writeFileSync("weather_chart.png", buffer);
      console.log("Weather chart saved");
    }
  }

  // 访问 groundingMetadata
  if (response.groundingMetadata) {
    console.log("Search entry point:", response.groundingMetadata.searchEntryPoint);
    console.log("Grounding chunks:", response.groundingMetadata.groundingChunks);
  }
}

generateWithSearch();
```

### 完整示例：多轮对话编辑

```javascript
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

async function multiTurnEditing() {
  const ai = new GoogleGenAI({});

  // 创建聊天会话
  const chat = ai.chats.create({
    model: "gemini-3-pro-image-preview",
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      tools: [{googleSearch: {}}],
    },
  });

  // 第一轮：生成初始图片
  let response = await chat.sendMessage({
    message: "Create a vibrant infographic that explains photosynthesis as if it were a recipe for a plant's favorite food. Show the \"ingredients\" (sunlight, water, CO2) and the \"finished dish\" (sugar/energy). The style should be like a page from a colorful kids' cookbook, suitable for a 4th grader."
  });

  // 保存第一张图片
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      const imageData = part.inlineData.data;
      const buffer = Buffer.from(imageData, "base64");
      fs.writeFileSync("photosynthesis.png", buffer);
      console.log("Initial image saved");
    }
  }

  // 第二轮：修改图片
  const message = 'Update this infographic to be in Spanish. Do not change any other elements of the image.';
  const aspectRatio = '16:9';
  const resolution = '2K';

  response = await chat.sendMessage({
    message,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: resolution,
      },
      tools: [{googleSearch: {}}],
    },
  });

  // 保存修改后的图片
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      const imageData = part.inlineData.data;
      const buffer = Buffer.from(imageData, "base64");
      fs.writeFileSync("photosynthesis_spanish.png", buffer);
      console.log("Updated image saved");
    }
  }
}

multiTurnEditing();
```

---

## 总结

### 关键要点

1. **模型选择**：
   - 快速批量：Gemini 2.5 Flash Image
   - 高质量复杂任务：Gemini 3 Pro Image Preview

2. **核心优势**：
   - 对话式图片生成和编辑
   - 无需蒙版的图片修改
   - 多轮迭代优化
   - 高保真文本渲染

3. **最佳实践**：
   - 使用叙述性描述而非关键字列表
   - 提供上下文和意图
   - 迭代优化而非一次性完美
   - 使用摄影和电影术语控制构图

4. **注意事项**：
   - 所有图片包含 SynthID 水印
   - 支持的语言有限
   - 图片输入数量有限制
   - 使用官方 SDK 可自动处理思路签名

### 参考资源

- 官方文档：https://ai.google.dev/gemini-api/docs/image-generation?hl=zh-cn
- API 参考：https://ai.google.dev/gemini-api/docs
- 获取 API 密钥：https://ai.google.dev/gemini-api/docs/api-key

---

*最后更新时间：2025-01-27*
