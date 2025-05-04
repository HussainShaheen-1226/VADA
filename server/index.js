const express = require('express');
const cors = require('cors');
const { Actor } = require('apify-client');

const app = express();
const PORT = process.env.PORT || 5000;

// Apify setup
const apifyToken = process.env.APIFY_TOKEN;
const actorId = 'hussainshaheen-1226~vada-fis-scraping';

app.use(cors());

app.get('/api/flights', async (req, res) => {
  try {
    const client = new Actor({ token: apifyToken });
    const run = await client.actor(actorId).call();
    const { defaultDatasetId } = run;

    const datasetItems = await client.dataset(defaultDatasetId).listItems();
    res.json(datasetItems.items);
  } catch (err) {
    console.error('Failed to fetch flight data:', err.message);
    res.status(500).json({ error: 'Failed to fetch flight data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
