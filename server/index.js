import express from 'express';
import cors from 'cors';
import flights from './flights.json' assert { type: 'json' };

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check root route
app.get('/', (req, res) => {
  res.send('✅ VADA Backend is running!');
});

// API route for flights
app.get('/api/flights', (req, res) => {
  res.json(flights);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
