// Import necessary packages
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb'); // Import ObjectId
require('dotenv').config();

// Configuration
const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGO_URI;

// Check if MONGO_URI is set
if (!mongoUri) {
    console.error("FATAL ERROR: MONGO_URI is not defined. Please create a .env file.");
    process.exit(1);
}

// Middleware
app.use(express.json()); // To parse JSON bodies
app.use(express.static('public')); // Serve static files like CSS or client-side JS from a 'public' folder
app.get('/', (req, res) => { // Serve the main HTML file
    res.sendFile(__dirname + '/public/index.html');
});

let db;
let teamMembersCollection;
let timeOffCollection;

// Connect to MongoDB
async function connectDB() {
    try {
        const client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db("timeOffDB"); // Use your database name
        teamMembersCollection = db.collection("teamMembers");
        timeOffCollection = db.collection("timeOffEntries");
        console.log("Successfully connected to MongoDB.");
    } catch (err) {
        console.error("Failed to connect to MongoDB", err);
        process.exit(1);
    }
}

// ---- API Endpoints ----

// GET all team members
app.get('/api/members', async (req, res) => {
    try {
        const members = await teamMembersCollection.find().sort({ name: 1 }).toArray();
        res.json(members);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST a new team member
app.post('/api/members', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ message: 'Name is required' });

        const lastMember = await teamMembersCollection.find().sort({ id: -1 }).limit(1).toArray();
        const nextId = lastMember.length > 0 ? (lastMember[0].id || 0) + 1 : 1;
        
        const newMember = { id: nextId, name };
        await teamMembersCollection.insertOne(newMember);
        res.status(201).json(newMember);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE a team member (and their time off)
app.delete('/api/members/:id', async (req, res) => {
    try {
        const memberId = parseInt(req.params.id);
        await teamMembersCollection.deleteOne({ id: memberId });
        await timeOffCollection.deleteMany({ memberId: memberId });
        res.status(200).json({ message: 'Member and their entries deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET all time-off entries
app.get('/api/timeoff', async (req, res) => {
    try {
        const entries = await timeOffCollection.find().sort({ startDate: -1 }).toArray();
        res.json(entries);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST a new time-off entry
app.post('/api/timeoff', async (req, res) => {
    try {
        const { memberId, type, startDate, endDate, notes } = req.body;

        const lastEntry = await timeOffCollection.find().sort({ id: -1 }).limit(1).toArray();
        const nextId = lastEntry.length > 0 ? (lastEntry[0].id || 0) + 1 : 1;

        const newEntry = { id: nextId, memberId, type, startDate, endDate, notes };
        await timeOffCollection.insertOne(newEntry);
        res.status(201).json(newEntry);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE a time-off entry
app.delete('/api/timeoff/:id', async (req, res) => {
    try {
        await timeOffCollection.deleteOne({ id: parseInt(req.params.id) });
        res.status(200).json({ message: 'Time off entry deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// Start the server
connectDB().then(() => {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
});