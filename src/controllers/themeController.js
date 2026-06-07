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

    const interpretationCount = db.prepare(`
      SELECT COUNT(*) as count FROM interpretation
      WHERE theme_id = ? AND status = 1
    `).get(id).count;

    const deckCount = db.prepare(`
      SELECT COUNT(*) as count FROM card_deck
      WHERE theme_id = ? AND status = 1
    `).get(id).count;

    res.json(success({
      ...theme,
      questions,
      interpretation_count: interpretationCount,
      deck_count: deckCount,
    }));
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
    const { force = false } = req.query;

    const theme = db.prepare('SELECT * FROM theme WHERE id = ?').get(id);
    if (!theme) {
      return res.status(404).json(error('主题不存在'));
    }

    const questionCount = db.prepare('SELECT COUNT(*) as count FROM question WHERE theme_id = ?').get(id).count;
    const deckCount = db.prepare('SELECT COUNT(*) as count FROM card_deck WHERE theme_id = ?').get(id).count;
    const interpretationCount = db.prepare('SELECT COUNT(*) as count FROM interpretation WHERE theme_id = ?').get(id).count;
    const resultCount = db.prepare('SELECT COUNT(*) as count FROM fortune_result WHERE theme_id = ?').get(id).count;

    const relations = {
      questions: questionCount,
      card_decks: deckCount,
      interpretations: interpretationCount,
      results: resultCount,
    };

    const totalRelations = questionCount + deckCount + interpretationCount + resultCount;

    if (!force && totalRelations > 0) {
      return res.status(400).json(error('该主题下存在关联内容，无法直接删除', 400, {
        relations,
        tip: '可先下线主题，或传入 force=true 强制级联删除所有关联内容',
      }));
    }

    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM user_preference WHERE theme_id = ?').run(id);
      db.prepare('DELETE FROM submit_log WHERE theme_id = ?').run(id);
      db.prepare('DELETE FROM collection WHERE theme_id = ?').run(id);
      db.prepare('DELETE FROM fortune_result WHERE theme_id = ?').run(id);
      db.prepare('DELETE FROM interpretation WHERE theme_id = ?').run(id);

      const decks = db.prepare('SELECT id FROM card_deck WHERE theme_id = ?').all(id);
      for (const deck of decks) {
        db.prepare('DELETE FROM card WHERE deck_id = ?').run(deck.id);
      }
      db.prepare('DELETE FROM card_deck WHERE theme_id = ?').run(id);

      const questions = db.prepare('SELECT id FROM question WHERE theme_id = ?').all(id);
      for (const q of questions) {
        db.prepare('DELETE FROM option WHERE question_id = ?').run(q.id);
      }
      db.prepare('DELETE FROM question WHERE theme_id = ?').run(id);

      db.prepare('DELETE FROM theme WHERE id = ?').run(id);
    });

    deleteTx();

    res.json(success({ deleted: true, relations }));
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
