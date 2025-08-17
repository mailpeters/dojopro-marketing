const express = require('express');
const mysql = require('mysql2');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3001;

// Database connection
//const db = mysql.createConnection({
//    host: process.env.DB_HOST,
//    user: process.env.DB_USER,
//    password: process.env.DB_PASSWORD,
//    database: process.env.DB_NAME
//});


const db = mysql.createConnection({
    host: 'localhost',
    user: 'dojoapp',
    password: 'djppass',
    database: 'dojopro'
});


// Test database connection
db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err);
    } else {
        console.log('Connected to MariaDB database');
    }
});

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Home page with live stats
app.get('/', async (req, res) => {
    try {
        // Get club statistics
        const clubStats = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    COUNT(*) as total_clubs,
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_clubs
                FROM clubs
            `, (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        // Get member statistics
        const memberStats = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    COUNT(*) as total_members,
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_members
                FROM members
            `, (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        // Get sample clubs for showcase
        const sampleClubs = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    c.club_name,
                    c.description,
                    c.subdomain,
                    COUNT(m.member_id) as member_count,
                    l.city,
                    l.state
                FROM clubs c
                LEFT JOIN members m ON c.club_id = m.club_id AND m.status = 'active'
                LEFT JOIN locations l ON c.club_id = l.club_id AND l.is_primary_location = 1
                WHERE c.status = 'active'
                GROUP BY c.club_id, c.club_name, c.description, c.subdomain, l.city, l.state
                LIMIT 3
            `, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        res.render('index', { 
            title: 'DojoPro - Martial Arts Club Management',
            ip: '3.227.191.44',
            clubStats,
            memberStats,
            sampleClubs
        });
    } catch (error) {
        console.error('Database query error:', error);
        res.render('index', { 
            title: 'DojoPro - Martial Arts Club Management',
            ip: '3.227.191.44',
            clubStats: { total_clubs: 0, active_clubs: 0 },
            memberStats: { total_members: 0, active_members: 0 },
            sampleClubs: []
        });
    }
});

// Get Started page (club registration form)
app.get('/get-started', (req, res) => {
    res.render('get-started', { 
        title: 'Get Started - DojoPro',
        ip: '3.227.191.44'
    });
});

// Health check route
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'marketing-site',
        database: db.state === 'authenticated' ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// API route for club stats (for dynamic updates)
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    (SELECT COUNT(*) FROM clubs WHERE status = 'active') as total_clubs,
                    (SELECT COUNT(*) FROM members WHERE status = 'active') as total_members,
                    (SELECT COUNT(*) FROM locations) as total_locations
            `, (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });
        
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});



// inserted
// Add this route to your app.js file, after the existing routes

// Add this route to your app.js file, after the existing routes

// Club signup API route
app.post('/api/club-signup', async (req, res) => {
    try {
        const {
            first_name,
            last_name,
            email,
            phone,
            club_name,
            martial_art,
            city,
            state,
            current_members,
            description
        } = req.body;

        // Validation
        if (!first_name || !last_name || !email || !club_name || !city || !state) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Check if email already exists in users table
        const existingUser = await new Promise((resolve, reject) => {
            db.query('SELECT user_id FROM users WHERE email = ?', [email], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        if (existingUser.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'A user with this email already exists'
            });
        }

        // Generate subdomain from club name
        const subdomain = club_name.toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 30);

        // Check if subdomain already exists
        const existingSubdomain = await new Promise((resolve, reject) => {
            db.query('SELECT club_id FROM clubs WHERE subdomain = ?', [subdomain], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // If subdomain exists, append a number
        let finalSubdomain = subdomain;
        if (existingSubdomain.length > 0) {
            let counter = 1;
            let unique = false;
            while (!unique && counter < 100) {
                const testSubdomain = `${subdomain}-${counter}`;
                const test = await new Promise((resolve, reject) => {
                    db.query('SELECT club_id FROM clubs WHERE subdomain = ?', [testSubdomain], (err, results) => {
                        if (err) reject(err);
                        else resolve(results);
                    });
                });
                if (test.length === 0) {
                    finalSubdomain = testSubdomain;
                    unique = true;
                }
                counter++;
            }
        }

        // Start transaction
        await new Promise((resolve, reject) => {
            db.beginTransaction((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // Insert new club (following your schema structure)
            const clubResult = await new Promise((resolve, reject) => {
                db.query(`
                    INSERT INTO clubs (
                        club_name, 
                        subdomain, 
                        description, 
                        status,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, ?, 'active', NOW(), NOW())
                `, [
                    club_name,
                    finalSubdomain,
                    description || ''
                ], (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            });

            const clubId = clubResult.insertId;

            // Create user account for club owner
            const userResult = await new Promise((resolve, reject) => {
                db.query(`
                    INSERT INTO users (
                        email,
                        password_hash,
                        first_name,
                        last_name,
                        phone,
                        created_at,
                        updated_at
                    ) VALUES (?, 'TEMP_HASH_TO_BE_SET', ?, ?, ?, NOW(), NOW())
                `, [email, first_name, last_name, phone || null], (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            });

            const userId = userResult.insertId;

            // Link user as club owner/admin
            await new Promise((resolve, reject) => {
                db.query(`
                    INSERT INTO club_staff (
                        club_id,
                        user_id,
                        role,
                        is_primary_contact,
                        created_at
                    ) VALUES (?, ?, 'owner', 1, NOW())
                `, [clubId, userId], (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            });

            // Insert primary location (with required address fields)
            await new Promise((resolve, reject) => {
                db.query(`
                    INSERT INTO locations (
                        club_id,
                        location_name,
                        address_line1,
                        city,
                        state,
                        postal_code,
                        country,
                        is_primary_location,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, 'TBD', ?, ?, 'TBD', 'USA', 1, NOW(), NOW())
                `, [clubId, `${club_name} - Main Location`, city, state], (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            });

            // Create household for the owner
            const householdResult = await new Promise((resolve, reject) => {
                db.query(`
                    INSERT INTO households (
                        club_id,
                        household_name,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, NOW(), NOW())
                `, [clubId, `${first_name} ${last_name} Family`], (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            });

            const householdId = householdResult.insertId;

            // Create member record for the club owner
            await new Promise((resolve, reject) => {
                db.query(`
                    INSERT INTO members (
                        club_id,
                        household_id,
                        membership_type,
                        membership_start_date,
                        status,
                        first_name,
                        last_name,
                        email,
                        phone,
                        is_primary_member,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, 'individual', CURDATE(), 'active', ?, ?, ?, ?, 1, NOW(), NOW())
                `, [clubId, householdId, first_name, last_name, email, phone || null], (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            });

            // Commit transaction
            await new Promise((resolve, reject) => {
                db.commit((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Return success response
            res.json({
                success: true,
                message: 'Club registration successful!',
                club: {
                    id: clubId,
                    name: club_name,
                    subdomain: finalSubdomain,
                    email: email,
                    status: 'active'
                }
            });

        } catch (error) {
            // Rollback transaction on error
            await new Promise((resolve) => {
                db.rollback(() => resolve());
            });
            throw error;
        }

    } catch (error) {
        console.error('Club signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed. Please try again.'
        });
    }
});




app.listen(PORT, '0.0.0.0', () => {
    console.log(`Marketing site running on http://3.227.191.44:${PORT}`);
});
