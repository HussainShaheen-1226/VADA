const express = require('express');
const cors = require('cors');
const { Actor } = require('apify-client');

const app = express();
const PORT = process.env.PORT || 5000;

// Use the token from environment variable
const apifyToken = process.env.APIFY_API_TOKEN;
const actorId = 'hussainshaheen-1226~vada-fis-scraping';

app.use(cors());

app.get('/api/flights', async (req, res) => {
  try {
    const client = new Actor({ token: apifyToken });

    // Run the actor
    const run = await client.actor(actorId).call();
    const { defaultDatasetId } = run;

    // Fetch items from the dataset
    const { items } = await client.dataset(defaultDatasetId).listItems();

    res.json(items);
  } catch (error) {
    console.error('Apify error:', error);  // Log full error for debugging
    res.status(500).json({ error: "Failed to fetch flight data" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
