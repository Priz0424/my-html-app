/* ============================================================================
 * Skyscanner 外站票搜尋 – 優化版
 * Author: PrismoChen (2025-04-29)
 * 功能：產生 4 段外站票查詢網址；班表顯示；LocalStorage；Loading；自動捲動
 * ============================================================================ */

/* ------------------------- ①　資料常數 ------------------------- */

/** A 區域選單 → 城市代碼 */
const AREA_CITIES = {
  japan:      ['NRT', 'KIX', 'CTS', 'NGO'],
  southeast:  ['BKK', 'CNX', 'KUL', 'DAD', 'HAN', 'SGN'],
  hkmo:       ['HKG', 'MFM']
};

/** 城市中文名稱 */
const CITY_NAMES = {IAH:'休士頓',YVR:'溫哥華',YYZ:'多倫多',DFW:'達拉斯',ONT:'安大略',NRT:'東京',KIX:'大阪',CTS:'札幌',NGO:'名古屋',BKK:'曼谷',CNX:'清邁',KUL:'吉隆坡',DAD:'峴港',HAN:'河內',SGN:'胡志明市',HKG:'香港',MFM:'澳門',TPE:'台北',KHH:'高雄',SEA:'西雅圖',SFO:'舊金山',LAX:'洛杉磯',JFK:'紐約',BOS:'波士頓',ORD:'芝加哥',LHR:'倫敦',CDG:'巴黎',AMS:'阿姆斯特丹',VIE:'維也納',FRA:'法蘭克福',MUC:'慕尼黑',ZRH:'蘇黎世',FCO:'羅馬',MXP:'米蘭',SYD:'雪梨',AKL:'奧克蘭',PRG:'布拉格',MAN:'曼徹斯特',BRU:'布魯塞爾',MAD:'馬德里',BCN:'巴塞隆納'};

/** 判斷同國家用（目前只需東南亞國家篩選） */
const CITY_COUNTRY = { BKK:'TH', CNX:'TH', KUL:'MY', DAD:'VN', HAN:'VN', SGN:'VN' };

/** 週期中文 */
const WEEK_CH = ['一','二','三','四','五','六','日'];

/* ------------------------- ②　DOM 快取 ------------------------- */
const $ = id => document.getElementById(id);
const $area = $('areaSelect'), $hub = $('hubSelect'), $mid = $('midSelect');
const $d1 = $('d1'), $d2 = $('d2'), $d3 = $('d3'), $d4 = $('d4');
// 捨棄尾段 checkbox
const $throwaway = $('throwawayCheckbox');
const $result = $('resultArea');
const $scheduleM = $('scheduleModal'), $scheduleT = $('scheduleText');
const $genBtn = $('genBtn');

/* ------------------------- ③　工具 ------------------------- */
/** 日期字串 + n 天 (yyyy-mm-dd) */
const addDays = (d,n) => { const t=new Date(d); t.setDate(t.getDate()+n); return t.toISOString().slice(0,10) };
/** 日期字串 + n 月 */
const addMonths = (d,n) => { const t=new Date(d); t.setMonth(t.getMonth()+n); return t.toISOString().slice(0,10) };
/** Skyscanner 多段票網址 */
const skyscannerURL = (seg,cabin) => `https://www.skyscanner.com.tw/transport/d/${seg}/?adults=1&cabinclass=${cabin}&children=0&infants=0`;
/** Toast */
const showToast = (msg,type='error')=>{
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const bg={error:'bg-red-500',success:'bg-green-500',info:'bg-blue-500'}[type];
  const el=document.createElement('div');el.className=`fixed top-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg text-white text-sm z-50 toast ${bg}`;el.textContent=msg;
  document.body.appendChild(el);setTimeout(()=>{el.classList.add('opacity-0','transition-opacity','duration-500');setTimeout(()=>el.remove(),500)},3000);
};

/* 短暫紅框提示 */
function flashBorder(el, ms = 4000){
  el.classList.add('border-2','border-red-500');
  setTimeout(()=>el.classList.remove('border-2','border-red-500'), ms);
}

