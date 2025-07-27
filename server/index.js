const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Load flights.json
const flightsPath = path.join(__dirname, 'flights.json');
let flights = [];

try {
  const data = fs.readFileSync(flightsPath, 'utf-8');
  flights = JSON.parse(data);
} catch (error) {
  console.error('Error reading flights.json:', error.message);
}

// Routes
app.get('/', (req, res) => {
  res.send('VADA Backend Running');
});

app.get('/flights', (req, res) => {
  res.json(flights);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
