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

  getThemeStats(req, res) {
    const { start_date, end_date, type, limit = 20, sort_by = 'use_count' } = req.query;
    const l = parseInt(limit);

    let where = 't.status = 1';
    const params = [];

    if (type) {
      where += ' AND t.type = ?';
      params.push(type);
    }

    const sortFields = ['view_count', 'use_count', 'draw_count', 'fortune_count', 'collect_count', 'share_count'];
    const sortField = sortFields.includes(sort_by) ? sort_by : 'use_count';

    const resultWhere = [];
    const resultParams = [];
    if (start_date) {
      resultWhere.push('DATE(fr.created_at) >= ?');
      resultParams.push(start_date);
    }
    if (end_date) {
      resultWhere.push('DATE(fr.created_at) <= ?');
      resultParams.push(end_date);
    }
    const resultWhereSql = resultWhere.length > 0 ? ' AND ' + resultWhere.join(' AND ') : '';

    const collectWhere = [];
    const collectParams = [];
    if (start_date) {
      collectWhere.push('DATE(c.created_at) >= ?');
      collectParams.push(start_date);
    }
    if (end_date) {
      collectWhere.push('DATE(c.created_at) <= ?');
      collectParams.push(end_date);
    }
    const collectWhereSql = collectWhere.length > 0 ? ' AND ' + collectWhere.join(' AND ') : '';

    const items = db.prepare(`
      SELECT t.id, t.name, t.type, t.cover_image, t.view_count, t.use_count,
        COALESCE(draw.draw_count, 0) as draw_count,
        COALESCE(fortune.fortune_count, 0) as fortune_count,
        COALESCE(ans.answer_count, 0) as answer_count,
        COALESCE(col.collect_count, 0) as collect_count,
        COALESCE(sh.share_count, 0) as share_count
      FROM theme t
      LEFT JOIN (
        SELECT theme_id, COUNT(*) as draw_count
        FROM fortune_result fr
        WHERE result_type IN ('cards', 'lot', 'draw') ${resultWhereSql}
        GROUP BY theme_id
      ) draw ON draw.theme_id = t.id
      LEFT JOIN (
        SELECT theme_id, COUNT(*) as fortune_count
        FROM fortune_result fr
        WHERE result_type IN ('constellation', 'bazi') ${resultWhereSql}
        GROUP BY theme_id
      ) fortune ON fortune.theme_id = t.id
      LEFT JOIN (
        SELECT theme_id, COUNT(*) as answer_count
        FROM fortune_result fr
        WHERE result_type = 'answer' ${resultWhereSql}
        GROUP BY theme_id
      ) ans ON ans.theme_id = t.id
      LEFT JOIN (
        SELECT theme_id, COUNT(*) as collect_count
        FROM collection c
        WHERE 1=1 ${collectWhereSql}
        GROUP BY theme_id
      ) col ON col.theme_id = t.id
      LEFT JOIN (
        SELECT fr.theme_id, SUM(fr.share_count) as share_count
        FROM fortune_result fr
        WHERE 1=1 ${resultWhereSql}
        GROUP BY fr.theme_id
      ) sh ON sh.theme_id = t.id
      WHERE ${where}
      ORDER BY ${sortField} DESC, t.id DESC
      LIMIT ?
    `).all(...resultParams, ...resultParams, ...resultParams, ...collectParams, ...resultParams, ...params, l);

    const totals = {
      view_count: items.reduce((sum, i) => sum + i.view_count, 0),
      use_count: items.reduce((sum, i) => sum + i.use_count, 0),
      draw_count: items.reduce((sum, i) => sum + i.draw_count, 0),
      fortune_count: items.reduce((sum, i) => sum + i.fortune_count, 0),
      answer_count: items.reduce((sum, i) => sum + i.answer_count, 0),
      collect_count: items.reduce((sum, i) => sum + i.collect_count, 0),
      share_count: items.reduce((sum, i) => sum + i.share_count, 0),
    };

    res.json(success({
      items,
      totals,
      sort_by: sortField,
    }));
  },

  getThemeTrend(req, res) {
    const { theme_id, start_date, end_date, type } = req.query;

    const resultConditions = ['1=1'];
    const params = [];

    if (start_date) {
      resultConditions.push('DATE(created_at) >= ?');
      params.push(start_date);
    }
    if (end_date) {
      resultConditions.push('DATE(created_at) <= ?');
      params.push(end_date);
    }

    if (!start_date && !end_date) {
      resultConditions.push("DATE(created_at) >= DATE('now', '-30 days')");
    }

    if (theme_id) {
      resultConditions.push('theme_id = ?');
      params.push(theme_id);
    }

    const whereSql = resultConditions.join(' AND ');

    const resultRows = db.prepare(`
      SELECT
        DATE(created_at) as date,
        result_type,
        COUNT(*) as count
      FROM fortune_result
      WHERE ${whereSql}
      GROUP BY DATE(created_at), result_type
      ORDER BY date ASC
    `).all(...params);

    const collectConditions = ['1=1'];
    const collectParams = [];

    if (start_date) {
      collectConditions.push('DATE(created_at) >= ?');
      collectParams.push(start_date);
    }
    if (end_date) {
      collectConditions.push('DATE(created_at) <= ?');
      collectParams.push(end_date);
    }
    if (!start_date && !end_date) {
      collectConditions.push("DATE(created_at) >= DATE('now', '-30 days')");
    }
    if (theme_id) {
      collectConditions.push('theme_id = ?');
      collectParams.push(theme_id);
    }

    const collectWhereSql = collectConditions.join(' AND ');

    const collectRows = db.prepare(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count
      FROM collection
      WHERE ${collectWhereSql}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all(...collectParams);

    const dateSet = new Set();
    resultRows.forEach(r => dateSet.add(r.date));
    collectRows.forEach(r => dateSet.add(r.date));
    const dates = Array.from(dateSet).sort();

    const drawMap = {};
    const fortuneMap = {};
    const answerMap = {};
    const collectMap = {};

    resultRows.forEach(r => {
      if (r.result_type === 'cards' || r.result_type === 'lot' || r.result_type === 'draw') {
        drawMap[r.date] = (drawMap[r.date] || 0) + r.count;
      } else if (r.result_type === 'constellation' || r.result_type === 'bazi') {
        fortuneMap[r.date] = (fortuneMap[r.date] || 0) + r.count;
      } else if (r.result_type === 'answer') {
        answerMap[r.date] = (answerMap[r.date] || 0) + r.count;
      } else {
        drawMap[r.date] = (drawMap[r.date] || 0) + r.count;
      }
    });

    collectRows.forEach(r => {
      collectMap[r.date] = r.count;
    });

    const trend = dates.map(date => ({
      date,
      draw_count: drawMap[date] || 0,
      fortune_count: fortuneMap[date] || 0,
      answer_count: answerMap[date] || 0,
      total_count: (drawMap[date] || 0) + (fortuneMap[date] || 0) + (answerMap[date] || 0),
      collect_count: collectMap[date] || 0,
    }));

    res.json(success({
      dates,
      trend,
      indicators: ['draw_count', 'fortune_count', 'answer_count', 'total_count', 'collect_count'],
    }));
  },
};

module.exports = adminController;
