const express = require('express');
const cors = require('cors');
const path = require('path'); // Import the 'path' module
const mongoose = require('mongoose');

  // --- Database Connection ---
// IMPORTANT: Your connection string should be stored as an environment variable, not here.
const MONGO_URI = process.env.MONGO_URI || 'YOUR_FALLBACK_CONNECTION_STRING';

mongoose.connect(MONGO_URI)
  .then(() => console.log('Successfully connected to MongoDB Atlas!'))
  .catch(error => console.error('Error connecting to MongoDB:', error));

// --- Mongoose Schema & Model ---
// This defines the structure of a "student" document in your database.
const gradeSchema = new mongoose.Schema({}, { 
  strict: false,
  _id: false // Prevent Mongoose from creating an _id for subdocuments
}); // Flexible schema for grades

const studentSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Use the student ID as the primary key
  name: { type: String, required: true },
  className: { type: String, required: false },
  rollNumber: { type: String, required: false },
  academicYear: { type: String, required: false },
  principalComment: { type: String, required: false },
  isArchived: { type: Boolean, default: false },
  grades: [gradeSchema]
}, {
  // Use the provided _id instead of letting MongoDB generate one
  _id: false,
  // Automatically add createdAt and updatedAt timestamps
  timestamps: true
});

const Student = mongoose.model('Student', studentSchema);

const app = express();
const PORT = process.env.PORT || 3000; // Use Render's port or 3000 for local dev

// Enable CORS for all routes. This is crucial for allowing your frontend,
// which is on a different domain, to make requests to this backend.
app.use(cors());

// Serve static files (like index.html, style.css, script.js) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));


// Add middleware to parse JSON bodies from incoming requests
app.use(express.json());

// API endpoint to GET all students
app.get('/api/students', async (req, res) => {
  try {
    const students = await Student.find({});
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching students' });
  }
});

// API endpoint to GET a single student's data
app.get('/api/students/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json(student);
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching student' });
  }
});

// API endpoint to CREATE a new student
app.post('/api/students', async (req, res) => {
  try {
    const { id, name, className, rollNumber, academicYear, principalComment, isArchived, grades } = req.body;

    // Check if a student with this ID already exists
    const existingStudent = await Student.findById(id);
    if (existingStudent) {
      return res.status(409).json({ success: false, message: 'A student with this ID already exists.' });
    }
    const newStudent = new Student({ _id: id, name, className, rollNumber, academicYear, principalComment, isArchived, grades });
    await newStudent.save();
    res.status(201).json({ success: true, message: 'Student added successfully!', data: newStudent });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add student.', error: error.message });
  }
});

// API endpoint to UPDATE an existing student's data
app.put('/api/students/:id', async (req, res) => {
  try {
    const { name, className, rollNumber, academicYear, principalComment, isArchived, grades } = req.body;

    const updatedStudent = await Student.findByIdAndUpdate(
      req.params.id,
      { name, className, rollNumber, academicYear, principalComment, isArchived, grades },
      { new: true, runValidators: true } // Return the updated document
    );

    if (!updatedStudent) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    res.json({ success: true, message: 'Student data updated successfully', data: updatedStudent });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update student.', error: error.message });
  }
});

// API endpoint to DELETE a student
app.delete('/api/students/:id', async (req, res) => {
  try {
    const deletedStudent = await Student.findByIdAndDelete(req.params.id);

    if (!deletedStudent) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    res.json({ success: true, message: 'Student deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete student.', error: error.message });
  }
});

// A catch-all route to send index.html for any other GET request that isn't an API call.
// This is useful for single-page applications but also good practice here.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});