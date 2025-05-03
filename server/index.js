const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

app.get('/api/flights', async (req, res) => {
  try {
    const response = await axios.get('https://www.fis.com.mv/flight-info/arrival-info.aspx');
    const $ = cheerio.load(response.data);
    const rows = $('tr.schedulerow, tr.schedulerowtwo');

    const flights = [];

    rows.each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 6) {
        const flightCode = $(cells[1]).text().trim();
        const from = $(cells[2]).text().trim();
        const time = $(cells[3]).text().trim();
        const estm = $(cells[4]).text().trim();
        const statusCell = $(cells[5]);

        const bgcolor = statusCell.attr('bgcolor') || '';
        let status = '';

        // Infer status from bgcolor
        if (bgcolor.toLowerCase() === '#168aad') status = 'LANDED';
        else if (bgcolor.toLowerCase() === '#f4a261') status = 'DELAYED';
        else if (bgcolor.toLowerCase() === '#e63946') status = 'CANCELLED';

        // Only include Q2 flights (domestic)
        if (flightCode.startsWith('Q2')) {
          flights.push({
            flight: flightCode,
            from,
            time,
            estm,
            status
          });
        }
      }
    });

    res.json(flights);
  } catch (error) {
    console.error('Error scraping flight data:', error);
    res.status(500).json({ error: 'Failed to fetch flight data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