/* ------------------------- ④　驗證 / 班表 ------------------------- */
function validateDates() {
  const arr = [$d1, $d2, $d3, $d4];
  const dates = arr.map(i => new Date(i.value));
  // 先把所有紅框移除
  arr.forEach(i => i.classList.remove('border-red-500','border-2'));

  // Enforce: date1 <= date2, date2 < date3, date3 < date4
  if (
    dates[0] > dates[1] ||
    dates[1] >= dates[2] ||
    dates[2] >= dates[3]
  ) {
    arr.forEach((input, idx) => {
      if(idx > 0 && dates[idx] <= dates[idx - 1]){
        flashBorder(input);
      }
    });
    showToast('日期錯誤，紅框欄位需晚於前一段', 'error');
    return false;
  }
    /* --- 捨棄尾段規則：date4 必須是 date3 +1 或 +2 --- */
    if ($throwaway && $throwaway.checked) {
      const diffDays = (new Date($d4.value) - new Date($d3.value)) / 86400000;
      if (diffDays < 1 || diffDays > 2) {
        flashBorder($d4);
        showToast('尾段僅允許 date3 +1 或 +2 天', 'error');
        return false;
      }
    }
    return true;
}

/** 檢查航班 – 與原版相同 */
function checkFlight(inputEl){
  const city=$mid.value;const weekday=[7,1,2,3,4,5,6][new Date(inputEl.value).getDay()];
  const weekdayText=WEEK_CH[weekday-1];const missing=[];
  document.querySelectorAll('[data-airline]:checked').forEach(cb=>{
    const code=cb.dataset.airline;
    const list=FLIGHT_SCHEDULES[code]?.[city];
    if(list&&!list.includes(weekday)){
      missing.push({EVA:'長榮航空',STARLUX:'星宇航空',CI:'中華航空',CX:'國泰航空'}[code]||code);
    }
  });
  if(missing.length){
    const cityText=CITY_NAMES[city]||city;
    showToast(`${missing.join('、')} 週${weekdayText}沒有飛 ${cityText}！`,'info');
  }
}

/* ------------------------- ⑤　班表 ------------------------- */
function showFlightSchedules(){
  const $tabs=$('scheduleTabs');
  $tabs.innerHTML=Object.entries(window.SCHEDULE_PAGES).map(
    ([k,p],i)=>`<button data-page="${k}" class="px-3 py-1 rounded ${i===0?'bg-indigo-600 text-white':'bg-gray-200'}" onclick="renderSchedule('${k}')">${p.label}</button>`
  ).join('');
  renderSchedule('us_nz');
  $scheduleM.classList.remove('hidden');
}

function renderSchedule(key){
  const page=SCHEDULE_PAGES[key]; if(!page) return;
  document.querySelectorAll('#scheduleTabs button').forEach(btn=>{
    btn.classList.toggle('bg-indigo-600',btn.dataset.page===key);
    btn.classList.toggle('text-white',btn.dataset.page===key);
    btn.classList.toggle('bg-gray-200',btn.dataset.page!==key);
  });
  let html='<table class="w-full text-sm border-collapse schedule-table"><thead><tr class="bg-indigo-100"><th class="border px-2 py-1 w-0 whitespace-nowrap">航點</th>';
  WEEK_CH.forEach(d=>{html+=`<th class="border px-4 py-2 w-20 text-center">${d}</th>`});html+='</tr></thead><tbody>';
  page.groups.forEach((group,gi)=>{
    group.forEach(city=>{
      html+=`<tr><td class="border px-2 py-1 w-20 whitespace-nowrap font-medium">${city} (${CITY_NAMES[city]})</td>`;
      WEEK_CH.forEach((d,idx)=>{
        const day=idx+1;const logos=['EVA','STARLUX','CI','CX'].map(air=>{
          const short={EVA:'BR',STARLUX:'JX',CI:'CI',CX:'CX'}[air];
          const flights=FLIGHT_SCHEDULES[air]?.[city]||[];
          return flights.includes(day)?`<img src="${short}.jpeg" alt="${air}" class="h-5 w-5 inline-block">`:`<div class="h-5 w-5 inline-block"></div>`;
        }).join('');
        html+=`<td class="border px-2 py-1 text-center"><div class="logo-container">${logos}</div></td>`;
      });
      html+='</tr>';
    });
    if(gi!==page.groups.length-1) html+='<tr class="divider-row"><td colspan="8"></td></tr>';
  });
  html+='</tbody></table>';
  $scheduleT.innerHTML=html;
}

