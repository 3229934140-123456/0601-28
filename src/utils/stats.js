const db = require('../config/database');

const stmtCache = {};

function incrStat(themeId, field) {
  if (!themeId || !field) return;

  if (!stmtCache[field]) {
    const sql = `
      INSERT INTO theme_daily_stats (theme_id, stat_date, ${field})
      VALUES (?, DATE('now'), 1)
      ON CONFLICT(theme_id, stat_date) DO UPDATE SET ${field} = ${field} + 1
    `;
    stmtCache[field] = db.prepare(sql);
  }

  try {
    stmtCache[field].run(themeId);
  } catch (e) {
    console.warn(`[stats] incr ${field} failed:`, e.message);
  }
}

module.exports = {
  incrStat,
};
