const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

const APIFY_TOKEN = 'apify_api_rgV4vIweNtC8dbiT9EwHpPU6TBo8M10hS8xa';
const TASK_ID = 'hussainshaheen-1226/vada-fis-scraping';

app.use(cors());

app.get('/api/flights', async (req, res) => {
  try {
    const response = await axios.post(
      `https://api.apify.com/v2/actor-tasks/${TASK_ID}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`
    );

    const data = response.data;
    res.json(data);
  } catch (error) {
    console.error('Apify fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch flight data from Apify' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
