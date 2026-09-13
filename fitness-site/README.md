# 宏宇的新手健身指南

独立部署到 `jianshen.cosmoswong.com` 的静态 Cloudflare Worker。

## Cloudflare Workers Builds

- 仓库：`wangyucosmos/cosmoswong-site`
- Production branch：`main`
- Root directory：`fitness-site`
- Build command：留空
- Deploy command：`npm run deploy`

站点内容位于 `public/index.html`。它不会读取或修改仓库根目录的 `public/`，因此不会影响 `cosmoswong.com` 主站。
