const express = require('express');
const cors = require('cors');
const { Actor } = require('apify-client');

const app = express();
const PORT = process.env.PORT || 5000;

// Load your Apify API token from environment variables
const apifyToken = process.env.APIFY_TOKEN;
const actorId = 'hussainshaheen-1226~vada-flight-scraper';

app.use(cors());

app.get('/api/flights', async (req, res) => {
  try {
    const client = new Actor({ token: apifyToken });

    // Call your Apify actor
    const run = await client.actor(actorId).call();
    const { defaultDatasetId } = run;

    // Fetch dataset items
    const { items } = await client.dataset(defaultDatasetId).listItems();
    res.json(items);
  } catch (error) {
    console.error('Error fetching flight data:', error.message);
    res.status(500).json({ error: 'Failed to fetch flight data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
