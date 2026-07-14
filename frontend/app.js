// TaskHub Pro - Telegram Mini App Logic Engine

// Initialize Telegram WebApp SDK
const WebApp = window.Telegram?.WebApp;

// Dynamic Viewport Height management for mobile & Telegram WebApp
function updateViewportHeight() {
    let height = window.innerHeight;
    if (WebApp && WebApp.viewportHeight) {
        height = WebApp.viewportHeight;
    }
    document.documentElement.style.setProperty('--vh', `${height}px`);
}

if (WebApp) {
    WebApp.ready();
    WebApp.expand();
    
    // Disable vertical swipes to prevent dragging the entire WebApp/webview container
    if (WebApp.disableVerticalSwipes) {
        WebApp.disableVerticalSwipes();
    }
    
    // Listen to Telegram viewport changes
    WebApp.onEvent('viewportChanged', updateViewportHeight);
}

// Listen to standard window resize/orientation changes
window.addEventListener('resize', updateViewportHeight);
window.addEventListener('orientationchange', updateViewportHeight);

// Initial set on script load
updateViewportHeight();

// Configuration
// In production, change this to your deployed Cloudflare Workers URL
const API_BASE_URL = 'https://taskhub-pro-backend.alokkumarsaw312.workers.dev'; 

// Premium In-App Notification System (Replaces Native Browser Alerts)
function showNotification(message, duration = 3000) {
    const toast = document.getElementById('toast-notification');
    const msgEl = document.getElementById('toast-message');
    if (!toast || !msgEl) {
        console.log("Notification Fallback:", message);
        return;
    }
    msgEl.innerText = message;
    toast.classList.add('active');
    
    if (window.toastTimeout) {
        clearTimeout(window.toastTimeout);
    }
    
    window.toastTimeout = setTimeout(() => {
        toast.classList.remove('active');
    }, duration);
}

// Global Override of Native Browser alerts to enforce Premium UI toasts
window.alert = function(msg) {
    showNotification(msg);
}; 

// Authentication Header preparation
function getAuthHeader() {
    if (WebApp && WebApp.initData) {
        return WebApp.initData;
    }
    // Fallback Mock authentication for local development/browser testing
    return 'mock_987654321_telegram_earner';
}

// Application State
let userState = {
    telegram_id: 987654321,
    username: 'telegram_earner',
    first_name: 'Pro',
    last_name: 'Earner',
    balance: 0.00,
    streak: 1,
    referred_by: null,
    completions: 0,
    level: 1,
    canSpin: true,
    spinCooldown: 0,
    lastStreakClaim: null,
    claimedStreakToday: false
};

let activeTab = 'home';
let useMockData = false; // Flag if backend is unavailable
let selectedPaymentMethod = 'PayPal';
let minWithdrawalAmount = 5.00;

// Initialization
let tonConnectUI = null;

