# CHROMA — 余彩

一款原创、可玩的电影感艺术赛车网页原型。玩家驾驶一辆低多边形小车穿越失色世界，收集 Color Seeds，让颜色像水彩一样从碰撞点向外扩散。摄影机会随世界复苏，连续地从第三人称抬升至俯视街机视角。

## 在线游玩

**https://mariommm123098.github.io/racing/**

每次推送到 `main` 分支，GitHub Actions 都会自动重新构建并发布游戏。

## 运行

```bash
npm install
npm run dev
```

浏览器打开终端给出的本地地址。生产构建：

```bash
npm run build
npm run preview
```

## 操作

- `A / D` 或 `← / →`：转向
- `W / ↑`：加速
- `S / ↓`：减速
- `P`：暂停/继续
- 触屏设备：使用屏幕底部左右按钮

## 已实现

- WebGL Shader 驱动的世界坐标颜色扩散与水彩噪声边缘
- 黑白线稿向 Pastel Low Poly 世界的局部渐变
- 第三人称到 Top Down 的同一台透视摄影机连续转场
- 原创幻想驾驶者、低多边形玩具赛车与动态披风
- Color Seeds、碰撞反馈、后半程障碍与速度系统
- 随色彩进度叠加的生成式环境音乐、Pad 与钢琴音符
- Bloom、雾、环境光、胶片颗粒与极简电影 UI

这是一个无外部美术素材的原创技术原型；视觉由 Three.js 几何、着色器和 CSS 实时生成。
