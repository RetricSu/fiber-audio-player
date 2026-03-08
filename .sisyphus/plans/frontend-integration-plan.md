# 前端集成 Multi-Podcast 功能工作计划

## 当前状态分析

### ✅ 已完成集成
- **浏览功能**: PodcastList, EpisodeList 组件已对接 `/api/podcasts` 和 `/api/podcasts/:id/episodes`
- **播放功能**: AudioPlayer 已支持动态剧集数据
- **支付流程**: `createSession` 已传递 `episodeId`，支持按剧集定价
- **HLS 流**: 播放 URL 已正确拼接 token

### ❌ 缺失功能
- **管理界面**: 无法创建播客、上传剧集
- **文件上传**: 没有剧集上传组件
- **发布流程**: 无法管理剧集状态（草稿→发布）

---

## 工作阶段

### Phase 1: Admin 管理界面（核心功能）
**目标**: 让内容创作者可以管理播客和剧集

#### Task 1: Admin 布局与导航
- **文件**: `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`
- **功能**: 
  - 侧边栏导航（播客管理、剧集管理、上传队列）
  - 简单的 API Key 登录/验证
  - 响应式管理界面布局

#### Task 2: 播客管理页面
- **文件**: `src/app/admin/podcasts/page.tsx`, `src/components/admin/PodcastForm.tsx`
- **API 对接**:
  - `GET /admin/podcasts` - 获取播客列表
  - `POST /admin/podcasts` - 创建播客
  - `PUT /admin/podcasts/:id` - 更新播客
  - `DELETE /admin/podcasts/:id` - 删除播客
- **功能**:
  - 播客列表展示
  - 创建/编辑表单（标题、描述）
  - 删除确认

#### Task 3: 剧集管理页面
- **文件**: `src/app/admin/episodes/page.tsx`, `src/components/admin/EpisodeForm.tsx`
- **API 对接**:
  - `GET /admin/episodes?podcast_id=` - 获取剧集列表
  - `POST /admin/episodes` - 创建剧集元数据
  - `PUT /admin/episodes/:id` - 更新剧集
  - `DELETE /admin/episodes/:id` - 删除剧集
  - `POST /admin/episodes/:id/publish` - 发布剧集
- **功能**:
  - 按播客筛选剧集
  - 显示剧集状态（草稿/处理中/已发布）
  - 价格设置（每秒钟价格）
  - 发布/取消发布

#### Task 4: 文件上传组件
- **文件**: `src/components/admin/AudioUploader.tsx`, `src/hooks/use-audio-upload.ts`
- **API 对接**:
  - `POST /admin/episodes/:id/upload` - 上传音频文件（multipart/form-data）
  - 需要支持上传进度显示
- **功能**:
  - 拖拽上传界面
  - 文件类型验证（MP3, WAV, OGG, AAC）
  - 文件大小检查（最大 500MB）
  - 上传进度条
  - 转码状态轮询

---

### Phase 2: 前端播放体验优化
**目标**: 完善听众的播放体验

#### Task 5: 剧集详情页面
- **文件**: `src/app/episode/[id]/page.tsx`
- **API 对接**:
  - `GET /api/episodes/:id` - 获取剧集详情
- **功能**:
  - 独立剧集详情页
  - 显示剧集描述、时长、价格
  - 播放按钮
  - 分享链接

#### Task 6: 播放列表/队列
- **文件**: `src/components/Playlist.tsx`, `src/hooks/use-playlist.ts`
- **功能**:
  - 本地存储播放历史
  - "继续播放" 功能
  - 播放队列（播完一集自动播放下一集）

#### Task 7: 支付状态优化
- **文件**: `src/components/PaymentStatus.tsx`（增强）
- **功能**:
  - 更清晰的支付进度显示
  - 余额不足提醒
  - 支付历史查看

---

### Phase 3: 响应式与移动端
**目标**: 支持移动端访问

#### Task 8: 移动端布局适配
- **文件**: `src/app/page.tsx`（修改）
- **功能**:
  - 侧边栏在小屏幕下变为抽屉式
  - 触摸友好的播放器控件
  - 底部固定的播放控制栏

---

## API 端点映射

| 功能 | 端点 | 前端组件 |
|------|------|---------|
| 获取播客列表 | `GET /api/podcasts` | PodcastList |
| 获取剧集列表 | `GET /api/podcasts/:id/episodes` | EpisodeList |
| 获取剧集详情 | `GET /api/episodes/:id` | EpisodeDetail |
| 创建会话 | `POST /sessions/create` | useStreamingPayment |
| 创建发票 | `POST /invoices/create` | StreamingPaymentService |
| 认领发票 | `POST /invoices/claim` | StreamingPaymentService |
| **管理端** | | |
| 创建播客 | `POST /admin/podcasts` | PodcastForm |
| 更新播客 | `PUT /admin/podcasts/:id` | PodcastForm |
| 删除播客 | `DELETE /admin/podcasts/:id` | PodcastList |
| 创建剧集 | `POST /admin/episodes` | EpisodeForm |
| 上传音频 | `POST /admin/episodes/:id/upload` | AudioUploader |
| 发布剧集 | `POST /admin/episodes/:id/publish` | EpisodeActions |

---

## 技术方案

### 文件上传实现
```typescript
// hooks/use-audio-upload.ts
export function useAudioUpload() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  
  const upload = async (episodeId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    
    // ... 发送请求
  };
  
  return { upload, progress, status };
}
```

### Admin API Client
```typescript
// lib/admin-api.ts
const ADMIN_API_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY;

export async function createPodcast(data: { title: string; description?: string }) {
  const res = await fetch(`${BACKEND_URL}/admin/podcasts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ADMIN_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return res.json();
}
```

---

## 优先级建议

### 高优先级（MVP 必需）
1. **Task 1-4**: Admin 管理界面（创建播客、上传剧集）
   - 没有这些功能，用户无法添加内容

### 中优先级（体验优化）
2. **Task 5**: 剧集详情页
3. **Task 7**: 支付状态优化

### 低优先级（增值功能）
4. **Task 6**: 播放列表
5. **Task 8**: 移动端适配

---

## 开始工作？

建议从 **Phase 1** 开始，先完成管理界面，让用户可以：
1. 创建播客
2. 创建剧集并上传音频
3. 发布剧集

这样整个 multi-podcast 工作流就完整了！
