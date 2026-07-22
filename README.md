# 陈序 · 个人作品集

一个使用 React、TypeScript、Vite、React Router 和 Tailwind CSS 构建的静态个人作品集。整体借鉴开发者主页的双栏信息布局，并采用独立的柔和圆润视觉风格。网站完全由本地静态配置驱动，不包含登录、后台、评论、数据库或其他服务端状态。

当前姓名、经历、联系方式和项目内容均为演示资料，正式发布前请替换为本人真实且可核实的信息。

## 页面结构

网站包含个人概览、项目列表和项目详情页面：

- `/` 个人概览页集中展示个人方向和常用技术。
- `/projects` 项目列表页以紧凑的作品卡片呈现全部项目。
- 点击项目进入 `/projects/:slug`，查看项目功能、技术实现与开发环境。

两个顶部标签使用真实路由切换，不使用页内锚点定位。网站没有筛选、轮播或折叠目录。

## 本地开发

建议使用 Node.js 20 或更新版本。

```bash
npm ci
npm run dev
```

开发地址为 `http://localhost:5174`。

```bash
npm run lint
npm run build
```

## 数据维护

- 个人资料：`public/data/profile.json`
- 项目数据：`public/data/projects.json`

页面运行时通过 `fetch` 读取 JSON，并使用 `no-store` 避免读取旧缓存。开发服务运行时直接保存 JSON 即可看到页面更新，不需要修改组件或重新启动 Vite。新增项目时，在 `projects.json` 数组中增加一个对象即可。

线上更新内容时只需替换 `data` 目录中的 JSON 静态文件，无需重新打包 JavaScript。`profile.ts` 和 `projects.ts` 只保留类型约束与按 slug 查询逻辑。

## 代码结构

```text
src/
├─ components/
│  ├─ ProjectDetail.tsx
│  └─ RepositoryCard.tsx
├─ data/
│  ├─ content.ts
│  ├─ profile.ts
│  └─ projects.ts
├─ App.tsx
├─ main.tsx
└─ tailwind.css（仅引入 Tailwind）

public/
└─ data/
   ├─ profile.json
   └─ projects.json
```

## 发布前检查

- 替换演示姓名、所在地和简介。
- 填写真实邮箱，更新 PDF 简历。
- 核对项目描述、技术栈与完成时间。
- 重新生成 `public/og.png` 和 `public/favicon.png`。
- 运行 `npm run lint` 与 `npm run build`。