document.addEventListener('DOMContentLoaded', async () => {
    updateViewportHeight();
    initTheme();
    console.log("TaskHub Pro Initializing...");
    
    // Init TonConnect UI
    try {
        tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
            manifestUrl: 'https://raw.githubusercontent.com/alok431/TaskHub_Pro/main/frontend/tonconnect-manifest.json',
            buttonRootId: 'ton-connect'
        });
    } catch(e) {
        console.error("TonConnect init failed", e);
    }
    
    // Check API availability
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`, {
            method: 'GET',
            headers: { 'X-Telegram-Init-Data': getAuthHeader() }
        });
        if (response.ok) {
            console.log("Connected to Cloudflare Workers Backend.");
            useMockData = false;
        } else {
            console.warn("Backend returned error status. Using client-side simulation.");
            useMockData = true;
        }
    } catch (err) {
        console.warn("Cannot connect to backend. Falling back to local storage simulation.");
        useMockData = true;
    }

    // Load user profile & initialize layout
    await loadUserProfile();
    await loadTabContent();
});

// Switch Tab View
function switchTab(event, tabName) {
    if (event) {
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        event.currentTarget.classList.add('active');
    } else {
        // Handle programmatic tab changes (e.g. from rewards to home)
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.getAttribute('onclick').includes(tabName)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    document.querySelectorAll('.content').forEach(el => el.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');
    
    activeTab = tabName;
    loadTabContent();
}

// Load Tab Content dynamically
async function loadTabContent() {
    updateHeaderStats();
    
    if (activeTab === 'home') {
        await loadQuickTasks();
        await loadLeaderboard();
        updateSpinUI();
    } else if (activeTab === 'tasks') {
        await loadPartnerTasks();
    } else if (activeTab === 'watch') {
        await loadWatchStatus();
    } else if (activeTab === 'join') {
        await loadChannels();
    } else if (activeTab === 'refer') {
        await loadReferralData();
    } else if (activeTab === 'wallet') {
        await loadTransactions();
        selectPaymentMethod('PayPal', '$5');
    }
}

// Load User Profile Data
async function loadUserProfile() {
    if (useMockData) {
        setupMockDatabase();
        const mockUser = JSON.parse(localStorage.getItem('th_user'));
        const mockCompletions = JSON.parse(localStorage.getItem('th_completions_count') || '0');
        
        userState = {
            ...mockUser,
            completions: mockCompletions,
            level: Math.floor(mockCompletions / 5) + 1
        };

        // Cooldown check for spin (5 max spins)
        let spinHistoryStr = localStorage.getItem('th_spin_history');
        let spinHistory = spinHistoryStr ? JSON.parse(spinHistoryStr) : [];
        
        // Filter out spins older than 24 hours
        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
        spinHistory = spinHistory.filter(time => time > twentyFourHoursAgo);
        localStorage.setItem('th_spin_history', JSON.stringify(spinHistory));

        if (spinHistory.length >= 5) {
            userState.canSpin = false;
            const oldestSpin = spinHistory[0];
            const hoursSinceOldest = (Date.now() - oldestSpin) / (1000 * 60 * 60);
            userState.spinCooldown = Math.ceil(24 - hoursSinceOldest);
            userState.spins_left = 0;
        } else {
            userState.canSpin = true;
            userState.spinCooldown = 0;
            userState.spins_left = 5 - spinHistory.length;
        }

        // Cooldown check for streak
        const lastClaimStr = localStorage.getItem('th_last_streak_claim');
        let claimedStreakToday = false;
        if (lastClaimStr) {
            const lastClaimDate = new Date(lastClaimStr);
            const now = new Date();
            const diffDays = getUTCDayDifference(lastClaimDate, now);
            if (diffDays === 0) {
                claimedStreakToday = true;
            } else if (diffDays > 1) {
                // Reset streak if missed consecutive login
                userState.streak = 1;
                const mockUserObj = JSON.parse(localStorage.getItem('th_user'));
                if (mockUserObj) {
                    mockUserObj.streak = 1;
                    localStorage.setItem('th_user', JSON.stringify(mockUserObj));
                }
            }
        }
        userState.lastStreakClaim = lastClaimStr;
        userState.claimedStreakToday = claimedStreakToday;
    } else {
        try {
            // Check for url referral code
            let referrerParam = '';
            if (WebApp && WebApp.initDataUnsafe && WebApp.initDataUnsafe.start_param) {
                referrerParam = `?referred_by=${WebApp.initDataUnsafe.start_param}`;
            }

            const response = await fetch(`${API_BASE_URL}/api/user${referrerParam}`, {
                method: 'GET',
                headers: { 'X-Telegram-Init-Data': getAuthHeader() }
            });
            if (!response.ok) {
                throw new Error(`User API responded with status ${response.status}`);
            }
            const data = await response.json();
            if (data.user) {
                userState.telegram_id = data.user.telegram_id;
                userState.username = data.user.username || 'tg_user';
                userState.first_name = data.user.first_name || 'TG';
                userState.last_name = data.user.last_name || 'User';
                userState.balance = parseFloat(data.user.balance);
                userState.streak = data.user.streak;
                userState.canSpin = data.spin.canSpin;
                userState.spinCooldown = data.spin.spinCooldown;
                userState.spins_left = data.spin.spins_left;
                userState.lastStreakClaim = data.streak.last_streak_claim;
                userState.claimedStreakToday = data.streak.claimed_today;
                
                // Get counts
                const tasksRes = await fetch(`${API_BASE_URL}/api/tasks`, {
                    headers: { 'X-Telegram-Init-Data': getAuthHeader() }
                });
                if (!tasksRes.ok) {
                    throw new Error(`Tasks API responded with status ${tasksRes.status}`);
                }
                const tasks = await tasksRes.json();
                const taskCompletedCount = tasks.filter(t => t.completed).length;

                userState.completions = taskCompletedCount;
                userState.level = Math.floor(userState.completions / 5) + 1;
            }
        } catch (err) {
            console.error("Failed to load user profile from API, switching to simulation mode", err);
            useMockData = true;
            await loadUserProfile();
        }
    }
    updateHeaderStats();
}

// Update Header elements
function updateHeaderStats() {
    document.getElementById('stat-balance').innerHTML = `${Math.floor(userState.balance)} <span class="gem-icon">💎</span>`;
    document.getElementById('stat-completed').innerText = userState.completions;
    document.getElementById('stat-streak').innerText = `${userState.streak}d`;
    
    const levelEl = document.getElementById('user-level');
    if (levelEl) levelEl.innerText = `LEVEL ${userState.level}`;
    
    // Update profile badge display
    const profileName = document.getElementById('profile-name');
    const profileId = document.getElementById('profile-id');
    if (profileName) {
        profileName.innerText = userState.first_name + (userState.last_name ? ' ' + userState.last_name : '');
    }
    if (profileId) {
        profileId.innerText = userState.telegram_id ? `ID: ${userState.telegram_id}` : 'ID: -';
    }
    
    // Update profile dropdown elements
    const dropdownIdVal = document.getElementById('dropdown-id-val');
    const dropdownBalanceVal = document.getElementById('dropdown-balance-val');
    const dropdownCompletedVal = document.getElementById('dropdown-completed-val');
    const dropdownStreakVal = document.getElementById('dropdown-streak-val');
    const dropdownLevelVal = document.getElementById('dropdown-level-val');
    
    if (dropdownIdVal) dropdownIdVal.innerText = userState.telegram_id || '-';
    if (dropdownBalanceVal) dropdownBalanceVal.innerHTML = `${Math.floor(userState.balance)} <span class="gem-icon">💎</span>`;
    if (dropdownCompletedVal) dropdownCompletedVal.innerText = userState.completions;
    if (dropdownStreakVal) dropdownStreakVal.innerText = `${userState.streak}d`;
    if (dropdownLevelVal) dropdownLevelVal.innerText = `LEVEL ${userState.level}`;
    
    updateStreakUI();
}

// Toggle profile dropdown
function toggleProfileDropdown(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

// Close dropdown on click outside
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('profile-dropdown');
    const badge = document.getElementById('profile-badge');
    if (dropdown && dropdown.classList.contains('show')) {
        if (!badge || !badge.contains(event.target)) {
            dropdown.classList.remove('show');
        }
    }
});

// Theme Toggle
function toggleTheme() {
    const appContainer = document.querySelector('.app-container');
    const toggleBtn = document.getElementById('theme-toggle');
    if (!appContainer) return;
    
    const isLight = appContainer.classList.toggle('light-theme');
    
    // Save theme preference in localStorage
    localStorage.setItem('th_theme', isLight ? 'light' : 'dark');
    
    // Update toggle button icon
    if (toggleBtn) {
        toggleBtn.innerText = isLight ? '☀️' : '🌙';
    }
}

// Initialize Theme on startup
function initTheme() {
    const savedTheme = localStorage.getItem('th_theme');
    const appContainer = document.querySelector('.app-container');
    const toggleBtn = document.getElementById('theme-toggle');
    
    if (savedTheme === 'light' && appContainer) {
        appContainer.classList.add('light-theme');
        if (toggleBtn) {
            toggleBtn.innerText = '☀️';
        }
    }
}

// Helper for calendar day difference in UTC
function getUTCDayDifference(d1, d2) {
    const utc1 = Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth(), d1.getUTCDate());
    const utc2 = Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), d2.getUTCDate());
    return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
}

// Render the 7-day daily login streak grid dynamically
function updateStreakUI() {
    const gridContainer = document.getElementById('streak-days-container');
    const subtitle = document.getElementById('streak-subtitle');
    const badge = document.getElementById('streak-badge-display');
    const claimBtn = document.getElementById('claim-streak-btn');
    
    if (!gridContainer || !claimBtn) return;
    
    gridContainer.innerHTML = '';
    
    const streak = userState.streak || 1;
    const claimedToday = userState.claimedStreakToday || false;
    
    // The current day in the 7-day cycle (1 to 7)
    const currentDayInCycle = ((streak - 1) % 7) + 1;
    
    if (subtitle) {
        subtitle.innerText = claimedToday
            ? `Come back tomorrow to extend your streak! (Current Streak: ${streak} days)`
            : `Claim daily bonus to extend (Current Streak: ${streak - 1} days)`;
    }
    
    if (badge) {
        badge.innerText = `Day ${currentDayInCycle}`;
    }
    
    for (let day = 1; day <= 7; day++) {
        const dayItem = document.createElement('div');
        dayItem.className = 'streak-day-item';
        
        let statusIcon = '🔒';
        let stateClass = '';
        
        if (claimedToday) {
            if (day <= currentDayInCycle) {
                stateClass = 'completed';
                statusIcon = '✅';
            } else {
                stateClass = 'locked';
                statusIcon = '🔒';
            }
        } else {
            if (day < currentDayInCycle) {
                stateClass = 'completed';
                statusIcon = '✅';
            } else if (day === currentDayInCycle) {
                stateClass = 'active';
                statusIcon = '🔥';
            } else {
                stateClass = 'locked';
                statusIcon = '🔒';
            }
        }
        
        if (stateClass) {
            dayItem.classList.add(stateClass);
        }
        
        const coinsReward = day * 50;
        
        dayItem.innerHTML = `
            <div class="streak-day-label">Day ${day}</div>
            <div class="streak-day-icon">${statusIcon}</div>
            <div class="streak-day-reward">+${coinsReward}</div>
        `;
        
        gridContainer.appendChild(dayItem);
    }
    
    if (claimedToday) {
        claimBtn.disabled = true;
        claimBtn.innerText = 'Claimed Today';
    } else {
        claimBtn.disabled = false;
        claimBtn.innerText = `Claim Day ${currentDayInCycle} Reward (+${currentDayInCycle * 50} 💎)`;
    }
}

// Spin Cooldown update helper
function updateSpinUI() {
    const spinBtn = document.getElementById('spin-btn');
    if (!spinBtn) return;
    
    if (userState.canSpin) {
        spinBtn.innerText = `Spin Free (${userState.spins_left}/5) →`;
        spinBtn.disabled = false;
        spinBtn.classList.remove('btn-outline');
        spinBtn.classList.add('btn-secondary');
    } else {
        spinBtn.innerText = `Cooldown (${userState.spinCooldown}h remaining)`;
        spinBtn.disabled = true;
        spinBtn.classList.remove('btn-secondary');
        spinBtn.classList.add('btn-outline');
    }
}

/* ==========================================================================
   TASKS TAB SWITCHING
   ========================================================================== */
function switchTaskTab(viewName) {
    const customView = document.getElementById('custom-tasks-view');
    const giftsView   = document.getElementById('gifts-view');
    const btnCustom   = document.getElementById('btn-custom-tasks');
    const btnGifts    = document.getElementById('btn-gifts');

    if (!customView || !giftsView) return;

    if (viewName === 'custom') {
        customView.style.display = 'block';
        giftsView.style.display  = 'none';
        btnCustom.classList.add('active');
        if (btnGifts) btnGifts.classList.remove('active');
    } else {
        customView.style.display = 'none';
        giftsView.style.display  = 'block';
        if (btnGifts) btnGifts.classList.add('active');
        btnCustom.classList.remove('active');
        initGiftStates();
    }
}

/* ==========================================================================
   GIFT CENTER
   ========================================================================== */
const GIFT_CODES = {
    'TASKHUB2025': 500,
    'WELCOME100':  100,
    'GEMS500':     500,
    'LAUNCH250':   250,
    'PROMO1000':   1000
};

function initGiftStates() {
    checkGiftCooldown('daily',   24 * 60 * 60 * 1000,  'btn-gift-daily');
    checkGiftCooldown('weekly',  7 * 24 * 60 * 60 * 1000, 'btn-gift-weekly');
    checkGiftCondition('levelup', () => userState.level >= 3, 'btn-gift-levelup', 'Requires Level 3');
    checkGiftCondition('referral', () => {
        const refs = JSON.parse(localStorage.getItem('th_referrals') || '[]');
        return refs.length >= 1;
    }, 'btn-gift-referral', 'Invite 1 friend first');
}

function checkGiftCooldown(key, cooldownMs, btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const lastClaim = localStorage.getItem(`th_gift_${key}`);
    const claimed   = JSON.parse(localStorage.getItem(`th_gift_${key}_claimed`) || 'false');
    if (lastClaim && (Date.now() - parseInt(lastClaim)) < cooldownMs) {
        const remaining = cooldownMs - (Date.now() - parseInt(lastClaim));
        const hrs = Math.ceil(remaining / (1000 * 60 * 60));
        btn.disabled   = true;
        btn.innerText  = hrs > 24 ? `${Math.ceil(hrs/24)}d left` : `${hrs}h left`;
        btn.classList.add('gift-claimed');
    } else {
        btn.disabled  = false;
        btn.innerText = 'Claim';
        btn.classList.remove('gift-claimed');
    }
}

function checkGiftCondition(key, conditionFn, btnId, lockedMsg) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const alreadyClaimed = JSON.parse(localStorage.getItem(`th_gift_${key}_claimed`) || 'false');
    if (alreadyClaimed) {
        btn.disabled  = true;
        btn.innerText = '✓ Claimed';
        btn.classList.add('gift-claimed');
    } else if (!conditionFn()) {
        btn.disabled  = true;
        btn.innerText = lockedMsg;
        btn.classList.add('gift-locked');
    } else {
        btn.disabled  = false;
        btn.innerText = 'Claim';
        btn.classList.remove('gift-locked', 'gift-claimed');
    }
}

async function claimGift(type, amount, btnId) {
    const btn = document.getElementById(btnId);
    if (!btn || btn.disabled) return;

    const cooldowns = { daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 };

    // Cooldown-based gifts (daily / weekly)
    if (cooldowns[type]) {
        const last = localStorage.getItem(`th_gift_${type}`);
        if (last && (Date.now() - parseInt(last)) < cooldowns[type]) {
            alert('You already claimed this gift. Come back later!');
            return;
        }
        btn.disabled  = true;
        btn.innerText = 'Claiming...';
        localStorage.setItem(`th_gift_${type}`, Date.now().toString());
    }

    // Condition-based gifts (levelup / referral)
    if (type === 'levelup') {
        if (userState.level < 3) { alert('Reach Level 3 to claim this gift!'); return; }
        const already = JSON.parse(localStorage.getItem(`th_gift_levelup_claimed`) || 'false');
        if (already) { alert('Already claimed!'); return; }
        localStorage.setItem('th_gift_levelup_claimed', 'true');
    }
    if (type === 'referral') {
        const refs = JSON.parse(localStorage.getItem('th_referrals') || '[]');
        if (refs.length < 1) { alert('Invite at least 1 friend to claim this gift!'); return; }
        const already = JSON.parse(localStorage.getItem(`th_gift_referral_claimed`) || 'false');
        if (already) { alert('Already claimed!'); return; }
        localStorage.setItem('th_gift_referral_claimed', 'true');
    }

    // Credit gems
    userState.balance += amount;
    updateHeaderStats();

    // Save to mock DB
    const mockUser = JSON.parse(localStorage.getItem('th_user') || '{}');
    if (mockUser) { mockUser.balance = userState.balance; localStorage.setItem('th_user', JSON.stringify(mockUser)); }

    // Log transaction
    const txs = JSON.parse(localStorage.getItem('th_transactions') || '[]');
    txs.unshift({ id: Math.random().toString(36).substr(2,9), amount, type: 'gift', description: `Gift claimed: ${type} gift`, created_at: new Date().toISOString() });
    localStorage.setItem('th_transactions', JSON.stringify(txs));

    alert(`🎁 Gift Claimed! +${amount} 💎 added to your balance!`);

    // Refresh button states
    initGiftStates();
}

async function redeemGiftCode() {
    const input  = document.getElementById('gift-code-input');
    const result = document.getElementById('gift-code-result');
    const code   = (input?.value || '').trim().toUpperCase();

    if (!code) { showGiftResult('Please enter a gift code.', false); return; }

    // Check if already redeemed
    const redeemedCodes = JSON.parse(localStorage.getItem('th_redeemed_codes') || '[]');
    if (redeemedCodes.includes(code)) {
        showGiftResult('❌ This code has already been redeemed.', false);
        return;
    }

    const reward = GIFT_CODES[code];
    if (!reward) {
        showGiftResult('❌ Invalid gift code. Please check and try again.', false);
        return;
    }

    // Credit gems
    userState.balance += reward;
    updateHeaderStats();

    // Save redeemed code
    redeemedCodes.push(code);
    localStorage.setItem('th_redeemed_codes', JSON.stringify(redeemedCodes));

    // Save balance
    const mockUser = JSON.parse(localStorage.getItem('th_user') || '{}');
    if (mockUser) { mockUser.balance = userState.balance; localStorage.setItem('th_user', JSON.stringify(mockUser)); }

    // Log transaction
    const txs = JSON.parse(localStorage.getItem('th_transactions') || '[]');
    txs.unshift({ id: Math.random().toString(36).substr(2,9), amount: reward, type: 'gift', description: `Gift code redeemed: ${code}`, created_at: new Date().toISOString() });
    localStorage.setItem('th_transactions', JSON.stringify(txs));

    showGiftResult(`✅ Code redeemed! +${reward} 💎 added to your balance!`, true);
    if (input) input.value = '';
}

function showGiftResult(msg, success) {
    const result = document.getElementById('gift-code-result');
    if (!result) return;
    result.innerText  = msg;
    result.className  = `gift-code-result ${success ? 'gift-result-success' : 'gift-result-error'}`;
    setTimeout(() => { result.innerText = ''; result.className = 'gift-code-result'; }, 4000);
}

/* ==========================================================================
   DAILY LUCKY SPIN
   ========================================================================== */
async function triggerSpin() {
    if (!userState.canSpin) return;

    const reel1 = document.getElementById('reel-1');
    const reel2 = document.getElementById('reel-2');
    const reel3 = document.getElementById('reel-3');
    const spinBtn = document.getElementById('spin-btn');
    
    if (!reel1 || !reel2 || !reel3) {
        alert("Please refresh the page to load the new slot machine!");
        return;
    }
    
    spinBtn.disabled = true;
    spinBtn.innerText = 'Spinning...';
    
    reel1.classList.add('spinning-animation');
    reel2.classList.add('spinning-animation');
    reel3.classList.add('spinning-animation');

    const symbols = ['7️⃣', '💎', '🍒', '🍋', '🔔'];
    
    let spinInterval = setInterval(() => {
        reel1.innerText = symbols[Math.floor(Math.random() * symbols.length)];
        reel2.innerText = symbols[Math.floor(Math.random() * symbols.length)];
        reel3.innerText = symbols[Math.floor(Math.random() * symbols.length)];
    }, 100);

    if (useMockData) {
        setTimeout(() => {
            clearInterval(spinInterval);
            reel1.classList.remove('spinning-animation');
            reel2.classList.remove('spinning-animation');
            reel3.classList.remove('spinning-animation');
            
            const r = Math.random();
            let finalSymbols = [];
            let prize = 0;
            let description = '';

            if (r > 0.98) {
                finalSymbols = ['7️⃣', '7️⃣', '7️⃣'];
                prize = 1000;
                description = 'Jackpot 777! Won 1000 💎';
            } else if (r > 0.90) {
                finalSymbols = ['💎', '💎', '💎'];
                prize = 800;
                description = 'Diamond Combo! Won 800 💎';
            } else if (r > 0.80) {
                finalSymbols = ['🍒', '🍒', '🍒'];
                prize = 500;
                description = 'Cherry Combo! Won 500 💎';
            } else if (r > 0.60) {
                finalSymbols = ['🍋', '🍋', '🍋'];
                prize = 250;
                description = 'Lemon Combo! Won 250 💎';
            } else if (r > 0.40) {
                finalSymbols = ['🔔', '🔔', '🔔'];
                prize = 100;
                description = 'Bell Combo! Won 100 💎';
            } else if (r > 0.15) {
                const sym = symbols[Math.floor(Math.random() * symbols.length)];
                let other = symbols[Math.floor(Math.random() * symbols.length)];
                while(other === sym) other = symbols[Math.floor(Math.random() * symbols.length)];
                finalSymbols = [sym, sym, other].sort(() => Math.random() - 0.5);
                prize = 50;
                description = 'Two of a kind! Won 50 💎';
            } else {
                const s = [...symbols].sort(() => Math.random() - 0.5);
                finalSymbols = [s[0], s[1], s[2]];
                prize = 10;
                description = 'Consolation Prize! Won 10 💎';
            }

            reel1.innerText = finalSymbols[0];
            reel2.innerText = finalSymbols[1];
            reel3.innerText = finalSymbols[2];

            userState.balance += prize;
            userState.canSpin = false;
            userState.spinCooldown = 24;
            
            let spinHistoryStr = localStorage.getItem('th_spin_history');
            let spinHistory = spinHistoryStr ? JSON.parse(spinHistoryStr) : [];
            spinHistory.push(Date.now());
            localStorage.setItem('th_spin_history', JSON.stringify(spinHistory));
            userState.spins_left = Math.max(0, 5 - spinHistory.length);
            
            const mockUser = JSON.parse(localStorage.getItem('th_user') || "{}");
            mockUser.balance = userState.balance;
            localStorage.setItem('th_user', JSON.stringify(mockUser));

            const mockTxs = JSON.parse(localStorage.getItem('th_transactions') || "[]");
            mockTxs.unshift({
                id: Math.random().toString(36).substr(2, 9),
                amount: prize,
                type: 'spin',
                description: description,
                created_at: new Date().toISOString()
            });
            localStorage.setItem('th_transactions', JSON.stringify(mockTxs));
            
            updateHeaderStats();
            updateSpinUI();
            
            if (prize >= 100) showConfetti();
            alert(`🎉 ${description}`);
            
        }, 2000);
    } else {
        try {
            fetch(`${API_BASE_URL}/api/user/spin`, {
                method: 'POST',
                headers: { 'X-Telegram-Init-Data': getAuthHeader() }
            }).then(r => r.json()).then(data => {
                setTimeout(() => {
                    clearInterval(spinInterval);
                    reel1.classList.remove('spinning-animation');
                    reel2.classList.remove('spinning-animation');
                    reel3.classList.remove('spinning-animation');
                    
                    if (data.success) {
                        userState.balance = data.new_balance;
                        userState.canSpin = data.spins_left > 0;
                        userState.spinCooldown = data.cooldown;
                        userState.spins_left = data.spins_left;
                        
                        let finalSymbols = [];
                        if (data.reward >= 1000) finalSymbols = ['7️⃣', '7️⃣', '7️⃣'];
                        else if (data.reward >= 800) finalSymbols = ['💎', '💎', '💎'];
                        else if (data.reward >= 500) finalSymbols = ['🍒', '🍒', '🍒'];
                        else if (data.reward >= 250) finalSymbols = ['🍋', '🍋', '🍋'];
                        else if (data.reward >= 100) finalSymbols = ['🔔', '🔔', '🔔'];
                        else if (data.reward >= 50) {
                            const sym = symbols[Math.floor(Math.random() * symbols.length)];
                            let other = symbols[Math.floor(Math.random() * symbols.length)];
                            while(other === sym) other = symbols[Math.floor(Math.random() * symbols.length)];
                            finalSymbols = [sym, sym, other].sort(() => Math.random() - 0.5);
                        } else {
                            const s = [...symbols].sort(() => Math.random() - 0.5);
                            finalSymbols = [s[0], s[1], s[2]];
                        }
                        
                        reel1.innerText = finalSymbols[0];
                        reel2.innerText = finalSymbols[1];
                        reel3.innerText = finalSymbols[2];

                        updateHeaderStats();
                        updateSpinUI();
                        if (data.reward >= 100) showConfetti();
                        alert(`🎉 Congratulations! You won ${data.reward} 💎!`);
                    } else {
                        alert(`Error: ${data.error}`);
                        updateSpinUI();
                    }
                }, 2000);
            });
        } catch (err) {
            clearInterval(spinInterval);
            alert('Failed to execute spin. Please try again.');
            updateSpinUI();
        }
    }
}

/* ==========================================================================
   DAILY STREAK CLAIM
   ========================================================================== */
async function claimDailyStreak() {
    const claimBtn = document.getElementById('claim-streak-btn');
    if (!claimBtn) return;
    claimBtn.disabled = true;
    claimBtn.innerText = 'Claiming...';

    if (useMockData) {
        // Logic simulator
        const lastClaimStr = localStorage.getItem('th_last_streak_claim');
        const now = new Date();
        
        if (lastClaimStr) {
            const lastClaimDate = new Date(lastClaimStr);
            const diffDays = getUTCDayDifference(lastClaimDate, now);
            if (diffDays === 0) {
                alert('You have already claimed your daily streak bonus today!');
                claimBtn.disabled = false;
                updateHeaderStats();
                return;
            } else if (diffDays === 1) {
                userState.streak = (userState.streak % 7) + 1;
            } else {
                userState.streak = 1;
            }
        } else {
            userState.streak = 1;
        }

        const streakBonus = 50 * userState.streak;
        userState.balance += streakBonus;
        userState.claimedStreakToday = true;
        userState.lastStreakClaim = now.toISOString();
        
        // Save
        localStorage.setItem('th_last_streak_claim', now.toISOString());
        const mockUser = JSON.parse(localStorage.getItem('th_user'));
        mockUser.balance = userState.balance;
        mockUser.streak = userState.streak;
        mockUser.last_login = now.toISOString();
        localStorage.setItem('th_user', JSON.stringify(mockUser));

        // Log transaction
        const mockTxs = JSON.parse(localStorage.getItem('th_transactions'));
        mockTxs.unshift({
            id: Math.random().toString(36).substr(2, 9),
            amount: streakBonus,
            type: 'streak',
            description: `Daily login streak Day ${userState.streak} bonus (${streakBonus} 💎)`,
            created_at: now.toISOString()
        });
        localStorage.setItem('th_transactions', JSON.stringify(mockTxs));

        alert(`🔥 Streak Claimed! Earned ${streakBonus} 💎 (Day ${userState.streak})`);
        
        updateHeaderStats();
    } else {
        try {
            const response = await fetch(`${API_BASE_URL}/api/user/claim-streak`, {
                method: 'POST',
                headers: { 'X-Telegram-Init-Data': getAuthHeader() }
            });
            const data = await response.json();
            if (data.success) {
                userState.balance = data.new_balance;
                userState.streak = data.streak;
                userState.claimedStreakToday = true;
                userState.lastStreakClaim = data.last_streak_claim;
                alert(`🔥 Streak Claimed! Earned ${data.reward} 💎 (Day ${data.streak})`);
            } else {
                alert(data.error || 'Could not claim daily streak.');
            }
            updateHeaderStats();
        } catch (err) {
            alert('Failed to connect to server. Claiming locally.');
            useMockData = true;
            await claimDailyStreak();
        }
    }
}

/* ==========================================================================
   QUICK & PARTNER TASKS SECTION
   ========================================================================== */
async function loadQuickTasks() {
    const container = document.getElementById('quick-earn-container');
    if (!container) return;

    let tasks = [];
    if (useMockData) {
        tasks = JSON.parse(localStorage.getItem('th_tasks')).filter(t => t.task_type === 'quick');
        const completedIds = JSON.parse(localStorage.getItem('th_completed_tasks') || '[]');
        tasks = tasks.map(t => ({ ...t, completed: completedIds.includes(t.id) }));
    } else {
        try {
            const res = await fetch(`${API_BASE_URL}/api/tasks`, {
                headers: { 'X-Telegram-Init-Data': getAuthHeader() }
            });
            if (!res.ok) {
                throw new Error(`Tasks API responded with status ${res.status}`);
            }
            tasks = (await res.json()).filter(t => t.task_type === 'quick');
        } catch (err) {
            console.error(err);
            useMockData = true;
            return loadQuickTasks();
        }
    }

    // Filter out "Play Daily Mini Game" task since it is moved to its own beautiful section
    tasks = tasks.filter(t => t.id !== 't2' && !t.title.includes('Play Daily Mini Game'));

    // Deduplicate tasks by title to remove duplicates
    const seenTitles = new Set();
    tasks = tasks.filter(t => {
        if (seenTitles.has(t.title)) return false;
        seenTitles.add(t.title);
        return true;
    });

    container.innerHTML = '';
    if (tasks.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">No quick tasks available right now.</div>';
        return;
    }

    tasks.forEach(task => {
        const div = document.createElement('div');
        div.className = 'task-card';
        div.innerHTML = `
            <div class="task-header">
                <div class="task-info">
                    <div class="task-title">${task.title}</div>
                    <div class="task-desc">${task.description}</div>
                </div>
            </div>
            ${task.completed ? '<span class="completed-tag">✓ Completed</span>' : `<span class="reward-tag">Earn ${Math.floor(task.reward)} 💎</span>`}
            ${task.completed ? '' : `<button class="btn-primary" id="btn-task-${task.id}" onclick="startTask('${task.id}', '${task.url}')">Start Now →</button>`}
        `;
        container.appendChild(div);
    });
}

async function loadPartnerTasks() {
    const container = document.getElementById('custom-tasks-container');
    if (!container) return;

    let tasks = [];
    if (useMockData) {
        tasks = JSON.parse(localStorage.getItem('th_tasks')).filter(t => t.task_type === 'partner');
        const completedIds = JSON.parse(localStorage.getItem('th_completed_tasks') || '[]');
        tasks = tasks.map(t => ({ ...t, completed: completedIds.includes(t.id) }));
    } else {
        try {
            const res = await fetch(`${API_BASE_URL}/api/tasks`, {
                headers: { 'X-Telegram-Init-Data': getAuthHeader() }
            });
            if (!res.ok) {
                throw new Error(`Partner tasks API responded with status ${res.status}`);
            }
            tasks = (await res.json()).filter(t => t.task_type === 'partner');
        } catch (err) {
            console.error(err);
            useMockData = true;
            return loadPartnerTasks();
        }
    }

    // Deduplicate tasks by title to remove duplicates
    const seenTitles = new Set();
    tasks = tasks.filter(t => {
        if (seenTitles.has(t.title)) return false;
        seenTitles.add(t.title);
        return true;
    });

    container.innerHTML = '';
    if (tasks.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">No custom tasks available. Create one!</div>';
        return;
    }

    tasks.forEach(task => {
        const div = document.createElement('div');
        div.className = 'task-card';
        div.innerHTML = `
            <div class="task-header">
                <div class="task-info">
                    <div class="task-title">${task.title}</div>
                    <div class="task-desc">${task.description}</div>
                </div>
            </div>
            ${task.completed ? '<span class="completed-tag">✓ Completed</span>' : `<span class="reward-tag">Earn ${Math.floor(task.reward)} 💎</span>`}
            ${task.completed ? '' : `<button class="btn-primary" id="btn-task-${task.id}" onclick="startTask('${task.id}', '${task.url}')">Subscribe / Follow →</button>`}
        `;
        container.appendChild(div);
    });
}

// Complete Task Simulation / Verification
async function startTask(taskId, url) {
    // Open the partner link
    if (WebApp) {
        WebApp.openLink(url);
    } else {
        window.open(url, '_blank');
    }

    // Set interactive verification timer on the button
    const btn = document.getElementById(`btn-task-${taskId}`);
    if (!btn) return;

    btn.disabled = true;
    let timeRemaining = 10;
    btn.innerText = `Verifying in ${timeRemaining}s...`;

    const timer = setInterval(() => {
        timeRemaining -= 1;
        if (timeRemaining <= 0) {
            clearInterval(timer);
            btn.disabled = false;
            btn.innerText = 'Verify Completion';
            btn.onclick = () => verifyAndCompleteTask(taskId);
        } else {
            btn.innerText = `Verifying in ${timeRemaining}s...`;
        }
    }, 1000);
}

async function verifyAndCompleteTask(taskId) {
    const btn = document.getElementById(`btn-task-${taskId}`);
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Completing...';
    }

    if (useMockData) {
        const tasks = JSON.parse(localStorage.getItem('th_tasks'));
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        // Save Completed Task List
        const completedIds = JSON.parse(localStorage.getItem('th_completed_tasks') || '[]');
        if (completedIds.includes(taskId)) return;
        completedIds.push(taskId);
        localStorage.setItem('th_completed_tasks', JSON.stringify(completedIds));

        // Credit User Balance & Completions
        userState.balance += parseFloat(task.reward);
        userState.completions += 1;
        userState.level = Math.floor(userState.completions / 5) + 1;
        
        localStorage.setItem('th_completions_count', userState.completions.toString());
        const mockUser = JSON.parse(localStorage.getItem('th_user'));
        mockUser.balance = userState.balance;
        localStorage.setItem('th_user', JSON.stringify(mockUser));

        // Log Transaction
        const mockTxs = JSON.parse(localStorage.getItem('th_transactions'));
        mockTxs.unshift({
            id: Math.random().toString(36).substr(2, 9),
            amount: parseFloat(task.reward),
            type: 'task',
            description: `Completed task: ${task.title}`,
            created_at: new Date().toISOString()
        });
        localStorage.setItem('th_transactions', JSON.stringify(mockTxs));

        alert(`✅ Task Verified! Earned ${Math.floor(parseFloat(task.reward))} 💎!`);
        
        updateHeaderStats();
        loadTabContent();
    } else {
        try {
            const res = await fetch(`${API_BASE_URL}/api/tasks/complete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': getAuthHeader()
                },
                body: JSON.stringify({ taskId })
            });
            const data = await res.json();
            if (data.success) {
                userState.balance = data.new_balance;
                userState.completions += 1;
                userState.level = Math.floor(userState.completions / 5) + 1;
                alert(`✅ Task Verified! Earned ${Math.floor(data.reward)} 💎!`);
            } else {
                alert(`Error: ${data.error}`);
            }
            updateHeaderStats();
            loadTabContent();
        } catch (err) {
            console.error(err);
            alert('Server error, falling back to local verification.');
            useMockData = true;
            await verifyAndCompleteTask(taskId);
        }
    }
}

