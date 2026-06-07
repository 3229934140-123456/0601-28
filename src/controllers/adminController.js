const db = require('../config/database');
const { success, error } = require('../utils/response');

function buildPagination(page, pageSize, total) {
  const p = parseInt(page);
  const ps = parseInt(pageSize);
  return {
    page: p,
    pageSize: ps,
    total,
    totalPages: Math.ceil(total / ps),
  };
}

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
      ...buildPagination(p, ps, totalResult?.total || 0),
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

  getFunnelStats(req, res) {
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

    const where = ['s.stat_date >= ?', 's.stat_date <= ?'];
    const params = [startDate, endDate];

    if (theme_id) {
      where.push('s.theme_id = ?');
      params.push(theme_id);
    }

    const whereSQL = 'WHERE ' + where.join(' AND ');

    const totalRow = db.prepare(`
      SELECT
        SUM(s.view_count) as view_count,
        SUM(s.draw_count) as draw_count,
        SUM(s.fortune_count) as fortune_count,
        SUM(s.answer_count) as answer_count,
        SUM(s.collect_count) as collect_count,
        SUM(s.share_count) as share_count
      FROM theme_daily_stats s
      ${whereSQL}
    `).get(...params);

    const feedbackCount = db.prepare(`
      SELECT COUNT(*) as c FROM feedback
      WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
    `).get(startDate, endDate).c;

    const view = totalRow?.view_count || 0;
    const draw = totalRow?.draw_count || 0;
    const fortune = totalRow?.fortune_count || 0;
    const answer = totalRow?.answer_count || 0;
    const useCount = draw + fortune + answer;
    const collect = totalRow?.collect_count || 0;
    const share = totalRow?.share_count || 0;
    const feedback = feedbackCount || 0;

    const funnelSteps = [
      { key: 'view', name: '浏览', count: view, rate: view > 0 ? 100 : 0 },
      { key: 'draw', name: '抽牌/抽签', count: draw, rate: view > 0 ? (draw / view * 100) : 0 },
      { key: 'fortune', name: '测算', count: fortune, rate: view > 0 ? (fortune / view * 100) : 0 },
      { key: 'answer', name: '答题', count: answer, rate: view > 0 ? (answer / view * 100) : 0 },
      { key: 'use', name: '总使用', count: useCount, rate: view > 0 ? (useCount / view * 100) : 0 },
      { key: 'collect', name: '收藏', count: collect, rate: useCount > 0 ? (collect / useCount * 100) : 0 },
      { key: 'share', name: '分享', count: share, rate: useCount > 0 ? (share / useCount * 100) : 0 },
      { key: 'feedback', name: '反馈', count: feedback, rate: useCount > 0 ? (feedback / useCount * 100) : 0 },
    ];

    const dailyRows = db.prepare(`
      SELECT
        s.stat_date,
        SUM(s.view_count) as view_count,
        SUM(s.draw_count) as draw_count,
        SUM(s.fortune_count) as fortune_count,
        SUM(s.answer_count) as answer_count,
        SUM(s.collect_count) as collect_count,
        SUM(s.share_count) as share_count
      FROM theme_daily_stats s
      ${whereSQL}
      GROUP BY s.stat_date
      ORDER BY s.stat_date ASC
    `).all(...params);

    const dailyFb = db.prepare(`
      SELECT DATE(created_at) as stat_date, COUNT(*) as feedback_count
      FROM feedback
      WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
      GROUP BY DATE(created_at)
      ORDER BY stat_date ASC
    `).all(startDate, endDate);

    const fbMap = {};
    for (const f of dailyFb) fbMap[f.stat_date] = f.feedback_count;

    const dates = [];
    const dailyTrend = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    const dailyMap = {};
    for (const r of dailyRows) dailyMap[r.stat_date] = r;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      dates.push(dateStr);
      const row = dailyMap[dateStr] || {};
      const fb = fbMap[dateStr] || 0;
      const v = row.view_count || 0;
      const dr = row.draw_count || 0;
      const fr = row.fortune_count || 0;
      const an = row.answer_count || 0;
      const use = dr + fr + an;
      const col = row.collect_count || 0;
      const sh = row.share_count || 0;

      dailyTrend.push({
        date: dateStr,
        view_count: v,
        draw_count: dr,
        fortune_count: fr,
        answer_count: an,
        use_count: use,
        collect_count: col,
        share_count: sh,
        feedback_count: fb,
        draw_rate: v > 0 ? (dr / v * 100) : 0,
        fortune_rate: v > 0 ? (fr / v * 100) : 0,
        answer_rate: v > 0 ? (an / v * 100) : 0,
        collect_rate: use > 0 ? (col / use * 100) : 0,
        share_rate: use > 0 ? (sh / use * 100) : 0,
      });
    }

    res.json(success({
      funnel: funnelSteps,
      total: {
        view_count: view,
        draw_count: draw,
        fortune_count: fortune,
        answer_count: answer,
        use_count: useCount,
        collect_count: collect,
        share_count: share,
        feedback_count: feedback,
      },
      dates,
      daily_trend: dailyTrend,
      date_range: { start: startDate, end: endDate },
    }));
  },

  feedbackList(req, res) {
    const { page = 1, pageSize = 20, status, keyword, contact, start_date, end_date } = req.query;
    const p = parseInt(page);
    const ps = parseInt(pageSize);

    const where = [];
    const params = [];

    if (status !== undefined && status !== '') {
      where.push('status = ?');
      params.push(parseInt(status));
    }
    if (keyword) {
      where.push('content LIKE ?');
      params.push(`%${keyword}%`);
    }
    if (contact) {
      where.push('contact LIKE ?');
      params.push(`%${contact}%`);
    }
    if (start_date) {
      where.push('DATE(created_at) >= ?');
      params.push(start_date);
    }
    if (end_date) {
      where.push('DATE(created_at) <= ?');
      params.push(end_date);
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
      ...buildPagination(p, ps, total),
    }));
  },

  feedbackDetail(req, res) {
    const { id } = req.params;

    const fb = db.prepare('SELECT * FROM feedback WHERE id = ?').get(id);
    if (!fb) {
      return res.status(404).json(error('反馈不存在'));
    }

    const anonymousId = fb.anonymous_id;

    const recentThemes = db.prepare(`
      SELECT DISTINCT t.id, t.name, t.type, t.cover_image, MAX(fr.created_at) as last_time
      FROM fortune_result fr
      LEFT JOIN theme t ON t.id = fr.theme_id
      WHERE fr.anonymous_id = ?
      GROUP BY t.id
      ORDER BY last_time DESC
      LIMIT 10
    `).all(anonymousId);

    const recentResults = db.prepare(`
      SELECT fr.*, t.name as theme_name
      FROM fortune_result fr
      LEFT JOIN theme t ON t.id = fr.theme_id
      WHERE fr.anonymous_id = ?
      ORDER BY fr.id DESC
      LIMIT 10
    `).all(anonymousId);

    const collectionCount = db.prepare(`
      SELECT COUNT(*) as c FROM collection WHERE anonymous_id = ?
    `).get(anonymousId).c;

    const prefs = db.prepare(`
      SELECT preference_type, value, MAX(created_at) as last_time
      FROM user_preference
      WHERE anonymous_id = ?
      GROUP BY preference_type
    `).all(anonymousId);

    const prefMap = {};
    for (const p of prefs) prefMap[p.preference_type] = { value: p.value, last_time: p.last_time };

    res.json(success({
      feedback: fb,
      user_profile: {
        anonymous_id: anonymousId,
        recent_themes: recentThemes,
        recent_results: recentResults,
        collection_count: collectionCount,
        last_birthday: prefMap.birthday?.value || null,
        last_question: prefMap.draw_question?.value || null,
        share_channel: prefMap.share_channel?.value || null,
        preferences: prefMap,
      },
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

  batchUpdateFeedbackStatus(req, res) {
    const { ids, status } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json(error('请选择要操作的反馈'));
    }
    if (status === undefined) {
      return res.status(400).json(error('状态不能为空'));
    }

    const placeholders = ids.map(() => '?').join(',');
    const sql = `UPDATE feedback SET status = ? WHERE id IN (${placeholders})`;
    const result = db.prepare(sql).run(parseInt(status), ...ids);

    res.json(success({ updated: result.changes }));
  },

  sensitiveWordsList(req, res) {
    const { page = 1, pageSize = 20, level, keyword, start_date, end_date } = req.query;
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
    if (start_date) {
      where.push('DATE(created_at) >= ?');
      params.push(start_date);
    }
    if (end_date) {
      where.push('DATE(created_at) <= ?');
      params.push(end_date);
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
      ...buildPagination(p, ps, total),
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

  batchAddSensitiveWords(req, res) {
    const { words, level = 1 } = req.body;

    if (!words || !Array.isArray(words) || words.length === 0) {
      return res.status(400).json(error('请提供要导入的敏感词列表'));
    }

    const lv = parseInt(level);
    let successCount = 0;
    let failCount = 0;
    const failed = [];

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO sensitive_word (word, level) VALUES (?, ?)
    `);

    const tx = db.transaction(() => {
      for (const w of words) {
        const word = typeof w === 'string' ? w.trim() : (w.word || '').trim();
        const wordLevel = w.level ? parseInt(w.level) : lv;

        if (!word) {
          failCount++;
          failed.push({ word: w, reason: '词不能为空' });
          continue;
        }

        try {
          const result = insertStmt.run(word, wordLevel);
          if (result.changes > 0) {
            successCount++;
          } else {
            failCount++;
            failed.push({ word, reason: '已存在' });
          }
        } catch (e) {
          failCount++;
          failed.push({ word, reason: e.message });
        }
      }
    });

    tx();

    res.json(success({
      total: words.length,
      success: successCount,
      failed: failCount,
      failed_items: failed,
    }));
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
    const levelCount = {};

    for (const w of words) {
      if (content.includes(w.word)) {
        hit.push({ word: w.word, level: w.level });
        levelCount[w.level] = (levelCount[w.level] || 0) + 1;
      }
    }

    let masked = content;
    for (const h of hit) {
      masked = masked.split(h.word).join('*'.repeat(h.word.length));
    }

    res.json(success({
      has_sensitive: hit.length > 0,
      hit_words: hit,
      hit_count: hit.length,
      level_distribution: levelCount,
      masked_content: masked,
      max_level: hit.length ? Math.max(...hit.map(h => h.level)) : 0,
    }));
  },

  userPreferences(req, res) {
    const { page = 1, pageSize = 20, anonymous_id, theme_type, preference_type, keyword } = req.query;
    const p = parseInt(page);
    const ps = parseInt(pageSize);

    const where = [];
    const params = [];

    if (anonymous_id) {
      where.push('up.anonymous_id = ?');
      params.push(anonymous_id);
    }
    if (preference_type) {
      where.push('up.preference_type = ?');
      params.push(preference_type);
    }
    if (keyword) {
      where.push('up.value LIKE ?');
      params.push(`%${keyword}%`);
    }

    let joinSQL = '';
    if (theme_type) {
      joinSQL = 'LEFT JOIN theme t ON t.id = up.theme_id';
      where.push('t.type = ?');
      params.push(theme_type);
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const total = db.prepare(`
      SELECT COUNT(DISTINCT up.id) as c
      FROM user_preference up
      ${joinSQL}
      ${whereSQL}
    `).get(...params).c;

    const items = db.prepare(`
      SELECT up.*, t.name as theme_name, t.type as theme_type
      FROM user_preference up
      LEFT JOIN theme t ON t.id = up.theme_id
      ${whereSQL}
      ORDER BY up.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, ps, (p - 1) * ps);

    res.json(success({
      items,
      ...buildPagination(p, ps, total),
    }));
  },

  userProfile(req, res) {
    const { anonymous_id } = req.query;

    if (!anonymous_id) {
      return res.status(400).json(error('anonymous_id 不能为空'));
    }

    const prefs = db.prepare(`
      SELECT preference_type, value, MAX(created_at) as last_time
      FROM user_preference
      WHERE anonymous_id = ?
      GROUP BY preference_type
    `).all(anonymous_id);

    const prefMap = {};
    for (const p of prefs) {
      prefMap[p.preference_type] = { value: p.value, last_time: p.last_time };
    }

    const themeStats = db.prepare(`
      SELECT
        t.id, t.name, t.type, t.cover_image,
        COUNT(DISTINCT fr.id) as result_count,
        MAX(fr.created_at) as last_time
      FROM fortune_result fr
      LEFT JOIN theme t ON t.id = fr.theme_id
      WHERE fr.anonymous_id = ?
      GROUP BY t.id
      ORDER BY last_time DESC
    `).all(anonymous_id);

    const collectionStats = db.prepare(`
      SELECT
        t.id, t.name, t.type, t.cover_image,
        COUNT(c.id) as collect_count,
        MAX(c.created_at) as last_time
      FROM collection c
      LEFT JOIN theme t ON t.id = c.theme_id
      WHERE c.anonymous_id = ?
      GROUP BY t.id
      ORDER BY collect_count DESC
    `).all(anonymous_id);

    const totalResults = db.prepare(`
      SELECT COUNT(*) as c FROM fortune_result WHERE anonymous_id = ?
    `).get(anonymous_id).c;

    const totalCollections = db.prepare(`
      SELECT COUNT(*) as c FROM collection WHERE anonymous_id = ?
    `).get(anonymous_id).c;

    const feedbackCount = db.prepare(`
      SELECT COUNT(*) as c FROM feedback WHERE anonymous_id = ?
    `).get(anonymous_id).c;

    const firstTime = db.prepare(`
      SELECT MIN(created_at) as first_time FROM fortune_result WHERE anonymous_id = ?
    `).get(anonymous_id).first_time;

    res.json(success({
      anonymous_id,
      overview: {
        total_results: totalResults,
        total_collections: totalCollections,
        feedback_count: feedbackCount,
        first_time: firstTime,
        theme_count: themeStats.length,
        collect_theme_count: collectionStats.length,
      },
      preferences: prefMap,
      last_birthday: prefMap.birthday?.value || null,
      last_question: prefMap.draw_question?.value || null,
      share_channel: prefMap.share_channel?.value || null,
      theme_stats: themeStats,
      collection_stats: collectionStats,
    }));
  },

  bannerList(req, res) {
    const { status } = req.query;

    const where = [];
    const params = [];

    if (status !== undefined && status !== '') {
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
};

module.exports = adminController;
