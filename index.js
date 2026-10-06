const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const serverless = require('serverless-http');
const pool = require('./db');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

app.use(express.static('public'));

// JWT Verification Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) return res.status(401).json({ message: 'Access Token Required' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or Expired Token' });
    req.user = user;
    next();
  });
};

// ------------------- PUBLIC ROUTES -------------------

// 1. PUBLIC READ: Get all students for the public datatable
app.get('/api/students', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, student_id, student_name, section, email, mobile_number, social_media_link, profile_picture_url, created_at FROM students'
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 2. AUTHENTICATION: Student Login
app.post('/api/login', async (req, res) => {
  const { student_id, password } = req.body;

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

    // Generate JWT Token
    const token = jwt.sign(
      { id: student.id, student_id: student.student_id },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
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

// 3. CREATE: Register a new student
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

// 4. UPDATE: Update profile details (Protected)
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

// Standalone local execution server
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`API running locally on http://localhost:${PORT}`);
  });
}

// Export serverless handler for Netlify
module.exports.handler = serverless(app);