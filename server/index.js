const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

app.get('/api/flights', async (req, res) => {
  try {
    const response = await axios.get('https://www.fis.com.mv/fis/arrival.aspx?type=dom');
    const $ = cheerio.load(response.data);
    const rows = $('tr.schedulerow, tr.schedulerowtwo');
    const flights = [];

    rows.each((i, row) => {
      const cols = $(row).find('td');
      if (cols.length >= 5) {
        const flight = $(cols[0]).text().trim();
        const from = $(cols[1]).text().trim();
        const time = $(cols[2]).text().trim();
        const estm = $(cols[3]).text().trim();
        const status = $(cols[4]).text().trim();

        // Filter for Q2, NR, or VP flights
        if (flight.startsWith('Q2') || flight.startsWith('NR') || flight.startsWith('VP')) {
          flights.push({ flight, from, time, estm, status });
        }
      }
    });

    res.json(flights);
  } catch (error) {
    console.error('Error fetching flight data:', error.message);
    res.status(500).json({ error: 'Failed to fetch flight data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
