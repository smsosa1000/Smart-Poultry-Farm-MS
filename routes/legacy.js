const router = require('express').Router();

// Simple redirects for legacy or mistyped routes to avoid 404s
router.get(['/quality-control', '/qualitycontrol', '/quality_control'], (req, res) => res.redirect('/qc'));
router.get(['/audit-logs', '/auditlogs', '/audit-log'], (req, res) => res.redirect('/audit'));
router.get(['/inventory', '/stock', '/stocks'], (req, res) => res.redirect('/management'));
router.get('/hr/payroll', (req, res) => res.redirect('/hr#payroll'));
router.get('/trainingng', (req, res) => res.redirect('/training'));

module.exports = router;
