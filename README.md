# 毕设集

一个使用 React、TypeScript、Vite、React Router 和 Tailwind CSS 构建的毕业设计项目聚合与智能检索平台。项目库聚合可运行、可拆解、可继续扩展的本科毕设案例，并支持按自然语言需求、技术栈和选题方向检索。

## 页面结构

- `/`：项目发现首页，包含智能检索、方向/技术筛选、相关度排序和项目 Grid 预览。
- `/resources/:slug`：资源文章详情。
- `/cases`：兼容旧列表链接并跳转到首页项目库。
- `/cases/:slug`：案例详情，可下载完整项目包、最终论文和答辩 PPT，也可访问在线演示。
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
- 真实项目截图：`public/images/projects/<项目 slug>/`，并通过案例的 `previewImages` 字段配置轮播顺序、说明和替代文本
- 完整项目包、最终论文与答辩 PPT：`public/downloads/`

页面运行时通过 `fetch` 读取 JSON。更新文章或案例时只需修改对应数据文件；修改页面结构与样式时再重新构建。
项目预览只使用对应项目的真实运行截图或验收截图，不使用示意图、通用图库或模拟后台界面。

新增项目默认采用 React + Go（Gin）+ SQLite，以降低云端常驻资源；仅在确实依赖 Python 深度学习生态时，通过 Flask 提供独立模型推理接口。完整项目包统一保留 `code/`、`docs/`、`ppt/` 三部分，其中 `docs/` 只包含最终论文。

毕设下载内容用于学习、选题和方案设计参考。公开新的压缩包前，应再次检查敏感配置、个人数据、数据库文件与不必要的构建产物。
