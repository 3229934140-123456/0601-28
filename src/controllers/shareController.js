const db = require('../config/database');
const { success, error } = require('../utils/response');
const { generateShareTitle } = require('../utils/share');

const shareController = {
  getShareInfo(req, res) {
    const { result_id } = req.query;

    if (!result_id) {
      return res.status(400).json(error('结果ID不能为空'));
    }

    const result = db.prepare('SELECT * FROM fortune_result WHERE id = ?').get(result_id);
    if (!result) {
      return res.status(404).json(error('结果不存在'));
    }

    const theme = db.prepare('SELECT name, type, cover_image FROM theme WHERE id = ?').get(result.theme_id);

    const shareTitle = result.share_title || generateShareTitle(theme?.name, theme?.type, result.title);

    res.json(success({
      result_id: result.id,
      title: shareTitle,
      desc: result.content?.slice(0, 80) + '...' || '',
      image: theme?.cover_image || '',
      theme_name: theme?.name || '',
      result_title: result.title,
    }));
  },

  generateTitle(req, res) {
    const { theme_name, theme_type, result_title } = req.body;

    const title = generateShareTitle(theme_name, theme_type, result_title);

    res.json(success({
      title,
    }));
  },

  recordShare(req, res) {
    const { result_id, channel } = req.body;
    const anonymousId = req.anonymousId;

    db.prepare(`
      INSERT OR REPLACE INTO user_preference (anonymous_id, theme_id, preference_type, value)
      VALUES (?, 0, 'share_channel', ?)
    `).run(anonymousId, channel || 'unknown');

    res.json(success());
  },
};

module.exports = shareController;
