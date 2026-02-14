// Cached DOM refs for header and frequent elements (avoids repeated getElementById)
var _domCache = {};
function getEl(id) {
    if (!_domCache[id]) _domCache[id] = document.getElementById(id);
    return _domCache[id];
}
function clearDomCache() { _domCache = {}; }

/** Single entry point to refresh all UI after state change. Use instead of calling renderLedger + renderStrategy + updateGlobalUI + applySettings + renderSettings separately. */
function refreshUI() {
    if (typeof renderLedger === 'function') renderLedger();
    if (typeof renderStrategy === 'function') renderStrategy();
    if (typeof updateGlobalUI === 'function') updateGlobalUI();
    if (typeof applySettings === 'function') applySettings();
    if (typeof renderSettings === 'function') renderSettings();
}
if (typeof window !== 'undefined') window.refreshUI = refreshUI;

function getCurrencyLabel() {
    return state.settings?.currency || 'AED';
}

function formatMoney(value, decimalsOverride) {
    const decimals = Number.isInteger(decimalsOverride)
        ? decimalsOverride
        : (typeof state.settings?.decimals === 'number' ? state.settings.decimals : 2);
    const num = Number(value) || 0;
    return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatSignedMoney(value) {
    const prefix = value >= 0 ? '+' : '';
    return prefix + formatMoney(value);
}

function updateCurrencyLabels() {
    const label = getCurrencyLabel();
    document.querySelectorAll('[data-currency]').forEach(el => {
        el.textContent = label;
    });
    document.querySelectorAll('[data-currency-placeholder]').forEach(el => {
        el.setAttribute('placeholder', `${label}...`);
    });
}

function applySettings() {
    const body = document.body;
    if(!body) return;
    const theme = state.settings?.theme || 'light';
    body.classList.toggle('theme-dark', theme === 'dark');
    body.classList.toggle('compact', !!state.settings?.compact);
    updateCurrencyLabels();
}

function renderSettings() {
    const currencyInput = document.getElementById('settings-currency');
    if(!currencyInput) return;
    currencyInput.value = getCurrencyLabel();
    const decimalsSelect = document.getElementById('settings-decimals');
    if(decimalsSelect) decimalsSelect.value = String(state.settings?.decimals ?? 2);
    const confirmSurplus = document.getElementById('settings-confirm-surplus');
    if(confirmSurplus) confirmSurplus.checked = !!state.settings?.confirmSurplusEdits;
    const allowNegative = document.getElementById('settings-allow-negative');
    if(allowNegative) allowNegative.checked = !!state.settings?.allowNegativeSurplus;
    const themeSelect = document.getElementById('settings-theme');
    if(themeSelect) themeSelect.value = state.settings?.theme || 'light';
    const compactToggle = document.getElementById('settings-compact');
    if(compactToggle) compactToggle.checked = !!state.settings?.compact;
    const firstDaySelect = document.getElementById('settings-first-day-of-week');
    if(firstDaySelect) firstDaySelect.value = String(state.settings?.firstDayOfWeek ?? 3);
}

function switchPage(page) {
    const pages = {
        ledger: document.getElementById('page-ledger'),
        strategy: document.getElementById('page-strategy'),
        settings: document.getElementById('page-settings')
    };
    const tabs = {
        ledger: document.getElementById('nav-ledger'),
        strategy: document.getElementById('nav-strategy'),
        settings: document.getElementById('nav-settings')
    };

    Object.keys(pages).forEach(key => {
        if(pages[key]) pages[key].classList.add('hidden');
        if(tabs[key]) tabs[key].className = 'tab-btn tab-inactive';
    });

    if(pages[page]) pages[page].classList.remove('hidden');
    if(tabs[page]) tabs[page].className = 'tab-btn tab-active';

    if(page === 'ledger') renderLedger();
    if(page === 'strategy') renderStrategy();
    if(page === 'settings') {
        renderSettings();
        if (typeof updateAuthUI === 'function') updateAuthUI();
    }
}

// --- STRATEGY RENDER ---
function renderStrategy() {
    const container = document.getElementById('strategy-sections');
    document.getElementById('monthly-income-input').value = state.monthlyIncome;

    let systemHtml = '';
    let customHtml = '';
    let fullHtml = ''; // For fallback check

    state.categories.forEach((sec, secIdx) => {
        const secTotal = sec.items.reduce((a, b) => a + b.amount, 0);
        const perc = state.monthlyIncome > 0 ? Math.round((secTotal/state.monthlyIncome)*100) : 0;

        let controls;

        if (sec.isSystem) {
            controls = `<span class="text-[9px] font-bold text-slate-300 bg-slate-50 px-2 py-1 rounded-lg">LOCKED</span>`;
        } else {
            controls = `
            <div class="flex items-center gap-2">
                <span id="sec-perc-${sec.id}" class="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-1 rounded-lg section-perc" data-sid="${sec.id}">${perc}%</span>
                <button onclick="renameCategory('${sec.id}')" class="bg-indigo-50 text-indigo-500 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-indigo-100" title="Rename">
                   <span class="text-xs">✎</span>
                </button>
                <button onclick="deleteCategory('${sec.id}')" class="bg-red-50 text-red-500 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-100" title="Delete Category">
                    <span class="text-xs">🗑</span>
                </button>
                <button onclick="openAddItemTool('${sec.id}')" class="bg-slate-900 text-white w-6 h-6 flex items-center justify-center rounded-lg text-lg leading-none pb-1 hover:bg-slate-700">+</button>
            </div>`;
        }

        let rowsHtml = '';
        sec.items.forEach((item, idx) => {
            let amortLabel = item.amortData ? `<span class="text-[9px] bg-indigo-50 text-indigo-600 px-1 rounded font-bold ml-2">${item.amortData.total}/${item.amortData.months}mo</span>` : '';
            const isFoodBase = item.label === 'Food Base';

            // SMART BADGES FOR CORE ITEMS
            if (item.label === 'Food Base') {
                const dailyRate = item.amount / state.food.daysTotal;
                amortLabel = `<span id="food-base-daily-badge" class="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold ml-2">${formatMoney(dailyRate)}/day</span>`;
            } else if (item.label === 'Weekly Misc') {
                const weeklyRate = item.amount / 4;
                amortLabel = `<span class="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold ml-2">~${formatMoney(weeklyRate)}/wk</span>`;
            } else if (item.label === 'Car Fund') {
                const weeklyRate = item.amount / 4;
                amortLabel = `<span class="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold ml-2">~${formatMoney(weeklyRate)}/wk</span>`;
            }

            const inputAttr = isFoodBase
                ? `id="food-base-input" onfocus="pushToUndo()" oninput="syncFoodBaseAmount('${sec.id}', ${idx}, this.value)"`
                : `onfocus="pushToUndo()" oninput="fastUpdateItemAmount('${sec.id}', ${idx}, this.value)"`;

            // Logic to disable delete for Core items
            const deleteBtnClass = (item.isCore) ? 'text-slate-200 cursor-not-allowed' : 'text-slate-300 hover:text-red-500 hover:bg-red-50 cursor-pointer';
            const deleteAction = (item.isCore) ? '' : `onclick="openDeleteModal('${sec.id}', ${idx})"`;

            const actions = `
                <button onclick="openAmortTool('${sec.id}', ${idx})" class="p-1.5 text-indigo-400 hover:bg-indigo-50 rounded">✎</button>
                <button ${deleteAction} class="p-1.5 ${deleteBtnClass} rounded">×</button>
            `;

            const displayAmount = item.amount.toFixed(0);
            const dailyRateVal = state.food.daysTotal > 0 ? (item.amount / state.food.daysTotal) : 0;
            const dailyRateDisplay = dailyRateVal.toFixed(0);
            const dailyRateMax = Math.max(100, Math.ceil(dailyRateVal));
            const foodSliderHtml = isFoodBase ? `
                <div class="px-6 pb-3">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mb-1">
                        <span>Daily Rate</span>
                        <span>${dailyRateDisplay} ${getCurrencyLabel()}</span>
                    </div>
                    <input type="range" id="food-daily-slider" min="0" max="${dailyRateMax}" step="1" value="${dailyRateDisplay}" oninput="syncFoodDailyRate('${sec.id}', ${idx}, this.value)" class="w-full">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mt-1">
                        <span>0</span>
                        <span>${dailyRateMax}</span>
                    </div>
                </div>
            ` : '';

            rowsHtml += `
                <div class="draggable-row flex justify-between items-center py-3 border-b border-slate-50 last:border-0"
                     draggable="${!item.isCore}"
                     ondragstart="handleItemDragStart(event, '${sec.id}', ${idx})"
                     ondragover="handleDragOver(event)"
                     ondrop="handleItemDrop(event, '${sec.id}', ${idx})">
                    <div class="flex items-center gap-3">
                        <span class="text-slate-300 ${item.isCore ? 'opacity-0' : 'cursor-move'}">::</span>
                        <span class="text-xs font-bold text-slate-600">${item.label} ${amortLabel}</span>
                    </div>
                    <div class="flex items-center gap-2 no-drag" onmousedown="event.stopPropagation()">
                        <input type="number" value="${displayAmount}" class="input-pill text-slate-900" ${inputAttr}>
                        ${actions}
                    </div>
                </div>
                ${foodSliderHtml}
            `;
        });

        const cardHtml = `
            <div class="premium-card p-6 mb-6 draggable-card ${sec.isSystem ? 'bg-indigo-50/50 border-indigo-100' : ''}"
                 draggable="${!sec.isSystem}"
                 ondragstart="handleCatDragStart(event, ${secIdx})"
                 ondragover="handleDragOver(event)"
                 ondrop="handleCatDrop(event, ${secIdx})">
                <div class="flex justify-between items-center mb-4 pb-4 border-b border-slate-100">
                    <div class="flex flex-col">
                        <div class="flex items-center gap-2">
                            <span class="text-slate-300 ${sec.isSystem ? 'opacity-0' : 'cursor-move'} text-xs">☰</span>
                            <span class="text-[11px] font-black text-slate-800 uppercase tracking-widest">${sec.label}</span>
                        </div>
                    </div>
                    ${controls}
                </div>
                <div class="space-y-1">${rowsHtml}</div>
            </div>
        `;

        if(sec.isSystem) systemHtml += cardHtml;
        else customHtml += cardHtml;
    });

    const toolBarHtml = `
        <div class="flex gap-2 mb-6">
            <button onclick="openAddCategoryTool()" class="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Add Category</button>
            <button onclick="openDangerModal('global', null)" class="flex-1 py-3 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl text-[10px] font-black uppercase tracking-widest">Clear All</button>
        </div>
    `;

    container.innerHTML = systemHtml + toolBarHtml + customHtml;

    if(!systemHtml && !customHtml) {
         container.innerHTML = toolBarHtml + '<div class="text-center py-10 text-slate-300 font-bold uppercase tracking-widest">No Strategies Yet</div>';
    }
    calculateReality();
}

// --- LEDGER RENDER ---
function renderLedger() {
    const container = document.getElementById('ledger-categories');
    container.innerHTML = '';

    // WEEKLY LOGIC UPDATE: Use Weekly State
    document.getElementById('bal-weekly').innerText = formatMoney(state.accounts.weekly.balance || 0);
    const weekCount = document.getElementById('weekly-week-count');
    if (weekCount) weekCount.innerText = state.accounts.weekly?.week || 1;
    const nextBtn = document.getElementById('next-week-btn');
    if (nextBtn) {
        if ((state.accounts.weekly?.week || 1) >= WEEKLY_MAX_WEEKS) {
            nextBtn.classList.add('opacity-50', 'pointer-events-none');
            nextBtn.title = 'Week limit reached';
            nextBtn.disabled = true;
        } else {
            nextBtn.classList.remove('opacity-50', 'pointer-events-none');
            nextBtn.title = 'Start Next Week';
            nextBtn.disabled = false;
        }
    }

    // --- NEW: MAJOR FUNDS SECTION (Savings & Car) ---
    // Extract values safely
    const getBal = (lbl) => {
        // Fallback to planned amount if no live balance
        for(let s of state.categories) {
            const i = s.items.find(x=>x.label===lbl);
            if(i) return getItemBalance(lbl, i.amount);
        }
        return getItemBalance(lbl, 0);
    };

    const savBal = getBal('General Savings');
    const carBal = getBal('Car Fund');
    const payBal = getBal('Payables');

    const majorHtml = `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <!-- General Savings -->
            <div class="premium-card p-5 bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-100 flex flex-col justify-between min-h-[11rem] relative overflow-hidden group">
                <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <div class="flex-shrink-0">
                    <span class="text-[10px] font-bold uppercase tracking-widest text-indigo-200">General Savings</span>
                    <div class="text-3xl font-black mt-1">${formatMoney(savBal)} <span class="text-xs text-indigo-300">${getCurrencyLabel()}</span></div>
                </div>
                <button onclick="openSavingsBuckets()" class="w-full py-2 flex-shrink-0 mt-2 bg-white/20 hover:bg-white/30 rounded-lg text-[10px] font-black uppercase tracking-widest transition text-center backdrop-blur-sm">
                    Manage
                </button>
            </div>

            <!-- Car Fund -->
            <div class="premium-card p-5 bg-slate-800 text-white border-slate-700 shadow-lg shadow-slate-200 flex flex-col justify-between min-h-[11rem] relative overflow-hidden group">
                <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
                </div>
                <div class="flex-shrink-0">
                    <span class="text-[10px] font-bold uppercase tracking-widest text-slate-400">Car Fund</span>
                    <div class="text-3xl font-black mt-1">${formatMoney(carBal)} <span class="text-xs text-slate-500">${getCurrencyLabel()}</span></div>
                </div>
                <button onclick="openTool('Car Fund')" class="w-full py-2.5 flex-shrink-0 mt-2 bg-white text-slate-800 hover:bg-slate-100 rounded-lg text-[10px] font-black uppercase tracking-widest transition text-center shadow-md">
                    Manage
                </button>
            </div>

            <!-- Payables -->
            <div class="premium-card p-5 bg-amber-500 text-white border-amber-400 shadow-lg shadow-amber-100 flex flex-col justify-between min-h-[11rem] relative overflow-hidden group">
                <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8V4H8"/><path d="M4 8h16"/><path d="M6 12h12"/><path d="M8 16h8"/><path d="M10 20h4"/></svg>
                </div>
                <div class="flex-shrink-0">
                    <span class="text-[10px] font-bold uppercase tracking-widest text-amber-100">Payables</span>
                    <div class="text-3xl font-black mt-1">${formatMoney(payBal)} <span class="text-xs text-amber-100">${getCurrencyLabel()}</span></div>
                </div>
                <button onclick="openTool('Payables')" class="w-full py-2.5 flex-shrink-0 mt-2 bg-white text-amber-900 hover:bg-amber-50 rounded-lg text-[10px] font-black uppercase tracking-widest transition text-center shadow-md">
                    Manage
                </button>
            </div>
        </div>
    `;
    container.innerHTML += majorHtml;

    // Create categorical dropdowns matching the strategy structure
    state.categories.forEach(sec => {
        // Filter items to skip hardcoded UI elements AND the Major Funds we just rendered manually
        var majorLabels = typeof MAJOR_FUND_LABELS !== 'undefined' ? MAJOR_FUND_LABELS : ['Weekly Misc', 'Food Base', 'General Savings', 'Car Fund', 'Payables'];
        const relevantItems = sec.items.filter(item => !majorLabels.includes(item.label));

        if (relevantItems.length === 0) return;

        const secId = `ledger-sec-${sec.id}`;

        let gridHtml = '';
        relevantItems.forEach(item => {
            let bal = getItemBalance(item.label, item.amount);

            const opacity = bal === 0 ? 'opacity-50' : 'opacity-100';
            // Savings check removed from here since it's handled above
            const bgClass = 'bg-white';

            let action = '';
            if (sec.isSingleAction && bal !== 0) {
                action = `<button onclick="completeTask('${item.label}')" class="bg-emerald-100 text-emerald-600 p-1 rounded-md hover:bg-emerald-200">✓</button>`;
            }

            gridHtml += `
                <div class="premium-card p-5 text-center ${opacity} ${bgClass}">
                    <div class="flex justify-between items-start w-full mb-2">
                        <span class="text-[10px] font-bold uppercase text-slate-400 truncate w-20 text-left" title="${item.label}">${item.label}</span>
                        ${action}
                    </div>
                    <div onclick="openTool('${item.label}')" class="cursor-pointer">
                        <p class="text-3xl font-black text-slate-800 tracking-tight">${formatMoney(bal)}</p>
                        <p class="text-[9px] font-bold text-slate-300 uppercase">${getCurrencyLabel()} Left</p>
                    </div>
                </div>
            `;
        });

        // Section HTML with Toggle
        const sectionHtml = `
            <div class="mb-2">
                <button onclick="toggleLedgerSection('${secId}')" class="flex justify-between items-center w-full p-2 hover:bg-slate-100 rounded-lg transition group">
                    <span class="text-[11px] font-black text-slate-800 uppercase tracking-widest">${sec.label}</span>
                    <svg id="icon-${secId}" class="w-4 h-4 text-slate-400 transform transition-transform group-hover:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                <div id="${secId}" class="grid grid-cols-2 gap-4 mt-2 transition-all">
                    ${gridHtml}
                </div>
            </div>
        `;
        container.innerHTML += sectionHtml;
    });

    updateFoodUI();
    updateGlobalUI();
}

function toggleLedgerSection(id) {
    const el = document.getElementById(id);
    const icon = document.getElementById('icon-' + id);
    if (el.classList.contains('hidden')) {
        el.classList.remove('hidden');
        icon.classList.remove('-rotate-90');
    } else {
        el.classList.add('hidden');
        icon.classList.add('-rotate-90');
    }
}

function getFoodDayNames() {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const start = typeof state.settings?.firstDayOfWeek === 'number' ? state.settings.firstDayOfWeek % 7 : 3;
    const out = [];
    for (let i = 0; i < 7; i++) out.push(names[(start + i) % 7]);
    return out;
}

function getMonthCalendarInfo() {
    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth();
    var lastDay = new Date(year, month + 1, 0).getDate();
    var firstDow = new Date(year, month, 1).getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    var start = typeof state.settings?.firstDayOfWeek === 'number' ? state.settings.firstDayOfWeek % 7 : 3; // 0=Sun, 1=Mon, ..., 3=Wed
    // Calculate padding: how many blank cells before day 1
    // firstDow is in JS format (0=Sun), start is user setting (3=Wed)
    // We need to map firstDow to the column it should be in when week starts at 'start'
    // Column for firstDow = (firstDow - start + 7) % 7
    // So pad = that column number
    var pad = (firstDow - start + 7) % 7;
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return { year: year, month: month, lastDay: lastDay, pad: pad, monthName: monthNames[month], firstDow: firstDow, start: start };
}

function updateFoodUI() {
    var cid = typeof SECTION_IDS !== 'undefined' ? SECTION_IDS.CORE_ESSENTIALS : 'core_essentials';
    var fid = typeof SECTION_IDS !== 'undefined' ? SECTION_IDS.FOUNDATIONS : 'foundations';
    var flabel = typeof ITEM_LABELS !== 'undefined' ? ITEM_LABELS.FOOD_BASE : 'Food Base';
    var fSec = state.categories.find(s=>s.id===cid) || state.categories.find(s=>s.id===fid);
    var fItem = fSec ? fSec.items.find(i=>i.label===flabel) : null;
    var foodBase = fItem ? fItem.amount : 840;
    var daily = foodBase / (state.food.daysTotal || 28);
    var daysUsed = state.food.daysUsed || 0;
    var daysTotal = state.food.daysTotal || 28;
    var lockedAmount = state.food.lockedAmount || 0;
    var bufferCount = daily > 0 ? Math.floor(lockedAmount / daily) : 0;
    var currentDayInCycle = daysUsed + 1;

    document.getElementById('daily-food-rate').innerText = formatMoney(daily);
    document.getElementById('locked-funds-display').innerText = formatMoney(lockedAmount);
    document.getElementById('food-days-count').innerText = (daysTotal - daysUsed) + ' Days Left';
    var macroUsed = document.getElementById('food-macro-used');
    if (macroUsed) macroUsed.textContent = daysUsed + ' of 28 used';
    var weekDayLabel = document.getElementById('food-week-day-label');
    if (weekDayLabel) {
        var today = new Date();
        var calInfo = getMonthCalendarInfo();
        var monthName = calInfo.monthName.toUpperCase();
        var todayDate = today.getDate();
        weekDayLabel.textContent = monthName + ' ' + todayDate;
    }
    var progressBar = document.getElementById('food-progress-bar');
    if (progressBar) progressBar.style.width = (daysUsed / 28 * 100) + '%';

    var dayNames = getFoodDayNames();
    var headerRow = document.getElementById('food-overview-header');
    if (headerRow) {
        var headerGrid = headerRow.querySelector('.grid');
        if (headerGrid) headerGrid.innerHTML = dayNames.map(function(d) { return '<span>' + d.charAt(0) + '</span>'; }).join('');
    }

    var cal = getMonthCalendarInfo();
    var today = new Date();
    var todayDate = today.getDate();
    var todayMonth = today.getMonth();
    var todayYear = today.getFullYear();
    var isCurrentMonth = (todayMonth === cal.month && todayYear === cal.year);
    // Map cycle days to calendar dates: cycle day 1 = Feb 1, cycle day 2 = Feb 2, etc.
    // If today is Feb 13 and daysUsed = 17, that means they've consumed through Feb 13 (17 cycle days = Feb 1-13)
    // So consumed dates are: calendar dates <= todayDate (if we assume cycle aligns with calendar)
    // Actually, if daysUsed = 17 and today is Feb 13, then consumed = Feb 1-13 (13 dates), so daysUsed should represent calendar dates consumed
    // But the user says daysUsed = 17 means 17 days consumed, which would be Feb 1-17 if aligned
    // Wait, the user said "I used today's food so the days I would have left would start with 14"
    // So if today is Feb 13 and they consumed today, then consumed = Feb 1-13 (13 days), remaining starts Feb 14
    // But daysUsed = 17 suggests they've consumed 17 cycle days, not 17 calendar dates
    // I think the issue is: daysUsed should represent calendar dates consumed, not cycle days
    // For now, let's assume: consumed = calendar dates <= todayDate (since they said they consumed today)
    var rowsContainer = document.getElementById('food-overview-rows');
    if (rowsContainer) {
        rowsContainer.innerHTML = '';
        var pad = cal.pad;
        var lastDay = cal.lastDay;
        var totalSlots = pad + lastDay;
        var numRows = Math.ceil(totalSlots / 7);
        for (var r = 0; r < numRows; r++) {
            var weekNum = r + 1;
            var weekLabel = 'Week ' + weekNum;
            var rowHtml = '<div class="food-week-row flex gap-2 items-stretch rounded-lg"><div class="w-12 flex-shrink-0 flex items-center text-[10px] font-black uppercase tracking-wider text-slate-400">' + weekLabel + '</div><div class="grid grid-cols-7 gap-1 flex-1">';
            for (var col = 0; col < 7; col++) {
                var slot = r * 7 + col;
                var calendarDate = slot - pad + 1; // Actual calendar date (1-31)
                if (slot < pad || calendarDate > lastDay) {
                    rowHtml += '<div class="food-overview-cell rounded-md min-h-[2rem] bg-transparent"></div>';
                } else {
                    // Consumed = calendar dates up to and including today (since they consumed today)
                    var consumed = isCurrentMonth && calendarDate <= todayDate;
                    var isToday = isCurrentMonth && calendarDate === todayDate;
                    // Future in cycle = dates after today but within the 28-day cycle
                    // Cycle day = calendar date (aligned), so future = calendarDate > todayDate && calendarDate <= 28
                    var futureInCycle = calendarDate > todayDate && calendarDate <= 28;
                    var restOfMonth = calendarDate > 28;
                    // Buffer days: after day 28, up to bufferCount days
                    var isBuffer = calendarDate > 28 && calendarDate <= 28 + bufferCount;
                    var clickAttr = isToday ? ' onclick="spendFoodDay()" role="button"' : '';
                    var cls = 'food-overview-cell rounded-md flex items-center justify-center text-[10px] font-black min-h-[2rem] transition ';
                    if (consumed) cls += 'bg-slate-200 text-slate-500';
                    else if (isToday) cls += 'bg-indigo-500 text-white shadow-md cursor-pointer hover:bg-indigo-600';
                    else if (isBuffer) cls += 'bg-emerald-500 text-white border border-emerald-600';
                    else if (restOfMonth || futureInCycle) cls += 'bg-slate-100 text-slate-400 border border-slate-200';
                    else cls += 'bg-white text-slate-400 border border-slate-200';
                    var label = consumed ? '✓' : calendarDate;
                    rowHtml += '<div' + clickAttr + ' class="' + cls + '" data-date="' + calendarDate + '" title="' + cal.monthName + ' ' + calendarDate + '">' + label + '</div>';
                }
            }
            rowHtml += '</div></div>';
            rowsContainer.innerHTML += rowHtml;
        }
        var bufferInCurrentMonth = lastDay > 28 ? Math.min(bufferCount, lastDay - 28) : 0;
        var bufferInNext = Math.max(0, bufferCount - bufferInCurrentMonth);
        if (bufferInNext > 0) {
            var nextMonth = new Date(cal.year, cal.month + 1, 1);
            var nextName = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][nextMonth.getMonth()];
            var bufDay = 1;
            for (var br = 0; br < Math.ceil(bufferInNext / 7); br++) {
                var bufRow = '<div class="food-week-row flex gap-2 items-stretch rounded-lg mt-1"><div class="w-12 flex-shrink-0 flex items-center text-[9px] font-bold text-emerald-600 uppercase">' + (br === 0 ? nextName + ' (buffer)' : '') + '</div><div class="grid grid-cols-7 gap-1 flex-1">';
                for (var c = 0; c < 7; c++) {
                    if (bufDay <= bufferInNext) {
                        bufRow += '<div class="food-overview-cell rounded-md flex items-center justify-center text-[10px] font-black min-h-[2rem] bg-emerald-500 text-white border border-emerald-600">' + bufDay + '</div>';
                        bufDay++;
                    } else {
                        bufRow += '<div class="food-overview-cell rounded-md min-h-[2rem] bg-transparent"></div>';
                    }
                }
                bufRow += '</div></div>';
                rowsContainer.innerHTML += bufRow;
            }
        }
    }

    var markBtn = document.getElementById('food-mark-day-btn');
    if (markBtn) markBtn.disabled = daysUsed >= daysTotal;

    var list = document.getElementById('food-activity-list');
    if (list) {
        list.innerHTML = state.food.history.length ? state.food.history.map(function(h, i) {
            var label = h.type === 'spend' ? 'Used' : (h.type === 'deficit' ? 'Deficit' : 'Locked');
            var cls = h.type === 'spend' ? 'text-slate-400' : (h.type === 'deficit' ? 'text-red-500' : 'text-emerald-500');
            return '<div class="flex justify-between items-center text-[10px] font-bold uppercase py-2 border-b border-slate-50 last:border-0"><span class="' + cls + '">' + label + ' ' + formatMoney(h.amt) + '</span><button onclick="undoFood(' + i + ')" class="text-red-400 hover:text-red-600">Undo</button></div>';
        }).join('') : '<div class="text-center text-[10px] text-slate-300 py-2">No activity</div>';
    }
}

