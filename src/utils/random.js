function randomPick(arr, count = 1, allowRepeat = false) {
  if (!arr || arr.length === 0) return [];
  if (count <= 0) return [];

  if (allowRepeat) {
    const result = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * arr.length);
      result.push(arr[idx]);
    }
    return result;
  }

  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

function shuffle(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function weightedRandom(items, weightKey = 'weight') {
  const totalWeight = items.reduce((sum, item) => sum + (item[weightKey] || 1), 0);
  let random = Math.random() * totalWeight;

  for (const item of items) {
    random -= (item[weightKey] || 1);
    if (random <= 0) return item;
  }

  return items[items.length - 1];
}

module.exports = { randomPick, shuffle, weightedRandom };
