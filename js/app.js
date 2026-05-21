
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
            if (type === 'primary') {
                document.getElementById('primarySelDropdown').classList.toggle('hidden');
                document.getElementById('secondarySelDropdown').classList.add('hidden');
            } else {
                document.getElementById('secondarySelDropdown').classList.toggle('hidden');
                document.getElementById('primarySelDropdown').classList.add('hidden');
            }
        }

        function selectChartMetric(type, metric) {
            if (type === 'primary') {
                activeTrendMetric = metric;
                if (activeTrendMetric === activeTrendSecondary) {
                    activeTrendSecondary = activeTrendMetric === 'avg_grade' ? 'score' : 'avg_grade';
                }
            } else {
                activeTrendSecondary = metric;
                if (activeTrendSecondary === activeTrendMetric && activeTrendSecondary !== 'none') {
                    activeTrendMetric = activeTrendSecondary === 'avg_grade' ? 'score' : 'avg_grade';
                }
            }
            
            document.getElementById('primarySelDropdown').classList.add('hidden');
            document.getElementById('secondarySelDropdown').classList.add('hidden');
            
            updateSelectorButtonsUI();
            updateAnalytics();
        }

        function updateSelectorButtonsUI() {
            const pBtn = document.getElementById('primarySelBtn');
            const pText = document.getElementById('primarySelText');
            if (pBtn && pText) {
                const names = {
                    score: 'Score', sends: 'Sends', avg_grade: 'Avg Grade',
                    flash_pct: 'Flash %', projects: 'Proj Tries', duration: 'Duration'
                };
                pText.innerText = names[activeTrendMetric] || 'Score';
                
                pBtn.classList.remove(
                    'border-emerald-500/60', 'text-emerald-400',
                    'border-purple-500/60', 'text-purple-400',
                    'border-amber-500/60', 'text-amber-400',
                    'border-orange-500/60', 'text-orange-400',
                    'border-blue-500/60', 'text-blue-400',
                    'border-neutral-800', 'text-neutral-400'
                );
                
                const classes = {
                    score: ['border-emerald-500/60', 'text-emerald-400'],
                    sends: ['border-emerald-500/60', 'text-emerald-400'],
                    avg_grade: ['border-purple-500/60', 'text-purple-400'],
                    flash_pct: ['border-amber-500/60', 'text-amber-400'],
                    projects: ['border-orange-500/60', 'text-orange-400'],
                    duration: ['border-blue-500/60', 'text-blue-400']
                };
                const activeClasses = classes[activeTrendMetric] || ['border-neutral-800', 'text-neutral-400'];
                activeClasses.forEach(cls => pBtn.classList.add(cls));
            }

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
            const pWrap = document.getElementById('primarySelectorWrapper');
            const sWrap = document.getElementById('secondarySelectorWrapper');
            if (pWrap && !pWrap.contains(e.target)) {
                const drop = document.getElementById('primarySelDropdown');
                if (drop) drop.classList.add('hidden');
            }
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
            activeTrendMetric = metric;
            if (currentChartType !== 'line') {
                setChartType('line');
            } else {
                updateAnalytics();
            }
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
            cards.forEach(card => {
                const cardMetric = card.getAttribute('data-metric');
                Object.values(styles).forEach(s => {
                    card.classList.remove(s.border);
                    s.shadow.split(' ').forEach(cls => card.classList.remove(cls));
                });
                card.classList.add('border-neutral-800');

                if (cardMetric === metric) {
                    card.classList.remove('border-neutral-800');
                    card.classList.add(styles[metric].border);
                    styles[metric].shadow.split(' ').forEach(cls => card.classList.add(cls));
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
            document.getElementById('statSessions').innerText = filteredHistory.length;
            document.getElementById('statProjectTries').innerText = stats.totalProjTries;
            document.getElementById('statFlashRate').innerText = stats.flashRate + '%';
            document.getElementById('statAvgTime').innerText = stats.avgDur || '-';
            document.getElementById('statAvgSends').innerText = stats.avgSends;
            
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
                        if ((c.statusText === 'Top' || c.statusText === 'Flash') && c.gradeStr && c.gradeStr !== 'ðŸº') {
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
                    <div class="text-6xl mb-4">ðŸ†</div>
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
                    if (c.gradeStr && c.gradeStr !== 'ðŸº') {
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
                                    <span class="text-neutral-800 text-[8px]">â—</span>
                                    <span class="text-[10px] font-bold text-emerald-400">${sends} Sends</span>
                                    <span class="text-neutral-800 text-[8px]">â—</span>
                                    <span class="text-[10px] font-bold text-blue-400">Avg: ${avgGrade}</span>
                                    ${flashes > 0 ? ` <span class="text-neutral-800 text-[8px]">â—</span> <span class="text-[10px] font-bold text-amber-500">âš¡ ${flashes} Flash</span>` : ''}
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
                if (c.gradeStr && c.gradeStr !== 'ðŸº') {
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
                        <span style="color:${col}">${g}Ã—${gradeCounts[g]}</span>
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
        // GOOGLE DRIVE CLOUD SYNC & BACKUP INTEGRATION (GDrive Module)
        // ==========================================
        const GDrive = {
            CLIENT_ID: '283005114720-b879l8c73oufpe1juk74v243frc3uod5.apps.googleusercontent.com',
            accessToken: null,
            userEmail: null,
            tokenClient: null,

            initGIS() {
                if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
                    if (!document.querySelector('script[src*="gsi/client"]')) {
                        const script = document.createElement('script');
                        script.src = "https://accounts.google.com/gsi/client";
                        script.async = true;
                        script.defer = true;
                        script.onload = () => {
                            setTimeout(() => this.initGIS(), 100);
                        };
                        document.head.appendChild(script);
                    }
                    return;
                }

                try {
                    this.tokenClient = google.accounts.oauth2.initTokenClient({
                        client_id: this.CLIENT_ID,
                        scope: 'https://www.googleapis.com/auth/drive.file email profile',
                        callback: (tokenResponse) => {
                            if (tokenResponse.error !== undefined) {
                                console.error("GIS Token Error:", tokenResponse.error);
                                this.showToast("Sign-in Failed", "Google OAuth error: " + tokenResponse.error);
                                return;
                            }

                            this.accessToken = tokenResponse.access_token;
                            localStorage.setItem('gdrive_access_token', this.accessToken);
                            localStorage.setItem('gdrive_token_expires_at', Date.now() + (tokenResponse.expires_in * 1000));
                            localStorage.setItem('gdrive_connected', 'true');

                            this.showLoadingOverlay("Connecting Account...");
                            this.fetchUserInfo().then(() => {
                                this.showLoadingOverlay(false);
                                this.showToast("Connected", "Signed in as " + this.userEmail, "ðŸŸ¢");
                                this.renderUI();
                                this.listBackups();
                            });
                        }
                    });
                } catch (err) {
                    console.error("Error initializing Google Identity Services:", err);
                }
            },

            ensureTokenValid() {
                if (!this.accessToken) {
                    this.accessToken = localStorage.getItem('gdrive_access_token');
                }
                if (!this.accessToken) return false;
                const expiresAt = localStorage.getItem('gdrive_token_expires_at');
                if (!expiresAt || Date.now() >= parseInt(expiresAt)) {
                    this.accessToken = null;
                    localStorage.removeItem('gdrive_access_token');
                    return false;
                }
                return true;
            },

            async fetchUserInfo() {
                if (!this.accessToken) return;
                try {
                    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                        headers: { Authorization: `Bearer ${this.accessToken}` }
                    });
                    if (res.ok) {
                        const info = await res.json();
                        this.userEmail = info.email;
                        localStorage.setItem('gdrive_user_email', this.userEmail);
                    }
                } catch (err) {
                    console.error("Error fetching user info:", err);
                }
            },

            shouldUseRedirect() {
                const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                // Redirect on all mobile devices and standalone PWAs because popup auth relies on window.opener
                // which is easily blocked or severed, causing white screen hangs on accounts.google.com/gsi/transform.
                return isStandalone || isMobile;
            },

            login(silentOAuth = false) {
                if (!silentOAuth && this.shouldUseRedirect()) {
                    this.loginRedirect();
                    return;
                }

                const triggerAuth = () => {
                    if (this.tokenClient) {
                        try {
                            this.tokenClient.requestAccessToken({ prompt: silentOAuth ? 'none' : '' });
                        } catch (e) {
                            console.error("Failed to request access token:", e);
                            if (!silentOAuth) this.showToast("OAuth Error", "Failed to start Google sign-in flow.");
                        }
                    } else if (!silentOAuth) {
                        this.showToast("Error", "Google auth client is not ready. Please try again.");
                    }
                };

                if (!this.tokenClient) {
                    this.initGIS();
                    setTimeout(triggerAuth, 500);
                } else {
                    triggerAuth();
                }
            },

            loginRedirect() {
                // Normalize redirect URI - always use the exact current page URL (origin + pathname)
                let redirectUri = window.location.origin + window.location.pathname;
                // Ensure it ends with a known file or slash for consistency
                if (!redirectUri.endsWith('/') && !redirectUri.endsWith('.html')) {
                    redirectUri += '/';
                }
                console.log('[SendLog] OAuth redirect URI:', redirectUri);
                // Save pending flag so we can detect if the redirect failed
                localStorage.setItem('gdrive_auth_pending', String(Date.now()));
                const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(this.CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.file email profile')}&state=gdrive_auth&prompt=select_account`;
                // Navigate the full page to Google OAuth
                window.location.href = oauthUrl;
            },

            logout() {
                if (confirm("Are you sure you want to disconnect your Google Drive account? No further automatic backups will be saved.")) {
                    if (this.accessToken) {
                        try {
                            google.accounts.oauth2.revoke(this.accessToken, () => {});
                        } catch (e) {
                            console.warn("Token revocation failed:", e);
                        }
                    }

                    this.accessToken = null;
                    this.userEmail = null;
                    localStorage.removeItem('gdrive_access_token');
                    localStorage.removeItem('gdrive_token_expires_at');
                    localStorage.removeItem('gdrive_user_email');
                    localStorage.removeItem('gdrive_connected');

                    this.showToast("Disconnected", "Account signed out successfully.", "ðŸšª");
                    this.renderUI();
                }
            },

            handleOAuthRedirect() {
                try {
                    // Check if early interceptor already saved a token
                    const earlyToken = localStorage.getItem('gdrive_early_token');
                    if (earlyToken) {
                        localStorage.removeItem('gdrive_early_token');
                        this.accessToken = localStorage.getItem('gdrive_access_token');
                        if (this.accessToken) {
                            console.log('[SendLog] Using token captured by early interceptor.');
                            localStorage.removeItem('gdrive_auth_pending');
                            this.showLoadingOverlay("Connecting Account...");
                            this.fetchUserInfo().then(() => {
                                this.showLoadingOverlay(false);
                                this.showToast("Connected", "Signed in as " + (this.userEmail || "Connected Account"), "ðŸŸ¢");
                                this.renderUI();
                                this.listBackups();
                            });
                            return true;
                        }
                    }

                    // Also try parsing from current URL (fallback)
                    const combined = (window.location.hash || '').replace(/^#\/?\??/, '') + '&' + (window.location.search || '').substring(1);
                    const params = new URLSearchParams(combined);
                    const accessToken = params.get('access_token');
                    const expiresIn = params.get('expires_in');

                    if (accessToken) {
                        this.accessToken = accessToken;
                        localStorage.setItem('gdrive_access_token', this.accessToken);
                        localStorage.setItem('gdrive_token_expires_at', String(Date.now() + (parseInt(expiresIn || '3600') * 1000)));
                        localStorage.setItem('gdrive_connected', 'true');
                        localStorage.removeItem('gdrive_auth_pending');

                        window.history.replaceState(null, null, window.location.pathname);

                        this.showLoadingOverlay("Connecting Account...");
                        this.fetchUserInfo().then(() => {
                            this.showLoadingOverlay(false);
                            this.showToast("Connected", "Signed in as " + (this.userEmail || "Connected Account"), "ðŸŸ¢");
                            this.renderUI();
                            this.listBackups();
                        });
                        return true;
                    }

                    // Check if auth was pending but token wasn't found (redirect failed to pass hash)
                    const authPending = localStorage.getItem('gdrive_auth_pending');
                    if (authPending) {
                        const elapsed = Date.now() - parseInt(authPending);
                        // Only show message within 5 minutes of redirect
                        if (elapsed < 300000) {
                            localStorage.removeItem('gdrive_auth_pending');
                            console.warn('[SendLog] OAuth redirect returned but no token found. Elapsed:', elapsed, 'ms');
                            this.showToast("Sign-in Issue", "Token was lost during redirect. Please try again.", "âš ï¸");
                        } else {
                            localStorage.removeItem('gdrive_auth_pending');
                        }
                    }
                } catch (e) {
                    console.error("Error parsing Google OAuth redirect:", e);
                }
                return false;
            },

            checkConnection(lightweight = false) {
                if (this.handleOAuthRedirect()) return;
                
                const isConnected = localStorage.getItem('gdrive_connected') === 'true';
                if (isConnected) {
                    this.accessToken = localStorage.getItem('gdrive_access_token');
                    this.userEmail = localStorage.getItem('gdrive_user_email');
                    this.renderUI();

                    const expiresAt = localStorage.getItem('gdrive_token_expires_at');
                    if (!expiresAt || Date.now() >= parseInt(expiresAt)) {
                        this.attemptSilentTokenRenewal();
                    } else if (!lightweight) {
                        this.listBackups();
                    }
                } else {
                    this.renderUI();
                }
            },

            attemptSilentTokenRenewal() {
                const renewToken = () => {
                    if (this.tokenClient) {
                        try { this.tokenClient.requestAccessToken({ prompt: 'none' }); } catch(e) {}
                    }
                };

                if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
                    this.initGIS();
                    setTimeout(renewToken, 1000);
                    return;
                }
                if (!this.tokenClient) this.initGIS();
                if (this.tokenClient) renewToken();
            },

            async upload(silent = false) {
                if (!this.ensureTokenValid()) {
                    if (!silent) {
                        this.login();
                    } else {
                        this.attemptSilentTokenRenewal();
                    }
                    return;
                }

                if (!silent) this.showLoadingOverlay("Saving Checkpoint...");

                try {
                    const payload = {
                        history: boulderHistory,
                        maxGradeIndex: localStorage.getItem('boulderMaxGradeIndex') || '14',
                        playerName: localStorage.getItem('boulderPlayerName') || '',
                        achievements: achievementsUnlocked
                    };

                    const timestamp = Date.now();
                    const filename = `sendlog_backup_${timestamp}.json`;

                    const metaRes = await fetch('https://www.googleapis.com/drive/v3/files', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            name: filename,
                            mimeType: 'application/json'
                        })
                    });

                    if (!metaRes.ok) throw new Error("Metadata creation failed");
                    const metaData = await metaRes.json();
                    const fileId = metaData.id;

                    const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bearer ${this.accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(payload)
                    });

                    if (!uploadRes.ok) throw new Error("Payload upload failed");

                    if (!silent) {
                        this.showToast("Success", "Checkpoint saved successfully!", "ðŸ“¤");
                        this.listBackups();
                    }
                } catch (error) {
                    console.error("Backup upload error:", error);
                    if (!silent) this.showToast("Backup Failed", "Failed to upload checkpoint.", "ðŸ”´");
                } finally {
                    if (!silent) this.showLoadingOverlay(false);
                }
            },

            async listBackups() {
                if (!this.accessToken) return;
                const listContainer = document.getElementById('gdriveBackupsList');
                if (!listContainer) return;

                listContainer.innerHTML = `
                    <div class="flex justify-center items-center py-8 text-neutral-500 gap-2">
                        <svg class="animate-spin h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span class="text-[10px] font-black uppercase tracking-widest text-neutral-400">Loading checkpoints...</span>
                    </div>
                `;

                try {
                    const queryParams = new URLSearchParams({
                        q: "name contains 'sendlog_backup_' and mimeType = 'application/json' and trashed = false",
                        orderBy: "name desc",
                        fields: "files(id,name,size,createdTime)",
                        pageSize: "100"
                    });
                    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${queryParams.toString()}`, {
                        headers: { Authorization: `Bearer ${this.accessToken}` }
                    });

                    if (!res.ok) {
                        if (res.status === 401) {
                            this.accessToken = null;
                            localStorage.removeItem('gdrive_access_token');
                            localStorage.removeItem('gdrive_connected');
                            this.renderUI();
                            return;
                        }
                        throw new Error("Failed to list files");
                    }

                    const data = await res.json();
                    this.renderTimeline(data.files || []);
                } catch (error) {
                    console.error("Error listing backups:", error);
                    listContainer.innerHTML = `<div class="text-[10px] uppercase font-black tracking-wider text-red-400 text-center py-4">Failed to load checkpoints from Drive.</div>`;
                }
            },

            async restore(fileId) {
                if (!confirm("Are you sure you want to restore this checkpoint? This will replace your local climbing history with this backup!")) return;

                this.showLoadingOverlay("Restoring Backup...");
                try {
                    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                        headers: { Authorization: `Bearer ${this.accessToken}` }
                    });

                    if (!res.ok) throw new Error("Failed to download checkpoint");
                    const data = await res.json();

                    if (data.history) {
                        localStorage.setItem('boulderHistory', JSON.stringify(data.history));
                        boulderHistory = data.history;
                    }
                    if (data.maxGradeIndex !== undefined) localStorage.setItem('boulderMaxGradeIndex', data.maxGradeIndex);
                    if (data.playerName) localStorage.setItem('boulderPlayerName', data.playerName);
                    if (data.achievements) localStorage.setItem('boulderAchievements', JSON.stringify(data.achievements));

                    this.showToast("Success", "Restored successfully! Reloading...", "ðŸŸ¢");
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                } catch (error) {
                    console.error("Error restoring checkpoint:", error);
                    this.showToast("Restore Failed", "Failed to load checkpoint file.", "ðŸ”´");
                    this.showLoadingOverlay(false);
                }
            },

            async delete(fileId) {
                if (!confirm("Are you sure you want to delete this checkpoint? This cannot be undone.")) return;

                this.showLoadingOverlay("Deleting Checkpoint...");
                try {
                    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${this.accessToken}` }
                    });

                    if (!res.ok) throw new Error("Failed to delete file");

                    this.showToast("Deleted", "Checkpoint successfully deleted from Google Drive.", "ðŸ—‘ï¸");
                    this.listBackups();
                } catch (error) {
                    console.error("Error deleting checkpoint:", error);
                    this.showToast("Delete Failed", "Failed to delete file from Google Drive.", "ðŸ”´");
                } finally {
                    this.showLoadingOverlay(false);
                }
            },

            renderUI() {
                const disconnectedEl = document.getElementById('gdriveDisconnected');
                const connectedEl = document.getElementById('gdriveConnected');
                const emailEl = document.getElementById('gdriveUserEmail');
                const autoToggle = document.getElementById('gdriveAutoBackupToggle');

                if (!disconnectedEl || !connectedEl) return;

                const isConnected = localStorage.getItem('gdrive_connected') === 'true';

                if (isConnected) {
                    disconnectedEl.classList.add('hidden');
                    connectedEl.classList.remove('hidden');

                    if (emailEl) {
                        emailEl.innerText = this.userEmail || localStorage.getItem('gdrive_user_email') || 'Connected Account';
                    }

                    if (autoToggle) {
                        autoToggle.checked = localStorage.getItem('boulderAutoBackup') !== 'false';
                    }
                } else {
                    disconnectedEl.classList.remove('hidden');
                    connectedEl.classList.add('hidden');
                }
            },

            renderTimeline(files) {
                const listContainer = document.getElementById('gdriveBackupsList');
                if (!listContainer) return;

                if (files.length === 0) {
                    listContainer.innerHTML = `
                        <div class="text-center py-6 text-neutral-500 text-xs flex flex-col items-center gap-1">
                            <span class="text-[10px] font-black uppercase tracking-widest text-neutral-600">No checkpoints found</span>
                            <span class="text-[9px] text-neutral-700">Click "Create New Checkpoint" to save your first backup!</span>
                        </div>
                    `;
                    return;
                }

                listContainer.innerHTML = files.map(file => {
                    const tsMatch = file.name.match(/sendlog_backup_(\d+)\.json/);
                    let dateStr = 'Unknown Date';
                    if (tsMatch && tsMatch[1]) {
                        const ms = parseInt(tsMatch[1]);
                        const d = new Date(ms);
                        dateStr = d.toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                    } else if (file.createdTime) {
                        const d = new Date(file.createdTime);
                        dateStr = d.toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                    }

                    const sizeBytes = parseInt(file.size) || 0;
                    const sizeStr = sizeBytes > 0 ? `${(sizeBytes / 1024).toFixed(1)} KB` : 'Unknown size';

                    return `
                        <div class="flex items-center justify-between bg-neutral-950/40 p-3 rounded-xl border border-neutral-800/80 hover:border-neutral-700/80 transition group/item">
                            <div class="flex flex-col">
                                <span class="text-xs font-bold text-neutral-200">${dateStr}</span>
                                <span class="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">${sizeStr}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <button onclick="GDrive.restore('${file.id}')" class="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition active:scale-95">
                                    Restore
                                </button>
                                <button onclick="GDrive.delete('${file.id}')" class="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 rounded-lg transition active:scale-95" title="Delete Checkpoint">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
            },

            toggleAutoBackup(checkbox) {
                localStorage.setItem('boulderAutoBackup', checkbox.checked ? 'true' : 'false');
                this.showToast("Auto-Backup", checkbox.checked ? "Auto-backups enabled!" : "Auto-backups disabled.", "âš™ï¸");
            },

            showToast(title, body, icon = "â˜ï¸") {
                const toast = document.getElementById('cloudToast');
                const header = document.getElementById('cloudToastHeader');
                const b = document.getElementById('cloudToastBody');
                const ic = document.getElementById('cloudToastIcon');
                if (toast && header && b && ic) {
                    header.innerText = title;
                    b.innerText = body;
                    ic.innerText = icon;

                    if (title.toLowerCase().includes("failed") || title.toLowerCase().includes("error") || body.toLowerCase().includes("failed")) {
                        toast.style.borderColor = '#ef4444';
                        header.style.color = '#f87171';
                    } else {
                        toast.style.borderColor = '#10b981';
                        header.style.color = '#34d399';
                    }

                    toast.classList.remove('-translate-y-[150%]');
                    setTimeout(() => {
                        toast.classList.add('-translate-y-[150%]');
                    }, 3500);
                }
            },

            showLoadingOverlay(show) {
                let overlay = document.getElementById('gdriveLoadingOverlay');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.id = 'gdriveLoadingOverlay';
                    overlay.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[250] flex flex-col items-center justify-center hidden transition duration-300';
                    overlay.innerHTML = `
                        <div class="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 flex flex-col items-center gap-4 max-w-xs shadow-2xl">
                            <svg class="animate-spin h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <div class="text-center">
                                <span id="gdriveLoadingText" class="text-xs font-bold text-white block">Syncing with Google...</span>
                                <span class="text-[9px] text-neutral-500 uppercase tracking-widest mt-1 block">Please wait</span>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(overlay);
                }

                const textEl = document.getElementById('gdriveLoadingText');
                if (textEl && typeof show === 'string') {
                    textEl.innerText = show;
                } else if (textEl) {
                    textEl.innerText = "Syncing with Google...";
                }

                if (show) {
                    overlay.classList.remove('hidden');
                } else {
                    overlay.classList.add('hidden');
                }
            }
        };

        function triggerMilestoneBackup() {
            if (localStorage.getItem('boulderAutoBackup') !== 'false') {
                GDrive.upload(true);
            }
        }

        // Auto-check connection when app gains focus or visibility (crucial for PWA sheets/in-app tabs)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                GDrive.checkConnection(true);
            }
        });

        window.addEventListener('focus', () => {
            GDrive.checkConnection(true);
        });

        // Init on load with safety guards
        try {
            // Display version dynamically
            document.querySelectorAll('.app-version-text').forEach(el => el.innerText = APP_VERSION);
            const refreshTextEl = document.getElementById('hardRefreshText');
            if (refreshTextEl) refreshTextEl.innerText = `Hard Refresh (${APP_VERSION})`;

            updateAnalytics();
            renderHistoryList();
            loadActiveSession();
            renderAchievements();
            renderTags();
            GDrive.checkConnection();
            GDrive.initGIS();

            // Final sanity check for achievements
            if (boulderHistory && boulderHistory.length >= 5) unlockAchievement('consistency');
            if (getTotalScore() >= 10000) unlockAchievement('centurion');
        } catch (e) {
            console.error("App boot sequence failed:", e);
        }
    