// Featured Task trigger
function startFeaturedTask() {
    alert("You're tracking the Weekly Flash Deal task! Finish all Quick and Partner tasks to satisfy the requirement.");
}

/* ==========================================================================
   WATCH & EARN (Ad Blocks)
   ========================================================================== */
const TOTAL_BLOCKS = 5;
const ADS_PER_BLOCK = 10;
const AD_REWARD = 25;
const BLOCK_BONUS = 500;

function getAdState() {
    const saved = localStorage.getItem('th_ad_blocks');
    if (saved) return JSON.parse(saved);
    const state = {};
    for(let b=1; b<=TOTAL_BLOCKS; b++) {
        state[b] = { watchedAds: [], completed: false };
    }
    return state;
}

function saveAdState(state) {
    localStorage.setItem('th_ad_blocks', JSON.stringify(state));
}

async function loadWatchStatus() {
    const container = document.getElementById('ad-blocks-container');
    if (!container) return;
    
    const state = getAdState();
    container.innerHTML = '';
    
    for(let b=1; b<=TOTAL_BLOCKS; b++) {
        const block = state[b];
        const progress = Math.floor((block.watchedAds.length / ADS_PER_BLOCK) * 100);
        const nextAdId = block.watchedAds.length + 1;
        
        const blockHtml = `
            <div class="task-card" style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="font-size: 28px;">📺</div>
                        <div>
                            <h4 style="margin: 0; color: #fff; font-size: 16px; font-weight: 600;">Premium Ad Block ${b}</h4>
                            <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">Watch ${ADS_PER_BLOCK} ads for ${BLOCK_BONUS} 💎 bonus</p>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 13px; color: ${block.completed ? '#10b981' : '#f97316'}; font-weight: bold;">
                            ${block.completed ? 'Completed' : `${block.watchedAds.length}/${ADS_PER_BLOCK} Ads`}
                        </span>
                    </div>
                </div>
                
                <div class="progress-bar" style="background: rgba(255,255,255,0.1); height: 6px; border-radius: 3px; overflow: hidden; margin-bottom: 12px;">
                    <div style="background: ${block.completed ? '#10b981' : '#f97316'}; height: 100%; width: ${progress}%; transition: 0.3s;"></div>
                </div>
                
                ${block.completed 
                    ? `<button class="btn-primary" style="width: 100%; background: #10b981; opacity: 0.8; cursor: default;" disabled>🎉 Bonus Claimed</button>`
                    : `<button class="btn-primary" id="ad-btn-${b}-${nextAdId}" onclick="startBlockAd(${b}, ${nextAdId})" style="width: 100%;">▶ Watch Ad ${nextAdId} (+${AD_REWARD} 💎)</button>`
                }
            </div>
        `;
        container.innerHTML += blockHtml;
    }
}

