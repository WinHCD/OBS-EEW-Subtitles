

let ws=null,pingTimer=null,reconnectCount=0;
let curPage=0,totalPage=6;
let timer=null,forcedTimer=null;
let isForcedShow=false,isScrolling=false,isInited=false;
let lastAlert="",lastMeasure="",lastIntensity="",lastTsunami="",lastWeather="";
let curScrollingLines=[];
let measureDataCache={};
let alertStore = { lastEventId: "", lastSource: "", lastTime: 0 };
let wsIntensity=null,pingTimerIntensity=null,reconnectCountIntensity=0;
let intHttpTimer=null,intHttpRetryCount=0;
let isIntInited=false;
let animationIds={}; // 动画ID管理
let memoryCleanupTimer=null; // 内存清理定时器

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

(function init(){
    curPage=0;
    dom.wrap.style.transform=`translate3d(0, 0, 0)`;
    dom.wrap.style.webkitTransform=`translate3d(0, 0, 0)`;
    // 更新应用信息
    if(dom.contentWraps[5]){
        dom.contentWraps[5].innerHTML=`
            <div class="line-item"><div class="line-text">${CONFIG.APP_INFO}</div></div>
        `;
    }
    initWebSocket();
    initIntensityHttp();
    initIntensityWss();
    startMemoryCleanup(); // 启动内存清理定时器
    startPageLogic();
    console.log("✅ 预警OBS版初始化完成（包含最终烈度速报解析逻辑）");
    console.log("✅ 内存清理机制已启动");
})();

function startPageLogic(){
    if(isForcedShow)return;
    clearTimer();
    
    const wrap=dom.contentWraps[curPage];
    if(!wrap)return;
    const lineItems=wrap.querySelectorAll(".line-item");
    let hasScrolling=false;
    
    // 重置滚动状态
    isScrolling = false;
    curScrollingLines = [];
    
    lineItems.forEach(lineItem=>{
        lineItem.classList.remove("overflow");
        const lineText=lineItem.querySelector(".line-text");
        if(!lineText)return;

        lineText.offsetWidth;
        const isOverflow=lineText.scrollWidth>lineItem.clientWidth;
        
        if(isOverflow){
            lineItem.classList.add("overflow");
            hasScrolling=true;
            curScrollingLines.push(lineItem);
            startLineScroll(lineText,lineItem);
        }
    });
    
    if(!hasScrolling){
        timer=setTimeout(doPageTurn,CONFIG.NO_OVERFLOW_DELAY);
    }
}

function doPageTurn(){
    if(isForcedShow)return;
    
    const nextPage=(curPage+1)%totalPage;
    dom.wrap.style.transform=`translate3d(0, ${-100*nextPage}%, 0)`;
    dom.wrap.style.webkitTransform=`translate3d(0, ${-100*nextPage}%, 0)`;
    
    const onTransEnd=()=>{
        dom.wrap.removeEventListener("transitionend", onTransEnd);
        dom.wrap.removeEventListener("webkitTransitionEnd", onTransEnd);
        curPage=nextPage;
        startPageLogic();
    };

    dom.wrap.removeEventListener("transitionend", onTransEnd);
    dom.wrap.removeEventListener("webkitTransitionEnd", onTransEnd);
    dom.wrap.addEventListener("transitionend", onTransEnd);
    dom.wrap.addEventListener("webkitTransitionEnd", onTransEnd);
    
    setTimeout(()=>{
        dom.wrap.removeEventListener("transitionend", onTransEnd);
        dom.wrap.removeEventListener("webkitTransitionEnd", onTransEnd);
        curPage=nextPage;
        startPageLogic();
    },CONFIG.TRANSITION + 100);
}