/* ------------------------- ⑥　產生行程 ------------------------- */
function buildTable(from,toList,hub,mid,d){
  const seg=(a1,a4,b,c)=>`${a1}/${d[0]}/${b}/${b}/${d[1]}/${c}/${c}/${d[2]}/${b}/${b}/${d[3]}/${a4}`.toLowerCase();
  const rows=toList.map((to,i)=>{
    const logos=[];const day=[7,1,2,3,4,5,6][new Date(d[1]).getDay()];
    document.querySelectorAll('[data-airline]:checked').forEach(cb=>{
      const code=cb.dataset.airline;let short=code;
      if(code==='EVA')short='BR';if(code==='STARLUX')short='JX';
      const list=FLIGHT_SCHEDULES[code]?.[mid];
      if(list&&list.includes(day)) logos.push(`<img src="./${short}.jpeg" alt="${short}" class="inline h-6 mx-1">`);
    });
    return `<tr>
      <td class="border px-4 py-2 text-sm">
        <div class="flex flex-col items-center gap-1">
          <div>${CITY_NAMES[from]} 出發，回到 ${CITY_NAMES[to]}</div>
          <div>${CITY_NAMES[mid]} 來回</div>
          <div class="flex justify-center gap-1 mt-1">${logos.join('')}</div>
        </div>
      </td>
      <td class="border px-4 py-2"><a href="${skyscannerURL(seg(from,to,hub,mid),'economy')}" target="_blank" id="${from}-eco-${i}" class="text-blue-600 hover:underline">經濟艙</a></td>
      <td class="border px-4 py-2"><a href="${skyscannerURL(seg(from,to,hub,mid),'business')}" target="_blank" id="${from}-biz-${i}" class="text-blue-600 hover:underline">商務艙</a></td>
    </tr>`;
  }).join('');
  const wrapper=document.createElement('div');
  wrapper.className='space-y-2';
  wrapper.innerHTML=`<h3 class="text-2xl font-semibold text-indigo-800">${CITY_NAMES[from]} 出發</h3>
    <table class="min-w-full table-auto border text-center rounded-xl shadow">
      <thead><tr class="bg-indigo-100 text-sm">
        <th class="py-2 px-4 border">行程內容</th>
        <th class="py-2 px-4 border cursor-pointer text-indigo-600 hover:underline" onclick="batchOpen('${from}','eco')">全部經濟艙</th>
        <th class="py-2 px-4 border cursor-pointer text-indigo-600 hover:underline" onclick="batchOpen('${from}','biz')">全部商務艙</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  return wrapper;
}
// 捨棄尾段：A→TPE / TPE→mid / mid→TPE / KHH→A
function buildTableThrowaway(from, toList, b1, b2, mid, d){
  const seg = (a1, a4) =>
    `${a1}/${d[0]}/${b1}/${b1}/${d[1]}/${mid}/${mid}/${d[2]}/${b1}/${b2}/${d[3]}/${a4}`.toLowerCase();

  const rows = toList.map((to,i)=>{
    /* ------- 依 date2 檢查 Logo ------- */
    const logos=[]; const day=[7,1,2,3,4,5,6][new Date(d[1]).getDay()];
    document.querySelectorAll('[data-airline]:checked').forEach(cb=>{
      const code=cb.dataset.airline;
      const short={EVA:'BR',STARLUX:'JX',CI:'CI',CX:'CX'}[code]||code;
      const list=FLIGHT_SCHEDULES[code]?.[mid];
      if(list && list.includes(day)) logos.push(`<img src="./${short}.jpeg" alt="${short}" class="inline h-6 mx-1">`);
    });
    /* ---------------------------------- */
    return `<tr>
      <td class="border px-4 py-2 text-sm">
        <div class="flex flex-col items-center gap-1">
          <div>${CITY_NAMES[from]} 出發，回到 ${CITY_NAMES[to]}</div>
          <div>${CITY_NAMES[mid]} 來回</div>
          <div class="flex justify-center gap-1 mt-1">${logos.join('')}</div>
        </div>
      </td>
      <td class="border px-4 py-2"><a href="${skyscannerURL(seg(from,to),'economy')}" target="_blank" id="${from}-eco-${i}" class="text-blue-600 hover:underline">經濟艙</a></td>
      <td class="border px-4 py-2"><a href="${skyscannerURL(seg(from,to),'business')}" target="_blank" id="${from}-biz-${i}" class="text-blue-600 hover:underline">商務艙</a></td>
    </tr>`;
  }).join('');

  const wrapper=document.createElement('div');
  wrapper.className='space-y-2';
  wrapper.innerHTML=`<h3 class="text-2xl font-semibold text-indigo-800">${CITY_NAMES[from]} 出發</h3>
    <table class="min-w-full table-auto border text-center rounded-xl shadow">
      <thead><tr class="bg-indigo-100 text-sm">
        <th class="py-2 px-4 border">行程內容</th>
        <th class="py-2 px-4 border cursor-pointer text-indigo-600 hover:underline" onclick="batchOpen('${from}','eco')">全部經濟艙</th>
        <th class="py-2 px-4 border cursor-pointer text-indigo-600 hover:underline" onclick="batchOpen('${from}','biz')">全部商務艙</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  return wrapper;
}