let isWatchingBlockAd = false;
async function startBlockAd(blockId, adId) {
    if (isWatchingBlockAd) return;
    
    const state = getAdState();
    if (state[blockId].watchedAds.includes(adId)) return;
    
    isWatchingBlockAd = true;
    const btn = document.getElementById(`ad-btn-${blockId}-${adId}`);
    
    let timeLeft = 5;
    btn.innerHTML = `<div style="font-size:16px; margin-top: 8px; color: #f97316; font-weight: bold;">${timeLeft}s</div>`;
    btn.style.borderColor = '#f97316';
    
    const timer = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0) {
            btn.innerHTML = `<div style="font-size:16px; margin-top: 8px; color: #f97316; font-weight: bold;">${timeLeft}s</div>`;
        } else {
            clearInterval(timer);
            isWatchingBlockAd = false;
            
            state[blockId].watchedAds.push(adId);
            userState.balance += AD_REWARD;
            
            if (state[blockId].watchedAds.length >= ADS_PER_BLOCK && !state[blockId].completed) {
                state[blockId].completed = true;
                userState.balance += BLOCK_BONUS;
                alert(`🎉 Block ${blockId} Completed! You earned a ${BLOCK_BONUS} 💎 bonus!`);
            }
            
            saveAdState(state);
            
            const mockUser = JSON.parse(localStorage.getItem('th_user') || "{}");
            mockUser.balance = userState.balance;
            localStorage.setItem('th_user', JSON.stringify(mockUser));
            
            updateHeaderStats();
            loadWatchStatus(); // Re-render
        }
    }, 1000);
}

/* ==========================================================================
   JOIN & EARN (Sponsored Channels)
   ========================================================================== */
function getMockChannels() {
    return [
        { id: 'ch_official', title: 'TaskHub Pro Official', description: 'Join our official channel for payout proofs & updates', reward: 200, invite_link: 'https://t.me/taskhub_pro', icon: '💎' },
        { id: 'ch_airdrops', title: 'Crypto Airdrops Hub', description: 'Daily verified airdrops and earning opportunities', reward: 150, invite_link: 'https://t.me/crypto_airdrops_hub', icon: '🪂' },
        { id: 'ch_deals', title: 'Earning Deals Zone', description: 'Exclusive high-paying offers and promo codes', reward: 150, invite_link: 'https://t.me/earning_deals_zone', icon: '🔥' },
        { id: 'ch_ton', title: 'TON Community News', description: 'Latest TON blockchain news and giveaways', reward: 120, invite_link: 'https://t.me/ton_community_news', icon: '🚀' }
    ];
}

async function loadChannels() {
    const container = document.getElementById('channels-container');
    if (!container) return;

    let channels = [];
    if (useMockData) {
        const completedIds = JSON.parse(localStorage.getItem('th_joined_channels') || '[]');
        channels = getMockChannels().map(ch => ({ ...ch, completed: completedIds.includes(ch.id) }));
    } else {
        try {
            const res = await fetch(`${API_BASE_URL}/api/channels`, {
                headers: { 'X-Telegram-Init-Data': getAuthHeader() }
            });
            if (!res.ok) throw new Error(`Channels API responded with status ${res.status}`);
            channels = await res.json();
        } catch (err) {
            console.error(err);
            useMockData = true;
            return loadChannels();
        }
    }

    container.innerHTML = '';
    if (channels.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">No sponsored channels available right now.</div>';
        return;
    }

    channels.forEach(ch => {
        const div = document.createElement('div');
        div.className = 'task-card channel-card';
        div.innerHTML = `
            <div class="channel-row">
                <div class="channel-icon">${ch.icon || '📢'}</div>
                <div class="channel-info">
                    <div class="task-title">${ch.title}</div>
                    <div class="task-desc">${ch.description || ''}</div>
                </div>
                <span class="reward-tag channel-reward">+${Math.floor(ch.reward)}</span>
            </div>
            ${ch.completed
                ? '<span class="completed-tag">✓ Joined & Claimed</span>'
                : `<button class="btn-primary" id="btn-channel-${ch.id}" onclick="joinChannel('${ch.id}', '${ch.invite_link}')">Join Channel →</button>`}
        `;
        container.appendChild(div);
    });
}

function joinChannel(channelId, inviteLink) {
    // Open the channel invite link
    if (WebApp && WebApp.openTelegramLink && inviteLink.includes('t.me')) {
        WebApp.openTelegramLink(inviteLink);
    } else if (WebApp) {
        WebApp.openLink(inviteLink);
    } else {
        window.open(inviteLink, '_blank');
    }

    // Set verification timer on the button
    const btn = document.getElementById(`btn-channel-${channelId}`);
    if (!btn) return;

    btn.disabled = true;
    let timeRemaining = 8;
    btn.innerText = `Verifying in ${timeRemaining}s...`;

    const timer = setInterval(() => {
        timeRemaining -= 1;
        if (timeRemaining <= 0) {
            clearInterval(timer);
            btn.disabled = false;
            btn.innerText = 'Verify & Claim Reward';
            btn.onclick = () => verifyChannelJoin(channelId);
        } else {
            btn.innerText = `Verifying in ${timeRemaining}s...`;
        }
    }, 1000);
}

