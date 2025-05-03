const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());

app.get('/api/flights', async (req, res) => {
  try {
    const url =
      'https://www.fis.com.mv/index.php?Submit=+UPDATE+&webfids_airline=ALL&webfids_domesticinternational=D&webfids_lang=1&webfids_passengercargo=passenger&webfids_type=arrivals&webfids_waypoint=ALL';

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    const $ = cheerio.load(response.data);
    const rows = $('tr.schedulerow, tr.schedulerowtwo');
    console.log(`Found ${rows.length} rows`);

    const flights = [];

    rows.each((i, row) => {
      const cols = $(row).find('td');

      const flight = $(cols[0]).text().trim();
      const from = $(cols[1]).text().trim();
      const time = $(cols[2]).text().trim();
      const estm = $(cols[3]).text().trim();
      const status = $(cols[4]).text().trim();

      if (flight.startsWith('Q2') || flight.startsWith('NR') || flight.startsWith('VP')) {
        const flightData = { flight, from, time, estm, status };
        flights.push(flightData);
        console.log('Parsed Flight:', flightData);
      }
    });

    console.log(`Filtered ${flights.length} domestic flights`);
    res.json(flights);
  } catch (error) {
    console.error('Scraping failed:', error.message);
    res.status(500).json({ error: 'Failed to fetch flight data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
