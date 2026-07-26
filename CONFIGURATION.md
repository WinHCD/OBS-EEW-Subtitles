# 配置文件使用说明

## 概述

`config.js` 是 OBS 地震预警字幕项目的核心配置文件，用于设置数据源、显示参数、网络请求参数等。通过修改此文件，可以自定义项目的各项功能和表现。

## 配置项详细说明

### 1. 数据源配置

| 配置项 | 说明 | 默认值 | 备注 |
|--------|------|--------|------|
| `DATA_SOURCE` | 主数据源选择 | `"wolfx"` | `"fanstudio"`: 使用Fan Studio数据源；`"wolfx"`: 使用Wolfx数据源 |
| `WS_ALL` | Fan Studio WebSocket 连接地址 | `wss://ws.fanstudio.tech/all` | Fan Studio 数据源地址 |
| `WOLFX_WS_ALL` | Wolfx WebSocket 连接地址 | `wss://ws-api.wolfx.jp/all_eew` | Wolfx 数据源地址 |
| `TYPHOON_API` | 台风预警API地址 | `https://api.fanstudio.tech/we/typhoon.php` | 台风数据获取地址（仅在使用Wolfx 数据源时启用） |

### 2. 烈度速报配置

| 配置项 | 说明 | 默认值 | 备注 |
|--------|------|--------|------|
| `INTENSITY_SOURCE` | 烈度速报数据源选择 | `"auto"` | `"auto"`: 优先NowQuake，失败自动切换Fan Studio；`"nowquake"`: 仅NowQuake；`"fanstudio"`: 仅Fan Studio；`"both"`: 同时使用两个数据源 |
| `INT_HTTP_LASTID` | NowQuake烈度速报 HTTP 接口 - 获取最新事件 ID | `https://api-cencint-public.nowquake.cn/lastid` | 仅 NowQuake 使用 |
| `INT_HTTP_EVENT` | NowQuake烈度速报 HTTP 接口 - 获取事件详情 | `https://api-cencint-public.nowquake.cn/event/` | 仅 NowQuake 使用 |
| `INT_WSS_REAL` | NowQuake烈度速报 WebSocket 接口 - 实时数据 | `wss://api-cencint-public.nowquake.cn/websocket` | 用于获取烈度速报的实时数据 |
| `INT_WSS_FANSTUDIO` | Fan Studio烈度速报 WebSocket 接口 | `wss://ws.fanstudio.tech/cenc-ir` | Fan Studio 烈度速报数据源 |

### 3. 显示参数配置

| 配置项 | 说明 | 默认值 | 推荐范围 | 备注 |
|--------|------|--------|----------|------|
| `SCROLL_SPEED` | 滚动速度（像素/秒） | `120` | 80-200 | 控制长文本的滚动速度 |
| `NO_OVERFLOW_DELAY` | 无内容溢出时的翻页延迟（毫秒） | `5000` | 3000-10000 | 内容不需要滚动时，页面停留的时间 |
| `FORCED_SHOW` | 强制显示时长（毫秒） | `60000` | 30000-120000 | 新数据到达时，强制显示的时间 |
| `TRANSITION` | 页面切换过渡动画时长（毫秒） | `500` | 200-1000 | 页面切换时的动画持续时间 |
| `WEATHER_FORCED` | 气象预警是否强制显示 | `false` | `true`/`false` | 设置为 `true` 时，气象预警会强制显示 |
| `MIN_HEIGHT` | 最小行高（像素） | `60` | 40-100 | 控制每行文本的最小高度 |
| `HIGHLIGHT_COLOR` | 高亮文本颜色 | `#fff` | 任何有效的 CSS 颜色值 | 控制高亮数字的显示颜色 |

### 4. 网络请求配置

| 配置项 | 说明 | 默认值 | 推荐范围 | 备注 |
|--------|------|--------|----------|------|
| `MAX_HTTP_RETRY` | HTTP 请求最大重试次数 | `10` | 5-20 | HTTP 请求失败后的最大重试次数 |
| `RETRY_DELAY` | 重试延迟（毫秒） | `10000` | 5000-30000 | 网络请求失败后，重试的间隔时间 |
| `HTTP_TIMEOUT` | HTTP 请求超时（毫秒） | `5000` | 3000-10000 | HTTP 请求的超时时间 |
| `MAX_WS_RECONNECT` | WebSocket 最大重连次数 | `0` | 0-20 | `0` 表示不限制重连次数；设置大于 0 的值时，达到该次数后停止重连 |
| `SHOW_NETWORK_STATUS` | 是否显示网络状态提示 | `true` | `true`/`false` | 设置为 `false` 时，网络断开或数据源连接失败时不显示提示信息 |

