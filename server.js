const express = require('express');
const cors = require('cors');
const path = require('path');

const routes = require('./src/routes');
const anonymousId = require('./src/middleware/anonymous');
const apiStats = require('./src/middleware/apiStats');
const { rateLimit } = require('./src/middleware/rateLimit');
const { success } = require('./src/utils/response');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', apiStats);
app.use('/api', anonymousId);
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 100 }));

app.get('/api/health', (req, res) => {
  res.json(success({
    status: 'ok',
    timestamp: Date.now(),
    service: 'divination-platform',
    version: '1.0.0',
  }));
});

app.use('/api', routes);

app.use((req, res) => {
  res.status(404).json({
    code: 404,
    message: '接口不存在',
    path: req.path,
    timestamp: Date.now(),
  });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    code: 500,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    timestamp: Date.now(),
  });
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  娱乐占卜平台后端服务启动成功!`);
  console.log(`  服务地址: http://localhost:${PORT}`);
  console.log(`  健康检查: http://localhost:${PORT}/api/health`);
  console.log(`========================================\n`);
});

module.exports = app;
