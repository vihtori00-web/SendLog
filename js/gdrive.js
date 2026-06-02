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
                                this.showToast("Connected", "Signed in as " + this.userEmail, "🟢");
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
                const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(this.CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.file email profile')}&state=gdrive_auth`;
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

                    this.showToast("Disconnected", "Account signed out successfully.", "🚪");
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
                                this.showToast("Connected", "Signed in as " + (this.userEmail || "Connected Account"), "🟢");
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
                            this.showToast("Connected", "Signed in as " + (this.userEmail || "Connected Account"), "🟢");
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
                            this.showToast("Sign-in Issue", "Token was lost during redirect. Please try again.", "⚠️");
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
                        this.accessToken = null;
                        localStorage.removeItem('gdrive_access_token');
                        this.renderUI();
                        
                        const listContainer = document.getElementById('gdriveBackupsList');
                        if (listContainer) {
                            listContainer.innerHTML = `
                                <div class="text-center py-6 text-neutral-500 text-xs flex flex-col items-center gap-2">
                                    <span class="text-[10px] font-black uppercase tracking-widest text-amber-500">Google Session Expired</span>
                                    <span class="text-[9px] text-neutral-600">Your secure Drive connection has expired.</span>
                                    <button onclick="GDrive.login()" class="mt-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-wider rounded-xl transition active:scale-95 text-[9px]">
                                        Reconnect Now
                                    </button>
                                </div>
                            `;
                        }
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
                        console.log('[SendLog] Silent auto-backup skipped: Google session is expired.');
                        // Deliberately removed the showToast here so we don't annoy the user
                        // every time they log a climb while the token is expired.
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
                        this.showToast("Success", "Checkpoint saved successfully!", "📤");
                        this.listBackups();
                    }
                } catch (error) {
                    console.error("Backup upload error:", error);
                    if (!silent) this.showToast("Backup Failed", "Failed to upload checkpoint.", "🔴");
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

                    this.showToast("Success", "Restored successfully! Reloading...", "🟢");
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                } catch (error) {
                    console.error("Error restoring checkpoint:", error);
                    this.showToast("Restore Failed", "Failed to load checkpoint file.", "🔴");
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

                    this.showToast("Deleted", "Checkpoint successfully deleted from Google Drive.", "🗑️");
                    this.listBackups();
                } catch (error) {
                    console.error("Error deleting checkpoint:", error);
                    this.showToast("Delete Failed", "Failed to delete file from Google Drive.", "🔴");
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
                this.showToast("Auto-Backup", checkbox.checked ? "Auto-backups enabled!" : "Auto-backups disabled.", "⚙️");
            },

            showToast(title, body, icon = "☁️") {
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