### 5. 页面开关配置

| 配置项 | 说明 | 默认值 | 备注 |
|--------|------|--------|------|
| `PAGE_ENABLED` | 页面启用状态配置 | 对象 | 控制各个页面的启用状态 |
| `PAGE_ENABLED[0]` | 地震预警页面启用状态 | `true` | 设置为 `false` 时，地震预警页面将被禁用 |
| `PAGE_ENABLED[1]` | 台网测定页面启用状态 | `true` | 设置为 `false` 时，台网测定页面将被禁用 |
| `PAGE_ENABLED[2]` | 烈度速报页面启用状态 | `true` | 设置为 `false` 时，烈度速报页面将被禁用 |
| `PAGE_ENABLED[3]` | 海啸预警页面启用状态 | `true` | 设置为 `false` 时，海啸预警页面将被禁用 |
| `PAGE_ENABLED[4]` | 气象预警页面启用状态 | `true` | 设置为 `false` 时，气象预警页面将被禁用 |
| `PAGE_ENABLED[5]` | 台风信息页面启用状态 | `true` | 设置为 `false` 时，台风信息页面将被禁用 |
| `PAGE_ENABLED[6]` | 应用信息页面启用状态 | `true` | 设置为 `false` 时，应用信息页面将被禁用 |

### 6. 烈度速报筛选配置

| 配置项 | 说明 | 默认值 | 推荐范围 | 备注 |
|--------|------|--------|----------|------|
| `INTENSITY_CONFIG.MAX_STATION_DISTANCE` | 台站最大距离（公里） | `50` | 20-100 | 只显示距离震中不超过此距离的台站数据 |
| `INTENSITY_CONFIG.MIN_INTENSITY` | 最小计测烈度 | `0.1` | 0-1 | 只显示计测烈度大于此值的台站数据 |

### 7. 应用信息配置

| 配置项 | 说明 | 默认值 | 备注 |
|--------|------|--------|------|
| `APP_INFO` | 应用信息文本 | `"所有预警信息仅供参考..."` | 显示在应用信息页面的文本内容 |

### 8. 页面颜色配置

`PAGE_COLOR_MAP` 是一个对象，用于设置不同页面的默认文本颜色：

| 页面索引 | 页面名称 | 默认颜色 |
|----------|----------|----------|
| 0 | 地震预警 | #ff3838 (红色) |
| 1 | 台网测定 | #3399ff (蓝色) |
| 2 | 烈度速报 | #00e0e0 (青色) |
| 3 | 海啸预警 | #32CD32 (亮绿色) |
| 4 | 气象预警 | #9370DB (中紫色) |
| 5 | 台风信息 | #FF8C00 (橙色) |
| 6 | 应用信息 | #fff (白色) |

> **注意**：
> - 气象预警页面的标签背景色会根据预警级别动态变化（红/橙/黄/蓝），断开连接或数据源故障时会自动恢复为默认紫色。
> - 海啸预警页面的标签背景色会根据预警级别动态变化（红/橙/黄/蓝），断开连接或数据源故障时会自动恢复为默认亮绿色。

### 9. 常量定义

| 常量 | 说明 | 值 | 备注 |
|------|------|-----|------|
| `ONE_DAY` | 一天的毫秒数 | `24 * 60 * 60 * 1000` | 用于时间计算 |

---

## 修改配置的步骤

1. 使用文本编辑器打开 `config.js` 文件
2. 根据需要修改相应的配置项值
3. 保存文件后，刷新浏览器页面或重新加载 OBS 中的网页源

## 注意事项

### 数据源配置
- 不同数据源提供的数据范围有所不同，请根据实际需求选择
- 修改数据源地址时，请确保新的地址提供与原地址相同格式的数据，否则可能导致数据解析失败
- `INTENSITY_SOURCE` 设置为 `"auto"` 时，系统会优先尝试 NowQuake 数据源，连接失败后自动切换到 Fan Studio 数据源
- 当两个数据源都无法连接时，系统将停止重连并显示"暂无烈度速报数据"
- `MAX_WS_RECONNECT` 设置为 `0` 时，WebSocket 连接将无限重连；设置为大于 0 的值时，达到该次数后停止重连

