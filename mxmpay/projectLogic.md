## 文件架构

1. _caches 用于存储从存储各个选择项目收集的文档结构树
2. _outputs 用于存储从vite打包的文档输出
3. _VITEMPATE 用于构建vite+react代码进行前端渲染
4. src/api 用于编写express服务输出
5. src/core 核心的功能模块存储
6. src/test 用于存储测试代码
  

## 工作流程

## 核心函数

### Selector
- grepDoctressfromPaths 从用户给出的路径获取README.md以及doc_assets文件夹,用户可能给出的是多个路径
```
  //参考
  grepDoctressFromPaths([
    {
      path:' /Users/mxm_pro/Desktop/codes/gientech/apps/AIChat',
      name:'AIchat',
      lable?:'智能对话',
      icons?:'/icons/chat.png',
      version?:'1.1.0'
    },...
  ],options)
```
然后复制项目的README.md和doc_assets到_caches,每个path生成一个文件夹，最终期待是_caches/md/AIchat,这个路径应该有index.md(原README.md)，assets(原doc_assets)