async function verifyChannelJoin(channelId) {
    const btn = document.getElementById(`btn-channel-${channelId}`);
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Checking membership...';
    }

    if (useMockData) {
        const completedIds = JSON.parse(localStorage.getItem('th_joined_channels') || '[]');
        if (completedIds.includes(channelId)) return;

        const channel = getMockChannels().find(c => c.id === channelId);
        if (!channel) return;

        completedIds.push(channelId);
        localStorage.setItem('th_joined_channels', JSON.stringify(completedIds));

        userState.balance += parseFloat(channel.reward);
        const mockUser = JSON.parse(localStorage.getItem('th_user'));
        mockUser.balance = userState.balance;
        localStorage.setItem('th_user', JSON.stringify(mockUser));

        const mockTxs = JSON.parse(localStorage.getItem('th_transactions') || '[]');
        mockTxs.unshift({
            id: Math.random().toString(36).substr(2, 9),
            amount: parseFloat(channel.reward),
            type: 'channel',
            description: `Joined channel: ${channel.title}`,
            created_at: new Date().toISOString()
        });
        localStorage.setItem('th_transactions', JSON.stringify(mockTxs));

        alert(`🎉 Reward claimed! +${Math.floor(channel.reward)} 💎`);
        updateHeaderStats();
        loadChannels();
    } else {
        try {
            const res = await fetch(`${API_BASE_URL}/api/channels/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': getAuthHeader()
                },
                body: JSON.stringify({ channelId })
            });
            const data = await res.json();
            if (data.success) {
                userState.balance = data.new_balance;
                alert(`🎉 Reward claimed! +${Math.floor(data.reward)} 💎`);
                updateHeaderStats();
                loadChannels();
            } else {
                alert(`${data.error || 'Verification failed.'}`);
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = 'Verify & Claim Reward';
                    btn.onclick = () => verifyChannelJoin(channelId);
                }
            }
        } catch (err) {
            console.error(err);
            alert('Server error, falling back to local mode.');
            useMockData = true;
            await verifyChannelJoin(channelId);
        }
    }
}

/* ==========================================================================
   REFERRALS TAB (NEW SECTION)
   ========================================================================== */
async function loadReferralData() {
    // Generate referral link using Telegram ID
    const referralLink = `https://t.me/taskhub_pro_bot/app?startapp=${userState.telegram_id}`;
    const input = document.getElementById('referral-link-input');
    if (input) {
        input.value = referralLink;
    }

    let stats = { referrals: [], total_earnings: 0 };

    if (useMockData) {
        stats.referrals = JSON.parse(localStorage.getItem('th_referrals') || '[]');
        stats.total_earnings = stats.referrals.length * 250;
    } else {
        try {
            const res = await fetch(`${API_BASE_URL}/api/referrals`, {
                headers: { 'X-Telegram-Init-Data': getAuthHeader() }
            });
            if (!res.ok) {
                throw new Error(`Referrals API responded with status ${res.status}`);
            }
            stats = await res.json();
        } catch (err) {
            console.error(err);
            useMockData = true;
            return loadReferralData();
        }
    }

    // Set stats UI
    document.getElementById('ref-total-count').innerText = stats.referrals.length;
    document.getElementById('ref-total-earnings').innerText = `${Math.floor(stats.total_earnings)} 💎`;

    // Set Referred List UI
    const container = document.getElementById('referred-list-container');
    if (!container) return;

    container.innerHTML = '';
    if (stats.referrals.length === 0) {
        container.innerHTML = `<div class="no-referrals-msg">You have not referred any friends yet. Invite someone to start earning!</div>`;
        return;
    }

    stats.referrals.forEach(ref => {
        const div = document.createElement('div');
        div.className = 'leaderboard-item';
        const joinDate = new Date(ref.created_at || ref.joined_at || new Date()).toLocaleDateString();
        div.innerHTML = `
            <div class="rank-badge rank-other">👥</div>
            <div>
                <div class="player-name">@${ref.username || 'anonymous'}</div>
                <div class="player-status">Joined ${joinDate}</div>
            </div>
            <div class="score-display">+250 💎</div>
        `;
        container.appendChild(div);
    });
}

function copyReferralLink() {
    const input = document.getElementById('referral-link-input');
    input.select();
    input.setSelectionRange(0, 99999); // mobile support
    
    try {
        navigator.clipboard.writeText(input.value);
        alert('Referral link copied to clipboard!');
    } catch (e) {
        // Fallback
        document.execCommand('copy');
        alert('Referral link copied to clipboard!');
    }
}

function shareReferralLink() {
    const url = document.getElementById('referral-link-input').value;
    const text = "💰 Join TaskHub Pro today and start earning rewards for completing simple tasks! Instant payouts!";
    const tgShareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    
    if (WebApp) {
        WebApp.openTelegramLink(tgShareUrl);
    } else {
        window.open(tgShareUrl, '_blank');
    }
}

/* ==========================================================================
   WALLET TAB
   ========================================================================== */
async function loadTransactions() {
    const container = document.getElementById('transactions-container');
    if (!container) return;

    let txs = [];
    if (useMockData) {
        txs = JSON.parse(localStorage.getItem('th_transactions') || '[]');
    } else {
        try {
            // Fetch real transaction history from backend
            const res = await fetch(`${API_BASE_URL}/api/transactions`, {
                headers: { 'X-Telegram-Init-Data': getAuthHeader() }
            });
            if (!res.ok) {
                throw new Error(`Transactions API responded with status ${res.status}`);
            }
            txs = await res.json();
        } catch (e) {
            console.error('Failed to load transactions from API:', e);
            useMockData = true;
            txs = JSON.parse(localStorage.getItem('th_transactions') || '[]');
        }
    }

    container.innerHTML = '';
    if (txs.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">No transaction history.</div>';
        return;
    }

    txs.forEach(tx => {
        const isPositive = parseFloat(tx.amount) >= 0;
        const amountFormatted = isPositive ? `+${Math.floor(parseFloat(tx.amount))} <span class="gem-icon">💎</span>` : `-${Math.floor(Math.abs(parseFloat(tx.amount)))} <span class="gem-icon">💎</span>`;
        const div = document.createElement('div');
        div.className = 'transaction-item';
        const dateStr = new Date(tx.created_at).toLocaleDateString();
        div.innerHTML = `
            <div class="tx-info">
                <div class="tx-title">${tx.description || tx.type}</div>
                <div class="tx-date">${dateStr}</div>
            </div>
            <div class="tx-amount ${isPositive ? 'tx-positive' : 'tx-negative'}">${amountFormatted}</div>
        `;
        container.appendChild(div);
    });

    document.getElementById('wallet-balance-display').innerHTML = `${Math.floor(userState.balance)} <span class="gem-icon">💎</span>`;
}

function selectPaymentMethod(method, minLimit) {
    selectedPaymentMethod = method;
    minWithdrawalAmount = parseFloat(minLimit.replace('💎', '').replace('Gems', '').trim());
    
    document.querySelectorAll('.payment-card').forEach(card => {
        const text = card.querySelector('.task-title').innerText;
        if (text.includes(method.split(' ')[0])) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });

    // Update Withdrawal modal descriptions
    document.getElementById('selected-payout-method').innerText = method;
    const accountLabel = document.getElementById('withdraw-account-label');
    const accountInput = document.getElementById('withdraw-account');
    
    if (method.includes('Stars')) {
        accountLabel.innerText = 'Telegram Username / ID';
        accountInput.placeholder = '@username';
        accountInput.type = 'text';
    } else if (method.includes('USDT')) {
        accountLabel.innerText = 'TON Wallet Address (USDT)';
        accountInput.placeholder = 'EQD...';
        accountInput.type = 'text';
    } else {
        accountLabel.innerText = 'TON Wallet Address (Direct TON)';
        accountInput.placeholder = 'EQD...';
        accountInput.type = 'text';
    }
    
    // Update conversion display if modal is open
    updateWithdrawalConversion();
}

function updateWithdrawalConversion() {
    const amountVal = parseFloat(document.getElementById('withdraw-amount').value) || 0;
    const display = document.getElementById('withdraw-conversion-display');
    if (!display) return;
    
    if (selectedPaymentMethod.includes('Stars')) {
        // 1,000,000 coins = ~32 Stars
        const stars = Math.floor(amountVal * 32 / 1000000); 
        display.innerText = `Equivalent: ${stars} Telegram Stars`;
    } else if (selectedPaymentMethod.includes('USDT')) {
        // 1,000,000 coins = ~$0.48 USDT
        const usdt = (amountVal * 0.48 / 1000000).toFixed(2);
        display.innerText = `Equivalent: $${usdt} USDT (on TON)`;
    } else {
        // 1,000,000 coins = 0.30 TON
        const ton = (amountVal * 0.30 / 1000000).toFixed(4);
        display.innerText = `Equivalent: ${ton} TON`;
    }
}

function openWithdrawModal() {
    if (userState.balance < minWithdrawalAmount) {
        alert(`Minimum withdrawal amount for ${selectedPaymentMethod} is ${minWithdrawalAmount} 💎. Your current balance is ${Math.floor(userState.balance)} 💎.`);
        return;
    }
    
    document.getElementById('withdraw-amount').value = Math.floor(userState.balance);
    document.getElementById('withdraw-modal').classList.add('active');
    updateWithdrawalConversion();
}

function closeWithdrawModal() {
    document.getElementById('withdraw-modal').classList.remove('active');
}

async function submitWithdrawal() {
    const amountVal = parseFloat(document.getElementById('withdraw-amount').value);
    const accountVal = document.getElementById('withdraw-account').value.trim();

    if (isNaN(amountVal) || amountVal < minWithdrawalAmount) {
        alert(`Please enter a valid amount (minimum ${minWithdrawalAmount} 💎)`);
        return;
    }

    if (amountVal > userState.balance) {
        alert("Insufficient balance!");
        return;
    }

    if (!accountVal) {
        alert("Please enter payout account details!");
        return;
    }

    if (useMockData) {
        // Process withdrawal simulated
        userState.balance -= amountVal;
        
        // Save
        const mockUser = JSON.parse(localStorage.getItem('th_user'));
        mockUser.balance = userState.balance;
        localStorage.setItem('th_user', JSON.stringify(mockUser));

        // Add negative transaction log
        const mockTxs = JSON.parse(localStorage.getItem('th_transactions'));
        mockTxs.unshift({
            id: Math.random().toString(36).substr(2, 9),
            amount: -amountVal,
            type: 'withdraw',
            description: `Withdrawal via ${selectedPaymentMethod} (${accountVal}) - Pending Approval`,
            created_at: new Date().toISOString()
        });
        localStorage.setItem('th_transactions', JSON.stringify(mockTxs));

        let payoutToken = "TON";
        let payoutAmount = (amountVal / 1700).toFixed(2);
        if (selectedPaymentMethod.includes('Stars')) {
            payoutToken = "Stars";
            payoutAmount = Math.floor(amountVal / 17);
        } else if (selectedPaymentMethod.includes('USDT')) {
            payoutToken = "USDT";
        }

        alert(`💸 Withdrawal Request Submitted!\nAmount: ${amountVal} 💎 (Equivalent to ${payoutAmount} ${payoutToken})\nProcessing time: up to 24 hours.`);
        closeWithdrawModal();
        updateHeaderStats();
        loadTabContent();
    } else {
        try {
            const res = await fetch(`${API_BASE_URL}/api/wallet/withdraw`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': getAuthHeader()
                },
                body: JSON.stringify({
                    amount: amountVal,
                    method: selectedPaymentMethod,
                    accountDetails: accountVal
                })
            });
            const data = await res.json();
            if (data.success) {
                userState.balance = data.new_balance;
                alert(data.message);
                closeWithdrawModal();
            } else {
                alert(`Error: ${data.error}`);
            }
            updateHeaderStats();
            loadTabContent();
        } catch (err) {
            console.error(err);
            alert("Network error, processing request offline.");
            useMockData = true;
            await submitWithdrawal();
        }
    }
}

/* ==========================================================================
   LEADERBOARD & EXTRA LOADER
   ========================================================================== */
async function loadLeaderboard() {
    const container = document.getElementById('leaderboard-container');
    if (!container) return;

    let leaders = [];
    if (useMockData) {
        leaders = [
            { 
                username: userState.username || 'user', 
                first_name: userState.first_name || 'You', 
                balance: userState.balance || 0 
            }
        ];
    } else {
        try {
            const res = await fetch(`${API_BASE_URL}/api/leaderboard`, {
                headers: { 'X-Telegram-Init-Data': getAuthHeader() }
            });
            if (!res.ok) {
                throw new Error(`Leaderboard API responded with status ${res.status}`);
            }
            leaders = await res.json();
        } catch (err) {
            console.error(err);
            useMockData = true;
            return loadLeaderboard();
        }
    }

    container.innerHTML = '';
    
    // Sort leaders by balance desc just in case
    leaders.sort((a, b) => b.balance - a.balance);

    leaders.forEach((leader, idx) => {
        const div = document.createElement('div');
        div.className = 'leaderboard-item';
        
        let rankBadge = '🥇';
        let rankClass = 'rank-1';
        if (idx === 1) {
            rankBadge = '🥈';
            rankClass = 'rank-2';
        } else if (idx === 2) {
            rankBadge = '🥉';
            rankClass = 'rank-3';
        } else if (idx > 2) {
            rankBadge = `${idx + 1}`;
            rankClass = 'rank-other';
        }

        div.innerHTML = `
            <div class="rank-badge ${rankClass}">${rankBadge}</div>
            <div>
                <div class="player-name">${leader.first_name} (@${leader.username})</div>
                <div class="player-status">Active earner</div>
            </div>
            <div class="score-display">${Math.floor(leader.balance)} 💎</div>
        `;
        container.appendChild(div);
    });
}

