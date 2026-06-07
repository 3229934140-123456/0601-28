const db = require('../config/database');
const { success, error } = require('../utils/response');
const { checkSensitive } = require('../utils/sensitive');

const questionController = {
  list(req, res) {
    const { theme_id, status } = req.query;

    let where = '1=1';
    const params = [];

    if (theme_id) {
      where += ' AND theme_id = ?';
      params.push(theme_id);
    }
    if (status !== undefined) {
      where += ' AND status = ?';
      params.push(parseInt(status));
    }

    const items = db.prepare(`
      SELECT * FROM question WHERE ${where}
      ORDER BY sort_order ASC, id ASC
    `).all(...params);

    for (const q of items) {
      q.options = db.prepare(`
        SELECT * FROM option WHERE question_id = ?
        ORDER BY sort_order ASC, id ASC
      `).all(q.id);
    }

    res.json(success(items));
  },

  create(req, res) {
    const { theme_id, content, sort_order = 0, options = [] } = req.body;

    if (!theme_id || !content) {
      return res.status(400).json(error('主题ID和问题内容不能为空'));
    }

    const sens = checkSensitive(content);
    if (sens.hasSensitive && sens.maxLevel >= 2) {
      return res.status(400).json(error('问题内容包含敏感词'));
    }

    const theme = db.prepare('SELECT id FROM theme WHERE id = ?').get(theme_id);
    if (!theme) {
      return res.status(404).json(error('主题不存在'));
    }

    const result = db.prepare(`
      INSERT INTO question (theme_id, content, sort_order)
      VALUES (?, ?, ?)
    `).run(theme_id, content, sort_order);

    const questionId = result.lastInsertRowid;

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const optSens = checkSensitive(opt.content);
      if (!optSens.hasSensitive || optSens.maxLevel < 2) {
        db.prepare(`
          INSERT INTO option (question_id, content, score, result_key, sort_order)
          VALUES (?, ?, ?, ?, ?)
        `).run(questionId, opt.content, opt.score || 0, opt.result_key || null, opt.sort_order || i);
      }
    }

    res.json(success({ id: questionId }));
  },

  update(req, res) {
    const { id } = req.params;
    const { content, status, sort_order, options } = req.body;

    const question = db.prepare('SELECT * FROM question WHERE id = ?').get(id);
    if (!question) {
      return res.status(404).json(error('问题不存在'));
    }

    const fields = [];
    const params = [];

    if (content !== undefined) {
      const sens = checkSensitive(content);
      if (sens.hasSensitive && sens.maxLevel >= 2) {
        return res.status(400).json(error('问题内容包含敏感词'));
      }
      fields.push('content = ?');
      params.push(content);
    }
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(sort_order); }

    if (fields.length > 0) {
      params.push(id);
      db.prepare(`UPDATE question SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }

    if (Array.isArray(options)) {
      db.prepare('DELETE FROM option WHERE question_id = ?').run(id);
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        db.prepare(`
          INSERT INTO option (question_id, content, score, result_key, sort_order)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, opt.content, opt.score || 0, opt.result_key || null, opt.sort_order || i);
      }
    }

    res.json(success());
  },

  remove(req, res) {
    const { id } = req.params;

    const question = db.prepare('SELECT * FROM question WHERE id = ?').get(id);
    if (!question) {
      return res.status(404).json(error('问题不存在'));
    }

    const optionCount = db.prepare('SELECT COUNT(*) as count FROM option WHERE question_id = ?').get(id).count;

    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM option WHERE question_id = ?').run(id);
      db.prepare('DELETE FROM question WHERE id = ?').run(id);
    });

    deleteTx();

    res.json(success({ deleted: true, option_count: optionCount }));
  },
};

module.exports = questionController;
