### 项目名称：OBS地震预警字幕

### 简介

专为OBS Studio设计的实时地震预警显示工具，支持多种数据源，以字幕形式展示地震预警、烈度速报、台风实况等信息。目前仅适配中国大陆地区信息展示。

### 数据源支持

项目支持两种主数据源：

- **Fan Studio**：默认数据源
- **Wolfx**：备选数据源

### 核心功能

* 双数据源支持，可自由切换
* 实时展示地震预警、烈度速报、台风实况等信息
* 可配置的台站筛选（默认距离≤50公里）
* 页面开关功能，可根据需要启用或禁用特定页面
* OBS浏览器源直接集成
* 自动滚动与页面切换
* 完善的网络状态提示

### 快速开始

1. 下载[Release页面（Github）](https://github.com/WinHCD/OBS-EEW-Subtitles/releases)或[发行版页面（Gitee）](https://gitee.com/damahoue/OBS-EEW-Subtitles/releases)中的源码包解压到本地
2. 编辑 `config.js` 自定义设置：
   - 选择数据源（`DATA_SOURCE`）
   - 修改应用信息文本
   - 调整显示参数
3. 在OBS中添加 `index.html` 为浏览器源
4. 调整大小位置，开始接收预警字幕

### 数据源切换

在 `config.js` 中修改 `DATA_SOURCE` 配置项：

```javascript
DATA_SOURCE: "fanstudio"  // 使用Fan Studio数据源（默认）
DATA_SOURCE: "wolfx"      // 使用Wolfx数据源
```

### 适配范围

目前仅支持中国大陆地区预警信息展示。

### 注意事项

- 所有预警信息仅供参考，仅限交流学习使用，请以当地官方发布信息为准
- 不同数据源提供的数据范围有所不同，请根据实际需求选择