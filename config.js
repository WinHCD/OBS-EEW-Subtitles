// 配置文件
const CONFIG={
    // WebSocket连接地址 - 所有预警数据
    WS_ALL:"wss://ws.fanstudio.tech/all",
    // 烈度速报HTTP接口 - 获取最新事件ID
    INT_HTTP_LASTID:"https://api-cencint-public.nowquake.cn/lastid",
    // 烈度速报HTTP接口 - 获取事件详情
    INT_HTTP_EVENT:"https://api-cencint-public.nowquake.cn/event/",
    // 烈度速报WebSocket接口 - 实时数据
    INT_WSS_REAL:"wss://api-cencint-public.nowquake.cn/websocket",
    // 滚动速度（像素/秒）
    SCROLL_SPEED:120,
    // 无内容溢出时的翻页延迟（毫秒）
    NO_OVERFLOW_DELAY:5000,
    // 强制显示时长（毫秒）
    FORCED_SHOW:60000,
    // 页面切换过渡动画时长（毫秒）
    TRANSITION:500,
    // 气象预警是否强制显示
    WEATHER_FORCED:false,
    // 最小行高（像素）
    MIN_HEIGHT:60,
    // 高亮文本颜色
    HIGHLIGHT_COLOR:"#fff",
    // 最大重试次数
    MAX_RETRY:10,
    // 重试延迟（毫秒）
    RETRY_DELAY:10000,
    // HTTP请求超时（毫秒）
    HTTP_TIMEOUT:5000,
    // 页面开关配置
    PAGE_ENABLED:{
        0:true, // 地震预警
        1:true, // 台网测定
        2:true, // 烈度速报
        3:true, // 海啸预警
        4:true, // 气象预警
        5:true  // 应用信息
    },
    // 烈度速报配置
    INTENSITY_CONFIG:{
        MAX_STATION_DISTANCE:50, // 台站最大距离（公里）
        MIN_INTENSITY:0.1 // 最小计测烈度
    },
    // 应用信息文本
    APP_INFO:"所有预警信息仅供参考，仅限交流学习使用，请以当地官方发布信息为准。地震不可准确预测，不要盼震盼灾，请理性讨论。 "
};
const PAGE_COLOR_MAP={0:"#ff3838",1:"#3399ff",2:"#00e0e0",3:"#ff9900",4:"#9933ff",5:"#fff"};
const ONE_DAY = 24 * 60 * 60 * 1000;