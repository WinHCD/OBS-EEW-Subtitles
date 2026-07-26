// 配置文件
const CONFIG = {
    // ==================== 数据源配置 ====================
    // 主数据源选择: "fanstudio" 或 "wolfx"
    DATA_SOURCE: "wolfx",

    // Fan Studio WebSocket地址
    WS_ALL: "wss://ws.fanstudio.tech/all",

    // Wolfx WebSocket地址
    WOLFX_WS_ALL: "wss://ws-api.wolfx.jp/all_eew",

    // 台风预警API地址
    TYPHOON_API: "https://api.fanstudio.tech/we/typhoon.php",

    // ==================== 烈度速报配置 ====================
    // 烈度速报数据源选择:
    // "auto" - 优先NowQuake，连接失败自动切换Fan Studio（推荐）
    // "nowquake" - 仅使用NowQuake
    // "fanstudio" - 仅使用Fan Studio
    // "both" - 同时使用两个数据源
    INTENSITY_SOURCE: "auto",

    // NowQuake烈度速报HTTP接口 - 获取最新事件ID
    INT_HTTP_LASTID: "https://api-cencint-public.nowquake.cn/lastid",

    // NowQuake烈度速报HTTP接口 - 获取事件详情
    INT_HTTP_EVENT: "https://api-cencint-public.nowquake.cn/event/",

    // NowQuake烈度速报WebSocket接口 - 实时数据
    INT_WSS_REAL: "wss://api-cencint-public.nowquake.cn/websocket",

    // Fan Studio烈度速报WebSocket接口
    INT_WSS_FANSTUDIO: "wss://ws.fanstudio.tech/cenc-ir",

    // ==================== 显示参数配置 ====================
    // 滚动速度（像素/秒）
    SCROLL_SPEED: 120,

    // 无内容溢出时的翻页延迟（毫秒）
    NO_OVERFLOW_DELAY: 5000,

    // 强制显示时长（毫秒）
    FORCED_SHOW: 60000,

    // 页面切换过渡动画时长（毫秒）
    TRANSITION: 500,

    // 气象预警是否强制显示
    WEATHER_FORCED: false,

    // 最小行高（像素）
    MIN_HEIGHT: 60,

    // 高亮文本颜色
    HIGHLIGHT_COLOR: "#fff",

    // ==================== 网络请求配置 ====================
    // HTTP请求最大重试次数
    MAX_HTTP_RETRY: 10,

    // 重试延迟（毫秒）
    RETRY_DELAY: 10000,

    // HTTP请求超时（毫秒）
    HTTP_TIMEOUT: 5000,

    // WebSocket最大重连次数（0为不限制）
    MAX_WS_RECONNECT: 0,

    // 是否显示网络状态提示
    SHOW_NETWORK_STATUS: true,

    // ==================== 页面开关配置 ====================
    PAGE_ENABLED: {
        0: true, // 地震预警
        1: true, // 台网测定
        2: true, // 烈度速报
        3: true, // 海啸预警
        4: true, // 气象预警
        5: true, // 台风信息
        6: true  // 应用信息
    },

    // ==================== 烈度速报筛选配置 ====================
    INTENSITY_CONFIG: {
        MAX_STATION_DISTANCE: 50, // 台站最大距离（公里）
        MIN_INTENSITY: 0.1        // 最小计测烈度
    },

    // ==================== 应用信息配置 ====================
    APP_INFO: "所有预警信息仅供参考，仅限交流学习使用，请以当地官方发布信息为准。地震不可准确预测，不要盼灾幸灾，请理性讨论。"
};

// ==================== 页面颜色配置 ====================
const PAGE_COLOR_MAP = {
    0: "#ff3838", // 地震预警 - 红色
    1: "#3399ff", // 台网测定 - 蓝色
    2: "#00e0e0", // 烈度速报 - 青色
    3: "#32CD32", // 海啸预警 - 亮绿色
    4: "#9370DB", // 气象预警 - 中紫色
    5: "#FF8C00", // 台风信息 - 橙色
    6: "#fff"     // 应用信息 - 白色
};

// ==================== 常量定义 ====================
const ONE_DAY = 24 * 60 * 60 * 1000; // 一天的毫秒数