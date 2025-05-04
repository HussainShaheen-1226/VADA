const express = require('express');
const cors = require('cors');
const { Actor } = require('apify-client');

const app = express();
const PORT = process.env.PORT || 5000;

// Replace this with your actual Apify API token
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
    const items = await client.dataset(defaultDatasetId).listItems();

    res.json(items.items);
  } catch (error) {
    console.error('Error fetching data from Apify:', error.message);
    res.status(500).json({ error: 'Failed to fetch flight data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
