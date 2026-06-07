const db = require('../config/database');
const { success, error, paginate } = require('../utils/response');
const { generateShareInfo } = require('../utils/share');
const { incrStat } = require('../utils/stats');

const resultController = {
  detail(req, res) {
    const { id } = req.params;
    const anonymousId = req.anonymousId;

    const result = db.prepare('SELECT * FROM fortune_result WHERE id = ?').get(id);

    if (!result) {
      return res.status(404).json(error('结果不存在'));
    }

    try {
      if (result.cards) {
        result.cards = JSON.parse(result.cards);
      }
    } catch (e) {}

    const theme = db.prepare('SELECT id, name, type, cover_image, description FROM theme WHERE id = ?').get(result.theme_id);
    result.theme_name = theme?.name || '';
    result.theme_cover = theme?.cover_image || '';
    result.theme_type = theme?.type || '';
    result.theme_desc = theme?.description || '';

    const isCollected = db.prepare(`
      SELECT id FROM collection WHERE result_id = ? AND anonymous_id = ?
    `).get(id, anonymousId);
    result.is_collected = !!isCollected;

    result.share_info = {
      title: result.share_title || result.title,
      desc: result.content ? result.content.slice(0, 80) + '...' : '',
      image: theme?.cover_image || '',
      theme_name: theme?.name || '',
    };

    const lastFortune = db.prepare(`
      SELECT created_at FROM fortune_result
      WHERE theme_id = ? AND anonymous_id = ? AND id != ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(result.theme_id, anonymousId, id);
    result.last_fortune_time = lastFortune?.created_at || null;

    const recommendThemes = db.prepare(`
      SELECT id, name, type, cover_image, use_count, description
      FROM theme
      WHERE status = 1 AND id != ?
      ORDER BY use_count DESC, view_count DESC
      LIMIT 5
    `).all(result.theme_id);
    result.recommend_themes = recommendThemes;

    res.json(success(result));
  },

  myList(req, res) {
    const {
      page = 1,
      pageSize = 10,
      theme_id,
      theme_type,
      is_collected,
      start_date,
      end_date,
    } = req.query;
    const anonymousId = req.anonymousId;
    const p = parseInt(page);
    const ps = parseInt(pageSize);

    let where = 'fr.anonymous_id = ?';
    const params = [anonymousId];
    const countParams = [anonymousId];

    if (theme_id) {
      where += ' AND fr.theme_id = ?';
      params.push(theme_id);
      countParams.push(theme_id);
    }

    if (theme_type) {
      where += ' AND t.type = ?';
      params.push(theme_type);
      countParams.push(theme_type);
    }

    if (is_collected !== undefined && is_collected !== '') {
      const collected = parseInt(is_collected) === 1;
      if (collected) {
        where += ' AND EXISTS(SELECT 1 FROM collection c WHERE c.result_id = fr.id AND c.anonymous_id = ?)';
        params.push(anonymousId);
        countParams.push(anonymousId);
      } else {
        where += ' AND NOT EXISTS(SELECT 1 FROM collection c WHERE c.result_id = fr.id AND c.anonymous_id = ?)';
        params.push(anonymousId);
        countParams.push(anonymousId);
      }
    }

    if (start_date) {
      where += ' AND DATE(fr.created_at) >= ?';
      params.push(start_date);
      countParams.push(start_date);
    }
    if (end_date) {
      where += ' AND DATE(fr.created_at) <= ?';
      params.push(end_date);
      countParams.push(end_date);
    }

    const totalSql = `
      SELECT COUNT(*) as count
      FROM fortune_result fr
      LEFT JOIN theme t ON t.id = fr.theme_id
      WHERE ${where}
    `;
    const total = db.prepare(totalSql).get(...countParams).count;

    const items = db.prepare(`
      SELECT fr.*, t.name as theme_name, t.type as theme_type, t.cover_image as theme_cover,
        EXISTS(SELECT 1 FROM collection c WHERE c.result_id = fr.id AND c.anonymous_id = ?) as is_collected
      FROM fortune_result fr
      LEFT JOIN theme t ON t.id = fr.theme_id
      WHERE ${where}
      ORDER BY fr.created_at DESC
      LIMIT ? OFFSET ?
    `).all(anonymousId, ...params, ps, (p - 1) * ps);

    for (const item of items) {
      try {
        if (item.cards) item.cards = JSON.parse(item.cards);
      } catch (e) {}
    }

    res.json(success({
      items,
      total,
      page: p,
      pageSize: ps,
      totalPages: Math.ceil(total / ps),
    }));
  },

  collect(req, res) {
    const { result_id } = req.body;
    const anonymousId = req.anonymousId;

    if (!result_id) {
      return res.status(400).json(error('结果ID不能为空'));
    }

    const result = db.prepare('SELECT * FROM fortune_result WHERE id = ?').get(result_id);
    if (!result) {
      return res.status(404).json(error('结果不存在'));
    }

    const existing = db.prepare(`
      SELECT id FROM collection WHERE result_id = ? AND anonymous_id = ?
    `).get(result_id, anonymousId);

    if (existing) {
      db.prepare('DELETE FROM collection WHERE id = ?').run(existing.id);
      db.prepare('UPDATE fortune_result SET is_collected = 0 WHERE id = ?').run(result_id);
      return res.json(success({ collected: false }));
    }

    const theme = db.prepare('SELECT name, cover_image FROM theme WHERE id = ?').get(result.theme_id);

    db.prepare(`
      INSERT INTO collection (result_id, anonymous_id, theme_id, title, cover)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      result_id,
      anonymousId,
      result.theme_id,
      result.title,
      theme?.cover_image || ''
    );

    db.prepare('UPDATE fortune_result SET is_collected = 1 WHERE id = ?').run(result_id);
    incrStat(result.theme_id, 'collect_count');

    res.json(success({ collected: true }));
  },

  collectionList(req, res) {
    const { page = 1, pageSize = 10, theme_type, keyword } = req.query;
    const anonymousId = req.anonymousId;
    const p = parseInt(page);
    const ps = parseInt(pageSize);

    let where = 'c.anonymous_id = ?';
    const params = [anonymousId];

    if (theme_type) {
      where += ' AND t.type = ?';
      params.push(theme_type);
    }
    if (keyword) {
      where += ' AND (c.title LIKE ? OR t.name LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const total = db.prepare(`
      SELECT COUNT(*) as count
      FROM collection c
      LEFT JOIN theme t ON t.id = c.theme_id
      WHERE ${where}
    `).get(...params).count;

    const items = db.prepare(`
      SELECT c.*, t.name as theme_name, t.type as theme_type
      FROM collection c
      LEFT JOIN theme t ON t.id = c.theme_id
      WHERE ${where}
      ORDER BY c.created_at DESC
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
};

module.exports = resultController;
