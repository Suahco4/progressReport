const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Load environment variables from .env file
const path = require('path'); // Import the 'path' module
const mongoose = require('mongoose');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const crypto = require('crypto');
const multer = require('multer');
const { GridFsStorage } = require('multer-gridfs-storage');

// --- Firebase Admin Setup ---
// IMPORTANT: You must install firebase-admin (npm install firebase-admin)
// and place your 'serviceAccountKey.json' in the root directory.
try {
  let serviceAccount;
  // 1. Try to load from environment variable
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

let gfs;

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('Successfully connected to MongoDB!');
    gfs = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'uploads'
    });
  })
  .catch(error => console.error('Error connecting to MongoDB:', error));

// --- Mongoose Schema & Model ---
// This defines the structure of a "student" document in your database.
const gradeSchema = new mongoose.Schema({
  subject: { type: String, alias: 's', maxlength: 40 },
  comment: { type: String, alias: 'c', maxlength: 100 },
  attachment: { type: String, alias: 'at' } // Stores the GridFS filename
}, { 
  strict: false,
  _id: false // Prevent Mongoose from creating an _id for subdocuments
}); // Flexible schema for grades

const studentSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Use the student ID as the primary key
  name: { type: String, required: true, alias: 'n', maxlength: 60 },
  className: { type: String, required: false, alias: 'cn', maxlength: 20 },
  rollNumber: { type: String, required: false, alias: 'rn', maxlength: 15 },
  schoolName: { type: String, required: false, alias: 'sn', maxlength: 100 },
  academicYear: { type: String, required: false, alias: 'ay', maxlength: 15 },
  principalComment: { type: String, required: false, alias: 'pc', maxlength: 250 },
  isArchived: { type: Boolean, default: false, alias: 'ia' },
  sponsorId: { type: String, required: false, alias: 'sid' },
  grades: { 
    type: [gradeSchema], 
    alias: 'g',
    validate: [val => val.length <= 15, '{PATH} exceeds the limit of 15 subjects'] 
  },
  loginCount: { type: Number, default: 0, alias: 'lc' }
}, {
  _id: false,
  timestamps: true
});

// Middleware to enforce 1KB (1024 bytes) limit per document
studentSchema.pre('save', function(next) {
  // Use the underlying MongoDB BSON parser to calculate the exact size
  // include virtuals and internal fields to be precise
  const docSize = mongoose.mongo.BSON.calculateObjectSize(this.toObject());

  if (docSize > 1024) {
    const error = new Error(`Document size (${docSize} bytes) exceeds the 1KB limit. Reduce field lengths or subject count.`);
    return next(error);
  }
  next();
});

const Student = mongoose.model('Student', studentSchema);

// --- Settings Schema ---
const settingsSchema = new mongoose.Schema({
  sponsorId: { type: String, required: true, unique: true },
  instructorName: { type: String },
  instructorEmail: { type: String },
  academicYear: { type: String, default: "2023-2024" },
  schoolName: { type: String, default: "Emmanuel Suah Academy" }
}, { timestamps: true });

const Settings = mongoose.model('Settings', settingsSchema);

// --- Activity Log Schema (For Super Admin) ---
const logSchema = new mongoose.Schema({
  instructorId: { type: String }, // No longer required to allow student logs
  instructorEmail: { type: String },
  instructorName: { type: String },
  studentId: { type: String },
  studentName: { type: String },
  userType: { type: String, default: 'INSTRUCTOR' }, // 'INSTRUCTOR' or 'STUDENT'
  action: { type: String, required: true }, // e.g., LOGIN, LOGOUT, ADD_STUDENT
  details: { type: String },
  timestamp: { type: Date, default: Date.now }
});

const Log = mongoose.model('Log', logSchema);

