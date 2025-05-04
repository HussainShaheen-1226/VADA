const express = require('express');
const cors = require('cors');
const { Actor } = require('apify-client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

const apifyToken = process.env.APIFY_API_TOKEN;
const actorId = 'hussainshaheen-1226/vada-flight-scraper';

app.get('/api/flights', async (req, res) => {
  try {
    const client = new Actor({ token: apifyToken });

    // Run the actor
    const run = await client.actor(actorId).call();

    // Get dataset ID and fetch the data
    const { defaultDatasetId } = run;
    const datasetItems = await client.dataset(defaultDatasetId).listItems();

    res.json(datasetItems.items);
  } catch (error) {
    console.error('Error fetching flight data:', error.message);
    res.status(500).json({ error: 'Failed to fetch flight data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