/* ==========================================================================
   CLIENT SIDE SIMULATOR (LOCALSTORAGE DATABASE INITIALIZATION)
   ========================================================================== */
function setupMockDatabase() {
    let tgUser = {
        id: 123456789,
        username: 'guest_user',
        first_name: 'Guest',
        last_name: ''
    };
    
    if (WebApp && WebApp.initDataUnsafe && WebApp.initDataUnsafe.user) {
        tgUser = WebApp.initDataUnsafe.user;
    }

    let storedUser = localStorage.getItem('th_user');
    let parsedUser = storedUser ? JSON.parse(storedUser) : null;

    if (!parsedUser || parsedUser.telegram_id !== tgUser.id) {
        localStorage.setItem('th_user', JSON.stringify({
            telegram_id: tgUser.id,
            username: tgUser.username || '',
            first_name: tgUser.first_name || 'User',
            last_name: tgUser.last_name || '',
            balance: 0.00,
            streak: 1,
            last_login: new Date().toISOString()
        }));
        
        // Reset all progress for a new real user
        localStorage.setItem('th_last_streak_claim', '');
        localStorage.setItem('th_completions_count', '0');
        localStorage.setItem('th_completed_tasks', JSON.stringify([]));
        localStorage.setItem('th_transactions', JSON.stringify([]));
        localStorage.setItem('th_referrals', JSON.stringify([]));
        localStorage.removeItem('th_last_spin');
    }

    // Removed hardcoded mock tasks here as per request.
}

/* ==========================================================================
   PLAY MINI GAMES & EARN
   ========================================================================== */
let activeGame = null;
let gameTimer = null;
let gameScore = 0;

function toggleInlineGames() {
    const list = document.getElementById('inline-games-list');
    const arrow = document.getElementById('games-arrow');
    if (!list || !arrow) return;
    
    if (list.style.display === 'none') {
        list.style.display = 'block';
        arrow.style.transform = 'rotate(180deg)';
        arrow.style.transition = 'transform 0.3s ease';
    } else {
        list.style.display = 'none';
        arrow.style.transform = 'rotate(0deg)';
    }
}

let gameBetAmount = 0;

function openGame(gameType) {
    const modal = document.getElementById('game-modal');
    const title = document.getElementById('game-modal-title');
    const body = document.getElementById('game-modal-body');
    if (!modal || !title || !body) return;
    
    modal.classList.add('active');
    if (gameTimer) clearInterval(gameTimer);
    
    let gameName = "Mystery Box";
    if (gameType === 'clicker') gameName = "Coin Clicker";
    if (gameType === 'match3') gameName = "Memory Match";

    title.innerText = '🎰 ' + gameName + ' Setup';
    body.innerHTML = `
        <div style="text-align: center;">
            <p style="font-size: 11px; color: #64748b; margin-bottom: 12px;">Bet your coins. Win 1.8x Payout! (30% Win Chance)</p>
            <div style="margin-bottom: 15px;">
                <label style="font-size: 11px; color: #fff; display: block; margin-bottom: 6px;">Bet Amount (Min 300, Max 5000):</label>
                <input type="number" id="game-bet-input" value="300" min="300" max="5000" style="width: 80%; padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: white; text-align: center; font-size: 16px; font-weight: bold;">
            </div>
            <p id="bet-error" style="color: #ef4444; font-size: 10px; min-height: 12px; margin-bottom: 10px;"></p>
            <button class="btn-primary" onclick="startGameWithBet('${gameType}')">Start Game</button>
        </div>
    `;
}

function startGameWithBet(gameType) {
    const input = document.getElementById('game-bet-input');
    const err = document.getElementById('bet-error');
    if (!input || !err) return;
    
    let bet = parseInt(input.value);
    if (isNaN(bet) || bet < 300) { err.innerText = "Minimum bet is 300 coins."; return; }
    if (bet > 5000) { err.innerText = "Maximum bet is 5000 coins."; return; }
    if (bet > userState.balance) { err.innerText = "Insufficient balance."; return; }
    
    userState.balance -= bet;
    gameBetAmount = bet;
    saveGameState();
    
    const title = document.getElementById('game-modal-title');
    const body = document.getElementById('game-modal-body');
    
    if (gameType === 'clicker') {
        title.innerText = '⛏️ Coin Clicker';
        startClickerGame(body);
    } else if (gameType === 'match3') {
        title.innerText = '🧩 Memory Match';
        startMemoryGame(body);
    } else if (gameType === 'mystery') {
        title.innerText = '🎁 Mystery Box';
        startMysteryBoxGame(body);
    }
}

function processGameResult(wonMiniGame, container, tryAgainFnStr) {
    if (!wonMiniGame) {
        container.innerHTML = `
            <div style="text-align: center;">
                <span style="font-size: 40px;">😢</span>
                <h4 style="margin: 10px 0 4px; color: #ef4444; font-size: 14px;">Game Over</h4>
                <p style="font-size: 11px; color: #64748b; margin-bottom: 12px;">You failed the game and lost your bet.</p>
                <div style="display: flex; gap: 8px; justify-content: center;">
                    <button class="btn-outline" onclick="closeGameModal()" style="padding: 6px 14px; font-size: 11px; width: auto; margin-top: 0;">Close</button>
                    <button class="btn-primary" onclick="${tryAgainFnStr}" style="padding: 6px 16px; font-size: 11px; width: auto;">Try Again</button>
                </div>
            </div>
        `;
        return;
    }
    
    const wonRNG = Math.random() <= 0.30;
    if (wonRNG) {
        const reward = Math.floor(gameBetAmount * 1.8);
        userState.balance += reward;
        saveGameState();
        
        container.innerHTML = `
            <div style="text-align: center;">
                <span style="font-size: 40px;">🎉</span>
                <h4 style="margin: 10px 0 4px; color: #10b981; font-size: 14px;">You Won!</h4>
                <p style="font-size: 11px; color: #64748b; margin-bottom: 12px;">You beat the odds! +${reward} 💎!</p>
                <div style="display: flex; gap: 8px; justify-content: center;">
                    <button class="btn-outline" onclick="closeGameModal()" style="padding: 6px 14px; font-size: 11px; width: auto; margin-top: 0;">Close</button>
                    <button class="btn-primary" onclick="${tryAgainFnStr}" style="padding: 6px 16px; font-size: 11px; width: auto;">Play Again</button>
                </div>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div style="text-align: center;">
                <span style="font-size: 40px;">💔</span>
                <h4 style="margin: 10px 0 4px; color: #ef4444; font-size: 14px;">Bad Luck!</h4>
                <p style="font-size: 11px; color: #64748b; margin-bottom: 12px;">You played well, but didn't win the 30% chance this time.</p>
                <div style="display: flex; gap: 8px; justify-content: center;">
                    <button class="btn-outline" onclick="closeGameModal()" style="padding: 6px 14px; font-size: 11px; width: auto; margin-top: 0;">Close</button>
                    <button class="btn-primary" onclick="${tryAgainFnStr}" style="padding: 6px 16px; font-size: 11px; width: auto;">Try Again</button>
                </div>
            </div>
        `;
    }
}

function saveGameState() {
    const mockUser = JSON.parse(localStorage.getItem('th_user') || "{}");
    mockUser.balance = userState.balance;
    localStorage.setItem('th_user', JSON.stringify(mockUser));
    updateHeaderStats();
}

function startMysteryBoxGame(container) {
    container.innerHTML = `
        <div style="text-align: center; width: 100%;">
            <p style="font-size: 11px; color: #64748b; margin-bottom: 15px;">Pick a Mystery Box!</p>
            <div style="display: flex; justify-content: space-around; margin: 20px 0;">
                <div onclick="openMysteryBox(this, document.getElementById('game-modal-body'))" style="font-size: 45px; cursor: pointer; transition: 0.2s;">🎁</div>
                <div onclick="openMysteryBox(this, document.getElementById('game-modal-body'))" style="font-size: 45px; cursor: pointer; transition: 0.2s;">🎁</div>
                <div onclick="openMysteryBox(this, document.getElementById('game-modal-body'))" style="font-size: 45px; cursor: pointer; transition: 0.2s;">🎁</div>
            </div>
        </div>
    `;
}

function openMysteryBox(el, container) {
    el.style.transform = "scale(1.2)";
    setTimeout(() => {
        processGameResult(true, container, "openGame('mystery')");
    }, 500);
}


function closeGameModal() {
    const modal = document.getElementById('game-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    if (gameTimer) {
        clearInterval(gameTimer);
        gameTimer = null;
    }
}

function startClickerGame(container) {
    gameScore = 0;
    const targetScore = 50;
    let timeLeft = 20;
    
    container.innerHTML = `
        <div style="text-align: center; width: 100%;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 8px; font-weight: 700; color: var(--text-color, white);">
                <span>Time Left: <strong id="clicker-timer" style="color: #ef4444;">20s</strong></span>
                <span>Taps: <strong id="clicker-score">0/50</strong></span>
            </div>
            <div class="progress-bar" style="height: 8px; margin-bottom: 16px; background: rgba(0,0,0,0.2); border-radius: 4px; overflow: hidden;">
                <div id="clicker-progress" class="progress-fill" style="width: 0%; height: 100%; background: #06b6d4; transition: width 0.1s;"></div>
            </div>
            <div id="clicker-coin" style="font-size: 64px; cursor: pointer; user-select: none; margin: 20px 0; transition: transform 0.1s ease; display: inline-block;">🪙</div>
            <p style="font-size: 10px; color: #64748b;">Tap the giant coin 50 times before the timer runs out!</p>
        </div>
    `;
    
    const timerEl = document.getElementById('clicker-timer');
    const scoreEl = document.getElementById('clicker-score');
    const progressEl = document.getElementById('clicker-progress');
    const coinEl = document.getElementById('clicker-coin');
    
    gameTimer = setInterval(() => {
        timeLeft--;
        if (timerEl) timerEl.innerText = `${timeLeft}s`;
        
        if (timeLeft <= 0) {
            clearInterval(gameTimer);
            gameTimer = null;
            processGameResult(false, container, "openGame('clicker')");
        }
    }, 1000);
    
    coinEl.addEventListener('click', () => {
        if (timeLeft <= 0) return;
        gameScore++;
        
        coinEl.style.transform = 'scale(0.85)';
        setTimeout(() => {
            coinEl.style.transform = 'scale(1)';
        }, 80);
        
        if (scoreEl) scoreEl.innerText = `${gameScore}/${targetScore}`;
        if (progressEl) progressEl.style.width = `${(gameScore / targetScore) * 100}%`;
        
        if (gameScore >= targetScore) {
            clearInterval(gameTimer);
            gameTimer = null;
            processGameResult(true, container, "openGame('clicker')");
        }
    });
}

