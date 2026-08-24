# E2E Orchestrator — NestJS 后端

把原来的 Koa 后端（`server/`）迁移到 NestJS + Fastify + Prisma + MySQL + Redis + OpenTelemetry + Swagger，
并补上：登录鉴权、空间（多人协作）、数据库化存储。

## 技术栈

| 维度          | 选型                                                                |
| ----------- | ----------------------------------------------------------------- |
| 框架          | NestJS 10 + Fastify adapter                                      |
| 语言          | TypeScript 5                                                      |
| ORM         | Prisma 5（MySQL / PostgreSQL；schema.prisma 一键切换）                       |
| 鉴权          | @nestjs/jwt，httpOnly cookie 传输，bcrypt 密码                                  |
| 校验          | class-validator + class-transformer（global ValidationPipe）          |
| 文档          | Swagger（`/docs`）                                                   |
| WebSocket   | @nestjs/websockets + @nestjs/platform-ws（`ws` 库），路径 `/ws/cases`        |
| 缓存 / 限流     | ioredis（best-effort，连不上不阻塞启动）                                         |
| 可观测         | OpenTelemetry（默认 console exporter；OTLP 可配）                              |
| 运行          | Node.js 20+                                                       |

## 目录结构

```
server-nest/
├── prisma/
│   ├── schema.prisma       # 数据模型：User / Space / SpaceMember / Case / FormSchema / RunLog
│   └── seed.ts             # 种子 + 迁移老文件库
├── src/
│   ├── main.ts             # 启动入口（Fastify + OTel + Swagger + WebSocketAdapter）
│   ├── app.module.ts       # 根模块（全局 JwtModule / Prisma / Redis）
│   ├── common/             # 装饰器 / 守卫 / 异常过滤器
│   ├── infrastructure/     # PrismaService / RedisService / Telemetry SDK
│   └── modules/
│       ├── auth/           # 注册 / 登录 / me / 登出
│       ├── spaces/         # 空间 + 成员管理（RBAC）
│       ├── cases/          # 用例 CRUD + 翻译 + 同步运行 + 实时预览 WS
│       │   ├── translator/ # prepare / parse / translate（与原 Koa 版同构）
│       │   └── runner/     # runCase / liveRun
│       └── form-schemas/   # 表单设计器数据（按空间 × 节点类型）
├── docker-compose.yml      # 本地 MySQL 8 + Redis 7
├── .env.example
└── package.json
```

## 快速开始

```bash
# 1. 依赖（注意：跳过 puppeteer 自带 chromium 下载 — 运行时用系统 Chrome）
cd server-nest
PUPPETEER_SKIP_DOWNLOAD=true npm install

# 2. 起本地依赖（如果你机器已经有 MySQL/Redis，跳过此步）
docker compose up -d

# 3. 写 .env
cp .env.example .env
# 按本机 MySQL/Redis 实际账号改 DATABASE_URL / REDIS_URL
#   - 本机有密码时：mysql://USER:PWD@localhost:3306/e2e_orchestrator?schema=public
#   - 无密码时：mysql://USER@localhost:3306/e2e_orchestrator?schema=public

# 4. 初始化数据库 + 类型
npx prisma migrate dev --name init   # 开发期，自动生成迁移 SQL
npx prisma generate                  # 重新生成 client

# 5. 种子（建默认 admin/admin123 + common 空间 + 迁移老 cases/*.json）
npm run seed

# 6. 启动
npm run start:dev      # watch 模式
# 或者生产：
npm run build && npm run start:prod
```

服务起来后：

- `http://localhost:4000/health` — 健康检查
- `http://localhost:4000/docs` — Swagger UI
- `http://localhost:4000/api/*` — REST API
- `ws://localhost:4000/ws/cases?caseId=xxx` — 实时预览 WS（cookie 或 query.token 鉴权）

## 核心 API 速查

| Method | Path | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 注册（自动加入 common 空间为 OWNER） |
| POST | `/api/auth/login` | 登录，写 httpOnly cookie |
| GET  | `/api/auth/me` | 当前用户 + 所在空间 |
| POST | `/api/auth/logout` | 登出 |
| GET  | `/api/spaces` | 我的空间列表 |
| POST | `/api/spaces` | 新建空间（自己为 OWNER） |
| GET  | `/api/spaces/:id` | 空间详情（含成员） |
| POST | `/api/spaces/:id/members` | 添加/更新成员（OWNER） |
| DELETE | `/api/spaces/:id/members/:userId` | 移除成员（OWNER） |
| GET  | `/api/cases?spaceId=` | 列出空间下的用例 |
| POST | `/api/cases` | 创建用例 |
| GET  | `/api/cases/:id` | 用例详情 |
| PUT  | `/api/cases/:id` | 保存用例（自动校验连通性 + 表单必填） |
| DELETE | `/api/cases/:id` | 删除用例 |
| POST | `/api/cases/:id/translate` | 翻译（写文件到 `cases-output/`） |
| POST | `/api/cases/:id/run` | 同步运行 |
| POST | `/api/cases/:id/live-run` | 异步启动 live 预览（事件通过 WS 推） |
| GET  | `/api/form-schemas?spaceId=` | 列出所有节点类型的 schema |
| GET  | `/api/form-schemas/:nodeType?spaceId=` | 某类型 schema |
| PUT  | `/api/form-schemas/:nodeType?spaceId=` | 保存某类型 schema |
| POST | `/api/form-schemas/reset?spaceId=` | 重置为默认 |

## 角色 / 权限

`SpaceMember.role` 是 Prisma enum：

- `OWNER` — 全权（含成员管理）
- `EDITOR` — 编辑用例、表单
- `VIEWER` — 只读

`@Roles(SpaceRole.OWNER)` 注解 + 全局 `RolesGuard` 自动按 URL 中的 `spaceId` / 资源反查空间，再比对角色。

## WebSocket 实时预览

翻译器在 `live` 模式注入 `__step__ / __loop__ / __emit__`，子进程在每个动作节点前后把
`__EVT__` 前缀的 JSON 事件写到 stdout，NestJS 进程解析后通过 `ws` 推给所有订阅者。
前端只需打开 `ws://host/ws/cases?caseId=xxx`，cookie 鉴权（也支持 `&token=` 兜底）。

## 已知坑位

1. **puppeteer 自带 chromium 在中国大陆/部分网络下会下载失败** —— 项目用 `.npmrc` + 环境变量 `PUPPETEER_SKIP_DOWNLOAD=true` 跳过下载，运行时会自动检测系统 Chrome 路径（macOS / Linux / Windows 常见路径都覆盖了）。
2. **MySQL `sha256_password` 认证插件兼容性** —— Prisma 5 + MySQL 8 在某些组合下协商失败，建议 MySQL 端 user 用 `caching_sha2_password` 即可。
3. **Redis NOAUTH** —— 本地 Redis 设了密码时，`.env` 的 `REDIS_URL` 必须带密码。Redis 连不上时所有 Redis 相关能力（登录限流、缓存）降级为 no-op，不影响主流程。
4. **业务 DB 不可用时启动不挂** —— `PrismaService.onModuleInit` 启动期连不上只 warn，懒连接；这样 `docker compose up` 跟 `nest start` 顺序错了也不会让服务挂。

## 迁移到 PostgreSQL

只需把 `prisma/schema.prisma` 的 `datasource db.provider` 改为 `postgresql`，
再把 `DATABASE_URL` 改成 `postgresql://USER:PWD@host:5432/db`，
`prisma migrate dev` 即可。其它代码不需改。