// --- GridFS Storage Configuration ---
const storage = new GridFsStorage({
  url: MONGO_URI,
  file: (req, file) => {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(16, (err, buf) => {
        if (err) {
          return reject(err);
        }
        const filename = buf.toString('hex') + path.extname(file.originalname);
        const fileInfo = {
          filename: filename,
          bucketName: 'uploads'
        };
        resolve(fileInfo);
      });
    });
  }
});
const upload = multer({ storage });

const app = express();
const PORT = process.env.PORT || 3000; // Use Render's port or 3000 for local dev

// Enable CORS for all routes. This is crucial for allowing your frontend,
// which is on a different domain, to make requests to this backend.
app.use(cors());

// Check for email credentials to prevent runtime errors later
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn("WARNING: EMAIL_USER or EMAIL_PASS is missing in environment variables. Email features will fail.");
}

// Configure Nodemailer (Moved up to be accessible by routes)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

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

// Convenience route: Serve superadmin.html
app.get('/superadmin', (req, res) => {
  res.sendFile(path.join(__dirname, 'superadmin.html'));
});

// Add middleware to parse JSON bodies from incoming requests
app.use(express.json({ limit: '16mb' })); // Set request size limit to 16MB

// --- Authentication Middleware ---
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Enforce Email Verification
    if (!decodedToken.email_verified) {
      return res.status(403).json({ error: 'Unauthorized: Your email must be verified to access this platform.' });
    }

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
    // Check for Admin Token to bypass limit
    let isAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const idToken = authHeader.split('Bearer ')[1];
        await admin.auth().verifyIdToken(idToken);
        isAdmin = true;
      } catch (e) {
        // Token invalid, treat as student
      }
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Enforce Login Limit for Students (Limit: 10)
    if (!isAdmin) {
      if (student.loginCount >= 10) {
        return res.status(403).json({ error: 'Maximum view limit (10) reached for this period. Please contact administration.' });
      }
      // Increment login count
      student.loginCount = (student.loginCount || 0) + 1;
      await student.save();
    }
    
    const studentObj = student.toObject();
    // Inject global settings (School Name/Year) from the sponsor
    if (studentObj.sponsorId) {
      const settings = await Settings.findOne({ sponsorId: studentObj.sponsorId });
      if (settings) {
        if (settings.schoolName) studentObj.schoolName = settings.schoolName;
      }
    }
    res.json(studentObj);
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

    // Log the action
    await Log.create({
      instructorId: sponsorId,
      instructorEmail: req.user.email || 'Unknown',
      instructorName: req.user.name || 'Unknown',
      action: 'ADD_STUDENT',
      details: `Added student: ${name} (ID: ${id})`
    });

    res.status(201).json({ success: true, message: 'Student added successfully!', data: newStudent });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add student.', error: error.message });
  }
});

// API endpoint to UPDATE an existing student's data
app.put('/api/students/:id', verifyToken, async (req, res) => {
  try {
    const { name, className, rollNumber, schoolName, academicYear, principalComment, isArchived, grades } = req.body;
    
    const isSuperAdmin = req.user.email && SUPER_ADMINS.includes(req.user.email);
    const query = { _id: req.params.id };
    
    // Prepare update data, filtering out undefined values for partial updates
    const updateData = { name, className, rollNumber, schoolName, academicYear, principalComment, isArchived, grades };
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    // Reset login count on update so students can check new grades
    updateData.loginCount = 0;

    if (!isSuperAdmin) {
      query.sponsorId = req.user.uid;
      updateData.sponsorId = req.user.uid; // Ensure ownership is maintained by instructor
    }

    const updatedStudent = await Student.findOneAndUpdate(query, updateData, { new: true, runValidators: true });

    if (!updatedStudent) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Log if the student was archived
    if (updateData.isArchived === true) {
      await Log.create({
        instructorId: req.user.uid,
        instructorEmail: req.user.email || 'Unknown',
        instructorName: req.user.name || 'Unknown',
        action: 'ARCHIVE_STUDENT',
        details: `Archived student: ${updatedStudent.name} (ID: ${updatedStudent._id})`
      });
    }

    res.json({ success: true, message: 'Student data updated successfully', data: updatedStudent });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update student.', error: error.message });
  }
});

