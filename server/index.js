const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

// TEST ROUTE to check if fis.com.mv is reachable
app.get('/test-fis', async (req, res) => {
  try {
    const response = await axios.get('https://www.fis.com.mv/');
    res.send(`Success! Status code: ${response.status}`);
  } catch (error) {
    console.error('Failed to fetch fis.com.mv:', error.message);
    res.status(500).send(`Fetch failed: ${error.message}`);
  }
});

// MAIN FLIGHT DATA ROUTE
app.get('/api/flights', async (req, res) => {
  try {
    const { data } = await axios.get('https://www.fis.com.mv/');
    const $ = cheerio.load(data);

    const flights = [];

    $('tr.schedulerow').each((i, el) => {
      const tds = $(el).find('td');

      const flight = $(tds[1]).text().trim();
      const from = $(tds[2]).text().trim();
      const time = $(tds[3]).text().trim();
      const estm = $(tds[4]).text().trim();

      const statusBg = $(tds[5]).attr('bgcolor');
      let status = '—';

      if (statusBg === '#168aad') status = 'LANDED';
      else if (statusBg === '#f4a460') status = 'DELAYED';
      else if (statusBg === '#ff0000') status = 'CANCELLED';

      if (flight.startsWith('Q2')) {
        flights.push({ time, flight, from, estm, status });
      }
    });

    res.json(flights);
  } catch (err) {
    console.error('Flight data fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch flight data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