function generate(){
  if (!$d1.value || !$d2.value || !$d3.value || !$d4.value) {
    showToast('請填寫所有合法日期後再產生行程', 'error');
    return;
  }
  const throwaway = $throwaway.checked;
  if(!validateDates())return;
  toggleLoading(true);

  const midCity=$mid.value;const airlines=[{id:'evaCheckbox',code:'EVA',name:'長榮航空'},{id:'starluxCheckbox',code:'STARLUX',name:'星宇航空'},{id:'ciCheckbox',code:'CI',name:'中華航空'},{id:'cxCheckbox',code:'CX',name:'國泰航空'}];
  const missing=[];
  airlines.forEach(a=>{
    const cb=$(a.id);if(cb.checked){const list=FLIGHT_SCHEDULES[a.code]||{};if(!list[midCity])missing.push(a.name);}
  });
  if(missing.length) showToast(`${missing.join('、')}尚未開航${CITY_NAMES[midCity]}！`);

  const area=$area.value, hub=$hub.value, mid=$mid.value, dates=[$d1.value,$d2.value,$d3.value,$d4.value];

  $result.innerHTML='';

  if(!throwaway){
    AREA_CITIES[area].forEach(from=>{
      const list = AREA_CITIES[area]
        .filter(to=>CITY_COUNTRY[to]===CITY_COUNTRY[from])
        .sort((a,b)=>(a===from?-1:b===from?1:0));
      $result.appendChild(buildTable(from, list, $hub.value, $mid.value, dates));
    });
  }else{
    // 捨棄尾段：B1＝TPE，B2＝KHH
    const hub1 = 'TPE', hub2 = 'KHH';
    AREA_CITIES['hkmo'].forEach(from=>{
      const list = AREA_CITIES['hkmo']
        .filter(to=>CITY_COUNTRY[to]===CITY_COUNTRY[from])
        .sort((a,b)=>(a===from?-1:b===from?1:0));
      $result.appendChild(buildTableThrowaway(from, list, hub1, hub2, $mid.value, dates));
    });
  }

  // 滾動到結果
  $result.scrollIntoView({behavior:'smooth'});
  toggleLoading(false);
}

/* ------------------------- ⑦　批次開新視窗 ------------------------- */
function batchOpen(from,cabin){
  const links=[...document.querySelectorAll(`a[id^='${from}-${cabin}-']`)];
  let i=0;const timer=setInterval(()=>{if(i>=links.length)return clearInterval(timer);window.open(links[i++].href,'_blank')},1000);
}

function applyThrowawayMode(on){
  if(on){
    // A 區域強制港澳
    $area.value = 'hkmo';
    $area.disabled = true;

    // B1 Hub 固定為 TPE
    $hub.value = 'TPE';
    $hub.disabled = true;

    // date4 只能 +1~+2 天
    adjustD4();
  }else{
    $area.disabled = false;
    $hub.disabled = false;
    $d4.removeAttribute('max');
  }
  updateLabels();
}

function adjustD4(){
  if(!$throwaway.checked || !$d3.value) return;
  $d4.min = addDays($d3.value,1);
  $d4.max = addDays($d3.value,2);
  // 自動修正超出範圍
  if(new Date($d4.value) - new Date($d3.value) < 86400000 ||
     new Date($d4.value) - new Date($d3.value) > 2*86400000){
    $d4.value = $d4.min;
  }
}


/* ------------------------- ⑧　初始化 ------------------------- */
function disablePastDates(){
  [$d1,$d2,$d3,$d4].forEach(el=>{
    el.min = new Date().toISOString().slice(0,10);
  });
}

function initDates(){
  disablePastDates();
  const base = addDays(new Date(), 15);
  $d1.value = base;
  $d1.min = new Date().toISOString().slice(0, 10);
  $d2.value = '';
  $d3.value = '';
  $d4.value = '';
  updateDateMinLimits();
}

/* LocalStorage：記住選單 */
function loadSelects(){
  const map={areaSelect:$area,hubSelect:$hub,midSelect:$mid};
  Object.entries(map).forEach(([key,el])=>{
    const val=localStorage.getItem(key);if(val) el.value=val;
  });
}

function saveSelect(id,val){localStorage.setItem(id,val);}