function startLineScroll(lineText,lineItem){
    if(!lineText||!lineItem)return;
    
    // 清除之前的动画和事件监听器
    lineText.style.animation="";
    lineText.style.webkitAnimation="";
    lineText.removeEventListener('animationend', ()=>{});
    lineText.removeEventListener('webkitAnimationEnd', ()=>{});
    
    // 清除之前的动画ID
    const lineItemId=lineItem.getAttribute('data-animation-id')||`anim_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
    lineItem.setAttribute('data-animation-id',lineItemId);
    
    if(animationIds[lineItemId]){
        cancelAnimationFrame(animationIds[lineItemId]);
        delete animationIds[lineItemId];
    }
    
    // 计算容器宽度和元素宽度
    const containerWidth=lineItem.clientWidth;
    const contentWidth=lineText.scrollWidth;
    
    // 设置初始位置：容器右侧外
    let currentPosition=containerWidth;
    lineText.style.transform=`translate3d(${currentPosition}px, 0, 0)`;
    lineText.style.webkitTransform=`translate3d(${currentPosition}px, 0, 0)`;
    lineText.style.transition="";
    lineText.style.webkitTransition="";
    
    // 强制重排，确保初始位置生效
    lineText.offsetWidth;
    
    // 计算滚动距离和持续时间（转换为毫秒）
    const totalScrollDistance=contentWidth+containerWidth;
    const scrollDuration=Math.round((totalScrollDistance/CONFIG.SCROLL_SPEED)*1000);
    const startTime=performance.now();
    
    // 使用requestAnimationFrame实现平滑滚动
    function animate(currentTime){
        const elapsedTime=currentTime-startTime;
        const progress=Math.min(elapsedTime/scrollDuration,1);
        const newPosition=containerWidth-totalScrollDistance*progress;
        
        lineText.style.transform=`translate3d(${newPosition}px, 0, 0)`;
        lineText.style.webkitTransform=`translate3d(${newPosition}px, 0, 0)`;
        
        if(progress<1){
            animationIds[lineItemId]=requestAnimationFrame(animate);
        }else{
            // 滚动结束
            lineText.style.transform="";
            lineText.style.webkitTransform="";
            curScrollingLines=curScrollingLines.filter(item=>item!==lineItem);
            isScrolling = false;
            
            // 清除动画ID
            delete animationIds[lineItemId];
            
            setTimeout(() => {
                if(!isForcedShow && curScrollingLines.length === 0){
                    doPageTurn();
                }
            }, 100);
        }
    }
    
    // 开始动画
    animationIds[lineItemId]=requestAnimationFrame(animate);
}

function addTagBlink(page){
    removeAllTagBlink();
    switch(page){case 0:dom.alertTag.classList.add("tag-blink");break;case 1:dom.measureTag.classList.add("tag-blink");break;case 2:dom.intensityTag.classList.add("tag-blink");break;case 3:dom.tsunamiTag.classList.add("tag-blink");break;}
}

function removeAllTagBlink(){
    dom.alertTag.classList.remove("tag-blink");
    dom.measureTag.classList.remove("tag-blink");
    dom.intensityTag.classList.remove("tag-blink");
    dom.tsunamiTag.classList.remove("tag-blink");
    dom.weatherTag.classList.remove("tag-blink");
}

function renderContent(page,isDoubleLine,line1,line2="",color=""){
    const wrap=dom.contentWraps[page];
    if(!wrap)return;
    wrap.innerHTML="";
    const highlightStyle=`style="color:${CONFIG.HIGHLIGHT_COLOR}"`;
    line1=line1.replace(/<span class="highlight-num">/g,`<span class="highlight-num" ${highlightStyle}>`);
    line2=line2.replace(/<span class="highlight-num">/g,`<span class="highlight-num" ${highlightStyle}>`);
    wrap.innerHTML=isDoubleLine?`
        <div class="line-item"><div class="line-text" ${color?`style="color:${color}"`:""}>${line1}</div></div>
        <div class="line-item"><div class="line-text" ${color?`style="color:${color}"`:""}>${line2}</div></div>
    `:`<div class="line-item"><div class="line-text" ${color?`style="color:${color}"`:""}>${line1}</div></div>`;

    wrap.offsetWidth;

    if(curPage===page&&!isForcedShow){
        startPageLogic();
    }
}

function renderHistoryData(page,isDoubleLine,line1,line2="",color=""){
    renderContent(page,isDoubleLine,line1,line2,color);
}

function renderRealTimeData(page,isDoubleLine,line1,line2="",color=""){
    clearAllTimer();
    isForcedShow=true;
    isScrolling=false;
    
    document.querySelectorAll('.line-text').forEach(text => {
        text.style.animation = "";
        text.style.webkitAnimation = "";
    });
    dom.wrap.removeEventListener('transitionend', ()=>{});
    dom.wrap.removeEventListener('webkitTransitionEnd', ()=>{});

    const targetColor=color||PAGE_COLOR_MAP[page]||"#fff";
    dom.wrap.style.transition="none";
    dom.wrap.style.webkitTransition="none";
    dom.wrap.style.transform=`translate3d(0, ${-100*page}%, 0)`;
    dom.wrap.style.webkitTransform=`translate3d(0, ${-100*page}%, 0)`;
    setTimeout(()=>{
        dom.wrap.style.transition=`transform ${CONFIG.TRANSITION/1000}s ease-in-out`;
        dom.wrap.style.webkitTransition=`-webkit-transform ${CONFIG.TRANSITION/1000}s ease-in-out`;
    },CONFIG.TRANSITION+50);
    renderContent(page,isDoubleLine,line1,line2,targetColor);
    curPage=page;
    addTagBlink(page);
    startPageLogic();
    
    forcedTimer=setTimeout(()=>{
        isForcedShow=false;
        removeAllTagBlink();
        startPageLogic();
    },CONFIG.FORCED_SHOW);
}

function parseAlertData(data, source) {
    if (!data?.id || !data?.placeName || !data.magnitude) return;

    const eventId = data.eventId || `${data.placeName}_${data.magnitude}_${data.shockTime}`;
    const dataTime = new Date(data.shockTime || data.updateTime || Date.now()).getTime();

    const currentIsNewer = dataTime > alertStore.lastTime;
    const isSameQuake = alertStore.lastEventId === eventId;
    const isNational = source === "cea";
    const isProvincial = source === "cea-pr";

    if (currentIsNewer) {}
    else if (isSameQuake && isProvincial) return;
    else if (!currentIsNewer) return;

    alertStore.lastEventId = eventId;
    alertStore.lastSource = source;
    alertStore.lastTime = dataTime;

    const uniqueId = `${data.id}_${data.magnitude}_${data.placeName}`;
    if (uniqueId === lastAlert) return;
    lastAlert = uniqueId;

    let line1;
    if (source === "cea") {
        line1 = `中国地震预警网预警第${data.updates || 1}报`;
    } else {
        line1 = `${(data.province || "未知").trim()}地震局预警第${data.updates || 1}报`;
    }

    const line2 = `${data.shockTime || "未知时间"} ${data.placeName} 发生<span class="highlight-num">${data.magnitude}</span>级地震，深度<span class="highlight-num">${data.depth || "unknown"}</span>公里，预计最大烈度<span class="highlight-num">${data.epiIntensity || "未知"}</span>度。`;
    isInited ? renderRealTimeData(0, true, line1, line2) : renderHistoryData(0, true, line1, line2);
}

function handleMeasureCache(){
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

function parseMeasureData(data){
    const sourceMap={ningxia:"宁夏地震局地震信息",guangxi:"广西地震局地震信息",shanxi:"山西地震局地震信息",beijing:"北京地震局地震信息",cenc:"中国地震台网中心"};
    const currentSource=parseMeasureData.source||"cenc";
    const isCencSource=currentSource==="cenc";
    if((isCencSource&&(!data?.id||!data?.placeName||!data.magnitude))||(!isCencSource&&(!data?.shockTime||!data?.placeName||!data?.magnitude))){renderHistoryData(1,false,"暂无台网测定数据");return}
    const uniqueId=isCencSource?`${data.id}_${data.magnitude}_${data.placeName}`:`${data.eventId||""}_${data.id||""}_${data.shockTime}_${data.placeName}_${data.magnitude}_${data.depth||0}`;
    if(uniqueId===lastMeasure){
        const latestData=handleMeasureCache();
        if(latestData)renderMeasureLatest(latestData);
        return;
    }
    lastMeasure=uniqueId;
    measureDataCache[uniqueId]={data,source:currentSource,uniqueId};
    const latestData=handleMeasureCache();
    latestData?renderMeasureLatest(latestData):renderHistoryData(1,false,"暂无台网测定数据");
}

function renderMeasureLatest(latestItem){
    const {data,source}=latestItem;
    const sourceMap={ningxia:"宁夏地震局地震信息",guangxi:"广西地震局地震信息",shanxi:"山西地震局地震信息",beijing:"北京地震局地震信息",cenc:"中国地震台网中心"};
    const isFormal = source === "cenc" ? (data.infoTypeName?.includes("正式") || false) : false;
    const isAuto = source === "cenc" ? (data.infoTypeName?.includes("自动") || false) : false;
    const dataType = isFormal ? "正式测定" : (isAuto ? "自动测定" : "测定");
    
    const line1=source!=="cenc"?`${sourceMap[source]}(${dataType})`:`中国地震台网中心${dataType}`;
    const line2=`${data.shockTime||"未知时间"} ${data.placeName} 发生<span class="highlight-num">${data.magnitude}</span>级地震，深度<span class="highlight-num">${data.depth||"未知"}</span>公里。`;
    isInited?renderRealTimeData(1,true,line1,line2):renderHistoryData(1,true,line1,line2);
}

async function intHttpGet(url){
    const controller=new AbortController();
    const timeoutTimer=setTimeout(()=>controller.abort(),CONFIG.HTTP_TIMEOUT);
    try{
        const res=await fetch(url,{method:"GET",headers:{"Content-Type":"application/json;charset=utf-8"},signal:controller.signal});
        clearTimeout(timeoutTimer);
        if(!res.ok)throw new Error(`HTTP${res.status}`);
        return await res.json();
    }catch(err){clearTimeout(timeoutTimer);throw err}
}

function intHttpRetry(){
    if(intHttpTimer)clearTimeout(intHttpTimer);
    intHttpRetryCount++;
    if(intHttpRetryCount>=CONFIG.MAX_RETRY){renderHistoryData(2,false,"暂无烈度速报数据");return}
    intHttpTimer=setTimeout(initIntensityHttp,CONFIG.RETRY_DELAY);
}

async function getIntEvent(eqId){
    try{
        const data=await intHttpGet(`${CONFIG.INT_HTTP_EVENT}${eqId}`);
        parseIntensityData(data,false);
        intHttpRetryCount=0;
    }catch(err){intHttpRetry()}
}

async function initIntensityHttp(){
    if(intHttpTimer)clearTimeout(intHttpTimer);
    if(intHttpRetryCount>=CONFIG.MAX_RETRY)return;
    try{
        const lastIdData=await intHttpGet(CONFIG.INT_HTTP_LASTID);
        const eqId=lastIdData.eq_id;
        if(typeof eqId!=="string"||!eqId.trim())throw new Error("eq_id无效");
        getIntEvent(eqId);
    }catch(err){intHttpRetry()}
}

function closeIntWss(){
    if(wsIntensity){
        try{
            wsIntensity.close(1000,"烈度速报WSS主动关闭");
            console.log("✅ 烈度速报WebSocket已关闭");
        }catch(err){
            console.error("关闭烈度速报WebSocket失败：",err);
        }finally{
            wsIntensity=null;
        }
    }
    if(pingTimerIntensity){
        clearInterval(pingTimerIntensity);
        pingTimerIntensity=null;
    }
}

function intWssRetry(){
    if(pingTimerIntensity)clearInterval(pingTimerIntensity);
    if(intHttpTimer)clearTimeout(intHttpTimer);
    reconnectCountIntensity++;
    const delay=Math.min(3000*Math.pow(2,reconnectCountIntensity),30000);
    setTimeout(initIntensityWss,delay);
}

function initIntensityWss(){
    closeIntWss();
    try{
        console.log("正在连接烈度速报WebSocket...");
        wsIntensity=new WebSocket(CONFIG.INT_WSS_REAL);
        wsIntensity.onopen=()=>{
            console.log("✅ 烈度速报WebSocket连接成功");
            reconnectCountIntensity=0;
            isIntInited=true;
            pingTimerIntensity=setInterval(()=>{
                if(wsIntensity&&wsIntensity.readyState===1){
                    try{
                        wsIntensity.send("ping");
                    }catch(err){
                        console.error("发送烈度速报ping失败：",err);
                        clearInterval(pingTimerIntensity);
                        if(wsIntensity&&wsIntensity.readyState!==3)wsIntensity.close();
                    }
                }
            },5000);
        };
        wsIntensity.onmessage=e=>{
            if(!e.data || e.data === "ping" || !e.data.startsWith("{")) return;
            try{
                const data=JSON.parse(e.data);
                if(data?.eq_id) parseIntensityData(data,true);
            }catch(err){
                console.error("❌ 烈度速报数据解析失败：",err,"原始数据：",e.data);
            }
        };
        wsIntensity.onerror=(error)=>{
            console.error("❌ 烈度速报WebSocket错误：",error);
            intWssRetry();
        };
        wsIntensity.onclose=e=>{
            console.log(`烈度速报WebSocket关闭：${e.code} - ${e.reason}`);
            clearInterval(pingTimerIntensity);
            wsIntensity=null;
            if(e.code!==1000)intWssRetry();
        };
    }catch(err){
        console.error("❌ 烈度速报WebSocket初始化失败：",err);
        intWssRetry();
    }
}

// ====================== 最终优化的 parseIntensityData 函数（仅改此处！） ======================
function parseIntensityData(data, isRealTime) {
    if (!data?.eq_id || !data?.happen_time || data?.magnitude === undefined || data?.maxintensity === undefined) return;

    const uniqueId = `${data.eq_id}_${data.magnitude}_${data.happen_time}`;
    if (uniqueId === lastIntensity) return;
    lastIntensity = uniqueId;

    let isExpired = false;
    if (data.update_time) {
        const updateTime = new Date(data.update_time);
        if (!isNaN(updateTime.getTime())) {
            isExpired = Date.now() - updateTime.getTime() > ONE_DAY;
        }
    }
    if (isExpired) {
        renderHistoryData(2, false, "暂无烈度速报数据");
        return;
    }

    const happenTime = data.happen_time || "未知时间";
    const updateTime = data.update_time || "未知时间";
    const hypocenter = data.hypocenter || "未知震中";
    const mag = data.magnitude || 0;
    const depth = data.depth || "未知";
    const maxInt = data.maxintensity || 0;
    const maxForecastInt = data.maxforecastintensity || 0;

    // 1. info 为空或null则不参与解析
    let infoText = "";
    if (typeof data.info === 'string' && data.info.trim() !== "" && data.info.toLowerCase() !== "null") {
        // 移除最后的标点符号（包括英文标点）
        let processedInfo = data.info.trim();
        // 移除最后的标点符号
        processedInfo = processedInfo.replace(/[，。；！？、.,;!?]$/, "");
        // 替换剩余的英文标点为中文标点
        processedInfo = processedInfo.replace(/\./g, "，").replace(/,/g, "，").replace(/;/g, "；");
        infoText = processedInfo + "。";
    }

    // 2. 合并所有有效站点数据及信息（从配置中获取筛选条件）
    let stationsText = "";
    if (Array.isArray(data.stations) && data.stations.length > 0) {
        // 过滤有效站点：计测烈度>最小烈度 且 距离震中≤最大距离
        const validStations = data.stations.filter(s => s.int !== undefined && s.int > CONFIG.INTENSITY_CONFIG.MIN_INTENSITY && s.distance <= CONFIG.INTENSITY_CONFIG.MAX_STATION_DISTANCE);

        if (validStations.length > 0) {
            // 修改点2：把"各地计测烈度信息："改为"部分台站计测烈度信息："
            stationsText = " 部分台站计测烈度信息：";
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
        }
    }

    // 最终文本合并成一行在第二行显示
    const line1 = `中国地震台网中心烈度速报（更新时间：${updateTime}）`;
    const line2 = `${happenTime} ${hypocenter} 发生<span class="highlight-num">${mag.toFixed(1)}</span>级地震，震源深度<span class="highlight-num">${depth}</span>公里，实测最大烈度<span class="highlight-num">${maxInt.toFixed(1)}</span>度，预测最大烈度<span class="highlight-num">${maxForecastInt.toFixed(1)}</span>度。${infoText}${stationsText}`;

    isRealTime ? renderRealTimeData(2, true, line1, line2) : renderHistoryData(2, true, line1, line2);
}
// ==================================================================================

function parseTsunamiData(data){
    if(!data?.id||!data?.warningInfo){renderHistoryData(3,false,"暂无海啸预警数据");return}
    const uniqueId=`${data.id}_${data.warningInfo?.title}`;
    if(uniqueId===lastTsunami)return;
    lastTsunami=uniqueId;
    const warn=data.warningInfo;
    const batch=data.details?.batch||1;
    const forecast=Array.isArray(data.forecasts)?data.forecasts.map(item=>`${item.province||"未知区域"}${item.forecastArea||""}${item.estimatedArrivalTime||"未知时间"}到达，波高<span class="highlight-num">${item.maxWaveHeight||0}</span>厘米`).join("；"):"";
    const line1=`自然资源部海啸预警<span class="highlight-num">${batch}</span>期：${warn.title||"海啸警报"}${warn.subtitle||""}${forecast?"，"+forecast:""}`;
    isInited?renderRealTimeData(3,false,line1):renderHistoryData(3,false,line1);
}

function parseWeatherData(data){
    const colorMap={红色:"#FF0000",橙色:"#FF7F50",黄色:"#FFFF00",蓝色:"#1E90FF",默认:"#9933ff"};
    if(!data?.id||!data?.headline||!data?.description){
        dom.weatherTag.style.backgroundColor=colorMap["默认"];
        renderHistoryData(4,false,"暂无气象预警数据","",colorMap["默认"]);
        lastWeather="";
        return;
    }
    const uniqueId=`${data.id}_${data.headline}_${data.description}_${data.effective||""}`;
    if(uniqueId===lastWeather)return;
    lastWeather=uniqueId;
    const level=data.headline.includes("红色")?"红色":data.headline.includes("橙色")?"橙色":data.headline.includes("黄色")?"黄色":data.headline.includes("蓝色")?"蓝色":"默认";
    const targetColor=colorMap[level];
    dom.weatherTag.style.backgroundColor=targetColor;
    const line1=`${data.effective||"未知时间"} ${data.headline}`;
    const line2=data.description||"请做好相关防范措施";
    
    CONFIG.WEATHER_FORCED&&isInited?renderRealTimeData(4,true,line1,line2,targetColor):renderHistoryData(4,true,line1,line2,targetColor);
    if(curPage === 4) startPageLogic();
}

function initWebSocket(){
    clearInterval(pingTimer);
    if(ws&&ws.readyState!==3){
        try{
            ws.close(1000,"重连清理");
        }catch(err){
            console.error("WebSocket关闭失败：",err);
        }
        ws=null;
    }
    try{
        console.log("正在连接WebSocket...");
        ws=new WebSocket(CONFIG.WS_ALL);
        ws.onopen=()=>{
            console.log("✅ WebSocket连接成功");
            reconnectCount=0;
            isInited=false;
            parseMeasureData.source="cenc";
            measureDataCache={};
            alertStore = { lastEventId: "", lastSource: "", lastTime: 0 };
            lastMeasure="";
            setTimeout(()=>{
                if(ws&&ws.readyState===1){
                    try{
                        ws.send("query");
                        console.log("已发送查询请求");
                    }catch(err){
                        console.error("发送查询请求失败：",err);
                    }
                }
            },50);
            pingTimer=setInterval(()=>{
                if(ws&&ws.readyState===1){
                    try{
                        ws.send("ping");
                    }catch(err){
                        console.error("发送ping失败：",err);
                        clearInterval(pingTimer);
                        if(ws&&ws.readyState!==3)ws.close();
                    }
                }
            },5000);
        };
        ws.onmessage=e=>{
            if(!e.data||!e.data.startsWith("{"))return;
            try{
                const res=JSON.parse(e.data);
                if(res.type==="initial_all"){
                    const initParseMap={"cea-pr":parseAlertData,"cea":parseAlertData,cenc:parseMeasureData,tsunami:parseTsunamiData,weatheralarm:parseWeatherData,ningxia:parseMeasureData,guangxi:parseMeasureData,shanxi:parseMeasureData,beijing:parseMeasureData};
                    for(const [source,handler]of Object.entries(initParseMap)){
                        if(res[source]&&res[source].Data){
                            try{
                                parseMeasureData.source=source;
                                handler(res[source].Data, source);
                            }catch(err){
                                console.error(`处理${source}数据失败：`,err);
                            }
                        }
                    }
                    isInited=true;
                    console.log("✅ 初始数据加载完成");
                    return;
                }
                if(res.type==="update"&&res.source&&res.Data){
                    const parseMap={"cea-pr":parseAlertData,"cea":parseAlertData,cenc:parseMeasureData,tsunami:parseTsunamiData,weatheralarm:parseWeatherData,ningxia:parseMeasureData,guangxi:parseMeasureData,shanxi:parseMeasureData,beijing:parseMeasureData};
                    if(["cenc","ningxia","guangxi","shanxi","beijing"].includes(res.source))parseMeasureData.source=res.source;
                    try{
                        parseMap[res.source]&&parseMap[res.source](res.Data, res.source);
                    }catch(err){
                        console.error(`处理${res.source}更新数据失败：`,err);
                    }
                }
            }catch(err){
                console.error("❌ 数据解析失败：",err,"原始数据：",e.data);
            }
        };
        ws.onclose=(event)=>{
            console.log(`WebSocket关闭：${event.code} - ${event.reason}`);
            clearInterval(pingTimer);
            ws=null;
            const delay=Math.min(3000*Math.pow(2,reconnectCount++),30000);
            console.log(`将在${delay}ms后尝试重连`);
            setTimeout(initWebSocket,delay);
        };
        ws.onerror=(error)=>{
            console.error("❌ WebSocket错误：",error);
            if(ws&&ws.readyState!==3){
                try{
                    ws.close(1001,"错误重连");
                }catch(err){
                    console.error("WebSocket错误关闭失败：",err);
                }
            }
        };
    }catch(err){
        console.error("❌ WebSocket初始化失败：",err);
        setTimeout(initWebSocket,3000);
    }
}

function clearTimer(){
    if(timer){clearTimeout(timer);timer=null}
}
function clearAllTimer(){
    clearTimer();
    if(forcedTimer){clearTimeout(forcedTimer);forcedTimer=null}
    if(intHttpTimer){clearTimeout(intHttpTimer);intHttpTimer=null}
}

// 内存清理函数
function clearMemory(){
    // 清理缓存数据
    if(Object.keys(measureDataCache).length>100){
        // 保留最新的10条数据
        const keys=Object.keys(measureDataCache).sort((a,b)=>{
            const timeA=measureDataCache[a].data.shockTime?new Date(measureDataCache[a].data.shockTime).getTime():0;
            const timeB=measureDataCache[b].data.shockTime?new Date(measureDataCache[b].data.shockTime).getTime():0;
            return timeB-timeA;
        });
        keys.slice(10).forEach(key=>delete measureDataCache[key]);
    }
    
    // 清理动画ID
    Object.values(animationIds).forEach(id=>{
        if(id)cancelAnimationFrame(id);
    });
    animationIds={};
}

// 启动内存清理定时器
function startMemoryCleanup(){
    if(memoryCleanupTimer)clearInterval(memoryCleanupTimer);
    // 每5分钟清理一次内存
    memoryCleanupTimer=setInterval(clearMemory,5*60*1000);
}

window.onbeforeunload=()=>{
    clearInterval(pingTimer);
    clearAllTimer();
    if(memoryCleanupTimer)clearInterval(memoryCleanupTimer);
    if(ws&&ws.readyState!==3)ws.close(1000,"页面关闭");
    measureDataCache={};
    alertStore = { lastEventId: "", lastSource: "", lastTime: 0 };
    clearInterval(pingTimerIntensity);
    closeIntWss();
    intHttpRetryCount=0;
    reconnectCountIntensity=0;
    
    // 清理所有动画
    Object.values(animationIds).forEach(id=>{
        if(id)cancelAnimationFrame(id);
    });
    animationIds={};
    
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