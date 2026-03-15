

let webSocket=null,pingTimer=null,reconnectCount=0;
let currentPage=0,totalPage=6;
let timer=null,forcedTimer=null;
let isForcedShow=false,isScrolling=false,isInited=false;
let lastAlert="",lastMeasure="",lastIntensity="",lastTsunami="",lastWeather="";
let curScrollingLines=[];
let measureDataCache={};
let alertStore = { lastEventId: "", lastSource: "", lastTime: 0, lastProvince: "", lastUpdates: 0 };
let intensityWebSocket=null,intensityPingTimer=null,intensityReconnectCount=0;
let intensityHttpTimer=null,intensityHttpRetryCount=0;
let isIntensityInited=false;
let animationIds={}; // 动画ID管理
let memoryCleanupTimer=null; // 内存清理定时器
let intensityExpiryCheckTimer=null; // 烈度速报过期检查定时器
let tsunamiExpiryCheckTimer=null; // 海啸预警过期检查定时器
let currentIntensityData=null; // 当前显示的烈度速报数据
let currentTsunamiData=null; // 当前显示的海啸预警数据
let domCache={}; // DOM节点缓存

const dom={
    wrap:document.getElementById("mainScrollWrapper"),
    contentWraps:[
        document.getElementById("alertContentWrap"),
        document.getElementById("measureContentWrap"),
        document.getElementById("intensityContentWrap"),
        document.getElementById("tsunamiContentWrap"),
        document.getElementById("weatherContentWrap"),
        document.getElementById("appInfoContentWrap")
    ],
    alertTag:document.getElementById("alertTag"),
    measureTag:document.getElementById("measureTag"),
    intensityTag:document.getElementById("intensityTag"),
    tsunamiTag:document.getElementById("tsunamiTag"),
    weatherTag:document.getElementById("weatherTag")
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
    if (dom.contentWraps[5]) {
        dom.contentWraps[5].innerHTML = `
            <div class="line-item"><div class="line-text">${CONFIG.APP_INFO}</div></div>
        `;
    }
    
    // 检查初始网络状态
    if (checkNetworkStatus()) {
        console.log("✅ 网络连接正常，正在初始化WebSocket...");
        initWebSocket();      // 初始化主WebSocket连接
        initIntensityHttp();  // 初始化烈度速报HTTP请求
        initIntensityWss();   // 初始化烈度速报WebSocket连接
    } else {
        console.log("❌ 网络连接异常，将在网络恢复后自动初始化");
    }
    
    startMemoryCleanup();   // 启动内存清理定时器
    startIntensityExpiryCheck(); // 启动烈度速报过期检查定时器
    startTsunamiExpiryCheck(); // 启动海啸预警过期检查定时器
    startNetworkMonitor();  // 启动网络状态监听器
    startPageLogic();       // 启动页面逻辑
    
    console.log("✅ 预警OBS版初始化完成（包含最终烈度速报解析逻辑）");
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
            
            setTimeout(() => {
                if (!isForcedShow && curScrollingLines.length === 0) {
                    doPageTurn();
                }
            }, 100);
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
    const isUpdatesNewer = compareUpdates(data.updates, alertStore.lastUpdates);
    
    // 处理逻辑：
    // 1. 如果 eventId 不同，新的 eventId 更晚，处理
    // 2. 如果 eventId 相同，updates 更大，处理
    // 3. 如果是国家级数据，且 eventId 相同或更晚，处理
    // 4. 其他情况，跳过处理
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
    latestData ? renderMeasureLatest(latestData, isInitial) : renderHistoryData(1, false, "暂无台网测定数据");
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
    if (intensityHttpRetryCount >= CONFIG.MAX_RETRY) {
        renderHistoryData(2, false, "暂无烈度速报数据");
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
    if (intensityHttpRetryCount >= CONFIG.MAX_RETRY) return;
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
    intensityReconnectCount++;
    const delay = Math.min(3000 * Math.pow(2, intensityReconnectCount), 30000);
    setTimeout(initIntensityWss, delay);
}

/**
 * 初始化烈度速报WebSocket连接
 */
function initIntensityWss() {
    closeIntWss();
    
    intensityWebSocket = createWebSocket(CONFIG.INT_WSS_REAL, {
        onOpen: (socket) => {
            console.log("✅ 烈度速报WebSocket连接成功");
            intensityReconnectCount = 0;
            isIntensityInited = true;
            
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
            console.log(`烈度速报WebSocket关闭：${event.code} - ${event.reason}`);
            clearInterval(intensityPingTimer);
            intensityWebSocket = null;
            if (event.code !== 1000) {
                intWssRetry();
            }
        },
        onError: () => {
            intWssRetry();
        },
        reconnectCallback: initIntensityWss,
        reconnectCount: intensityReconnectCount++
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
        depth: data.depth || "未知",
        maxInt: data.maxintensity || 0,
        maxForecastInt: data.maxforecastintensity || 0
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
        .replace(/"/g, "“")
        .replace(/'/g, "‘")
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

    // 最终文本合并成一行在第二行显示
    const line1 = `中国地震台网中心烈度速报（更新时间：${intensityInfo.updateTime}）`;
    const line2 = `${intensityInfo.happenTime} ${intensityInfo.hypocenter} 发生<span class="highlight-num">${intensityInfo.mag.toFixed(1)}</span>级地震，震源深度<span class="highlight-num">${intensityInfo.depth}</span>公里，实测最大烈度<span class="highlight-num">${intensityInfo.maxInt.toFixed(1)}</span>度，预测最大烈度<span class="highlight-num">${intensityInfo.maxForecastInt.toFixed(1)}</span>度。${infoText}${stationsText}`;

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
        renderHistoryData(3, false, "暂无海啸预警数据");
        currentTsunamiData = null;
        return;
    }
    
    console.log(`✅ 收到海啸预警数据：${data.warningInfo?.title}`);

    const uniqueId = `${data.id}_${data.code || data.id}_${data.warningInfo?.title}_${data.details?.batch || 1}_${data.timeInfo?.updateDate || Date.now()}`;
    if (uniqueId === lastTsunami) return;
    lastTsunami = uniqueId;
    
    // 检查数据是否过期
    if (isExpiredData(data)) {
        renderHistoryData(3, false, "暂无海啸预警数据");
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
    const colorMap = {红色: "#FF0000", 橙色: "#FF7F50", 黄色: "#FFFF00", 蓝色: "#1E90FF", 默认: "#9933ff"};
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
    const colorMap = {红色: "#FF0000", 橙色: "#FF7F50", 黄色: "#FFFF00", 蓝色: "#1E90FF", 默认: "#9933ff"};
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
    const level = data.headline.includes("红色") ? "红色" : data.headline.includes("橙色") ? "橙色" : data.headline.includes("黄色") ? "黄色" : data.headline.includes("蓝色") ? "蓝色" : "默认";
    const targetColor = colorMap[level];
    dom.weatherTag.style.backgroundColor = targetColor;
    const line1 = `${data.effective || "未知时间"} ${data.headline}`;
    const line2 = data.description || "请做好相关防范措施";
    
    // 根据是否是初始化数据决定使用哪个渲染函数
    if (isInitial) {
        renderHistoryData(4, true, line1, line2, targetColor);
    } else {
        CONFIG.WEATHER_FORCED ? renderRealTimeData(4, true, line1, line2, targetColor) : renderHistoryData(4, true, line1, line2, targetColor);
    }
    if (currentPage === 4) startPageLogic();
}

// 创建WebSocket连接的通用函数
function createWebSocket(url, options) {
    const {
        onOpen,
        onMessage,
        onClose,
        onError,
        reconnectCallback,
        reconnectDelay = 3000,
        maxReconnectDelay = 30000,
        maxReconnectAttempts = 5,
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
    
    // 检查重连次数限制
    if (reconnectCount >= maxReconnectAttempts) {
        console.error(`❌ 重连次数已达上限(${maxReconnectAttempts})，停止重连: ${url}`);
        // 可以在这里添加通知用户的逻辑
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
            reconnectCount = 0;
            parseMeasureData.source = "cenc";
            measureDataCache = {};
            alertStore = { lastEventId: "", lastSource: "", lastTime: 0 };
            lastMeasure = "";
            
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
                    const initParseMap = {"cea-pr": parseAlertData, "cea": parseAlertData, cenc: parseMeasureData, tsunami: parseTsunamiData, weatheralarm: parseWeatherData, ningxia: parseMeasureData, guangxi: parseMeasureData, shanxi: parseMeasureData, beijing: parseMeasureData, shandong: parseMeasureData, yunnan: parseMeasureData};
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
                    const parseMap = {"cea-pr": parseAlertData, "cea": parseAlertData, cenc: parseMeasureData, tsunami: parseTsunamiData, weatheralarm: parseWeatherData, ningxia: parseMeasureData, guangxi: parseMeasureData, shanxi: parseMeasureData, beijing: parseMeasureData, shandong: parseMeasureData, yunnan: parseMeasureData};
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
        onClose: () => {
            clearInterval(pingTimer);
            webSocket = null;
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
    // 网络恢复时，尝试重连WebSocket
    if (!webSocket || webSocket.readyState === 3) {
        console.log('正在重连主WebSocket...');
        initWebSocket();
    }
    if (!intensityWebSocket || intensityWebSocket.readyState === 3) {
        console.log('正在重连烈度速报WebSocket...');
        initIntensityWss();
    }
}

// 网络断开事件处理函数
function handleOfflineEvent() {
    console.log('❌ 网络已断开');
    // 网络断开时，可以暂停某些操作或显示提示
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
    if(webSocket&&webSocket.readyState!==3)webSocket.close(1000,"页面关闭");
    measureDataCache={};
    alertStore = { lastEventId: "", lastSource: "", lastTime: 0 };
    clearInterval(intensityPingTimer);
    closeIntWss();
    intensityHttpRetryCount=0;
    intensityReconnectCount=0;
    
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
