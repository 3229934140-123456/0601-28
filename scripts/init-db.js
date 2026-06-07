const db = require('../src/config/database');

console.log('=== 娱乐占卜平台 - 数据初始化 ===\n');

const insertSensitiveWords = db.prepare(`
  INSERT OR IGNORE INTO sensitive_word (word, level) VALUES (?, ?)
`);

const sensitiveWords = [
  ['赌博', 2], ['色情', 2], ['暴力', 2], ['毒品', 2],
  ['诈骗', 2], ['传销', 2], ['邪教', 2],
  ['傻逼', 1], ['草你', 1], ['操你', 1], ['妈的', 1],
  ['滚蛋', 1], ['白痴', 1], ['智障', 1],
];

const tx1 = db.transaction(() => {
  for (const [word, level] of sensitiveWords) {
    insertSensitiveWords.run(word, level);
  }
});
tx1();
console.log(`✓ 敏感词初始化完成（${sensitiveWords.length} 条）`);

const themeExists = db.prepare('SELECT COUNT(*) as c FROM theme').get().c > 0;

if (!themeExists) {
  const insertTheme = db.prepare(`
    INSERT INTO theme (name, type, description, sort_order, status)
    VALUES (?, ?, ?, ?, 1)
  `);

  const insertInterp = db.prepare(`
    INSERT INTO interpretation (theme_id, result_key, title, content, score_min, score_max, sort_order, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const insertDeck = db.prepare(`
    INSERT INTO card_deck (theme_id, name, description, card_count, status)
    VALUES (?, ?, ?, ?, 1)
  `);

  const insertCard = db.prepare(`
    INSERT INTO card (deck_id, name, image, upright_text, reversed_text, meaning, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const seedTx = db.transaction(() => {
    const loveId = insertTheme.run('爱情运势', 'love', '测测你的爱情运势，看看最近的桃花如何', 1).lastInsertRowid;
    const careerId = insertTheme.run('事业占卜', 'career', '事业发展、职场运势，帮你找准方向', 2).lastInsertRowid;
    const wealthId = insertTheme.run('财运测算', 'wealth', '正财偏财全掌握，看看你的财运如何', 3).lastInsertRowid;
    const zodiacId = insertTheme.run('十二星座', 'constellation', '十二星座每日运势，按生日测算', 4).lastInsertRowid;

    insertInterp.run(loveId, 'great', '上上签 · 桃花满满', '近期桃花运爆棚，心仪的人可能也在默默关注你。勇敢一点，或许就能收获美好的爱情。感情中双方都很投入，是建立深厚关系的好时机。', 80, 100, 1);
    insertInterp.run(loveId, 'good', '中上签 · 情投意合', '感情稳定发展，彼此之间有说不完的话题。虽然偶尔会有小摩擦，但都是感情的调味剂。多一些包容和理解，关系会更上一层楼。', 60, 79, 2);
    insertInterp.run(loveId, 'normal', '中签 · 平平淡淡', '感情生活比较平淡，没有太大的波澜。单身者可能需要多出去走走，拓展社交圈。有伴者可以一起尝试新鲜事物，为感情注入活力。', 40, 59, 3);
    insertInterp.run(loveId, 'low', '下签 · 情路坎坷', '近期感情方面可能会遇到一些阻碍，需要耐心面对。单身者不要急于求成，缘分到了自然会来。有伴者多沟通，避免误会加深。', 0, 39, 4);

    insertInterp.run(careerId, 'promote', '上上签 · 步步高升', '事业运极佳，近期可能会有升职加薪的机会。你的努力和能力都被领导看在眼里，继续保持，前途不可限量。贵人运旺，遇到困难会有人相助。', 80, 100, 1);
    insertInterp.run(careerId, 'stable', '中上签 · 稳中有进', '工作整体顺利，虽然没有大的突破，但也在稳步前进。建议多学习新技能，为未来的发展积蓄力量。人际关系融洽，团队合作愉快。', 60, 79, 2);
    insertInterp.run(careerId, 'normal', '中签 · 按部就班', '工作中规中矩，做好本职工作就好。不要太急于表现，稳扎稳打更重要。可能会遇到一些小挫折，调整好心态继续前行。', 40, 59, 3);
    insertInterp.run(careerId, 'tough', '下签 · 职场瓶颈', '近期事业上可能会遇到瓶颈期，感到有些迷茫。这是一个沉淀和思考的好时机，想清楚自己真正想要的是什么，再出发也不迟。', 0, 39, 4);

    insertInterp.run(wealthId, 'rich', '上上签 · 财源广进', '财运亨通，不管正财偏财都有机会。可以适当做一些投资理财，但也要注意风险控制。贵人带财，多跟朋友聊聊可能会有意外收获。', 80, 100, 1);
    insertInterp.run(wealthId, 'steady', '中上签 · 稳中有盈', '财运不错，收入稳定增长。理财方面适合稳健型投资，不要冒太大风险。量入为出，合理规划开支，积蓄会越来越多。', 60, 79, 2);
    insertInterp.run(wealthId, 'normal', '中签 · 收支平衡', '财运平平，收入和支出基本持平。建议做好预算，避免不必要的开销。想要增加收入，可以考虑发展副业或者提升主业能力。', 40, 59, 3);
    insertInterp.run(wealthId, 'loss', '下签 · 破财预警', '近期财运不佳，可能会有意外支出。投资方面要谨慎行事，不要盲目跟风。量入为出，勤俭节约，熬过这段时间就会好转。', 0, 39, 4);

    const deckId = insertDeck.run(loveId, '爱情塔罗', '经典塔罗牌爱情占卜，三张牌看感情走向', 3).lastInsertRowid;
    insertCard.run(deckId, '恋人', '', '完美的结合，真挚的爱情，双方心意相通。', '感情出现裂痕，可能有第三者介入，需要谨慎处理。', '代表爱情、选择、结合，是感情中最重要的牌之一。', 1);
    insertCard.run(deckId, '情人', '', '浪漫的邂逅，甜蜜的约会，感情升温。', '遭遇情感挫折，单相思，关系不稳定。', '象征着新的恋情、浪漫的开始和情感的表达。', 2);
    insertCard.run(deckId, '星星', '', '充满希望，愿望达成，感情美好。', '希望渺茫，感情迷茫，失去信心。', '代表希望、灵感和宁静，是治愈心灵的牌。', 3);

    console.log(`✓ 演示主题初始化完成（4 个主题 + 12 条解读 + 1 个牌组 + 3 张牌）`);
  });

  seedTx();
} else {
  console.log('✓ 主题数据已存在，跳过初始化');
}

console.log('\n=== 初始化完成 ===');
console.log('可以执行 npm start 启动服务');
