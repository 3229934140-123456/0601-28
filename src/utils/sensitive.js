const db = require('../config/database');

function checkSensitive(text) {
  if (!text) return { hasSensitive: false, words: [] };

  const words = db.prepare('SELECT word, level FROM sensitive_word').all();
  const found = [];

  for (const w of words) {
    if (text.includes(w.word)) {
      found.push(w);
    }
  }

  return {
    hasSensitive: found.length > 0,
    words: found,
    maxLevel: found.length > 0 ? Math.max(...found.map(f => f.level)) : 0
  };
}

function maskSensitive(text) {
  if (!text) return text;
  const words = db.prepare('SELECT word FROM sensitive_word').all();
  let result = text;
  for (const w of words) {
    const mask = '*'.repeat(w.word.length);
    const regex = new RegExp(w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    result = result.replace(regex, mask);
  }
  return result;
}

module.exports = { checkSensitive, maskSensitive };
