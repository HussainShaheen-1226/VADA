const express = require('express');
const cors = require('cors');
const { ApifyClient } = require('apify-client');
require('dotenv').config();

const app = express();
app.use(cors());

const PORT = process.env.PORT || 5000;

// Apify credentials from environment
const apifyToken = process.env.APIFY_API_TOKEN;
const datasetId = '260tNnfgDuuU56iLl';

const client = new ApifyClient({ token: apifyToken });

app.get('/api/flights', async (req, res) => {
  try {
    const { items } = await client.dataset(datasetId).listItems();
    res.json(items);
  } catch (error) {
    console.error('Error fetching flight data:', error.message);
    res.status(500).json({ error: 'Failed to fetch flight data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
