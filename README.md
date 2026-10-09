# 毕设集

一个使用 React、TypeScript、Vite、React Router 和 Tailwind CSS 构建的项目工作台，包含毕业设计项目聚合与量化监测两个同级模块。毕设模块聚合可运行、可拆解、可继续扩展的本科毕设案例，并支持按自然语言需求、技术栈和选题方向检索；量化监测模块用于展示每日数据同步、质量指标、趋势和异常。

## 页面结构

- `/`：项目工作台模块总览。
- `/graduation`：毕设项目发现首页，包含智能检索、方向/技术筛选、相关度排序和项目 Grid 预览。
- `/graduation/resources/:slug`：毕设资源文章详情。
- `/graduation/cases/:slug`：毕设案例详情，可下载完整项目包、最终论文和答辩 PPT，也可访问在线演示。
- `/quant`：量化监测平台标的列表，支持服务端账户关注、主流行情、搜索和自定义标的。
- `/quant/:symbol`：单标的 EMA 回测、超参数比较、收益曲线和回撤详情。
- `/quant/account`：账户登录、服务端关注列表和买入/卖出邮件通知设置。
- `/cases`、`/cases/:slug`、`/projects` 与 `/projects/:slug`：兼容旧链接并重定向到毕设模块。

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
- 量化监测静态演示数据：`public/data/quant-monitor.json`，仅在未配置 Go API 时作为界面兜底，不存储运行记录
- OKX 量化服务：`quant-service/`，只读拉取 K 线、账户余额、持仓和账单，计算 EMA、记录权益/收益快照，并管理账户关注与信号通知
- 真实项目截图：`public/images/projects/<项目 slug>/`，并通过案例的 `previewImages` 字段配置轮播顺序、说明和替代文本
- 完整项目包、最终论文与答辩 PPT：`public/downloads/`

页面运行时通过 `fetch` 读取静态内容 JSON。更新文章或案例时只需修改对应数据文件；修改页面结构与样式时再重新构建。量化监测页通过 Go API 读取实时数据；没有配置 API 时才使用 `public/data/quant-monitor.json` 作为界面兜底。
Go 服务支持通过页面切换 `symbol` 和 EMA 快慢周期，也支持直接给 `/api/quant/monitor`、`/api/quant/backtest`、`/api/quant/sync` 等接口传 `symbol`、`fast`、`slow` 查询参数；同步快照和回测明细写入 SQLite。每日采集由运行中的 Go 服务按 `SYNC_INTERVAL` 调度，与前端构建分开。
项目预览只使用对应项目的真实运行截图或验收截图，不使用示意图、通用图库或模拟后台界面。

新增项目默认采用 React + Go（Gin）+ SQLite，以降低云端常驻资源；仅在确实依赖 Python 深度学习生态时，通过 Flask 提供独立模型推理接口。完整项目包统一保留 `code/`、`docs/`、`ppt/` 三部分，其中 `docs/` 只包含最终论文。

## OKX 量化服务

量化服务使用 Go 直接接入 OKX 只读 API，不引入 Python 服务和交易写接口。服务默认读取 `BTC-USDT` 日线并计算 EMA12/EMA26；配置只读 API Key 后，会额外读取账户余额、非现货持仓和账单。账户、关注列表、通知记录、同步快照和回测明细都保存在 SQLite 数据库 `DATA_DIR/quant.db`。

数据库首次启动时由服务自动创建，并按内置迁移版本创建表结构。旧的 `users.json`、`account_snapshots.jsonl` 等文件不会自动导入；云端会从空数据库开始，旧文件保留在原位置，不会随构建上传。

GitHub Actions 按 `yuanling-house` 的发布方式构建并上传不可变 release，由普通部署用户在 `/home/deploy/cv` 下切换 release、启动 Go 服务并更新 1Panel 静态站点；不需要 `sudo`、systemd 或容器。服务由部署用户的 PID 文件管理，并写入 `@reboot` crontab，监听 `127.0.0.1:18188`。云端新数据库自动创建在 `/home/deploy/cv/data/quant.db`，日志和 PID 分别保存在 `/home/deploy/cv/logs`、`/home/deploy/cv/run`，不会被发布覆盖。服务器环境配置位于 `/home/deploy/cv/env/quant-service.env`，首次部署前需要由部署用户手动创建并设置 `chmod 600`，部署不会覆盖服务器配置，也不会上传本地 `.env`。SSH 部署使用宿主机目录 `/opt/1panel/www/sites/codes123/index`；你在 Nginx 配置中看到的 `/www/sites/codes123/index` 是 1Panel/OpenResty 容器视角路径。部署账号需要可写 `/home/deploy/cv` 和 `/opt/1panel/www/sites/codes123/index`，workflow 沿用 `DEPLOY_SSH_KEY`、`DEPLOY_KNOWN_HOSTS`、`DEPLOY_USER`、`DEPLOY_HOST` 这四个 GitHub Actions secrets。

首次部署前，用部署账号创建服务器上的 `quant-service.env` 并填写配置；部署后如需修改邮件或 OKX 私有账户配置，再用同一账号重启并查看日志：

```bash
nano /home/deploy/cv/env/quant-service.env
chmod 600 /home/deploy/cv/env/quant-service.env
/home/deploy/cv/bin/start-quant-service.sh
tail -n 80 /home/deploy/cv/logs/quant-service.log
```

