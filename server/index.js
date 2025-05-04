const express = require('express');
const cors = require('cors');
const { Actor } = require('apify-client');

const app = express();
const PORT = process.env.PORT || 5000;

const apifyToken = 'apify_api_rgV4vIweNtC8dbiT9EwHpPU6TBo8M10hS8xa';
const actorId = 'hussainshaheen-1226~vada-fis-scraping';

app.use(cors());

app.get('/api/flights', async (req, res) => {
  try {
    const client = new Actor({ token: apifyToken });

    // Run the actor
    const run = await client.actor(actorId).call();
    const { defaultDatasetId } = run;

    // Fetch dataset items
    const datasetItems = await client.dataset(defaultDatasetId).listItems();

    res.json(datasetItems.items);
  } catch (error) {
    console.error('Failed to fetch flight data:', error.message);
    res.status(500).json({ error: 'Failed to fetch flight data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