// API endpoint to DELETE a student
app.delete('/api/students/:id', verifyToken, async (req, res) => {
  try {
    const isSuperAdmin = req.user.email && SUPER_ADMINS.includes(req.user.email);
    const query = { _id: req.params.id };
    
    // If not super admin, restrict deletion to own students
    if (!isSuperAdmin) {
      query.sponsorId = req.user.uid;
    }

    const deletedStudent = await Student.findOneAndDelete(query);

    if (!deletedStudent) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Log the action
    await Log.create({
      instructorId: req.user.uid,
      instructorEmail: req.user.email || 'Unknown',
      instructorName: req.user.name || 'Unknown',
      action: 'DELETE_STUDENT',
      details: `Deleted student: ${deletedStudent.name} (ID: ${deletedStudent._id})`
    });

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
    const { academicYear, schoolName, instructorName } = req.body;
    const settings = await Settings.findOneAndUpdate(
      { sponsorId: req.user.uid },
      { academicYear, schoolName, instructorName },
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

// --- GridFS Routes ---

// Upload a file (e.g., POST /api/upload with form-data key 'file')
app.post('/api/upload', upload.single('file'), (req, res) => {
  res.json({ file: req.file });
});

// Retrieve/Stream a file
app.get('/api/files/:filename', async (req, res) => {
  if (!gfs) return res.status(500).json({ error: 'GridFS not initialized' });

  try {
    const files = await gfs.find({ filename: req.params.filename }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    // Stream the file to the client
    gfs.openDownloadStreamByName(req.params.filename).pipe(res);
  } catch (error) {
    res.status(500).json({ error: 'Error retrieving file' });
  }
});

// --- Super Admin / Logging Endpoints ---

// Define allowed super admin emails
const SUPER_ADMINS = process.env.SUPER_ADMIN_EMAILS 
  ? process.env.SUPER_ADMIN_EMAILS.split(',').map(email => email.trim())
  : ['theadmin@gmail.com', 'principal@school.com', 'your-email@example.com'];

// Endpoint to check super admin status (Used by frontend to validate session)
app.get('/api/auth/is-superadmin', verifyToken, (req, res) => {
  const isSuperAdmin = req.user.email && SUPER_ADMINS.includes(req.user.email);
  res.json({ isSuperAdmin });
});

// Endpoint to record client-side activities (Login/Logout)
app.post('/api/activity', verifyToken, async (req, res) => {
  try {
    const { action, details, instructorName } = req.body;

    // Capture Instructor Details on Login
    if (action === 'LOGIN') {
      const updateFields = { instructorEmail: req.user.email };
      if (instructorName) updateFields.instructorName = instructorName;
      
      const updateOps = { $set: updateFields };
      updateOps.$setOnInsert = { instructorName: instructorName || req.user.name || 'Unknown' };

      await Settings.findOneAndUpdate(
        { sponsorId: req.user.uid },
        updateOps,
        { upsert: true, new: true }
      );
    }

    await Log.create({
      instructorId: req.user.uid,
      instructorEmail: req.user.email || 'Unknown',
      instructorName: instructorName || req.user.name || 'Unknown',
      userType: 'INSTRUCTOR',
      action: action,
      details: details || ''
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Logging error:', error);
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

// Endpoint to record STUDENT activities (Public/No Token required)
app.post('/api/student/activity', async (req, res) => {
  try {
    const { studentId, studentName, action, details } = req.body;
    await Log.create({
      studentId: studentId,
      studentName: studentName,
      userType: 'STUDENT',
      action: action || 'STUDENT_LOGIN',
      details: details || ''
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Student logging error:', error);
    res.status(500).json({ error: 'Failed to log student activity' });
  }
});

// Endpoint to fetch ALL students (For Super Admin)
app.get('/api/admin/students', verifyToken, async (req, res) => {
  try {
    // Security Check: Ensure the user is a Super Admin
    if (!req.user.email || !SUPER_ADMINS.includes(req.user.email)) {
      return res.status(403).json({ error: 'Access Denied: You are not a Super Admin.' });
    }

    const students = await Student.find().lean();
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Endpoint to fetch logs (For Super Admin)
app.get('/api/logs', verifyToken, async (req, res) => {
  try {
    // Security Check: Ensure the user is a Super Admin
    if (!req.user.email || !SUPER_ADMINS.includes(req.user.email)) {
      return res.status(403).json({ error: 'Access Denied: You are not a Super Admin.' });
    }

    const { startDate, endDate, search, actionType, userType } = req.query;
    let query = {};

    if (userType) {
      query.userType = userType.trim();
    }

    if (actionType) {
      query.action = actionType.trim();
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Include the entire end day
        query.timestamp.$lte = end;
      }
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i'); // Case-insensitive search
      query.$or = [
        { instructorEmail: searchRegex },
        { studentName: searchRegex },
        { studentId: searchRegex },
        { action: searchRegex },
        { details: searchRegex }
      ];
    }

    // Fetch logs, newest first. Increase limit if filtering, otherwise default to 200
    const limit = (startDate || endDate || search || actionType || userType) ? 1000 : 200;
    const logs = await Log.find(query).sort({ timestamp: -1 }).limit(limit);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// Endpoint to delete old logs (For Super Admin)
app.delete('/api/logs', verifyToken, async (req, res) => {
  try {
    // Security Check: Ensure the user is a Super Admin
    if (!req.user.email || !SUPER_ADMINS.includes(req.user.email)) {
      return res.status(403).json({ error: 'Access Denied: You are not a Super Admin.' });
    }

    const { olderThan } = req.query;
    if (!olderThan) {
      return res.status(400).json({ error: 'Missing olderThan date parameter' });
    }

    const dateThreshold = new Date(olderThan);
    if (isNaN(dateThreshold.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const result = await Log.deleteMany({ timestamp: { $lt: dateThreshold } });
    
    // Log the cleanup action
    await Log.create({
      instructorId: req.user.uid,
      instructorEmail: req.user.email || 'Unknown',
      instructorName: req.user.name || 'Unknown',
      action: 'CLEANUP_LOGS',
      details: `Deleted ${result.deletedCount} logs older than ${olderThan}`
    });

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Delete logs error:', error);
    res.status(500).json({ error: 'Failed to delete logs' });
  }
});

// Endpoint to get unique instructors and last login (For Super Admin)
app.get('/api/instructors', verifyToken, async (req, res) => {
  try {
    if (!req.user.email || !SUPER_ADMINS.includes(req.user.email)) {
      return res.status(403).json({ error: 'Access Denied' });
    }

    // 1. Get all registered settings (instructors)
    const allSettings = await Settings.find().lean();

    // 2. Get last login timestamps from Logs
    const lastLogins = await Log.aggregate([
      { $match: { action: 'LOGIN' } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$instructorId",
          lastLogin: { $max: "$timestamp" }
        }
      }
    ]);
    
    // Create a map for quick lookup
    const loginMap = {};
    lastLogins.forEach(l => loginMap[l._id] = l.lastLogin);

    // 3. Merge Data
    const enrichedInstructors = await Promise.all(allSettings.map(async (setting) => {
      try {
        const userRecord = await admin.auth().getUser(setting.sponsorId);
        return { 
          instructorId: setting.sponsorId,
          email: setting.instructorEmail || 'Unknown',
          name: setting.instructorName || 'N/A',
          schoolName: setting.schoolName,
          lastLogin: loginMap[setting.sponsorId] || null,
          disabled: userRecord.disabled 
        };
      } catch (e) {
        return { 
          instructorId: setting.sponsorId,
          email: setting.instructorEmail || 'Unknown',
          name: setting.instructorName || 'N/A',
          schoolName: setting.schoolName,
          lastLogin: loginMap[setting.sponsorId] || null,
          disabled: null 
        };
      }
    }));

    // Sort by last login (recent first)
    enrichedInstructors.sort((a, b) => (b.lastLogin || 0) - (a.lastLogin || 0));

    res.json(enrichedInstructors);
  } catch (error) {
    console.error('Fetch instructors error:', error);
    res.status(500).json({ error: 'Failed to fetch instructors' });
  }
});

// Endpoint to toggle instructor ban status (For Super Admin)
app.post('/api/instructors/:uid/status', verifyToken, async (req, res) => {
  try {
    // Security Check
    if (!req.user.email || !SUPER_ADMINS.includes(req.user.email)) {
      return res.status(403).json({ error: 'Access Denied' });
    }

    const { uid } = req.params;
    const { disabled } = req.body; // true = ban, false = unban

    // Update Firebase Auth user
    await admin.auth().updateUser(uid, { disabled: disabled });

    // If banning, revoke refresh tokens to force logout
    if (disabled) {
      await admin.auth().revokeRefreshTokens(uid);
    }

    // Log the action
    await Log.create({
      instructorId: req.user.uid,
      instructorEmail: req.user.email || 'Unknown',
      instructorName: req.user.name || 'Unknown',
      action: disabled ? 'BAN_INSTRUCTOR' : 'UNBAN_INSTRUCTOR',
      details: `Target UID: ${uid}`
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Update instructor status error:', error);
    res.status(500).json({ error: 'Failed to update instructor status' });
  }
});

// Endpoint to permanently DELETE an instructor (For Super Admin)
app.delete('/api/instructors/:uid', verifyToken, async (req, res) => {
  try {
    // Security Check
    if (!req.user.email || !SUPER_ADMINS.includes(req.user.email)) {
      return res.status(403).json({ error: 'Access Denied' });
    }

    const { uid } = req.params;

    // 1. Delete from Firebase Auth
    await admin.auth().deleteUser(uid);

    // 2. Delete associated settings
    await Settings.findOneAndDelete({ sponsorId: uid });

    // 3. Log the action
    await Log.create({
      instructorId: req.user.uid,
      instructorEmail: req.user.email || 'Unknown',
      instructorName: req.user.name || 'Unknown',
      action: 'DELETE_INSTRUCTOR',
      details: `Permanently deleted instructor account and settings (Target UID: ${uid})`
    });

    res.json({ success: true, message: 'Instructor and associated settings deleted successfully.' });
  } catch (error) {
    console.error('Delete instructor error:', error);
    res.status(500).json({ error: 'Failed to delete instructor: ' + error.message });
  }
});

// Endpoint to generate password reset link (For Super Admin)
app.post('/api/instructors/:uid/reset-password', verifyToken, async (req, res) => {
  try {
    // Security Check
    if (!req.user.email || !SUPER_ADMINS.includes(req.user.email)) {
      return res.status(403).json({ error: 'Access Denied' });
    }

    const { uid } = req.params;
    const userRecord = await admin.auth().getUser(uid);
    const email = userRecord.email;

    const link = await admin.auth().generatePasswordResetLink(email);

    // --- Custom Password Reset Email Template ---
    const appName = "Emmanuel Suah Academy";
    const htmlTemplate = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #4f46e5; margin: 0;">${appName}</h2>
        </div>
        <div style="color: #333333; font-size: 16px; line-height: 1.5;">
          <p>Hello,</p>
          <p>We received a request to reset the password for your <strong>${email}</strong> account.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${link}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>
          <p>If you didn’t ask to reset your password, you can safely ignore this email.</p>
          <p>Thanks,<br>The ${appName} Team</p>
        </div>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #888; font-size: 12px;">
          <p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
        </div>
      </div>
    `;

    await transporter.sendMail({ from: process.env.EMAIL_USER, to: email, subject: `Reset your password for ${appName}`, html: htmlTemplate });

    // Log the action
    await Log.create({
      instructorId: req.user.uid,
      instructorEmail: req.user.email || 'Unknown',
      instructorName: req.user.name || 'Unknown',
      action: 'GENERATE_RESET_LINK',
      details: `Generated password reset link for ${email} (UID: ${uid})`
    });

    res.json({ success: true, message: 'Reset email sent successfully.', link });
  } catch (error) {
    console.error('Generate reset link error:', error);
    res.status(500).json({ error: 'Failed to generate reset link' });
  }
});

// Endpoint to BACKUP database (For Super Admin)
app.get('/api/backup', verifyToken, async (req, res) => {
  try {
    if (!req.user.email || !SUPER_ADMINS.includes(req.user.email)) {
      return res.status(403).json({ error: 'Access Denied' });
    }

    const students = await Student.find().lean();
    const settings = await Settings.find().lean();
    const logs = await Log.find().lean();

    const backupData = {
      timestamp: new Date(),
      version: "1.0",
      data: { students, settings, logs }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=backup-${new Date().toISOString().slice(0,10)}.json`);
    res.json(backupData);
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ error: 'Backup failed' });
  }
});

// Endpoint to RESTORE database (For Super Admin)
app.post('/api/restore', verifyToken, async (req, res) => {
  try {
    if (!req.user.email || !SUPER_ADMINS.includes(req.user.email)) {
      return res.status(403).json({ error: 'Access Denied' });
    }

    const { data } = req.body;
    if (!data || !data.students) {
      return res.status(400).json({ error: 'Invalid backup file format' });
    }

    // Restore Students (Upsert: Update if exists, Insert if new)
    if (data.students && data.students.length > 0) {
      const studentOps = data.students.map(s => ({
        replaceOne: { filter: { _id: s._id }, replacement: s, upsert: true }
      }));
      await Student.bulkWrite(studentOps);
    }

    // Restore Settings
    if (data.settings && data.settings.length > 0) {
      const settingsOps = data.settings.map(s => ({
        replaceOne: { filter: { _id: s._id }, replacement: s, upsert: true }
      }));
      await Settings.bulkWrite(settingsOps);
    }

    // Note: We typically don't restore logs to avoid overwriting history, 
    // but you can add logic here if needed.

    res.json({ success: true, message: `Restored ${data.students.length} student records.` });
  } catch (error) {
    console.error('Restore error:', error);
    res.status(500).json({ error: 'Restore failed: ' + error.message });
  }
});

// --- Scheduled Tasks ---


// Schedule a backup every Sunday at midnight (0 0 * * 0)
cron.schedule('0 0 * * 0', async () => {
  console.log('Starting scheduled weekly backup...');
  try {
    const students = await Student.find().lean();
    const settings = await Settings.find().lean();
    const logs = await Log.find().lean();

    const backupData = {
      timestamp: new Date(),
      version: "1.0",
      data: { students, settings, logs }
    };

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: SUPER_ADMINS.join(','),
      subject: `Weekly Backup - ${new Date().toDateString()}`,
      text: 'Attached is the automated weekly backup of your database.',
      attachments: [{
        filename: `backup-${new Date().toISOString().split('T')[0]}.json`,
        content: JSON.stringify(backupData, null, 2)
      }]
    };

    await transporter.sendMail(mailOptions);
    
    // Log the event
    await Log.create({
      action: 'SYSTEM_BACKUP',
      details: 'Weekly automated backup sent via email',
      userType: 'SYSTEM',
      instructorEmail: 'system@scheduler',
      instructorName: 'System'
    });
    console.log('Weekly backup email sent.');
  } catch (error) {
    console.error('Scheduled backup failed:', error);
  }
});

// --- 404 Handler for API Routes ---
// Prevent API 404s from falling through to the catch-all index.html handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
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

// Export the app for Vercel serverless deployment
module.exports = app;