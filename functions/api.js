const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const serverless = require('serverless-http');
const pool = require('../db');
const JWT_SECRET = process.env.JWT_SECRET || 'ipt02_compile';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

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
app.post('/api/register', async (req, res) => {
  const { 
    student_id, 
    student_name, 
    password, 
    section, 
    email, 
    mobile_number, 
    social_media_link, 
    profile_picture_url 
  } = req.body;

  // 1. Basic Validation
  if (!student_id || !student_name || !password || !email) {
    return res.status(400).json({ message: 'Missing required registration fields.' });
  }

  try {
    // 2. Check if Student ID or Email already exists
    const [existing] = await pool.query(
      'SELECT id FROM students WHERE student_id = ? OR email = ?',
      [student_id, email]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: 'Student ID or Email is already registered.' });
    }

    // 3. Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 4. Insert into Aiven MySQL Database
    const [result] = await pool.query(
      `INSERT INTO students 
      (student_id, student_name, password, section, email, mobile_number, social_media_link, profile_picture_url) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        student_id,
        student_name,
        hashedPassword,
        section || '',
        email,
        mobile_number || '',
        social_media_link || '',
        profile_picture_url || ''
      ]
    );

    res.status(201).json({
      message: 'Student account registered successfully!',
      studentId: result.insertId
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Database error during registration.', error: error.message });
  }
});


// 2. Student Login
app.post('/api/login', async (req, res) => {
  const { student_id, password } = req.body;

  // Real-time server side input validation
  const studentIdRegex = /^[0-9-]+$/;
  if (!student_id || !studentIdRegex.test(student_id)) {
    return res.status(400).json({ message: 'Invalid Student ID format. Numbers and dashes only.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM students WHERE student_id = ?', [student_id]);
    if (rows.length === 0) {
      return res.status(400).json({ message: 'Invalid Student ID or Password' });
    }

    const student = rows[0];
    const validPassword = await bcrypt.compare(password, student.password_hash);

    if (!validPassword) {
      return res.status(400).json({ message: 'Invalid Student ID or Password' });
    }

    const token = jwt.sign(
    { id: student.id, student_id: student.student_id }, 
    JWT_SECRET, 
    { expiresIn: '24h' }
  );

    res.json({
      message: 'Login successful',
      token,
      student: {
        id: student.id,
        student_id: student.student_id,
        student_name: student.student_name,
        section: student.section,
        email: student.email,
        mobile_number: student.mobile_number,
        social_media_link: student.social_media_link,
        profile_picture_url: student.profile_picture_url
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
app.put('/api/students/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { student_name, section, email, mobile_number, social_media_link, profile_picture_url } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE students 
       SET student_name = ?, section = ?, email = ?, mobile_number = ?, social_media_link = ?, profile_picture_url = ? 
       WHERE id = ?`,
      [student_name, section, email, mobile_number, social_media_link, profile_picture_url, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Student record not found' });
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Export serverless handler for Netlify
module.exports.handler = serverless(app);