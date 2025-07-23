import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 10000;
const LOG_FILE = path.resolve('./call-logs.json');

app.use(cors());
app.use(express.json());

// Load call logs from file if exists
let callLogs = [];
if (fs.existsSync(LOG_FILE)) {
  try {
    const data = fs.readFileSync(LOG_FILE, 'utf-8');
    callLogs = JSON.parse(data);
  } catch (err) {
    console.error('Failed to read call-logs.json:', err);
    callLogs = [];
  }
}

// POST: Log a call
app.post('/api/call-logs', (req, res) => {
  const { userId, flight, type, timestamp } = req.body;

  if (!userId || !flight || !type || !timestamp) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const entry = { userId, flight, type, timestamp };
  callLogs.push(entry);

  // Save logs to file
  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(callLogs, null, 2));
    res.status(200).json({ message: 'Call logged successfully' });
  } catch (err) {
    console.error('Failed to write to call-logs.json:', err);
    res.status(500).json({ error: 'Failed to save log' });
  }
});

// (Optional) GET: View call logs (with auth token)
app.get('/api/call-logs', (req, res) => {
  const auth = req.headers['authorization'];
  const token = auth?.split(' ')[1];

  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  res.json(callLogs);
});

// Start the server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
