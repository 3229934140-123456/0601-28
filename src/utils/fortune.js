const zodiacSigns = [
  { name: '白羊座', start: [3, 21], end: [4, 19], element: '火' },
  { name: '金牛座', start: [4, 20], end: [5, 20], element: '土' },
  { name: '双子座', start: [5, 21], end: [6, 21], element: '风' },
  { name: '巨蟹座', start: [6, 22], end: [7, 22], element: '水' },
  { name: '狮子座', start: [7, 23], end: [8, 22], element: '火' },
  { name: '处女座', start: [8, 23], end: [9, 22], element: '土' },
  { name: '天秤座', start: [9, 23], end: [10, 23], element: '风' },
  { name: '天蝎座', start: [10, 24], end: [11, 22], element: '水' },
  { name: '射手座', start: [11, 23], end: [12, 21], element: '火' },
  { name: '摩羯座', start: [12, 22], end: [1, 19], element: '土' },
  { name: '水瓶座', start: [1, 20], end: [2, 18], element: '风' },
  { name: '双鱼座', start: [2, 19], end: [3, 20], element: '水' },
];

const chineseZodiacs = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

function getZodiac(birthday) {
  const date = parseBirthday(birthday);
  if (!date) return null;

  const month = date.month;
  const day = date.day;

  for (const sign of zodiacSigns) {
    const [startMonth, startDay] = sign.start;
    const [endMonth, endDay] = sign.end;

    if (startMonth <= endMonth) {
      if ((month === startMonth && day >= startDay) ||
          (month === endMonth && day <= endDay) ||
          (month > startMonth && month < endMonth)) {
        return sign;
      }
    } else {
      if ((month === startMonth && day >= startDay) ||
          (month === endMonth && day <= endDay) ||
          month > startMonth || month < endMonth) {
        return sign;
      }
    }
  }

  return zodiacSigns[9];
}

function getChineseZodiac(birthday) {
  const date = parseBirthday(birthday);
  if (!date) return null;

  const year = date.year;
  const startYear = 1900;
  const idx = ((year - startYear) % 12 + 12) % 12;
  return chineseZodiacs[idx];
}

function parseBirthday(birthday) {
  if (!birthday) return null;

  let year, month, day;

  if (typeof birthday === 'string') {
    const parts = birthday.split(/[-\/.]/);
    if (parts.length >= 3) {
      year = parseInt(parts[0]);
      month = parseInt(parts[1]);
      day = parseInt(parts[2]);
    }
  } else if (typeof birthday === 'object' && birthday.year) {
    year = birthday.year;
    month = birthday.month;
    day = birthday.day;
  }

  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return { year, month, day };
}

function getAge(birthday) {
  const date = parseBirthday(birthday);
  if (!date) return null;

  const now = new Date();
  let age = now.getFullYear() - date.year;
  const monthDiff = now.getMonth() + 1 - date.month;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.day)) {
    age--;
  }
  return age;
}

function getConstellationLuck(birthday) {
  const zodiac = getZodiac(birthday);
  if (!zodiac) return null;

  const seed = hashCode(birthday + new Date().toDateString());
  const lucky = {
    overall: Math.floor((seed % 100) + 1),
    love: Math.floor(((seed >> 4) % 100) + 1),
    career: Math.floor(((seed >> 8) % 100) + 1),
    wealth: Math.floor(((seed >> 12) % 100) + 1),
    health: Math.floor(((seed >> 16) % 100) + 1),
    luckyColor: ['红色', '蓝色', '绿色', '金色', '白色', '紫色', '粉色'][seed % 7],
    luckyNumber: (seed % 9) + 1,
  };

  return { zodiac: zodiac.name, element: zodiac.element, ...lucky };
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

module.exports = {
  getZodiac,
  getChineseZodiac,
  getAge,
  parseBirthday,
  getConstellationLuck,
  zodiacSigns,
  chineseZodiacs,
};
