import re

with open('frontend/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace openGame to add betting UI
open_game_old = """function openGame(gameType) {
    const modal = document.getElementById('game-modal');
    const title = document.getElementById('game-modal-title');
    const body = document.getElementById('game-modal-body');
    if (!modal || !title || !body) return;
    
    modal.classList.add('active');
    
    if (gameTimer) clearInterval(gameTimer);
    
    if (gameType === 'clicker') {
        title.innerText = '⛏️ Coin Clicker';
        startClickerGame(body);
    } else if (gameType === 'match3') {
        title.innerText = '🧩 Memory Match';
        startMemoryGame(body);
    }
}"""

open_game_new = """let gameBetAmount = 0;

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
        container.innerHTML = \`
            <div style="text-align: center;">
                <span style="font-size: 40px;">😢</span>
                <h4 style="margin: 10px 0 4px; color: #ef4444; font-size: 14px;">Game Over</h4>
                <p style="font-size: 11px; color: #64748b; margin-bottom: 12px;">You failed the game and lost your bet.</p>
                <div style="display: flex; gap: 8px; justify-content: center;">
                    <button class="btn-outline" onclick="closeGameModal()" style="padding: 6px 14px; font-size: 11px; width: auto; margin-top: 0;">Close</button>
                    <button class="btn-primary" onclick="\${tryAgainFnStr}" style="padding: 6px 16px; font-size: 11px; width: auto;">Try Again</button>
                </div>
            </div>
        \`;
        return;
    }
    
    const wonRNG = Math.random() <= 0.30;
    if (wonRNG) {
        const reward = Math.floor(gameBetAmount * 1.8);
        userState.balance += reward;
        saveGameState();
        
        container.innerHTML = \`
            <div style="text-align: center;">
                <span style="font-size: 40px;">🎉</span>
                <h4 style="margin: 10px 0 4px; color: #10b981; font-size: 14px;">You Won!</h4>
                <p style="font-size: 11px; color: #64748b; margin-bottom: 12px;">You beat the odds! +\${reward} Coins!</p>
                <div style="display: flex; gap: 8px; justify-content: center;">
                    <button class="btn-outline" onclick="closeGameModal()" style="padding: 6px 14px; font-size: 11px; width: auto; margin-top: 0;">Close</button>
                    <button class="btn-primary" onclick="\${tryAgainFnStr}" style="padding: 6px 16px; font-size: 11px; width: auto;">Play Again</button>
                </div>
            </div>
        \`;
    } else {
        container.innerHTML = \`
            <div style="text-align: center;">
                <span style="font-size: 40px;">💔</span>
                <h4 style="margin: 10px 0 4px; color: #ef4444; font-size: 14px;">Bad Luck!</h4>
                <p style="font-size: 11px; color: #64748b; margin-bottom: 12px;">You played well, but didn't win the 30% chance this time.</p>
                <div style="display: flex; gap: 8px; justify-content: center;">
                    <button class="btn-outline" onclick="closeGameModal()" style="padding: 6px 14px; font-size: 11px; width: auto; margin-top: 0;">Close</button>
                    <button class="btn-primary" onclick="\${tryAgainFnStr}" style="padding: 6px 16px; font-size: 11px; width: auto;">Try Again</button>
                </div>
            </div>
        \`;
    }
}

function saveGameState() {
    const mockUser = JSON.parse(localStorage.getItem('th_user') || "{}");
    mockUser.balance = userState.balance;
    localStorage.setItem('th_user', JSON.stringify(mockUser));
    updateHeaderStats();
}

function startMysteryBoxGame(container) {
    container.innerHTML = \`
        <div style="text-align: center; width: 100%;">
            <p style="font-size: 11px; color: #64748b; margin-bottom: 15px;">Pick a Mystery Box!</p>
            <div style="display: flex; justify-content: space-around; margin: 20px 0;">
                <div onclick="openMysteryBox(this, document.getElementById('game-modal-body'))" style="font-size: 45px; cursor: pointer; transition: 0.2s;">🎁</div>
                <div onclick="openMysteryBox(this, document.getElementById('game-modal-body'))" style="font-size: 45px; cursor: pointer; transition: 0.2s;">🎁</div>
                <div onclick="openMysteryBox(this, document.getElementById('game-modal-body'))" style="font-size: 45px; cursor: pointer; transition: 0.2s;">🎁</div>
            </div>
        </div>
    \`;
}

function openMysteryBox(el, container) {
    el.style.transform = "scale(1.2)";
    setTimeout(() => {
        processGameResult(true, container, "openGame('mystery')");
    }, 500);
}
"""
content = content.replace(open_game_old, open_game_new)

# Replace Clicker Fail Block
clicker_fail_old = """container.innerHTML = `
                <div style="text-align: center;">
                    <span style="font-size: 40px;">😢</span>
                    <h4 style="margin: 10px 0 4px; color: #ef4444; font-size: 14px;">Time's Up!</h4>
                    <p style="font-size: 11px; color: #64748b; margin-bottom: 12px;">You tapped ${gameScore} times. Try again!</p>
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button class="btn-outline" onclick="renderGamesList()" style="padding: 6px 14px; font-size: 11px; width: auto; margin-top: 0;">Back to Hub</button>
                        <button class="btn-primary" onclick="openGame('clicker')" style="padding: 6px 16px; font-size: 11px; width: auto;">Try Again</button>
                    </div>
                </div>
            `;"""
clicker_fail_new = """processGameResult(false, container, "openGame('clicker')");"""
content = content.replace(clicker_fail_old, clicker_fail_new)

# Replace Clicker Win Block
clicker_win_old = """awardGameReward(200, 'Coin Clicker');
            container.innerHTML = `
                <div style="text-align: center;">
                    <span style="font-size: 40px;">🎉</span>
                    <h4 style="margin: 10px 0 4px; color: #10b981; font-size: 14px;">Victory!</h4>
                    <p style="font-size: 11px; color: #64748b; margin-bottom: 12px;">You successfully mined the coin! Earned 200 Coins.</p>
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button class="btn-outline" onclick="closeGameModal()" style="padding: 6px 14px; font-size: 11px; width: auto; margin-top: 0;">Close</button>
                        <button class="btn-primary" onclick="renderGamesList()" style="padding: 6px 16px; font-size: 11px; width: auto;">Back to Hub</button>
                    </div>
                </div>
            `;"""
clicker_win_new = """processGameResult(true, container, "openGame('clicker')");"""
content = content.replace(clicker_win_old, clicker_win_new)

# Replace Match3 Fail Block
match3_fail_old = """container.innerHTML = `
                <div style="text-align: center;">
                    <span style="font-size: 40px;">😢</span>
                    <h4 style="margin: 10px 0 4px; color: #ef4444; font-size: 14px;">Time's Up!</h4>
                    <p style="font-size: 11px; color: #64748b; margin-bottom: 12px;">You matched ${matchedPairs}/8 pairs. Try again!</p>
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button class="btn-outline" onclick="renderGamesList()" style="padding: 6px 14px; font-size: 11px; width: auto; margin-top: 0;">Back to Hub</button>
                        <button class="btn-primary" onclick="openGame('match3')" style="padding: 6px 16px; font-size: 11px; width: auto;">Try Again</button>
                    </div>
                </div>
            `;"""
match3_fail_new = """processGameResult(false, container, "openGame('match3')");"""
content = content.replace(match3_fail_old, match3_fail_new)

# Replace Match3 Win Block
match3_win_old = """awardGameReward(300, 'Memory Match');
                        container.innerHTML = `
                            <div style="text-align: center;">
                                <span style="font-size: 40px;">🎉</span>
                                <h4 style="margin: 10px 0 4px; color: #10b981; font-size: 14px;">Victory!</h4>
                                <p style="font-size: 10px; color: #64748b; margin-bottom: 12px;">Matched all pairs! Earned 300 Coins.</p>
                                <div style="display: flex; gap: 8px; justify-content: center;">
                                    <button class="btn-outline" onclick="closeGameModal()" style="padding: 6px 14px; font-size: 11px; width: auto; margin-top: 0;">Close</button>
                                    <button class="btn-primary" onclick="renderGamesList()" style="padding: 6px 16px; font-size: 11px; width: auto;">Back to Hub</button>
                                </div>
                            </div>
                        `;"""
match3_win_new = """processGameResult(true, container, "openGame('match3')");"""
content = content.replace(match3_win_old, match3_win_new)

with open('frontend/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
