import sys

with open(r"C:\TaskHub_Pro\frontend\app.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if "WATCH & EARN" in line:
        start_idx = i - 1
    elif "JOIN SPONSORED" in line:
        end_idx = i - 1
        break

if start_idx == -1 or end_idx == -1:
    print("Could not find watch block")
    sys.exit(1)

new_logic = """/* ==========================================================================
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
        
        let adsHtml = '';
        for(let a=1; a<=ADS_PER_BLOCK; a++) {
            const isWatched = block.watchedAds.includes(a);
            adsHtml += `
                <div class="ad-item" id="ad-btn-${b}-${a}"
                     onclick="${isWatched ? '' : `startBlockAd(${b}, ${a})`}"
                     style="background: ${isWatched ? '#10b981' : 'rgba(255,255,255,0.05)'}; 
                            border: 1px solid ${isWatched ? '#10b981' : 'rgba(255,255,255,0.1)'};
                            border-radius: 8px; padding: 12px; text-align: center; cursor: ${isWatched ? 'default' : 'pointer'};
                            transition: 0.2s;">
                    <div style="font-size: 24px;">${isWatched ? '✅' : '🎬'}</div>
                    <div style="font-size: 10px; margin-top: 4px; color: ${isWatched ? '#fff' : '#94a3b8'};">Ad ${a}</div>
                </div>
            `;
        }
        
        const blockHtml = `
            <div class="task-card" style="margin-bottom: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h4 style="margin: 0; color: #fff;">Block ${b}</h4>
                    <span style="font-size: 12px; color: ${block.completed ? '#10b981' : '#f97316'}; font-weight: bold;">
                        ${block.completed ? '🎉 Completed (Bonus Claimed)' : `${block.watchedAds.length}/${ADS_PER_BLOCK} Ads`}
                    </span>
                </div>
                <div class="progress-bar" style="background: rgba(255,255,255,0.1); height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 16px;">
                    <div style="background: ${block.completed ? '#10b981' : '#f97316'}; height: 100%; width: ${progress}%; transition: 0.3s;"></div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;">
                    ${adsHtml}
                </div>
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
"""

lines = lines[:start_idx] + [new_logic + "\n"] + lines[end_idx:]

with open(r"C:\TaskHub_Pro\frontend\app.js", "w", encoding="utf-8") as f:
    f.writelines(lines)

print("Watch logic updated successfully!")
