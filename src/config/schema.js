const schemaSQL = `
  CREATE TABLE IF NOT EXISTS theme (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    cover_image TEXT,
    status INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    use_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS question (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    theme_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    status INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (theme_id) REFERENCES theme(id)
  );

  CREATE TABLE IF NOT EXISTS option (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    result_key TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (question_id) REFERENCES question(id)
  );

  CREATE TABLE IF NOT EXISTS card_deck (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    theme_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    card_count INTEGER DEFAULT 0,
    status INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (theme_id) REFERENCES theme(id)
  );

  CREATE TABLE IF NOT EXISTS card (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    image TEXT,
    upright_text TEXT,
    reversed_text TEXT,
    meaning TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deck_id) REFERENCES card_deck(id)
  );

  CREATE TABLE IF NOT EXISTS interpretation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    theme_id INTEGER NOT NULL,
    result_key TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    score_min INTEGER DEFAULT 0,
    score_max INTEGER DEFAULT 100,
    sort_order INTEGER DEFAULT 0,
    status INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (theme_id) REFERENCES theme(id)
  );

  CREATE TABLE IF NOT EXISTS fortune_result (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    theme_id INTEGER NOT NULL,
    result_key TEXT,
    title TEXT,
    content TEXT,
    score INTEGER,
    cards TEXT,
    birthday TEXT,
    anonymous_id TEXT,
    share_title TEXT,
    is_collected INTEGER DEFAULT 0,
    result_type TEXT DEFAULT 'draw',
    share_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS collection (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id INTEGER NOT NULL,
    anonymous_id TEXT NOT NULL,
    theme_id INTEGER,
    title TEXT,
    cover TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS api_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_path TEXT NOT NULL,
    method TEXT NOT NULL,
    call_date DATE NOT NULL,
    call_count INTEGER DEFAULT 1,
    UNIQUE(api_path, method, call_date)
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    contact TEXT,
    anonymous_id TEXT,
    status INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS banner (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    image TEXT,
    link_type TEXT,
    link_value TEXT,
    sort_order INTEGER DEFAULT 0,
    status INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sensitive_word (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL UNIQUE,
    level INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS submit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anonymous_id TEXT NOT NULL,
    theme_id INTEGER NOT NULL,
    fingerprint TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_preference (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anonymous_id TEXT NOT NULL,
    theme_id INTEGER NOT NULL,
    preference_type TEXT,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(anonymous_id, theme_id, preference_type)
  );

  CREATE TABLE IF NOT EXISTS theme_daily_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    theme_id INTEGER NOT NULL,
    stat_date DATE NOT NULL,
    view_count INTEGER DEFAULT 0,
    card_count INTEGER DEFAULT 0,
    lot_count INTEGER DEFAULT 0,
    fortune_count INTEGER DEFAULT 0,
    answer_count INTEGER DEFAULT 0,
    collect_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    feedback_count INTEGER DEFAULT 0,
    UNIQUE(theme_id, stat_date)
  );

  CREATE TABLE IF NOT EXISTS content_review (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_type TEXT NOT NULL,
    content_id INTEGER,
    content_text TEXT,
    masked_content TEXT,
    hit_words TEXT,
    risk_level INTEGER DEFAULT 1,
    status INTEGER DEFAULT 0,
    theme_id INTEGER,
    anonymous_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_view_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anonymous_id TEXT NOT NULL,
    theme_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_theme_status ON theme(status);
  CREATE INDEX IF NOT EXISTS idx_question_theme ON question(theme_id);
  CREATE INDEX IF NOT EXISTS idx_option_question ON option(question_id);
  CREATE INDEX IF NOT EXISTS idx_card_deck_theme ON card_deck(theme_id);
  CREATE INDEX IF NOT EXISTS idx_card_deck ON card(deck_id);
  CREATE INDEX IF NOT EXISTS idx_interpretation_theme ON interpretation(theme_id);
  CREATE INDEX IF NOT EXISTS idx_result_theme ON fortune_result(theme_id);
  CREATE INDEX IF NOT EXISTS idx_result_anonymous ON fortune_result(anonymous_id);
  CREATE INDEX IF NOT EXISTS idx_collection_anonymous ON collection(anonymous_id);
  CREATE INDEX IF NOT EXISTS idx_submit_log_anonymous ON submit_log(anonymous_id, theme_id);
  CREATE INDEX IF NOT EXISTS idx_fortune_created ON fortune_result(created_at);
  CREATE INDEX IF NOT EXISTS idx_collection_created ON collection(created_at);
  CREATE INDEX IF NOT EXISTS idx_review_status ON content_review(status);
  CREATE INDEX IF NOT EXISTS idx_review_type ON content_review(content_type);
  CREATE INDEX IF NOT EXISTS idx_review_level ON content_review(risk_level);
  CREATE INDEX IF NOT EXISTS idx_review_anonymous ON content_review(anonymous_id);
  CREATE INDEX IF NOT EXISTS idx_view_anonymous ON user_view_log(anonymous_id);
  CREATE INDEX IF NOT EXISTS idx_view_theme ON user_view_log(theme_id);
`;

function initSchema(db) {
  db.exec(schemaSQL);
  migrateSchema(db);
}

function migrateSchema(db) {
  const columns = db.prepare("PRAGMA table_info(theme_daily_stats)").all();
  const colNames = columns.map(c => c.name);

  if (!colNames.includes('card_count')) {
    db.prepare("ALTER TABLE theme_daily_stats ADD COLUMN card_count INTEGER DEFAULT 0").run();
  }
  if (!colNames.includes('lot_count')) {
    db.prepare("ALTER TABLE theme_daily_stats ADD COLUMN lot_count INTEGER DEFAULT 0").run();
  }
  if (!colNames.includes('feedback_count')) {
    db.prepare("ALTER TABLE theme_daily_stats ADD COLUMN feedback_count INTEGER DEFAULT 0").run();
  }
}

module.exports = { initSchema, schemaSQL };
