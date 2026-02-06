const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Load environment variables from .env file
const path = require('path'); // Import the 'path' module
const mongoose = require('mongoose');
const admin = require('firebase-admin');

// --- Firebase Admin Setup ---
// IMPORTANT: You must install firebase-admin (npm install firebase-admin)
// and place your 'serviceAccountKey.json' in the root directory.
try {
  let serviceAccount;
  // 1. Try to load from environment variable (Production/Render)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Debugging: Log the first few characters to verify content (without exposing secrets)
    const rawConfig = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    if (!rawConfig.startsWith('{')) {
        console.error("ERROR: FIREBASE_SERVICE_ACCOUNT does not start with '{'. It starts with:", rawConfig.substring(0, 10));
        throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is not a valid JSON string. Did you paste the email instead of the JSON content?");
    }
    serviceAccount = JSON.parse(rawConfig);
  } else {
    // 2. Fallback to local file (Development)
    serviceAccount = require('./serviceAccountKey.json');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin initialized successfully.");
} catch (error) {
  console.warn("Warning: Firebase Admin not initialized. API protection will fail.");
  console.error("Error details:", error.message);
}

  // --- Database Connection ---
// IMPORTANT: Your connection string should be stored as an environment variable, not here.
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('Successfully connected to MongoDB!'))
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
  schoolName: { type: String, required: false },
  academicYear: { type: String, required: false },
  principalComment: { type: String, required: false },
  isArchived: { type: Boolean, default: false },
  sponsorId: { type: String, required: false },
  grades: [gradeSchema]
}, {
  // Use the provided _id instead of letting MongoDB generate one
  _id: false,
  // Automatically add createdAt and updatedAt timestamps
  timestamps: true
});

const Student = mongoose.model('Student', studentSchema);

// --- Settings Schema ---
const settingsSchema = new mongoose.Schema({
  sponsorId: { type: String, required: true, unique: true },
  academicYear: { type: String, default: "2023-2024" },
  schoolName: { type: String, default: "Emmanuel Suah Academy" }
}, { timestamps: true });

const Settings = mongoose.model('Settings', settingsSchema);

const app = express();
const PORT = process.env.PORT || 3000; // Use Render's port or 3000 for local dev

// Enable CORS for all routes. This is crucial for allowing your frontend,
// which is on a different domain, to make requests to this backend.
app.use(cors());

// Serve static files (like index.html, style.css, script.js) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Convenience route: Redirect /admin to /admin.html
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Convenience route: Serve student.html from root if requested
app.get('/student.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'student.html'));
});

// Add middleware to parse JSON bodies from incoming requests
app.use(express.json());

// --- Authentication Middleware ---
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken; // Attach user info (uid, email, etc.) to request
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(403).json({ error: 'Unauthorized: Invalid token' });
  }
};

// API endpoint to GET all students
app.get('/api/students', verifyToken, async (req, res) => {
  try {
    // Secure: Only fetch students belonging to the authenticated sponsor
    const students = await Student.find({ sponsorId: req.user.uid });
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching students' });
  }
});

// API endpoint to GET a single student's data
app.get('/api/students/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).lean();
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Inject global settings (School Name/Year) from the sponsor
    if (student.sponsorId) {
      const settings = await Settings.findOne({ sponsorId: student.sponsorId });
      if (settings) {
        if (settings.schoolName) student.schoolName = settings.schoolName;
      }
    }
    res.json(student);
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching student' });
  }
});

// API endpoint to CREATE a new student
app.post('/api/students', verifyToken, async (req, res) => {
  try {
    const { id, name, className, rollNumber, schoolName, academicYear, principalComment, isArchived, grades } = req.body;
    const sponsorId = req.user.uid; // Securely get ID from token

    // Check if a student with this ID already exists
    const existingStudent = await Student.findById(id);
    if (existingStudent) {
      return res.status(409).json({ success: false, message: 'A student with this ID already exists.' });
    }
    const newStudent = new Student({ _id: id, name, className, rollNumber, schoolName, academicYear, principalComment, isArchived, grades, sponsorId });
    await newStudent.save();
    res.status(201).json({ success: true, message: 'Student added successfully!', data: newStudent });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add student.', error: error.message });
  }
});

// API endpoint to UPDATE an existing student's data
app.put('/api/students/:id', verifyToken, async (req, res) => {
  try {
    const { name, className, rollNumber, schoolName, academicYear, principalComment, isArchived, grades } = req.body;
    const sponsorId = req.user.uid;

    const updatedStudent = await Student.findOneAndUpdate(
      { _id: req.params.id, sponsorId: sponsorId }, // Ensure user owns the record
      { name, className, rollNumber, schoolName, academicYear, principalComment, isArchived, grades, sponsorId },
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
app.delete('/api/students/:id', verifyToken, async (req, res) => {
  try {
    const deletedStudent = await Student.findOneAndDelete({ 
      _id: req.params.id, 
      sponsorId: req.user.uid // Ensure user owns the record
    });

    if (!deletedStudent) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    res.json({ success: true, message: 'Student deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete student.', error: error.message });
  }
});

// API endpoint to GET settings
app.get('/api/settings', verifyToken, async (req, res) => {
  try {
    let settings = await Settings.findOne({ sponsorId: req.user.uid });
    if (!settings) {
      settings = new Settings({ sponsorId: req.user.uid });
      await settings.save();
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// API endpoint to UPDATE settings
app.put('/api/settings', verifyToken, async (req, res) => {
  try {
    const { academicYear, schoolName } = req.body;
    const settings = await Settings.findOneAndUpdate(
      { sponsorId: req.user.uid },
      { academicYear, schoolName },
      { new: true, upsert: true }
    );
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// API endpoint to serve Firebase config to frontend
app.get('/api/config/firebase', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
  });
});

// A catch-all route to send index.html for any other GET request that isn't an API call.
// This is useful for single-page applications but also good practice here.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});