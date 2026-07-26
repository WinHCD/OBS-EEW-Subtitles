

let webSocket=null,pingTimer=null,reconnectCount=0;
let currentPage=0,totalPage=7;
let timer=null,forcedTimer=null;
let isForcedShow=false,isScrolling=false,isInited=false;
let lastAlert="",lastMeasure="",lastIntensity="",lastTsunami="",lastWeather="",lastTyphoon="";
let curScrollingLines=[];
let measureDataCache={};
let alertStore = { lastEventId: "", lastSource: "", lastTime: 0, lastProvince: "", lastUpdates: 0 };
let intensityWebSocket=null,intensityPingTimer=null,intensityReconnectCount=0;
let intensityHttpTimer=null,intensityHttpRetryCount=0;
let isIntensityInited=false;
let fanStudioWebSocket=null,fanStudioPingTimer=null,fanStudioReconnectCount=0;
let isFanStudioInited=false;
let nowQuakeFailed=false; // NowQuake连接失败标记（用于自动切换到Fan Studio）
let fanStudioFailed=false; // Fan Studio连接失败标记
let intensitySourceStopped=false; // 烈度速报数据源停止连接标记
let wolfxWebSocket=null,wolfxPingTimer=null,wolfxReconnectCount=0,wolfxSeenTypes={};
let isWolfxInited=false;
let typhoonUpdateTimer=null; // 台风数据定时更新定时器
let animationIds={}; // 动画ID管理
let memoryCleanupTimer=null; // 内存清理定时器
let intensityExpiryCheckTimer=null; // 烈度速报过期检查定时器
let tsunamiExpiryCheckTimer=null; // 海啸预警过期检查定时器
let typhoonExpiryCheckTimer=null; // 台风信息过期检查定时器
let currentIntensityData=null; // 当前显示的烈度速报数据
let currentTsunamiData=null; // 当前显示的海啸预警数据
let currentTyphoonData=null; // 当前显示的台风信息数据
let domCache={}; // DOM节点缓存
let isConnectingMainWs=false; // 主WebSocket连接锁
let isConnectingIntensityWs=false; // 烈度速报WebSocket连接锁
let isConnectingFanStudioWs=false; // Fan Studio WebSocket连接锁
let isConnectingWolfxWs=false; // Wolfx WebSocket连接锁
let networkStatusDisplayed=false; // 网络状态是否已显示标记

// 数据源连接状态追踪
let dataSourceStatus = {
    main: { connected: false, errorType: null, errorMessage: null }, // 主数据源（地震预警等）
    intensity: { connected: false, errorType: null, errorMessage: null }, // 烈度速报NowQuake
    fanStudio: { connected: false, errorType: null, errorMessage: null },  // 烈度速报Fan Studio
    wolfx: { connected: false, errorType: null, errorMessage: null } // Wolfx数据源
};

// 错误类型枚举
const ERROR_TYPES = {
    NETWORK: 'network',           // 网络问题
    SERVER_ERROR: 'server_error', // 服务器内部错误
    SERVER_RESTART: 'server_restart', // 服务重启
    SERVER_UNAVAILABLE: 'server_unavailable', // 服务暂时不可用
    PROTOCOL_ERROR: 'protocol_error', // 协议错误
    CONNECTION_REFUSED: 'connection_refused', // 连接被拒绝
    NORMAL_CLOSE: 'normal_close'  // 正常关闭
};

const dom={
    wrap:document.getElementById("mainScrollWrapper"),
    contentWraps:[
        document.getElementById("alertContentWrap"),
        document.getElementById("measureContentWrap"),
        document.getElementById("intensityContentWrap"),
        document.getElementById("tsunamiContentWrap"),
        document.getElementById("weatherContentWrap"),
        document.getElementById("typhoonContentWrap"),
        document.getElementById("appInfoContentWrap")
    ],
    alertTag:document.getElementById("alertTag"),
    measureTag:document.getElementById("measureTag"),
    intensityTag:document.getElementById("intensityTag"),
    tsunamiTag:document.getElementById("tsunamiTag"),
    weatherTag:document.getElementById("weatherTag"),
    typhoonTag:document.getElementById("typhoonTag")
};

/**
 * 应用初始化函数
 * 负责初始化应用状态、DOM结构、网络连接等
 */
(function init() {
    // 初始化页面状态
    currentPage = 0;
    dom.wrap.style.transform = `translate3d(0, 0, 0)`;
    dom.wrap.style.webkitTransform = `translate3d(0, 0, 0)`;
    
    // 更新应用信息
    if (dom.contentWraps[6]) {
        dom.contentWraps[6].innerHTML = `
            <div class="line-item"><div class="line-text">${CONFIG.APP_INFO}</div></div>
        `;
    }
    
    // 检查初始网络状态
    if (checkNetworkStatus()) {
        console.log("✅ 网络连接正常，正在初始化WebSocket...");

        // 根据数据源配置初始化不同的WebSocket连接
        const dataSource = CONFIG.DATA_SOURCE || "fanstudio";
        if (dataSource === "wolfx") {
            // 使用Wolfx数据源
            console.log("✅ 使用Wolfx数据源");
            initWolfxWss();  // 初始化Wolfx WebSocket连接
        } else {
            // 使用Fan Studio数据源（默认）
            console.log("✅ 使用Fan Studio数据源");
            initWebSocket();      // 初始化主WebSocket连接
        }

        // 重置烈度速报数据源状态
        nowQuakeFailed = false;
        fanStudioFailed = false;
        intensitySourceStopped = false;

        // 根据配置选择烈度速报数据源
        // "auto": 优先NowQuake，失败自动切换Fan Studio，都失败则停止
        // "nowquake": 仅使用NowQuake
        // "fanstudio": 仅使用Fan Studio
        const source = CONFIG.INTENSITY_SOURCE || "auto";
        if (source === "auto") {
            initIntensityHttp();  // 初始化NowQuake烈度速报HTTP请求
            initIntensityWss();   // 初始化NowQuake烈度速报WebSocket连接
            console.log("✅ 烈度速报数据源: NowQuake（自动故障转移模式）");
        } else if (source === "nowquake") {
            initIntensityHttp();  // 初始化NowQuake烈度速报HTTP请求
            initIntensityWss();   // 初始化NowQuake烈度速报WebSocket连接
            console.log("✅ 使用NowQuake烈度速报数据源");
        } else if (source === "fanstudio") {
            initFanStudioWss();   // 初始化Fan Studio烈度速报WebSocket连接
            console.log("✅ 使用Fan Studio烈度速报数据源");
        }
    } else {
        console.log("❌ 网络连接异常，将在网络恢复后自动初始化");
    }
    
    startMemoryCleanup();   // 启动内存清理定时器
    startIntensityExpiryCheck(); // 启动烈度速报过期检查定时器
    startTsunamiExpiryCheck(); // 启动海啸预警过期检查定时器
    startTyphoonExpiryCheck(); // 启动台风信息过期检查定时器
    startNetworkMonitor();  // 启动网络状态监听器
    startPageLogic();       // 启动页面逻辑
    
    const intensitySource = CONFIG.INTENSITY_SOURCE || "auto";
    const sourceName = intensitySource === "fanstudio" ? "Fan Studio" : 
                       intensitySource === "both" ? "NowQuake + Fan Studio" : 
                       intensitySource === "auto" ? "NowQuake（自动故障转移）" : "NowQuake";
    console.log("✅ 预警OBS版初始化完成（包含最终烈度速报解析逻辑）");
    console.log(`✅ 烈度速报数据源: ${sourceName}`);
    console.log("✅ 内存清理机制已启动");
    console.log("✅ 网络状态监听器已启动");
})();

// 获取并缓存DOM节点
function getCachedDOM(page, selector) {
    const cacheKey = `${page}_${selector}`;
    if (!domCache[cacheKey]) {
        const wrap = dom.contentWraps[page];
        if (wrap) {
            domCache[cacheKey] = wrap.querySelectorAll(selector);
        }
    }
    return domCache[cacheKey] || [];
}

// 清除特定页面的DOM缓存
function clearDOMCache(page) {
    Object.keys(domCache).forEach(key => {
        if (key.startsWith(`${page}_`)) {
            delete domCache[key];
        }
    });
}

/**
 * 启动页面逻辑
 * 负责处理页面滚动、动画等逻辑
 */
function startPageLogic() {
    clearTimer();
    
    const wrap = dom.contentWraps[currentPage];
    if (!wrap) return;
    
    // 检查当前页面是否启用
    if (!CONFIG.PAGE_ENABLED[currentPage]) {
        // 如果当前页面已禁用，直接切换到下一个页面
        doPageTurn();
        return;
    }
    
    // 清除当前页面的DOM缓存，确保获取最新的DOM结构
    clearDOMCache(currentPage);
    
    // 使用缓存获取DOM节点
    const lineItems = getCachedDOM(currentPage, ".line-item");
    let hasScrolling = false;
    
    // 重置滚动状态
    isScrolling = false;
    curScrollingLines = [];
    
    lineItems.forEach(lineItem => {
        lineItem.classList.remove("overflow");
        const lineText = lineItem.querySelector(".line-text");
        if (!lineText) return;

        lineText.offsetWidth;
        const isOverflow = lineText.scrollWidth > lineItem.clientWidth;
        
        if (isOverflow) {
            lineItem.classList.add("overflow");
            hasScrolling = true;
            isScrolling = true;
            curScrollingLines.push(lineItem);
            startLineScroll(lineText, lineItem);
        }
    });
    
    if (!hasScrolling && !isForcedShow) {
        timer = setTimeout(doPageTurn, CONFIG.NO_OVERFLOW_DELAY);
    }
}

/**
 * 页面切换函数
 * 负责处理页面之间的切换逻辑
 */
function doPageTurn() {
    if (isForcedShow || isScrolling || curScrollingLines.length > 0) return;
    
    // 找到下一个启用的页面
    let nextPage = currentPage;
    for (let i = 1; i <= totalPage; i++) {
        nextPage = (currentPage + i) % totalPage;
        if (CONFIG.PAGE_ENABLED[nextPage]) {
            break;
        }
    }
    
    dom.wrap.style.transform = `translate3d(0, ${-100*nextPage}%, 0)`;
    dom.wrap.style.webkitTransform = `translate3d(0, ${-100*nextPage}%, 0)`;
    
    const onTransEnd = () => {
        dom.wrap.removeEventListener("transitionend", onTransEnd);
        dom.wrap.removeEventListener("webkitTransitionEnd", onTransEnd);
        currentPage = nextPage;
        startPageLogic();
    };

    dom.wrap.removeEventListener("transitionend", onTransEnd);
    dom.wrap.removeEventListener("webkitTransitionEnd", onTransEnd);
    dom.wrap.addEventListener("transitionend", onTransEnd);
    dom.wrap.addEventListener("webkitTransitionEnd", onTransEnd);
    
    setTimeout(() => {
        dom.wrap.removeEventListener("transitionend", onTransEnd);
        dom.wrap.removeEventListener("webkitTransitionEnd", onTransEnd);
        currentPage = nextPage;
        startPageLogic();
    }, CONFIG.TRANSITION + 100);
}

/**
 * 启动文本滚动动画
 * 负责处理文本内容过长时的滚动显示
 * @param {HTMLElement} lineText - 要滚动的文本元素
 * @param {HTMLElement} lineItem - 文本元素的容器
 */
