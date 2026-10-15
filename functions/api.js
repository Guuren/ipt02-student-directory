const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const serverless = require('serverless-http');
const Pusher = require('pusher');
const pool = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;

const app = express();

// Initialize Pusher Server SDK using Environment Variables
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER || 'ap1',
  useTLS: true
});

// Custom profanity check (English & Tagalog slang) to prevent CJS/ESM compatibility issues
const PROFANITY_LIST = [
  'tangina', 'gago', 'bobo', 'tanga', 'ulol', 'puta', 'inutil', 
  'fuck', 'shit', 'asshole', 'bitch', 'bastard', 'crap'
];

function containsProfanity(text) {
  const lower = text.toLowerCase();
  return PROFANITY_LIST.some(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(lower);
  });
}

function containsLinks(text) {
  const urlPattern = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|ph|net|org|edu|gov|io|me|dev)[^\s]*)/gi;
  return urlPattern.test(text);
}

// CORS Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma, Expires');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// JWT Verification Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Access token missing' });

  jwt.verify(token, JWT_SECRET || 'your_fallback_secret_key', (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// ------------------- PUBLIC ROUTES -------------------

// Public endpoint to safely provide Pusher configuration to frontend dynamically
app.get('/api/config/pusher', (req, res) => {
  res.json({
    key: process.env.PUSHER_KEY || '',
    cluster: process.env.PUSHER_CLUSTER || 'ap1'
  });
});

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

  const REQUIRED_TOKEN = 'IPT02_MAD67';
  if (!registration_token || registration_token !== REQUIRED_TOKEN) {
    return res.status(403).json({ 
      message: 'Invalid or missing registration token. Only authorized students can register.' 
    });
  }

  if (!student_id || !student_name || !password || !email || !section) {
    return res.status(400).json({ 
      message: 'Student ID, Name, Password, Section, and Email are required.' 
    });
  }

  try {
    const [existing] = await pool.query(
      'SELECT id FROM students WHERE student_id = ?', 
      [student_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: 'Student ID is already registered.' });
    }

    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

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

app.post('/api/login', async (req, res) => {
  const { student_id, password } = req.body;

  try {
    const [rows] = await pool.query(
      'SELECT id, student_id, student_name, password_hash, section, email, mobile_number, social_media_link, profile_picture_url FROM students WHERE student_id = ?',
      [student_id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid Student ID or Password.' });
    }

    const student = rows[0];

    const match = await bcrypt.compare(password, student.password_hash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid Student ID or Password.' });
    }

    const token = jwt.sign(
      { 
        id: student.id, 
        student_id: student.student_id,
        student_name: student.student_name,
        section: student.section,
        profile_picture_url: student.profile_picture_url
      },
      JWT_SECRET || 'your_fallback_secret_key',
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

app.put('/api/students/:id', authenticateToken, async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const authenticatedUserId = req.user.id;

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

// ------------------- LIVE CHAT ENDPOINTS -------------------

app.post('/api/chat/send', authenticateToken, async (req, res) => {
  const { message } = req.body;
  const user = req.user;

  if (!message || message.trim() === '') {
    return res.status(400).json({ message: 'Message cannot be empty.' });
  }

  if (message.length > 250) {
    return res.status(400).json({ message: 'Message exceeds 250 characters.' });
  }

  if (containsLinks(message)) {
    return res.status(400).json({ message: 'Posting links or web URLs is not permitted.' });
  }

  if (containsProfanity(message)) {
    return res.status(400).json({ message: 'Inappropriate language detected.' });
  }

  const cleanMessage = message.trim();

  try {
    const [result] = await pool.query(
      'INSERT INTO chat_messages (student_pk, message) VALUES (?, ?)',
      [user.id, cleanMessage]
    );

    const payload = {
      id: result.insertId,
      student_pk: user.id,
      student_id: user.student_id,
      student_name: user.student_name,
      section: user.section,
      profile_picture_url: user.profile_picture_url,
      message: cleanMessage,
      timestamp: new Date().toISOString()
    };

    await pusher.trigger('student-chat-channel', 'new-message', payload);

    res.status(200).json({ success: true, data: payload });
  } catch (error) {
    console.error('Send chat error:', error);
    res.status(500).json({ message: 'Failed to send message.' });
  }
});

app.get('/api/chat/history', authenticateToken, async (req, res) => {
  try {
    const sql = `
      SELECT 
        c.id,
        c.student_pk,
        c.message,
        c.created_at AS timestamp,
        s.student_id,
        s.student_name,
        s.section,
        s.profile_picture_url
      FROM chat_messages c
      INNER JOIN students s ON c.student_pk = s.id
      ORDER BY c.created_at DESC
      LIMIT 50
    `;

    const [rows] = await pool.query(sql);

    res.status(200).json(rows.reverse());
  } catch (error) {
    console.error('Fetch chat history error:', error);
    res.status(500).json({ message: 'Failed to fetch chat history.' });
  }
});

// Export serverless handler for Netlify
module.exports.handler = serverless(app);