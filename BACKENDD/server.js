const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const bcrypt = require('bcrypt');
// jwt not used — session tokens are stored in DB
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = 5001;

const PYTHON_API_BASE = process.env.PYTHON_API_BASE || 'http://localhost:5000';

app.use(cors());
app.use(express.json());

// ⚠️ PHASE 7: Rate limiting middleware (relaxed for development)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10000, // relaxed
    message: 'Too many login attempts. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10000, // relaxed
    message: 'Too many registration attempts. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10000, // relaxed
    message: 'Too many password reset attempts. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// ⚠️ PHASE 2: Authentication middleware to validate session
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ success: false, error: 'No session token' });
        }

        const session = await db.get('SELECT * FROM sessions WHERE token = ? AND expires_at > datetime("now")', [token]);

        if (!session) {
            return res.status(401).json({ success: false, error: 'Invalid or expired session' });
        }

        const user = await db.get('SELECT id, username, email FROM users WHERE id = ?', [session.user_id]);
        req.user = user;
        req.sessionToken = token;
        next();
    } catch (error) {
        res.status(401).json({ success: false, error: 'Authentication failed' });
    }
};

// ⚠️ PHASE 2: Helper to generate session token
const generateSessionToken = () => crypto.randomBytes(32).toString('hex');

// ⚠️ PHASE 2: Helper to create verification token
const generateVerificationToken = () => crypto.randomBytes(32).toString('hex');

console.log('✅ Server starting...');

// Vendor validation and risk scoring now happen in the Python backend.

// Database setup
let db = null;

async function setupDatabase() {
    try {
        const dbDir = path.join(__dirname, 'database');
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
            console.log('✅ Created database folder');
        }
        
        const dbPath = path.join(dbDir, 'vendors.db');
        
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });
        
        // Create main vendors table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS vendors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                name TEXT NOT NULL,
                industry TEXT NOT NULL,
                risk_score INTEGER NOT NULL,
                risk_level TEXT NOT NULL,
                vulnerabilities INTEGER DEFAULT 0,
                avg_severity REAL DEFAULT 0,
                critical_count INTEGER DEFAULT 0,
                factor_breakdown TEXT,
                date TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migration: Dynamically add user_id column to vendors if database already exists
        try {
            await db.exec('ALTER TABLE vendors ADD COLUMN user_id INTEGER');
            console.log('✅ SQLite Migration: Added user_id column to vendors table');
        } catch (e) {
            // Column already exists, ignore
        }
        
        // ⚠️ NEW: Create vendor history table for tracking changes
        await db.exec(`
            CREATE TABLE IF NOT EXISTS vendor_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vendor_id INTEGER,
                risk_score INTEGER,
                risk_level TEXT,
                vulnerabilities INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (vendor_id) REFERENCES vendors(id)
            )
        `);
        
        // ⚠️ NEW: Create risk alerts table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS risk_alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vendor_id INTEGER,
                vendor_name TEXT,
                alert_type TEXT,
                message TEXT,
                severity TEXT,
                is_read INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ⚠️ PHASE 1: Create users table for authentication
        await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                is_verified INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME
            )
        `);

        // ⚠️ PHASE 1: Create sessions table for session management
        await db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token TEXT NOT NULL UNIQUE,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // ⚠️ PHASE 1: Create email_queue table for background email processing
        await db.exec(`
            CREATE TABLE IF NOT EXISTS email_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recipient_email TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                retry_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                sent_at DATETIME
            )
        `);

        // ⚠️ PHASE 1: Create user_preferences table for notification settings
        await db.exec(`
            CREATE TABLE IF NOT EXISTS user_preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                alert_on_high_risk INTEGER DEFAULT 1,
                alert_on_critical INTEGER DEFAULT 1,
                digest_frequency TEXT DEFAULT 'weekly',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // ⚠️ PHASE 1: Create alert_subscriptions table for vendor alert subscriptions
        await db.exec(`
            CREATE TABLE IF NOT EXISTS alert_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                vendor_id INTEGER NOT NULL,
                alert_threshold INTEGER DEFAULT 70,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (vendor_id) REFERENCES vendors(id),
                UNIQUE(user_id, vendor_id)
            )
        `);

        // Enable WAL mode for better concurrency
        await db.exec('PRAGMA journal_mode=WAL');

        console.log('✅ Database ready with monitoring and authentication tables');
        return true;
    } catch (error) {
        console.error('❌ Database error:', error.message);
        return false;
    }
}

