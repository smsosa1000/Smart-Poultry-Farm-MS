const express = require('express');
const session = require('express-session');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const os = require('os');
require('dotenv').config();

const pool = require('./config/db');
const app = express();
const PORT = process.env.PORT || 5000;

// ── Get Local IP Address ────────────────────────────────────────────────────
function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    let fallbackIP = null;
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Look for IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                // Prefer non-link-local addresses (not 169.254.x.x)
                if (!iface.address.startsWith('169.254.')) {
                    return iface.address; // Found a proper network IP
                }
                // Save link-local as fallback only if we have no other option
                if (!fallbackIP && iface.address.startsWith('192.168.') || iface.address.startsWith('10.')) {
                    fallbackIP = iface.address;
                }
            }
        }
    }
    
    // Return fallback or localhost
    return fallbackIP || 'localhost';
}

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files BEFORE helmet so CSS/JS are served without CSP headers
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        // Ensure correct MIME types for static assets
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// ── Helmet configuration — CSP disabled for local/network HTTP access ────────
app.use(helmet({
    strictTransportSecurity: false,
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

// Login rate limiting
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Much higher for development
    message: 'Too many login attempts, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req, res) => process.env.NODE_ENV !== 'production', // Disable in development
});
// Temporarily disabled for development
// app.use('/login', loginLimiter);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
    secret: process.env.SESSION_SECRET || 'your_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // Use secure in production
        httpOnly: true,
        sameSite: 'strict'
    }
}));

// Make session + flash available to all EJS templates
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.flash = req.session.flash || null;
    const localIP = getLocalIPAddress();
    res.locals.networkURL = `http://${localIP}:${PORT}`;
    res.locals.localhostURL = `http://localhost:${PORT}`;
    res.locals.deviceIP = localIP;
    req.session.flash = null;
    next();
});

// ── Load route modules ──────────────────────────────────────────────────────
const authRoutes       = require('./routes/auth');
const dashboardRoutes  = require('./routes/dashboard');
const cycleRoutes      = require('./routes/cycles');
const logRoutes        = require('./routes/logs');
const expenseRoutes    = require('./routes/expenses');
const saleRoutes       = require('./routes/sales');
const operationRoutes  = require('./routes/operations');
const reportRoutes     = require('./routes/reports');
const managementRoutes = require('./routes/management');
const aiRoutes         = require('./routes/ai-assistant');
const supplierRoutes   = require('./routes/suppliers');
const poRoutes         = require('./routes/purchase-orders');
const customerRoutes   = require('./routes/customers');

const soRoutes         = require('./routes/sales-orders');
const hrRoutes         = require('./routes/hr');
const trainingRoutes   = require('./routes/training');
const qcRoutes         = require('./routes/qc');
const auditRoutes      = require('./routes/audit');
const legacyRoutes     = require('./routes/legacy');

app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/', cycleRoutes);
app.use('/', logRoutes);
app.use('/', expenseRoutes);
app.use('/', saleRoutes);
app.use('/', operationRoutes);
app.use('/', reportRoutes);
app.use('/', managementRoutes);
app.use('/', aiRoutes);
app.use('/', supplierRoutes);
app.use('/', poRoutes);
app.use('/', customerRoutes);

app.use('/', soRoutes);
app.use('/', hrRoutes);
app.use('/', trainingRoutes);
app.use('/', qcRoutes);
app.use('/', auditRoutes);
app.use('/', legacyRoutes);

// ── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).render('error', { title: 'Page Not Found', message: 'The page you are looking for does not exist.', code: 404 });
});

// ── Global Error Handler ────────────────────────────────────────────────────
const MYSQL_ERRORS = {
    1062: 'This record already exists (duplicate entry).',
    1451: 'Cannot delete — other records depend on this item.',
    1452: 'Invalid reference — related record does not exist.',
    1406: 'Input value too long for this field.',
};

app.use((err, req, res, next) => {
    console.error('[ERROR]', err);

    // MySQL errors
    if (err.sqlState === '45000') {
        // Trigger SIGNAL
        return res.status(400).render('error', {
            title: 'Validation Error', code: 400,
            message: err.sqlMessage || err.message
        });
    }

    if (MYSQL_ERRORS[err.errno]) {
        return res.status(400).render('error', {
            title: 'Database Error', code: 400,
            message: MYSQL_ERRORS[err.errno]
        });
    }

    // Auth errors
    if (err.status === 401) return res.redirect('/login');
    if (err.status === 403) return res.status(403).render('error', {
        title: 'Access Denied', code: 403, message: err.message
    });

    // Generic 500
    res.status(500).render('error', {
        title: 'Server Error', code: 500,
        message: process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred. Please try again.'
            : err.message
    });
});

// ── Start ───────────────────────────────────────────────────────────────────
const localIP = getLocalIPAddress();
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🐔 Smart Poultry Farm running on:`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Network: http://${localIP}:${PORT}`);
    console.log(`   📱 Share network URL with other devices on your network`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ ERROR: Port ${PORT} is already in use. Please close the other process or use a different port.`);
    } else {
        console.error('❌ SERVER ERROR:', err);
    }
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ UNHANDLED REJECTION:', reason);
});
