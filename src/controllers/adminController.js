const db = require('../config/database');
const { success, error, paginate } = require('../utils/response');

const adminController = {
  getStats(req, res) {
    const today = db.prepare(`
      SELECT SUM(call_count) as count
      FROM api_stats
      WHERE call_date = DATE('now')
    `).get();

    const total = db.prepare(`
      SELECT SUM(call_count) as count
      FROM api_stats
    `).get();

    const topApis = db.prepare(`
      SELECT api_path, method, SUM(call_count) as total_calls
      FROM api_stats
      GROUP BY api_path, method
      ORDER BY total_calls DESC
      LIMIT 10
    `).all();

    res.json(success({
      today_calls: today?.count || 0,
      total_calls: total?.count || 0,
      top_apis: topApis,
    }));
  },

  getThemeStats(req, res) {
    const { start_date, end_date, type, sort_by = 'draw_count', page = 1, pageSize = 20 } = req.query;
    const p = parseInt(page);
    const ps = parseInt(pageSize);

    const where = [];
    const params = [];

    if (start_date) {
      where.push('s.stat_date >= ?');
      params.push(start_date);
    }
    if (end_date) {
      where.push('s.stat_date <= ?');
      params.push(end_date);
    }
    if (type) {
      where.push('t.type = ?');
      params.push(type);
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const validSortFields = ['view_count', 'draw_count', 'fortune_count', 'answer_count', 'collect_count', 'share_count', 'use_count'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'draw_count';

    const countSQL = `
      SELECT COUNT(DISTINCT s.theme_id) as total
      FROM theme_daily_stats s
      LEFT JOIN theme t ON t.id = s.theme_id
      ${whereSQL}
    `;
    const totalResult = db.prepare(countSQL).get(...params);

    const listSQL = `
      SELECT
        s.theme_id as id,
        t.name,
        t.type,
        t.cover_image,
        SUM(s.view_count) as view_count,
        SUM(s.draw_count) as draw_count,
        SUM(s.fortune_count) as fortune_count,
        SUM(s.answer_count) as answer_count,
        SUM(s.collect_count) as collect_count,
        SUM(s.share_count) as share_count,
        (SUM(s.draw_count) + SUM(s.fortune_count) + SUM(s.answer_count)) as use_count
      FROM theme_daily_stats s
      LEFT JOIN theme t ON t.id = s.theme_id
      ${whereSQL}
      GROUP BY s.theme_id
      ORDER BY ${sortField} DESC, s.theme_id DESC
      LIMIT ? OFFSET ?
    `;
    const items = db.prepare(listSQL).all(...params, ps, (p - 1) * ps);

    const totalsSQL = `
      SELECT
        SUM(s.view_count) as view_count,
        SUM(s.draw_count) as draw_count,
        SUM(s.fortune_count) as fortune_count,
        SUM(s.answer_count) as answer_count,
        SUM(s.collect_count) as collect_count,
        SUM(s.share_count) as share_count,
        (SUM(s.draw_count) + SUM(s.fortune_count) + SUM(s.answer_count)) as use_count
      FROM theme_daily_stats s
      LEFT JOIN theme t ON t.id = s.theme_id
      ${whereSQL}
    `;
    const totals = db.prepare(totalsSQL).get(...params);

    res.json(success({
      items,
      totals: {
        view_count: totals?.view_count || 0,
        draw_count: totals?.draw_count || 0,
        fortune_count: totals?.fortune_count || 0,
        answer_count: totals?.answer_count || 0,
        collect_count: totals?.collect_count || 0,
        share_count: totals?.share_count || 0,
        use_count: totals?.use_count || 0,
      },
      sort_by: sortField,
      page: p,
      pageSize: ps,
      total: totalResult?.total || 0,
      totalPages: Math.ceil((totalResult?.total || 0) / ps),
    }));
  },

  getThemeTrend(req, res) {
    const { theme_id, start_date, end_date } = req.query;

    let startDate = start_date;
    let endDate = end_date;

    if (!startDate) {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      startDate = d.toISOString().split('T')[0];
    }
    if (!endDate) {
      endDate = new Date().toISOString().split('T')[0];
    }

    const where = ['stat_date >= ?', 'stat_date <= ?'];
    const params = [startDate, endDate];

    if (theme_id) {
      where.push('theme_id = ?');
      params.push(theme_id);
    }

    const rows = db.prepare(`
      SELECT
        stat_date,
        SUM(view_count) as view_count,
        SUM(draw_count) as draw_count,
        SUM(fortune_count) as fortune_count,
        SUM(answer_count) as answer_count,
        SUM(collect_count) as collect_count,
        SUM(share_count) as share_count,
        (SUM(draw_count) + SUM(fortune_count) + SUM(answer_count)) as total_count
      FROM theme_daily_stats
      WHERE ${where.join(' AND ')}
      GROUP BY stat_date
      ORDER BY stat_date ASC
    `).all(...params);

    const dates = [];
    const trendMap = {};
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      dates.push(dateStr);
      trendMap[dateStr] = {
        date: dateStr,
        view_count: 0,
        draw_count: 0,
        fortune_count: 0,
        answer_count: 0,
        collect_count: 0,
        share_count: 0,
        total_count: 0,
      };
    }

    for (const row of rows) {
      if (trendMap[row.stat_date]) {
        trendMap[row.stat_date] = {
          date: row.stat_date,
          view_count: row.view_count || 0,
          draw_count: row.draw_count || 0,
          fortune_count: row.fortune_count || 0,
          answer_count: row.answer_count || 0,
          collect_count: row.collect_count || 0,
          share_count: row.share_count || 0,
          total_count: row.total_count || 0,
        };
      }
    }

    const trend = dates.map(d => trendMap[d]);
    const indicators = ['view_count', 'draw_count', 'fortune_count', 'answer_count', 'collect_count', 'share_count', 'total_count'];

    res.json(success({
      dates,
      trend,
      indicators,
      date_range: { start: startDate, end: endDate },
    }));
  },

  feedbackList(req, res) {
    const { page = 1, pageSize = 20, status, keyword } = req.query;
    const p = parseInt(page);
    const ps = parseInt(pageSize);

    const where = [];
    const params = [];

    if (status !== undefined) {
      where.push('status = ?');
      params.push(parseInt(status));
    }
    if (keyword) {
      where.push('content LIKE ?');
      params.push(`%${keyword}%`);
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const total = db.prepare(`SELECT COUNT(*) as c FROM feedback ${whereSQL}`).get(...params).c;
    const items = db.prepare(`
      SELECT * FROM feedback ${whereSQL}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(...params, ps, (p - 1) * ps);

    res.json(success({
      items,
      ...paginate(p, ps, total),
    }));
  },

  submitFeedback(req, res) {
    const { content, contact } = req.body;
    const anonymousId = req.anonymousId;

    if (!content) {
      return res.status(400).json(error('反馈内容不能为空'));
    }

    const result = db.prepare(`
      INSERT INTO feedback (content, contact, anonymous_id)
      VALUES (?, ?, ?)
    `).run(content, contact || '', anonymousId);

    res.json(success({ id: result.lastInsertRowid }));
  },

  updateFeedbackStatus(req, res) {
    const { id, status } = req.body;

    if (!id || status === undefined) {
      return res.status(400).json(error('参数不完整'));
    }

    db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(parseInt(status), id);
    res.json(success());
  },

  bannerList(req, res) {
    const { status } = req.query;

    const where = [];
    const params = [];

    if (status !== undefined) {
      where.push('status = ?');
      params.push(parseInt(status));
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const items = db.prepare(`
      SELECT * FROM banner ${whereSQL}
      ORDER BY sort_order ASC, id DESC
    `).all(...params);

    res.json(success(items));
  },

  createBanner(req, res) {
    const { title, image, link_type, link_value, sort_order = 0, status = 1 } = req.body;

    if (!title) {
      return res.status(400).json(error('标题不能为空'));
    }

    const result = db.prepare(`
      INSERT INTO banner (title, image, link_type, link_value, sort_order, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(title, image || '', link_type || '', link_value || '', sort_order, status);

    res.json(success({ id: result.lastInsertRowid }));
  },

  updateBanner(req, res) {
    const { id } = req.params;
    const { title, image, link_type, link_value, sort_order, status } = req.body;

    const banner = db.prepare('SELECT * FROM banner WHERE id = ?').get(id);
    if (!banner) {
      return res.status(404).json(error('运营位不存在'));
    }

    db.prepare(`
      UPDATE banner SET
        title = ?, image = ?, link_type = ?, link_value = ?, sort_order = ?, status = ?
      WHERE id = ?
    `).run(
      title !== undefined ? title : banner.title,
      image !== undefined ? image : banner.image,
      link_type !== undefined ? link_type : banner.link_type,
      link_value !== undefined ? link_value : banner.link_value,
      sort_order !== undefined ? sort_order : banner.sort_order,
      status !== undefined ? status : banner.status,
      id
    );

    res.json(success());
  },

  removeBanner(req, res) {
    const { id } = req.params;

    db.prepare('DELETE FROM banner WHERE id = ?').run(id);
    res.json(success());
  },

  batchOffline(req, res) {
    const { ids, type = 'theme' } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json(error('请选择要下线的内容'));
    }

    const placeholders = ids.map(() => '?').join(',');

    if (type === 'theme') {
      db.prepare(`UPDATE theme SET status = 0 WHERE id IN (${placeholders})`).run(...ids);
    } else if (type === 'interpretation') {
      db.prepare(`UPDATE interpretation SET status = 0 WHERE id IN (${placeholders})`).run(...ids);
    }

    res.json(success({ updated: ids.length }));
  },

  sensitiveWordsList(req, res) {
    const { page = 1, pageSize = 20, level, keyword } = req.query;
    const p = parseInt(page);
    const ps = parseInt(pageSize);

    const where = [];
    const params = [];

    if (level) {
      where.push('level = ?');
      params.push(parseInt(level));
    }
    if (keyword) {
      where.push('word LIKE ?');
      params.push(`%${keyword}%`);
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const total = db.prepare(`SELECT COUNT(*) as c FROM sensitive_word ${whereSQL}`).get(...params).c;
    const items = db.prepare(`
      SELECT * FROM sensitive_word ${whereSQL}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(...params, ps, (p - 1) * ps);

    res.json(success({
      items,
      ...paginate(p, ps, total),
    }));
  },

  addSensitiveWord(req, res) {
    const { word, level = 1 } = req.body;

    if (!word) {
      return res.status(400).json(error('敏感词不能为空'));
    }

    try {
      const result = db.prepare(`
        INSERT INTO sensitive_word (word, level) VALUES (?, ?)
      `).run(word.trim(), parseInt(level));
      res.json(success({ id: result.lastInsertRowid }));
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

    if (!content) {
      return res.status(400).json(error('内容不能为空'));
    }

    const words = db.prepare('SELECT word, level FROM sensitive_word').all();
    const hit = [];

    for (const w of words) {
      if (content.includes(w.word)) {
        hit.push({ word: w.word, level: w.level });
      }
    }

    let masked = content;
    for (const h of hit) {
      masked = masked.split(h.word).join('*'.repeat(h.word.length));
    }

    res.json(success({
      has_sensitive: hit.length > 0,
      hit_words: hit,
      masked_content: masked,
      max_level: hit.length ? Math.max(...hit.map(h => h.level)) : 0,
    }));
  },

  userPreferences(req, res) {
    const { anonymous_id, page = 1, pageSize = 20 } = req.query;
    const p = parseInt(page);
    const ps = parseInt(pageSize);

    const where = [];
    const params = [];

    if (anonymous_id) {
      where.push('anonymous_id = ?');
      params.push(anonymous_id);
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const total = db.prepare(`SELECT COUNT(*) as c FROM user_preference ${whereSQL}`).get(...params).c;
    const items = db.prepare(`
      SELECT * FROM user_preference ${whereSQL}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(...params, ps, (p - 1) * ps);

    res.json(success({
      items,
      ...paginate(p, ps, total),
    }));
  },
};

module.exports = adminController;
