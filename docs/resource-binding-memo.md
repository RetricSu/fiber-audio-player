# 音频资源与支付绑定备忘

## 背景
当前实现里，支付成功后后端给前端返回 `stream token`，前端拿 token 去拉取 HLS 资源（playlist/segment/key）。

这套机制在单资源场景可用，但在未来扩展到多资源时，需要明确绑定策略。

## 术语
- 多节目：多个不同音频内容（例如 `episode-a`、`episode-b`），可以理解为多个音频资源。
- 多清晰度：同一个节目有多个码率或变体（例如 `64k`、`128k`、`320k`，或不同 HLS variant）。
- 资源 ID：唯一标识一个可授权播放对象，建议使用如 `episodeId + variantId` 组合。

## 现状（当前代码）
- `sessionId` 每次 `POST /sessions/create` 都重新生成（UUID）。
- `streamToken` 每次 session 创建时生成，在同一 session 内续费不变，只更新授权范围和过期时间。
- `paymentHash` 每次 `create invoice` 都重新生成。
- 发票没有强绑定资源字段（当前 description 类似 `Audio stream: 30s`）。
- 资源授权主要靠后端内存中的 `sessionId -> token -> maxSegmentIndex` 关联。

## 风险点（扩展到多节目/多清晰度后）
- 风险 1：如果 token 不携带资源上下文，可能出现跨资源复用风险（A 节目支付后拿同 token 访问 B 节目）。
- 风险 2：invoice 缺少资源标识，链路对账时难以证明某笔支付对应哪份内容。
- 风险 3：多清晰度下，不同 variant 的切片编号和时长可能不同，若不单独绑定会造成授权边界混乱。

## 建议方案（最小可行）
1. 在 session 创建时显式传入资源上下文：`resourceId`（至少 `episodeId`，可选 `variantId`）。
2. 后端 session 状态保存 `resourceId`，并在 `/invoices/create`、`/invoices/claim` 全链路校验一致性。
3. 发票 metadata（description 或自定义字段）写入 `resourceId`，便于日志和审计对账。
4. token claim 中加入 `resourceId`，`/stream/hls/:fileName` 校验 token 对应资源路径前缀。
5. 多清晰度时，使用 `resourceId = episodeId:variantId`，每个 variant 独立授权边界。

## 建议方案（增强版）
- 将 `streamGrants` 从内存 Map 升级为可持久化存储（避免服务重启后状态丢失）。
- 对 token 使用签名（JWT/PASETO）并携带 `resourceId`, `maxSegmentIndex`, `exp`，减少仅内存态信任。
- 增加对账日志字段：`sessionId`, `paymentHash`, `resourceId`, `variantId`, `grantedSeconds`, `maxSegmentIndex`。

## 快速结论
- 是的，多节目就是多个音频资源。
- 当前实现是应用层协商绑定，不是协议层强绑定。
- 单资源 demo 没问题；一旦走多节目/多清晰度，建议尽快加 `resourceId` 贯穿绑定。