function startMemoryGame(container) {
    const emojis = ['💎', '💎', '💰', '💰', '🎰', '🎰', '🎡', '🎡', '🎮', '🎮', '⚡', '⚡', '🤝', '🤝', '👑', '👑'];
    emojis.sort(() => Math.random() - 0.5);
    
    let timeLeft = 35;
    let flippedCards = [];
    let matchedPairs = 0;
    
    container.innerHTML = `
        <div style="text-align: center; width: 100%;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 8px; font-weight: 700; color: var(--text-color, white);">
                <span>Time Left: <strong id="memory-timer" style="color: #ef4444;">35s</strong></span>
                <span>Matches: <strong id="memory-score">0/8</strong></span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 10px 0;" id="memory-grid">
                <!-- Cards will be injected -->
            </div>
        </div>
    `;
    
    const gridEl = document.getElementById('memory-grid');
    const timerEl = document.getElementById('memory-timer');
    const scoreEl = document.getElementById('memory-score');
    
    emojis.forEach((emoji, index) => {
        const card = document.createElement('div');
        card.className = 'memory-card-item';
        card.dataset.index = index;
        card.dataset.emoji = emoji;
        card.style.cssText = `
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            cursor: pointer;
            user-select: none;
            transition: all 0.2s ease;
        `;
        
        card.innerHTML = '❓';
        
        card.addEventListener('click', () => {
            if (timeLeft <= 0) return;
            if (card.classList.contains('flipped') || card.classList.contains('matched')) return;
            if (flippedCards.length >= 2) return;
            
            card.innerHTML = emoji;
            card.classList.add('flipped');
            card.style.background = 'rgba(6, 182, 212, 0.15)';
            card.style.borderColor = '#06b6d4';
            flippedCards.push(card);
            
            if (flippedCards.length === 2) {
                const card1 = flippedCards[0];
                const card2 = flippedCards[1];
                
                if (card1.dataset.emoji === card2.dataset.emoji) {
                    card1.classList.add('matched');
                    card2.classList.add('matched');
                    card1.style.background = 'rgba(16, 185, 129, 0.15)';
                    card1.style.borderColor = '#10b981';
                    card2.style.background = 'rgba(16, 185, 129, 0.15)';
                    card2.style.borderColor = '#10b981';
                    
                    flippedCards = [];
                    matchedPairs++;
                    if (scoreEl) scoreEl.innerText = `${matchedPairs}/8`;
                    
                    if (matchedPairs >= 8) {
                        clearInterval(gameTimer);
                        gameTimer = null;
                        processGameResult(true, container, "openGame('match3')");
                    }
                } else {
                    setTimeout(() => {
                        card1.innerHTML = '❓';
                        card1.classList.remove('flipped');
                        card1.style.background = 'rgba(255, 255, 255, 0.06)';
                        card1.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                        
                        card2.innerHTML = '❓';
                        card2.classList.remove('flipped');
                        card2.style.background = 'rgba(255, 255, 255, 0.06)';
                        card2.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                        
                        flippedCards = [];
                    }, 800);
                }
            }
        });
        
        gridEl.appendChild(card);
    });
    
    gameTimer = setInterval(() => {
        timeLeft--;
        if (timerEl) timerEl.innerText = `${timeLeft}s`;
        
        if (timeLeft <= 0) {
            clearInterval(gameTimer);
            gameTimer = null;
            container.innerHTML = `
                <div style="text-align: center;">
                    <span style="font-size: 40px;">😢</span>
                    <h4 style="margin: 10px 0 4px; color: #ef4444; font-size: 14px;">Time's Up!</h4>
                    <p style="font-size: 10px; color: #64748b; margin-bottom: 12px;">You matched ${matchedPairs} pairs. Try again!</p>
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button class="btn-outline" onclick="renderGamesList()" style="padding: 6px 14px; font-size: 11px; width: auto; margin-top: 0;">Back to Hub</button>
                        <button class="btn-primary" onclick="openGame('match3')" style="padding: 6px 16px; font-size: 11px; width: auto;">Try Again</button>
                    </div>
                </div>
            `;
        }
    }, 1000);
}

async function awardGameReward(amount, gameName) {
    if (useMockData) {
        userState.balance += amount;
        
        // Save
        const mockUser = JSON.parse(localStorage.getItem('th_user'));
        mockUser.balance = userState.balance;
        localStorage.setItem('th_user', JSON.stringify(mockUser));

        // Log transaction
        const mockTxs = JSON.parse(localStorage.getItem('th_transactions'));
        mockTxs.unshift({
            id: Math.random().toString(36).substr(2, 9),
            amount: amount,
            type: 'task',
            description: `Played mini game: ${gameName} reward`,
            created_at: new Date().toISOString()
        });
        localStorage.setItem('th_transactions', JSON.stringify(mockTxs));
        updateHeaderStats();
    } else {
        try {
            const response = await fetch(`${API_BASE_URL}/api/user/game-reward`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': getAuthHeader()
                },
                body: JSON.stringify({ amount: amount, game_name: gameName })
            });
            const data = await response.json();
            if (data.success) {
                userState.balance = data.new_balance;
            }
            updateHeaderStats();
        } catch (err) {
            console.error("Failed to post game reward to server, falling back to local simulation.", err);
            userState.balance += amount;
            updateHeaderStats();
        }
    }
}

/* ==========================================================================
   CREATE TASK FLOW
   ========================================================================== */
function openCreateTaskModal() { 
    const m = document.getElementById("create-task-modal"); 
    if(m) m.classList.add("active"); 
}
function closeCreateTaskModal() { 
    const m = document.getElementById("create-task-modal"); 
    if(m) m.classList.remove("active"); 
}

function updateCreateTaskPrice() {
  const reward = parseInt(document.getElementById("create-task-reward").value) || 0;
  const maxUsers = parseInt(document.getElementById("create-task-max-users").value) || 0;
  const btn = document.getElementById("pay-ton-btn");
  
  if (reward > 0 && maxUsers > 0) {
      // Base Cost: (Reward per User * Max Users) / 1,000,000 * 0.30
      // 1.5x Multiplier for profit
      const totalGems = reward * maxUsers;
      let costInTon = (totalGems / 1000000) * 0.30 * 1.5;
      btn.innerText = `💎 Pay ${costInTon.toFixed(4)} TON & Create`;
  } else {
      btn.innerText = `💎 Pay with TON & Create`;
  }
}