function startLineScroll(lineText, lineItem) {
    if (!lineText || !lineItem) return;
    
    // 清除之前的动画和事件监听器
    lineText.style.animation = "";
    lineText.style.webkitAnimation = "";
    lineText.removeEventListener('animationend', () => {});
    lineText.removeEventListener('webkitAnimationEnd', () => {});
    
    // 清除之前的动画ID
    const lineItemId = lineItem.getAttribute('data-animation-id') || `anim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    lineItem.setAttribute('data-animation-id', lineItemId);
    
    if (animationIds[lineItemId]) {
        cancelAnimationFrame(animationIds[lineItemId]);
        delete animationIds[lineItemId];
    }
    
    // 计算容器宽度和元素宽度
    const containerWidth = lineItem.clientWidth;
    const contentWidth = lineText.scrollWidth;
    
    // 设置初始位置：容器右侧外
    let currentPosition = containerWidth;
    // 使用transform进行定位，避免重排
    lineText.style.transform = `translate3d(${currentPosition}px, 0, 0)`;
    lineText.style.webkitTransform = `translate3d(${currentPosition}px, 0, 0)`;
    lineText.style.transition = "";
    lineText.style.webkitTransition = "";
    // 添加will-change提示浏览器，优化动画性能
    lineText.style.willChange = "transform";
    
    // 强制重排，确保初始位置生效
    lineText.offsetWidth;
    
    // 计算滚动距离和持续时间（转换为毫秒）
    const totalScrollDistance = contentWidth + containerWidth;
    const scrollDuration = Math.round((totalScrollDistance / CONFIG.SCROLL_SPEED) * 1000);
    const startTime = performance.now();
    
    // 使用requestAnimationFrame实现平滑滚动
    function animate(currentTime) {
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / scrollDuration, 1);
        const newPosition = containerWidth - totalScrollDistance * progress;
        
        // 使用transform进行动画，避免重排
        lineText.style.transform = `translate3d(${newPosition}px, 0, 0)`;
        lineText.style.webkitTransform = `translate3d(${newPosition}px, 0, 0)`;
        
        if (progress < 1) {
            animationIds[lineItemId] = requestAnimationFrame(animate);
        } else {
            // 滚动结束
            lineText.style.transform = "";
            lineText.style.webkitTransform = "";
            // 清除will-change属性
            lineText.style.willChange = "";
            curScrollingLines = curScrollingLines.filter(item => item !== lineItem);
            isScrolling = false;
            
            // 清除动画ID
            if (animationIds[lineItemId]) {
                delete animationIds[lineItemId];
            }
            
            // 如果处于强制显示状态，重新启动滚动
            if (isForcedShow) {
                setTimeout(() => {
                    startLineScroll(lineText, lineItem);
                }, 500); // 短暂延迟后重新开始滚动
            } else {
                setTimeout(() => {
                    if (curScrollingLines.length === 0) {
                        doPageTurn();
                    }
                }, 100);
            }
        }
    }
    
    // 开始动画
    animationIds[lineItemId] = requestAnimationFrame(animate);
}

/**
 * 添加标签闪烁效果
 * 为指定页面的标签添加闪烁动画
 * @param {number} page - 页面索引
 */
function addTagBlink(page) {
    removeAllTagBlink();
    switch (page) {
        case 0:
            dom.alertTag.classList.add("tag-blink");
            break;
        case 1:
            dom.measureTag.classList.add("tag-blink");
            break;
        case 2:
            dom.intensityTag.classList.add("tag-blink");
            break;
        case 3:
            dom.tsunamiTag.classList.add("tag-blink");
            break;
        case 5:
            dom.typhoonTag.classList.add("tag-blink");
            break;
    }
}

/**
 * 移除所有标签的闪烁效果
 * 清除所有标签的闪烁动画
 */
function removeAllTagBlink() {
    dom.alertTag.classList.remove("tag-blink");
    dom.measureTag.classList.remove("tag-blink");
    dom.intensityTag.classList.remove("tag-blink");
    dom.tsunamiTag.classList.remove("tag-blink");
    dom.weatherTag.classList.remove("tag-blink");
    dom.typhoonTag.classList.remove("tag-blink");
}

/**
 * 渲染内容函数
 * 负责在指定页面渲染内容
 * @param {number} page - 页面索引
 * @param {boolean} isDoubleLine - 是否为双行显示
 * @param {string} line1 - 第一行内容
 * @param {string} line2 - 第二行内容（可选）
 * @param {string} color - 文本颜色（可选）
 */
function renderContent(page, isDoubleLine, line1, line2 = "", color = "") {
    const wrap = dom.contentWraps[page];
    if (!wrap) return;
    
    // 检查页面是否启用
    if (!CONFIG.PAGE_ENABLED[page]) {
        // 清空禁用页面的内容
        wrap.innerHTML = "";
        clearDOMCache(page);
        return;
    }
    
    // 使用DocumentFragment批量更新DOM
    const fragment = document.createDocumentFragment();
    const highlightStyle = `style="color:${CONFIG.HIGHLIGHT_COLOR}"`;
    line1 = line1.replace(/<span class="highlight-num">/g, `<span class="highlight-num" ${highlightStyle}>`);
    line2 = line2.replace(/<span class="highlight-num">/g, `<span class="highlight-num" ${highlightStyle}>`);
    
    // 创建第一个行项目
    const lineItem1 = document.createElement("div");
    lineItem1.className = "line-item";
    const lineText1 = document.createElement("div");
    lineText1.className = "line-text";
    if (color) {
        lineText1.style.color = color;
    }
    lineText1.innerHTML = line1;
    lineItem1.appendChild(lineText1);
    fragment.appendChild(lineItem1);
    
    // 如果是双行，创建第二个行项目
    if (isDoubleLine) {
        const lineItem2 = document.createElement("div");
        lineItem2.className = "line-item";
        const lineText2 = document.createElement("div");
        lineText2.className = "line-text";
        if (color) {
            lineText2.style.color = color;
        }
        lineText2.innerHTML = line2;
        lineItem2.appendChild(lineText2);
        fragment.appendChild(lineItem2);
    }
    
    // 清空并添加新内容
    wrap.innerHTML = "";
    wrap.appendChild(fragment);

    // 清除对应页面的DOM缓存，确保下次获取的是最新的DOM结构
    clearDOMCache(page);

    // 强制重排，确保样式生效
    wrap.offsetWidth;

    if (currentPage === page) {
        startPageLogic();
    }
}

/**
 * 渲染历史数据
 * 用于渲染非实时的历史预警数据
 * @param {number} page - 页面索引
 * @param {boolean} isDoubleLine - 是否为双行显示
 * @param {string} line1 - 第一行内容
 * @param {string} line2 - 第二行内容（可选）
 * @param {string} color - 文本颜色（可选）
 */
function renderHistoryData(page, isDoubleLine, line1, line2 = "", color = "") {
    renderContent(page, isDoubleLine, line1, line2, color);
}

/**
 * 渲染实时数据
 * 用于渲染实时预警数据，会强制显示并添加闪烁效果
 * @param {number} page - 页面索引
 * @param {boolean} isDoubleLine - 是否为双行显示
 * @param {string} line1 - 第一行内容
 * @param {string} line2 - 第二行内容（可选）
 * @param {string} color - 文本颜色（可选）
 */
function renderRealTimeData(page, isDoubleLine, line1, line2 = "", color = "") {
    // 检查页面是否启用
    if (!CONFIG.PAGE_ENABLED[page]) {
        console.log(`⚠️  页面 ${page} 已禁用，跳过显示`);
        return;
    }
    
    // 立即处理数据，确保新数据能够触发强制显示
    console.log(`✅ 收到新数据，正在显示页面 ${page}`);
    
    // 清除所有定时器
    clearAllTimer();
    
    // 设置强制显示状态
    isForcedShow = true;
    isScrolling = false;
    
    // 重置动画和事件监听器
    document.querySelectorAll('.line-text').forEach(text => {
        text.style.animation = "";
        text.style.webkitAnimation = "";
    });
    
    // 立即跳转到对应页面
    const targetColor = color || PAGE_COLOR_MAP[page] || "#fff";
    dom.wrap.style.transition = `transform ${CONFIG.TRANSITION/1000}s ease-in-out`;
    dom.wrap.style.transform = `translate3d(0, ${-100*page}%, 0)`;
    
    // 渲染内容
    renderContent(page, isDoubleLine, line1, line2, targetColor);
    currentPage = page;
    
    // 添加标签闪烁效果
    addTagBlink(page);
    
    // 启动页面逻辑
    startPageLogic();
    
    // 设置强制显示定时器
    forcedTimer = setTimeout(() => {
        console.log(`✅ 强制显示时间结束，准备恢复自动翻页`);
        removeAllTagBlink();
        
        // 检查是否有滚动正在进行
        if (isScrolling || curScrollingLines.length > 0) {
            console.log(`⚠️  滚动未完成，等待滚动结束后恢复翻页`);
            // 等待滚动完成后再恢复正常翻页
            const checkScrollComplete = setInterval(() => {
                if (!isScrolling && curScrollingLines.length === 0) {
                    clearInterval(checkScrollComplete);
                    isForcedShow = false;
                    startPageLogic();
                    console.log(`✅ 滚动已完成，恢复自动翻页`);
                }
            }, 100);
        } else {
            // 没有滚动正在进行，立即恢复正常翻页
            isForcedShow = false;
            startPageLogic();
            console.log(`✅ 恢复自动翻页`);
        }
    }, CONFIG.FORCED_SHOW);
}

/**
 * 解析地震预警数据
 * 负责处理来自不同来源的地震预警数据
 * @param {Object} data - 预警数据对象
 * @param {string} source - 数据来源
 */
function parseAlertData(data, source, isInitial = false) {
    if (!data?.id || !data?.placeName || !data.magnitude) return;

    console.log(`✅ 收到地震预警数据：${data.placeName} ${data.magnitude}级`);

    const eventId = data.eventId;
    const isNational = source === "cea";
    const isProvincial = source === "cea-pr";

    // 处理逻辑：
    // 1. 通过比较 eventId 来判断数据的新旧
    // 2. eventId 格式为 202509120550.0001，先比较 . 前面的部分，再比较 . 后面的部分
    // 3. eventId 相同的情况下比较 updates 数值
    // 4. 优先显示国家级数据
    
    // 检查是否有 eventId
    if (!eventId) {
        console.log(`⚠️  缺少 eventId 的预警数据，跳过处理：${data.placeName} ${data.magnitude}级`);
        return;
    }
    
    // 比较 eventId 的函数
    function compareEventId(newId, oldId) {
        if (!oldId) return true; // 没有旧数据，新数据更        
        const newParts = newId.split('.');
        const oldParts = oldId.split('.');
        
        // 比较 . 前面的部分
        if (newParts[0] > oldParts[0]) return true;
        if (newParts[0] < oldParts[0]) return false;
        
        // . 前面的部分相同，比较 . 后面的部分
        if (newParts[1] > oldParts[1]) return true;
        if (newParts[1] < oldParts[1]) return false;
        
        return false; // eventId 相同
    }
    
    // 比较 updates 的函数
    function compareUpdates(newUpdates, oldUpdates) {
        return (parseInt(newUpdates) || 0) > (parseInt(oldUpdates) || 0);
    }
    
    // 检查是否是新数据
    const isEventIdNewer = compareEventId(eventId, alertStore.lastEventId);
    const isEventIdOlder = compareEventId(alertStore.lastEventId, eventId);
    const isUpdatesNewer = compareUpdates(data.updates, alertStore.lastUpdates);
    
    // 处理逻辑：
    // 1. 如果 eventId 不同，新的 eventId 更晚，处理
    // 2. 如果 eventId 相同，updates 更大，处理
    // 3. 如果是国家级数据，且 eventId 相同或更晚，处理
    // 4. 其他情况，跳过处理
    if (isEventIdOlder) {
        // eventId 更旧，跳过处理
        console.log(`⚠️  eventId更旧的预警数据，跳过处理：${data.placeName} ${data.magnitude}级`);
        return;
    }
    
    if (!isEventIdNewer && !isUpdatesNewer) {
        if (!isNational && alertStore.lastSource === "cea") {
            console.log(`⚠️  存在国家级预警数据，跳过处理省级预警数据：${data.placeName} ${data.magnitude}级`);
            return;
        }
        console.log(`⚠️  旧预警数据，跳过处理：${data.placeName} ${data.magnitude}级`);
        return;
    }
    
    // 确保不同省份的预警能够被处理
    console.log(`📊 处理预警数据：省份=${data.province || '未知'}，来源=${source}，eventId=${eventId}，updates=${data.updates || 1}`);
    
    // 记录处理的预警数据
    alertStore.lastEventId = eventId;
    alertStore.lastSource = source;
    alertStore.lastUpdates = data.updates || 1;
    alertStore.lastProvince = data.province || "未知";

    let line1;
    // 显示逻辑：
    // 1. 国家级数据显示中国地震预警网
    // 2. 省级数据显示省份地震局
    if (isNational) {
        line1 = `中国地震预警网预警第${data.updates || 1}报`;
    } else if (data.province && data.province.trim() !== "" && data.province.trim() !== "中国") {
        line1 = `${data.province.trim()}地震局预警第${data.updates || 1}报`;
    } else {
        line1 = `${(data.province || "未知").trim()}地震局预警第${data.updates || 1}报`;
    }

    const line2 = `${data.shockTime || "未知时间"} ${data.placeName} 发生<span class="highlight-num">${data.magnitude}</span>级地震，深度<span class="highlight-num">${data.depth || "未知"}</span>公里，预计最大烈度<span class="highlight-num">${data.epiIntensity || "未知"}</span>度。`;
    
    // 根据是否是初始化数据决定使用哪个渲染函数
    if (isInitial) {
        renderHistoryData(0, true, line1, line2);
    } else {
        renderRealTimeData(0, true, line1, line2);
    }
}

/**
 * 处理台网测定数据缓存
 * 负责整理和筛选台网测定数据，优先保留正式测定结果
 * @returns {Object|null} - 处理后的最新台网测定数据
 */
function handleMeasureCache() {
    const eventMap = {};
    Object.values(measureDataCache).forEach(item => {
        const { data, source } = item;
        const eventKey = data.eventId || `${data.placeName}_${data.magnitude}`;
        if (source !== "cenc") {
            eventMap[eventKey] = item;
            return;
        }
        const isCurFormal = data.infoTypeName?.includes("正式") ?? false;
        if (!eventMap[eventKey]) {
            eventMap[eventKey] = item;
            return;
        }
        const existItem = eventMap[eventKey];
        const isExistFormal = existItem.data.infoTypeName?.includes("正式") ?? false;
        if (isCurFormal && !isExistFormal) {
            eventMap[eventKey] = item;
        }
    });
    const sortedList = Object.values(eventMap).sort((a, b) => {
        const timeA = new Date(a.data.shockTime).getTime() || 0;
        const timeB = new Date(b.data.shockTime).getTime() || 0;
        return timeB - timeA;
    });
    return sortedList.length > 0 ? sortedList[0] : null;
}

/**
 * 解析台网测定数据
 * 负责处理来自不同地震台网的测定数据
 * @param {Object} data - 台网测定数据对象
 */
function parseMeasureData(data, source, isInitial = false) {
    const sourceMap = {ningxia: "宁夏地震局地震信息", guangxi: "广西地震局地震信息", shanxi: "山西地震局地震信息", beijing: "北京地震局地震信息", shandong: "山东地震局地震信息", yunnan: "云南地震局地震信息", cenc: "中国地震台网中心"};
    const currentSource = source || parseMeasureData.source || "cenc";
    const isCencSource = currentSource === "cenc";
    if ((isCencSource && (!data?.id || !data?.placeName || !data?.magnitude || data.magnitude === 0)) || (!isCencSource && (!data?.shockTime || !data?.placeName || !data?.magnitude || data.magnitude === 0))) {
        const latestData = handleMeasureCache();
        if (latestData) {
            // 当数据验证失败时，使用历史数据渲染，不触发强制显示
            renderHistoryData(1, true, 
                latestData.source !== "cenc" ? `${sourceMap[latestData.source]}` : `中国地震台网中心${latestData.data.infoTypeName?.includes("正式") ? "正式测定" : latestData.data.infoTypeName?.includes("自动") ? "自动测定" : "测定"}`,
                `${latestData.data.shockTime || "未知时间"} ${latestData.data.placeName} 发生<span class="highlight-num">${latestData.data.magnitude}</span>级地震，深度<span class="highlight-num">${latestData.data.depth || "未知"}</span>公里。`
            );
        } else {
            renderHistoryData(1, false, "暂无台网测定数据");
        }
        return;
    }
    
    console.log(`✅ 收到台网测定数据：${data.placeName} ${data.magnitude}级`);

    // 生成事件唯一标识，用于去重
    const eventKey = data.eventId || `${data.placeName}_${data.magnitude}`;
    
    // 检查是否是同一事件的相同类型数据
    const existingItem = Object.values(measureDataCache).find(item => {
        const itemEventKey = item.data.eventId || `${item.data.placeName}_${item.data.magnitude}`;
        const isSameEvent = itemEventKey === eventKey;
        const isSameType = item.data.infoTypeName === data.infoTypeName;
        return isSameEvent && isSameType;
    });
    
    // 如果是同一事件的相同类型数据，且数据没有变化，则跳过处理
    if (existingItem) {
        const existingData = existingItem.data;
        const isDataSame = 
            existingData.id === data.id &&
            existingData.magnitude === data.magnitude &&
            existingData.placeName === data.placeName &&
            existingData.shockTime === data.shockTime &&
            existingData.depth === data.depth &&
            existingData.infoTypeName === data.infoTypeName;
        
        if (isDataSame) {
            console.log(`⚠️  同一事件的相同类型数据，数据无变化，跳过处理：${data.placeName} ${data.magnitude}级`);
            return;
        }
    }
    
    // 生成唯一ID用于缓存
    const uniqueId = isCencSource ? `${data.id}_${data.magnitude}_${data.placeName}_${data.shockTime || Date.now()}_${data.infoTypeName || ""}` : `${data.eventId || ""}_${data.id || ""}_${data.shockTime}_${data.placeName}_${data.magnitude}_${data.depth || 0}`;
    lastMeasure = uniqueId;
    measureDataCache[uniqueId] = {data, source: currentSource, uniqueId};
    const latestData = handleMeasureCache();
    if (latestData) {
        // 检查latestData是否就是刚收到的数据
        const latestUniqueId = isCencSource ? `${latestData.data.id}_${latestData.data.magnitude}_${latestData.data.placeName}_${latestData.data.shockTime || Date.now()}_${latestData.data.infoTypeName || ""}` : `${latestData.data.eventId || ""}_${latestData.data.id || ""}_${latestData.data.shockTime}_${latestData.data.placeName}_${latestData.data.magnitude}_${latestData.data.depth || 0}`;
        if (latestUniqueId === uniqueId) {
            // 如果latestData就是刚收到的数据，才强制显示
            renderMeasureLatest(latestData, isInitial);
        } else {
            // 如果latestData是从缓存中获取的其他数据（如更旧的正式测定数据），则使用历史数据渲染
            renderHistoryData(1, true, 
                latestData.source !== "cenc" ? `${sourceMap[latestData.source]}` : `中国地震台网中心${latestData.data.infoTypeName?.includes("正式") ? "正式测定" : latestData.data.infoTypeName?.includes("自动") ? "自动测定" : "测定"}`,
                `${latestData.data.shockTime || "未知时间"} ${latestData.data.placeName} 发生<span class="highlight-num">${latestData.data.magnitude}</span>级地震，深度<span class="highlight-num">${latestData.data.depth || "未知"}</span>公里。`
            );
        }
    } else {
        renderHistoryData(1, false, "暂无台网测定数据");
    }
}

/**
 * 渲染台网测定最新数据
 * 负责渲染处理后的最新台网测定数据
 * @param {Object} latestItem - 最新台网测定数据项
 */
function renderMeasureLatest(latestItem, isInitial = false) {
    const {data, source} = latestItem;
    const sourceMap = {ningxia: "宁夏地震局地震信息", guangxi: "广西地震局地震信息", shanxi: "山西地震局地震信息", beijing: "北京地震局地震信息", shandong: "山东地震局地震信息", yunnan: "云南地震局地震信息", cenc: "中国地震台网中心"};
    const isFormal = source === "cenc" ? (data.infoTypeName?.includes("正式") || false) : false;
    const isAuto = source === "cenc" ? (data.infoTypeName?.includes("自动") || false) : false;
    const dataType = isFormal ? "正式测定" : (isAuto ? "自动测定" : "测定");
    
    console.log(`✅ 渲染台网测定数据：${data.placeName} ${data.magnitude}级`);

    const line1 = source !== "cenc" ? `${sourceMap[source]}` : `中国地震台网中心${dataType}`;
    const line2 = `${data.shockTime || "未知时间"} ${data.placeName} 发生<span class="highlight-num">${data.magnitude}</span>级地震，深度<span class="highlight-num">${data.depth || "未知"}</span>公里。`;
    
    // 根据是否是初始化数据决定使用哪个渲染函数
    if (isInitial) {
        renderHistoryData(1, true, line1, line2);
    } else {
        renderRealTimeData(1, true, line1, line2);
    }
}

/**
 * 解析Wolfx数据
 * 负责处理来自Wolfx的多种数据源类型（仅国内数据）
 * @param {Object} data - Wolfx数据对象
 * @param {string} type - 数据类型（sc_eew, fj_eew, cenc_eew等）
 * @param {boolean} isInitial - 是否是初始化数据
 */
function parseWolfxData(data, type, isInitial = false) {
    if (!data || !type) return;

    // 根据数据类型分发处理（仅国内数据源）
    switch (type) {
        case 'sc_eew':
            parseWolfxScEew(data, isInitial);
            break;
        case 'fj_eew':
            parseWolfxFjEew(data, isInitial);
            break;
        case 'cq_eew':
            parseWolfxCqEew(data, isInitial);
            break;
        case 'cenc_eew':
            parseWolfxCencEew(data, isInitial);
            break;
        case 'cenc_eqlist':
            parseWolfxCencEqlist(data, isInitial);
            break;
        // 日本数据源不处理
        case 'jma_eew':
        case 'jma_eqlist':
            console.log(`ℹ️ 跳过日本数据源: ${type}`);
            break;
        default:
            console.log(`⚠️ 未知的Wolfx数据类型: ${type}`);
    }
}

/**
 * 解析Wolfx JMA緊急地震速報数据
 * @param {Object} data - JMA地震预警数据
 * @param {boolean} isInitial - 是否是初始化数据
 */
function parseWolfxJmaEew(data, isInitial = false) {
    // 验证必要字段
    if (!data.EventID) {
        console.log('⚠️ JMA地震预警数据缺少EventID，跳过处理');
        return;
    }

    // 检查是否是训练报或取消报
    if (data.isTraining) {
        console.log('⚠️ JMA训练报，跳过处理');
        return;
    }

    if (data.isCancel) {
        console.log('📢 JMA取消报:', data.EventID);
        // TODO: 处理取消报
        return;
    }

    console.log(`✅ 收到JMA地震预警：${data.Hypocenter || '未知'} ${data.Magunitude || '?'}级`);

    // 构建显示文本
    const line1 = `日本气象厅紧急地震速报第${data.Serial || 1}报${data.isWarn ? '（警报）' : ''}`;
    let line2 = '';

    if (data.isAssumption) {
        // 推定震源（PLUM法）
        line2 = `${data.OriginTime || '未知时间'} 推定震源${data.Hypocenter || '未知'}，预计最大震度${data.MaxIntensity || '未知'}。`;
    } else {
        line2 = `${data.OriginTime || '未知时间'} ${data.Hypocenter || '未知'} 发生<span class="highlight-num">${data.Magunitude || '?'}</span>级地震，深度<span class="highlight-num">${data.Depth || '?'}</span>公里，预计最大震度<span class="highlight-num">${data.MaxIntensity || '未知'}</span>。`;
    }

    // 渲染数据
    if (isInitial) {
        renderHistoryData(0, true, line1, line2);
    } else {
        renderRealTimeData(0, true, line1, line2);
    }
}

/**
 * 解析Wolfx四川地震局地震预警数据
 * @param {Object} data - 四川地震局预警数据
 * @param {boolean} isInitial - 是否是初始化数据
 */
function parseWolfxScEew(data, isInitial = false) {
    if (!data.EventID) {
        console.log('⚠️ 四川地震局预警数据缺少EventID，跳过处理');
        return;
    }

    console.log(`✅ 收到四川地震局预警：${data.HypoCenter || '未知'} ${data.Magunitude || '?'}级`);

    const line1 = `四川省地震局预警第${data.ReportNum || 1}报`;
    const line2 = `${data.OriginTime || '未知时间'} ${data.HypoCenter || '未知'} 发生<span class="highlight-num">${data.Magunitude || '?'}</span>级地震，深度<span class="highlight-num">${data.Depth || '未知'}</span>公里，预计最大烈度<span class="highlight-num">${data.MaxIntensity || '未知'}</span>度。`;

    if (isInitial) {
        renderHistoryData(0, true, line1, line2);
    } else {
        renderRealTimeData(0, true, line1, line2);
    }
}

/**
 * 解析Wolfx福建地震局地震预警数据
 * @param {Object} data - 福建地震局预警数据
 * @param {boolean} isInitial - 是否是初始化数据
 */
function parseWolfxFjEew(data, isInitial = false) {
    if (!data.EventID) {
        console.log('⚠️ 福建地震局预警数据缺少EventID，跳过处理');
        return;
    }

    console.log(`✅ 收到福建地震局预警：${data.HypoCenter || '未知'} ${data.Magunitude || '?'}级`);

    const line1 = `福建省地震局预警第${data.ReportNum || 1}报`;
    const line2 = `${data.OriginTime || '未知时间'} ${data.HypoCenter || '未知'} 发生<span class="highlight-num">${data.Magunitude || '?'}</span>级地震${data.isFinal ? '（最终报）' : ''}。`;

    if (isInitial) {
        renderHistoryData(0, true, line1, line2);
    } else {
        renderRealTimeData(0, true, line1, line2);
    }
}

/**
 * 解析Wolfx重庆地震局地震预警数据
 * @param {Object} data - 重庆地震局预警数据
 * @param {boolean} isInitial - 是否是初始化数据
 */
function parseWolfxCqEew(data, isInitial = false) {
    if (!data.EventID) {
        console.log('⚠️ 重庆地震局预警数据缺少EventID，跳过处理');
        return;
    }

    console.log(`✅ 收到重庆地震局预警：${data.HypoCenter || '未知'} ${data.Magnitude || '?'}级`);

    const line1 = `重庆市地震局预警第${data.ReportNum || 1}报`;
    const line2 = `${data.OriginTime || '未知时间'} ${data.HypoCenter || '未知'} 发生<span class="highlight-num">${data.Magnitude || '?'}</span>级地震，深度<span class="highlight-num">${data.Depth || '未知'}</span>公里，预计最大烈度<span class="highlight-num">${data.MaxIntensity || '未知'}</span>度。`;

    if (isInitial) {
        renderHistoryData(0, true, line1, line2);
    } else {
        renderRealTimeData(0, true, line1, line2);
    }
}

/**
 * 解析Wolfx中国地震台网地震预警数据
 * @param {Object} data - 中国地震台网预警数据
 * @param {boolean} isInitial - 是否是初始化数据
 */
function parseWolfxCencEew(data, isInitial = false) {
    if (!data.EventID) {
        console.log('⚠️ 中国地震台网预警数据缺少EventID，跳过处理');
        return;
    }

    console.log(`✅ 收到中国地震台网预警：${data.HypoCenter || '未知'} ${data.Magnitude || '?'}级`);

    const line1 = `中国地震预警网预警第${data.ReportNum || 1}报`;
    const line2 = `${data.OriginTime || '未知时间'} ${data.HypoCenter || '未知'} 发生<span class="highlight-num">${data.Magnitude || '?'}</span>级地震，深度<span class="highlight-num">${data.Depth || '未知'}</span>公里，预计最大烈度<span class="highlight-num">${data.MaxIntensity || '未知'}</span>度。`;

    if (isInitial) {
        renderHistoryData(0, true, line1, line2);
    } else {
        renderRealTimeData(0, true, line1, line2);
    }
}

/**
 * 解析Wolfx中国地震台网地震信息列表
 * @param {Object} data - 地震信息列表数据
 * @param {boolean} isInitial - 是否是初始化数据
 */
function parseWolfxCencEqlist(data, isInitial = false) {
    // 查找第一条地震信息（键名为 "No1"）
    const firstQuake = data['No1'];
    if (!firstQuake || !firstQuake.location) {
        console.log('⚠️ 中国地震台网地震信息数据无效');
        return;
    }

    console.log(`✅ 收到中国地震台网地震信息：${firstQuake.location} ${firstQuake.magnitude}级`);

    const dataType = firstQuake.type === 'automatic' ? '自动测定' : '正式测定';
    const line1 = `中国地震台网中心${dataType}`;
    const line2 = `${firstQuake.time || '未知时间'} ${firstQuake.location} 发生<span class="highlight-num">${firstQuake.magnitude}</span>级地震，深度<span class="highlight-num">${firstQuake.depth}</span>公里。`;

    if (isInitial) {
        renderHistoryData(1, true, line1, line2);
    } else {
        renderRealTimeData(1, true, line1, line2);
    }
}

/**
 * 解析Wolfx JMA地震情報列表
 * @param {Object} data - JMA地震信息列表数据
 * @param {boolean} isInitial - 是否是初始化数据
 */
function parseWolfxJmaEqlist(data, isInitial = false) {
    // 查找第一条地震信息（键名为 "No1"）
    const firstQuake = data['No1'];
    if (!firstQuake || !firstQuake.location) {
        console.log('⚠️ JMA地震信息数据无效');
        return;
    }

    console.log(`✅ 收到JMA地震信息：${firstQuake.location} ${firstQuake.magnitude}级`);

    const line1 = `日本气象厅地震情报`;
    const line2 = `${firstQuake.time || '未知时间'} ${firstQuake.location} 发生<span class="highlight-num">${firstQuake.magnitude}</span>级地震，深度<span class="highlight-num">${firstQuake.depth}</span>公里，最大震度<span class="highlight-num">${firstQuake.shindo}</span>${firstQuake.info ? `，${firstQuake.info}` : ''}。`;

    if (isInitial) {
        renderHistoryData(1, true, line1, line2);
    } else {
        renderRealTimeData(1, true, line1, line2);
    }
}

/**
 * 获取台风数据
 * 从台风API获取当前活跃台风数据
 */
async function fetchTyphoonData() {
    try {
        const response = await fetch(CONFIG.TYPHOON_API);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (err) {
        console.error("获取台风数据失败：", err);
        return null;
    }
}

/**
 * 转换台风API数据格式为内部格式
 * @param {Array} apiData - API返回的台风数据数组
 * @returns {Array} - 转换后的台风数据数组
 */
function convertTyphoonApiData(apiData) {
    if (!Array.isArray(apiData) || apiData.length === 0) {
        return null;
    }

    return apiData.map(tf => {
        // 从points数组中获取最新的实况点数据
        let latestPoint = null;
        if (Array.isArray(tf.points) && tf.points.length > 0) {
            // 获取最后一个点作为最新实况点（points数组按时间排序）
            latestPoint = tf.points[tf.points.length - 1];
        }

        // 构建内部格式的台风数据
        // 注意：API使用的字段名与内部格式不同
        return {
            id: tf.tfid || "",
            name: tf.name || "",
            name_en: tf.enname || "",
            // 优先使用最新实况点数据，其次使用顶层字段
            latitude: latestPoint?.lat || tf.centerlat || "",
            longitude: latestPoint?.lng || tf.centerlng || "",
            // API字段映射：strong -> type, speed -> windSpeed
            type: latestPoint?.strong || "",
            power: latestPoint?.power || "",
            pressure: latestPoint?.pressure || "",
            windSpeed: latestPoint?.speed || "",  // API: speed (米/秒)
            // API字段映射：movedirection -> moveDirection, movespeed -> moveSpeed
            moveDirection: latestPoint?.movedirection || "",
            moveSpeed: latestPoint?.movespeed || "",  // API: movespeed (公里/小时)
            radius7: latestPoint?.radius7 || "",
            radius10: latestPoint?.radius10 || "",
            radius12: latestPoint?.radius12 || "",
            updateTime: latestPoint?.time || tf.starttime || "",
            // 保留原始数据的额外字段
            isactive: tf.isactive,
            warnlevel: tf.warnlevel,
            ckposition: tf.ckposition,
            jl: tf.jl
        };
    });
}

/**
 * 解析并显示台风数据（Wolfx数据源专用）
 * @param {Object|Array} data - API返回的台风数据
 * @param {boolean} isInitial - 是否是初始化数据
 */
function parseWolfxTyphoonData(data, isInitial = false) {
    // 检查是否是"当前无台风"消息
    if (data && data.msg === "当前无台风") {
        renderHistoryData(5, false, "暂无台风信息数据", "", PAGE_COLOR_MAP[5]);
        currentTyphoonData = null;
        lastTyphoon = "";
        return;
    }

    // 转换数据格式
    const convertedData = convertTyphoonApiData(data);
    if (!convertedData || convertedData.length === 0) {
        renderHistoryData(5, false, "暂无台风信息数据", "", PAGE_COLOR_MAP[5]);
        currentTyphoonData = null;
        lastTyphoon = "";
        return;
    }

    console.log(`✅ 收到台风数据：共${convertedData.length}个台风`);

    // 使用现有的parseTyphoonData函数处理
    parseTyphoonData(convertedData, "wolfx", isInitial);
}

/**
 * 发送HTTP请求的工具函数
 * @param {string} url - 请求URL
 * @returns {Promise<Object>} - 响应数据
 */
async function intHttpGet(url) {
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), CONFIG.HTTP_TIMEOUT);
    try {
        const res = await fetch(url, { method: "GET", headers: { "Content-Type": "application/json;charset=utf-8" }, signal: controller.signal });
        clearTimeout(timeoutTimer);
        if (!res.ok) throw new Error(`HTTP${res.status}`);
        return await res.json();
    } catch (err) {
        clearTimeout(timeoutTimer);
        throw err;
    }
}

/**
 * HTTP请求重试函数
 */
function intHttpRetry() {
    if (intensityHttpTimer) clearTimeout(intensityHttpTimer);
    intensityHttpRetryCount++;
    if (intensityHttpRetryCount >= CONFIG.MAX_HTTP_RETRY) {
        if (CONFIG.SHOW_NETWORK_STATUS) {
            renderHistoryData(2, false, "NowQuake HTTP接口连接失败");
        }
        return;
    }
    intensityHttpTimer = setTimeout(initIntensityHttp, CONFIG.RETRY_DELAY);
}

/**
 * 获取烈度速报事件数据
 * @param {string} eqId - 地震事件ID
 */
async function getIntEvent(eqId) {
    try {
        const data = await intHttpGet(`${CONFIG.INT_HTTP_EVENT}${eqId}`);
        parseIntensityData(data, true);
        intensityHttpRetryCount = 0;
    } catch (err) {
        intHttpRetry();
    }
}

/**
 * 初始化烈度速报HTTP请求
 */
async function initIntensityHttp() {
    if (intensityHttpTimer) clearTimeout(intensityHttpTimer);
    if (intensityHttpRetryCount >= CONFIG.MAX_HTTP_RETRY) return;
    try {
        const lastIdData = await intHttpGet(CONFIG.INT_HTTP_LASTID);
        const eqId = lastIdData.eq_id;
        if (typeof eqId !== "string" || !eqId.trim()) throw new Error("eq_id无效");
        getIntEvent(eqId);
    } catch (err) {
        intHttpRetry();
    }
}

/**
 * 关闭烈度速报WebSocket连接
 */
function closeIntWss() {
    if (intensityWebSocket) {
        try {
            intensityWebSocket.close(1000, "烈度速报WSS主动关闭");
            console.log("✅ 烈度速报WebSocket已关闭");
        } catch (err) {
            console.error("关闭烈度速报WebSocket失败：", err);
        } finally {
            intensityWebSocket = null;
        }
    }
    if (intensityPingTimer) {
        clearInterval(intensityPingTimer);
        intensityPingTimer = null;
    }
}

/**
 * 烈度速报WebSocket重连函数
 */
function intWssRetry() {
    if (intensityPingTimer) clearInterval(intensityPingTimer);
    if (intensityHttpTimer) clearTimeout(intensityHttpTimer);
    
    // 如果已切换到Fan Studio或已停止连接，不再重连
    if (intensitySourceStopped) {
        console.log('⚠️ 烈度速报数据源已停止连接，跳过NowQuake重连');
        return;
    }
    
    const source = CONFIG.INTENSITY_SOURCE || "auto";
    if (source === "auto" && nowQuakeFailed) {
        console.log('⚠️ 已切换到Fan Studio，跳过NowQuake重连');
        return;
    }
    
    intensityReconnectCount++;
    
    const maxRetry = CONFIG.MAX_WS_RECONNECT || 0;
    if (maxRetry > 0 && intensityReconnectCount >= maxRetry && source === "auto" && !nowQuakeFailed) {
        nowQuakeFailed = true;
        console.log(`⚠️  NowQuake烈度速报连接失败（重试${intensityReconnectCount}次），自动切换到Fan Studio数据源`);
        closeIntWss();
        fanStudioReconnectCount = 0;
        if (CONFIG.SHOW_NETWORK_STATUS) {
            renderHistoryData(2, false, "NowQuake数据源连接失败，正在切换到Fan Studio...");
        }
        initFanStudioWss();
        return;
    }
    
    const delay = Math.min(3000 * Math.pow(2, intensityReconnectCount), 30000);
    setTimeout(initIntensityWss, delay);
}

/**
 * 初始化烈度速报WebSocket连接
 */
function initIntensityWss() {
    // 如果已停止连接或已切换到Fan Studio，不再初始化
    if (intensitySourceStopped) {
        console.log('⚠️ 烈度速报数据源已停止连接，跳过NowQuake初始化');
        return;
    }
    
    const source = CONFIG.INTENSITY_SOURCE || "auto";
    if (source === "auto" && nowQuakeFailed) {
        console.log('⚠️ 已切换到Fan Studio，跳过NowQuake初始化');
        return;
    }
    
    if (isConnectingIntensityWs) {
        console.log('⚠️ 烈度速报WebSocket正在连接中，跳过重复连接');
        return;
    }
    
    // 检查是否已有活跃的WebSocket连接
    if (intensityWebSocket && intensityWebSocket.readyState === 1) {
        console.log('✅ NowQuake烈度速报WebSocket已是活跃状态，跳过重新初始化');
        return;
    }
    
    isConnectingIntensityWs = true;
    closeIntWss();
    
    intensityWebSocket = createWebSocket(CONFIG.INT_WSS_REAL, {
        onOpen: (socket) => {
            isConnectingIntensityWs = false; // 释放连接锁
            markDataSourceConnected('intensity'); // 标记NowQuake数据源已连接
            console.log("✅ 烈度速报WebSocket连接成功");
            intensityReconnectCount = 0;
            isIntensityInited = true;
            
            // 连接成功后重新初始化（通过HTTP获取最新数据）
            console.log("🔄 烈度速报WebSocket重连成功，正在重新初始化...");
            initIntensityHttp();
            
            intensityPingTimer = setInterval(() => {
                if (socket && socket.readyState === 1) {
                    try {
                        socket.send("ping");
                    } catch (err) {
                        console.error("发送烈度速报ping失败：", err);
                        clearInterval(intensityPingTimer);
                        if (socket && socket.readyState !== 3) socket.close();
                    }
                }
            }, 5000);
        },
        onMessage: (e) => {
            if (!e.data || e.data === "ping" || !e.data.startsWith("{")) return;
            try {
                const data = JSON.parse(e.data);
                if (data?.eq_id) parseIntensityData(data, false);
            } catch (err) {
                console.error("❌ 烈度速报数据解析失败：", err, "原始数据：", e.data);
            }
        },
        onClose: (event) => {
            isConnectingIntensityWs = false; // 释放连接锁
            console.log(`烈度速报WebSocket关闭：${event.code} - ${event.reason}`);
            
            // 更新NowQuake数据源状态（如果不是正常关闭）
            if (event.code !== 1000) {
                updateDataSourceStatus('intensity', event.code, intensityReconnectCount);
            }
            
            clearInterval(intensityPingTimer);
            intensityWebSocket = null;
            // 注意：不再在这里调用 intWssRetry()
            // 重连逻辑统一由 createWebSocket 的 reconnectCallback 处理
        },
        onError: () => {
            isConnectingIntensityWs = false; // 释放连接锁
            // 注意：不再在这里调用 intWssRetry()
            // 错误会触发 ws.close()，进而触发 onClose → createWebSocket 的 reconnectCallback
        },
        reconnectCallback: initIntensityWss,
        reconnectCount: intensityReconnectCount  // 使用当前值，不在此处递增
    });
}

/**
 * 启动台风数据定时更新（仅Wolfx数据源）
 * 每10分钟更新一次台风数据
 */
function startTyphoonUpdateTimer() {
    if (typhoonUpdateTimer) clearInterval(typhoonUpdateTimer);

    // 只有在使用Wolfx数据源时才启动定时更新
    if (CONFIG.DATA_SOURCE !== "wolfx") {
        return;
    }

    typhoonUpdateTimer = setInterval(async () => {
        if (CONFIG.PAGE_ENABLED[5] && CONFIG.DATA_SOURCE === "wolfx") {
            try {
                console.log("🌀 定时更新台风数据...");
                const typhoonData = await fetchTyphoonData();
                if (typhoonData) {
                    parseWolfxTyphoonData(typhoonData, false);
                }
            } catch (err) {
                console.error("定时更新台风数据失败：", err);
            }
        }
    }, 10 * 60 * 1000); // 每10分钟更新一次

    console.log("✅ 台风数据定时更新已启动（每10分钟）");
}

/**
 * 停止台风数据定时更新
 */
function stopTyphoonUpdateTimer() {
    if (typhoonUpdateTimer) {
        clearInterval(typhoonUpdateTimer);
        typhoonUpdateTimer = null;
        console.log("⏹️ 台风数据定时更新已停止");
    }
}

/**
 * 关闭Fan Studio烈度速报WebSocket连接
 */
function closeFanStudioWss() {
    if (fanStudioWebSocket) {
        try {
            fanStudioWebSocket.close(1000, "Fan Studio烈度速报WSS主动关闭");
            console.log("✅ Fan Studio烈度速报WebSocket已关闭");
        } catch (err) {
            console.error("关闭Fan Studio烈度速报WebSocket失败：", err);
        } finally {
            fanStudioWebSocket = null;
        }
    }
    if (fanStudioPingTimer) {
        clearInterval(fanStudioPingTimer);
        fanStudioPingTimer = null;
    }
}

/**
 * Fan Studio烈度速报WebSocket重连函数
 */
function fanStudioWssRetry() {
    if (fanStudioPingTimer) clearInterval(fanStudioPingTimer);
    
    // 如果已停止连接，不再重连
    if (intensitySourceStopped) {
        console.log('⚠️ 烈度速报数据源已停止连接，跳过Fan Studio重连');
        return;
    }
    
    fanStudioReconnectCount++;
    
    const source = CONFIG.INTENSITY_SOURCE || "auto";
    const maxRetry = CONFIG.MAX_WS_RECONNECT || 0;
    
    if (maxRetry > 0 && fanStudioReconnectCount >= maxRetry) {
        if (source === "auto" && !fanStudioFailed) {
            fanStudioFailed = true;
            intensitySourceStopped = true;
            console.log(`❌ Fan Studio烈度速报连接失败（重试${fanStudioReconnectCount}次），所有数据源均无法连接，停止重连`);
            closeFanStudioWss();
            if (CONFIG.SHOW_NETWORK_STATUS) {
                renderHistoryData(2, false, "所有烈度速报数据源均无法连接");
            }
            return;
        } else if (source === "fanstudio") {
            intensitySourceStopped = true;
            console.log(`❌ Fan Studio烈度速报连接失败（重试${fanStudioReconnectCount}次），停止重连`);
            closeFanStudioWss();
            if (CONFIG.SHOW_NETWORK_STATUS) {
                renderHistoryData(2, false, "Fan Studio数据源连接失败");
            }
            return;
        }
    }
    
    const delay = Math.min(3000 * Math.pow(2, fanStudioReconnectCount), 30000);
    setTimeout(initFanStudioWss, delay);
}

/**
 * 初始化Fan Studio烈度速报WebSocket连接
 */
function initFanStudioWss() {
    // 如果已停止连接，不再初始化
    if (intensitySourceStopped) {
        console.log('⚠️ 烈度速报数据源已停止连接，跳过Fan Studio初始化');
        return;
    }
    
    if (isConnectingFanStudioWs) {
        console.log('⚠️ Fan Studio WebSocket正在连接中，跳过重复连接');
        return;
    }
    
    // 检查是否已有活跃的WebSocket连接
    if (fanStudioWebSocket && fanStudioWebSocket.readyState === 1) {
        console.log('✅ Fan Studio烈度速报WebSocket已是活跃状态，跳过重新初始化');
        return;
    }
    
    isConnectingFanStudioWs = true;
    closeFanStudioWss();
    
    fanStudioWebSocket = createWebSocket(CONFIG.INT_WSS_FANSTUDIO, {
        onOpen: (socket) => {
            isConnectingFanStudioWs = false; // 释放连接锁
            markDataSourceConnected('fanStudio'); // 标记Fan Studio数据源已连接
            console.log("✅ Fan Studio烈度速报WebSocket连接成功");
            fanStudioReconnectCount = 0;
            isFanStudioInited = true;
            
            // 连接成功后主动请求初始数据（与主WebSocket相同的模式）
            console.log("🔄 Fan Studio烈度速报WebSocket重连成功，正在请求数据...");
            
            setTimeout(() => {
                if (socket && socket.readyState === 1) {
                    try {
                        socket.send("query");
                        console.log("已向Fan Studio发送烈度速报查询请求");
                    } catch (err) {
                        console.error("发送Fan Studio查询请求失败：", err);
                    }
                }
            }, 50);
            
            fanStudioPingTimer = setInterval(() => {
                if (socket && socket.readyState === 1) {
                    try {
                        socket.send("ping");
                    } catch (err) {
                        console.error("发送Fan Studio烈度速报ping失败：", err);
                        clearInterval(fanStudioPingTimer);
                        if (socket && socket.readyState !== 3) socket.close();
                    }
                }
            }, 30000);
        },
        onMessage: (e) => {
            if (!e.data || e.data === "ping" || e.data === "pong") return;
            if (!e.data.startsWith("{")) return;
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === "initial" || msg.type === "update") {
                    const convertedData = convertFanStudioToNowQuake(msg);
                    if (convertedData) {
                        const isInitial = msg.type === "initial";
                        parseIntensityData(convertedData, isInitial);
                    }
                }
            } catch (err) {
                console.error("❌ Fan Studio烈度速报数据解析失败：", err, "原始数据：", e.data);
            }
        },
        onClose: (event) => {
            isConnectingFanStudioWs = false; // 释放连接锁
            console.log(`Fan Studio烈度速报WebSocket关闭：${event.code} - ${event.reason}`);
            
            // 更新Fan Studio数据源状态（如果不是正常关闭）
            if (event.code !== 1000) {
                updateDataSourceStatus('fanStudio', event.code, fanStudioReconnectCount);
            }
            
            clearInterval(fanStudioPingTimer);
            fanStudioWebSocket = null;
            // 注意：不再在这里调用 fanStudioWssRetry()
            // 重连逻辑统一由 createWebSocket 的 reconnectCallback 处理
        },
        onError: () => {
            isConnectingFanStudioWs = false; // 释放连接锁
            // 注意：不再在这里调用 fanStudioWssRetry()
            // 错误会触发 ws.close()，进而触发 onClose → createWebSocket 的 reconnectCallback
        },
        reconnectCallback: initFanStudioWss,
        reconnectCount: fanStudioReconnectCount  // 使用当前值，不在此处递增
    });
}

/**
 * 关闭Wolfx WebSocket连接
 */
function closeWolfxWss() {
    if (wolfxWebSocket) {
        try {
            wolfxWebSocket.close(1000, "Wolfx WSS主动关闭");
            console.log("✅ Wolfx WebSocket已关闭");
        } catch (err) {
            console.error("关闭Wolfx WebSocket失败：", err);
        } finally {
            wolfxWebSocket = null;
        }
    }
    if (wolfxPingTimer) {
        clearInterval(wolfxPingTimer);
        wolfxPingTimer = null;
    }
}

/**
 * Wolfx WebSocket重连函数
 */
function wolfxWssRetry() {
    if (wolfxPingTimer) clearInterval(wolfxPingTimer);

    wolfxReconnectCount++;

    const maxRetry = CONFIG.MAX_WS_RECONNECT || 0;
    if (maxRetry > 0 && wolfxReconnectCount >= maxRetry) {
        console.log(`❌ Wolfx连接失败（重试${wolfxReconnectCount}次），停止重连`);
        closeWolfxWss();
        if (CONFIG.SHOW_NETWORK_STATUS) {
            renderHistoryData(0, false, "Wolfx数据源连接失败");
            renderHistoryData(1, false, "Wolfx数据源连接失败");
        }
        return;
    }

    const delay = Math.min(3000 * Math.pow(2, wolfxReconnectCount), 30000);
    setTimeout(initWolfxWss, delay);
}

/**
 * 初始化Wolfx WebSocket连接
 */
function initWolfxWss() {
    if (isConnectingWolfxWs) {
        console.log('⚠️ Wolfx WebSocket正在连接中，跳过重复连接');
        return;
    }

    // 检查是否已有活跃的WebSocket连接
    if (wolfxWebSocket && wolfxWebSocket.readyState === 1) {
        console.log('✅ Wolfx WebSocket已是活跃状态，跳过重新初始化');
        return;
    }

    isConnectingWolfxWs = true;
    closeWolfxWss();

    wolfxWebSocket = createWebSocket(CONFIG.WOLFX_WS_ALL, {
        onOpen: (socket) => {
            isConnectingWolfxWs = false; // 释放连接锁
            markDataSourceConnected('wolfx'); // 标记Wolfx数据源已连接
            console.log("✅ Wolfx WebSocket连接成功");
            wolfxReconnectCount = 0;
            wolfxSeenTypes = {};
            isWolfxInited = true;

            // 连接成功后主动请求初始数据
            console.log("🔄 Wolfx WebSocket重连成功，正在请求数据...");

            // 使用固定间隔发送查询指令（每条间隔2秒）
            const queryCommands = [
                "query_sceew",
                "query_fjeew",
                "query_cqeew",
                "query_cenceew",
                "query_cenceqlist"
            ];

            queryCommands.forEach((cmd, index) => {
                setTimeout(() => {
                    if (socket && socket.readyState === 1) {
                        try {
                            socket.send(cmd);
                            console.log(`📤 已发送查询指令: ${cmd}`);
                        } catch (err) {
                            console.error(`发送 ${cmd} 失败：`, err);
                        }
                    }
                }, 50 + index * 2000); // 每条指令间隔2秒
            });

            // 同时获取台风数据（Wolfx不提供台风信息，使用Fan Studio台风API）
            // 注意：此台风API仅在Wolfx数据源时调用
            setTimeout(async () => {
                if (CONFIG.PAGE_ENABLED[5] && CONFIG.DATA_SOURCE === "wolfx") {
                    try {
                        console.log("🌀 正在获取台风数据（Fan Studio台风API）...");
                        const typhoonData = await fetchTyphoonData();
                        if (typhoonData) {
                            parseWolfxTyphoonData(typhoonData, true);
                        }
                        // 启动台风数据定时更新
                        startTyphoonUpdateTimer();
                    } catch (err) {
                        console.error("初始化台风数据失败：", err);
                    }
                }
            }, 100); // 稍微延迟以确保初始化完成

            // Wolfx心跳包：服务端每分钟发送一次，客户端回复ping（推荐）
            // 这里设置30秒发送一次ping
            wolfxPingTimer = setInterval(() => {
                if (socket && socket.readyState === 1) {
                    try {
                        socket.send("ping");
                    } catch (err) {
                        console.error("发送Wolfx ping失败：", err);
                        clearInterval(wolfxPingTimer);
                        if (socket && socket.readyState !== 3) socket.close();
                    }
                }
            }, 30000);
        },
        onMessage: (e) => {
            if (!e.data) return;

            // 尝试解析JSON
            if (e.data.startsWith("{")) {
                try {
                    const msg = JSON.parse(e.data);
                    const type = msg.type;

                    if (!type) {
                        console.log('⚠️ Wolfx数据缺少type字段，跳过处理');
                        return;
                    }

                    // 心跳包和pong包处理
                    if (type === 'heartbeat') {
                        console.log('💓 收到Wolfx心跳包');
                        // 可选：回复ping包
                        return;
                    }

                    if (type === 'pong') {
                        console.log('💓 收到Wolfx pong包');
                        return;
                    }

                    // 首次收到该类型为初始化数据，后续为更新数据（强制显示）
                    const isInitial = !wolfxSeenTypes[type];
                    wolfxSeenTypes[type] = true;
                    parseWolfxData(msg, type, isInitial);
                } catch (err) {
                    console.error("❌ Wolfx数据解析失败：", err, "原始数据：", e.data);
                }
                return;
            }

            // 处理文本格式消息（如 "ping" 等）
            if (e.data === "ping") {
                // 服务端不会发送ping，客户端才发送ping
                return;
            }
        },
        onClose: (event) => {
            isConnectingWolfxWs = false; // 释放连接锁
            console.log(`Wolfx WebSocket关闭：${event.code} - ${event.reason}`);

            // 更新Wolfx数据源状态（如果不是正常关闭）
            if (event.code !== 1000) {
                updateDataSourceStatus('wolfx', event.code, wolfxReconnectCount);
            }

            clearInterval(wolfxPingTimer);
            wolfxWebSocket = null;
        },
        onError: () => {
            isConnectingWolfxWs = false; // 释放连接锁
        },
        reconnectCallback: initWolfxWss,
        reconnectCount: wolfxReconnectCount
    });
}

// 验证烈度速报数据的完整性
function validateIntensityData(data) {
    return data?.eq_id && data?.happen_time && data?.magnitude !== undefined && data?.maxintensity !== undefined;
}

// 检查数据是否过期
function isExpiredData(data) {
    // 检查烈度速报的更新时间
    if (data.update_time) {
        const updateTime = new Date(data.update_time);
        if (!isNaN(updateTime.getTime())) {
            return Date.now() - updateTime.getTime() > ONE_DAY;
        }
    }
    // 检查海啸预警的更新时间
    if (data.timeInfo && data.timeInfo.updateDate) {
        const updateTime = new Date(data.timeInfo.updateDate);
        if (!isNaN(updateTime.getTime())) {
            return Date.now() - updateTime.getTime() > ONE_DAY;
        }
    }
    return false;
}

// 提取烈度速报的基本信息
function extractIntensityInfo(data) {
    return {
        happenTime: data.happen_time || "未知时间",
        updateTime: data.update_time || "未知时间",
        hypocenter: data.hypocenter || "未知震中",
        mag: data.magnitude || 0,
        depth: (data.depth !== undefined && data.depth !== null) ? data.depth : "未知",
        maxInt: data.maxintensity !== undefined ? data.maxintensity : 0, // 计测烈度
        estimatedInt: data.estimated_intensity !== undefined ? data.estimated_intensity : 0, // 推测烈度
        maxForecastInt: data.maxforecastintensity !== undefined ? data.maxforecastintensity : 0,
        source: data.source || "nowquake" // 数据来源：fanstudio 或 nowquake
    };
}

// 生成信息文本
function generateInfoText(info) {
    if (typeof info !== 'string' || info.trim() === "" || info.toLowerCase() === "null") {
        return "";
    }
    let processedInfo = info.trim();
    // 替换英文标点为中文标点
    processedInfo = processedInfo
        .replace(/\./g, "。")
        .replace(/,/g, "，")
        .replace(/;/g, "；")
        .replace(/!/g, "！")
        .replace(/\?/g, "？")
        .replace(/:/g, "：")
        .replace(/\(/g, "（")
        .replace(/\)/g, "）");
    return processedInfo;
}

// 生成台站信息文本
function generateStationsText(stations) {
    if (!Array.isArray(stations) || stations.length === 0) {
        return "";
    }
    
    // 过滤有效站点：计测烈度>最小烈度 且 距离震中≤最大距离
    const validStations = stations.filter(s => 
        s.int !== undefined && 
        s.int > CONFIG.INTENSITY_CONFIG.MIN_INTENSITY && 
        s.distance <= CONFIG.INTENSITY_CONFIG.MAX_STATION_DISTANCE
    );
    
    if (validStations.length === 0) {
        return "";
    }
    
    // 按计测烈度从高到低排序
    validStations.sort((a, b) => b.int - a.int);
    
    let stationsText = " 部分台站计测烈度信息：";
    validStations.forEach((st, i) => {
        // 地区信息
        const province = st.location_name?.province || "";
        const city = st.location_name?.city || "";
        const county = st.location_name?.county || "";
        const town = st.location_name?.town || "";
        const area = [province, city, county, town].filter(Boolean).join("");
        
        // 核心字段
        const stationName = st.name || "未知站";
        const intVal = st.int.toFixed(1);
        const dist = st.distance.toFixed(1);
        const forecastInt = st.forecast_int.toFixed(1);
        const pga = st.pga.toFixed(1);
        const pgv = st.pgv.toFixed(1);

        // 通顺化拼接
        stationsText += `${stationName}（${area}）：距震中${dist}公里，计测烈度${intVal}度，预测烈度${forecastInt}度，PGA ${pga}gal，PGV ${pgv}cm/s`;
        if (i < validStations.length - 1) stationsText += "；";
    });
    
    return stationsText;
}

// 设置CSS变量，使用config.js中的颜色配置
function setCSSVariables() {
    const root = document.documentElement;
    root.style.setProperty('--color-alert', PAGE_COLOR_MAP[0]);
    root.style.setProperty('--color-measure', PAGE_COLOR_MAP[1]);
    root.style.setProperty('--color-intensity', PAGE_COLOR_MAP[2]);
    root.style.setProperty('--color-tsunami', PAGE_COLOR_MAP[3]);
    root.style.setProperty('--color-weather', PAGE_COLOR_MAP[4]);
    root.style.setProperty('--color-typhoon', PAGE_COLOR_MAP[5]);
}

// 初始化时设置CSS变量
setCSSVariables();

/**
 * 从烈度信息文本中解析推测最高烈度
 * @param {string} infoText - 烈度信息文本
 * @returns {number} - 推测最高烈度值
 */
function parseEstimatedIntensityFromText(infoText) {
    if (!infoText || typeof infoText !== 'string') return 0;
    const match = infoText.match(/最高烈度为(\d+(?:\.\d+)?)度/);
    return match ? parseFloat(match[1]) : 0;
}

/**
 * 将Fan Studio数据格式转换为NowQuake格式
 * @param {Object} fanData - Fan Studio原始数据
 * @returns {Object} - 转换后的NowQuake格式数据
 */
function convertFanStudioToNowQuake(fanData) {
    if (!fanData) return null;
    
    const data = fanData.Data || fanData;
    
    const converted = {
        eq_id: data.uniEventId || String(data.id),
        happen_time: data.oriTime || "",
        update_time: data.gmtCreate || "",
        hypocenter: data.locName || "未知震中",
        magnitude: parseFloat(data.magnitude) || 0,
        depth: parseFloat(data.focDepth) || 0,
        maxintensity: 0, // 计测烈度（从台站数据提取）
        estimated_intensity: parseEstimatedIntensityFromText(data.intensity_info_text), // 推测烈度
        maxforecastintensity: 0,
        info: data.intensity_info_text || "",
        stations: [],
        source: "fanstudio" // 数据来源标记
    };
    
    if (Array.isArray(data.instrument_intensity_json) && data.instrument_intensity_json.length > 0) {
        converted.stations = data.instrument_intensity_json.map(st => ({
            name: st.stName || st.stID || "未知站",
            int: st.INT || 0,
            distance: st.Dist || 0,
            forecast_int: st.estimateInt || 0,
            pga: st.PGA || 0,
            pgv: st.PGV || 0,
            location_name: {
                province: st.Province || "",
                city: st.City || "",
                county: st.County || "",
                town: st.Town || ""
            }
        }));
        
        // 从台站数据中提取最大计测烈度
        const maxIntStation = converted.stations.reduce((max, st) => 
            st.int > max.int ? st : max, {int: 0});
        converted.maxintensity = maxIntStation.int;
        
        // 从台站数据中提取最大预测烈度（Fan Studio特有）
        const maxForecastStation = converted.stations.reduce((max, st) => 
            st.forecast_int > max.forecast_int ? st : max, {forecast_int: 0});
        converted.maxforecastintensity = maxForecastStation.forecast_int;
    }
    
    return converted;
}

// ====================== 最终优化的 parseIntensityData 函数（仅改此处！） ======================
function parseIntensityData(data, isInitial = false) {
    if (!validateIntensityData(data)) return;

    console.log(`✅ 收到烈度速报数据：${data.hypocenter} ${data.magnitude}级`);

    const uniqueId = `${data.eq_id}_${data.magnitude}_${data.happen_time}_${data.update_time || Date.now()}`;
    if (uniqueId === lastIntensity) return;
    lastIntensity = uniqueId;

    if (isExpiredData(data)) {
        renderHistoryData(2, false, "暂无烈度速报数据");
        currentIntensityData = null;
        return;
    }

    // 保存当前显示的烈度速报数据
    currentIntensityData = data;

    const intensityInfo = extractIntensityInfo(data);
    const infoText = generateInfoText(data.info);
    const stationsText = generateStationsText(data.stations);

    // 构建烈度信息文本
    let intensityText = "";
    
    // 优先显示计测烈度（台站实测）- 使用"最大仪器烈度"表述
    if (intensityInfo.maxInt > 0) {
        intensityText = `最大仪器烈度<span class="highlight-num">${intensityInfo.maxInt.toFixed(1)}</span>度`;
    } 
    // 如果没有计测烈度但有推测烈度，显示推测烈度
    else if (intensityInfo.estimatedInt > 0) {
        intensityText = `推测最高烈度<span class="highlight-num">${intensityInfo.estimatedInt.toFixed(1)}</span>度`;
    }
    
    // 预测/推测烈度显示（根据数据来源区分）
    if (intensityInfo.maxForecastInt > 0) {
        if (intensityText) intensityText += "，";
        // NowQuake显示"推测最大烈度"，Fan Studio显示"最大仪器预测烈度"
        const forecastLabel = intensityInfo.source === "fanstudio" ? "最大仪器预测烈度" : "推测最大烈度";
        intensityText += `${forecastLabel}<span class="highlight-num">${intensityInfo.maxForecastInt.toFixed(1)}</span>度`;
    }

    // 最终文本合并成一行在第二行显示
    const line1 = `中国地震台网中心烈度速报（更新时间：${intensityInfo.updateTime}）`;
    const line2 = `${intensityInfo.happenTime} ${intensityInfo.hypocenter} 发生<span class="highlight-num">${intensityInfo.mag.toFixed(1)}</span>级地震，震源深度<span class="highlight-num">${intensityInfo.depth}</span>公里${intensityText ? "，" + intensityText : ""}。${infoText}${stationsText}`;

    // 立即处理数据，确保新数据能够触发强制显示
    if (isInitial) {
        renderHistoryData(2, true, line1, line2);
        // 对于初始化数据，确保触发滚动检查
        if (currentPage === 2) {
            startPageLogic();
        }
    } else {
        renderRealTimeData(2, true, line1, line2);
    }
}
// ==================================================================================

/**
 * 解析海啸预警数据
 * @param {Object} data - 海啸预警数据对象
 */
function parseTsunamiData(data, source, isInitial = false) {
    if (!data?.id || !data?.warningInfo) {
        renderHistoryData(3, false, "暂无海啸预警数据", "", PAGE_COLOR_MAP[3]);
        currentTsunamiData = null;
        return;
    }
    
    console.log(`✅ 收到海啸预警数据：${data.warningInfo?.title}`);

    const uniqueId = `${data.id}_${data.code || data.id}_${data.warningInfo?.title}_${data.details?.batch || 1}_${data.timeInfo?.updateDate || Date.now()}`;
    if (uniqueId === lastTsunami) return;
    lastTsunami = uniqueId;
    
    // 检查数据是否过期
    if (isExpiredData(data)) {
        renderHistoryData(3, false, "暂无海啸预警数据", "", PAGE_COLOR_MAP[3]);
        currentTsunamiData = null;
        return;
    }
    
    // 保存当前显示的海啸预警数据
    currentTsunamiData = data;
    
    const warn = data.warningInfo;
    const batch = data.details?.batch || 1;
    const shock = data.shockInfo;
    const time = data.timeInfo;
    
    // 海啸预警颜色映射
    const colorMap = {红色: "#FF0000", 橙色: "#FF7F50", 黄色: "#FFFF00", 蓝色: "#1E90FF", 默认: PAGE_COLOR_MAP[3]};
    // 提取预警级别
    const level = warn.title?.includes("红色") ? "红色" : warn.title?.includes("橙色") ? "橙色" : warn.title?.includes("黄色") ? "黄色" : warn.title?.includes("蓝色") ? "蓝色" : "默认";
    const targetColor = colorMap[level];
    
    // 处理沿海预报数据
    const forecast = Array.isArray(data.forecasts) && data.forecasts.length > 0 ? "本次地震事件预计会对我国沿岸造成重要影响。预报信息：" + data.forecasts.map(item => `${item.province || "未知区域"}${item.forecastArea || ""} ${item.estimatedArrivalTime || "未知时间"}到达，波高<span class="highlight-num">${item.maxWaveHeight || 0}</span>厘米`).join("；") : "";
    
    // 处理地震信息
    let shockInfo = "";
    if (shock) {
        shockInfo = `${shock.shockTime || "未知时间"} ${shock.placeName || "未知位置"} 发生<span class="highlight-num">${shock.magnitude || 0}</span>级地震，震源深度<span class="highlight-num">${shock.depth || "未知"}</span>公里，震中位于 ${shock.latitude || ""}°，${shock.longitude || ""}°`;
        if (forecast) {
            shockInfo += "。" + forecast;
        } else {
            // 没有预警信息时添加提示
            shockInfo += "。本次地震事件预计不会产生海啸，或不会对我国沿岸造成重要影响。";
        }
    } else if (forecast) {
        shockInfo = forecast;
    } else {
        // 没有地震信息和预警信息时添加提示
        shockInfo = "本次地震事件预计不会产生海啸，或不会对我国沿岸造成重要影响。";
    }
    
    // 处理监测站数据
    let monitorInfo = "";
    if (Array.isArray(data.waterLevelMonitoring) && data.waterLevelMonitoring.length > 0) {
        const topStations = data.waterLevelMonitoring.slice(0, 3); // 只显示前3个监测站
        monitorInfo = "水位监测信息：" + topStations.map(station => `${station.stationName || "未知站"}（${station.location || "未知位置"}） ${station.time || "未知时间"}观测到波高<span class="highlight-num">${station.maxWaveHeight || 0}</span>厘米`).join("；");
    }
    
    // 构建显示文本
    let line1 = `自然资源部海啸预警 <span class="highlight-num">${batch}</span> 期：${warn.title || "海啸警报"}（更新时间：${time?.updateDate || "未知"}）`;
    
    let line2 = "";
    if (shockInfo) line2 = shockInfo;
    if (monitorInfo) {
        if (line2) line2 += "。" + monitorInfo;
        else line2 = monitorInfo;
    }
    
    // 确保以句号封尾
    if (line2 && !line2.endsWith("。")) {
        line2 += "。";
    }
    
    // 确保即使只有一行数据也能正确显示
    if (!line2 && line1) {
        line2 = line1;
        line1 = ``;
    }
    
    console.log(`📊 海啸预警数据显示：`);
    console.log(`   第一行：${line1}`);
    console.log(`   第二行：${line2}`);
    console.log(`   预警级别：${level}`);
    console.log(`   字体颜色：${targetColor}`);
    
    // 根据是否是初始化数据决定使用哪个渲染函数
    if (isInitial) {
        console.log(`🔄 初始化数据，使用renderHistoryData`);
        renderHistoryData(3, true, line1, line2, targetColor);
    } else {
        console.log(`⚡ 实时数据，使用renderRealTimeData`);
        renderRealTimeData(3, true, line1, line2, targetColor);
    }
}

/**
 * 解析气象预警数据
 * @param {Object} data - 气象预警数据对象
 */
function parseWeatherData(data, source, isInitial = false) {
    const colorMap = {红色: "#FF0000", 橙色: "#FF7F50", 黄色: "#FFFF00", 蓝色: "#1E90FF", 默认: PAGE_COLOR_MAP[4]};
    if (!data?.id || !data?.headline || !data?.description) {
        dom.weatherTag.style.backgroundColor = colorMap["默认"];
        renderHistoryData(4, false, "暂无气象预警数据", "", colorMap["默认"]);
        lastWeather = "";
        return;
    }

    console.log(`✅ 收到气象预警数据：${data.headline}`);

    const uniqueId = `${data.id}_${data.headline}_${data.description}_${data.effective || ""}_${data.updateTime || Date.now()}`;
    if (uniqueId === lastWeather) return;
    lastWeather = uniqueId;
    
    // 颜色判断：优先匹配中文颜色，其次匹配罗马数字等级（I级=红色, II级=橙色, III级=黄色, IV级=蓝色）
    let level = "默认";
    if (data.headline.includes("红色") || data.headline.includes("I级")) {
        level = "红色";
    } else if (data.headline.includes("橙色") || data.headline.includes("II级")) {
        level = "橙色";
    } else if (data.headline.includes("黄色") || data.headline.includes("III级")) {
        level = "黄色";
    } else if (data.headline.includes("蓝色") || data.headline.includes("IV级")) {
        level = "蓝色";
    }
    
    const targetColor = colorMap[level];
    dom.weatherTag.style.backgroundColor = targetColor;
    const line1 = `${data.headline}（生效时间：${data.effective || "未知时间"}）`;
    const line2 = data.description || "请做好相关防范措施";

    // 根据是否是初始化数据决定使用哪个渲染函数
    if (isInitial) {
        renderHistoryData(4, true, line1, line2, targetColor);
    } else {
        CONFIG.WEATHER_FORCED ? renderRealTimeData(4, true, line1, line2, targetColor) : renderHistoryData(4, true, line1, line2, targetColor);
    }
    if (currentPage === 4) startPageLogic();
}

/**
 * 解析台风信息数据
 * @param {Object} data - 台风信息数据对象
 */
function parseTyphoonData(data, source, isInitial = false) {
    // data 参数可能是数组（直接传入Data数组）或对象（包含Data字段）
    let typhoonData = null;
    let md5Value = "";

    if (Array.isArray(data)) {
        // 直接传入的是Data数组
        typhoonData = data;
    } else if (data && data.Data && Array.isArray(data.Data)) {
        // 传入的是包含Data字段的对象
        typhoonData = data.Data;
        md5Value = data.md5 || "";
    }

    if (!typhoonData || typhoonData.length === 0) {
        renderHistoryData(5, false, "暂无台风信息数据", "", PAGE_COLOR_MAP[5]);
        currentTyphoonData = null;
        lastTyphoon = "";
        return;
    }

    console.log(`✅ 收到台风信息数据：共${typhoonData.length}个台风`);

    // 使用 md5 作为唯一标识（台风数据可能有多个，用md5判断整体数据是否更新）
    // Wolfx HTTP数据源无md5，使用关键字段组合作为唯一标识，仅数据真正变化时才触发更新
    const uniqueId = md5Value || typhoonData.map(t =>
        `${t.id}_${t.latitude}_${t.longitude}_${t.power}_${t.pressure}_${t.moveSpeed}_${t.moveDirection}_${t.radius7}_${t.radius10}_${t.radius12}_${t.windSpeed}_${t.type}`
    ).join('|');
    if (uniqueId === lastTyphoon) return;
    lastTyphoon = uniqueId;

    // 台风强度等级颜色映射（根据type字段）
    const typeColorMap = {
        "热带低压": "#87CEEB",
        "热带风暴": "#1E90FF",
        "强热带风暴": "#FF7F50",
        "台风": "#FF8C00",
        "强台风": "#FF4500",
        "超强台风": "#FF0000",
        "默认": PAGE_COLOR_MAP[5]
    };

    // 构建台风信息文本
    let line1 = `中国气象局台风信息（更新时间：${typhoonData[0]?.updateTime || "未知时间"}）`;
    let line2 = "";

    // 处理多台风情况
    typhoonData.forEach((typhoon, index) => {
        if (!typhoon.id || !typhoon.name) return;

        // 台风基本信息
        const typhoonName = `${typhoon.name}（${typhoon.name_en || typhoon.name}）`;
        const typhoonId = typhoon.id;
        const position = `中心位于<span class="highlight-num">${typhoon.latitude || "?"}°N</span>、<span class="highlight-num">${typhoon.longitude || "?"}°E</span>`;
        const type = typhoon.type || "未知等级";
        const power = typhoon.power || "?";
        const pressure = typhoon.pressure || "?";
        const windSpeed = typhoon.windSpeed || "?";
        const moveDirection = typhoon.moveDirection || "未知方向";
        const moveSpeed = typhoon.moveSpeed || "?";

        // 风圈半径信息
        let radiusInfo = "";
        if (typhoon.radius7 && typhoon.radius7 !== "" && typhoon.radius7 !== "null") {
            radiusInfo += `七级风圈半径<span class="highlight-num">${typhoon.radius7}</span>公里`;
        }
        if (typhoon.radius10 && typhoon.radius10 !== "" && typhoon.radius10 !== "null") {
            if (radiusInfo) radiusInfo += "，";
            radiusInfo += `十级风圈半径<span class="highlight-num">${typhoon.radius10}</span>公里`;
        }
        if (typhoon.radius12 && typhoon.radius12 !== "" && typhoon.radius12 !== "null") {
            if (radiusInfo) radiusInfo += "，";
            radiusInfo += `十二级风圈半径<span class="highlight-num">${typhoon.radius12}</span>公里`;
        }

        // 构建台风详细信息
        let typhoonInfo = `${typhoonId}号台风${typhoonName}，${position}，中心附近最大风力<span class="highlight-num">${power}</span>级（风速<span class="highlight-num">${windSpeed}</span>米/秒），中心最低气压<span class="highlight-num">${pressure}</span>百帕，当前强度等级<span class="highlight-num">${type}</span>，移动方向${moveDirection}，移动速度<span class="highlight-num">${moveSpeed}</span>公里/小时`;
        if (radiusInfo) {
            typhoonInfo += `，${radiusInfo}`;
        }

        // 多台风用分号分隔
        if (line2) {
            line2 += "；";
        }
        line2 += typhoonInfo;
    });

    // 如果没有有效的台风数据，显示默认信息
    if (!line2) {
        line2 = "当前西太平洋及南海海域无活跃台风。";
    } else {
        // 在最后添加句号
        line2 += "。";
    }

    // 保存当前显示的台风数据
    currentTyphoonData = { Data: typhoonData, md5: md5Value };

    console.log(`📊 台风信息数据显示：`);
    console.log(`   第一行：${line1}`);
    console.log(`   第二行：${line2}`);

    // 根据是否是初始化数据决定使用哪个渲染函数
    // 台风数据使用默认颜色（橙色），不根据强度等级动态改变颜色
    const targetColor = PAGE_COLOR_MAP[5];

    if (isInitial) {
        console.log(`🔄 初始化数据，使用renderHistoryData`);
        renderHistoryData(5, true, line1, line2, targetColor);
    } else {
        console.log(`⚡ 实时数据，使用renderRealTimeData`);
        renderRealTimeData(5, true, line1, line2, targetColor);
    }
}

/**
 * 重置页面显示为默认状态
 * 用于连接恢复后清除失败提示
 */
function resetPagesToDefault() {
    if (CONFIG.PAGE_ENABLED[0]) {
        renderHistoryData(0, false, "暂无地震预警数据");
    }
    if (CONFIG.PAGE_ENABLED[1]) {
        renderHistoryData(1, false, "暂无台网测定数据");
    }
    if (CONFIG.PAGE_ENABLED[3]) {
        renderHistoryData(3, false, "暂无海啸预警数据", "", PAGE_COLOR_MAP[3]);
    }
    if (CONFIG.PAGE_ENABLED[4]) {
        // 重置气象预警标签背景色为默认颜色
        dom.weatherTag.style.backgroundColor = PAGE_COLOR_MAP[4];
        renderHistoryData(4, false, "暂无气象预警数据", "", PAGE_COLOR_MAP[4]);
    }
    if (CONFIG.PAGE_ENABLED[5]) {
        renderHistoryData(5, false, "暂无台风信息数据", "", PAGE_COLOR_MAP[5]);
    }
}

/**
 * 重置烈度速报页面显示为默认状态
 */
function resetIntensityPageToDefault() {
    if (CONFIG.PAGE_ENABLED[2]) {
        renderHistoryData(2, false, "暂无烈度速报数据");
    }
}

/**
 * 重置所有页面的颜色为默认值
 * 包括文本颜色和标签背景色（如气象预警的weatherTag）
 */
function resetAllPageColorsToDefault() {
    // 重置气象预警标签背景色
    if (dom.weatherTag) {
        dom.weatherTag.style.backgroundColor = PAGE_COLOR_MAP[4];
    }
    
    console.log('✅ 已重置所有页面颜色为默认值');
}

// 创建WebSocket连接的通用函数
function createWebSocket(url, options) {
    const {
        onOpen,
        onMessage,
        onClose,
        onError,
        onFailed,
        reconnectCallback,
        reconnectDelay = 3000,
        maxReconnectDelay = 30000,
        maxReconnectAttempts = CONFIG.MAX_WS_RECONNECT || 0,
        reconnectCount = 0
    } = options;
    
    // 检查网络状态
    if (!checkNetworkStatus()) {
        console.warn(`⚠️  网络连接异常，暂时不连接WebSocket: ${url}`);
        if (reconnectCallback) {
            setTimeout(reconnectCallback, reconnectDelay);
        }
        return null;
    }
    
    // 检查重连次数限制（0表示不限制）
    if (maxReconnectAttempts > 0 && reconnectCount >= maxReconnectAttempts) {
        console.error(`❌ 重连次数已达上限(${maxReconnectAttempts})，停止重连: ${url}`);
        if (onFailed) {
            try {
                onFailed();
            } catch (err) {
                console.error("WebSocket onFailed回调失败：", err);
            }
        }
        return null;
    }
    
    try {
        console.log(`正在连接WebSocket: ${url} (重连次数: ${reconnectCount})...`);
        const ws = new WebSocket(url);
        
        ws.onopen = () => {
            console.log(`✅ WebSocket连接成功: ${url}`);
            if (onOpen) {
                try {
                    onOpen(ws);
                } catch (err) {
                    console.error("WebSocket onOpen回调失败：", err);
                }
            }
        };
        
        ws.onmessage = (e) => {
            if (onMessage) {
                try {
                    onMessage(e, ws);
                } catch (err) {
                    console.error("WebSocket onMessage回调失败：", err);
                }
            }
        };
        
        ws.onclose = (event) => {
            console.log(`WebSocket关闭: ${url} - ${event.code} - ${event.reason}`);
            if (onClose) {
                try {
                    onClose(event, ws);
                } catch (err) {
                    console.error("WebSocket onClose回调失败：", err);
                }
            }
            
            // 检测是否由于网络问题导致连接失败
            if (event.code === 1006 && reconnectCount >= 2) {
                checkAndShowNetworkError(url, reconnectCount);
            }
            
            // 重连逻辑
            if (reconnectCallback) {
                // 计算重连延迟（指数退避）
                const delay = Math.min(reconnectDelay * Math.pow(2, reconnectCount), maxReconnectDelay);
                console.log(`将在${delay}ms后尝试重连: ${url} (重连次数: ${reconnectCount + 1})`);
                setTimeout(reconnectCallback, delay);
            }
        };
        
        ws.onerror = (error) => {
            // 更详细的错误处理
            let errorMessage = "未知错误";
            if (error.code) {
                switch (error.code) {
                    case 1000:
                        errorMessage = "连接正常关闭";
                        break;
                    case 1001:
                        errorMessage = "端点离开";
                        break;
                    case 1002:
                        errorMessage = "协议错误";
                        break;
                    case 1003:
                        errorMessage = "不支持的数据类型";
                        break;
                    case 1004:
                        errorMessage = "保留";
                        break;
                    case 1005:
                        errorMessage = "无状态码";
                        break;
                    case 1006:
                        errorMessage = "连接异常关闭";
                        break;
                    case 1007:
                        errorMessage = "数据格式错误";
                        break;
                    case 1008:
                        errorMessage = "消息违反政策";
                        break;
                    case 1009:
                        errorMessage = "消息过大";
                        break;
                    case 1010:
                        errorMessage = "扩展协商失败";
                        break;
                    case 1011:
                        errorMessage = "服务器内部错误";
                        break;
                    case 1012:
                        errorMessage = "服务重启";
                        break;
                    case 1013:
                        errorMessage = "暂时不可用";
                        break;
                    case 1014:
                        errorMessage = "错误的网关响应";
                        break;
                    case 1015:
                        errorMessage = "TLS握手失败";
                        break;
                    default:
                        errorMessage = `错误码: ${error.code}`;
                }
            }
            
            console.error(`❌ WebSocket错误: ${url} - ${errorMessage}`, error);
            
            // 检测是否由于网络问题导致连接错误
            if (reconnectCount >= 2) {
                checkAndShowNetworkError(url, reconnectCount);
            }
            
            if (onError) {
                try {
                    onError(error, ws);
                } catch (err) {
                    console.error("WebSocket onError回调失败：", err);
                }
            }
            
            // 错误时关闭连接，触发重连
            if (ws && ws.readyState !== 3) {
                try {
                    ws.close(1001, "错误重连");
                } catch (err) {
                    console.error("WebSocket错误关闭失败：", err);
                }
            }
        };
        
        return ws;
    } catch (err) {
        console.error(`❌ WebSocket初始化失败: ${url}`, err);
        if (reconnectCallback) {
            setTimeout(reconnectCallback, reconnectDelay);
        }
        return null;
    }
}

function initWebSocket(){
    if (isConnectingMainWs) {
        console.log('⚠️ 主WebSocket正在连接中，跳过重复连接');
        return;
    }
    
    // 检查是否已有活跃的WebSocket连接
    if (webSocket && webSocket.readyState === 1) {
        console.log('✅ 主WebSocket已是活跃状态，跳过重新初始化');
        return;
    }
    
    isConnectingMainWs = true;
    clearInterval(pingTimer);
    if(webSocket&&webSocket.readyState!==3){
        try{
            webSocket.close(1000,"重连清理");
        }catch(err){
            console.error("WebSocket关闭失败：",err);
        }
        webSocket=null;
    }
    
    isInited = false;
    
    webSocket = createWebSocket(CONFIG.WS_ALL, {
        onOpen: (socket) => {
            isConnectingMainWs = false; // 释放连接锁
            markDataSourceConnected('main'); // 标记主数据源已连接
            reconnectCount = 0;
            parseMeasureData.source = "cenc";
            measureDataCache = {};
            alertStore = { lastEventId: "", lastSource: "", lastTime: 0 };
            lastMeasure = "";
            
            // 连接成功后重置页面显示
            resetPagesToDefault();
            
            setTimeout(() => {
                if (socket && socket.readyState === 1) {
                    try {
                        socket.send("query");
                        console.log("已发送查询请求");
                    } catch (err) {
                        console.error("发送查询请求失败：", err);
                    }
                }
            }, 50);
            
            pingTimer = setInterval(() => {
                if (socket && socket.readyState === 1) {
                    try {
                        socket.send("ping");
                    } catch (err) {
                        console.error("发送ping失败：", err);
                        clearInterval(pingTimer);
                        if (socket && socket.readyState !== 3) socket.close();
                    }
                }
            }, 5000);
        },
        onMessage: (e) => {
            if (!e.data || !e.data.startsWith("{")) return;
            try {
                const res = JSON.parse(e.data);
                if (res.type === "initial_all") {
                    const initParseMap = {"cea-pr": parseAlertData, "cea": parseAlertData, cenc: parseMeasureData, tsunami: parseTsunamiData, weatheralarm: parseWeatherData, typhoon: parseTyphoonData, ningxia: parseMeasureData, guangxi: parseMeasureData, shanxi: parseMeasureData, beijing: parseMeasureData, shandong: parseMeasureData, yunnan: parseMeasureData};
                    for (const [source, handler] of Object.entries(initParseMap)) {
                        if (res[source] && res[source].Data) {
                            try {
                                parseMeasureData.source = source;
                                // 为初始化数据添加一个标识，确保不会强制显示
                                handler(res[source].Data, source, true);
                            } catch (err) {
                                console.error(`处理${source}数据失败：`, err);
                            }
                        }
                    }
                    // 初始化完成后，尝试从缓存中获取最新的台网测定数据
                    setTimeout(() => {
                        const latestData = handleMeasureCache();
                        if (latestData) {
                            renderMeasureLatest(latestData, true);
                        }
                    }, 100);
                    isInited = true;
                    console.log("✅ 初始数据加载完成");
                    return;
                }
                if (res.type === "update" && res.source && res.Data) {
                    const parseMap = {"cea-pr": parseAlertData, "cea": parseAlertData, cenc: parseMeasureData, tsunami: parseTsunamiData, weatheralarm: parseWeatherData, typhoon: parseTyphoonData, ningxia: parseMeasureData, guangxi: parseMeasureData, shanxi: parseMeasureData, beijing: parseMeasureData, shandong: parseMeasureData, yunnan: parseMeasureData};
                    if (["cenc", "ningxia", "guangxi", "shanxi", "beijing", "shandong", "yunnan"].includes(res.source)) parseMeasureData.source = res.source;
                    try {
                        // 处理更新数据，会强制显示
                        parseMap[res.source] && parseMap[res.source](res.Data, res.source, false);
                    } catch (err) {
                        console.error(`处理${res.source}更新数据失败：`, err);
                    }
                }
            } catch (err) {
                console.error("❌ 数据解析失败：", err, "原始数据：", e.data);
            }
        },
        onClose: (event) => {
            isConnectingMainWs = false; // 释放连接锁
            // 更新主数据源状态（如果event存在且不是正常关闭）
            if (event && event.code !== 1000) {
                updateDataSourceStatus('main', event.code, reconnectCount);
            }
            clearInterval(pingTimer);
            webSocket = null;
        },
        onFailed: () => {
            isConnectingMainWs = false; // 释放连接锁
            console.log('❌ 主WebSocket连接失败，停止重连');
            if (!CONFIG.SHOW_NETWORK_STATUS) return;

            // 重置所有页面颜色为默认值
            resetAllPageColorsToDefault();

            if (CONFIG.PAGE_ENABLED[0]) {
                renderHistoryData(0, false, "数据源连接失败");
            }
            if (CONFIG.PAGE_ENABLED[1]) {
                renderHistoryData(1, false, "数据源连接失败");
            }
            if (CONFIG.PAGE_ENABLED[3]) {
                renderHistoryData(3, false, "数据源连接失败", "", PAGE_COLOR_MAP[3]);
            }
            if (CONFIG.PAGE_ENABLED[4]) {
                renderHistoryData(4, false, "数据源连接失败", "", PAGE_COLOR_MAP[4]);
            }
            if (CONFIG.PAGE_ENABLED[5]) {
                renderHistoryData(5, false, "数据源连接失败", "", PAGE_COLOR_MAP[5]);
            }
        },
        onError: (error) => {
            isConnectingMainWs = false; // 释放连接锁
            console.error('❌ 主WebSocket连接错误', error);
        },
        reconnectCallback: initWebSocket,
        reconnectCount: reconnectCount++
    });
}

function clearTimer(){
    if(timer){clearTimeout(timer);timer=null}
}
function clearAllTimer(){
    clearTimer();
    if(typeof intHttpTimer !== 'undefined' && intHttpTimer){clearTimeout(intHttpTimer);intHttpTimer=null}
    if(typeof forcedTimer !== 'undefined' && forcedTimer){clearTimeout(forcedTimer);forcedTimer=null}
}

/**
 * 内存清理函数
 * 负责清理缓存数据和动画ID，防止内存泄漏
 */
function clearMemory() {
    // 清理缓存数据
    if (Object.keys(measureDataCache).length > 100) {
        // 保留最新的10条数据
        const keys = Object.keys(measureDataCache).sort((a, b) => {
            const timeA = measureDataCache[a].data.shockTime ? new Date(measureDataCache[a].data.shockTime).getTime() : 0;
            const timeB = measureDataCache[b].data.shockTime ? new Date(measureDataCache[b].data.shockTime).getTime() : 0;
            return timeB - timeA;
        });
        keys.slice(10).forEach(key => delete measureDataCache[key]);
    }
    
    // 清理动画ID（只清理已完成的动画，保留正在进行中的动画）
    // 检查动画ID对应的元素是否存在，不存在则清理
    Object.keys(animationIds).forEach(id => {
        const lineItem = document.querySelector(`[data-animation-id="${id}"]`);
        if (!lineItem) {
            delete animationIds[id];
        }
    });
    
    // 清理DOM缓存中不再需要的缓存
    if (Object.keys(domCache).length > 100) {
        // 保留当前页面和相邻页面的DOM缓存，清理其他页面的缓存
        const currentPageKey = `${currentPage}_`;
        const prevPageKey = `${(currentPage - 1 + totalPage) % totalPage}_`;
        const nextPageKey = `${(currentPage + 1) % totalPage}_`;
        
        Object.keys(domCache).forEach(key => {
            if (!key.startsWith(currentPageKey) && !key.startsWith(prevPageKey) && !key.startsWith(nextPageKey)) {
                delete domCache[key];
            }
        });
    }
}

/**
 * 启动内存清理定时器
 * 每5分钟执行一次内存清理
 */
// 检查烈度速报数据是否过期的函数
function checkIntensityExpiry() {
    if (currentIntensityData && isExpiredData(currentIntensityData)) {
        console.log("⚠️  烈度速报数据已过期，清理显示");
        renderHistoryData(2, false, "暂无烈度速报数据");
        currentIntensityData = null;
    }
}

// 检查海啸预警数据是否过期的函数
function checkTsunamiExpiry() {
    if (currentTsunamiData && isExpiredData(currentTsunamiData)) {
        console.log("⚠️  海啸预警数据已过期，清理显示");
        renderHistoryData(3, false, "暂无海啸预警数据");
        currentTsunamiData = null;
    }
}

// 启动烈度速报过期检查定时器
function startIntensityExpiryCheck() {
    if (intensityExpiryCheckTimer) clearInterval(intensityExpiryCheckTimer);
    // 每10分钟检查一次是否过期
    intensityExpiryCheckTimer = setInterval(checkIntensityExpiry, 10 * 60 * 1000);
    console.log("✅ 烈度速报过期检查定时器已启动");
}

// 启动海啸预警过期检查定时器
function startTsunamiExpiryCheck() {
    if (tsunamiExpiryCheckTimer) clearInterval(tsunamiExpiryCheckTimer);
    // 每10分钟检查一次是否过期
    tsunamiExpiryCheckTimer = setInterval(checkTsunamiExpiry, 10 * 60 * 1000);
    console.log("✅ 海啸预警过期检查定时器已启动");
}

// 检查台风信息数据是否过期的函数
function checkTyphoonExpiry() {
    // 台风数据不会过期，但如果超过24小时没有更新，可能已经消散
    if (currentTyphoonData && currentTyphoonData.Data && currentTyphoonData.Data.length > 0) {
        const updateTime = currentTyphoonData.Data[0]?.updateTime;
        if (updateTime) {
            const updateDate = new Date(updateTime);
            if (!isNaN(updateDate.getTime()) && Date.now() - updateDate.getTime() > ONE_DAY) {
                console.log("⚠️  台风信息数据超过24小时未更新，可能已消散，清理显示");
                renderHistoryData(5, false, "暂无台风信息数据", "", PAGE_COLOR_MAP[5]);
                currentTyphoonData = null;
                lastTyphoon = "";
            }
        }
    }
}

// 启动台风信息过期检查定时器
function startTyphoonExpiryCheck() {
    if (typhoonExpiryCheckTimer) clearInterval(typhoonExpiryCheckTimer);
    // 每10分钟检查一次是否过期
    typhoonExpiryCheckTimer = setInterval(checkTyphoonExpiry, 10 * 60 * 1000);
    console.log("✅ 台风信息过期检查定时器已启动");
}

function startMemoryCleanup() {
    if (memoryCleanupTimer) clearInterval(memoryCleanupTimer);
    // 每5分钟清理一次内存
    memoryCleanupTimer = setInterval(clearMemory, 5 * 60 * 1000);
}

/**
 * 检查当前网络状态
 * @returns {boolean} - 当前网络状态，true表示在线，false表示离线
 */
function checkNetworkStatus() {
    return navigator.onLine;
}

/**
 * 启动网络状态监听
 * 监听网络连接和断开事件，并在网络状态变化时采取相应措施
 */
// 网络连接事件处理函数
function handleOnlineEvent() {
    console.log('✅ 网络已连接');
    
    // 隐藏网络断开状态
    hideNetworkDisconnectedStatus();
    
    // 重置数据源失败状态（网络恢复后重新尝试）
    if (intensitySourceStopped) {
        console.log('✅ 网络恢复，重置数据源状态');
        nowQuakeFailed = false;
        fanStudioFailed = false;
        intensitySourceStopped = false;
        intensityReconnectCount = 0;
        fanStudioReconnectCount = 0;
    }
    
    // 网络恢复时立即重置页面显示
    if (CONFIG.SHOW_NETWORK_STATUS) {
        resetPagesToDefault();
        resetIntensityPageToDefault();
    }
    
    // 网络恢复时，尝试重连WebSocket
    if (!webSocket || webSocket.readyState === 3) {
        console.log('正在重连主WebSocket...');
        initWebSocket();
    }
    
    // 根据配置重连烈度速报数据源
    const source = CONFIG.INTENSITY_SOURCE || "auto";
    if (source === "auto") {
        // auto模式：根据NowQuake是否失败决定重连哪个
        if (nowQuakeFailed) {
            if (!fanStudioWebSocket || fanStudioWebSocket.readyState === 3) {
                console.log('正在重连Fan Studio烈度速报WebSocket...');
                initFanStudioWss();
            }
        } else {
            if (!intensityWebSocket || intensityWebSocket.readyState === 3) {
                console.log('正在重连NowQuake烈度速报WebSocket...');
                initIntensityWss();
            }
        }
    } else if (source === "nowquake") {
        if (!intensityWebSocket || intensityWebSocket.readyState === 3) {
            console.log('正在重连NowQuake烈度速报WebSocket...');
            initIntensityWss();
        }
    } else if (source === "fanstudio") {
        if (!fanStudioWebSocket || fanStudioWebSocket.readyState === 3) {
            console.log('正在重连Fan Studio烈度速报WebSocket...');
            initFanStudioWss();
        }
    }
}

// 网络断开事件处理函数
function handleOfflineEvent() {
    console.log('❌ 网络已断开');
    showNetworkDisconnectedStatus();
}

/**
 * 显示网络断开状态
 * 在各页面显示网络断开提示，并标记状态已显示
 */
function showNetworkDisconnectedStatus() {
    if (!CONFIG.SHOW_NETWORK_STATUS || networkStatusDisplayed) return;

    console.log('❌ 显示网络断开状态提示');
    networkStatusDisplayed = true;

    // 重置所有页面的颜色为默认值
    resetAllPageColorsToDefault();

    // 在各页面显示网络断开提示
    if (CONFIG.PAGE_ENABLED[0]) {
        renderHistoryData(0, false, "网络已断开，正在等待恢复...");
    }
    if (CONFIG.PAGE_ENABLED[1]) {
        renderHistoryData(1, false, "网络已断开，正在等待恢复...");
    }
    if (CONFIG.PAGE_ENABLED[2]) {
        renderHistoryData(2, false, "网络已断开，正在等待恢复...");
    }
    if (CONFIG.PAGE_ENABLED[3]) {
        renderHistoryData(3, false, "网络已断开，正在等待恢复...", "", PAGE_COLOR_MAP[3]);
    }
    if (CONFIG.PAGE_ENABLED[4]) {
        renderHistoryData(4, false, "网络已断开，正在等待恢复...", "", PAGE_COLOR_MAP[4]);
    }
    if (CONFIG.PAGE_ENABLED[5]) {
        renderHistoryData(5, false, "网络已断开，正在等待恢复...", "", PAGE_COLOR_MAP[5]);
    }
}

/**
 * 隐藏网络断开状态
 * 重置页面显示，清除网络断开状态标记
 */
function hideNetworkDisconnectedStatus() {
    if (!networkStatusDisplayed) return;
    
    console.log('✅ 隐藏网络断开状态提示');
    networkStatusDisplayed = false;
    
    // 重置页面显示
    resetPagesToDefault();
    resetIntensityPageToDefault();
}

/**
 * 检测WebSocket连接失败是否由于网络问题
 * @param {string} url - WebSocket URL
 * @param {number} reconnectCount - 当前重连次数
 */
function checkAndShowNetworkError(url, reconnectCount) {
    // 如果重连次数超过2次，可能是网络问题
    if (reconnectCount >= 2 && !networkStatusDisplayed && !checkNetworkStatus()) {
        console.log(`⚠️ WebSocket连接多次失败(${reconnectCount}次)，检测到网络可能已断开: ${url}`);
        showNetworkDisconnectedStatus();
    }
}

/**
 * 根据WebSocket关闭码判断错误类型
 * @param {number} code - WebSocket关闭码
 * @returns {string} - 错误类型
 */
function classifyErrorByCode(code) {
    switch (code) {
        case 1000:
            return ERROR_TYPES.NORMAL_CLOSE;
        case 1001:
            return ERROR_TYPES.SERVER_UNAVAILABLE;
        case 1002:
            return ERROR_TYPES.PROTOCOL_ERROR;
        case 1003:
            return ERROR_TYPES.PROTOCOL_ERROR;
        case 1006:
            return ERROR_TYPES.NETWORK; // 异常关闭，通常是网络问题
        case 1008:
            return ERROR_TYPES.CONNECTION_REFUSED;
        case 1011:
            return ERROR_TYPES.SERVER_ERROR;
        case 1012:
            return ERROR_TYPES.SERVER_RESTART;
        case 1013:
            return ERROR_TYPES.SERVER_UNAVAILABLE;
        case 1014:
            return ERROR_TYPES.SERVER_ERROR;
        case 1015:
            return ERROR_TYPES.NETWORK; // TLS握手失败，通常是网络问题
        default:
            // 未知的关闭码也归类为网络问题（保守策略）
            return ERROR_TYPES.NETWORK;
    }
}

/**
 * 获取错误类型的用户友好描述
 * @param {string} errorType - 错误类型
 * @param {string} dataSourceName - 数据源名称
 * @returns {string} - 用户友好的错误消息
 */
function getErrorMessage(errorType, dataSourceName) {
    switch (errorType) {
        case ERROR_TYPES.NETWORK:
            return `${dataSourceName}连接异常，可能网络已断开`;
        case ERROR_TYPES.SERVER_ERROR:
            return `${dataSourceName}服务器内部错误`;
        case ERROR_TYPES.SERVER_RESTART:
            return `${dataSourceName}服务正在重启`;
        case ERROR_TYPES.SERVER_UNAVAILABLE:
            return `${dataSourceName}服务暂时不可用`;
        case ERROR_TYPES.PROTOCOL_ERROR:
            return `${dataSourceName}协议错误`;
        case ERROR_TYPES.CONNECTION_REFUSED:
            return `${dataSourceName}连接被拒绝`;
        case ERROR_TYPES.NORMAL_CLOSE:
            return `${dataSourceName}连接已正常关闭`;
        default:
            return `${dataSourceName}连接失败`;
    }
}

/**
 * 更新数据源状态并显示相应的错误信息
 * @param {string} source - 数据源标识 ('main', 'intensity', 'fanStudio')
 * @param {number} closeCode - WebSocket关闭码
 * @param {number} reconnectCount - 当前重连次数
 */
function updateDataSourceStatus(source, closeCode, reconnectCount) {
    const errorType = classifyErrorByCode(closeCode);
    
    // 获取数据源显示名称
    let dataSourceName = '';
    switch (source) {
        case 'main':
            dataSourceName = '主数据源';
            break;
        case 'intensity':
            dataSourceName = 'NowQuake烈度速报';
            break;
        case 'fanStudio':
            dataSourceName = 'Fan Studio烈度速报';
            break;
        default:
            dataSourceName = '数据源';
    }
    
    const errorMessage = getErrorMessage(errorType, dataSourceName);
    
    // 更新状态
    dataSourceStatus[source] = {
        connected: false,
        errorType: errorType,
        errorMessage: errorMessage
    };
    
    console.log(`📊 数据源状态更新 [${source}]: ${errorMessage}`);
    
    // 根据错误类型和重连次数决定是否显示错误信息
    if (reconnectCount >= 1) {
        showDataSourceError(source, errorType, errorMessage);
    }
    
    // 检查是否所有数据源都因网络问题断开
    checkAllDataSourcesNetworkIssue();
}

/**
 * 标记数据源为已连接状态
 * @param {string} source - 数据源标识
 */
function markDataSourceConnected(source) {
    if (!dataSourceStatus[source]) return;
    
    dataSourceStatus[source] = {
        connected: true,
        errorType: null,
        errorMessage: null
    };
    
    console.log(`✅ 数据源已连接 [${source}]`);
    
    // 如果之前显示了该数据源的错误信息，现在可以清除
    hideDataSourceError(source);
    
    // 如果所有数据源都已连接或恢复，隐藏全局网络断开提示
    checkAndHideGlobalNetworkStatus();
}

/**
 * 显示特定数据源的错误信息
 * @param {string} source - 数据源标识
 * @param {string} errorType - 错误类型
 * @param {string} message - 错误消息
 */
function showDataSourceError(source, errorType, message) {
    if (!CONFIG.SHOW_NETWORK_STATUS) return;
    
    console.log(`⚠️ 显示数据源错误 [${source}]: ${message}`);
    
    // 重置所有页面的颜色为默认值（确保断开连接后颜色恢复正常）
    resetAllPageColorsToDefault();
    
    // 根据数据源在对应页面显示错误
    switch (source) {
        case 'main':
            // 主数据源影响：地震预警(0)、台网测定(1)、海啸预警(3)、气象预警(4)、台风信息(5)
            if (CONFIG.PAGE_ENABLED[0] && errorType !== ERROR_TYPES.NORMAL_CLOSE) {
                renderHistoryData(0, false, message);
            }
            if (CONFIG.PAGE_ENABLED[1] && errorType !== ERROR_TYPES.NORMAL_CLOSE) {
                renderHistoryData(1, false, message);
            }
            if (CONFIG.PAGE_ENABLED[3] && errorType !== ERROR_TYPES.NORMAL_CLOSE) {
                renderHistoryData(3, false, message, "", PAGE_COLOR_MAP[3]);
            }
            if (CONFIG.PAGE_ENABLED[4] && errorType !== ERROR_TYPES.NORMAL_CLOSE) {
                renderHistoryData(4, false, message, "", PAGE_COLOR_MAP[4]);
            }
            if (CONFIG.PAGE_ENABLED[5] && errorType !== ERROR_TYPES.NORMAL_CLOSE) {
                renderHistoryData(5, false, message, "", PAGE_COLOR_MAP[5]);
            }
            break;
            
        case 'intensity':
        case 'fanStudio':
            // 烈度速报数据源影响：烈度速报页面(2)
            if (CONFIG.PAGE_ENABLED[2] && errorType !== ERROR_TYPES.NORMAL_CLOSE) {
                renderHistoryData(2, false, message);
            }
            break;
    }
}

/**
 * 隐藏特定数据源的错误信息
 * @param {string} source - 数据源标识
 */
function hideDataSourceError(source) {
    // 当数据源重新连接成功时，对应的页面会在onOpen回调中通过resetPagesToDefault()等函数重置
    // 这里主要用于清理额外的状态标记
    console.log(`✅ 清除数据源错误显示 [${source}]`);
}

/**
 * 检查所有数据源是否都因网络问题断开
 * 如果是，则显示全局网络断开提示
 */
function checkAllDataSourcesNetworkIssue() {
    const sources = Object.keys(dataSourceStatus);
    const allNetworkIssue = sources.every(source => {
        const status = dataSourceStatus[source];
        // 如果数据源未连接且错误类型是网络问题，则计入
        return status.connected === true || status.errorType === ERROR_TYPES.NETWORK || status.errorType === null;
    });
    
    // 如果有至少一个数据源因非网络原因断开，不显示全局网络断开
    const hasNonNetworkError = sources.some(source => {
        const status = dataSourceStatus[source];
        return status.connected === false && 
               status.errorType !== null && 
               status.errorType !== ERROR_TYPES.NETWORK &&
               status.errorType !== ERROR_TYPES.NORMAL_CLOSE;
    });
    
    // 只有当所有活跃的数据源都因网络问题断开时，才显示全局网络断开提示
    if (allNetworkIssue && !hasNonNetworkError && !networkStatusDisplayed) {
        const disconnectedSources = sources.filter(s => 
            dataSourceStatus[s].connected === false && 
            dataSourceStatus[s].errorType === ERROR_TYPES.NETWORK
        );
        
        if (disconnectedSources.length > 0) {
            console.log(`⚠️ 多个数据源因网络问题断开: ${disconnectedSources.join(', ')}`);
            // 不立即显示全局网络断开，让各个数据源显示自己的错误信息
        }
    }
}

/**
 * 检查并隐藏全局网络状态（如果所有数据源都已恢复）
 */
function checkAndHideGlobalNetworkStatus() {
    const allConnected = Object.values(dataSourceStatus).every(status => status.connected === true);
    
    if (allConnected && networkStatusDisplayed) {
        hideNetworkDisconnectedStatus();
    }
}

function startNetworkMonitor() {
    // 监听网络连接事件
    window.addEventListener('online', handleOnlineEvent);
    
    // 监听网络断开事件
    window.addEventListener('offline', handleOfflineEvent);
    
    console.log('✅ 网络状态监听器已启动');
}

window.onbeforeunload=()=>{
    clearInterval(pingTimer);
    clearAllTimer();
    if(memoryCleanupTimer)clearInterval(memoryCleanupTimer);
    if(intensityExpiryCheckTimer)clearInterval(intensityExpiryCheckTimer);
    if(tsunamiExpiryCheckTimer)clearInterval(tsunamiExpiryCheckTimer);
    if(typhoonExpiryCheckTimer)clearInterval(typhoonExpiryCheckTimer);
    stopTyphoonUpdateTimer(); // 清理台风数据定时更新
    if(webSocket&&webSocket.readyState!==3)webSocket.close(1000,"页面关闭");
    measureDataCache={};
    alertStore = { lastEventId: "", lastSource: "", lastTime: 0 };
    clearInterval(intensityPingTimer);
    closeIntWss();
    clearInterval(fanStudioPingTimer);
    closeFanStudioWss();
    intensityHttpRetryCount=0;
    intensityReconnectCount=0;
    fanStudioReconnectCount=0;
    nowQuakeFailed=false;
    fanStudioFailed=false;
    intensitySourceStopped=false;

    // 清理网络状态监听器
    window.removeEventListener('online', handleOnlineEvent);
    window.removeEventListener('offline', handleOfflineEvent);

    // 清理所有动画
    Object.values(animationIds).forEach(id=>{
        if(id)cancelAnimationFrame(id);
    });
    animationIds={};

    // 清理DOM缓存
    domCache={};

    // 清理DOM引用
    Object.keys(dom).forEach(key=>{
        if(typeof dom[key]==='object' && dom[key]!==null){
            if(Array.isArray(dom[key])){
                dom[key]=[];
            }else{
                dom[key]=null;
            }
        }
    });
};
