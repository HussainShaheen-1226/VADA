import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

const LOG_FILE = path.resolve('./server/call-logs.json');
const FLIGHTS_FILE = path.resolve('./server/flights.json');

app.use(cors());
app.use(express.json());

let callLogs = [];
if (fs.existsSync(LOG_FILE)) {
  try {
    callLogs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  } catch {
    callLogs = [];
  }
}

app.get('/api/flights', (req, res) => {
  try {
    const flights = JSON.parse(fs.readFileSync(FLIGHTS_FILE, 'utf-8'));
    res.json(flights);
  } catch {
    res.status(500).json({ error: 'Unable to load flight data' });
  }
});

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
  } catch {
    res.status(500).json({ error: 'Failed to save call log' });
  }
});

app.get('/api/call-logs', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  res.json(callLogs);
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
