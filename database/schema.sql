-- TaskHub Pro Database Schema for Supabase (PostgreSQL)

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    telegram_id BIGINT PRIMARY KEY,
    username VARCHAR(100),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    balance DECIMAL(12, 2) DEFAULT 0.00 CHECK (balance >= 0),
    streak INT DEFAULT 1 CHECK (streak >= 1),
    last_login TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    referred_by BIGINT REFERENCES users(telegram_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index on referred_by for fast query of referrals
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

-- Helper function to increment balance via RPC
CREATE OR REPLACE FUNCTION increment_user_balance(user_id BIGINT, amount NUMERIC)
RETURNS VOID AS $$
BEGIN
    UPDATE users
    SET balance = balance + amount
    WHERE telegram_id = user_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    reward DECIMAL(10, 2) NOT NULL CHECK (reward >= 0),
    task_type VARCHAR(50) DEFAULT 'quick', -- 'quick', 'featured', 'partner'
    url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Completed User Tasks (Junction Table)
CREATE TABLE IF NOT EXISTS user_tasks (
    user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'completed',
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, task_id)
);

-- 4. Surveys Table
CREATE TABLE IF NOT EXISTS surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    reward DECIMAL(10, 2) NOT NULL CHECK (reward >= 0),
    duration_minutes INT DEFAULT 5 CHECK (duration_minutes > 0),
    questions JSONB NOT NULL, -- Array of survey questions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Completed User Surveys (Junction Table)
CREATE TABLE IF NOT EXISTS user_surveys (
    user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
    survey_id UUID REFERENCES surveys(id) ON DELETE CASCADE,
    answers JSONB,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, survey_id)
);

-- 6. Transactions Table (for earning history and withdrawals)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'spin', 'task', 'survey', 'referral', 'withdraw'
    description VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);

-- 7. Sponsored Channels Table (Join & Earn)
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    reward DECIMAL(10, 2) NOT NULL CHECK (reward >= 0),
    chat_username VARCHAR(120),        -- e.g. @taskhub_pro (used by getChatMember)
    invite_link VARCHAR(500) NOT NULL, -- public/invite link the user opens to join
    icon VARCHAR(10) DEFAULT '📢',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Completed User Channel Joins (Junction Table)
CREATE TABLE IF NOT EXISTS user_channels (
    user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_user_channels_user_id ON user_channels(user_id);

-- Insert initial sample sponsored channels (Join & Earn)
INSERT INTO channels (title, description, reward, chat_username, invite_link, icon) VALUES
('TaskHub Pro Official', 'Join our official channel for payout proofs & updates', 200.00, '@taskhub_pro', 'https://t.me/taskhub_pro', '💎'),
('Crypto Airdrops Hub', 'Daily verified airdrops and earning opportunities', 150.00, '@crypto_airdrops_hub', 'https://t.me/crypto_airdrops_hub', '🪂'),
('Earning Deals Zone', 'Exclusive high-paying offers and promo codes', 150.00, '@earning_deals_zone', 'https://t.me/earning_deals_zone', '🔥'),
('TON Community News', 'Latest TON blockchain news and giveaways', 120.00, '@ton_community_news', 'https://t.me/ton_community_news', '🚀')
ON CONFLICT DO NOTHING;

-- Insert initial sample tasks
INSERT INTO tasks (title, description, reward, task_type, url) VALUES
('📺 Watch & Earn Videos', 'Watch 3 ads of 30 seconds each', 150.00, 'quick', 'https://example.com/watch'),
('🎮 Play Daily Mini Game', 'Score 1000+ points on the match-3 game', 300.00, 'quick', 'https://example.com/game'),
('📢 Join TaskHub Telegram Channel', 'Subscribe to our official updates channel', 100.00, 'partner', 'https://t.me/taskhub_pro'),
('🐦 Follow us on X/Twitter', 'Follow @TaskHubPro for active promo codes', 200.00, 'partner', 'https://twitter.com/taskhub_pro'),
('🎯 Flash Deal - Limited Time', 'Complete 3 partner offers', 1700.00, 'featured', 'https://example.com/offers')
ON CONFLICT DO NOTHING;

-- Insert initial sample surveys
INSERT INTO surveys (title, description, reward, duration_minutes, questions) VALUES
(
    '📊 Consumer Behavior Study', 
    'A quick survey to understand shopping preferences and online consumer choices.', 
    500.00, 
    10, 
    '[
        {"id": "q1", "text": "How often do you shop online?", "type": "radio", "options": ["Daily", "Weekly", "Monthly", "Rarely"]},
        {"id": "q2", "text": "Which payment method do you prefer most?", "type": "radio", "options": ["Credit Card", "PayPal", "Crypto", "Bank Transfer"]},
        {"id": "q3", "text": "What product category do you buy online most?", "type": "radio", "options": ["Electronics", "Fashion", "Groceries", "Books"]}
    ]'::jsonb
),
(
    '📱 Brand Awareness Survey', 
    'Help us identify popular tech brands and your personal device loyalty.', 
    1000.00, 
    8, 
    '[
        {"id": "q1", "text": "Which mobile operating system do you use?", "type": "radio", "options": ["Android", "iOS", "Other"]},
        {"id": "q2", "text": "Rate your satisfaction with your current brand (1-5)", "type": "radio", "options": ["1 - Poor", "2", "3 - Average", "4", "5 - Excellent"]},
        {"id": "q3", "text": "Do you own a smartwatch?", "type": "radio", "options": ["Yes", "No"]}
    ]'::jsonb
)
ON CONFLICT DO NOTHING;
