const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

app.get('/api/flights', async (req, res) => {
  try {
    const { data } = await axios.get('https://www.fis.com.mv/');
    const $ = cheerio.load(data);
    const flights = [];

    $('table tr').each((i, row) => {
      const cols = $(row).find('td').map((i, el) => $(el).text().trim()).get();
      const flightNum = cols[1];

      // Correct order: [TIME, FLIGHT, FROM, ESTM, STATUS]
      if (flightNum && (flightNum.startsWith('NR') || flightNum.startsWith('Q2') || flightNum.startsWith('VP'))) {
        flights.push({
          time: cols[0],        // Scheduled Time
          flight: flightNum,    // Flight Number
          from: cols[2],        // From
          estm: cols[3],        // Estimated Time
          status: cols[4],      // Status like LANDED, DELAYED
        });
      }
    });

    res.json(flights);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch flight data' });
  }
});

app.listen(PORT, () => console.log(`VADA backend running on port ${PORT}`));