Actions 构建前端时会默认将 API 地址设为同源 `/api/quant/...`；因此还需在 1Panel 的 `codes123.cn` 网站配置中加入 [量化服务反向代理片段](quant-service/deploy/1panel-locations.conf)，将 API 转发到 `127.0.0.1:18188`。不要新建公网端口或改动其他项目的 `location`。若选择跨域 API，则应配置相应的 `VITE_QUANT_*` 地址，并在 `/home/deploy/cv/env/quant-service.env` 设置 `CORS_ORIGIN` 为前端的完整 origin。

```bash
cd quant-service
cp .env.example .env
# 将 .env 中的配置导出到当前 shell 后启动，例如：
set -a; source .env; set +a
go run ./cmd/quant-service
```

常用接口：

- `GET /healthz`：服务健康状态
- `GET /api/quant/dashboard`：最近 EMA、账户快照和收益历史
- `GET /api/quant/market?quoteCcy=USDT`：读取当前 OKX 市场类型下、USDT 计价的全量标的 24h 行情；也可用 `?symbols=BTC-USDT,ETH-USDT` 只读取指定标的
- `GET /api/quant/monitor`：与当前 React 量化监测页面兼容的数据结构
- `GET /api/quant/ema`：最近一次 EMA 分析
- `GET /api/quant/backtest`：EMA 策略回测结果、净值曲线和交易记录
- `GET /api/quant/optimize`：按夏普比率搜索 EMA 参数，并返回最优组合与候选组合
- `GET /api/quant/pnl`：权益、已实现收益、未实现收益、手续费和历史快照
- `POST /api/quant/sync`：手动触发一次只读同步
- `POST /api/quant/auth/email-code`：发送注册邮箱验证码；验证码 10 分钟有效，60 秒内不可重复发送
- `POST /api/quant/auth/register`、`POST /api/quant/auth/login`、`POST /api/quant/auth/logout`：注册需要两次一致的密码和邮箱验证码，登录使用邮箱和密码
- `GET /api/quant/auth/me`：读取当前登录用户
- `GET/PUT /api/quant/watchlist`：读取或保存当前用户的关注列表
- `PUT /api/quant/notifications`：保存买入/卖出邮件通知设置
- `POST /api/quant/notifications/test`：发送测试邮件；未配置 SMTP 时返回明确错误

要让前端读取并触发 Go 服务，在项目根目录的 `.env.local` 中设置 `VITE_QUANT_MONITOR_URL=http://localhost:8081/api/quant/monitor`、`VITE_QUANT_SYNC_URL=http://localhost:8081/api/quant/sync` 和 `VITE_QUANT_OPTIMIZE_URL=http://localhost:8081/api/quant/optimize`，账户接口会从 `VITE_QUANT_SYNC_URL` 自动推导；也可以显式设置 `VITE_QUANT_API_URL=http://localhost:8081/api/quant`，然后重新启动 Vite。

用户账户、关注标的、邮件通知设置和已完成通知事件保存在 `DATA_DIR/quant.db`；登录会话和邮箱验证码仍只保存在服务内存中。浏览器只保存 HttpOnly 会话 Cookie，不会把关注列表作为用户数据写入 localStorage。服务端启动时会合并所有用户的关注标的，在每日同步中逐个拉取并计算 EMA。

本地开发时可在 `quant-service/.env` 配置邮件；生产环境请在服务器 `/home/deploy/cv/env/quant-service.env` 配置 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASSWORD` 和 `SMTP_FROM`，并限制文件权限为 `600`。当前支持 Gmail 的 465 隐式 TLS 和 587 STARTTLS；`SMTP_PASSWORD` 应填写应用专用密码。若服务器直连 Gmail 时出现 TLS 握手 EOF，可选填 `SMTP_PROXY`，例如 `http://127.0.0.1:7890` 或 `socks5://127.0.0.1:7891`；留空时仍使用直连。注册验证码只保存在服务内存中，不写入账户文件，发送失败会自动作废本次验证码。平台还会发送 EMA 金叉（买入信号）和死叉（卖出信号）邮件；只有 SMTP 投递成功后才记录通知事件，失败时后续同步可以重试。邮件只做提醒，不会自动下单。

API Key 只需要 `Read` 权限，不要开启交易或提现权限，也不要把真实密钥提交到仓库。未配置密钥时服务仍可运行并只同步公开行情；配置不完整时会直接报错，避免误以为已经记录了实盘账户数据。

回测默认使用最近 300 根已确认 K 线、EMA12/EMA26、仅做多策略；收盘产生信号，下一根 K 线开盘执行，默认手续费为 0.1%、滑点为 0.05%。回测会同时计算策略和买入持有基准的夏普比率，按日收益、无风险利率 0、年化因子 √365 计算。参数寻优默认搜索快线 5–30、慢线 20–80、步长 1 的组合，并按策略夏普比率排序；也可以给接口传 `fastMin`、`fastMax`、`slowMin`、`slowMax`、`step` 和 `top` 自定义范围。可通过 `OKX_CANDLE_LIMIT`、`EMA_PERIODS`、`BACKTEST_INITIAL_CAPITAL`、`BACKTEST_FEE_RATE` 和 `BACKTEST_SLIPPAGE_RATE` 调整。回测结果仅用于策略研究，不等同于实盘收益。

毕设下载内容用于学习、选题和方案设计参考。公开新的压缩包前，应再次检查敏感配置、个人数据、数据库文件与不必要的构建产物。
