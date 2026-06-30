import { createClient } from '@supabase/supabase-js';

// CORS response helper
function corsResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Init-Data',
      ...extraHeaders
    }
  });
}

// OPTIONS preflight handler
function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Init-Data',
      'Access-Control-Max-Age': '86400',
    }
  });
}

// Parse and mock/verify Telegram initData
async function authenticateUser(request, env) {
  const initDataHeader = request.headers.get('X-Telegram-Init-Data');
  
  if (!initDataHeader) {
    throw new Error('Missing authentication header');
  }

  // Development/Testing Mock Flow
  if (initDataHeader.startsWith('mock_')) {
    const parts = initDataHeader.split('_');
    const mockId = parseInt(parts[1]) || 123456789;
    const mockUsername = parts[2] || 'test_user';
    return {
      telegram_id: mockId,
      username: mockUsername,
      first_name: 'Test',
      last_name: 'User'
    };
  }

  // Real Telegram Validation (if BOT_TOKEN is configured in env)
  try {
    const params = new URLSearchParams(initDataHeader);
    const hash = params.get('hash');
    if (!hash) throw new Error('Missing hash');

    // Parse user object
    const userParam = params.get('user');
    if (!userParam) throw new Error('Missing user data');
    const userData = JSON.parse(userParam);

    // If BOT_TOKEN is configured, verify signature
    if (env.BOT_TOKEN) {
      // 1. Calculate secret key: HMAC-SHA256("WebAppData", botToken)
      const encoder = new TextEncoder();
      const webAppDataKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode('WebAppData'),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const secretKeyBuffer = await crypto.subtle.sign(
        'HMAC',
        webAppDataKey,
        encoder.encode(env.BOT_TOKEN)
      );
      const secretKey = await crypto.subtle.importKey(
        'raw',
        secretKeyBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      // 2. Prepare check string (sorted alphabetically, excluding hash)
      const sortedKeys = Array.from(params.keys())
        .filter(k => k !== 'hash')
        .sort();
      const checkString = sortedKeys.map(k => `${k}=${params.get(k)}`).join('\n');

      // 3. Compute data signature
      const computedSignatureBuffer = await crypto.subtle.sign(
        'HMAC',
        secretKey,
        encoder.encode(checkString)
      );
      
      const computedHex = Array.from(new Uint8Array(computedSignatureBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      if (computedHex !== hash) {
        throw new Error('Signature mismatch');
      }
    }

    return {
      telegram_id: userData.id,
      username: userData.username || `user_${userData.id}`,
      first_name: userData.first_name || '',
      last_name: userData.last_name || ''
    };
  } catch (err) {
    throw new Error(`Authentication failed: ${err.message}`);
  }
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions();
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Set up Supabase Client
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

    try {
      // All endpoints (except status healthcheck) require Telegram Auth
      if (path === '/api/health') {
        return corsResponse({ status: 'ok', time: new Date().toISOString() });
      }

      // Authenticate telegram user
      const tgUser = await authenticateUser(request, env);

      // 1. GET /api/user - Fetch or Create Profile
      if (path === '/api/user' && request.method === 'GET') {
        let { data: user, error } = await supabase
          .from('users')
          .select('*')
          .eq('telegram_id', tgUser.telegram_id)
          .single();

        if (error && error.code === 'PGRST116') {
          // User not found, create new user profile
          const referrerId = url.searchParams.get('referred_by');
          let referredBy = null;

          if (referrerId && parseInt(referrerId) !== tgUser.telegram_id) {
            // Check if referrer exists
            const { data: referrer } = await supabase
              .from('users')
              .select('telegram_id')
              .eq('telegram_id', parseInt(referrerId))
              .single();
            if (referrer) {
              referredBy = referrer.telegram_id;
            }
          }

          const newUser = {
            telegram_id: tgUser.telegram_id,
            username: tgUser.username,
            first_name: tgUser.first_name,
            last_name: tgUser.last_name,
            balance: 0.00,
            streak: 1,
            referred_by: referredBy,
            last_login: new Date().toISOString()
          };

          const { data: createdUser, error: insertError } = await supabase
            .from('users')
            .insert(newUser)
            .select()
            .single();

          if (insertError) throw insertError;
          user = createdUser;

          // If there is a referrer, reward them
          if (referredBy) {
            const referralBonus = 250.00;
            // Update referrer balance
            const { error: refUpdateErr } = await supabase.rpc('increment_user_balance', {
              user_id: referredBy,
              amount: referralBonus
            });
            
            if (!refUpdateErr) {
              // Log referral transaction
              await supabase.from('transactions').insert({
                user_id: referredBy,
                amount: referralBonus,
                type: 'referral',
                description: `Referral bonus for inviting @${tgUser.username}`
              });
            }
          }
        } else if (error) {
          throw error;
        } else {
          // User exists, update last_login
          await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('telegram_id', tgUser.telegram_id);
        }

        // Check daily spin status (allow 5 spins per 24 hours)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recentSpins } = await supabase
          .from('transactions')
          .select('created_at')
          .eq('user_id', tgUser.telegram_id)
          .eq('type', 'spin')
          .gte('created_at', twentyFourHoursAgo)
          .order('created_at', { ascending: false });

        let canSpin = true;
        let spinCooldown = 0;
        let spinsCount = recentSpins ? recentSpins.length : 0;
        
        if (spinsCount >= 5) {
          canSpin = false;
          // Cooldown based on the oldest spin in the 24 hour window
          const oldestSpin = recentSpins[4];
          const hoursSinceOldest = (new Date() - new Date(oldestSpin.created_at)) / (1000 * 60 * 60);
          spinCooldown = Math.ceil(24 - hoursSinceOldest);
        }

        // Check daily streak status
        const { data: lastStreak } = await supabase
          .from('transactions')
          .select('created_at')
          .eq('user_id', tgUser.telegram_id)
          .eq('type', 'streak')
          .order('created_at', { ascending: false })
          .limit(1);

        let lastStreakClaimTime = null;
        let claimedToday = false;
        if (lastStreak && lastStreak.length > 0) {
          lastStreakClaimTime = lastStreak[0].created_at;
          const lastClaimDate = new Date(lastStreakClaimTime);
          const currentDate = new Date();
          const utc1 = Date.UTC(lastClaimDate.getUTCFullYear(), lastClaimDate.getUTCMonth(), lastClaimDate.getUTCDate());
          const utc2 = Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate());
          const diffDays = Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
          if (diffDays === 0) {
            claimedToday = true;
          } else if (diffDays > 1) {
            // Streak is broken! Reset user streak to 1 in the database
            await supabase
              .from('users')
              .update({ streak: 1 })
              .eq('telegram_id', tgUser.telegram_id);
            user.streak = 1;
          }
        } else {
          // If no streak transaction exists but database streak > 1, reset to 1
          if (user.streak > 1) {
            await supabase
              .from('users')
              .update({ streak: 1 })
              .eq('telegram_id', tgUser.telegram_id);
            user.streak = 1;
          }
        }

        return corsResponse({
          user,
          spin: { canSpin, spinCooldown, spins_left: Math.max(0, 5 - spinsCount) },
          streak: {
            last_streak_claim: lastStreakClaimTime,
            claimed_today: claimedToday
          }
        });
      }

      // 2. POST /api/user/spin - Execute Daily Spin
      if (path === '/api/user/spin' && request.method === 'POST') {
        // Double check cooldown (allow 5 spins per 24 hours)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recentSpins } = await supabase
          .from('transactions')
          .select('created_at')
          .eq('user_id', tgUser.telegram_id)
          .eq('type', 'spin')
          .gte('created_at', twentyFourHoursAgo)
          .order('created_at', { ascending: false });

        let spinsCount = recentSpins ? recentSpins.length : 0;
        if (spinsCount >= 5) {
          const oldestSpin = recentSpins[4];
          const hoursSinceOldest = (new Date() - new Date(oldestSpin.created_at)) / (1000 * 60 * 60);
          return corsResponse({ error: 'Daily spin on cooldown', cooldown: Math.ceil(24 - hoursSinceOldest) }, 400);
        }

        // Spin rewards configuration (Coins)
        const rewards = [20, 50, 100, 250, 500, 1700];
        const weights = [45, 30, 15, 7, 2.5, 0.5]; // Cumulative or weighted selection
        
        // Simple weighted choice
        let random = Math.random() * 100;
        let rewardIndex = 0;
        let sum = 0;
        for (let i = 0; i < weights.length; i++) {
          sum += weights[i];
          if (random <= sum) {
            rewardIndex = i;
            break;
          }
        }
        const spinReward = rewards[rewardIndex];

        // Begin Transaction: Update balance
        const { data: userProfile } = await supabase
          .from('users')
          .select('balance')
          .eq('telegram_id', tgUser.telegram_id)
          .single();

        const newBalance = Number(userProfile.balance) + spinReward;
        await supabase
          .from('users')
          .update({ balance: newBalance })
          .eq('telegram_id', tgUser.telegram_id);

        // Record transaction
        await supabase.from('transactions').insert({
          user_id: tgUser.telegram_id,
          amount: spinReward,
          type: 'spin',
          description: `Won ${spinReward} Coins on Daily Lucky Spin`
        });

        return corsResponse({
          success: true,
          reward: spinReward,
          new_balance: newBalance,
          cooldown: spinsCount + 1 >= 5 ? 24 : 0,
          spins_left: Math.max(0, 5 - (spinsCount + 1))
        });
      }

      // 3. POST /api/user/claim-streak - Claim Daily Streak
      if (path === '/api/user/claim-streak' && request.method === 'POST') {
        const { data: user } = await supabase
          .from('users')
          .select('*')
          .eq('telegram_id', tgUser.telegram_id)
          .single();

        // Check last daily streak claim transaction
        const { data: lastStreak } = await supabase
          .from('transactions')
          .select('created_at')
          .eq('user_id', tgUser.telegram_id)
          .eq('type', 'streak')
          .order('created_at', { ascending: false })
          .limit(1);

        const currentDate = new Date();
        let lastClaimDate = null;
        let diffDays = 0;

        if (lastStreak && lastStreak.length > 0) {
          lastClaimDate = new Date(lastStreak[0].created_at);
          const utc1 = Date.UTC(lastClaimDate.getUTCFullYear(), lastClaimDate.getUTCMonth(), lastClaimDate.getUTCDate());
          const utc2 = Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate());
          diffDays = Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
          
          if (diffDays === 0) {
            return corsResponse({
              success: false,
              error: 'You have already claimed your daily streak bonus today!'
            }, 400);
          }
        } else {
          // No previous claim, start new
          diffDays = 999;
        }

        let currentStreak = user.streak;
        if (diffDays === 1) {
          // Continuous daily login, wrap around at 7 days
          currentStreak = (currentStreak % 7) + 1;
        } else {
          // Missed login or first claim, reset to 1
          currentStreak = 1;
        }

        // Streak reward calculations: 50 Coins * streak day (Day 1: 50, Day 7: 350)
        const streakBonus = 50 * currentStreak;

        const newBalance = Number(user.balance) + streakBonus;
        await supabase
          .from('users')
          .update({ 
            balance: newBalance,
            streak: currentStreak,
            last_login: currentDate.toISOString()
          })
          .eq('telegram_id', tgUser.telegram_id);

        // Record transaction
        await supabase.from('transactions').insert({
          user_id: tgUser.telegram_id,
          amount: streakBonus,
          type: 'streak',
          description: `Daily login streak Day ${currentStreak} bonus (${streakBonus} Coins)`
        });

        return corsResponse({
          success: true,
          streak: currentStreak,
          reward: streakBonus,
          new_balance: newBalance,
          last_streak_claim: currentDate.toISOString(),
          claimed_today: true
        });
      }

      // POST /api/user/game-reward - Reward Mini Game Completion
      if (path === '/api/user/game-reward' && request.method === 'POST') {
        const { amount, game_name } = await request.json();
        
        const { data: user } = await supabase
          .from('users')
          .select('*')
          .eq('telegram_id', tgUser.telegram_id)
          .single();

        const newBalance = Number(user.balance) + Number(amount);
        await supabase
          .from('users')
          .update({ balance: newBalance })
          .eq('telegram_id', tgUser.telegram_id);

        // Record transaction
        await supabase.from('transactions').insert({
          user_id: tgUser.telegram_id,
          amount: amount,
          type: 'task',
          description: `Played mini game: ${game_name} reward`
        });

        return corsResponse({
          success: true,
          new_balance: newBalance
        });
      }

      // 4. GET /api/tasks - List all tasks with user completion
      if (path === '/api/tasks' && request.method === 'GET') {
        // Fetch all active tasks
        const { data: tasks, error: tasksError } = await supabase
          .from('tasks')
          .select('*');
        if (tasksError) throw tasksError;

        // Fetch tasks completed by this user
        const { data: completedTasks, error: completeError } = await supabase
          .from('user_tasks')
          .select('task_id')
          .eq('user_id', tgUser.telegram_id);
        if (completeError) throw completeError;

        const completedSet = new Set(completedTasks.map(t => t.task_id));

        const result = tasks.map(task => ({
          ...task,
          completed: completedSet.has(task.id)
        }));

        return corsResponse(result);
      }

      // POST /api/tasks/create - Create a new custom task
      if (path === '/api/tasks/create' && request.method === 'POST') {
        const { title, description, reward, url, max_users, task_type, transaction_hash } = await request.json();
        // TODO: In production, verify transaction_hash using TonCenter API before proceeding
        if (!title || !description || !reward || !url || !max_users) {
          return corsResponse({ error: 'Missing required fields' }, 400);
        }
        if (Number(reward) > 5000) {
          return corsResponse({ error: 'Reward cannot exceed 5000' }, 400);
        }
        if (Number(max_users) > 1000) {
          return corsResponse({ error: 'Max users cannot exceed 1000' }, 400);
        }
        
        const { data: newTask, error: insertError } = await supabase
          .from('tasks')
          .insert({
            title,
            description,
            reward: Number(reward),
            max_users: Number(max_users),
            url,
            task_type: task_type || 'partner'
          })
          .select()
          .single();
          
        if (insertError) {
          return corsResponse({ error: insertError.message }, 500);
        }
        
        return corsResponse({ success: true, task: newTask });
      }

      // 5. POST /api/tasks/complete - Complete Task
      if (path === '/api/tasks/complete' && request.method === 'POST') {
        const { taskId } = await request.json();
        if (!taskId) return corsResponse({ error: 'Missing taskId' }, 400);

        // Check if task exists
        const { data: task } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', taskId)
          .single();
        if (!task) return corsResponse({ error: 'Task not found' }, 404);

        // Check if user already completed it
        const { data: alreadyCompleted } = await supabase
          .from('user_tasks')
          .select('*')
          .eq('user_id', tgUser.telegram_id)
          .eq('task_id', taskId)
          .single();

        if (alreadyCompleted) {
          return corsResponse({ error: 'Task already completed' }, 400);
        }

        // Fetch user balance
        const { data: userProfile } = await supabase
          .from('users')
          .select('balance')
          .eq('telegram_id', tgUser.telegram_id)
          .single();

        const reward = Number(task.reward);
        const newBalance = Number(userProfile.balance) + reward;

        // 1. Mark task as completed
        await supabase.from('user_tasks').insert({
          user_id: tgUser.telegram_id,
          task_id: taskId
        });

        // 2. Update user balance
        await supabase
          .from('users')
          .update({ balance: newBalance })
          .eq('telegram_id', tgUser.telegram_id);

        // 3. Log transaction
        await supabase.from('transactions').insert({
          user_id: tgUser.telegram_id,
          amount: reward,
          type: 'task',
          description: `Completed task: ${task.title}`
        });

        return corsResponse({
          success: true,
          reward,
          new_balance: newBalance
        });
      }

      // 6. GET /api/surveys - List surveys
      if (path === '/api/surveys' && request.method === 'GET') {
        const { data: surveys, error: surveysError } = await supabase
          .from('surveys')
          .select('*');
        if (surveysError) throw surveysError;

        const { data: completedSurveys } = await supabase
          .from('user_surveys')
          .select('survey_id')
          .eq('user_id', tgUser.telegram_id);

        const completedSet = new Set(completedSurveys.map(s => s.survey_id));

        const result = surveys.map(survey => ({
          ...survey,
          completed: completedSet.has(survey.id)
        }));

        return corsResponse(result);
      }

      // 7. POST /api/surveys/submit - Submit Survey answers
      if (path === '/api/surveys/submit' && request.method === 'POST') {
        const { surveyId, answers } = await request.json();
        if (!surveyId || !answers) return corsResponse({ error: 'Missing surveyId or answers' }, 400);

        const { data: survey } = await supabase
          .from('surveys')
          .select('*')
          .eq('id', surveyId)
          .single();
        if (!survey) return corsResponse({ error: 'Survey not found' }, 404);

        // Verify if user already took this survey
        const { data: completedSurvey } = await supabase
          .from('user_surveys')
          .select('*')
          .eq('user_id', tgUser.telegram_id)
          .eq('survey_id', surveyId)
          .single();

        if (completedSurvey) {
          return corsResponse({ error: 'Survey already completed' }, 400);
        }

        // Update balance
        const { data: userProfile } = await supabase
          .from('users')
          .select('balance')
          .eq('telegram_id', tgUser.telegram_id)
          .single();

        const reward = Number(survey.reward);
        const newBalance = Number(userProfile.balance) + reward;

        // Save survey response
        await supabase.from('user_surveys').insert({
          user_id: tgUser.telegram_id,
          survey_id: surveyId,
          answers: answers
        });

        // Credit user balance
        await supabase
          .from('users')
          .update({ balance: newBalance })
          .eq('telegram_id', tgUser.telegram_id);

        // Log transaction
        await supabase.from('transactions').insert({
          user_id: tgUser.telegram_id,
          amount: reward,
          type: 'survey',
          description: `Completed survey: ${survey.title}`
        });

        return corsResponse({
          success: true,
          reward,
          new_balance: newBalance
        });
      }

      // 8. GET /api/referrals - Get referral statistics
      if (path === '/api/referrals' && request.method === 'GET') {
        // Fetch users referred by this user
        const { data: referredUsers, error: refError } = await supabase
          .from('users')
          .select('telegram_id, username, created_at')
          .eq('referred_by', tgUser.telegram_id);
        if (refError) throw refError;

        // Sum referral transactions for this user
        const { data: referralEarningsData } = await supabase
          .from('transactions')
          .select('amount')
          .eq('user_id', tgUser.telegram_id)
          .eq('type', 'referral');

        const totalEarnings = (referralEarningsData || []).reduce((acc, curr) => acc + Number(curr.amount), 0);

        return corsResponse({
          referral_code: tgUser.telegram_id,
          referrals: referredUsers || [],
          total_earnings: totalEarnings,
          referral_bonus_rate: 250.00
        });
      }

      // 9. GET /api/leaderboard - Get leader rankings
      if (path === '/api/leaderboard' && request.method === 'GET') {
        const { data: topEarners, error: leaderError } = await supabase
          .from('users')
          .select('username, first_name, balance')
          .order('balance', { ascending: false })
          .limit(20);
        if (leaderError) throw leaderError;

        return corsResponse(topEarners);
      }

      // 10. POST /api/wallet/withdraw - Request withdrawal
      if (path === '/api/wallet/withdraw' && request.method === 'POST') {
        const { amount, method, accountDetails } = await request.json();
        
        if (!amount || !method || !accountDetails) {
          return corsResponse({ error: 'Missing required withdrawal details' }, 400);
        }

        const withdrawalAmount = Number(amount);
        if (withdrawalAmount <= 0) {
          return corsResponse({ error: 'Invalid withdrawal amount' }, 400);
        }

        // Check if user has sufficient balance
        const { data: userProfile } = await supabase
          .from('users')
          .select('balance')
          .eq('telegram_id', tgUser.telegram_id)
          .single();

        if (Number(userProfile.balance) < withdrawalAmount) {
          return corsResponse({ error: 'Insufficient account balance' }, 400);
        }

        const newBalance = Number(userProfile.balance) - withdrawalAmount;

        // Deduct balance
        await supabase
          .from('users')
          .update({ balance: newBalance })
          .eq('telegram_id', tgUser.telegram_id);

        // Record negative transaction (withdrawal request)
        await supabase.from('transactions').insert({
          user_id: tgUser.telegram_id,
          amount: -withdrawalAmount,
          type: 'withdraw',
          description: `Withdrawal via ${method} (${accountDetails}) - Pending Approval`
        });

        return corsResponse({
          success: true,
          deducted: withdrawalAmount,
          new_balance: newBalance,
          message: 'Withdrawal request submitted successfully. Processing takes 24-48 hours.'
        });
      }

      // Fallback
      return corsResponse({ error: `Not Found: ${path} [${request.method}]` }, 404);

    } catch (err) {
      return corsResponse({ error: err.message || 'Server Error' }, 500);
    }
  }
};
