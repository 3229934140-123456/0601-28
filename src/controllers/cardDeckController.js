const db = require('../config/database');
const { success, error, paginate } = require('../utils/response');
const { checkSensitive } = require('../utils/sensitive');

const cardDeckController = {
  list(req, res) {
    const { page = 1, pageSize = 10, theme_id, status } = req.query;
    const p = parseInt(page);
    const ps = parseInt(pageSize);

    let where = '1=1';
    const params = [];

    if (theme_id) {
      where += ' AND cd.theme_id = ?';
      params.push(theme_id);
    }
    if (status !== undefined) {
      where += ' AND cd.status = ?';
      params.push(parseInt(status));
    }

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM card_deck cd WHERE ${where}
    `).get(...params).count;

    const items = db.prepare(`
      SELECT cd.*, t.name as theme_name,
        (SELECT COUNT(*) FROM card c WHERE c.deck_id = cd.id) as card_count
      FROM card_deck cd
      LEFT JOIN theme t ON t.id = cd.theme_id
      WHERE ${where}
      ORDER BY cd.id DESC
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
    const deck = db.prepare('SELECT * FROM card_deck WHERE id = ?').get(id);

    if (!deck) {
      return res.status(404).json(error('牌组不存在'));
    }

    const cards = db.prepare(`
      SELECT * FROM card WHERE deck_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(id);

    res.json(success({ ...deck, cards }));
  },

  create(req, res) {
    const { theme_id, name, description, cards = [] } = req.body;

    if (!theme_id || !name) {
      return res.status(400).json(error('主题ID和牌组名称不能为空'));
    }

    const sens = checkSensitive(name + description);
    if (sens.hasSensitive && sens.maxLevel >= 2) {
      return res.status(400).json(error('内容包含敏感词'));
    }

    const theme = db.prepare('SELECT id FROM theme WHERE id = ?').get(theme_id);
    if (!theme) {
      return res.status(404).json(error('主题不存在'));
    }

    const result = db.prepare(`
      INSERT INTO card_deck (theme_id, name, description, card_count)
      VALUES (?, ?, ?, ?)
    `).run(theme_id, name, description || '', cards.length);

    const deckId = result.lastInsertRowid;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const cardSens = checkSensitive(card.name + card.upright_text + card.reversed_text + card.meaning);
      if (!cardSens.hasSensitive || cardSens.maxLevel < 2) {
        db.prepare(`
          INSERT INTO card (deck_id, name, image, upright_text, reversed_text, meaning, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          deckId,
          card.name || '',
          card.image || '',
          card.upright_text || '',
          card.reversed_text || '',
          card.meaning || '',
          card.sort_order !== undefined ? card.sort_order : i
        );
      }
    }

    res.json(success({ id: deckId }));
  },

  update(req, res) {
    const { id } = req.params;
    const { name, description, status, cards } = req.body;

    const deck = db.prepare('SELECT * FROM card_deck WHERE id = ?').get(id);
    if (!deck) {
      return res.status(404).json(error('牌组不存在'));
    }

    const fields = [];
    const params = [];

    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (description !== undefined) { fields.push('description = ?'); params.push(description); }
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }

    if (fields.length > 0) {
      params.push(id);
      db.prepare(`UPDATE card_deck SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }

    if (Array.isArray(cards)) {
      db.prepare('DELETE FROM card WHERE deck_id = ?').run(id);
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        db.prepare(`
          INSERT INTO card (deck_id, name, image, upright_text, reversed_text, meaning, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          card.name || '',
          card.image || '',
          card.upright_text || '',
          card.reversed_text || '',
          card.meaning || '',
          card.sort_order !== undefined ? card.sort_order : i
        );
      }
      db.prepare('UPDATE card_deck SET card_count = ? WHERE id = ?').run(cards.length, id);
    }

    res.json(success());
  },

  remove(req, res) {
    const { id } = req.params;

    const deck = db.prepare('SELECT * FROM card_deck WHERE id = ?').get(id);
    if (!deck) {
      return res.status(404).json(error('牌组不存在'));
    }

    const cardCount = db.prepare('SELECT COUNT(*) as count FROM card WHERE deck_id = ?').get(id).count;

    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM card WHERE deck_id = ?').run(id);
      db.prepare('DELETE FROM card_deck WHERE id = ?').run(id);
    });

    deleteTx();

    res.json(success({ deleted: true, card_count: cardCount }));
  },
};

module.exports = cardDeckController;
