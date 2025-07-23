import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 10000;
const LOG_FILE = path.resolve('./call-logs.json');

app.use(cors());
app.use(express.json());

// Load logs from file if exists
let callLogs = [];
if (fs.existsSync(LOG_FILE)) {
  try {
    callLogs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  } catch (err) {
    console.error('Error loading call logs:', err);
    callLogs = [];
  }
}

// POST: Log a call
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

// GET: View call logs (with token auth)
app.get('/api/call-logs', (req, res) => {
  const auth = req.headers['authorization'];
  const token = auth?.split(' ')[1];

  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  res.json(callLogs);
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