### 显示参数
- `SCROLL_SPEED` 过高可能导致文本滚动过快，影响阅读
- `NO_OVERFLOW_DELAY` 过短可能导致页面切换过快，影响信息阅读
- `FORCED_SHOW` 过长可能导致重要信息被长时间显示，影响其他信息的展示

### 网络请求配置
- `MAX_HTTP_RETRY` 过大可能导致在网络完全不可用时，应用持续尝试重连
- `MAX_WS_RECONNECT` 过大可能导致 WebSocket 连接失败后持续重连；设置为 `0` 可无限重连
- `RETRY_DELAY` 过短可能导致在网络不稳定时，频繁的重连尝试
- `HTTP_TIMEOUT` 过短可能导致在网络延迟较高时，正常的请求被判定为超时
- `SHOW_NETWORK_STATUS` 设置为 `false` 时，用户将无法看到网络断开或数据源连接失败的提示

### 烈度速报配置
- `MAX_STATION_DISTANCE` 过大可能导致显示过多的台站数据，影响页面美观
- `MIN_INTENSITY` 过小可能导致显示大量低烈度的台站数据，影响信息的可读性

### 应用信息
- 修改 `APP_INFO` 时，请确保文本内容的准确性和合法性

## 示例配置

以下是一个示例配置，使用Wolfx数据源：

```javascript
const CONFIG = {
    // 数据源配置
    DATA_SOURCE: "wolfx",
    WS_ALL: "wss://ws.fanstudio.tech/all",
    WOLFX_WS_ALL: "wss://ws-api.wolfx.jp/all_eew",
    TYPHOON_API: "https://api.fanstudio.tech/we/typhoon.php",

    // 烈度速报配置
    INTENSITY_SOURCE: "auto",
    INT_HTTP_LASTID: "https://api-cencint-public.nowquake.cn/lastid",
    INT_HTTP_EVENT: "https://api-cencint-public.nowquake.cn/event/",
    INT_WSS_REAL: "wss://api-cencint-public.nowquake.cn/websocket",
    INT_WSS_FANSTUDIO: "wss://ws.fanstudio.tech/cenc-ir",

    // 显示参数配置
    SCROLL_SPEED: 120,
    NO_OVERFLOW_DELAY: 5000,
    FORCED_SHOW: 60000,
    TRANSITION: 500,
    WEATHER_FORCED: false,
    MIN_HEIGHT: 60,
    HIGHLIGHT_COLOR: "#fff",

    // 网络请求配置
    MAX_HTTP_RETRY: 10,
    RETRY_DELAY: 10000,
    HTTP_TIMEOUT: 5000,
    MAX_WS_RECONNECT: 0,
    SHOW_NETWORK_STATUS: true,

    // 页面开关配置
    PAGE_ENABLED: {
        0: true, // 地震预警
        1: true, // 台网测定
        2: true, // 烈度速报
        3: true, // 海啸预警
        4: true, // 气象预警
        5: true, // 台风信息
        6: true  // 应用信息
    },

    // 烈度速报筛选配置
    INTENSITY_CONFIG: {
        MAX_STATION_DISTANCE: 50,
        MIN_INTENSITY: 0.1
    },

    // 应用信息配置
    APP_INFO: "所有预警信息仅供参考，仅限交流学习使用，请以当地官方发布信息为准。地震不可准确预测，不要盼震盼灾，请理性讨论。"
};

const PAGE_COLOR_MAP = {
    0: "#ff3838",
    1: "#3399ff",
    2: "#00e0e0",
    3: "#32CD32",
    4: "#9370DB",
    5: "#FF8C00",
    6: "#fff"
};

const ONE_DAY = 24 * 60 * 60 * 1000;
```

## 故障排查

如果修改配置后出现问题，请尝试以下步骤：

1. 检查配置项的值是否符合语法要求
2. 恢复为默认配置，然后逐一修改配置项，找出导致问题的配置
3. 检查浏览器控制台是否有错误信息
4. 确保网络连接正常，数据源地址可访问

## 版本兼容性

此配置文件适用于 OBS 地震预警字幕项目的当前版本。如果项目进行了重大更新，可能需要相应更新配置文件。