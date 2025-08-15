document.addEventListener("DOMContentLoaded", () => {
    const flightsContainer = document.getElementById("flights-container");
    const loading = document.getElementById("loading");

    async function fetchFlights() {
        try {
            loading.style.display = "block";
            flightsContainer.innerHTML = "";

            const res = await fetch("https://vada-2db9.onrender.com/flights");
            const flights = await res.json();

            loading.style.display = "none";

            if (!flights.length) {
                flightsContainer.innerHTML = "<p>No flights available at the moment.</p>";
                return;
            }

            let tableHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Flight</th>
                            <th>From</th>
                            <th>Scheduled</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            flights.forEach(flight => {
                tableHTML += `
                    <tr>
                        <td>${flight.flightNumber || "-"}</td>
                        <td>${flight.origin || "-"}</td>
                        <td>${flight.scheduled || "-"}</td>
                        <td>${flight.status || "-"}</td>
                        <td>
                            <button>SS</button>
                            <button>BUS</button>
                        </td>
                    </tr>
                `;
            });

            tableHTML += `</tbody></table>`;
            flightsContainer.innerHTML = tableHTML;

        } catch (error) {
            console.error("Error fetching flights:", error);
            loading.style.display = "none";
            flightsContainer.innerHTML = "<p>Failed to load flight data.</p>";
        }
    }

    fetchFlights();
    setInterval(fetchFlights, 60000); // refresh every 60 seconds
});
