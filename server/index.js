import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const LOG_FILE = path.resolve('./call-logs.json');
const FLIGHTS_FILE = path.resolve('./flights.json');

// Middleware
app.use(cors());
app.use(express.json());

// Load logs if file exists
let callLogs = [];
if (fs.existsSync(LOG_FILE)) {
  try {
    callLogs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  } catch (err) {
    console.error('❌ Error loading call logs:', err);
    callLogs = [];
  }
}

// GET: Serve scraped flight data
app.get('/flights', (req, res) => {
  try {
    const data = fs.readFileSync(FLIGHTS_FILE, 'utf-8');
    res.json(JSON.parse(data));
  } catch (err) {
    console.error('❌ Failed to read flights.json:', err);
    res.status(500).json({ error: 'Failed to load flights' });
  }
});

// POST: Log a call (SS or BUS)
app.post('/api/call-logs', (req, res) => {
  const { userId, flight, type, timestamp } = req.body;

  if (!userId || !flight || !type || !timestamp) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const entry = { userId, flight, type, timestamp };
  callLogs.push(entry);

  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(callLogs, null, 2));
    res.status(200).json({ message: 'Call logged successfully' });
  } catch (err) {
    console.error('❌ Failed to save call log:', err);
    res.status(500).json({ error: 'Failed to save log' });
  }
});

// GET: View call logs (requires token)
app.get('/api/call-logs', (req, res) => {
  const auth = req.headers['authorization'];
  const token = auth?.split(' ')[1];

  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  res.json(callLogs);
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
