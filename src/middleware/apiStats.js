const db = require('../config/database');

const upsertStats = db.prepare(`
  INSERT INTO api_stats (api_path, method, call_date, call_count)
  VALUES (?, ?, DATE('now'), 1)
  ON CONFLICT(api_path, method, call_date)
  DO UPDATE SET call_count = call_count + 1
`);

function apiStats(req, res, next) {
  const startTime = Date.now();

  res.on('finish', () => {
    try {
      let path = req.path;
      path = path.replace(/\/\d+/g, '/:id');
      upsertStats.run(path, req.method);
    } catch (e) {
      console.error('API stats error:', e.message);
    }
  });

  next();
}

module.exports = apiStats;
