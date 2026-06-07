const db = require('../config/database');
const { success, error, paginate } = require('../utils/response');
const { checkSensitive } = require('../utils/sensitive');

const themeController = {
  list(req, res) {
    const { page = 1, pageSize = 10, type, status, keyword } = req.query;
    const p = parseInt(page);
    const ps = parseInt(pageSize);

    let where = '1=1';
    const params = [];

    if (type) {
      where += ' AND type = ?';
      params.push(type);
    }
    if (status !== undefined) {
      where += ' AND status = ?';
      params.push(parseInt(status));
    }
    if (keyword) {
      where += ' AND name LIKE ?';
      params.push(`%${keyword}%`);
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM theme WHERE ${where}`).get(...params).count;
    const items = db.prepare(`
      SELECT * FROM theme WHERE ${where}
      ORDER BY sort_order ASC, id DESC
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

  detail(req, res) {
    const { id } = req.params;
    const theme = db.prepare('SELECT * FROM theme WHERE id = ?').get(id);

    if (!theme) {
      return res.status(404).json(error('主题不存在'));
    }

    db.prepare('UPDATE theme SET view_count = view_count + 1 WHERE id = ?').run(id);

    const questions = db.prepare(`
      SELECT q.*,
        (SELECT COUNT(*) FROM option o WHERE o.question_id = q.id) as option_count
      FROM question q
      WHERE q.theme_id = ? AND q.status = 1
      ORDER BY q.sort_order ASC, q.id ASC
    `).all(id);

    for (const q of questions) {
      q.options = db.prepare(`
        SELECT * FROM option WHERE question_id = ?
        ORDER BY sort_order ASC, id ASC
      `).all(q.id);
    }

    res.json(success({ ...theme, questions }));
  },

  create(req, res) {
    const { name, type, description, cover_image, sort_order = 0 } = req.body;

    if (!name || !type) {
      return res.status(400).json(error('名称和类型不能为空'));
    }

    const sens = checkSensitive(name + description);
    if (sens.hasSensitive && sens.maxLevel >= 2) {
      return res.status(400).json(error('内容包含敏感词，请修改后重试'));
    }

    const result = db.prepare(`
      INSERT INTO theme (name, type, description, cover_image, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, type, description || '', cover_image || '', sort_order);

    res.json(success({ id: result.lastInsertRowid }));
  },

  update(req, res) {
    const { id } = req.params;
    const { name, type, description, cover_image, status, sort_order } = req.body;

    const theme = db.prepare('SELECT * FROM theme WHERE id = ?').get(id);
    if (!theme) {
      return res.status(404).json(error('主题不存在'));
    }

    const fields = [];
    const params = [];

    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (type !== undefined) { fields.push('type = ?'); params.push(type); }
    if (description !== undefined) { fields.push('description = ?'); params.push(description); }
    if (cover_image !== undefined) { fields.push('cover_image = ?'); params.push(cover_image); }
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(sort_order); }

    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);
      db.prepare(`UPDATE theme SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json(success());
  },

  remove(req, res) {
    const { id } = req.params;
    db.prepare('DELETE FROM theme WHERE id = ?').run(id);
    res.json(success());
  },

  hotRank(req, res) {
    const { limit = 10, type } = req.query;
    const l = parseInt(limit);

    let where = 'status = 1';
    const params = [];
    if (type) {
      where += ' AND type = ?';
      params.push(type);
    }

    const items = db.prepare(`
      SELECT * FROM theme WHERE ${where}
      ORDER BY use_count DESC, view_count DESC, id DESC
      LIMIT ?
    `).all(...params, l);

    res.json(success(items));
  },

  batchOffline(req, res) {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json(error('请选择要下线的主题'));
    }

    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE theme SET status = 0 WHERE id IN (${placeholders})`).run(...ids);

    res.json(success({ count: ids.length }));
  },
};

module.exports = themeController;