/* 更新 label 文字 */
function extractChinese(t){const m=t.match(/\((.*?)\)/);return m?m[1]:t}
function updateLabels(){
  const areaName = extractChinese($area.options[$area.selectedIndex].text);
  const midName  = extractChinese($mid.options[$mid.selectedIndex].text);

  if($throwaway.checked){
    const hub1Name = CITY_NAMES['TPE'];  // 台北
    const hub2Name = CITY_NAMES['KHH'];  // 高雄
    $('label1').textContent = `${areaName} A→B ${hub1Name}`;
    $('label2').textContent = `${hub1Name} B→C ${midName}`;
    $('label3').textContent = `${midName} C→B ${hub1Name}`;
    $('label4').textContent = `${hub2Name} B→A ${areaName}`;
  }else{
    const hubName = extractChinese($hub.options[$hub.selectedIndex].text);
    $('label1').textContent = `${areaName} A→B ${hubName}`;
    $('label2').textContent = `${hubName} B→C ${midName}`;
    $('label3').textContent = `${midName} C→B ${hubName}`;
    $('label4').textContent = `${hubName} B→A ${areaName}`;
  }
}

function toggleLoading(state){
  if(state){
    $genBtn.disabled=true;
    $genBtn.innerHTML='<svg class="animate-spin h-5 w-5 text-white inline-block mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/></svg>生成中...';
  }else{
    $genBtn.disabled=false;
    $genBtn.innerHTML='<span class="btn-text">產生行程</span>';
  }
}

function liveValidateDate(index) {
  const dates = [$d1, $d2, $d3, $d4];
  const current = dates[index];
  const prev = dates[index - 1];
  if (!current.value || !prev.value) return;

  current.classList.remove('border-red-500','border-2');

  const currentDate = new Date(current.value);
  const prevDate = new Date(prev.value);

  // Always update min
  current.min = prev.value;

  if ((index === 1 && currentDate < prevDate) || (index > 1 && currentDate <= prevDate)) {
    current.value = prev.value;
    flashBorder(current);
    showToast(`第 ${index + 1} 段日期錯誤，自動調整為 ${prev.value}`, 'error');
  }

  cascadeDateFix(index);
}

function cascadeDateFix(startIndex) {
  const dates = [$d1, $d2, $d3, $d4];
  for (let i = startIndex + 1; i < dates.length; i++) {
    const prev = dates[i - 1];
    const curr = dates[i];
    if (!prev.value || !curr.value) continue;

    const prevDate = new Date(prev.value);
    const currDate = new Date(curr.value);
    curr.min = prev.value;

    if (currDate <= prevDate) {
      curr.value = prev.value;
      flashBorder(curr);
      showToast(`第 ${i + 1} 段日期錯誤，自動調整為 ${prev.value}`, 'error');
    }
  }
}

function autoFillNextDates(startIndex){
  const inputs = [$d1, $d2, $d3, $d4];
  const baseDate = inputs[startIndex].value;
  if(!baseDate) return;
  for(let i = startIndex + 1; i < inputs.length; i++){
    // 若後續欄位為空或早於基準日期，則自動填入並同步最小可選日期
    if(!inputs[i].value || new Date(inputs[i].value) < new Date(baseDate)){
      inputs[i].value = baseDate;
    }
    inputs[i].min = baseDate;
  }
}

function setupEvents(){
  [$d1,$d2,$d3,$d4].forEach((el, i) => {
    el.addEventListener('change', () => {
      if (el === $d2) checkFlight(el);
      if (i > 0) liveValidateDate(i);
      autoFillNextDates(i);
      updateDateMinLimits();
    });
  });
  $genBtn.addEventListener('click',generate);
  $('showScheduleBtn').addEventListener('click',showFlightSchedules);
  $('closeModalBtn').addEventListener('click',()=>{$scheduleM.classList.add('hidden')});
  ['areaSelect','hubSelect','midSelect'].forEach(id=>{
    const el=$(id);
    el.addEventListener('change',e=>{saveSelect(id,e.target.value);updateLabels()});
  });
  // 捨棄尾段模式切換及同步 d4
  $throwaway.addEventListener('change', e => applyThrowawayMode(e.target.checked));
  $d3.addEventListener('change', adjustD4);
}

function updateDateMinLimits() {
  const dates = [$d1, $d2, $d3, $d4];
  for (let i = 1; i < dates.length; i++) {
    if (dates[i - 1].value) {
      dates[i].min = dates[i - 1].value;
    }
  }
}

window.addEventListener('DOMContentLoaded',()=>{
  loadSelects();
  initDates();
  setupEvents();
  updateLabels();
});
