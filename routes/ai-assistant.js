const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { processQuery, SUGGESTIONS } = require('../ai/query-engine');

router.get('/ai-assistant', requireAuth, (req, res) => {
    res.render('ai-chat', { result: null, suggestions: SUGGESTIONS, query: '' });
});

router.post('/ai-assistant', requireAuth, async (req, res) => {
    const { query } = req.body;
    const result = await processQuery(query, req.session.user.user_role, req.session.user.username);
    res.render('ai-chat', { result, suggestions: SUGGESTIONS, query });
});

// API endpoint for AJAX
router.post('/api/ai-query', requireAuth, async (req, res) => {
    const { query } = req.body;
    const result = await processQuery(query, req.session.user.user_role, req.session.user.username);
    res.json(result);
});

module.exports = router;
