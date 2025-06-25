// Import necessary packages
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb'); // Import ObjectId
require('dotenv').config();
const fetch = require('node-fetch'); // Required to make HTTP requests to the holiday API

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
    res.sendFile(__dirname + '/index.html'); // Corrected path for Render.com
});

let db;
let teamMembersCollection;
let timeOffCollection;
let onCallCollection;

// Connect to MongoDB
async function connectDB() {
    try {
        const client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db("timeOffDB"); // Use your database name
        teamMembersCollection = db.collection("teamMembers");
        timeOffCollection = db.collection("timeOffEntries");
        onCallCollection = db.collection("onCallRotation");
        console.log("Successfully connected to MongoDB.");
    } catch (err) {
        console.error("Failed to connect to MongoDB", err);
        process.exit(1);
    }
}

// ---- API Endpoints ----

// --- Team Member and Time-Off endpoints ---
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


// --- ON-CALL ENDPOINTS ---

// GET the on-call rotation data
app.get('/api/oncall', async (req, res) => {
    try {
        const rotation = await onCallCollection.findOne({ scheduleName: "main" });
        if (rotation) {
            res.json(rotation.rotationData || {});
        } else {
            res.json({});
        }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST (update) the on-call rotation data
app.post('/api/oncall', async (req, res) => {
    try {
        const rotationData = req.body;
        await onCallCollection.updateOne(
            { scheduleName: "main" },
            { $set: { rotationData: rotationData } },
            { upsert: true }
        );
        res.status(200).json({ message: 'On-call schedule saved successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- NEW PUBLIC HOLIDAYS ENDPOINT ---
app.get('/api/holidays/:year', async (req, res) => {
    const { year } = req.params;
    const countries = ['SK', 'NO', 'DK']; // Slovakia, Norway, Denmark
    const holidayPromises = countries.map(countryCode => 
        fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch holidays for ${countryCode}`);
                }
                return response.json();
            })
    );

    try {
        const allHolidaysArrays = await Promise.all(holidayPromises);
        // The result is an array of arrays, so we flatten it into a single array
        const flattenedHolidays = allHolidaysArrays.flat();
        res.json(flattenedHolidays);
    } catch (error) {
        console.error('Failed to fetch public holidays:', error);
        res.status(500).json({ message: 'Failed to fetch public holidays' });
    }
});


// Start the server
connectDB().then(() => {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
});