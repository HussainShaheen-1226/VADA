const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

app.get('/api/flights', async (req, res) => {
  try {
    const response = await axios.get(
      'https://www.fis.com.mv/index.php?Submit=+UPDATE+&webfids_airline=ALL&webfids_domesticinternational=D&webfids_lang=1&webfids_passengercargo=passenger&webfids_type=arrivals&webfids_waypoint=ALL',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      }
    );

    const $ = cheerio.load(response.data);
    const rows = $('tr.schedulerow, tr.schedulerowtwo');
    console.log(`Found ${rows.length} rows`);

    const flights = [];

    rows.each((i, row) => {
      const cols = $(row).find('td');
      const colTexts = cols.map((i, el) => $(el).text().trim()).get();
      console.log(`Row ${i} columns:`, colTexts);

      if (colTexts.length >= 6) {
        const flight = colTexts[0];         // adjust index if flight number isn't here
        const from = colTexts[1];
        const time = colTexts[2];
        const estm = colTexts[3];
        const status = colTexts[4];

        if (
          flight.startsWith('Q2') ||
          flight.startsWith('NR') ||
          flight.startsWith('VP')
        ) {
          flights.push({ flight, from, time, estm, status });
        }
      }
    });

    console.log(`Filtered ${flights.length} domestic flights`);
    res.json(flights);
  } catch (error) {
    console.error('Error fetching flight data:', error.message);
    res.status(500).json({ error: 'Failed to fetch flight data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
