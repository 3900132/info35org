# ⚡ EdgeLink - 极速边缘短链接服务

EdgeLink 是一款基于 **腾讯云 EdgeOne Pages** 的轻量、极速、无服务器、开箱即用的 Serverless 网址短链接生成与重定向服务。

项目使用 **Edge Functions (边缘函数)** 处理重定向与 API 请求，利用 **EdgeOne KV** 作为低延迟全球分布式存储，并提供了一个高颜值、现代科技感的管理控制台面板。

## 界面
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/dfa4d387-dfa0-4daa-bcfb-8ff6d39a7398" />


---
## 🧷 在线体验

点击链接即可体验本项目 https://go.info35.org

## 🚀 一键部署

您可以通过点击下方的部署按钮，快速将本项目克隆并部署到您自己的腾讯云 EdgeOne Pages 中：

[![使用 EdgeOne Pages 部署](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/pages/new?repository-url=https%3A%2F%2Fgithub.com%2F3900132%2Finfo35org)

> 💡 **部署提示**：上方一键部署已直接绑定您的公开仓库。若您后续将项目克隆到其他私有仓库或个人分支，可以手动把链接中的 `repository-url` 替换为您对应仓库的 URL 编码。

---

## ✨ 核心特性

- **全球超低延迟重定向**：基于 EdgeOne 全球边缘计算节点运行，重定向逻辑在距离用户最近的节点执行，无冷启动，毫秒级响应。
- **用户注册体系（可选开关）**：管理员可自由切换"仅注册用户可生成短链"或"所有访客均可生成"两种模式；开启后未登录访客将被拒绝生成并引导注册登录。**邮箱即账户**：注册/登录只需邮箱 + 密码，注册必须通过**邮箱验证码验证**，无需另设用户名。注册用户生成短链后自动归属到其账户，可随时在"我的短链"面板查看长短链与实时点击统计。
- **用户管理后台**：管理员可查看所有注册用户列表（含每人短链数量与累计点击），**点击邮箱（账户）即可下钻查看该用户生成的全部短链明细（短链/长链及每条点击统计）**，并支持删除用户（其短链保留）。
- **安全的密码存储**：用户密码使用 PBKDF2 (SHA-256, 10 万次迭代 + 随机盐) 加密存储，登录会话采用 7 天有效期的 Bearer Token，可随时注销失效。
- **高颜值管理面板**：精美打磨的 Glassmorphism 暗黑科技风 UI，支持移动端自适应适配，含点击趋势统计图。
- **数据统计分析**：内置点击量统计 API 与 7 天趋势图表，前端实时获取短链接访问次数。
- **链接 TTL 过期**：创建短链时可设置存活时间（秒），到期后自动删除并返回 404。
- **本地设备历史**：使用浏览器 `localStorage` 记录该设备生成的历史短链，保证隐私且方便管理。
- **生成二维码**：一键生成高清二维码，支持前端直接下载保存。
- **安全管理后台**：支持 `ADMIN_TOKEN` 环境变量锁定的管理面板，可全局查看所有短链、查看累计点击量、分页加载与批量删除。
- **IP 频率限制**：创建/注册/登录接口均内置 IP 频率限制，防止滥用。
- **点击写入重试**：KV 写入失败时自动重试最多 3 次，提高可靠性。
- **离线开发支持**：代码内建 local mock 内存数据库机制，本地开发无需连接云端 KV，即可无缝秒级跑通。

---

## 🛠️ 本地开发与测试

EdgeLink 支持在本地零配置运行（自动降级为内存数据库运行）。

### 1. 克隆并安装依赖
```bash
git clone https://github.com/3900132/info35org.git
cd info35org
npm install
```

### 2. 启动开发服务器
```bash
npm run dev
```

启动后，访问浏览器 **`http://localhost:3000`** 即可开始测试：
- **默认后台管理员密钥**：`admin123`
- 本地生成的短链数据保存在内存中，重启服务器后清空。

### 3. 构建部署产物
```bash
npm run build
```
构建脚本会将共享 KV 模块内联打包到 `edge-functions-dist/` 目录，直接用于 EdgeOne Pages 部署。

---

## 👤 用户注册与短链归属说明

EdgeLink 支持可选的注册用户体系，生成短链的权限由管理员在后台一键切换：

### 模式切换（管理后台 → 站点设置）
- **关闭（默认）**：所有访客无需注册即可生成短链（保持原有行为）。
- **开启**：仅注册并登录的用户可以生成短链，未登录访客请求会返回 `401` 并在页面提示先注册登录。

切换方式：登录管理后台 `/admin`，在「站点设置」卡片中勾选/取消 **“仅注册用户可生成短链”** 即可实时生效（设置保存在 KV 中）。

### 用户端功能
- 首页提供 **登录 / 注册** 面板，**邮箱即账户**（无需用户名）：注册填写邮箱 + 密码并通过邮箱验证码验证后自动登录（会话 Token 有效期 7 天）；登录只需邮箱 + 密码。
- 登录后生成的短链会自动归属到当前账户，首页「我的短链」面板实时列出该用户全部短链（短地址、原始长链/文字内容、点击统计、创建时间）。
- 未登录时行为与原版完全一致（在开关关闭的情况下）。

### 管理端功能（`/admin`）
- 「用户管理」卡片列出所有注册用户：邮箱（账户）、注册时间、短链数量、累计点击，并支持删除用户（删除后其短链保留，仅解除归属并注销其全部会话）。
- **点击邮箱（账户）即可下钻**，弹窗展示该用户生成的所有短链明细：短地址、类型、原始长链/内容、每条短链的点击统计与创建时间。

### 密码与会话安全
- **邮箱即账户**：系统不设独立用户名，注册与登录均使用邮箱；每个邮箱只能绑定一个账号。
- 注册强制 **邮箱验证码验证**：验证码 6 位数字、10 分钟有效、同邮箱 60 秒限发一封、每 IP 每小时限 10 封、单码最多 5 次尝试，验证通过后立即销毁。
- 密码使用 **PBKDF2 (SHA-256，10 万次迭代 + 每用户随机盐)** 加密后存储，数据库泄露也不会暴露明文密码。
- 登录会话使用随机 32 字节 Bearer Token，存储在 KV（`token:` 前缀），7 天自动过期，注销立即失效。

---

## 🔌 API 接口一览

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| POST | `/api/create` | 生成短链（开启注册开关后需要 Bearer Token） | 可选 |
| GET | `/api/stats?code=xxx` | 查询单条短链点击量 | 无 |
| GET | `/api/settings` | 获取站点设置（是否强制注册） | 无 |
| POST | `/api/auth/send-code` | 发送注册邮箱验证码（需配置邮件服务环境变量） | 无 |
| POST | `/api/auth/register` | 用户注册（必须携带邮箱 + 验证码） | 无 |
| POST | `/api/auth/login` | 用户登录 | 无 |
| POST | `/api/auth/logout` | 注销当前会话 | 用户 Token |
| GET | `/api/auth/me` | 获取当前登录账户（邮箱） | 用户 Token |
| GET | `/api/my/links` | 获取当前用户全部短链及点击统计 | 用户 Token |
| GET | `/api/admin/list` | 管理员分页拉取全部短链 | 管理员 Token |
| DELETE | `/api/admin/delete` | 管理员删除短链（支持批量） | 管理员 Token |
| GET | `/api/admin/trend?date=...` | 管理员点击趋势统计 | 管理员 Token |
| GET/POST | `/api/admin/settings` | 获取/设置“仅注册用户可生成短链”开关 | 管理员 Token |
| GET | `/api/admin/users` | 管理员获取用户列表及统计 | 管理员 Token |
| GET | `/api/admin/users/links?username=xxx` | 管理员下钻查看某用户全部短链 | 管理员 Token |
| DELETE | `/api/admin/users/delete` | 管理员删除用户（支持批量） | 管理员 Token |

---

## 🔍 SEO 与 GEO（AI 搜索）优化说明

项目内置了面向传统搜索引擎与 AI 生成式引擎（ChatGPT、Perplexity、Claude 等）的优化：

- **页面级优化**（`index.html`）：语义化 title/description/keywords、Open Graph 与 Twitter Card 社交分享标签、canonical 规范链接、以及 JSON-LD 结构化数据（`WebApplication` + `FAQPage` 常见问题，便于搜索引擎展示富摘要、便于 AI 引擎准确引用）。
- **`robots.txt`**：允许搜索引擎与主流 AI 爬虫（GPTBot、ClaudeBot、PerplexityBot 等）抓取公开首页，屏蔽管理后台与 API 路径，并声明 Sitemap 地址。
- **`sitemap.xml`**：站点地图，仅包含公开首页（管理后台已 noindex，不收录）。
- **`llms.txt` / `llms-full.txt`**：遵循 llms.txt 规范的 AI 可读文档，精简版概述产品能力与常见问题，完整版包含功能详解、技术架构与部署方式。

> 💡 **自定义域名提示**：如果您部署到自己的域名，请将 `index.html` 中的 canonical/OG 地址、`sitemap.xml` 与 `robots.txt` 中的 `https://go.info35.org` 替换为您自己的域名。

---

## 📦 云端部署与配置说明

在线上运行时，为了持久化存储数据并保护管理员面板，您需要完成以下两步配置：

### 1. 绑定 EdgeOne KV 命名空间
1. 在腾讯云 EdgeOne 控制台进入 **存储 - KV**。
2. 创建一个命名空间（本项目使用 **`goinfo35org`**）。
3. 进入您的 EdgeOne Pages 项目，选择 **项目设置** -> **绑定 KV**：
   - **变量名 (Variable Name)**: 使用 **`goinfo35org`**。代码中已做自适应识别，可以直接使用。
   - **KV 命名空间**: 选择您刚刚创建的命名空间。

> 💡 **自定义变量名说明**：
> 代码的 `getKV(context)` 函数会依次尝试 `goinfo35org`、`link`、`SHORT_LINK_KV` 几个变量名。如果您使用其他变量名（例如 **`my_kv`**），只需修改共享模块 `edge-functions/lib/kv-helpers.js` 中的 `getKV(context)` 函数，在开头增加对应分支即可：
> ```javascript
> function getKV(context) {
>   if (context && context.env && context.env.my_kv) {
>     return context.env.my_kv;
>   }
>   if (typeof my_kv !== 'undefined' && my_kv !== null) {
>     return my_kv;
>   }
>   // ... 保持其他不变 ...
> }
> ```

### 2. 配置管理员密钥 (ADMIN_TOKEN)
1. 进入您的 EdgeOne Pages 项目，选择 **项目设置** -> **环境变量**。
2. 添加一个新的环境变量：
   - **变量名 (Variable Name)**: `ADMIN_TOKEN`
   - **值 (Value)**: 输入您自定义的复杂密码（例如 `AdminSecrt2026`）。
3. 保存后重新部署。此时，在前端"管理控制台"中输入该值即可解锁全局链接列表的管理与删除。

> 🔒 **安全说明**：管理后台 Token 存储在浏览器 `sessionStorage` 中，30 分钟后自动过期，关闭标签页后也会清除，不会持久化在本地。

### 3. 配置邮件服务（注册验证码必需）
用户注册需要邮箱验证码验证。边缘函数环境通过邮件服务商的 HTTP API 发信（与 SMTP 等价），在环境变量中配置其中**一组**即可。**各服务商的注册申请、域名验证、获取密钥的详细步骤，见下方《📧 邮件服务商申请与配置详细指南》。**

| 服务商 | 免费额度 | 需配置的环境变量 | 说明 |
| --- | --- | --- | --- |
| Resend（推荐） | 3000 封/月（100 封/天） | `RESEND_API_KEY`，可选 `MAIL_FROM` | `MAIL_FROM` 未配置时使用测试发件人 `onboarding@resend.dev` |
| Brevo (Sendinblue) | 300 封/天（约 9000 封/月） | `BREVO_API_KEY`，必需 `MAIL_FROM` | 需先在 Brevo 后台验证发件人邮箱 |
| SMTP2GO | 1000 封/月 | `SMTP2GO_API_KEY`，必需 `MAIL_FROM` | 需先验证发件人 |
| 阿里云邮件推送 DirectMail | 共 2000 封（每天最多 200 封），超出 ¥2/1000 封 | `ALIYUN_DM_ACCESS_KEY_ID` + `ALIYUN_DM_ACCESS_KEY_SECRET`，必需 `MAIL_FROM`；可选 `ALIYUN_DM_REGION`（默认 `cn-hangzhou`）、`ALIYUN_DM_FROM_ALIAS`（发件人显示名） | 需在 DirectMail 控制台验证发信域名与发信地址；AccessKey 需具备 DirectMail 权限 |

配置后重新部署即可生效。**未配置邮件服务时，注册功能将无法发送验证码**（本地开发模式下验证码会直接在接口响应中返回，方便调试）。

---

## 📧 邮件服务商申请与配置详细指南

> 四选一即可。国内用户推荐 **阿里云 DirectMail**；追求免费额度大推荐 **Brevo**；只想最快跑通推荐 **Resend**。

### 方案一：阿里云邮件推送 DirectMail（国内推荐）

**申请入口**：https://www.aliyun.com/product/directmail （控制台：https://dm.console.aliyun.com/）

**步骤：**

1. **开通服务**：登录阿里云 → 访问 DirectMail 产品页 → 点击"立即开通"（按量付费默认，有 2000 封免费额度，每天最多 200 封）。
2. **验证发信域名**：
   - 进入 DirectMail 控制台 → **发信域名** → 新建域名，填入 `go.info35.org`（替换为您自己的域名）。
   - 按控制台提示到您的 DNS 解析处（如 EdgeOne/腾讯云 DNSPod/阿里云解析）添加记录：**1 条 TXT（SPF）+ 1 条 CNAME（DKIM）+ 1 条 MX 记录**，具体值以控制台显示为准。
   - 添加后回到控制台点击"验证"，等待 DNS 生效（通常几分钟到几小时）。
3. **创建发信地址**：控制台 → **发信地址** → 新建，例如 `noreply@go.info35.org`，类型选"触发邮件"，设置 SMTP 密码（本项目用不到，可随意），并完成回信地址验证。
4. **创建 AccessKey（建议 RAM 子账号）**：
   - 访问 RAM 控制台：https://ram.console.aliyun.com → 创建子用户 → 勾选"OpenAPI 调用访问"→ 生成 AccessKey ID 和 Secret（**Secret 只显示一次，立即保存**）。
   - 为该子用户授权策略 `AliyunDirectMailFullAccess`（或自定义仅 DirectMail 发信权限）。
5. **在 EdgeOne Pages 配置环境变量**（项目设置 → 环境变量）：
   - `ALIYUN_DM_ACCESS_KEY_ID` = AccessKey ID
   - `ALIYUN_DM_ACCESS_KEY_SECRET` = AccessKey Secret
   - `MAIL_FROM` = `noreply@go.info35.org`（第 3 步创建的发信地址）
   - `ALIYUN_DM_FROM_ALIAS` = 发件人显示名（可选，如 `EdgeLink`）
   - `ALIYUN_DM_REGION` = DirectMail 所在区域（可选，默认 `cn-hangzhou`）
6. **重新部署**项目，然后用一个邮箱注册测试。

### 方案二：Resend（最快跑通，免费 3000 封/月）

**申请入口**：https://resend.com （支持 GitHub/Google 直接登录）

**步骤：**

1. 注册并登录后，进入 **API Keys**（https://resend.com/api-keys）→ Create API Key → 复制保存（只显示一次）。
2. **验证域名（可选但推荐）**：进入 **Domains**（https://resend.com/domains）→ Add Domain → 填 `go.info35.org` → 按提示到 DNS 处添加 TXT/CNAME/MX 记录并验证。
   - 未验证域名时，`MAIL_FROM` 不配置即可使用官方测试发件人 `onboarding@resend.dev`，但**只能发给您注册 Resend 的邮箱**，正式使用请务必验证域名。
3. 在 EdgeOne Pages 配置环境变量：
   - `RESEND_API_KEY` = 第 1 步的 API Key
   - `MAIL_FROM` = `EdgeLink <noreply@go.info35.org>`（域名验证后）
4. 重新部署。

### 方案三：Brevo / Sendinblue（免费额度最大：300 封/天）

**申请入口**：https://www.brevo.com （原 Sendinblue）

**步骤：**

1. 注册账号（免费套餐无需绑卡，300 封/天）。
2. **验证发件人**：登录后进入 **Senders**（https://app.brevo.com/senders）→ 添加发件人（如 `noreply@go.info35.org`）→ 到邮箱点击验证链接。若域名属于您，建议按提示加 SPF/DKIM 记录提高送达率。
3. **获取 API Key**：进入 **SMTP & API**（https://app.brevo.com/settings/keys/api）→ Generate New API Key → 复制保存。
4. 在 EdgeOne Pages 配置环境变量：
   - `BREVO_API_KEY` = 第 3 步的 API Key
   - `MAIL_FROM` = 第 2 步验证过的发件人地址
5. 重新部署。

### 方案四：SMTP2GO（免费 1000 封/月）

**申请入口**：https://www.smtp2go.com

**步骤：**

1. 注册账号 → 按引导 **验证发件人邮箱或发信域名**（域名验证：添加控制台给出的 SPF/DKIM/CNAME 记录）。
2. 进入 **Settings → API Keys**（https://app.smtp2go.com/settings/api_keys/）→ Create API Key → 复制保存。
3. 在 EdgeOne Pages 配置环境变量：
   - `SMTP2GO_API_KEY` = 第 2 步的 API Key
   - `MAIL_FROM` = 已验证的发件人地址
4. 重新部署。

### ❓ 常见问题

- **注册时提示"邮件服务未配置"**：说明 EdgeOne 环境变量没配或没重新部署。检查变量名拼写是否与上表完全一致。
- **收不到验证码**：先查垃圾箱；再确认 `MAIL_FROM` 的域名 DNS 记录（SPF/DKIM）已验证通过——未验证域名发出的邮件极易进垃圾箱或被拒收。
- **发送失败（502）**：查看 EdgeOne Pages 的函数日志，若阿里云返回 `InvalidAccessKeyId` 则 AccessKey 错误；返回 `SignatureDoesNotMatch` 则 Secret 错误。
- **验证码发送频率限制**：同一邮箱 60 秒 1 封、每 IP 每小时 10 封，这是防滥用设计。
- **测试提示"本地开发模式"**：仅在 `localhost` 下未配置邮件服务时出现，线上不会。

---

## 📂 目录结构

```text
/
├── edgeone.json                   # EdgeOne Pages 路由构建配置
├── robots.txt                     # 搜索引擎与 AI 爬虫规则 (GEO 优化)
├── sitemap.xml                    # 站点地图
├── llms.txt                       # AI 引擎可读文档 (精简版)
├── llms-full.txt                  # AI 引擎可读文档 (完整版)
├── package.json                   # NPM 配置文件
├── LICENSE                        # 开源许可证 (MIT)
├── README.md                      # 开源说明文档
├── server.js                      # 本地开发仿真服务器 (含 API 路由仿真)
├── index.html                     # 主页面 HTML (含登录/注册与我的短链面板)
├── style.css                      # 自定义 HSL 暗黑科技风样式表
├── app.js                         # 前端业务逻辑 (含登录注册、我的短链、二维码)
├── admin.html                     # 管理控制台 HTML (含站点设置与用户管理)
├── admin.js                       # 管理控制台逻辑 (Token 过期、分页、趋势图、用户管理)
├── qrcode.min.js                  # 本地二维码库
├── scripts/
│   └── build.js                   # 构建脚本 (内联共享模块到边缘函数)
└── edge-functions/                # 边缘计算服务函数目录
    ├── lib/
    │   └── kv-helpers.js          # 共享 KV/CORS/鉴权/限流/密码哈希/会话工具模块
    ├── api/
    │   ├── create.js              # 生成短链接 API (含 IP 限流与注册开关校验、归属记录)
    │   ├── settings.js            # 公开站点设置 API (是否强制注册)
    │   ├── stats.js               # 公共单链接点击量查询 API
    │   ├── my/
    │   │   └── links.js           # 当前用户短链列表及点击统计 API
    │   ├── auth/
    │   │   ├── send-code.js          # 注册邮箱验证码发送 API (多服务商: Resend/Brevo/SMTP2GO/阿里云 DirectMail)
│   │   ├── register.js           # 用户注册 API (邮箱验证码校验 + PBKDF2 密码哈希)
    │   │   ├── login.js           # 用户登录 API
    │   │   ├── logout.js          # 注销会话 API
    │   │   └── me.js              # 当前用户信息 API
    │   └── admin/
    │       ├── list.js            # 管理员拉取全部短链 API (分页)
    │       ├── delete.js          # 管理员删除短链 API (支持批量)
    │       ├── trend.js           # 管理员点击趋势统计 API (7天)
    │       ├── settings.js        # 管理员站点设置 API (注册开关)
    │       └── users/
    │           ├── links.js       # 管理员按账户（邮箱）下钻短链明细 API
    │           └── delete.js      # 管理员删除用户 API (支持批量)
    └── [code].js                  # 短链接重定向服务引擎 (TTL 过期 + 重试机制)
```

---

## 📄 开源许可 & 作者信息

- **感谢原作者**：[keaidang](https://github.com/keaidang/edgelink)
- **作者**：[info35](https://github.com/3900132)
- **开源仓库**：[GitHub - 3900132/info35org](https://github.com/3900132/info35org)

本项目依据 [MIT License](LICENSE) 协议开源。欢迎自由修改、分发与商业化使用。
