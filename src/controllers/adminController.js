const db = require('../config/database');
const { success, error } = require('../utils/response');
const { checkSensitive, maskSensitive } = require('../utils/sensitive');

const adminController = {
  getStats(req, res) {
    const { start_date, end_date, group_by = 'day' } = req.query;

    const totalThemes = db.prepare('SELECT COUNT(*) as count FROM theme').get().count;
    const activeThemes = db.prepare('SELECT COUNT(*) as count FROM theme WHERE status = 1').get().count;
    const totalResults = db.prepare('SELECT COUNT(*) as count FROM fortune_result').get().count;
    const totalCollections = db.prepare('SELECT COUNT(*) as count FROM collection').get().count;
    const totalFeedbacks = db.prepare('SELECT COUNT(*) as count FROM feedback').get().count;

    let where = '1=1';
    const params = [];

    if (start_date) {
      where += ' AND call_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      where += ' AND call_date <= ?';
      params.push(end_date);
    }

    const apiStats = db.prepare(`
      SELECT api_path, method, SUM(call_count) as total_calls
      FROM api_stats
      WHERE ${where}
      GROUP BY api_path, method
      ORDER BY total_calls DESC
      LIMIT 20
    `).all(...params);

    const dailyStats = db.prepare(`
      SELECT call_date, SUM(call_count) as total_calls
      FROM api_stats
      WHERE ${where}
      GROUP BY call_date
      ORDER BY call_date DESC
      LIMIT 30
    `).all(...params);

    const useRank = db.prepare(`
      SELECT id, name, type, use_count, view_count
      FROM theme
      WHERE status = 1
      ORDER BY use_count DESC
      LIMIT 10
    `).all();

    res.json(success({
      overview: {
        total_themes: totalThemes,
        active_themes: activeThemes,
        total_results: totalResults,
        total_collections: totalCollections,
        total_feedbacks: totalFeedbacks,
      },
      api_stats: apiStats,
      daily_stats: dailyStats,
      use_rank: useRank,
    }));
  },

  feedbackList(req, res) {
    const { page = 1, pageSize = 10, status } = req.query;
    const p = parseInt(page);
    const ps = parseInt(pageSize);

    let where = '1=1';
    const params = [];

    if (status !== undefined) {
      where += ' AND status = ?';
      params.push(parseInt(status));
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM feedback WHERE ${where}`).get(...params).count;

    const items = db.prepare(`
      SELECT * FROM feedback WHERE ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, ps, (p - 1) * ps);

    res.json(success({
      items,
      total,
      page: p,
      pageSize: ps,
      totalPages: Math.ceil(total / ps),
    }));
  },

  submitFeedback(req, res) {
    const { content, contact } = req.body;
    const anonymousId = req.anonymousId;

    if (!content || !content.trim()) {
      return res.status(400).json(error('反馈内容不能为空'));
    }

    const sens = checkSensitive(content);
    if (sens.hasSensitive && sens.maxLevel >= 2) {
      return res.status(400).json(error('反馈内容包含敏感词，请修改后提交'));
    }

    const result = db.prepare(`
      INSERT INTO feedback (content, contact, anonymous_id)
      VALUES (?, ?, ?)
    `).run(maskSensitive(content), contact || '', anonymousId);

    res.json(success({ id: result.lastInsertRowid }));
  },

  updateFeedbackStatus(req, res) {
    const { id, status } = req.body;

    db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, id);

    res.json(success());
  },

  bannerList(req, res) {
    const { status } = req.query;

    let where = '1=1';
    const params = [];

    if (status !== undefined) {
      where += ' AND status = ?';
      params.push(parseInt(status));
    }

    const items = db.prepare(`
      SELECT * FROM banner WHERE ${where}
      ORDER BY sort_order ASC, id DESC
    `).all(...params);

    res.json(success(items));
  },

  createBanner(req, res) {
    const { title, image, link_type, link_value, sort_order = 0 } = req.body;

    if (!title) {
      return res.status(400).json(error('标题不能为空'));
    }

    const result = db.prepare(`
      INSERT INTO banner (title, image, link_type, link_value, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(title, image || '', link_type || '', link_value || '', sort_order);

    res.json(success({ id: result.lastInsertRowid }));
  },

  updateBanner(req, res) {
    const { id } = req.params;
    const { title, image, link_type, link_value, sort_order, status } = req.body;

    const fields = [];
    const params = [];

    if (title !== undefined) { fields.push('title = ?'); params.push(title); }
    if (image !== undefined) { fields.push('image = ?'); params.push(image); }
    if (link_type !== undefined) { fields.push('link_type = ?'); params.push(link_type); }
    if (link_value !== undefined) { fields.push('link_value = ?'); params.push(link_value); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(sort_order); }
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }

    if (fields.length > 0) {
      params.push(id);
      db.prepare(`UPDATE banner SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json(success());
  },

  removeBanner(req, res) {
    const { id } = req.params;
    db.prepare('DELETE FROM banner WHERE id = ?').run(id);
    res.json(success());
  },

  sensitiveWordsList(req, res) {
    const { page = 1, pageSize = 20, keyword } = req.query;
    const p = parseInt(page);
    const ps = parseInt(pageSize);

    let where = '1=1';
    const params = [];

    if (keyword) {
      where += ' AND word LIKE ?';
      params.push(`%${keyword}%`);
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM sensitive_word WHERE ${where}`).get(...params).count;

    const items = db.prepare(`
      SELECT * FROM sensitive_word WHERE ${where}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(...params, ps, (p - 1) * ps);

    res.json(success({
      items,
      total,
      page: p,
      pageSize: ps,
      totalPages: Math.ceil(total / ps),
    }));
  },

  addSensitiveWord(req, res) {
    const { word, level = 1 } = req.body;

    if (!word) {
      return res.status(400).json(error('敏感词不能为空'));
    }

    try {
      db.prepare('INSERT INTO sensitive_word (word, level) VALUES (?, ?)').run(word, level);
      res.json(success());
    } catch (e) {
      res.status(400).json(error('该敏感词已存在'));
    }
  },

  removeSensitiveWord(req, res) {
    const { id } = req.params;
    db.prepare('DELETE FROM sensitive_word WHERE id = ?').run(id);
    res.json(success());
  },

  checkContent(req, res) {
    const { content } = req.body;

    const result = checkSensitive(content || '');

    res.json(success({
      has_sensitive: result.hasSensitive,
      words: result.words,
      max_level: result.maxLevel,
      masked_content: result.hasSensitive ? maskSensitive(content) : content,
    }));
  },

  userPreferences(req, res) {
    const anonymousId = req.anonymousId;

    const prefs = db.prepare(`
      SELECT theme_id, preference_type, value, created_at
      FROM user_preference
      WHERE anonymous_id = ?
      ORDER BY created_at DESC
    `).all(anonymousId);

    res.json(success(prefs));
  },
};

module.exports = adminController;
