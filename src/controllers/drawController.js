const db = require('../config/database');
const { success, error } = require('../utils/response');
const { randomPick } = require('../utils/random');
const { generateShareTitle } = require('../utils/share');
const { checkSensitive } = require('../utils/sensitive');

const drawController = {
  drawCards(req, res) {
    const { theme_id, deck_id, count = 3, allow_reversed = true, question = '' } = req.body;
    const anonymousId = req.anonymousId;

    if (!deck_id && !theme_id) {
      return res.status(400).json(error('牌组ID或主题ID不能为空'));
    }

    let deck;
    if (deck_id) {
      deck = db.prepare('SELECT * FROM card_deck WHERE id = ? AND status = 1').get(deck_id);
    } else {
      deck = db.prepare(`
        SELECT cd.* FROM card_deck cd
        WHERE cd.theme_id = ? AND cd.status = 1
        LIMIT 1
      `).get(theme_id);
    }

    if (!deck) {
      return res.status(404).json(error('牌组不存在'));
    }

    const cards = db.prepare(`
      SELECT * FROM card WHERE deck_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(deck.id);

    if (cards.length === 0) {
      return res.status(400).json(error('牌组中没有牌'));
    }

    const drawCount = Math.min(parseInt(count) || 3, cards.length);
    const drawnCards = randomPick(cards, drawCount, false);

    const resultCards = drawnCards.map((card, idx) => {
      const isReversed = allow_reversed ? Math.random() < 0.3 : false;
      const text = isReversed ? card.reversed_text : card.upright_text;
      return {
        id: card.id,
        name: card.name,
        image: card.image,
        position: isReversed ? 'reversed' : 'upright',
        position_text: isReversed ? '逆位' : '正位',
        text: text,
        meaning: card.meaning,
        order: idx + 1,
      };
    });

    const interpretations = db.prepare(`
      SELECT * FROM interpretation
      WHERE theme_id = ?
      ORDER BY sort_order ASC
    `).get(deck.theme_id);

    let resultKey = '';
    let resultTitle = '';
    let resultContent = '';

    if (resultCards.length > 0) {
      resultKey = resultCards.map(c => c.id + '_' + c.position).join(',');
      resultTitle = resultCards[0].name + ' · ' + resultCards[0].position_text;
      resultContent = resultCards.map(c => `【${c.name} - ${c.position_text}】\n${c.text}\n${c.meaning}`).join('\n\n');
    }

    const theme = db.prepare('SELECT * FROM theme WHERE id = ?').get(deck.theme_id);
    const shareTitle = generateShareTitle(theme?.name, theme?.type, resultTitle);

    const insertResult = db.prepare(`
      INSERT INTO fortune_result (theme_id, result_key, title, content, cards, anonymous_id, share_title)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      deck.theme_id,
      resultKey,
      resultTitle,
      resultContent,
      JSON.stringify(resultCards),
      anonymousId,
      shareTitle
    );

    db.prepare('UPDATE theme SET use_count = use_count + 1 WHERE id = ?').run(deck.theme_id);

    if (question) {
      db.prepare(`
        INSERT OR REPLACE INTO user_preference (anonymous_id, theme_id, preference_type, value)
        VALUES (?, ?, 'question', ?)
      `).run(anonymousId, deck.theme_id, question);
    }

    res.json(success({
      result_id: insertResult.lastInsertRowid,
      theme_id: deck.theme_id,
      deck_id: deck.id,
      cards: resultCards,
      title: resultTitle,
      content: resultContent,
      share_title: shareTitle,
    }));
  },

  drawLot(req, res) {
    const { theme_id } = req.body;
    const anonymousId = req.anonymousId;

    if (!theme_id) {
      return res.status(400).json(error('主题ID不能为空'));
    }

    const theme = db.prepare('SELECT * FROM theme WHERE id = ? AND status = 1').get(theme_id);
    if (!theme) {
      return res.status(404).json(error('主题不存在'));
    }

    const interpretations = db.prepare(`
      SELECT * FROM interpretation
      WHERE theme_id = ?
      ORDER BY sort_order ASC
    `).all(theme_id);

    if (interpretations.length === 0) {
      return res.status(400).json(error('该主题暂无签文'));
    }

    const result = randomPick(interpretations, 1, false)[0];

    const shareTitle = generateShareTitle(theme.name, theme.type, result.title);

    const insertResult = db.prepare(`
      INSERT INTO fortune_result (theme_id, result_key, title, content, score, anonymous_id, share_title)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      theme_id,
      result.result_key || ('lot_' + result.id),
      result.title,
      result.content,
      result.score_min !== undefined ? Math.floor((result.score_min + result.score_max) / 2) : null,
      anonymousId,
      shareTitle
    );

    db.prepare('UPDATE theme SET use_count = use_count + 1 WHERE id = ?').run(theme_id);

    res.json(success({
      result_id: insertResult.lastInsertRowid,
      theme_id,
      result_key: result.result_key || ('lot_' + result.id),
      title: result.title,
      content: result.content,
      score: result.score_min !== undefined ? Math.floor((result.score_min + result.score_max) / 2) : null,
      share_title: shareTitle,
    }));
  },

  submitAnswer(req, res) {
    const { theme_id, answers = [] } = req.body;
    const anonymousId = req.anonymousId;

    if (!theme_id) {
      return res.status(400).json(error('主题ID不能为空'));
    }

    const theme = db.prepare('SELECT * FROM theme WHERE id = ? AND status = 1').get(theme_id);
    if (!theme) {
      return res.status(404).json(error('主题不存在'));
    }

    let totalScore = 0;
    const answerDetails = [];

    for (const ans of answers) {
      const option = db.prepare('SELECT * FROM option WHERE id = ?').get(ans.option_id);
      if (option) {
        totalScore += option.score || 0;
        answerDetails.push({
          question_id: ans.question_id,
          option_id: ans.option_id,
          score: option.score || 0,
          result_key: option.result_key,
        });
      }
    }

    const interpretations = db.prepare(`
      SELECT * FROM interpretation
      WHERE theme_id = ?
      ORDER BY sort_order ASC
    `).all(theme_id);

    let matchedResult = null;
    for (const interp of interpretations) {
      if (totalScore >= interp.score_min && totalScore <= interp.score_max) {
        matchedResult = interp;
        break;
      }
    }

    if (!matchedResult && interpretations.length > 0) {
      const closest = interpretations.reduce((prev, curr) => {
        const prevDiff = Math.abs(totalScore - ((prev.score_min + prev.score_max) / 2));
        const currDiff = Math.abs(totalScore - ((curr.score_min + curr.score_max) / 2));
        return currDiff < prevDiff ? curr : prev;
      });
      matchedResult = closest;
    }

    const resultTitle = matchedResult?.title || `得分：${totalScore}分`;
    const resultContent = matchedResult?.content || `你的测试得分为 ${totalScore} 分。`;

    const shareTitle = generateShareTitle(theme.name, theme.type, resultTitle);

    const insertResult = db.prepare(`
      INSERT INTO fortune_result (theme_id, result_key, title, content, score, anonymous_id, share_title)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      theme_id,
      matchedResult?.result_key || `score_${totalScore}`,
      resultTitle,
      resultContent,
      totalScore,
      anonymousId,
      shareTitle
    );

    db.prepare('UPDATE theme SET use_count = use_count + 1 WHERE id = ?').run(theme_id);

    res.json(success({
      result_id: insertResult.lastInsertRowid,
      theme_id,
      score: totalScore,
      title: resultTitle,
      content: resultContent,
      result_key: matchedResult?.result_key || `score_${totalScore}`,
      share_title: shareTitle,
      answers: answerDetails,
    }));
  },
};

module.exports = drawController;
