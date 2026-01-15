# 系统知识库文档收集指南

## 目录结构

```
systemKnowledge/
├── graph-photograph-portrait/     # 人像摄影知识库
├── graph-photograph-landscape/    # 风景摄影知识库
├── graph-photograph-cinematic/    # 电影画面知识库
├── graph-photograph-commercial/   # 产品商业拍摄知识库
├── graph-photograph-documentary/  # 纪事摄影知识库
├── graph-design-3d/               # 3D设计知识库
├── graph-design-manual/           # 使用手册知识库
├── graph-design-poster/           # 画报知识库
├── graph-design-icon/             # 图标知识库
├── graph-painting-illustration/   # 插图知识库
├── graph-painting-comic/          # 漫画知识库
├── graph-painting-concept-art/    # 原画知识库
└── graph-painting-cartoon/        # 卡通知识库
```

## 文档收集原则

### 1. 内容分类

每个知识库的文档应该按照以下维度组织：

**以 `graph-photograph-portrait` 为例：**

#### A. 构图与机位（Composition & Camera Position）
- 不同风格（modern、vintage、fashion等）的构图技巧
- 不同色调（warm、cool、high-contrast等）的机位选择
- 不同光线（soft、hard、natural等）的构图原则

#### B. 光线与氛围（Lighting & Atmosphere）
- 各种光线类型的设置方法
- 不同风格和色调的光线搭配
- 氛围营造技巧

#### C. 风格与色调（Style & Tone）
- 现代、复古、时尚等风格的特点
- 暖色调、冷色调、高对比度等色调的应用
- 风格与色调的搭配原则

#### D. 参考摄影师（Photographer References）
- 知名摄影师的作品风格描述
- 不同风格的代表性摄影师
- 摄影师风格的视觉特征

#### E. 背景与环境（Background & Environment）
- 室内/室外环境的场景选择
- 不同 pose 和 makeup 的环境搭配
- 背景虚化与主体突出技巧

#### F. 表情与姿势（Expression & Pose）
- 不同场景下的姿势指导
- 表情与氛围的匹配
- 自然、优雅、自信等风格的姿势参考

#### G. 妆容与细节（Makeup & Details）
- 自然、精致、浓妆、裸妆等风格的特点
- 妆容与整体风格的协调
- 细节处理技巧

### 2. 文档格式

- **文件格式**：支持 `.txt`、`.md`、`.markdown`、`.pdf`
- **语言**：支持中文和英文（可以混合）
- **结构**：建议使用 Markdown 格式，便于阅读和维护

### 3. 文档命名建议

使用描述性的文件名，例如：
- `composition-modern-warm.md` - 现代暖色调构图技巧
- `lighting-soft-portrait.md` - 柔光人像技巧
- `photographer-annie-leibovitz.md` - 安妮·莱博维茨风格参考
- `pose-natural-elegant.md` - 自然优雅姿势参考

## 文档示例

我已经在 `graph-photograph-portrait/` 目录下创建了几个示例文档：

1. **composition-modern-warm.md** - 现代暖色调构图技巧
2. **lighting-soft-portrait.md** - 柔光人像技巧
3. **photographer-annie-leibovitz.md** - 安妮·莱博维茨风格参考
4. **pose-natural-elegant.md** - 自然优雅姿势参考
5. **makeup-natural-detailed.md** - 自然妆容与细节处理

## 文档内容要求

### 1. 内容质量

- **专业性**：内容要专业、准确，来自可靠的摄影/设计/绘画资源
- **实用性**：内容要实用，能够直接用于生成提示词
- **结构化**：使用清晰的标题和段落结构，便于检索和理解

### 2. 关键词覆盖

文档中应该包含相关的关键词，以便知识库检索时能够匹配到：

**以 portrait 为例，应该包含的关键词：**
- 风格关键词：modern、vintage、fashion、minimalist 等
- 色调关键词：warm、cool、high-contrast、natural 等
- 光线关键词：soft、hard、natural、rim 等
- 环境关键词：indoor、outdoor、studio、natural 等
- 姿势关键词：standing、sitting、natural、elegant 等
- 妆容关键词：natural、refined、heavy、nude 等

### 3. 提示词参考

每个文档应该包含"提示词生成参考"部分，提供可以直接用于生成提示词的描述：

```markdown
## 提示词生成参考

当用户选择 `style: modern` 和 `tone: warm` 时，可以参考以下描述：

- "使用三分法构图，人物主体位于画面右侧三分之一处"
- "85mm 焦距，平视角度，营造现代感"
- "暖色调背景，大光圈虚化，突出主体"
```

## 文档收集来源

### 1. 专业摄影/设计/绘画教程

- 摄影教程网站
- 设计教程平台
- 绘画教学资源
- 专业书籍和杂志

### 2. 知名摄影师/设计师作品分析

- 分析知名摄影师的作品风格
- 总结不同风格的特点
- 提取可复用的视觉元素

### 3. 实际案例和经验

- 实际拍摄/设计经验
- 成功案例的分析
- 常见问题的解决方案

## 文档更新流程

1. **收集文档**：将收集到的文档放入对应的知识库目录
2. **运行向量化**：执行 `pnpm embedding:systemkb` 进行向量化
3. **测试效果**：通过实际调用 graph API 测试知识库召回效果
4. **优化迭代**：根据效果调整文档内容和结构

## 注意事项

1. **版权问题**：确保文档内容不侵犯版权，建议使用原创内容或已授权的资源
2. **内容准确性**：确保技术参数和描述准确，避免误导
3. **语言一致性**：虽然支持中英文混合，但建议保持文档内部语言一致
4. **文件大小**：单个文档建议控制在 10KB 以内，过大的文档可以拆分
5. **更新频率**：定期更新文档，保持知识库内容的新鲜度

## 快速开始

1. **查看示例**：参考 `graph-photograph-portrait/` 目录下的示例文档
2. **收集文档**：按照分类收集相关文档，放入对应目录
3. **运行脚本**：执行 `pnpm embedding:systemkb` 进行向量化
4. **测试效果**：调用 graph API 测试知识库召回效果
