import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { scrapeFlights } from './scraper.js';

const app = express();
const PORT = process.env.PORT || 10000;
const LOG_FILE = path.resolve('./call-logs.json');
const DATA_FILE = path.resolve('./flight-data.json');

app.use(cors());
app.use(express.json());

let callLogs = [];
if (fs.existsSync(LOG_FILE)) {
  try {
    callLogs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  } catch (err) {
    console.error('Error loading call logs:', err);
    callLogs = [];
  }
}

// Flight data API
app.get('/flights', (req, res) => {
  if (!fs.existsSync(DATA_FILE)) return res.json([]);
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load flights' });
  }
});

// Log call with userId
app.post('/api/call-logs', (req, res) => {
  const { userId, flight, type, timestamp } = req.body;

  if (!userId || !flight || !type || !timestamp) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const logEntry = { userId, flight, type, timestamp };
  callLogs.push(logEntry);

  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(callLogs, null, 2));
    res.status(200).json({ message: 'Call logged successfully' });
  } catch (err) {
    console.error('Error saving call log:', err);
    res.status(500).json({ error: 'Failed to save log' });
  }
});

// Admin token access to call logs
app.get('/api/call-logs', (req, res) => {
  const auth = req.headers['authorization'];
  const token = auth?.split(' ')[1];

  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  res.json(callLogs);
});

// Start scraper on interval
scrapeFlights(); // initial
setInterval(scrapeFlights, 60 * 1000); // every minute

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
