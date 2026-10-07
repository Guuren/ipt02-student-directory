const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const serverless = require('serverless-http');
const pool = require('../db');
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();

// Middleware
// Enable CORS for all origins and allow Authorization headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma, Expires');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  // Intercept OPTIONS preflight requests immediately
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});
// 2. Standard Body Parsing Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// JWT Verification Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) return res.status(401).json({ message: 'Access token missing' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// ------------------- PUBLIC ROUTES -------------------

//1. Student Register
// ==========================================
// REGISTER NEW STUDENT
// ==========================================
app.post('/api/register', async (req, res) => {
  const { 
    student_id, 
    student_name, 
    password, 
    section, 
    email, 
    mobile_number, 
    social_media_link, 
    profile_picture_url,
    registration_token 
  } = req.body;

  // 1. Verify Registration Token
  const REQUIRED_TOKEN = 'IPT02_MAD67';
  if (!registration_token || registration_token !== REQUIRED_TOKEN) {
    return res.status(403).json({ 
      message: 'Invalid or missing registration token. Only authorized students can register.' 
    });
  }

  // 2. Validate Required Fields
  if (!student_id || !student_name || !password || !email || !section) {
    return res.status(400).json({ 
      message: 'Student ID, Name, Password, Section, and Email are required.' 
    });
  }

  try {
    // Check if student_id already exists
    const [existing] = await pool.query(
      'SELECT id FROM students WHERE student_id = ?', 
      [student_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: 'Student ID is already registered.' });
    }

    // Hash Password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Insert Student Record
    const [result] = await pool.query(
      `INSERT INTO students 
        (student_id, student_name, password_hash, section, email, mobile_number, social_media_link, profile_picture_url) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        student_id, 
        student_name, 
        password_hash, 
        section, 
        email, 
        mobile_number || null, 
        social_media_link || null, 
        profile_picture_url || null
      ]
    );

    res.status(201).json({ 
      message: 'Account created successfully!', 
      studentId: result.insertId 
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});


// 2. Student Login
// LOGIN
app.post('/api/login', async (req, res) => {
  const { student_id, password } = req.body;

  try {
    // Select password_hash from the DB
    const [rows] = await pool.query(
      'SELECT id, student_id, student_name, password_hash, section, email FROM students WHERE student_id = ?',
      [student_id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid Student ID or Password.' });
    }

    const student = rows[0];

    // Compare with password_hash
    const match = await bcrypt.compare(password, student.password_hash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid Student ID or Password.' });
    }

    const token = jwt.sign(
      { id: student.id, student_id: student.student_id },
      process.env.JWT_SECRET || 'your_fallback_secret_key',
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token: token,
      student: {
        id: student.id,
        student_id: student.student_id,
        student_name: student.student_name,
        email: student.email,
        section: student.section,
        mobile_number: student.mobile_number,
        social_media_link: student.social_media_link,
        profile_picture_url: student.profile_picture_url
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login.', error: error.message });
  }
});

// ------------------- PROTECTED ROUTES -------------------

// Get all students for public datatable
// PROTECTED ROUTE: Only logged-in users with a valid JWT can view student records
app.get('/api/students', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, student_id, student_name, section, email, mobile_number, social_media_link, profile_picture_url, created_at FROM students'
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
//Protected register student
app.post('/api/students', async (req, res) => {
  const { student_id, student_name, password, section, email, mobile_number, social_media_link, profile_picture_url } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO students (student_id, student_name, password_hash, section, email, mobile_number, social_media_link, profile_picture_url) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [student_id, student_name, hashedPassword, section, email, mobile_number, social_media_link, profile_picture_url || 'https://via.placeholder.com/150']
    );

    res.status(201).json({ message: 'Student created successfully', studentId: result.insertId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
//protected update student
// ==========================================
// PROTECTED ROUTE: Update Own Student Profile
// ==========================================
app.put('/api/students/:id', authenticateToken, async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const authenticatedUserId = req.user.id; // From JWT payload

  // Security Check: Enforce self-update only
  if (authenticatedUserId !== targetId) {
    return res.status(403).json({ message: 'Forbidden: You can only update your own profile.' });
  }

  const {
    student_name,
    section,
    email,
    mobile_number,
    social_media_link,
    profile_picture_url
  } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE students 
       SET student_name = ?, section = ?, email = ?, mobile_number = ?, social_media_link = ?, profile_picture_url = ?
       WHERE id = ?`,
      [
        student_name,
        section,
        email,
        mobile_number || '',
        social_media_link || '',
        profile_picture_url || '',
        targetId
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Student record not found.' });
    }

    res.json({ message: 'Profile updated successfully!' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Database error while updating profile.', error: error.message });
  }
});

// Export serverless handler for Netlify
module.exports.handler = serverless(app);