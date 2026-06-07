const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

function anonymousId(req, res, next) {
  let anonId = req.headers['x-anonymous-id'] || req.query.anonymous_id || req.body?.anonymous_id;

  if (!anonId || anonId.length < 10) {
    anonId = uuidv4();
  }

  req.anonymousId = anonId;

  res.setHeader('X-Anonymous-Id', anonId);

  next();
}

module.exports = anonymousId;
