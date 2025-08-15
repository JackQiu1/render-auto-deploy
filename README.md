# GitHub Tag Monitor for Cloudflare Workers

🚀 自动监控 GitHub 仓库 `MoonTechLab/LunaTV` 的 tag 更新，并在检测到新 tag 时触发 Render 部署的 Cloudflare Worker。

## ✨ 功能特性

- 🔍 **自动监控**: 每 1 小时检查 GitHub 仓库的最新 tag
- 💾 **数据持久化**: 使用 Cloudflare KV 存储上次检查的 tag 信息
- 🚀 **自动部署**: 检测到新 tag 时自动触发 Render webhook 部署
- 📊 **部署历史**: 记录所有部署历史和状态
- 🔧 **手动触发**: 提供手动检查和部署的 API 端点
- 📈 **状态监控**: 实时查看当前状态和最近部署记录
- 🛡️ **错误处理**: 完善的错误处理和日志记录

## 📁 项目结构

```
update-moontv/
├── src/index.js          # 主 Worker 脚本
├── wrangler.jsonc      # Cloudflare Worker 配置
├── package.json       # 项目配置和依赖
└── README.md         # 项目说明文档
```

## 🚀 快速开始

### 1. 环境准备

确保已安装 Node.js 和 npm，然后运行快速设置：

```bash
git clone https://github.com/SeqCrafter/render-auto-deploy.git

cd render-auto-deploy

npm install
```

### 2. 登录 Cloudflare

```bash
npx wrangler login
```

### 3. 手动部署

#### 3.1 创建 KV 命名空间

```bash
npx wrangler kv namespace create "TAG_STORAGE"
```

#### 3.2 更新 wrangler.jsonc 中的 KV namespace ID,把下面这段代码复制到 wrangler.jsonc 中要把你的 kv id 填进去

```jsonc
"kv_namespaces": [
		{
			"binding": "TAG_STORAGE",
			"id": "your kv id"
		}
	]
```

#### 3.3 设置环境变量

```bash
npx wrangler secret put RENDER_WEBHOOK_URL
npx wrangler secret put GITHUB_TOKEN # 可选
```

#### 3.4 部署

```bash
npx wrangler deploy
```

## 🔧 配置说明

### 环境变量

| 变量名               | 必需 | 说明                                     |
| -------------------- | ---- | ---------------------------------------- |
| `RENDER_WEBHOOK_URL` | ✅   | Render 部署 webhook URL(在设置里找)      |
| `GITHUB_TOKEN`       | ❌   | GitHub 个人访问令牌（提高 API 速率限制） |

### Cron 调度

默认每 1 小时检查一次，可在 `wrangler.jsonc` 中修改：

```jsonc
{
	"triggers": {
		"crons": ["0 */1 * * *"]
	}
}
```

## 📡 API 端点

部署成功后，Worker 会提供以下端点：

### GET `/check-updates`

手动检查 tag 更新

**响应示例**:

```json
{
	"message": "Tag updated and deployment triggered",
	"oldTag": "v1.0.0",
	"newTag": "v1.1.0",
	"deploymentTriggered": true,
	"timestamp": "2024-01-15T10:30:00Z"
}
```

### POST `/manual-trigger`

手动触发 Render 部署

**响应示例**:

```json
{
	"message": "Manual deployment triggered successfully",
	"tag": "v1.1.0",
	"timestamp": "2024-01-15T10:35:00Z"
}
```

### GET `/status`

查看当前状态和部署历史

**响应示例**:

```json
{
	"status": "active",
	"currentTag": "v1.1.0",
	"lastCheck": "2024-01-15T10:30:00Z",
	"recentDeployments": [
		{
			"tag": "v1.1.0",
			"previousTag": "v1.0.0",
			"timestamp": "2024-01-15T10:30:00Z",
			"status": "success"
		}
	],
	"repository": "MoonTechLab/LunaTV"
}
```

## 🛠️ 开发和测试

### 本地开发

```bash
# 本地运行 Worker
npx wrangler dev
```

### 查看日志

```bash
# 实时查看 Worker 日志
npx wrangler tail
```

### 测试端点

```bash
# 检查更新
curl https://your-worker.workers.dev/check-updates

# 手动触发部署
curl -X POST https://your-worker.workers.dev/manual-trigger

# 查看状态
curl https://your-worker.workers.dev/status
```

## 📄 许可证

MIT License

---

**💡 提示**: 确保在生产环境中设置适当的错误监控和告警系统，以便及时发现和处理问题。
