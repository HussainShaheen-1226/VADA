document.addEventListener('DOMContentLoaded', () => {
  const userIdKey = 'vadaUserId';
  const saved = localStorage.getItem(userIdKey);
  const twoWeeks = 1000 * 60 * 60 * 24 * 14;

  if (!saved || (Date.now() - JSON.parse(saved).timestamp) > twoWeeks) {
    const userId = prompt("Please enter your user ID:");
    if (userId) {
      localStorage.setItem(userIdKey, JSON.stringify({ id: userId, timestamp: Date.now() }));
    }
  }

  const userId = JSON.parse(localStorage.getItem(userIdKey))?.id;

  document.querySelectorAll('.call-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const flight = button.dataset.flight;
      const type = button.dataset.type;

      const timestamp = new Date().toISOString();

      if (userId) {
        // Show user log
        const logText = document.createElement('span');
        logText.style.fontSize = '0.75em';
        logText.style.marginLeft = '8px';
        logText.innerText = `⏱️ ${new Date().toLocaleTimeString()} (You: ${userId})`;
        button.parentElement.appendChild(logText);

        // Save to backend
        await fetch('https://vada-2db9.onrender.com/api/call-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, flight, type, timestamp })
        });
      }
    });
  });
});
