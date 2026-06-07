const db = require('../config/database');
const { success, error } = require('../utils/response');

const resultController = {
  detail(req, res) {
    const { id } = req.params;

    const result = db.prepare('SELECT * FROM fortune_result WHERE id = ?').get(id);

    if (!result) {
      return res.status(404).json(error('结果不存在'));
    }

    try {
      if (result.cards) {
        result.cards = JSON.parse(result.cards);
      }
    } catch (e) {}

    const theme = db.prepare('SELECT name, cover_image FROM theme WHERE id = ?').get(result.theme_id);
    result.theme_name = theme?.name || '';
    result.theme_cover = theme?.cover_image || '';

    res.json(success(result));
  },

  myList(req, res) {
    const { page = 1, pageSize = 10, theme_id } = req.query;
    const anonymousId = req.anonymousId;
    const p = parseInt(page);
    const ps = parseInt(pageSize);

    let where = 'anonymous_id = ?';
    const params = [anonymousId];

    if (theme_id) {
      where += ' AND theme_id = ?';
      params.push(theme_id);
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM fortune_result WHERE ${where}`).get(...params).count;

    const items = db.prepare(`
      SELECT fr.*, t.name as theme_name, t.cover_image as theme_cover,
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

    res.json(success({ collected: true }));
  },

  collectionList(req, res) {
    const { page = 1, pageSize = 10 } = req.query;
    const anonymousId = req.anonymousId;
    const p = parseInt(page);
    const ps = parseInt(pageSize);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM collection WHERE anonymous_id = ?
    `).get(anonymousId).count;

    const items = db.prepare(`
      SELECT c.*, t.name as theme_name
      FROM collection c
      LEFT JOIN theme t ON t.id = c.theme_id
      WHERE c.anonymous_id = ?
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `).all(anonymousId, ps, (p - 1) * ps);

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
