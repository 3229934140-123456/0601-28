const titleTemplates = {
  love: [
    '我的爱情运势竟是这样！太准了吧~',
    '测完我震惊了！我的桃花居然在...',
    '快来看看你的命中注定是谁！',
    '这个恋爱占卜太神奇了，我先收藏了！',
    '据说99%的人测完都分享了！',
  ],
  career: [
    '我的事业运竟然这么强！',
    '升职加薪就靠它了！快来测测',
    '今年事业能否翻盘？一测便知',
    '职场人的必测！你的贵人在哪里？',
    '这个事业占卜说中了我的心声...',
  ],
  wealth: [
    '我的财运居然这么好！快来沾沾喜气',
    '今年能不能暴富？测完我笑了',
    '你的正财偏财哪个更旺？',
    '财神爷什么时候眷顾你？一测便知',
    '这个财运测试太准了，赶紧来试试',
  ],
  health: [
    '我的健康运势出来了，快来看看你的',
    '身体是革命的本钱！测测你的健康运',
    '今年需要注意哪些健康问题？',
    '你的精气神足不足？一测便知',
    '这个健康占卜给我提了个醒...',
  ],
  general: [
    '我测了一下，结果太意外了！',
    '这个占卜也太准了吧！强烈推荐',
    '快来测测，看看你的运势如何~',
    '据说很灵的占卜，我先测为敬！',
    '今天的运势怎么样？快来看看',
    '不试不知道，一试吓一跳的占卜！',
  ],
};

function generateShareTitle(themeName, themeType, resultTitle) {
  const templates = titleTemplates[themeType] || titleTemplates.general;
  const randomIdx = Math.floor(Math.random() * templates.length);
  let title = templates[randomIdx];

  title = title.replace('{theme}', themeName || '');
  title = title.replace('{result}', resultTitle || '');

  return title;
}

function generateShareImage(themeId, resultId) {
  return `/api/share/image/${themeId}/${resultId}`;
}

module.exports = { generateShareTitle, generateShareImage, titleTemplates };
