const db = require('../config/database');
const { success, error } = require('../utils/response');
const { getZodiac, getChineseZodiac, getAge, getConstellationLuck, parseBirthday } = require('../utils/fortune');
const { generateShareTitle } = require('../utils/share');

const fortuneController = {
  constellation(req, res) {
    const { birthday, theme_id } = req.body;
    const anonymousId = req.anonymousId;

    if (!birthday) {
      return res.status(400).json(error('生日不能为空'));
    }

    const date = parseBirthday(birthday);
    if (!date) {
      return res.status(400).json(error('生日格式不正确'));
    }

    const zodiac = getZodiac(birthday);
    const chineseZodiac = getChineseZodiac(birthday);
    const age = getAge(birthday);
    const luck = getConstellationLuck(birthday);

    const theme = theme_id ? db.prepare('SELECT * FROM theme WHERE id = ?').get(theme_id) : null;
    const themeType = theme?.type || 'general';
    const themeName = theme?.name || '星座运势';

    const title = `${zodiac.name}今日运势`;
    const content = `
【${zodiac.name}】${zodiac.element}象星座
生肖：${chineseZodiac}
年龄：${age}岁

综合运势：${luck.overall}分
爱情运势：${luck.love}分
事业运势：${luck.career}分
财运：${luck.wealth}分
健康运：${luck.health}分

幸运颜色：${luck.luckyColor}
幸运数字：${luck.luckyNumber}
`.trim();

    const shareTitle = generateShareTitle(themeName, themeType, title);

    const insertResult = db.prepare(`
      INSERT INTO fortune_result (theme_id, result_key, title, content, birthday, anonymous_id, share_title, score, result_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'constellation')
    `).run(
      theme_id || 0,
      `zodiac_${zodiac.name}`,
      title,
      content,
      birthday,
      anonymousId,
      shareTitle,
      luck.overall
    );

    if (theme_id) {
      db.prepare('UPDATE theme SET use_count = use_count + 1 WHERE id = ?').run(theme_id);
    }

    db.prepare(`
      INSERT OR REPLACE INTO user_preference (anonymous_id, theme_id, preference_type, value)
      VALUES (?, COALESCE(?, 0), 'birthday', ?)
    `).run(anonymousId, theme_id || null, birthday);

    res.json(success({
      result_id: insertResult.lastInsertRowid,
      theme_id: theme_id || 0,
      zodiac: zodiac.name,
      element: zodiac.element,
      chinese_zodiac: chineseZodiac,
      age,
      luck: {
        overall: luck.overall,
        love: luck.love,
        career: luck.career,
        wealth: luck.wealth,
        health: luck.health,
      },
      lucky_color: luck.luckyColor,
      lucky_number: luck.luckyNumber,
      title,
      content,
      share_title: shareTitle,
    }));
  },

  zodiacDetail(req, res) {
    const { zodiac_name, type = 'today' } = req.query;

    if (!zodiac_name) {
      return res.status(400).json(error('星座名称不能为空'));
    }

    const seed = hashCode(zodiac_name + type + new Date().toDateString());
    const scores = {
      overall: Math.floor((seed % 40) + 60),
      love: Math.floor(((seed >> 3) % 40) + 60),
      career: Math.floor(((seed >> 6) % 40) + 60),
      wealth: Math.floor(((seed >> 9) % 40) + 60),
      health: Math.floor(((seed >> 12) % 40) + 60),
    };

    const suggestions = [
      '今天适合静下心来思考人生方向',
      '可以约朋友聊聊，会有意外收获',
      '注意休息，劳逸结合很重要',
      '财运不错，可以考虑理财规划',
      '工作上会有贵人相助，把握机会',
      '感情方面需要多一些耐心和理解',
    ];

    const suggestion = suggestions[seed % suggestions.length];

    res.json(success({
      zodiac: zodiac_name,
      type,
      scores,
      suggestion,
      lucky_color: ['红色', '蓝色', '绿色', '金色', '白色', '紫色'][seed % 6],
      lucky_number: (seed % 9) + 1,
    }));
  },

  eightChar(req, res) {
    const { birthday, hour, gender, theme_id } = req.body;
    const anonymousId = req.anonymousId;

    if (!birthday) {
      return res.status(400).json(error('生日不能为空'));
    }

    const date = parseBirthday(birthday);
    if (!date) {
      return res.status(400).json(error('生日格式不正确'));
    }

    const zodiac = getZodiac(birthday);
    const chineseZodiac = getChineseZodiac(birthday);

    const tianGan = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const diZhi = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

    const yearIndex = (date.year - 1984 + 60) % 60;
    const yearGan = tianGan[yearIndex % 10];
    const yearZhi = diZhi[yearIndex % 12];

    const monthIndex = (date.month + 1) % 12;
    const monthGan = tianGan[(yearIndex * 12 + monthIndex + 3) % 10];
    const monthZhi = diZhi[(monthIndex + 1) % 12];

    const dayBase = Math.floor((date.year - 1900) * 365 + (date.year - 1900) / 4 + date.day + date.month * 30);
    const dayGan = tianGan[Math.floor(dayBase + 9) % 10];
    const dayZhi = diZhi[Math.floor(dayBase + 1) % 12];

    const hourIdx = hour ? Math.floor(parseInt(hour) / 2 + 1) % 12 : 0;
    const hourGan = tianGan[(Math.floor(dayBase + 9) % 10 * 2 + hourIdx) % 10];
    const hourZhi = diZhi[hourIdx];

    const eightChar = `${yearGan}${yearZhi} ${monthGan}${monthZhi} ${dayGan}${dayZhi} ${hourGan}${hourZhi}`;
    const fiveElements = calcFiveElements(eightChar);

    const theme = theme_id ? db.prepare('SELECT * FROM theme WHERE id = ?').get(theme_id) : null;
    const themeType = theme?.type || 'general';
    const themeName = theme?.name || '八字测算';

    const title = `你的八字是 ${eightChar.split(' ').map(s => s).join(' ')}`;
    const content = `
八字：${eightChar}

五行分析：
金：${fiveElements.jin}
木：${fiveElements.mu}
水：${fiveElements.shui}
火：${fiveElements.huo}
土：${fiveElements.tu}

生肖：${chineseZodiac}
星座：${zodiac.name}

五行平衡建议：${getElementSuggestion(fiveElements)}
`.trim();

    const shareTitle = generateShareTitle(themeName, themeType, '我的八字');

    const insertResult = db.prepare(`
      INSERT INTO fortune_result (theme_id, result_key, title, content, birthday, anonymous_id, share_title, result_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'bazi')
    `).run(
      theme_id || 0,
      `bazi_${eightChar.replace(/ /g, '')}`,
      title,
      content,
      birthday,
      anonymousId,
      shareTitle
    );

    if (theme_id) {
      db.prepare('UPDATE theme SET use_count = use_count + 1 WHERE id = ?').run(theme_id);
    }

    res.json(success({
      result_id: insertResult.lastInsertRowid,
      theme_id: theme_id || 0,
      eight_char: eightChar,
      year: { gan: yearGan, zhi: yearZhi },
      month: { gan: monthGan, zhi: monthZhi },
      day: { gan: dayGan, zhi: dayZhi },
      hour: { gan: hourGan, zhi: hourZhi },
      five_elements: fiveElements,
      chinese_zodiac: chineseZodiac,
      zodiac: zodiac.name,
      title,
      content,
      share_title: shareTitle,
    }));
  },
};

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function calcFiveElements(eightChar) {
  const elementMap = {
    '甲': 'mu', '乙': 'mu',
    '丙': 'huo', '丁': 'huo',
    '戊': 'tu', '己': 'tu',
    '庚': 'jin', '辛': 'jin',
    '壬': 'shui', '癸': 'shui',
    '寅': 'mu', '卯': 'mu',
    '巳': 'huo', '午': 'huo',
    '辰': 'tu', '丑': 'tu', '未': 'tu', '戌': 'tu',
    '申': 'jin', '酉': 'jin',
    '亥': 'shui', '子': 'shui',
  };

  const result = { jin: 0, mu: 0, shui: 0, huo: 0, tu: 0 };

  for (const char of eightChar) {
    if (char === ' ') continue;
    const element = elementMap[char];
    if (element) {
      result[element]++;
    }
  }

  return result;
}

function getElementSuggestion(elements) {
  const entries = Object.entries(elements);
  const max = entries.reduce((a, b) => a[1] > b[1] ? a : b);
  const min = entries.reduce((a, b) => a[1] < b[1] ? a : b);

  const nameMap = {
    jin: '金', mu: '木', shui: '水', huo: '火', tu: '土'
  };

  if (max[1] - min[1] >= 2) {
    return `${nameMap[max[0]]}过旺，${nameMap[min[0]]}偏弱，建议在生活中多接触${nameMap[min[0]]}属性的事物以平衡五行。`;
  }
  return '五行较为平衡，继续保持良好的生活习惯。';
}

module.exports = fortuneController;