function calculateReality() {
    var total = getCurrentBalance();
    var realityTotal = getEl('reality-total');
    var headerReality = getEl('header-reality');
    if (realityTotal) realityTotal.innerText = formatMoney(total);
    if (headerReality) headerReality.innerText = formatMoney(total);
}

function updateGlobalUI() {
    var surplus = (state.accounts && state.accounts.surplus !== undefined) ? state.accounts.surplus : 0;
    var surpEl = getEl('global-surplus');
    var dTrigger = getEl('deficit-trigger');
    if (surpEl) surpEl.innerText = formatSignedMoney(surplus);

    if (dTrigger && surpEl) {
        if (surplus < 0) {
            dTrigger.classList.remove('hidden');
            surpEl.classList.remove('text-emerald-600');
            surpEl.classList.add('text-red-600');
        } else {
            dTrigger.classList.add('hidden');
            surpEl.classList.add('text-emerald-600');
            surpEl.classList.remove('text-red-600');
        }
    }

    calculateReality();
    var headerRealityEl = getEl('header-reality');
    if (headerRealityEl) void headerRealityEl.offsetHeight;
    if (surpEl) void surpEl.offsetHeight;
}

function renderCategoryHistory() {
    // FIX: Use global 'activeCat'
    const data = state.histories[activeCat] || [];
    document.getElementById('category-history-log').innerHTML = data.map(i => `
        <div class="flex justify-between items-center py-2 border-b border-slate-50 last:border-0 text-[10px]">
            <span class="font-bold text-slate-400 uppercase">${i.res}</span>
            <span class="${i.amt < 0 ? 'text-red-500' : 'text-emerald-500'} font-black">${formatMoney(i.amt)}</span>
        </div>
    `).join('') || '<div class="text-center text-slate-300 text-[10px] py-2">No History</div>';
}
