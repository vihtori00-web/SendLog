        // -- LOGIC: CHART & ANALYTICS --
        const ctx = document.getElementById('progressionChart').getContext('2d');
        Chart.defaults.color = '#737373';
        Chart.defaults.font.family = 'system-ui, -apple-system, sans-serif';

        let chart = null;
        let currentChartType = 'line';
        let activeTrendMetric = 'score';
        let activeTrendSecondary = 'avg_grade';

        function getMetricConfig(metric, filteredHistory) {
            const configs = {
                score: {
                    labelText: 'Score',
                    color: '#10b981',
                    bgColor: 'rgba(16, 185, 129, 0.07)',
                    yAxisID: 'y',
                    data: filteredHistory.map(s => s.score || 0)
                },
                sends: {
                    labelText: 'Sends',
                    color: '#10b981',
                    bgColor: 'rgba(16, 185, 129, 0.07)',
                    yAxisID: 'y',
                    data: filteredHistory.map(s => (s.climbs || []).filter(c => c.statusText === 'Top' || c.statusText === 'Flash').length)
                },
                avg_grade: {
                    labelText: 'Avg Grade',
                    color: '#a855f7',
                    bgColor: 'rgba(168, 85, 247, 0.07)',
                    yAxisID: 'y1',
                    data: filteredHistory.map(s => {
                        let sSum = 0, sCount = 0;
                        (s.climbs || []).forEach(c => {
                            if (c.statusText === 'Top' || c.statusText === 'Flash') {
                                sSum += fontGrades.indexOf(c.gradeStr);
                                sCount++;
                            }
                        });
                        return sCount > 0 ? (sSum / sCount) : 0;
                    })
                },
                flash_pct: {
                    labelText: 'Flash %',
                    color: '#f59e0b',
                    bgColor: 'rgba(245, 158, 11, 0.07)',
                    yAxisID: 'y',
                    data: filteredHistory.map(s => {
                        const total = (s.climbs || []).length;
                        const flashes = (s.climbs || []).filter(c => c.statusText === 'Flash').length;
                        return total > 0 ? Math.round((flashes / total) * 100) : 0;
                    })
                },
                projects: {
                    labelText: 'Proj Tries',
                    color: '#f97316',
                    bgColor: 'rgba(249, 115, 22, 0.07)',
                    yAxisID: 'y',
                    data: filteredHistory.map(s => (s.climbs || []).filter(c => c.statusText === 'Project').reduce((sum, c) => sum + (c.tries || 0), 0))
                },
                duration: {
                    labelText: 'Duration',
                    color: '#3b82f6',
                    bgColor: 'rgba(59, 130, 246, 0.07)',
                    yAxisID: 'y',
                    data: filteredHistory.map(s => Math.round((s.duration || 0) / 60))
                }
            };
            return configs[metric] || null;
        }

        function toggleChartDropdown(type) {
            if (window.event) window.event.stopPropagation();
            if (type === 'secondary') {
                document.getElementById('secondarySelDropdown').classList.toggle('hidden');
            }
        }

        function selectChartMetric(type, metric) {
            if (type === 'secondary') {
                activeTrendSecondary = metric;
                if (activeTrendSecondary === activeTrendMetric && activeTrendSecondary !== 'none') {
                    activeTrendMetric = activeTrendSecondary === 'avg_grade' ? 'score' : 'avg_grade';
                }
            }
            
            const drop = document.getElementById('secondarySelDropdown');
            if (drop) drop.classList.add('hidden');
            
            updateSelectorButtonsUI();
            updateAnalytics();
        }

        function updateSelectorButtonsUI() {

            const sBtn = document.getElementById('secondarySelBtn');
            const sText = document.getElementById('secondarySelText');
            if (sBtn && sText) {
                const names = {
                    score: 'Score', sends: 'Sends', avg_grade: 'Avg Grade',
                    flash_pct: 'Flash %', projects: 'Proj Tries', duration: 'Duration',
                    none: 'None'
                };
                sText.innerText = names[activeTrendSecondary] || 'Avg Grade';
                
                sBtn.classList.remove(
                    'border-emerald-500/40', 'text-emerald-400/80',
                    'border-purple-500/40', 'text-purple-400/80',
                    'border-amber-500/40', 'text-amber-400/80',
                    'border-orange-500/40', 'text-orange-400/80',
                    'border-blue-500/40', 'text-blue-400/80',
                    'border-neutral-800', 'text-neutral-500', 'text-neutral-400'
                );
                
                if (activeTrendSecondary === 'none') {
                    sBtn.classList.add('border-neutral-800', 'text-neutral-500');
                } else {
                    const classes = {
                        score: ['border-emerald-500/40', 'text-emerald-400/80'],
                        sends: ['border-emerald-500/40', 'text-emerald-400/80'],
                        avg_grade: ['border-purple-500/40', 'text-purple-400/80'],
                        flash_pct: ['border-amber-500/40', 'text-amber-400/80'],
                        projects: ['border-orange-500/40', 'text-orange-400/80'],
                        duration: ['border-blue-500/40', 'text-blue-400/80']
                    };
                    const activeClasses = classes[activeTrendSecondary] || ['border-neutral-800', 'text-neutral-400'];
                    activeClasses.forEach(cls => sBtn.classList.add(cls));
                }
            }
        }

        // Global dismiss for chart selectors
        document.addEventListener('click', (e) => {
            const sWrap = document.getElementById('secondarySelectorWrapper');
            if (sWrap && !sWrap.contains(e.target)) {
                const drop = document.getElementById('secondarySelDropdown');
                if (drop) drop.classList.add('hidden');
            }
        });

        function setChartType(type) {
            currentChartType = type;
            const a = "text-[9px] font-black px-2.5 py-1 rounded transition-colors bg-emerald-500 text-black uppercase tracking-widest";
            const i = "text-[9px] font-black px-2.5 py-1 rounded transition-colors text-neutral-500 hover:text-white uppercase tracking-widest";
            document.getElementById('chartBtnLine').className = type === 'line' ? a : i;
            document.getElementById('chartBtnRadar').className = type === 'radar' ? a : i;
            document.getElementById('chartBtnBar').className = type === 'bar' ? a : i;
            
            const selectorsEl = document.getElementById('chartSelectorsContainer');
            if (selectorsEl) {
                if (type === 'line') {
                    selectorsEl.classList.remove('hidden');
                    updateSelectorButtonsUI();
                } else {
                    selectorsEl.classList.add('hidden');
                }
            }
            
            updateAnalytics();
        }

        function setActiveTrendMetric(metric) {
            if (currentChartType !== 'line') return;
            activeTrendMetric = metric;
            updateAnalytics();
        }

        function updateCardHighlights() {
            const metric = activeTrendMetric;
            const styles = {
                score: { border: 'border-emerald-500/60', shadow: 'shadow-[0_0_12px_rgba(16,185,129,0.15)]' },
                sends: { border: 'border-emerald-500/60', shadow: 'shadow-[0_0_12px_rgba(16,185,129,0.15)]' },
                flash_pct: { border: 'border-amber-500/60', shadow: 'shadow-[0_0_12px_rgba(245,158,11,0.15)]' },
                projects: { border: 'border-orange-500/60', shadow: 'shadow-[0_0_12px_rgba(249,115,22,0.15)]' },
                duration: { border: 'border-blue-500/60', shadow: 'shadow-[0_0_12px_rgba(59,130,246,0.15)]' },
                avg_grade: { border: 'border-purple-500/60', shadow: 'shadow-[0_0_12px_rgba(168,85,247,0.15)]' }
            };

            const cards = document.querySelectorAll('[data-metric]');
            const isLineChart = currentChartType === 'line';

            cards.forEach(card => {
                const cardMetric = card.getAttribute('data-metric');
                Object.values(styles).forEach(s => {
                    card.classList.remove(s.border);
                    s.shadow.split(' ').forEach(cls => card.classList.remove(cls));
                });
                card.classList.add('border-neutral-800');

                if (isLineChart) {
                    card.classList.add('cursor-pointer', 'hover:bg-neutral-800/80', 'active:scale-[0.98]');
                    if (cardMetric === metric) {
                        card.classList.remove('border-neutral-800');
                        card.classList.add(styles[metric].border);
                        styles[metric].shadow.split(' ').forEach(cls => card.classList.add(cls));
                    }
                } else {
                    card.classList.remove('cursor-pointer', 'hover:bg-neutral-800/80', 'active:scale-[0.98]');
                }
            });
        }

        let historyViewMode = 'ALL';

        function setHistoryMode(mode) {
            historyViewMode = mode;
            const a = 'text-[10px] font-black px-3 py-1.5 rounded-lg transition-colors z-10 bg-emerald-500 text-black';
            const i = 'text-[10px] font-black px-3 py-1.5 rounded-lg transition-colors z-10 text-neutral-500 hover:text-white';
            document.getElementById('historyBtnAll').className = mode === 'ALL' ? a : i;
            document.getElementById('historyBtnWeek').className = mode === 'WEEK' ? a : i;
            document.getElementById('historyBtnMonth').className = mode === 'MONTH' ? a : i;
            updateAnalytics();
            renderHistoryList();
        }

        function getStartOfWeek() {
            const now = new Date();
            const day = now.getDay(); // 0=Sun, 1=Mon...
            const diff = (day === 0 ? -6 : 1) - day; // Monday-based
            const monday = new Date(now);
            monday.setDate(now.getDate() + diff);
            monday.setHours(0, 0, 0, 0);
            return monday.getTime();
        }

        function updateAnalytics() {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            const startOfWeek = getStartOfWeek();
            
            const filteredHistory = historyViewMode === 'ALL'
                ? boulderHistory
                : historyViewMode === 'WEEK'
                    ? boulderHistory.filter(s => (s.timestamp || 0) >= startOfWeek)
                    : boulderHistory.filter(s => (s.timestamp || 0) >= startOfMonth);

            const stats = getHistoryStats(filteredHistory);

            document.getElementById('statTotalPoints').innerText = stats.totalPoints;
            document.getElementById('statTotalSends').innerText = stats.totalSends;
            document.getElementById('historyPeriodSummary').innerText = `${filteredHistory.length} sessions completed`;
            document.getElementById('statProjectTries').innerText = stats.totalProjTries;
            document.getElementById('statFlashRate').innerText = stats.flashRate + '%';
            document.getElementById('statAvgTime').innerText = stats.avgDur || '-';
            
            const gIdx = Math.floor(stats.avgGradeScore);
            const gRem = (stats.avgGradeScore - gIdx).toFixed(1);
            const preciseG = stats.totalSuccessfulClimbs > 0 ? `${fontGrades[gIdx]}<span class="text-[10px] text-neutral-500 ml-1">+${gRem}</span>` : '-';
            document.getElementById('statAvgGrade').innerHTML = preciseG;

            // Personal Records (filtered by current view mode)
            const pr = getPersonalRecords(filteredHistory);
            document.getElementById('prBestScore').innerText = pr.bestScore || '-';
            document.getElementById('prHighestGrade').innerText = pr.highestGrade;
            document.getElementById('prMostSends').innerText = pr.mostSends;
            document.getElementById('prLongestSession').innerText = pr.longestSession;

            // Streak (always computed from all history)
            const streak = getStreakData();
            document.getElementById('statCurrentStreak').innerText = streak.current;
            document.getElementById('statLongestStreak').innerText = streak.longest;

            // Calendar Heatmap
            renderCalendarHeatmap();

            // Period comparison deltas
            updateComparisonDeltas();

            // Chart data rendering
            if (chart && chart.config.type !== currentChartType) {
                chart.destroy();
                chart = null;
            }

            const ctx = document.getElementById('progressionChart').getContext('2d');
            
            if (currentChartType === 'line') {
                const labels = filteredHistory.map(() => '');
                
                const primaryConfig = getMetricConfig(activeTrendMetric, filteredHistory);
                const secondaryConfig = activeTrendSecondary !== 'none' ? getMetricConfig(activeTrendSecondary, filteredHistory) : null;

                const datasets = [
                    { 
                        label: primaryConfig.labelText, 
                        data: primaryConfig.data, 
                        borderColor: primaryConfig.color, 
                        backgroundColor: primaryConfig.bgColor, 
                        borderWidth: 2, 
                        fill: true, 
                        tension: 0.4, 
                        yAxisID: 'y', 
                        pointRadius: 0, 
                        hitRadius: 0, 
                        hoverRadius: 0 
                    }
                ];

                if (secondaryConfig) {
                    const secBorderColor = secondaryConfig.color + 'bb';
                    datasets.push({ 
                        label: secondaryConfig.labelText, 
                        data: secondaryConfig.data, 
                        borderColor: secBorderColor, 
                        backgroundColor: 'transparent', 
                        borderDash: [4, 4], 
                        borderWidth: 1.5, 
                        tension: 0.3, 
                        yAxisID: 'y1', 
                        pointRadius: 0, 
                        hitRadius: 0, 
                        hoverRadius: 0 
                    });
                }

                updateSelectorButtonsUI();

                const hasY1 = secondaryConfig !== null;

                if (chart) {
                    chart.data.labels = labels;
                    chart.data.datasets = datasets;
                    chart.options.scales.y.beginAtZero = activeTrendMetric !== 'avg_grade';
                    chart.options.scales.y1.display = hasY1;
                    chart.options.scales.y1.beginAtZero = activeTrendSecondary !== 'avg_grade';
                    chart.update('none');
                } else {
                    chart = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: datasets
                        },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false },
                                tooltip: { enabled: false },
                            },
                            interaction: { mode: 'index', intersect: false },
                            events: ['mousedown', 'mouseup', 'mousemove', 'touchstart', 'touchend', 'touchmove'],
                            scales: {
                                y: { 
                                    beginAtZero: activeTrendMetric !== 'avg_grade', 
                                    position: 'left', 
                                    grid: { color: '#1a1a1a' }, 
                                    border: { display: false }, 
                                    ticks: { 
                                        font: { size: 9 },
                                        callback: function (val) {
                                            if (activeTrendMetric === 'avg_grade') {
                                                return fontGrades[Math.round(val)] || '';
                                            }
                                            return val;
                                        }
                                    } 
                                },
                                y1: { 
                                    display: hasY1,
                                    position: 'right', 
                                    grid: { display: false }, 
                                    border: { display: false }, 
                                    beginAtZero: activeTrendSecondary !== 'avg_grade',
                                    ticks: { 
                                        font: { size: 9 }, 
                                        callback: function (val) {
                                            if (activeTrendSecondary === 'avg_grade') {
                                                return fontGrades[Math.round(val)] || '';
                                            }
                                            return val;
                                        } 
                                    } 
                                },
                                x: { grid: { display: false }, border: { display: false }, ticks: { display: false } }
                            }
                        }
                    });
                }
            } else if (currentChartType === 'radar') {
                const tagCounts = { 'crimp': 0, 'sloper': 0, 'pinch': 0, 'slab': 0, 'dyno': 0, 'board': 0, 'technical': 0, 'powerful': 0 };
                let totalClimbs = 0;
                filteredHistory.forEach(s => {
                    (s.climbs || []).forEach(c => {
                        totalClimbs++;
                        if (c.tags) c.tags.forEach(t => { if (tagCounts[t] !== undefined) tagCounts[t]++; });
                    });
                });
                const maxTagCount = Math.max(...Object.values(tagCounts), 1);
                const tagPct = Object.values(tagCounts).map(v => Math.round((v / maxTagCount) * 100));
                
                if (chart) {
                    chart.data.labels = Object.keys(tagCounts).map(k => k.toUpperCase());
                    chart.data.datasets[0].data = tagPct;
                    chart.update('none');
                } else {
                    chart = new Chart(ctx, {
                        type: 'radar',
                        data: {
                            labels: Object.keys(tagCounts).map(k => k.toUpperCase()),
                            datasets: [{
                                label: 'Style %',
                                data: tagPct,
                                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                                borderColor: '#10b981',
                                pointBackgroundColor: '#10b981',
                                pointRadius: 4,
                                pointHoverRadius: 6,
                                borderWidth: 1.5
                            }]
                        },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    enabled: true,
                                    callbacks: { label: ctx => ctx.parsed.r + '%' }
                                }
                            },
                            scales: {
                                r: {
                                    beginAtZero: true,
                                    max: 100,
                                    ticks: { display: false, stepSize: 25 },
                                    grid: { color: '#262626' },
                                    angleLines: { color: '#262626' },
                                    pointLabels: { font: { size: 9, weight: 'bold' }, color: '#737373' }
                                }
                            }
                        }
                    });
                }
            } else if (currentChartType === 'bar') {
                const gradeCounts = {};
                filteredHistory.forEach(s => {
                    (s.climbs || []).forEach(c => {
                        if ((c.statusText === 'Top' || c.statusText === 'Flash') && c.gradeStr && c.gradeStr !== '🍺') {
                            gradeCounts[c.gradeStr] = (gradeCounts[c.gradeStr] || 0) + 1;
                        }
                    });
                });
                const sortedKeys = Object.keys(gradeCounts).sort((a,b) => fontGrades.indexOf(a) - fontGrades.indexOf(b));
                const dataValues = sortedKeys.map(k => gradeCounts[k]);
                
                if (chart) {
                    chart.data.labels = sortedKeys;
                    chart.data.datasets[0].data = dataValues;
                    chart.update('none');
                } else {
                    chart = new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: sortedKeys,
                            datasets: [{
                                label: 'Tops',
                                data: dataValues,
                                backgroundColor: '#3b82f6',
                                borderRadius: 4
                            }]
                        },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { display: false }, tooltip: { enabled: false } },
                            scales: {
                                y: { beginAtZero: true, grid: { color: '#1a1a1a' }, border: { display: false }, ticks: { font: { size: 9 } } },
                                x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 9 }, color: '#737373' } }
                            }
                        }
                    });
                }
            }
            updateCardHighlights();
        }


        function renderHistoryList() {
            const listEl = document.getElementById('historyList');
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            const startOfWeek = getStartOfWeek();

            const filteredHistory = historyViewMode === 'ALL'
                ? boulderHistory
                : historyViewMode === 'WEEK'
                    ? boulderHistory.filter(s => (s.timestamp || 0) >= startOfWeek)
                    : boulderHistory.filter(s => (s.timestamp || 0) >= startOfMonth);

            if (filteredHistory.length === 0) {
                listEl.innerHTML = `
                <div class="flex flex-col items-center justify-center py-20 opacity-30">
                    <div class="text-6xl mb-4">🏆</div>
                    <p class="text-sm font-black uppercase tracking-widest">No history yet</p>
                    <p class="text-[10px] mt-1">Your climbing journey starts here</p>
                </div>`;
                return;
            }

            listEl.innerHTML = filteredHistory.slice().reverse().map((s) => {
                const actualIndex = boulderHistory.indexOf(s);
                const { sends, flashes, avgGrade } = getSessionStats(s);

                // Robust Date Logic using timestamp
                const sDate = s.timestamp ? new Date(s.timestamp) : new Date();
                const checkToday = new Date();
                const checkYesterday = new Date(); checkYesterday.setDate(checkYesterday.getDate() - 1);
                
                const isToday = sDate.toDateString() === checkToday.toDateString();
                const isYesterday = sDate.toDateString() === checkYesterday.toDateString();
                
                let relLabel = "";
                if (isToday) relLabel = "TODAY";
                else if (isYesterday) relLabel = "YESTERDAY";
                else relLabel = sDate.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();

                const dayNum = sDate.getDate();
                const fullDateTitle = isToday ? "Today's Session" : isYesterday ? "Yesterday's Session" : `Session on ${sDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

                const climbCount = s.climbs ? s.climbs.length : 0;
                
                // Mini Grade Bar Logic
                const gradeCounts = {};
                (s.climbs || []).forEach(c => {
                    if (c.gradeStr && c.gradeStr !== '🍺') {
                        gradeCounts[c.gradeStr] = (gradeCounts[c.gradeStr] || 0) + 1;
                    }
                });
                const gradeKeys = Object.keys(gradeCounts).sort((a, b) => fontGrades.indexOf(a) - fontGrades.indexOf(b));
                const barColors = ['#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#ef4444', '#06b6d4', '#84cc16'];
                const miniBarHtml = gradeKeys.map((g, i) => {
                    const pct = (gradeCounts[g] / Math.max(1, climbCount)) * 100;
                    return `<div style="width:${pct}%;background:${barColors[i % barColors.length]}" class="h-full opacity-60"></div>`;
                }).join('');

                return `
                <li class="group relative px-5 py-3 active:bg-neutral-800/80 transition-all cursor-pointer border-b border-neutral-800/40 touch-pan-y" style="touch-action: pan-y;" onclick="openSessionDetail(${actualIndex})">
                    <div class="flex items-center justify-between mb-1.5">
                        <div class="flex items-center gap-3 min-w-0">
                            <!-- Date Badge -->
                            <div class="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-neutral-950 border border-neutral-800 shrink-0">
                                <span class="text-[9px] font-black text-emerald-400 uppercase leading-none mb-0.5">${relLabel}</span>
                                <span class="text-xl font-black text-white leading-none">${dayNum}</span>
                            </div>
                            <!-- Title & Stats -->
                            <div class="min-w-0">
                                <h4 class="text-base font-black text-white uppercase tracking-tight">${fullDateTitle}</h4>
                                <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    <span class="text-[10px] font-bold text-neutral-500">${climbCount} Climbs</span>
                                    <span class="text-neutral-800 text-[8px]">●</span>
                                    <span class="text-[10px] font-bold text-emerald-400">${sends} Sends</span>
                                    <span class="text-neutral-800 text-[8px]">●</span>
                                    <span class="text-[10px] font-bold text-blue-400">Avg: ${avgGrade}</span>
                                    ${flashes > 0 ? ` <span class="text-neutral-800 text-[8px]">●</span> <span class="text-[10px] font-bold text-amber-500">⚡ ${flashes} Flash</span>` : ''}
                                </div>
                            </div>
                        </div>
                        <!-- Score & Duration -->
                        <div class="text-right shrink-0 ml-2">
                            <div class="text-lg font-black text-white leading-none">${s.score.toLocaleString()}<span class="text-[8px] text-neutral-500 ml-1 uppercase">pts</span></div>
                            <div class="text-[10px] font-bold text-neutral-500 italic mt-0.5">${formatDuration(s.duration) || '--'}</div>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-4 mt-3">
                        <div class="flex-1 h-1.5 bg-neutral-900 rounded-full overflow-hidden flex shadow-inner border border-neutral-800/30">
                            ${miniBarHtml || '<div class="w-full h-full bg-neutral-950 opacity-20"></div>'}
                        </div>
                        <button onclick="event.stopPropagation(); deleteSession(${actualIndex})" class="p-1 text-neutral-500/40 hover:text-red-500 active:scale-90 transition-all">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>
                </li>
                `;
            }).join('');
        }


        // -- SESSION DETAIL MODAL --
        let currentSessionDetailIndex = null;
        function openSessionDetail(historyIndex, push = true) {
            currentSessionDetailIndex = historyIndex;
            const s = boulderHistory[historyIndex];
            if (!s) return;
            if ('vibrate' in navigator) navigator.vibrate(10);
            
            if (push) history.pushState({ overlay: 'sessionDetail', index: historyIndex }, '', '#session-' + historyIndex);

            // Populate header
            document.getElementById('sdDate').innerText = s.date;
            const durationTxt = s.duration ? ` (${formatDuration(s.duration)})` : '';
            document.getElementById('sdScore').innerText = s.score.toLocaleString() + ' pts' + durationTxt;

            const climbs = s.climbs || [];
            const stats = getSessionStats(s);
            const projects = climbs.length - stats.sends;

            document.getElementById('sdClimbCount').innerText = climbs.length;
            document.getElementById('sdSends').innerText = stats.sends;
            document.getElementById('sdFlashes').innerText = stats.flashes;
            document.getElementById('sdProjects').innerText = projects;

            // Grade distribution bar
            const gradeBar = document.getElementById('sdGradeBar');
            const gradeLabels = document.getElementById('sdGradeLabels');
            const gradeCounts = {};
            climbs.forEach(c => {
                if (c.gradeStr && c.gradeStr !== '🍺') {
                    gradeCounts[c.gradeStr] = (gradeCounts[c.gradeStr] || 0) + 1;
                }
            });
            const gradeKeys = Object.keys(gradeCounts).sort((a, b) => fontGrades.indexOf(a) - fontGrades.indexOf(b));
            const total = gradeKeys.reduce((s, k) => s + gradeCounts[k], 0);
            const barColors = ['#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#ef4444', '#06b6d4', '#84cc16'];

            if (gradeKeys.length > 0) {
                gradeBar.innerHTML = gradeKeys.map((g, i) => {
                    const pct = (gradeCounts[g] / Math.max(1, total)) * 100;
                    const col = barColors[i % barColors.length];
                    return `<div style="width:${pct}%;background:${col};opacity:0.85" title="${g}: ${gradeCounts[g]}"></div>`;
                }).join('');
                gradeLabels.innerHTML = gradeKeys.map((g, i) => {
                    const pct = (gradeCounts[g] / Math.max(1, total)) * 100;
                    const col = barColors[i % barColors.length];
                    return `<div style="width:${pct}%;overflow:hidden" class="text-[8px] font-black truncate" style="color:${col}">
                        <span style="color:${col}">${g}×${gradeCounts[g]}</span>
                    </div>`;
                }).join('');
            } else {
                gradeBar.innerHTML = '<div class="w-full h-full bg-neutral-800 rounded-lg"></div>';
                gradeLabels.innerHTML = '';
            }

            // Climb list
            document.getElementById('sdClimbList').innerHTML = climbs.length === 0 
                ? '<li class="text-neutral-500 text-sm text-center py-4">No climbs recorded.</li>'
                : climbs.map(c => {
                    const statusColor = c.statusText === 'Flash' ? 'text-amber-400' : c.statusText === 'Top' ? 'text-blue-400' : 'text-neutral-400';
                    const bgColor = c.statusText === 'Flash' ? 'bg-amber-500/10 border-amber-500/20' : c.statusText === 'Top' ? 'bg-blue-500/10 border-blue-500/20' : 'bg-neutral-800/30 border-neutral-700/30';
                    return `
                    <li class="flex justify-between items-center p-2.5 ${bgColor} rounded-xl border">
                        <div class="flex items-center gap-3">
                            <span class="text-lg font-black w-10 text-center leading-tight">${c.gradeStr}</span>
                            <div class="flex flex-col">
                                <span class="${statusColor} text-[11px] font-bold uppercase tracking-wider">${c.statusText}</span>
                                <span class="text-neutral-500 text-[9px]">${c.tries} Attempt${c.tries > 1 ? 's' : ''}</span>
                                ${c.tags && c.tags.length > 0 ? `<div class="flex gap-1 mt-1 flex-wrap">${c.tags.map(t => `<span class="bg-neutral-800 text-neutral-400 border border-neutral-700 text-[8px] uppercase px-1.5 py-0.5 rounded">${t}</span>`).join('')}</div>` : ''}
                            </div>
                        </div>
                        <span class="text-emerald-400 font-bold text-sm">+${c.points} pts</span>
                    </li>`;
                }).join('');

            // Show overlay with animation
            const overlay = document.getElementById('sessionDetailOverlay');
            const sheet = document.getElementById('sessionDetailSheet');
            overlay.classList.replace('hidden', 'flex');
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    sheet.style.transform = 'translateY(0)';
                });
            });
        }

        function closeSessionDetail(event, pop = true) {
            if (event && event.target !== document.getElementById('sessionDetailOverlay')) return;
            const overlay = document.getElementById('sessionDetailOverlay');
            const sheet = document.getElementById('sessionDetailSheet');
            sheet.style.transform = 'translateY(100%)';
            setTimeout(() => overlay.classList.replace('flex', 'hidden'), 300);
            if (pop) history.back();
        }


        function deleteSession(index) {
            if (confirm("Are you sure you want to delete this session? This cannot be undone.")) {
                boulderHistory.splice(index, 1);
                localStorage.setItem('boulderHistory', JSON.stringify(boulderHistory));
                updateAnalytics();
                renderHistoryList();
                triggerMilestoneBackup();
            }
        }

        // -- SESSION EDITOR LOGIC --
        let tempEditSession = null;
        let tempEditSessionIndex = null;

        function openEditSession(index, push = true) {
            tempEditSessionIndex = index;
            const s = boulderHistory[index];
            if (!s) return;
            if ('vibrate' in navigator) navigator.vibrate(10);
            
            // Deep copy session climbs so edits aren't saved immediately
            tempEditSession = {
                ...s,
                climbs: s.climbs ? s.climbs.map(c => ({ ...c })) : []
            };

            // Prefill Date & Time using local timezone
            const d = tempEditSession.timestamp ? new Date(tempEditSession.timestamp) : new Date();
            const tzOffset = d.getTimezoneOffset() * 60000;
            const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
            document.getElementById('editSessionDateTime').value = localISOTime;

            // Prefill Duration
            const durSeconds = tempEditSession.duration || 0;
            const durHours = Math.floor(durSeconds / 3600);
            const durMinutes = Math.floor((durSeconds % 3600) / 60);
            document.getElementById('editSessionHours').value = durHours;
            document.getElementById('editSessionMinutes').value = durMinutes;

            // Render climbs and score
            renderEditSessionClimbs();

            // Show edit overlay
            document.getElementById('editSessionOverlay').classList.replace('hidden', 'flex');
            if (push) history.pushState({ overlay: 'editSession', index: index }, '', '#edit-session');
        }

        function renderEditSessionClimbs() {
            const listEl = document.getElementById('editSessionClimbList');
            const scoreEl = document.getElementById('editSessionScoreDisplay');
            if (!listEl || !tempEditSession) return;

            // Calculate current total score of remaining climbs
            const currentScore = tempEditSession.climbs.reduce((sum, c) => sum + (c.points || 0), 0);
            tempEditSession.score = currentScore;
            scoreEl.innerText = `${currentScore.toLocaleString()} pts`;

            if (tempEditSession.climbs.length === 0) {
                listEl.innerHTML = '<li class="text-neutral-500 text-sm text-center py-4">No climbs left.</li>';
                return;
            }

            listEl.innerHTML = tempEditSession.climbs.map((c, idx) => {
                const statusColor = c.statusText === 'Flash' ? 'text-amber-400' : c.statusText === 'Top' ? 'text-blue-400' : 'text-neutral-400';
                const bgColor = c.statusText === 'Flash' ? 'bg-amber-500/10 border-amber-500/20' : c.statusText === 'Top' ? 'bg-blue-500/10 border-blue-500/20' : 'bg-neutral-800/30 border-neutral-700/30';
                return `
                <li class="flex justify-between items-center p-2.5 ${bgColor} rounded-xl border border-neutral-800">
                    <div class="flex items-center gap-3">
                        <span class="text-base font-black w-8 text-center leading-tight">${c.gradeStr}</span>
                        <div class="flex flex-col">
                            <span class="${statusColor} text-[10px] font-bold uppercase tracking-wider">${c.statusText}</span>
                            <span class="text-neutral-500 text-[8px]">${c.tries} Attempt${c.tries > 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-emerald-400 font-bold text-xs">+${c.points} pts</span>
                        <button onclick="removeTempClimb(${idx})" class="text-red-500/40 hover:text-red-500 active:scale-90 transition p-1">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </div>
                </li>`;
            }).join('');
        }

        function removeTempClimb(idx) {
            if (tempEditSession) {
                tempEditSession.climbs.splice(idx, 1);
                renderEditSessionClimbs();
                if ('vibrate' in navigator) navigator.vibrate(10);
            }
        }

        function saveEditedSession() {
            if (!tempEditSession || tempEditSessionIndex === null) return;

            // 1. Parse Date & Time
            const dateVal = document.getElementById('editSessionDateTime').value;
            if (!dateVal) {
                alert("Please select a valid date and time.");
                return;
            }
            const newDate = new Date(dateVal);
            tempEditSession.timestamp = newDate.getTime();
            tempEditSession.date = newDate.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

            // 2. Parse Duration
            const hoursVal = parseInt(document.getElementById('editSessionHours').value) || 0;
            const minsVal = parseInt(document.getElementById('editSessionMinutes').value) || 0;
            tempEditSession.duration = (hoursVal * 3600) + (minsVal * 60);

            // 3. Save to boulderHistory
            boulderHistory[tempEditSessionIndex] = tempEditSession;
            localStorage.setItem('boulderHistory', JSON.stringify(boulderHistory));

            // 4. Update UI
            updateAnalytics();
            renderHistoryList();
            triggerMilestoneBackup();

            // 5. Go back to return from #edit-session state to #session-idx state.
            // The popstate listener will automatically trigger openSessionDetail with the updated data
            // and close the edit overlay smoothly.
            history.back();
            
            if ('vibrate' in navigator) navigator.vibrate([10, 50, 10]);
        }

        function closeEditSession(event, pop = true) {
            document.getElementById('editSessionOverlay').classList.replace('flex', 'hidden');
            tempEditSession = null;
            tempEditSessionIndex = null;
            if (pop) history.back();
        }

        // -- LOGIC: LEADERBOARD & MODES --
        let lbMode = 'ALL';

        function setLbMode(mode) {
            lbMode = mode;
            const a = "text-[10px] font-black px-3 py-1.5 rounded-lg transition-colors z-10 bg-emerald-500 text-black";
            const i = "text-[10px] font-black px-3 py-1.5 rounded-lg transition-colors z-10 text-neutral-500 hover:text-white";
            document.getElementById('lbBtnAll').className = mode === 'ALL' ? a : i;
            document.getElementById('lbBtnWeek').className = mode === 'WEEK' ? a : i;
            document.getElementById('lbBtnMonth').className = mode === 'MONTH' ? a : i;
            loadLeaderboard();
        }

        function getTotalScore() {
            return (boulderHistory || []).reduce((sum, s) => sum + (s.score || 0), 0);
        }

        function getMonthlyScore() {
            const now = new Date();
            return boulderHistory.filter(h => {
                const hDate = h.timestamp ? new Date(h.timestamp) : new Date();
                return hDate.getFullYear() === now.getFullYear() && hDate.getMonth() === now.getMonth();
            }).reduce((sum, h) => sum + h.score, 0);
        }

        function getWeeklyScore() {
            const startOfWeek = getStartOfWeek();
            return boulderHistory.filter(h => (h.timestamp || 0) >= startOfWeek).reduce((sum, h) => sum + h.score, 0);
        }

        function getISOWeekStr() {
            const now = new Date();
            const tmp = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
            tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
            const year = tmp.getUTCFullYear();
            const week = Math.ceil((((tmp - Date.UTC(year, 0, 1)) / 86400000) + 1) / 7);
            return year + "-W" + String(week).padStart(2, '0');
        }

        function updateLeaderboardUI() {
            document.getElementById('playerNameInput').value = playerName;
            const score = lbMode === 'MONTH' ? getMonthlyScore() : lbMode === 'WEEK' ? getWeeklyScore() : getTotalScore();
            document.getElementById('syncTotalScore').innerText = score;
        }

        function savePlayerName() {
            const val = document.getElementById('playerNameInput').value.trim();
            if (val) {
                playerName = val;
                localStorage.setItem('boulderPlayerName', playerName);
                syncScoreToLeaderboard(); // auto-sync when name is saved
            }
        }

        async function syncScoreToLeaderboard() {
            if (!playerName) {
                alert("Please enter a player name first!");
                document.getElementById('playerNameInput').focus();
                return;
            }
            const btn = document.getElementById('btnSync');
            btn.innerText = "Syncing...";

            const totalScore = getTotalScore();
            const monthlyScore = getMonthlyScore();
            const weeklyScore = getWeeklyScore();

            try {
                const safeName = playerName.replace(/ /g, '-');
                const nameAll = encodeURIComponent(safeName + '_ALL');

                const now = new Date();
                const monthStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0');
                const nameMonth = encodeURIComponent(safeName + '_M_' + monthStr);
                const weekStr = getISOWeekStr();
                const nameWeek = encodeURIComponent(safeName + '_W_' + weekStr);

                const glob = getHistoryStats(boulderHistory);
                const statsText = encodeURIComponent(`${glob.avgGrade}|${glob.avgSends}|${glob.flashRate}`);

                const urlAll   = `https://api.codetabs.com/v1/proxy?quest=http://dreamlo.com/lb/${DREAMLO_PRIVATE_KEY}/add/${nameAll}/${totalScore}/0/${statsText}?t=${Date.now()}`;
                const urlMonth = `https://api.codetabs.com/v1/proxy?quest=http://dreamlo.com/lb/${DREAMLO_PRIVATE_KEY}/add/${nameMonth}/${monthlyScore}/0/${statsText}?t=${Date.now()}`;
                const urlWeek  = `https://api.codetabs.com/v1/proxy?quest=http://dreamlo.com/lb/${DREAMLO_PRIVATE_KEY}/add/${nameWeek}/${weeklyScore}/0/${statsText}?t=${Date.now()}`;

                await Promise.all([
                    fetch(urlAll),
                    fetch(urlMonth),
                    fetch(urlWeek)
                ]);

                btn.innerText = "Synced!";
                btn.classList.add("text-emerald-400");
                setTimeout(() => { btn.innerText = "Sync Score"; btn.classList.remove("text-emerald-400"); }, 2000);

                loadLeaderboard();
            } catch (e) {
                alert("Failed to sync: " + e.message);
                btn.innerText = "Sync Failed";
            }
        }

        async function loadLeaderboard() {
            const listEl = document.getElementById('leaderboardList');
            document.getElementById('syncTotalScore').innerText = lbMode === 'MONTH' ? getMonthlyScore() : lbMode === 'WEEK' ? getWeeklyScore() : getTotalScore();
            listEl.innerHTML = `
                <div class="flex justify-center items-center py-10">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                </div>`;

            try {
                // Fetch from HTTP Dreamlo via codetabs Proxy to bypass SSL and CORS blocks
                const url = `https://api.codetabs.com/v1/proxy?quest=http://dreamlo.com/lb/${DREAMLO_PUBLIC_KEY}/json?t=${Date.now()}`;
                const res = await fetch(url);
                const json = await res.json();

                let data = [];
                const lb = json?.dreamlo?.leaderboard;
                if (lb && lb.entry) {
                    data = Array.isArray(lb.entry) ? lb.entry : [lb.entry];
                }

                // Identify the suffix to filter on based on the selected mode
                const now = new Date();
                const monthStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0');
                const weekStr = getISOWeekStr();
                const suffix = lbMode === 'ALL' ? '_ALL' : lbMode === 'WEEK' ? '_W_' + weekStr : '_M_' + monthStr;

                // Map the data into our native format and filter implicitly
                data = data
                    .map(p => { p.decodedName = decodeURIComponent(p.name); return p; })
                    .filter(p => p.decodedName.endsWith(suffix))
                    .map(p => ({
                        rawDecodedName: p.decodedName,
                        name: p.decodedName.replace(suffix, '').replace(/-/g, ' '),
                        score: parseInt(p.score) || 0,
                        text: p.text
                    }));

                // Sort descending just in case
                data.sort((a, b) => b.score - a.score);

                // Update Sticky Footer Initial State
                const sticky = document.getElementById('leaderboardSticky');
                let userRank = -1;
                let userScore = 0;

                // Handle empty state gracefully
                if (data.length === 0) {
                    listEl.innerHTML = `<div class="text-center text-neutral-500 text-sm py-5 mt-5">No scores yet in this category.<br>Sync yours!</div>`;
                    if (sticky) sticky.classList.add('translate-y-full');
                    return;
                }

                listEl.innerHTML = data.map((p, i) => {
                    const isMe = p.name.toLowerCase() === (playerName || '').toLowerCase();
                    if (isMe) {
                        userRank = i + 1;
                        userScore = p.score;
                    }
                    const rankClass = i === 0 ? "text-amber-400 font-black text-xl"
                        : i === 1 ? "text-neutral-300 font-bold text-lg"
                            : i === 2 ? "text-amber-600 font-bold text-lg"
                                : "text-neutral-500";
                    const bgClass = isMe ? "bg-emerald-900/40 border border-emerald-500/30" : "hover:bg-neutral-800/30 border border-transparent";
                    
                    const [avgG, sPerS, fPct] = (p.text && p.text !== '0') ? p.text.split('|') : ['-', '0', '0'];

                    const deleteBtnHtml = isAdmin ? `
                        <button onclick="deleteRecord('${p.rawDecodedName.replace(/'/g, "\\'")}')" class="ml-3 text-red-500 hover:text-red-400 bg-red-500/10 rounded-lg transition active:scale-95 p-2 shrink-0" title="Delete Score">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    ` : "";

                    return `
                        <li class="flex items-center p-3 rounded-xl transition-colors ${bgClass} relative group">
                            <div class="w-8 text-center shrink-0 ${rankClass}">#${i + 1}</div>
                            <div class="ml-3 flex-1 overflow-hidden">
                                <span class="font-bold text-sm ${isMe ? 'text-emerald-400' : 'text-neutral-200'} truncate block w-full">${p.name}</span>
                                ${p.text && p.text !== '0' ? `
                                    <div class="flex gap-1.5 mt-0.5 opacity-60 flex-wrap">
                                        <span class="text-[8px] font-bold text-blue-400">Avg: ${avgG || '-'}</span>
                                        <span class="text-neutral-700 text-[8px]">/</span>
                                        <span class="text-[8px] font-bold text-emerald-400">${sPerS || '0'} S/S</span>
                                        <span class="text-neutral-700 text-[8px]">/</span>
                                        <span class="text-[8px] font-bold text-amber-500">${fPct || '0'}% Fl</span>
                                    </div>
                                ` : ''}
                            </div>
                            <div class="ml-2 shrink-0">
                                <span class="font-black ${isMe ? 'text-emerald-300' : 'text-white'}">${p.score.toLocaleString()}</span> <span class="text-[10px] text-neutral-500 uppercase tracking-widest">pts</span>
                            </div>
                            ${deleteBtnHtml}
                        </li>
                    `;
                }).join('');

                if (sticky) {
                    if (userRank > -1) {
                        document.getElementById('stickyRank').innerText = `#${userRank}`;
                        document.getElementById('stickyName').innerText = playerName;
                        document.getElementById('stickyScore').innerText = userScore.toLocaleString();
                        sticky.classList.remove('translate-y-full');
                    } else {
                        sticky.classList.add('translate-y-full');
                    }
                }
            } catch (e) {
                listEl.innerHTML = `<div class="text-center text-red-400 text-sm py-5">Error loading leaderboard.<br>Check your connection.</div>`;
            }
        }

        let isAdmin = false;

        function toggleAdminMode() {
            if (isAdmin) {
                isAdmin = false;
                alert("Admin Mode Disabled");
                loadLeaderboard();
                return;
            }
            const pw = prompt("Enter Admin Password:");
            if (pw === "ADMIN") {
                isAdmin = true;
                alert("Admin Mode Enabled");
                loadLeaderboard();
            } else if (pw !== null) {
                alert("Incorrect Password.");
            }
        }

        async function deleteRecord(rawDecodedName) {
            if (!isAdmin) return;
            if (!confirm("Are you sure you want to permanently delete this score from the global leaderboard?")) return;
            try {
                const url = `https://api.codetabs.com/v1/proxy?quest=http://dreamlo.com/lb/${DREAMLO_PRIVATE_KEY}/delete/${encodeURIComponent(rawDecodedName)}`;
                await fetch(url);
                loadLeaderboard();
            } catch (e) {
                alert("Failed to delete record: " + e.message);
            }
        }

        // -- LOGIC: AUDIO CHIME --
        let audioCtx = null;
        function initAudio() {
            try {
                if (!audioCtx) {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    if (AudioContext) {
                        audioCtx = new AudioContext();
                        const osc = audioCtx.createOscillator();
                        const gain = audioCtx.createGain();
                        gain.gain.value = 0;
                        osc.connect(gain);
                        gain.connect(audioCtx.destination);
                        osc.start();
                        osc.stop(audioCtx.currentTime + 0.1);
                    }
                }
            } catch (e) { }
        }

        // Pre-initialize audio engine on first interaction to remove latency
        function primeAudio() {
            if (typeof initAudio === 'function') initAudio();
            const silent = new Audio();
            silent.muted = true;
            silent.play().catch(() => {});
        }
        document.body.addEventListener('touchstart', primeAudio, { once: true });
        document.body.addEventListener('mousedown', primeAudio, { once: true });

        function playDing() {
            if (!audioCtx) return;
            try {
                [1046.50, 1318.51].forEach((freq, i) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.type = 'sine';
                    osc.frequency.value = freq;

                    const startTime = audioCtx.currentTime + (i * 0.15);
                    gain.gain.setValueAtTime(0, startTime);
                    gain.gain.linearRampToValueAtTime(0.5, startTime + 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 2);

                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.start(startTime);
                    osc.stop(startTime + 2);
                });
            } catch (e) { }
        }

        // -- LOGIC: REST TIMER --
        let restTimerInterval = null;
        let defaultRestSeconds = 120;
        let restTimeRemaining = 0;
        let restTimerTargetEpoch = 0;

        function formatTimerDisplay(secs) {
            const m = Math.floor(secs / 60);
            const s = secs % 60;
            return `${m}:${s.toString().padStart(2, '0')}`;
        }

        function adjRestTimer(delta) {
            if (restTimerInterval) {
                restTimerTargetEpoch += (delta * 1000);
                restTimeRemaining = Math.max(5, Math.ceil((restTimerTargetEpoch - Date.now()) / 1000));
            } else {
                defaultRestSeconds = Math.max(30, Math.min(900, defaultRestSeconds + delta));
            }
            updateRestTimerDisplay();
            
            // Secondary effects offloaded
            if ('vibrate' in navigator) navigator.vibrate(10);
            setTimeout(initAudio, 0); 
        }

        function updateRestTimerDisplay() {
            if (!DOM.timerText) return;
            const display = DOM.timerText;
            const pulse = DOM.timerPulse;
            const container = DOM.timerCard;
            const secs = restTimerInterval ? restTimeRemaining : defaultRestSeconds;
            
            const mins = Math.floor(secs / 60);
            const secondRemainder = secs % 60;
            const timeStr = `${mins}:${secondRemainder.toString().padStart(2, '0')}`;
            if (DOM.overlayTime) DOM.overlayTime.innerText = timeStr;

            if (display) {
                display.innerText = timeStr;
                
                if (restTimerInterval) {
                    display.classList.replace('text-neutral-400', 'text-emerald-400');
                    if (pulse) pulse.className = "w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse";
                    if (container) container.classList.add('border-emerald-500/50', 'shadow-emerald-500/10');
                } else {
                    display.classList.replace('text-emerald-400', 'text-neutral-400');
                    if (pulse) pulse.className = "w-1.5 h-1.5 rounded-full bg-neutral-700 shadow-[0_0_8px_rgba(16,185,129,0)] transition-all";
                    if (container) container.classList.remove('border-emerald-500/50', 'shadow-emerald-500/10');
                }
            }
        }

        function startRestTimer() {
            if (DOM.overlayMain) {
                DOM.overlayMain.classList.replace('hidden', 'flex');
                if (DOM.overlayFinished) DOM.overlayFinished.classList.replace('flex', 'hidden');
            }

            if (restTimerInterval) return;

            restTimeRemaining = defaultRestSeconds;
            restTimerTargetEpoch = Date.now() + (defaultRestSeconds * 1000);

            if ('vibrate' in navigator) navigator.vibrate(20);
            setTimeout(initAudio, 0);

            restTimerInterval = setInterval(() => {
                restTimeRemaining = Math.ceil((restTimerTargetEpoch - Date.now()) / 1000);
                if (restTimeRemaining <= 0) {
                    clearInterval(restTimerInterval);
                    restTimerInterval = null;
                    
                    if (DOM.timerPulse) DOM.timerPulse.className = "w-1.5 h-1.5 rounded-full bg-emerald-500";
                    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
                    playDing();
                    
                    if (DOM.overlayMain && !DOM.overlayMain.classList.contains('hidden') && DOM.overlayFinished) {
                        DOM.overlayFinished.classList.replace('hidden', 'flex');
                    }
                }
                updateRestTimerDisplay();
            }, 1000);
            updateRestTimerDisplay();
        }

        function cancelRestTimer() {
            if (restTimerInterval) {
                clearInterval(restTimerInterval);
                restTimerInterval = null;
            }
            if (DOM.overlayMain) DOM.overlayMain.classList.replace('flex', 'hidden');
            updateRestTimerDisplay();
        }



        // -- PWA SERVICE WORKER --
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').then(reg => {
                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // New version available, notify user or auto-reload
                                console.log('New content available; please refresh.');
                            }
                        });
                    });
                }).catch(console.error);
            });
            
            // Reload when the new service worker takes control
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!refreshing) {
                    refreshing = true;
                    window.location.reload();
                }
            });
        }

        async function forceHardRefresh() {
            try {
                if (typeof GDrive !== 'undefined' && GDrive.showLoadingOverlay) {
                    GDrive.showLoadingOverlay("Force Refreshing App...");
                }
            } catch (e) {}

            // Unregister all service workers
            if ('serviceWorker' in navigator) {
                try {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    for (let registration of registrations) {
                        await registration.unregister();
                    }
                } catch (e) {
                    console.error("Failed to unregister service worker:", e);
                }
            }
            // Clear all caches
            if ('caches' in window) {
                try {
                    const keys = await caches.keys();
                    for (let key of keys) {
                        await caches.delete(key);
                    }
                } catch (e) {
                    console.error("Failed to delete caches:", e);
                }
            }
            // Clear session storage and force reload from server
            try {
                sessionStorage.clear();
            } catch(e) {}
            window.location.reload(true);
        }

        // ==========================================
