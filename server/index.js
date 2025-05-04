const express = require('express');
const cors = require('cors');
const { ApifyClient } = require('apify-client');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize the ApifyClient with your API token
const client = new ApifyClient({
  token: 'apify_api_rgV4vIweNtC8dbiT9EwHpPU6TBo8M10hS8xa',
});

app.use(cors());

app.get('/api/flights', async (req, res) => {
  try {
    // Run your actor and wait for it to finish
    const { defaultDatasetId } = await client.actor('hussainshaheen-1226/vada-fis-scraping').call();

    // Fetch the dataset items
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
