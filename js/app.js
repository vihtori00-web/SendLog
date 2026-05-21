
        const APP_VERSION = 'v7.4.0';

        // =============================================
        // EARLY OAUTH REDIRECT INTERCEPTOR
        // Must run BEFORE anything else to catch tokens
        // from Google OAuth redirects immediately.
        // =============================================
        (function earlyOAuthIntercept() {
            try {
                const fullUrl = window.location.href || document.URL || '';
                const hashPart = (window.location.hash || '').replace(/^#\/?\??/, '');
                const searchPart = (window.location.search || '').substring(1);
                const combined = hashPart + '&' + searchPart;
                const params = new URLSearchParams(combined);
                const token = params.get('access_token');
                const expiresIn = params.get('expires_in');

                if (token) {
                    // Save token immediately to localStorage before anything can go wrong
                    localStorage.setItem('gdrive_access_token', token);
                    localStorage.setItem('gdrive_token_expires_at', String(Date.now() + (parseInt(expiresIn || '3600') * 1000)));
                    localStorage.setItem('gdrive_connected', 'true');
                    localStorage.setItem('gdrive_early_token', 'true');
                    localStorage.removeItem('gdrive_auth_pending');
                    // Clean URL immediately
                    window.history.replaceState(null, null, window.location.pathname);
                    console.log('[SendLog] Early OAuth intercept: token captured and saved.');
                }
            } catch (e) {
                console.error('[SendLog] Early OAuth intercept failed:', e);
            }
        })();

        const DOM = {
            sessionTimerStr: document.getElementById('sessionTimerDisplay'),
            sessionScoreStr: document.getElementById('sessionScoreDisplay'),
            sessionBtn: document.getElementById('btnSessionAction'),
            timerText: document.getElementById('btnTimerText'),
            timerPulse: document.getElementById('headerTimerPulse'),
            timerCard: document.getElementById('headerTimer'),
            overlayMain: document.getElementById('restOverlay'),
            overlayTime: document.getElementById('restOverlayTime'),
            overlayFinished: document.getElementById('restOverlayFinished')
        };

        function toggleSessionButtonUI(isActive) {
            if (!DOM.sessionBtn) return;
            if (isActive) {
                DOM.sessionBtn.innerText = "FINISH";
                DOM.sessionBtn.classList.replace('bg-emerald-500/20', 'bg-red-500/20');
                DOM.sessionBtn.classList.replace('text-emerald-400', 'text-red-400');
                DOM.sessionBtn.classList.replace('border-emerald-500/30', 'border-red-500/30');
            } else {
                DOM.sessionBtn.innerText = "START";
                DOM.sessionBtn.classList.replace('bg-red-500/20', 'bg-emerald-500/20');
                DOM.sessionBtn.classList.replace('text-red-400', 'text-emerald-400');
                DOM.sessionBtn.classList.replace('border-red-500/30', 'border-emerald-500/30');
            }
        }

        const fontGrades = [
            '<4', '4', '4+', '5', '5+', '6A', '6A+', '6B', '6B+',
            '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '7C+',
            '8A', '8A+', '8B', '8B+', '8C', '8C+', '9A'
        ];

        let maxGradeIndex = parseInt(localStorage.getItem('boulderMaxGradeIndex')) || 14;
        let currentGradeIndex = maxGradeIndex;
        let tries = 1;
        let isTop = false;
        let isFlash = false;
        let sessionScore = 0;
        let sessionClimbs = [];
        let climbIdCounter = 0;
        let selectedTags = [];
        let boulderHistory = JSON.parse(localStorage.getItem('boulderHistory')) || [];
        
        let tagsMigrated = false;
        boulderHistory.forEach(s => {
            if (s.climbs) {
                s.climbs.forEach(c => {
                    if (c.tags) {
                        const originalLength = c.tags.length;
                        c.tags = c.tags.filter(t => t !== 'overhang' && t !== 'comp');
                        if (c.tags.length !== originalLength) tagsMigrated = true;
                    }
                });
            }
        });
        if (tagsMigrated) {
            localStorage.setItem('boulderHistory', JSON.stringify(boulderHistory));
        }

        let boulderActiveSession = JSON.parse(localStorage.getItem('boulderActiveSession'));
        if (boulderActiveSession) {
            let activeMigrated = false;
            (boulderActiveSession.climbs || []).forEach(c => {
                if (c.tags) {
                    const originalLength = c.tags.length;
                    c.tags = c.tags.filter(t => t !== 'overhang' && t !== 'comp');
                    if (c.tags.length !== originalLength) activeMigrated = true;
                }
            });
            if (activeMigrated) {
                localStorage.setItem('boulderActiveSession', JSON.stringify(boulderActiveSession));
            }
        }

        const tagList = ['crimp', 'sloper', 'pinch', 'slab', 'dyno', 'board', 'technical', 'powerful'];

        function getSessionStats(session) {
            let sends = 0, flashes = 0, sumGrades = 0, sendCount = 0;
            if (session.climbs && session.climbs.length > 0) {
                session.climbs.forEach(c => {
                    if (c.statusText === 'Top' || c.statusText === 'Flash') {
                        sends++;
                        sendCount++;
                        sumGrades += fontGrades.indexOf(c.gradeStr);
                        if (c.statusText === 'Flash') flashes++;
                    }
                });
            }
            const avgGrade = sendCount > 0 ? fontGrades[Math.round(sumGrades / sendCount)] : '-';
            return { sends, flashes, sumGrades, sendCount, avgGrade };
        }

        function getHistoryStats(historyArray) {
            let totalPoints = 0, totalSends = 0, totalFlashes = 0, totalProjTries = 0;
            let totalDuration = 0, sumGrades = 0, totalSuccessfulClimbs = 0;
            let totalAllClimbs = 0;
            historyArray.forEach(s => {
                totalPoints += s.score || 0;
                totalDuration += s.duration || 0;
                if (s.climbs) {
                    s.climbs.forEach(c => {
                        totalAllClimbs++;
                        if (c.statusText === 'Top' || c.statusText === 'Flash') {
                            totalSends++;
                            totalSuccessfulClimbs++;
                            sumGrades += fontGrades.indexOf(c.gradeStr);
                            if (c.statusText === 'Flash') totalFlashes++;
                        }
                        if (c.statusText === 'Project') totalProjTries += c.tries || 0;
                    });
                }
            });
            const flashRate = totalAllClimbs > 0 ? Math.round((totalFlashes / totalAllClimbs) * 100) : 0;
            const sessionsWithTime = historyArray.filter(s => (s.duration || 0) > 0);
            const avgDurDec = sessionsWithTime.length > 0 ? (totalDuration / sessionsWithTime.length) : 0;
            const avgDur = formatDuration(Math.round(avgDurDec));
            const sessionsWithClimbs = historyArray.filter(s => s.climbs && s.climbs.length > 0);
            const avgSends = sessionsWithClimbs.length > 0 ? (totalSends / sessionsWithClimbs.length).toFixed(1) : '0';
            const avgGradeScore = totalSuccessfulClimbs > 0 ? (sumGrades / totalSuccessfulClimbs) : 0;
            const avgGrade = totalSuccessfulClimbs > 0 ? fontGrades[Math.round(avgGradeScore)] : '-';
            return { totalPoints, totalSends, totalFlashes, totalProjTries, totalDuration, sumGrades, totalSuccessfulClimbs, flashRate, avgDur, avgSends, avgGrade, avgGradeScore };
        }

        function getPersonalRecords(historyArray) {
            let bestScore = 0, highestGradeIdx = -1, mostSends = 0, longestDuration = 0;
            historyArray.forEach(s => {
                if (s.score > bestScore) bestScore = s.score;
                if ((s.duration || 0) > longestDuration) longestDuration = s.duration;
                let sends = 0;
                (s.climbs || []).forEach(c => {
                    if (c.statusText === 'Top' || c.statusText === 'Flash') {
                        sends++;
                        const gIdx = fontGrades.indexOf(c.gradeStr);
                        if (gIdx > highestGradeIdx) highestGradeIdx = gIdx;
                    }
                });
                if (sends > mostSends) mostSends = sends;
            });
            return {
                bestScore,
                highestGrade: highestGradeIdx >= 0 ? fontGrades[highestGradeIdx] : '-',
                mostSends: mostSends || '-',
                longestSession: longestDuration > 0 ? formatDuration(longestDuration) : '-'
            };
        }

        function getStreakData() {
            const sessionDates = [];
            boulderHistory.forEach(s => {
                if (s.timestamp) {
                    const d = new Date(s.timestamp);
                    d.setHours(0, 0, 0, 0);
                    const key = d.getTime();
                    if (!sessionDates.includes(key)) sessionDates.push(key);
                }
            });
            sessionDates.sort((a, b) => b - a); // most recent first

            if (sessionDates.length === 0) return { current: 0, longest: 0 };

            const DAY_MS = 86400000;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayMs = today.getTime();

            // Current streak: most recent session must be within 2 days of today
            let current = 0;
            if ((todayMs - sessionDates[0]) / DAY_MS <= 2) {
                current = 1;
                for (let i = 1; i < sessionDates.length; i++) {
                    if ((sessionDates[i - 1] - sessionDates[i]) / DAY_MS <= 2) {
                        current++;
                    } else break;
                }
            }

            // Longest streak ever
            let longest = 1, chain = 1;
            for (let i = 1; i < sessionDates.length; i++) {
                if ((sessionDates[i - 1] - sessionDates[i]) / DAY_MS <= 2) {
                    chain++;
                } else {
                    chain = 1;
                }
                if (chain > longest) longest = chain;
            }

            return { current, longest };
        }

        let heatmapCurrentMonthOffset = 0; // 0 is current month, -1 is last month, etc.

        function renderCalendarHeatmap() {
            const container = document.getElementById('heatmapGrid');
            const label = document.getElementById('heatmapMonthLabel');
            if (!container || !label) return;

            // Gather climb counts per day
            const dateCounts = {};
            boulderHistory.forEach(s => {
                if (s.timestamp) {
                    const d = new Date(s.timestamp);
                    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    dateCounts[key] = (dateCounts[key] || 0) + (s.climbs || []).length;
                }
            });

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Determine the target month to display based on the offset
            const targetDate = new Date();
            targetDate.setMonth(targetDate.getMonth() + heatmapCurrentMonthOffset);
            
            label.innerText = targetDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

            const year = targetDate.getFullYear();
            const month = targetDate.getMonth();

            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            
            // Adjust to Monday-start
            let firstDayIndex = firstDay.getDay() - 1;
            if (firstDayIndex < 0) firstDayIndex = 6; // Sunday becomes 6
            const daysInMonth = lastDay.getDate();

            let html = '';

            // Empty cells before the 1st
            for (let i = 0; i < firstDayIndex; i++) {
                html += `<div class="aspect-square rounded-sm bg-transparent"></div>`;
            }

            // Days of the month
            for (let day = 1; day <= daysInMonth; day++) {
                const cellDate = new Date(year, month, day);
                const key = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const count = dateCounts[key] || 0;
                const isFuture = cellDate > today;

                let bg = 'bg-neutral-800/40 border border-neutral-800/50';
                let txt = 'text-neutral-600';
                
                if (isFuture) {
                    bg = 'bg-transparent border border-dashed border-neutral-800/30';
                    txt = 'text-neutral-700/50';
                } else if (count >= 7) {
                    bg = 'bg-emerald-400 border border-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.3)]';
                    txt = 'text-black font-black';
                } else if (count >= 4) {
                    bg = 'bg-emerald-500/70 border border-emerald-400/50';
                    txt = 'text-black font-bold';
                } else if (count >= 1) {
                    bg = 'bg-emerald-700/60 border border-emerald-600/50';
                    txt = 'text-white/80 font-bold';
                }

                // Highlight today specifically if it's the current month
                const isToday = cellDate.getTime() === today.getTime();
                if (isToday && count === 0) {
                     bg += ' border-neutral-500/50 ring-1 ring-neutral-500/50';
                }

                let actionAttr = '';
                let cursorClass = count > 0 ? 'cursor-pointer active:scale-95' : 'pointer-events-none';
                if (count > 0) {
                    actionAttr = `onclick="openHeatmapSession('${key}')"`;
                }

                html += `<div ${actionAttr} class="aspect-square rounded-md ${bg} flex items-center justify-center text-[10px] ${txt} transition-all relative overflow-hidden ${cursorClass}" title="${key}: ${count} climbs">
                            <span class="z-10">${day}</span>
                            ${count > 0 ? `<div class="absolute bottom-0 left-0 right-0 h-1 bg-black/10"></div>` : ''}
                         </div>`;
            }

            // Empty cells to complete the grid (usually up to 42 cells total for a 6-row grid)
            const totalCells = firstDayIndex + daysInMonth;
            const remaining = (Math.ceil(totalCells / 7) * 7) - totalCells;
            for (let i = 0; i < remaining; i++) {
                html += `<div class="aspect-square rounded-sm bg-transparent"></div>`;
            }

            container.innerHTML = html;

        }
        
        function changeHeatmapMonth(delta) {
            heatmapCurrentMonthOffset += delta;
            
            // Prevent going into future months beyond current month
            if (heatmapCurrentMonthOffset > 0) heatmapCurrentMonthOffset = 0;
            
            // Re-render and add a small haptic bump
            renderCalendarHeatmap();
            if ('vibrate' in navigator) navigator.vibrate(10);
        }

        function openHeatmapSession(dateStr) {
            // Find the most recent session for this specific date
            for (let i = boulderHistory.length - 1; i >= 0; i--) {
                const s = boulderHistory[i];
                if (s.timestamp) {
                    const d = new Date(s.timestamp);
                    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    if (key === dateStr) {
                        openSessionDetail(i, true);
                        return;
                    }
                }
            }
        }

        function updateComparisonDeltas() {
            const ids = ['statFlashRateDelta', 'statAvgSendsDelta', 'statTotalPointsDelta'];
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.classList.add('hidden'); el.innerText = ''; }
            });

            if (historyViewMode === 'ALL') return;

            const now = new Date();
            let currentFilter, prevFilter;

            if (historyViewMode === 'WEEK') {
                const startOfWeek = getStartOfWeek();
                const prevWeekStart = startOfWeek - 7 * 86400000;
                currentFilter = s => (s.timestamp || 0) >= startOfWeek;
                prevFilter = s => (s.timestamp || 0) >= prevWeekStart && (s.timestamp || 0) < startOfWeek;
            } else {
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
                const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
                currentFilter = s => (s.timestamp || 0) >= startOfMonth;
                prevFilter = s => (s.timestamp || 0) >= prevMonthStart && (s.timestamp || 0) < startOfMonth;
            }

            const current = getHistoryStats(boulderHistory.filter(currentFilter));
            const prev = getHistoryStats(boulderHistory.filter(prevFilter));

            function showDelta(elId, curVal, prevVal, suffix = '') {
                const el = document.getElementById(elId);
                if (!el) return;
                if (prevVal === 0 && curVal === 0) return;
                const diff = curVal - prevVal;
                if (diff === 0) return;
                const sign = diff > 0 ? 'â†‘' : 'â†“';
                const color = diff > 0 ? 'text-emerald-400' : 'text-red-400';
                el.className = `text-[8px] font-bold mt-0.5 ${color}`;
                el.classList.remove('hidden');
                el.innerText = `${sign} ${Math.abs(diff).toFixed(suffix === '%' ? 0 : 1)}${suffix}`;
            }

            showDelta('statFlashRateDelta', current.flashRate, prev.flashRate, '%');
            showDelta('statAvgSendsDelta', parseFloat(current.avgSends), parseFloat(prev.avgSends));
            showDelta('statTotalPointsDelta', current.totalPoints, prev.totalPoints);
        }

        function renderTags() {
            try {
                const container = document.getElementById('tagContainer');
                if (!container) return;
                container.innerHTML = tagList.map(tag => `
                    <button onclick="toggleTag('${tag}')" id="tag-${tag}"
                        style="width: calc(25% - 0.5rem); min-width: 65px;"
                        class="py-2.5 rounded-xl border border-neutral-800 text-[10px] font-black uppercase tracking-wider transition-all truncate px-1
                        ${selectedTags.includes(tag) ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-neutral-900 text-neutral-500 border-neutral-800'}">
                        ${tag}
                    </button>
                `).join('');
            } catch (e) { console.error("renderTags failed:", e); }
        }

        // --- ACHIEVEMENTS & DATA ---
        const achievementDefinitions = [
            { id: "first_blood", name: "First Blood", desc: "Log your first climb.", icon: "ðŸ©¸" },
            { id: "the_flash", name: "The Flash", desc: "Flash a climb at your Max Grade.", icon: "âš¡" },
            { id: "crusher", name: "Crusher", desc: "Send a climb above your Max Grade.", icon: "ðŸ’¥" },
            { id: "dedication", name: "Dedication", desc: "Top a route after 5+ attempts.", icon: "ðŸ”¥" },
            { id: "double_digits", name: "Double Digits", desc: "Get 10+ sends in a single session.", icon: "ðŸ”Ÿ" },
            { id: "volume_day", name: "Volume Day", desc: "Log 15+ climbs in a session.", icon: "ðŸ’ª" },
            { id: "hat_trick", name: "Hat Trick", desc: "Send 3 different grades in one session.", icon: "ðŸŽ©" },
            { id: "all_rounder", name: "All-Rounder", desc: "Use all 8 style tags in one session.", icon: "ðŸŽ¯" },
            { id: "centurion", name: "Centurion", desc: "Reach 1,000 Total Points.", icon: "ðŸ‘‘" },
            { id: "consistency", name: "Consistency", desc: "Complete 5 sessions.", icon: "ðŸ“…" },
            { id: "marathon", name: "Marathon", desc: "Climb for over 3 hours.", icon: "â±ï¸" },
            { id: "sixty_seven", name: "The 67 Beers", desc: "Beat the secret minigame.", icon: "ðŸº" }
        ];

        let achievementsUnlocked = JSON.parse(localStorage.getItem('boulderAchievements')) || [];

        function renderAchievements() {
            const list = document.getElementById('achievementsList');
            if(!list) return;
            document.getElementById('achievementCount').innerText = `${achievementsUnlocked.length}/${achievementDefinitions.length}`;
            list.innerHTML = achievementDefinitions.map(def => {
                const isUnlocked = achievementsUnlocked.includes(def.id);
                const bgClass = isUnlocked ? "bg-emerald-900/40 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "bg-neutral-900/50 border-neutral-800 opacity-40 grayscale";
                const textClass = isUnlocked ? "text-emerald-400" : "text-neutral-500";
                return `
                <div class="${bgClass} border rounded-2xl p-3 flex flex-col items-center text-center transition-all duration-300">
                    <div class="text-3xl mb-1">${def.icon}</div>
                    <h4 class="text-[11px] font-black text-white uppercase tracking-wider mb-0.5">${def.name}</h4>
                    <p class="text-[9px] ${textClass} leading-tight">${def.desc}</p>
                </div>`;
            }).join('');
        }

        function unlockAchievement(id) {
            if (achievementsUnlocked.includes(id)) return;
            achievementsUnlocked.push(id);
            localStorage.setItem('boulderAchievements', JSON.stringify(achievementsUnlocked));
            
            if ('vibrate' in navigator) navigator.vibrate([100, 50, 100, 50, 200]);
            try { playDing(); } catch(e){}
            
            const def = achievementDefinitions.find(d => d.id === id);
            const toast = document.getElementById('toastAlert');
            if(toast) {
                document.getElementById('toastTitle').innerText = def.name;
                confetti({ particleCount: 200, spread: 100, origin: { y: 0.1 }, zIndex: 300, colors: ['#10b981', '#fbbf24', '#ffffff'] });
                toast.classList.remove('-translate-y-[150%]');
                setTimeout(() => toast.classList.add('-translate-y-[150%]'), 4000);
            }
            renderAchievements();
        }

        function exportData() {
            const data = {
                history: boulderHistory,
                maxGradeIndex: localStorage.getItem('boulderMaxGradeIndex'),
                playerName: localStorage.getItem('boulderPlayerName'),
                achievements: achievementsUnlocked
            };
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
            const node = document.createElement('a');
            node.setAttribute("href", dataStr);
            node.setAttribute("download", "sendlog_backup.json");
            document.body.appendChild(node);
            node.click();
            node.remove();
        }

        function importData(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    if (data.history) {
                        localStorage.setItem('boulderHistory', JSON.stringify(data.history));
                        boulderHistory = data.history;
                    }
                     if (data.maxGradeIndex !== undefined) localStorage.setItem('boulderMaxGradeIndex', data.maxGradeIndex);
                     if (data.playerName) localStorage.setItem('boulderPlayerName', data.playerName);
                     if (data.achievements) localStorage.setItem('boulderAchievements', JSON.stringify(data.achievements));
                    window.location.reload();
                } catch (err) { alert("Failed to parse Backup file."); }
            };
            reader.readAsText(file);
        }

        function openSettings(push = true) { 
            document.getElementById('settingsOverlay').classList.replace('hidden', 'flex'); 
            renderAchievements(); 
            renderMaxGradeSelect();
            if (push) history.pushState({ overlay: 'settings' }, '', '#settings');
        }

        function renderMaxGradeSelect() {
            const select = document.getElementById('vMax');
            if (!select) return;
            select.innerHTML = fontGrades.map((g, i) => `<option value="${i}" ${i == maxGradeIndex ? 'selected' : ''}>${g}</option>`).join('');
            select.onchange = (e) => {
                maxGradeIndex = parseInt(e.target.value);
                localStorage.setItem('boulderMaxGradeIndex', maxGradeIndex);
                if ('vibrate' in navigator) navigator.vibrate(10);
                updateAnalytics(); // Update stats if max grade baseline changes (for some achievements)
            };
        }
        function closeSettings(event, pop = true) { 
            document.getElementById('settingsOverlay').classList.replace('flex', 'hidden'); 
            if (pop) history.back();
        }

        // Session Timer
        let sessionStartTime = null;
        let sessionTimerInterval = null;

        function handleSessionAction() {
            if (!sessionStartTime) {
                startSession();
            } else {
                endSession();
            }
        }

        function startSession() {
            if (sessionStartTime) return; 
            sessionStartTime = Date.now();
            saveActiveSession();
            DOM.sessionTimerStr.classList.remove('hidden');
            DOM.sessionScoreStr.classList.add('animate-score-pulse');
            sessionTimerInterval = setInterval(updateSessionTimer, 1000);
            updateSessionTimer();
            
            toggleSessionButtonUI(true);
            if ('vibrate' in navigator) navigator.vibrate([10, 30, 10]);
        }

        function saveActiveSession() {
            try {
                const activeSession = {
                    sessionStartTime,
                    sessionScore,
                    sessionClimbs
                };
                localStorage.setItem('boulderActiveSession', JSON.stringify(activeSession));
            } catch (e) {
                console.error("Failed to save session:", e);
            }
        }

        function loadActiveSession() {
            try {
                const data = localStorage.getItem('boulderActiveSession');
                if (!data) return;
                const active = JSON.parse(data);
                if (active.sessionStartTime || (active.sessionClimbs && active.sessionClimbs.length > 0)) {
                    sessionStartTime = active.sessionStartTime || Date.now();
                    sessionScore = active.sessionScore || 0;
                    sessionClimbs = active.sessionClimbs || [];
                    
                    // Restore climbIdCounter to avoid collisions 
                    if (sessionClimbs.length > 0) {
                        climbIdCounter = Math.max(...sessionClimbs.map(c => c.id)) + 1;
                    }
                    
                    if (sessionStartTime) {
                        DOM.sessionTimerStr.classList.remove('hidden');
                        DOM.sessionScoreStr.classList.add('animate-score-pulse');
                        if (sessionTimerInterval) clearInterval(sessionTimerInterval);
                        sessionTimerInterval = setInterval(updateSessionTimer, 1000);
                        updateSessionTimer();
                        toggleSessionButtonUI(true);
                    }
                    
                    console.log(`Restored session with ${sessionClimbs.length} climbs and score ${sessionScore}`);
                    renderSessionList();
                    updateAnalytics();
                }
            } catch (e) {
                console.error("Failed to load session:", e);
            }
        }

        function formatDuration(seconds) {
            if (!seconds || seconds < 1) return "";
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            if (h > 0) return `${h}h ${m}m`;
            return `${m}m`;
        }

        function updateSessionTimer() {
            if (!sessionStartTime) return;
            const now = Date.now();
            const diff = Math.floor((now - sessionStartTime) / 1000);
            const h = Math.floor(diff / 3600);
            const m = Math.floor((diff % 3600) / 60);
            const s = diff % 60;
            const hStr = h > 0 ? h.toString().padStart(2, '0') + ':' : '';
            const mStr = m.toString().padStart(2, '0') + ':';
            const sStr = s.toString().padStart(2, '0');
            DOM.sessionTimerStr.innerText = hStr + mStr + sStr;
        }

        // Player Name for Leaderboard
        let playerName = localStorage.getItem('boulderPlayerName') || '';

        // Dreamlo API Configuration
        const DREAMLO_PUBLIC_KEY = "69bd7fc18f40bb2f60a8dc61";
        const DREAMLO_PRIVATE_KEY = "vfdYvMLvmEKb5Le5LgzVNAqTyA8CgKgkeIDHgEFN832w";

        const elGrade = document.getElementById('displayGrade');
        const elTries = document.getElementById('displayTries');
        const btnTop = document.getElementById('btnTop');
        const btnFlash = document.getElementById('btnFlash');
        const btnSubmit = document.getElementById('mainAddButton');
        const selectMax = document.getElementById('vMax');

        renderMaxGradeSelect();
        renderTags();

        elGrade.innerText = fontGrades[currentGradeIndex];

        // -- LOGIC: INPUT --
        function adjGrade(dir) {
            if ('vibrate' in navigator) navigator.vibrate(15);
            currentGradeIndex = Math.max(0, Math.min(fontGrades.length - 1, currentGradeIndex + dir));
            elGrade.innerText = fontGrades[currentGradeIndex];
        }

        function adjTries(dir) {
            if ('vibrate' in navigator) navigator.vibrate(15);
            if (isFlash) return;
            tries = Math.max(1, tries + dir);
            elTries.innerText = tries;
        }

        function toggleTop() {
            if ('vibrate' in navigator) navigator.vibrate(15);
            isTop = !isTop;
            if (!isTop) { isFlash = false; updateUI(); }
            updateUI();
        }

        function toggleFlash() {
            if ('vibrate' in navigator) navigator.vibrate(15);
            isFlash = !isFlash;
            if (isFlash) {
                isTop = true;
                tries = 1;
                elTries.innerText = 1;
            }
            updateUI();
        }

        function updateUI() {
            const base = "flex-1 rounded-[1.8rem] border text-sm font-black uppercase tracking-[0.15em] flex items-center justify-center transition-all haptic-feedback";
            
            btnTop.className = isTop
                ? `${base} bg-blue-500/20 text-blue-400 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.1)]`
                : `${base} bg-neutral-900 border-neutral-800 text-neutral-500`;

            btnFlash.className = isFlash
                ? `${base} bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.1)]`
                : `${base} bg-neutral-900 border-neutral-800 text-neutral-500`;
        }

        function toggleTag(tag) {
            if ('vibrate' in navigator) navigator.vibrate(10);
            const idx = selectedTags.indexOf(tag);
            if (idx > -1) {
                selectedTags.splice(idx, 1);
            } else {
                selectedTags.push(tag);
            }
            renderTags();
        }

        const tryPtsMap   = [1, 2, 3, 5, 8, 12, 18, 25];
        const topBonusMap = [3, 5, 8, 12, 22, 35, 55, 80];
        const flashBonusMap = [2, 3, 5, 8, 15, 25, 40, 60];

        function calculatePoints(delta, flashed, topped, attempts) {
            // Points mapping based on difficulty relative to max grade (delta)
            // Indices: -Infinity..-5, -4, -3, -2, -1, 0, 1, 2+
            const getMapValue = (valArray, d) => {
                const idx = d <= -5 ? 0 : d >= 2 ? 7 : d + 5;
                return valArray[idx];
            };

            const tryPts = getMapValue(tryPtsMap, delta);
            const topBonus = getMapValue(topBonusMap, delta);
            const flashBonus = getMapValue(flashBonusMap, delta);

            if (flashed) return tryPts + topBonus + flashBonus;
            if (topped)  return (attempts * tryPts) + topBonus;
            return Math.min(attempts, 8) * tryPts;
        }

        function logClimb() {
            if ('vibrate' in navigator) navigator.vibrate(50);
            const delta = currentGradeIndex - maxGradeIndex;
            const points = calculatePoints(delta, isFlash, isTop, tries);

            let statusText = "Project";
            let color = "text-neutral-400";
            if (isFlash) { statusText = "Flash"; color = "text-amber-400"; }
            else if (isTop) { statusText = "Top"; color = "text-blue-400"; }

            // ACHIEVEMENT CHECKS
            if (isTop || isFlash) {
                unlockAchievement('first_blood');
                if (isFlash && delta === 0) unlockAchievement('the_flash');
                if (delta > 0) unlockAchievement('crusher');
                if (tries >= 5) unlockAchievement('dedication');
                if (getTotalScore() + points >= 1000) unlockAchievement('centurion');

                if (currentGradeIndex > maxGradeIndex) {
                    maxGradeIndex = currentGradeIndex;
                    selectMax.value = maxGradeIndex;
                    localStorage.setItem('boulderMaxGradeIndex', maxGradeIndex);
                    
                    // Cool animation for new max grade
                    confetti({ particleCount: 300, spread: 160, origin: { y: 0.5 }, startVelocity: 45, colors: ['#ff0000', '#00ff00', '#3b82f6', '#fbbf24', '#10b981'] });
                    const displayGradeEl = document.getElementById('displayGrade');
                    displayGradeEl.classList.add('scale-150', 'text-amber-400', 'drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]');
                    setTimeout(() => {
                        displayGradeEl.classList.remove('scale-150', 'text-amber-400', 'drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]');
                    }, 1200);
                } else if (delta === 0) {
                    confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 }, colors: ['#10b981'] });
                }
            }

            sessionScore += points;

            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

            sessionClimbs.unshift({
                id: climbIdCounter++,
                gradeStr: fontGrades[currentGradeIndex],
                statusText, color, tries, points,
                time: timeStr,
                tags: [...selectedTags]
            });

            if (!sessionStartTime) {
                startSession();
            }
            if (sessionClimbs.length >= 15) unlockAchievement('volume_day');

            // Check session-based achievements after adding climb
            const sendsInSession = sessionClimbs.filter(c => c.statusText === 'Top' || c.statusText === 'Flash').length;
            if (sendsInSession >= 10) unlockAchievement('double_digits');

            const uniqueSendGrades = new Set(sessionClimbs.filter(c => c.statusText === 'Top' || c.statusText === 'Flash').map(c => c.gradeStr));
            if (uniqueSendGrades.size >= 3) unlockAchievement('hat_trick');

            const allSessionTags = new Set(sessionClimbs.flatMap(c => c.tags || []));
            if (allSessionTags.size >= 8) unlockAchievement('all_rounder');

            renderSessionList();
            saveActiveSession();
            btnSubmit.innerText = `+${points} ADDED`;
            btnSubmit.classList.add('bg-emerald-400', 'text-black', 'border-emerald-400');

            setTimeout(() => {
                btnSubmit.innerText = `LOG CLIMB`;
                btnSubmit.classList.remove('bg-emerald-400', 'text-black', 'border-emerald-400');
            }, 800);

            selectedTags = [];
            updateUI();
            renderTags();
        }

        // -- LOGIC: RENDER & DELETE SESSION CLIMBS --
        function renderSessionList() {
            const listEl = document.getElementById('sessionList');
            document.getElementById('sessionScoreDisplay').innerText = sessionScore;

            if (sessionClimbs.length === 0) {
                listEl.innerHTML = '<li class="text-neutral-500 text-center mt-10 text-sm">No climbs logged yet.</li>';
                return;
            }

            listEl.innerHTML = sessionClimbs.map(c => `
                <li class="flex justify-between items-center p-2.5 bg-neutral-800/50 rounded-xl border border-neutral-700/30">
                    <div class="flex items-center gap-3">
                        <div class="flex flex-col items-center justify-center w-8">
                            <span class="text-lg font-black leading-tight">${c.gradeStr}</span>
                            ${c.time ? `<span class="text-[8px] text-neutral-500 -mt-1 tracking-tighter">${c.time}</span>` : ''}
                        </div>
                        <div class="flex flex-col">
                            <span class="${c.color} text-[11px] font-bold uppercase tracking-wider">${c.statusText}</span>
                            <span class="text-neutral-500 text-[9px]">${c.tries} Attempt${c.tries > 1 ? 's' : ''}</span>
                            ${c.tags && c.tags.length > 0 ? `<div class="flex gap-1 mt-1 flex-wrap">${c.tags.map(t => `<span class="bg-neutral-800 text-neutral-400 border border-neutral-700 text-[8px] uppercase px-1.5 py-0.5 rounded">${t}</span>`).join('')}</div>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-emerald-400 font-bold text-sm">+${c.points} pts</span>
                        <button onclick="removeClimb(${c.id})" class="text-red-500/40 hover:text-red-500 active:scale-90 transition p-2 -mr-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </button>
                    </div>
                </li>
            `).join('');
        }

        function removeClimb(id) {
            const index = sessionClimbs.findIndex(c => c.id === id);
            if (index > -1) {
                sessionScore -= sessionClimbs[index].points;
                sessionClimbs.splice(index, 1);
                renderSessionList();
                saveActiveSession();
            }
        }

        function endSession() {
            if (sessionClimbs.length === 0) {
                if (!confirm("You haven't logged any climbs. End session with 0 points?")) {
                    return;
                }
            }

            const durationSeconds = Math.floor((Date.now() - sessionStartTime) / 1000);
            boulderHistory.push({
                date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
                timestamp: Date.now(),
                score: sessionScore,
                duration: durationSeconds,
                climbs: [...sessionClimbs]
            });
            localStorage.setItem('boulderHistory', JSON.stringify(boulderHistory));
            localStorage.removeItem('boulderActiveSession');

            if (boulderHistory.length >= 5) unlockAchievement('consistency');

            // Calculate Summary Stats
            let bestScore = -1;
            let bestName = "-";
            sessionClimbs.forEach(c => {
                if (c.points > bestScore) {
                    bestScore = c.points;
                    bestName = c.gradeStr || "-";
                }
            });
            if (bestScore === -1 && sessionClimbs.length > 0) bestName = sessionClimbs[0].gradeStr || "V?";

            const durationMinutes = Math.round(durationSeconds / 60);

            // Populate Summary Modal
            document.getElementById('summaryScore').innerText = sessionScore;
            document.getElementById('summaryTime').innerText = durationMinutes + "m";
            document.getElementById('summaryClimbs').innerText = sessionClimbs.length;
            document.getElementById('summaryBest').innerText = bestName;
            document.getElementById('summaryDate').innerText = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

            // Show Summary Modal
            document.getElementById('sessionSummaryOverlay').classList.replace('hidden', 'flex');

            // Confetti!
            if (typeof confetti === 'function') {
                confetti({
                    particleCount: 150,
                    spread: 80,
                    origin: { y: 0.6 },
                    colors: ['#10b981', '#06b6d4', '#fbbf24'],
                    zIndex: 200
                });
            }
        }

        function closeSessionSummary() {
            document.getElementById('sessionSummaryOverlay').classList.replace('flex', 'hidden');

            if (sessionTimerInterval) {
                clearInterval(sessionTimerInterval);
                sessionTimerInterval = null;
            }
            sessionStartTime = null;
            DOM.sessionScoreStr.classList.remove('animate-score-pulse');
            if (DOM.sessionTimerStr) {
                DOM.sessionTimerStr.classList.add('hidden');
                DOM.sessionTimerStr.innerText = "00:00:00";
            }
            
            toggleSessionButtonUI(false);
            if ('vibrate' in navigator) navigator.vibrate(30);

            sessionScore = 0; sessionClimbs = [];
            renderSessionList();
            updateAnalytics();
            renderHistoryList();
            switchTab('history');
            triggerMilestoneBackup();
        }

        function switchTab(tabId, push = true) {
            document.getElementById(`page-${tabId}`).scrollIntoView({ behavior: 'smooth', inline: 'start' });
            if (push) {
                history.pushState({ tab: tabId }, '', '#' + tabId);
                if ('vibrate' in navigator) navigator.vibrate(5);
            }
        }

        function toggleHistorySheet() {
            const sheet = document.getElementById('sessionHistorySheet');
            if(!sheet) return;
            const isClosed = sheet.classList.contains('translate-y-[calc(100%-4rem)]');
            
            if (isClosed) {
                sheet.classList.remove('translate-y-[calc(100%-4rem)]');
                sheet.classList.add('translate-y-0');
                if ('vibrate' in navigator) navigator.vibrate(10);
            } else {
                sheet.classList.add('translate-y-[calc(100%-4rem)]');
                sheet.classList.remove('translate-y-0');
            }
        }

        const tabObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const tabId = entry.target.id.replace('page-', '');
                    
                    // Don't push state on every intersection (e.g. during manual scroll)
                    // unless we want to support scroll-based history (usually too noisy).
                    // We'll just update active nav.
                    
                    ['log', 'session', 'history', 'leaderboard'].forEach(id => {
                        const navEl = document.getElementById(`nav-${id}`);
                        if(navEl) navEl.classList.replace('text-emerald-500', 'text-neutral-500');
                    });
                    const activeNav = document.getElementById(`nav-${tabId}`);
                    if(activeNav) activeNav.classList.replace('text-neutral-500', 'text-emerald-500');
                    
                    if (tabId === 'log') {
                        renderTags();
                    }
                    if (tabId === 'leaderboard') {
                        updateLeaderboardUI();
                        loadLeaderboard();
                    }
                }
            });
        }, { threshold: 0.6 });

        window.addEventListener('popstate', (event) => {
            const state = event.state;
            
            // Close all overlays first by default (only if they are not the target destination)
            const settingsOverlay = document.getElementById('settingsOverlay');
            if (settingsOverlay && settingsOverlay.classList.contains('flex')) {
                if (!state || state.overlay !== 'settings') {
                    settingsOverlay.classList.replace('flex', 'hidden'); 
                }
            }
            
            const sessionOverlay = document.getElementById('sessionDetailOverlay');
            if (sessionOverlay && sessionOverlay.classList.contains('flex')) {
                if (!state || state.overlay !== 'sessionDetail') {
                    const sheet = document.getElementById('sessionDetailSheet');
                    sheet.style.transform = 'translateY(100%)';
                    setTimeout(() => sessionOverlay.classList.replace('flex', 'hidden'), 300);
                }
            }

            const editOverlay = document.getElementById('editSessionOverlay');
            if (editOverlay && editOverlay.classList.contains('flex')) {
                if (!state || state.overlay !== 'editSession') {
                    editOverlay.classList.replace('flex', 'hidden');
                }
            }
            
            if (state && state.overlay) {
                if (state.overlay === 'settings') openSettings(false);
                if (state.overlay === 'sessionDetail') openSessionDetail(state.index, false);
                if (state.overlay === 'editSession') openEditSession(state.index, false);
            } else if (state && state.tab) {
                switchTab(state.tab, false);
            } else {
                // If we hit back and there's no state, we might be at the browser's initial entry.
                // To prevent gray screen, we force 'log' view and push it back to the history if possible.
                switchTab('log', false);
                if (!state) history.replaceState({ tab: 'log' }, '', '#log');
            }
        });

        // Initialize first state
        if (!history.state) {
            history.replaceState({ tab: 'log' }, '', '#log');
        } else if (history.state.tab) {
            switchTab(history.state.tab, false);
        }

        setTimeout(() => {
            ['log', 'session', 'history', 'leaderboard'].forEach(id => {
                const el = document.getElementById(`page-${id}`);
                if(el) tabObserver.observe(el);
            });
        }, 100);

