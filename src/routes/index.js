const express = require('express');
const router = express.Router();

const db = require('../config/database');

const themeController = require('../controllers/themeController');
const questionController = require('../controllers/questionController');
const cardDeckController = require('../controllers/cardDeckController');
const interpretationController = require('../controllers/interpretationController');
const drawController = require('../controllers/drawController');
const fortuneController = require('../controllers/fortuneController');
const resultController = require('../controllers/resultController');
const shareController = require('../controllers/shareController');
const adminController = require('../controllers/adminController');

const { submitLimit } = require('../middleware/rateLimit');

function resolveDrawThemeId(req) {
  let themeId = req.body?.theme_id || req.query.theme_id;
  if (themeId) return themeId;

  const deckId = req.body?.deck_id || req.query.deck_id;
  if (deckId) {
    const deck = db.prepare('SELECT theme_id FROM card_deck WHERE id = ?').get(deckId);
    return deck?.theme_id || null;
  }

  return null;
}

// 题库 - 主题
router.get('/themes', themeController.list);
router.get('/themes/hot', themeController.hotRank);
router.get('/themes/:id', themeController.detail);
router.post('/themes', themeController.create);
router.put('/themes/:id', themeController.update);
router.delete('/themes/:id', themeController.remove);
router.post('/themes/batch-offline', themeController.batchOffline);

// 题库 - 问题
router.get('/questions', questionController.list);
router.post('/questions', questionController.create);
router.put('/questions/:id', questionController.update);
router.delete('/questions/:id', questionController.remove);

// 牌组
router.get('/card-decks', cardDeckController.list);
router.get('/card-decks/:id', cardDeckController.detail);
router.post('/card-decks', cardDeckController.create);
router.put('/card-decks/:id', cardDeckController.update);
router.delete('/card-decks/:id', cardDeckController.remove);

// 解读库
router.get('/interpretations', interpretationController.list);
router.get('/interpretations/:id', interpretationController.detail);
router.post('/interpretations', interpretationController.create);
router.put('/interpretations/:id', interpretationController.update);
router.delete('/interpretations/:id', interpretationController.remove);
router.post('/interpretations/batch-offline', interpretationController.batchOffline);
router.post('/interpretations/match/score', interpretationController.matchByScore);
router.post('/interpretations/match/key', interpretationController.matchByKey);

// 抽签
router.post('/draw/cards', submitLimit(resolveDrawThemeId, 10), drawController.drawCards);
router.post('/draw/lot', submitLimit('theme_id', 10), drawController.drawLot);
router.post('/draw/answer', submitLimit('theme_id', 10), drawController.submitAnswer);

// 测算
router.post('/fortune/constellation', fortuneController.constellation);
router.get('/fortune/zodiac', fortuneController.zodiacDetail);
router.post('/fortune/eight-char', fortuneController.eightChar);

// 结果
router.get('/results/my/list', resultController.myList);
router.get('/results/:id', resultController.detail);
router.post('/results/collect', resultController.collect);
router.get('/collections', resultController.collectionList);

// 分享
router.get('/share/info', shareController.getShareInfo);
router.post('/share/generate-title', shareController.generateTitle);
router.post('/share/record', shareController.recordShare);

// 风控 & 运营
router.get('/admin/stats', adminController.getStats);
router.get('/admin/theme-stats', adminController.getThemeStats);
router.get('/admin/theme-trend', adminController.getThemeTrend);
router.get('/admin/funnel-stats', adminController.getFunnelStats);
router.get('/admin/warning-overview', adminController.getWarningOverview);

router.get('/admin/reviews', adminController.reviewList);
router.get('/admin/reviews/:id', adminController.reviewDetail);
router.put('/admin/reviews/batch-status', adminController.batchUpdateReviewStatus);

router.get('/admin/export/feedbacks', adminController.exportFeedbacks);
router.get('/admin/export/sensitive-words', adminController.exportSensitiveWords);
router.get('/admin/export/user-preferences', adminController.exportUserPreferences);
router.get('/admin/export/funnel-stats', adminController.exportFunnelStats);

router.get('/feedbacks', adminController.feedbackList);
router.get('/feedbacks/:id', adminController.feedbackDetail);
router.post('/feedbacks', adminController.submitFeedback);
router.put('/feedbacks/status', adminController.updateFeedbackStatus);
router.put('/feedbacks/batch-status', adminController.batchUpdateFeedbackStatus);

router.get('/banners', adminController.bannerList);
router.post('/banners', adminController.createBanner);
router.put('/banners/:id', adminController.updateBanner);
router.delete('/banners/:id', adminController.removeBanner);

router.get('/sensitive-words', adminController.sensitiveWordsList);
router.post('/sensitive-words', adminController.addSensitiveWord);
router.post('/sensitive-words/batch', adminController.batchAddSensitiveWords);
router.delete('/sensitive-words/:id', adminController.removeSensitiveWord);
router.post('/sensitive-check', adminController.checkContent);

router.get('/user/preferences', adminController.userPreferences);
router.get('/user/profile', adminController.userProfile);

module.exports = router;
