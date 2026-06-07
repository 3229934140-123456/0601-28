const db = require('../config/database');
const { success, error } = require('../utils/response');
const { checkSensitive } = require('../utils/sensitive');

const interpretationController = {
  list(req, res) {
    const { page = 1, pageSize = 20, theme_id, status, keyword } = req.query;
    const p = parseInt(page);
    const ps = parseInt(pageSize);

    let where = '1=1';
    const params = [];

    if (theme_id) {
      where += ' AND i.theme_id = ?';
      params.push(theme_id);
    }
    if (status !== undefined) {
      where += ' AND i.status = ?';
      params.push(parseInt(status));
    }
    if (keyword) {
      where += ' AND (i.title LIKE ? OR i.content LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM interpretation i WHERE ${where}
    `).get(...params).count;

    const items = db.prepare(`
      SELECT i.*, t.name as theme_name, t.type as theme_type
      FROM interpretation i
      LEFT JOIN theme t ON t.id = i.theme_id
      WHERE ${where}
      ORDER BY i.sort_order ASC, i.id ASC
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

    const item = db.prepare(`
      SELECT i.*, t.name as theme_name
      FROM interpretation i
      LEFT JOIN theme t ON t.id = i.theme_id
      WHERE i.id = ?
    `).get(id);

    if (!item) {
      return res.status(404).json(error('解读不存在'));
    }

    res.json(success(item));
  },

  create(req, res) {
    const { theme_id, result_key, title, content, score_min = 0, score_max = 100, sort_order = 0, status = 1 } = req.body;

    if (!theme_id || !title || !content) {
      return res.status(400).json(error('主题ID、标题、内容不能为空'));
    }

    const theme = db.prepare('SELECT id FROM theme WHERE id = ?').get(theme_id);
    if (!theme) {
      return res.status(404).json(error('主题不存在'));
    }

    const sens = checkSensitive(title + content);
    if (sens.hasSensitive && sens.maxLevel >= 2) {
      return res.status(400).json(error('内容包含敏感词，请修改后重试'));
    }

    const result = db.prepare(`
      INSERT INTO interpretation (theme_id, result_key, title, content, score_min, score_max, sort_order, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      theme_id,
      result_key || null,
      title,
      content,
      score_min,
      score_max,
      sort_order,
      status
    );

    res.json(success({ id: result.lastInsertRowid }));
  },

  update(req, res) {
    const { id } = req.params;
    const { result_key, title, content, score_min, score_max, sort_order, status } = req.body;

    const item = db.prepare('SELECT * FROM interpretation WHERE id = ?').get(id);
    if (!item) {
      return res.status(404).json(error('解读不存在'));
    }

    const fields = [];
    const params = [];

    if (result_key !== undefined) { fields.push('result_key = ?'); params.push(result_key); }
    if (title !== undefined) {
      const sens = checkSensitive(title);
      if (sens.hasSensitive && sens.maxLevel >= 2) {
        return res.status(400).json(error('标题包含敏感词'));
      }
      fields.push('title = ?'); params.push(title);
    }
    if (content !== undefined) {
      const sens = checkSensitive(content);
      if (sens.hasSensitive && sens.maxLevel >= 2) {
        return res.status(400).json(error('内容包含敏感词'));
      }
      fields.push('content = ?'); params.push(content);
    }
    if (score_min !== undefined) { fields.push('score_min = ?'); params.push(score_min); }
    if (score_max !== undefined) { fields.push('score_max = ?'); params.push(score_max); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(sort_order); }
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }

    if (fields.length > 0) {
      params.push(id);
      db.prepare(`UPDATE interpretation SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json(success());
  },

  remove(req, res) {
    const { id } = req.params;
    db.prepare('DELETE FROM interpretation WHERE id = ?').run(id);
    res.json(success());
  },

  batchOffline(req, res) {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json(error('请选择要下线的解读'));
    }

    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE interpretation SET status = 0 WHERE id IN (${placeholders})`).run(...ids);

    res.json(success({ count: ids.length }));
  },

  matchByScore(req, res) {
    const { theme_id, score } = req.body;

    if (!theme_id || score === undefined) {
      return res.status(400).json(error('主题ID和分数不能为空'));
    }

    const s = parseInt(score);

    const matched = db.prepare(`
      SELECT * FROM interpretation
      WHERE theme_id = ? AND status = 1
        AND ? >= score_min AND ? <= score_max
      ORDER BY sort_order ASC
      LIMIT 1
    `).get(theme_id, s, s);

    if (matched) {
      return res.json(success(matched));
    }

    const all = db.prepare(`
      SELECT * FROM interpretation
      WHERE theme_id = ? AND status = 1
      ORDER BY sort_order ASC
    `).all(theme_id);

    if (all.length === 0) {
      return res.status(404).json(error('该主题暂无可用解读'));
    }

    const closest = all.reduce((prev, curr) => {
      const prevMid = (prev.score_min + prev.score_max) / 2;
      const currMid = (curr.score_min + curr.score_max) / 2;
      return Math.abs(s - currMid) < Math.abs(s - prevMid) ? curr : prev;
    });

    res.json(success(closest));
  },

  matchByKey(req, res) {
    const { theme_id, result_key } = req.body;

    if (!theme_id || !result_key) {
      return res.status(400).json(error('主题ID和结果标识不能为空'));
    }

    const matched = db.prepare(`
      SELECT * FROM interpretation
      WHERE theme_id = ? AND result_key = ? AND status = 1
      LIMIT 1
    `).get(theme_id, result_key);

    if (!matched) {
      return res.status(404).json(error('未找到对应解读'));
    }

    res.json(success(matched));
  },
};

module.exports = interpretationController;
