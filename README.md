### 项目名称：OBS地震预警字幕

### 简介：

专为OBS Studio设计的实时地震预警显示工具，使用Fan Studio预警接口和Nowquake烈度速报接口获取数据，以字幕形式展示地震预警和烈度速报信息，支持自定义筛选条件（如距离、烈度），目前仅适配中国大陆地区信息展示。

### 核心功能：

* 接入Fan Studio预警接口与Nowquake烈度速报接口
* 实时展示地震预警、烈度速报及台站详细信息
* 可配置的台站筛选（默认距离≤50公里）
* OBS浏览器源直接集成
* 自动滚动与页面切换

### 快速开始：

1. 下载[Release页面（Github）](https://github.com/WinHCD/OBS-EEW-Subtitles/releases)或[发行版页面（Gitee）](https://gitee.com/damahoue/OBS-EEW-Subtitles/releases)中的源码包解压到本地
2. 编辑 config.js 自定义设置，修改应用信息文本为自己需要的内容
3. 在OBS中添加 index.html 为浏览器源
4. 调整大小位置，开始接收预警字幕

### 适配范围：

目前仅支持中国大陆地区地震信息展示。

### 已知问题：

因缺少海啸预警数据实例，无法保证收到海啸预警数据后内容排版正常。

