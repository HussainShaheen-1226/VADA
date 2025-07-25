# VADA
An arrival tracker for the domestic department
# VADA Backend

This is the backend for the VADA (Velana Airport Domestic Assistance) flight call logging system.

## Features

- Logs call button presses (SS and BUS) along with timestamp and user ID.
- Secured access to view logs via token.
- Persistent storage using `call-logs.json`.

## Endpoints

### `POST /api/call-logs`

Logs a call.

**Request body:**

```json
{
  "userId": "user123",
  "flight": "Q2703",
  "type": "ss",
  "timestamp": "2025-07-24T12:34:56.000Z"
}
