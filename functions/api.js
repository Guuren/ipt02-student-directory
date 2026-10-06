app.post('/api/login', async (req, res) => {
  const { student_id, password } = req.body;

  // Server-side Regex check for numbers and dashes only
  const studentIdRegex = /^[0-9-]+$/;
  if (!student_id || !studentIdRegex.test(student_id)) {
    return res.status(400).json({ message: 'Invalid Student ID format. Only numbers and dashes are allowed.' });
  }

  // Proceed with DB lookup...
});