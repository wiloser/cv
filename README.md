# 毕设集

一个使用 React、TypeScript、Vite、React Router 和 Tailwind CSS 构建的毕业设计项目聚合与智能检索平台。项目库聚合可运行、可拆解、可继续扩展的本科毕设案例，并支持按自然语言需求、技术栈和选题方向检索。

## 页面结构

- `/`：项目发现首页，包含智能检索、方向/技术筛选、相关度排序和项目 Grid 预览。
- `/resources/:slug`：资源文章详情。
- `/cases`：兼容旧列表链接并跳转到首页项目库。
- `/cases/:slug`：案例详情，可下载源码 ZIP 与 Markdown 案例说明，也可访问在线演示。
- `/projects` 与 `/projects/:slug`：兼容旧链接并重定向到新案例路由。

## 本地开发

建议使用 Node.js 22 LTS。

```bash
npm ci
npm run dev
```

开发地址为 `http://localhost:5174`。

```bash
npm run lint
npm run build
```

## 内容维护

- 选题指南：`public/data/resources.json`
- 毕设案例：`public/data/projects.json`
- 源码与案例说明：`public/downloads/`

页面运行时通过 `fetch` 读取 JSON。更新文章或案例时只需修改对应数据文件；修改页面结构与样式时再重新构建。

毕设下载内容用于学习、选题和方案设计参考。公开新的压缩包前，应再次检查敏感配置、个人数据、数据库文件与不必要的构建产物。