async function submitCreateTask() {
  const title = document.getElementById("create-task-title").value.trim();
  const desc = document.getElementById("create-task-desc").value.trim();
  const reward = document.getElementById("create-task-reward").value;
  const maxUsers = document.getElementById("create-task-max-users").value;
  const url = document.getElementById("create-task-url").value.trim();
  
  if(!title || !desc || !reward || !maxUsers || !url) {
    alert("Please fill all fields.");
    return;
  }
  
  if (parseInt(reward) > 5000) {
    alert("Reward per user cannot exceed 5000 coins.");
    return;
  }
  
  if (parseInt(maxUsers) > 1000) {
    alert("Max users cannot exceed 1000.");
    return;
  }
  
  if (!tonConnectUI || !tonConnectUI.connected) {
    alert("Please connect your TON wallet using the button in the top right corner first!");
    if(tonConnectUI) tonConnectUI.connectWallet();
    return;
  }
  
  const btn = document.getElementById("pay-ton-btn");
  const originalText = btn.innerText;
  btn.innerText = "Please confirm in your Wallet...";
  btn.disabled = true;
  
  try {
    // 1 TON = 10^9 nanoTON
    const totalGems = reward * maxUsers;
    const costInTon = (totalGems / 1000000) * 0.30 * 1.5;
    const nanoTonCost = Math.floor(costInTon * 10**9).toString();
    
    const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 300, // 5 minutes to confirm
        messages: [
            {
                // REPLACE THIS WITH YOUR REAL WALLET ADDRESS
                address: "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ",
                amount: nanoTonCost
            }
        ]
    };
    
    // Request wallet to sign and send the transaction
    const txResult = await tonConnectUI.sendTransaction(transaction);
    
    if (txResult && txResult.boc) {
      btn.innerText = "Saving Task...";
      
      const response = await fetch(`${API_BASE_URL}/api/tasks/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": getAuthHeader()
        },
        body: JSON.stringify({ 
          title, 
          description: desc, 
          reward: parseInt(reward), 
          max_users: parseInt(maxUsers), 
          url, 
          task_type: "partner",
          transaction_hash: txResult.boc // Pass BOC to backend if they want to verify it
        })
      });
      
      if(response.ok) {
        alert("Task created successfully! Paid with real TON.");
        closeCreateTaskModal();
        document.getElementById("create-task-title").value = "";
        document.getElementById("create-task-desc").value = "";
        document.getElementById("create-task-reward").value = "";
        document.getElementById("create-task-max-users").value = "";
        document.getElementById("create-task-url").value = "";
        document.getElementById("pay-ton-btn").innerText = "💎 Pay with TON & Create";
        if(activeTab === "tasks") {
          loadTabContent("tasks");
        }
      } else {
        const data = await response.json();
        alert("Failed to save task: " + (data.error || "Unknown Error"));
      }
    }
  } catch(err) {
    if (err.message && err.message.includes("UserRejectsError")) {
        alert("You cancelled the transaction.");
    } else {
        alert("Transaction failed. Please try again.");
    }
    console.error("TON transaction error:", err);
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

/* ==========================================================================
   i18n - MULTI-LANGUAGE SYSTEM
   ========================================================================== */
const languages = {
    en: { name: "English", flag: "🇬🇧", dict: { tabHome: "Home", tabTasks: "Tasks", tabWatch: "Watch", tabJoin: "Join", tabSurveys: "Surveys", tabRefer: "Refer", tabRewards: "Rewards", tabWallet: "Wallet", selectLanguage: "🌐 Select Language" } },
    ru: { name: "Русский", flag: "🇷🇺", dict: { tabHome: "Главная", tabTasks: "Задания", tabSurveys: "Опросы", tabRefer: "Рефералы", tabRewards: "Награды", tabWallet: "Кошелек", selectLanguage: "🌐 Выберите язык" } },
    es: { name: "Español", flag: "🇪🇸", dict: { tabHome: "Inicio", tabTasks: "Tareas", tabSurveys: "Encuestas", tabRefer: "Referir", tabRewards: "Premios", tabWallet: "Billetera", selectLanguage: "🌐 Seleccionar idioma" } },
    hi: { name: "हिन्दी", flag: "🇮🇳", dict: { tabHome: "होम", tabTasks: "कार्य", tabSurveys: "सर्वेक्षण", tabRefer: "संदर्भ", tabRewards: "इनाम", tabWallet: "बटुआ", selectLanguage: "🌐 भाषा चुनें" } },
    id: { name: "Bahasa", flag: "🇮🇩", dict: { tabHome: "Beranda", tabTasks: "Tugas", tabSurveys: "Survei", tabRefer: "Rujuk", tabRewards: "Hadiah", tabWallet: "Dompet", selectLanguage: "🌐 Pilih Bahasa" } },
    pt: { name: "Português", flag: "🇧🇷", dict: { tabHome: "Início", tabTasks: "Tarefas", tabSurveys: "Pesquisas", tabRefer: "Indicar", tabRewards: "Prêmios", tabWallet: "Carteira", selectLanguage: "🌐 Escolha o Idioma" } },
    vi: { name: "Tiếng Việt", flag: "🇻🇳", dict: { tabHome: "Trang chủ", tabTasks: "Nhiệm vụ", tabSurveys: "Khảo sát", tabRefer: "Giới thiệu", tabRewards: "Phần thưởng", tabWallet: "Ví", selectLanguage: "🌐 Chọn Ngôn ngữ" } },
    tr: { name: "Türkçe", flag: "🇹🇷", dict: { tabHome: "Ana Sayfa", tabTasks: "Görevler", tabSurveys: "Anketler", tabRefer: "Davet", tabRewards: "Ödüller", tabWallet: "Cüzdan", selectLanguage: "🌐 Dil Seç" } },
    uk: { name: "Українська", flag: "🇺🇦", dict: { tabHome: "Головна", tabTasks: "Завдання", tabSurveys: "Опитування", tabRefer: "Реферали", tabRewards: "Нагороди", tabWallet: "Гаманець", selectLanguage: "🌐 Оберіть мову" } },
    fr: { name: "Français", flag: "🇫🇷", dict: { tabHome: "Accueil", tabTasks: "Tâches", tabSurveys: "Sondages", tabRefer: "Parrainer", tabRewards: "Récompenses", tabWallet: "Portefeuille", selectLanguage: "🌐 Choisir la langue" } },
    de: { name: "Deutsch", flag: "🇩🇪", dict: { tabHome: "Start", tabTasks: "Aufgaben", tabSurveys: "Umfragen", tabRefer: "Einladen", tabRewards: "Belohnungen", tabWallet: "Brieftasche", selectLanguage: "🌐 Sprache wählen" } },
    it: { name: "Italiano", flag: "🇮🇹", dict: { tabHome: "Home", tabTasks: "Compiti", tabSurveys: "Sondaggi", tabRefer: "Invita", tabRewards: "Premi", tabWallet: "Portafoglio", selectLanguage: "🌐 Scegli lingua" } },
    ar: { name: "العربية", flag: "🇸🇦", dict: { tabHome: "الرئيسية", tabTasks: "مهام", tabSurveys: "استطلاعات", tabRefer: "إحالة", tabRewards: "مكافآت", tabWallet: "محفظة", selectLanguage: "🌐 اختر اللغة" } },
    fa: { name: "فارسی", flag: "🇮🇷", dict: { tabHome: "خانه", tabTasks: "وظایف", tabSurveys: "نظرسنجی", tabRefer: "معرفی", tabRewards: "جوایز", tabWallet: "کیف پول", selectLanguage: "🌐 انتخاب زبان" } },
    zh: { name: "中文", flag: "🇨🇳", dict: { tabHome: "首页", tabTasks: "任务", tabSurveys: "问卷", tabRefer: "推荐", tabRewards: "奖励", tabWallet: "钱包", selectLanguage: "🌐 选择语言" } }
};

let currentLang = "en";

function initLanguage() {
    let detectLang = "en";
    if (WebApp && WebApp.initDataUnsafe && WebApp.initDataUnsafe.user) {
        const userLang = WebApp.initDataUnsafe.user.language_code;
        if (userLang && languages[userLang]) {
            detectLang = userLang;
        }
    }
    const savedLang = localStorage.getItem("th_lang");
    if (savedLang && languages[savedLang]) {
        detectLang = savedLang;
    }
    
    setLanguage(detectLang);
    renderLanguageModal();
}

function setLanguage(langCode) {
    if (!languages[langCode]) return;
    currentLang = langCode;
    localStorage.setItem("th_lang", langCode);
    
    const dict = languages[langCode].dict;
    document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        if (dict[key]) {
            el.innerText = dict[key];
        }
    });
    
    // update modal active state if open
    renderLanguageModal();
}

function renderLanguageModal() {
    const container = document.getElementById("language-modal-body");
    if (!container) return;
    
    container.innerHTML = "";
    Object.keys(languages).forEach(code => {
        const lang = languages[code];
        const isActive = code === currentLang;
        const div = document.createElement("div");
        div.className = `lang-card ${isActive ? 'active' : ''}`;
        div.innerHTML = `<div style="font-size: 20px;">${lang.flag}</div><div>${lang.name}</div>`;
        div.onclick = () => {
            setLanguage(code);
            closeLangModal();
        };
        container.appendChild(div);
    });
}

function openLangModal() {
    const m = document.getElementById("language-modal");
    if(m) m.classList.add("active");
}

function closeLangModal() {
    const m = document.getElementById("language-modal");
    if(m) m.classList.remove("active");
}

// Ensure initLanguage runs on load
document.addEventListener("DOMContentLoaded", () => {
    initLanguage();
});
// Since DOMContentLoaded might have fired already depending on script placement
initLanguage();

// --- TIC TAC TOE LOGIC ---
let tttBoard = ['', '', '', '', '', '', '', '', ''];
let tttCurrentPlayer = 'X'; // User is X
let tttGameActive = false;
let tttGameMode = 'bot'; // Play against bot

function openTicTacToe() {
    const modalTitle = document.getElementById('game-modal-title');
    const modalBody = document.getElementById('game-modal-body');
    
    modalTitle.innerHTML = '❌ Tic Tac Toe ⭕';
    
    // Build Game UI
    modalBody.innerHTML = `
        <div class="ttt-status" id="ttt-status">Your turn (X)</div>
        <div class="ttt-board" id="ttt-board">
            <div class="ttt-cell" onclick="tttCellClick(0)" id="cell-0"></div>
            <div class="ttt-cell" onclick="tttCellClick(1)" id="cell-1"></div>
            <div class="ttt-cell" onclick="tttCellClick(2)" id="cell-2"></div>
            <div class="ttt-cell" onclick="tttCellClick(3)" id="cell-3"></div>
            <div class="ttt-cell" onclick="tttCellClick(4)" id="cell-4"></div>
            <div class="ttt-cell" onclick="tttCellClick(5)" id="cell-5"></div>
            <div class="ttt-cell" onclick="tttCellClick(6)" id="cell-6"></div>
            <div class="ttt-cell" onclick="tttCellClick(7)" id="cell-7"></div>
            <div class="ttt-cell" onclick="tttCellClick(8)" id="cell-8"></div>
        </div>
        <button class="btn-primary" onclick="tttRestart()" style="margin-top:16px;">Restart Game</button>
    `;
    
    document.getElementById('game-modal').classList.add('active');
    tttRestart();
}

function closeGameModal() {
    document.getElementById('game-modal').classList.remove('active');
}

function tttRestart() {
    tttBoard = ['', '', '', '', '', '', '', '', ''];
    tttCurrentPlayer = 'X';
    tttGameActive = true;
    document.getElementById('ttt-status').innerText = 'Your turn (X)';
    document.getElementById('ttt-status').style.color = 'white';
    
    for (let i = 0; i < 9; i++) {
        const cell = document.getElementById(`cell-${i}`);
        cell.innerHTML = '';
        cell.className = 'ttt-cell';
    }
}

function tttCellClick(index) {
    if (tttBoard[index] !== '' || !tttGameActive || tttCurrentPlayer !== 'X') return;
    
    tttMakeMove(index, 'X');
    
    if (tttGameActive) {
        tttCurrentPlayer = 'O';
        document.getElementById('ttt-status').innerText = 'Bot is thinking...';
        setTimeout(tttBotMove, 600);
    }
}

function tttMakeMove(index, player) {
    tttBoard[index] = player;
    const cell = document.getElementById(`cell-${index}`);
    cell.innerHTML = player === 'X' ? '<img src="img_x.jpg" style="width: 80%; height: 80%; object-fit: contain; border-radius: 12px; pointer-events: none;">' : '<img src="img_o.jpg" style="width: 80%; height: 80%; object-fit: contain; border-radius: 12px; pointer-events: none;">';
    cell.classList.add(player === 'X' ? 'x-mark' : 'o-mark');
    
    tttCheckWin();
}

function tttBotMove() {
    if (!tttGameActive) return;
    
    // 1. Try to win
    let move = tttFindBestMove('O');
    // 2. Block user
    if (move === -1) move = tttFindBestMove('X');
    // 3. Random empty cell
    if (move === -1) {
        let emptyCells = [];
        for (let i = 0; i < 9; i++) {
            if (tttBoard[i] === '') emptyCells.push(i);
        }
        if (emptyCells.length > 0) {
            move = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        }
    }
    
    if (move !== -1) {
        tttMakeMove(move, 'O');
        if (tttGameActive) {
            tttCurrentPlayer = 'X';
            document.getElementById('ttt-status').innerText = 'Your turn (X)';
        }
    }
}

function tttFindBestMove(player) {
    const winConditions = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
        [0, 4, 8], [2, 4, 6]             // diagonals
    ];
    
    for (let i = 0; i < winConditions.length; i++) {
        const [a, b, c] = winConditions[i];
        if (tttBoard[a] === player && tttBoard[b] === player && tttBoard[c] === '') return c;
        if (tttBoard[a] === player && tttBoard[c] === player && tttBoard[b] === '') return b;
        if (tttBoard[b] === player && tttBoard[c] === player && tttBoard[a] === '') return a;
    }
    return -1;
}

function tttCheckWin() {
    const winConditions = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], 
        [0, 3, 6], [1, 4, 7], [2, 5, 8], 
        [0, 4, 8], [2, 4, 6]             
    ];
    
    let roundWon = false;
    let winner = null;
    
    for (let i = 0; i < 8; i++) {
        const [a, b, c] = winConditions[i];
        if (tttBoard[a] && tttBoard[a] === tttBoard[b] && tttBoard[a] === tttBoard[c]) {
            roundWon = true;
            winner = tttBoard[a];
            break;
        }
    }
    
    if (roundWon) {
        tttGameActive = false;
        const status = document.getElementById('ttt-status');
        if (winner === 'X') {
            status.innerText = '🎉 You Won +20 💎!';
            status.style.color = '#10b981';
            awardGameReward(20, 'Tic Tac Toe'); // Award shards
        } else {
            status.innerText = '💀 Bot Won!';
            status.style.color = '#f43f5e';
        }
        return;
    }
    
    if (!tttBoard.includes('')) {
        tttGameActive = false;
        document.getElementById('ttt-status').innerText = '🤝 Draw! +5 💎';
        document.getElementById('ttt-status').style.color = '#fbbf24';
        awardGameReward(5, 'Tic Tac Toe'); // Consolation shards
        return;
    }
}

// --- LUCKY CHEST LOGIC ---
let chestOpened = false;

function openLuckyChestGame() {
    chestOpened = false;
    const modalTitle = document.getElementById('game-modal-title');
    const modalBody = document.getElementById('game-modal-body');
    
    modalTitle.innerHTML = '🧰 Lucky Chest';
    
    // Build Game UI using the 3D images
    modalBody.innerHTML = `
        <div style="text-align: center; width: 100%;">
            <p style="font-size: 14px; font-weight: 600; margin-bottom: 20px;">Pick a Chest to Reveal Your Prize!</p>
            <div style="display: flex; justify-content: space-around; margin: 20px 0;">
                <div onclick="openSingleChest(this, 1)" style="cursor: pointer; transition: 0.2s;" class="chest-item">
                    <img src="img_chest_card.jpg" style="width: 80px; height: 80px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); pointer-events: none;">
                </div>
                <div onclick="openSingleChest(this, 2)" style="cursor: pointer; transition: 0.2s;" class="chest-item">
                    <img src="img_chest_card.jpg" style="width: 80px; height: 80px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); pointer-events: none;">
                </div>
                <div onclick="openSingleChest(this, 3)" style="cursor: pointer; transition: 0.2s;" class="chest-item">
                    <img src="img_chest_card.jpg" style="width: 80px; height: 80px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); pointer-events: none;">
                </div>
            </div>
            <div id="chest-result" style="font-size: 16px; font-weight: bold; margin-top: 20px; min-height: 24px;"></div>
        </div>
    `;
    
    document.getElementById('game-modal').classList.add('active');
}

function openSingleChest(el, chestId) {
    if (chestOpened) return;
    chestOpened = true;
    
    el.style.transform = "scale(1.15)";
    el.style.filter = "brightness(1.5)";
    
    document.getElementById('chest-result').innerText = 'Opening...';
    
    setTimeout(() => {
        const r = Math.random();
        let amount = 5;
        if (r > 0.95) amount = 100;
        else if (r > 0.8) amount = 50;
        else if (r > 0.5) amount = 20;
        else if (r > 0.2) amount = 15;
        else amount = 10;
        
        el.innerHTML = '<div style="font-size: 60px;">🎉</div>';
        el.style.filter = "none";
        
        document.getElementById('chest-result').innerHTML = `<span style="color: #10b981;">You found +${amount} 💎!</span>`;
        
        document.querySelectorAll('.chest-item').forEach(chest => {
            if (chest !== el) chest.style.opacity = '0.3';
        });
        
        awardGameReward(amount, 'Lucky Chest');
        
        setTimeout(() => {
            document.getElementById('chest-result').innerHTML += '<br><button class="btn-primary" onclick="openLuckyChestGame()" style="margin-top: 15px; font-size: 12px; padding: 8px 16px;">Play Again</button>';
        }, 1000);
        
    }, 1000);
}