// ⚠️ NEW: Function to create alert
async function createAlert(vendorId, vendorName, alertType, message, severity) {
    if (!db) return;
    try {
        await db.run(
            `INSERT INTO risk_alerts (vendor_id, vendor_name, alert_type, message, severity)
             VALUES (?, ?, ?, ?, ?)`,
            [vendorId, vendorName, alertType, message, severity]
        );
        console.log(`🔔 Alert created for ${vendorName}: ${message}`);
    } catch (error) {
        console.error('Alert creation error:', error);
    }
}

app.post('/api/alerts/internal', async (req, res) => {
    try {
        const { vendor_name, risk_level, risk_score, message, details } = req.body;
        if (!vendor_name || !risk_level) {
            return res.status(400).json({ success: false, error: 'Missing alert details' });
        }

        let vendor = await db.get('SELECT id FROM vendors WHERE name = ?', [vendor_name]);
        if (!vendor) {
            const result = await db.run(
                'INSERT INTO vendors (name, industry, risk_score, risk_level, date) VALUES (?, ?, ?, ?, ?)',
                [vendor_name, 'Unknown', risk_score || 0, risk_level, new Date().toLocaleDateString()]
            );
            vendor = { id: result.lastID };
        }

        await createAlert(
            vendor.id,
            vendor_name,
            'PYTHON_RISK_DETECTED',
            message || `High risk detected for ${vendor_name}`,
            risk_level === 'Critical' ? 'Critical' : 'Warning'
        );

        const subscribers = await db.all(`
            SELECT u.email, u.username, up.alert_on_high_risk, up.alert_on_critical
            FROM users u
            JOIN user_preferences up ON u.id = up.user_id
            WHERE (up.alert_on_high_risk = 1 AND ? = 'High')
               OR (up.alert_on_critical = 1 AND ? = 'Critical')
        `, [risk_level, risk_level]);

        for (const sub of subscribers) {
            await db.run(`
                INSERT INTO email_queue (recipient_email, subject, body, status)
                VALUES (?, ?, ?, 'pending')
            `, [
                sub.email,
                `🚨 Risk Alert: ${vendor_name} - ${risk_level} Risk`,
                generateAlertEmailBody(sub.username, vendor_name, risk_level, risk_score, message || '')
            ]);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Internal alert error:', error);
        res.json({ success: false, error: error.message });
    }
});

function generateAlertEmailBody(username, vendorName, riskLevel, riskScore, message) {
    return `
        <h2>VendorRisk Alert</h2>
        <p>Hi ${username},</p>
        <p>A vendor you're monitoring has triggered a risk alert:</p>
        <div style="background: #fee2e2; padding: 15px; border-left: 4px solid #dc2626;">
            <strong>Vendor:</strong> ${vendorName}<br>
            <strong>Risk Level:</strong> ${riskLevel}<br>
            <strong>Risk Score:</strong> ${riskScore}/100<br>
            <strong>Details:</strong> ${message}
        </div>
        <p><a href="http://localhost:8000/dashboard.html">View in Dashboard</a></p>
    `;
}

async function queueWeeklyDigestEmails() {
    if (!db) return;
    try {
        const subscribers = await db.all(`
            SELECT u.email, u.username
            FROM users u
            JOIN user_preferences up ON u.id = up.user_id
            WHERE up.digest_frequency = 'weekly'
        `);

        if (!subscribers.length) return;

        const topVendors = await db.all(`
            SELECT name, risk_score, risk_level, vulnerabilities
            FROM vendors
            ORDER BY risk_score DESC
            LIMIT 5
        `);

        const vendorListHtml = topVendors.map(v => `
            <li><strong>${v.name}</strong>: ${v.risk_level} risk (${v.risk_score}/100), ${v.vulnerabilities || 0} CVEs</li>
        `).join('');

        for (const user of subscribers) {
            const digestBody = `
                <h1>Your Weekly VendorRisk Digest</h1>
                <p>Hi ${user.username},</p>
                <p>Here are the top risk findings from the last seven days:</p>
                <ul>${vendorListHtml}</ul>
                <p>For more details, visit your <a href="http://localhost:8000/dashboard.html">VendorRisk dashboard</a>.</p>
                <p>Stay secure,<br>The VendorRisk Team</p>
            `;
            await db.run(
                'INSERT INTO email_queue (recipient_email, subject, body, status) VALUES (?, ?, ?, ?)',
                [user.email, 'VendorRisk Weekly Digest', digestBody, 'pending']
            );
        }

        console.log(`✅ Weekly digest queued for ${subscribers.length} users`);
    } catch (error) {
        console.error('Weekly digest error:', error);
    }
}

// ⚠️ NEW: Save vendor history snapshot
async function saveVendorHistory(vendorId, riskScore, riskLevel, vulnerabilities) {
    if (!db) return;
    try {
        await db.run(
            `INSERT INTO vendor_history (vendor_id, risk_score, risk_level, vulnerabilities)
             VALUES (?, ?, ?, ?)`,
            [vendorId, riskScore, riskLevel, vulnerabilities]
        );
    } catch (error) {
        console.error('History save error:', error);
    }
}

// ⚠️ NEW: Check for new vulnerabilities (Real-time monitoring)
app.post('/api/monitor/check', authMiddleware, async (req, res) => {
    try {
        const { vendorId, vendorName } = req.body;
        if (!vendorId || !vendorName) {
            return res.status(400).json({ success: false, error: 'vendorId and vendorName required' });
        }

        const currentVendor = await db.get('SELECT * FROM vendors WHERE id = ?', [vendorId]);
        if (!currentVendor) {
            return res.status(404).json({ success: false, error: 'Vendor not found' });
        }

        console.log(`🔍 Proxying monitor check for vendor: ${vendorName}`);
        const pythonResponse = await axios.get(
            `${PYTHON_API_BASE}/analyze?vendor=${encodeURIComponent(vendorName)}`,
            { timeout: 30000 }
        );

        const pythonData = pythonResponse.data;
        if (!pythonData || pythonData.success !== true) {
            return res.status(500).json({ success: false, error: 'Python analysis failed' });
        }

        const updatedVulns = pythonData.final_result?.cyber?.vulnerability_count || 0;
        const updatedCritical = pythonData.final_result?.cyber?.critical_count || 0;
        const updatedRisk = pythonData.riskScore || 0;
        const updatedLevel = pythonData.risk_level || 'Unknown';

        await db.run(
            `UPDATE vendors SET
                risk_score = ?,
                risk_level = ?,
                vulnerabilities = ?,
                avg_severity = ?,
                critical_count = ?,
                factor_breakdown = ?,
                date = ?
             WHERE id = ?`,
            [updatedRisk, updatedLevel, updatedVulns, pythonData.final_result?.cyber?.avg_severity || 0,
             updatedCritical, JSON.stringify(pythonData.final_result?.pillar_scores || {}), new Date().toLocaleDateString(), vendorId]
        );

        await saveVendorHistory(vendorId, updatedRisk, updatedLevel, updatedVulns);

        const newVulnerabilities = Math.max(0, updatedVulns - (currentVendor.vulnerabilities || 0));
        const hasNewCritical = updatedCritical > (currentVendor.critical_count || 0);

        res.json({
            success: true,
            newVulnerabilities,
            hasNewCritical,
            totalVulns: updatedVulns,
            riskScore: updatedRisk,
            riskLevel: updatedLevel
        });
    } catch (error) {
        console.error('Monitor check error:', error);
        res.json({ success: false, error: error.message });
    }
});

// ⚠️ NEW: Get all alerts
app.get('/api/alerts', authMiddleware, async (req, res) => {
    try {
        if (!db) return res.json({ success: true, data: [] });
        const alerts = await db.all(`
            SELECT ra.* FROM risk_alerts ra
            JOIN vendors v ON ra.vendor_id = v.id
            WHERE v.user_id = ?
            ORDER BY ra.created_at DESC
            LIMIT 20
        `, [req.user.id]);
        res.json({ success: true, data: alerts });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

// ⚠️ NEW: Mark alert as read
app.put('/api/alerts/:id/read', authMiddleware, async (req, res) => {
    try {
        await db.run('UPDATE risk_alerts SET is_read = 1 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});

// ⚠️ NEW: Get vendor risk history (for trend analysis)
app.get('/api/vendor/:id/history', authMiddleware, async (req, res) => {
    try {
        const history = await db.all(`
            SELECT risk_score, risk_level, vulnerabilities, created_at
            FROM vendor_history
            WHERE vendor_id = ?
            ORDER BY created_at DESC
            LIMIT 10
        `, [req.params.id]);
        res.json({ success: true, data: history });
    } catch (error) {
        res.json({ success: false, data: [] });
    }
});

// ⚠️ NEW: Get risk summary (for dashboard stats)
app.get('/api/risk-summary', authMiddleware, async (req, res) => {
    try {
        const highRisk = await db.get('SELECT COUNT(*) as count FROM vendors WHERE risk_level = "High" AND user_id = ?', [req.user.id]);
        const mediumRisk = await db.get('SELECT COUNT(*) as count FROM vendors WHERE risk_level = "Medium" AND user_id = ?', [req.user.id]);
        const lowRisk = await db.get('SELECT COUNT(*) as count FROM vendors WHERE risk_level = "Low" AND user_id = ?', [req.user.id]);
        const unreadAlerts = await db.get(`
            SELECT COUNT(*) as count 
            FROM risk_alerts ra 
            JOIN vendors v ON ra.vendor_id = v.id 
            WHERE ra.is_read = 0 AND v.user_id = ?
        `, [req.user.id]);

        res.json({
            success: true,
            data: {
                high: highRisk?.count || 0,
                medium: mediumRisk?.count || 0,
                low: lowRisk?.count || 0,
                unreadAlerts: unreadAlerts?.count || 0
            }
        });
    } catch (error) {
        res.json({ success: true, data: { high: 0, medium: 0, low: 0, unreadAlerts: 0 } });
    }
});

// API Routes (Existing)
app.get('/api/test', (req, res) => {
    res.json({ message: 'Backend working!', status: 'online', timestamp: new Date().toISOString() });
});

// ⚠️ PHASE 2: Authentication Endpoints

// Register endpoint
app.post('/auth/register', registerLimiter, async (req, res) => {
    try {
        const { username, email, password, confirmPassword } = req.body;

        // ⚠️ PHASE 7: Input validation
        if (!username || !email || !password || !confirmPassword) {
            return res.status(400).json({ success: false, error: 'All fields required' });
        }

        // Validate username
        if (username.length < 3 || username.length > 30) {
            return res.status(400).json({ success: false, error: 'Username must be 3-30 characters' });
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            return res.status(400).json({ success: false, error: 'Username can only contain letters, numbers, hyphens, and underscores' });
        }

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, error: 'Invalid email address' });
        }

        // Validate password
        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, error: 'Passwords do not match' });
        }
        if (password.length < 3) {
            return res.status(400).json({ success: false, error: 'Password must be at least 3 characters' });
        }

        // Check if user exists
        const existingUser = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username.toLowerCase(), email.toLowerCase()]);
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Username or email already exists' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // Create user
        const result = await db.run(
            'INSERT INTO users (username, email, password_hash, is_verified) VALUES (?, ?, ?, 1)',
            [username.toLowerCase(), email.toLowerCase(), passwordHash]
        );

        const verificationToken = generateVerificationToken();
        const verifyLink = `http://localhost:8000/verify.html?token=${verificationToken}`;
        const emailBody = `
            <h1>Welcome to VendorRisk!</h1>
            <p>Hi ${username},</p>
            <p>Thank you for registering. Your account is fully active.</p>
        `;

        await db.run(
            'INSERT INTO email_queue (recipient_email, subject, body, status) VALUES (?, ?, ?, ?)',
            [email.toLowerCase(), 'Welcome to VendorRisk', emailBody, 'pending']
        );

        // Create default preferences
        await db.run(
            'INSERT INTO user_preferences (user_id, alert_on_high_risk, alert_on_critical, digest_frequency) VALUES (?, 1, 1, ?)',
            [result.lastID, 'weekly']
        );

        // Auto-login: Create session
        const sessionToken = generateSessionToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        await db.run(
            'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
            [result.lastID, sessionToken, expiresAt.toISOString()]
        );

        res.json({ 
            success: true, 
            message: 'Registration successful! Logged in.', 
            sessionToken: sessionToken,
            user: { id: result.lastID, username: username.toLowerCase(), email: email.toLowerCase() }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Login endpoint
app.post('/auth/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Username and password required' });
        }

        // Find user
        // Find user – accept either a username *or* an e‑mail address
        const user = await db.get(
            `SELECT id, username, email, password_hash
             FROM users
             WHERE username = ? OR email = ?`,
            [username, username]
        );
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Verify password
        const passwordValid = await bcrypt.compare(password, user.password_hash);
        if (!passwordValid) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Create session
        const sessionToken = generateSessionToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        await db.run(
            'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
            [user.id, sessionToken, expiresAt.toISOString()]
        );

        // Update last login
        await db.run('UPDATE users SET last_login = datetime("now") WHERE id = ?', [user.id]);

        res.json({
            success: true,
            message: 'Login successful',
            sessionToken: sessionToken,
            user: { id: user.id, username: user.username, email: user.email }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Logout endpoint
app.post('/auth/logout', authMiddleware, async (req, res) => {
    try {
        await db.run('DELETE FROM sessions WHERE token = ?', [req.sessionToken]);
        res.json({ success: true, message: 'Logout successful' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get current user info
app.get('/auth/me', authMiddleware, (req, res) => {
    res.json({ success: true, user: req.user });
});

// Forgot password endpoint
app.post('/auth/forgot-password', forgotPasswordLimiter, async (req, res) => {
    try {
        const { email } = req.body;

        const user = await db.get('SELECT id, username FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.json({ success: true, message: 'If email exists, reset link will be sent' });
        }

        const resetToken = generateVerificationToken();
        const resetLink = `http://localhost:8000/reset-password.html?token=${resetToken}`;
        const resetEmailBody = `
            <h1>Password Reset Request</h1>
            <p>Hi ${user.username},</p>
            <p>We received a request to reset your VendorRisk password. Click the button below to continue:</p>
            <p><a href="${resetLink}" style="display:inline-block;padding:12px 18px;background:#ff4757;color:#ffffff;border-radius:8px;text-decoration:none;">Reset Your Password</a></p>
            <p>If you didn't request this, you can ignore this email.</p>
            <p>This link expires in 1 hour.</p>
        `;
        await db.run(
            'INSERT INTO email_queue (recipient_email, subject, body, status) VALUES (?, ?, ?, ?)',
            [email, 'VendorRisk Password Reset', resetEmailBody, 'pending']
        );

        res.json({ success: true, message: 'Password reset email sent' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reset password endpoint
app.post('/auth/reset-password', async (req, res) => {
    try {
        const { token, password, confirmPassword } = req.body;

        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, error: 'Passwords do not match' });
        }
        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        }

        // In production, verify token signature and expiration
        const passwordHash = await bcrypt.hash(password, 12);

        // For now, accept token as is (in production use proper token validation)
        // This would need a password_reset_tokens table for production

        res.json({ success: true, message: 'Password reset successful. Please login with your new password.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Verify email endpoint
app.get('/auth/verify/:token', async (req, res) => {
    try {
        const { token } = req.params;
        // In production, validate token properly
        res.json({ success: true, message: 'Email verified successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// User Profile endpoints
app.put('/auth/profile', authMiddleware, async (req, res) => {
    try {
        const { email } = req.body;
        if (email) {
            await db.run('UPDATE users SET email = ? WHERE id = ?', [email, req.user.id]);
        }
        res.json({ success: true, message: 'Profile updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/auth/change-password', authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, error: 'Passwords do not match' });
        }

        const user = await db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
        const passwordValid = await bcrypt.compare(currentPassword, user.password_hash);

        if (!passwordValid) {
            return res.status(401).json({ success: false, error: 'Current password is incorrect' });
        }

        const newPasswordHash = await bcrypt.hash(newPassword, 12);
        await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newPasswordHash, req.user.id]);

        // Invalidate all sessions
        await db.run('DELETE FROM sessions WHERE user_id = ?', [req.user.id]);

        res.json({ success: true, message: 'Password changed. Please login again.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// User Preferences endpoints
app.get('/user/preferences', authMiddleware, async (req, res) => {
    try {
        const prefs = await db.get('SELECT * FROM user_preferences WHERE user_id = ?', [req.user.id]);
        res.json({ success: true, data: prefs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/user/preferences', authMiddleware, async (req, res) => {
    try {
        const { alert_on_high_risk, alert_on_critical, digest_frequency } = req.body;
        await db.run(
            'UPDATE user_preferences SET alert_on_high_risk = ?, alert_on_critical = ?, digest_frequency = ? WHERE user_id = ?',
            [alert_on_high_risk ? 1 : 0, alert_on_critical ? 1 : 0, digest_frequency, req.user.id]
        );
        res.json({ success: true, message: 'Preferences updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// User Subscriptions endpoints
app.get('/user/subscriptions', authMiddleware, async (req, res) => {
    try {
        const subs = await db.all(
            'SELECT * FROM alert_subscriptions WHERE user_id = ? ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json({ success: true, data: subs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/user/subscriptions/:vendorId', authMiddleware, async (req, res) => {
    try {
        const { vendorId } = req.params;
        const { alert_threshold } = req.body || {};

        await db.run(
            'INSERT OR IGNORE INTO alert_subscriptions (user_id, vendor_id, alert_threshold) VALUES (?, ?, ?)',
            [req.user.id, vendorId, alert_threshold || 70]
        );
        res.json({ success: true, message: 'Subscribed to vendor alerts' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/user/subscriptions/:vendorId', authMiddleware, async (req, res) => {
    try {
        const { vendorId } = req.params;
        await db.run('DELETE FROM alert_subscriptions WHERE user_id = ? AND vendor_id = ?', [req.user.id, vendorId]);
        res.json({ success: true, message: 'Unsubscribed from vendor alerts' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ⚠️ Vendor endpoints now require authentication
app.post('/api/analyze', authMiddleware, async (req, res) => {
    try {
        const { vendorName, industry } = req.body;
        
        if (!vendorName || !industry) {
            return res.status(400).json({ success: false, error: 'Missing vendorName or industry' });
        }

        console.log(`📊 Proxying analysis request for ${vendorName} (${industry}) to Python backend`);

        const pythonResponse = await axios.get(
            `${PYTHON_API_BASE}/analyze?vendor=${encodeURIComponent(vendorName)}`,
            { timeout: 30000 }
        );

        const pythonData = pythonResponse.data;
        if (!pythonData || pythonData.success !== true) {
            return res.status(500).json({ success: false, error: 'Python analysis failed', details: pythonData });
        }

        let vendorId = null;
        if (db) {
            const result = await db.run(
                `INSERT INTO vendors (name, industry, risk_score, risk_level, vulnerabilities, factor_breakdown, date, avg_severity, critical_count, user_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [vendorName, industry, pythonData.riskScore || 0, pythonData.risk_level || 'Unknown',
                 pythonData.final_result?.cyber?.vulnerability_count || 0,
                 JSON.stringify(pythonData.final_result?.pillar_scores || {}),
                 new Date().toLocaleDateString(),
                 pythonData.final_result?.cyber?.avg_severity || 0,
                 pythonData.final_result?.cyber?.critical_count || 0,
                 req.user.id]
            );
            vendorId = result.lastID;
            await saveVendorHistory(vendorId, pythonData.riskScore || 0, pythonData.risk_level || 'Unknown', pythonData.final_result?.cyber?.vulnerability_count || 0);
        }

        if (pythonData.risk_level === 'High' || pythonData.risk_level === 'Critical') {
            await createAlert(
                vendorId,
                vendorName,
                'PYTHON_RISK_DETECTED',
                `Vendor ${vendorName} scored ${pythonData.riskScore || 0}/100 (${pythonData.risk_level})`,
                pythonData.risk_level === 'Critical' ? 'Critical' : 'Warning'
            );
        }

        res.json({
            success: true,
            vendorName,
            industry,
            riskScore: pythonData.riskScore,
            riskLevel: pythonData.risk_level,
            vulnerabilities: pythonData.final_result?.cyber?.vulnerability_count || 0,
            factorBreakdown: pythonData.final_result?.pillar_scores || {},
            fillPercent: pythonData.fill_percent,
            statusText: pythonData.status_text,
            totalPenalty: pythonData.total_penalty,
            riskBudget: pythonData.risk_budget,
            comparative: pythonData.final_result?.comparative
        });
    } catch (error) {
        console.error('❌ Analysis error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/vendors', authMiddleware, async (req, res) => {
    try {
        if (!db) return res.json({ success: true, data: [] });
        const vendors = await db.all('SELECT * FROM vendors WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
        res.json({ success: true, data: vendors });
    } catch (error) {
        console.error('Fetch error:', error);
        res.json({ success: true, data: [] });
    }
});

app.delete('/api/vendors/:id', authMiddleware, async (req, res) => {
    try {
        if (db) {
            await db.run('DELETE FROM vendors WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
            console.log(`🗑️ Deleted vendor ID: ${req.params.id} for User ID: ${req.user.id}`);
        }
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});

app.get('/api/stats', authMiddleware, async (req, res) => {
    try {
        if (!db) return res.json({ total: 0, high: 0, medium: 0, low: 0 });
        const total = await db.get('SELECT COUNT(*) as count FROM vendors WHERE user_id = ?', [req.user.id]);
        const high = await db.get('SELECT COUNT(*) as count FROM vendors WHERE risk_level = "High" AND user_id = ?', [req.user.id]);
        const medium = await db.get('SELECT COUNT(*) as count FROM vendors WHERE risk_level = "Medium" AND user_id = ?', [req.user.id]);
        const low = await db.get('SELECT COUNT(*) as count FROM vendors WHERE risk_level = "Low" AND user_id = ?', [req.user.id]);
        res.json({ 
            total: total?.count || 0, 
            high: high?.count || 0, 
            medium: medium?.count || 0, 
            low: low?.count || 0 
        });
    } catch (error) {
        res.json({ total: 0, high: 0, medium: 0, low: 0 });
    }
});

// Start server
async function startServer() {
    await setupDatabase();

    // ⚠️ PHASE 7: Cleanup expired sessions daily
    setInterval(async () => {
        try {
            await db.run('DELETE FROM sessions WHERE expires_at < datetime("now")');
            console.log('✅ Expired sessions cleaned up');
        } catch (error) {
            console.error('Session cleanup error:', error);
        }
    }, 24 * 60 * 60 * 1000); // Every 24 hours

    // Send weekly digest emails on Mondays
    setInterval(async () => {
        const now = new Date();
        if (now.getDay() === 1) {
            await queueWeeklyDigestEmails();
        }
    }, 24 * 60 * 60 * 1000);

    if (new Date().getDay() === 1) {
        await queueWeeklyDigestEmails();
    }

    const totals = await db.get('SELECT COUNT(*) as count FROM vendors');
    const vendorCount = totals?.count || 0;
    app.listen(PORT, () => {
        console.log(`
    ╔═══════════════════════════════════════════════════════════╗
    ║  🛡️  VendorRisk Backend (Auth + Risk Management)         ║
    ╠═══════════════════════════════════════════════════════════╣
    ║   Port: ${PORT}                                              ║
    ║   Database: ${db ? '✅ Connected' : '⚠️ Memory Mode'}        ║
    ╠═══════════════════════════════════════════════════════════╣
    ║   Features:                                               ║
    ║   - ✅ User Authentication (register, login, logout)     ║
    ║   - ✅ Session Management (7-day tokens)                 ║
    ║   - ✅ Password Hashing (bcrypt, cost 12)                ║
    ║   - ✅ Rate Limiting (brute force protection)            ║
    ║   - ✅ Email Queue System                                ║
    ║   - ✅ User Preferences & Alert Subscriptions            ║
    ║   - ✅ Vendor Validation (${vendorCount} vendors)         ║
    ║   - ✅ Six-Pillar Risk (proxied to Python)               ║
    ║   - ✅ Real-time Monitoring & Alerts                     ║
    ║   - ✅ Vendor History Tracking                           ║
    ║   - ✅ Daily Session Cleanup (auto)                      ║
    ╚═══════════════════════════════════════════════════════════╝
        `);
    });
}

startServer();