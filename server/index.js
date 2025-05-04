const express = require('express');
const cors = require('cors');
const { Actor } = require('apify-client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Your environment variable should be set in Render as APIFY_TOKEN
const apifyToken = process.env.APIFY_TOKEN;

// Make sure this matches your Apify actor ID exactly
const actorId = 'hussainshaheen-1226/vada-flight-scraper';

app.use(cors());

app.get('/api/flights', async (req, res) => {
  try {
    const client = new Actor({ token: apifyToken });

    // Start the actor and wait for it to finish
    const run = await client.actor(actorId).call();

    // Retrieve the results from the dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    res.json(items);
  } catch (error) {
    console.error('Error fetching flight data:', error.message);
    res.status(500).json({ error: 'Failed to fetch flight data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
