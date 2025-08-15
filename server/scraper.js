// Selector-agnostic text parser for Velana FIDS pages.

export function extractUpdatedLT(text) {
  const m = text.match(/Updated:\s*([^\n]+?)\s*LT/i);
  return m ? m[1].trim() : null;
}

export function parseFlightsFromText(txt) {
  // Normalize whitespace and NBSPs
  const norm = String(txt || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

  // Split on newlines conservatively
  const lines = norm.split(/\n+/).map(s => s.trim()).filter(Boolean);

  // Pattern A: terminal on the same line
  const lineA = /^([A-Z0-9]{1,3})\s*([0-9]{2,4}[A-Z]?)\s+(.+?)\s+(\d{1,2}:\d{2})(?:\s+(\d{1,2}:\d{2}))?\s+(DOM|T\d)\s*(.*)$/i;

  // Pattern B: terminal might be missing here; could appear in tail/next line
  const lineB = /^([A-Z0-9]{1,3})\s*([0-9]{2,4}[A-Z]?)\s+(.+?)\s+(\d{1,2}:\d{2})(?:\s+(\d{1,2}:\d{2}))?\s*(.*)$/i;

  const statusWord = /(LANDED|DELAYED|FINAL CALL|GATE CLOSED|BOARDING|DEPARTED|CANCELLED|ON TIME|SCHEDULED|ESTIMATED)/i;
  const terminalWord = /(DOMESTIC|DOM|T1|T2)/i;

  const flights = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let airline, number, place, sched, est, terminal, tail = '';

    let m = l.match(lineA);
    if (m) {
      [, airline, number, place, sched, est, terminal, tail] = m;
    } else {
      m = l.match(lineB);
      if (!m) continue;
      [, airline, number, place, sched, est, tail] = m;

      // Try to infer terminal from tail or next line
      const tailTerm = tail && tail.match(terminalWord);
      if (tailTerm) terminal = tailTerm[1].toUpperCase().replace('DOMESTIC', 'DOM');
      else if (lines[i + 1]) {
        const nextTerm = lines[i + 1].match(terminalWord);
        terminal = nextTerm ? nextTerm[1].toUpperCase().replace('DOMESTIC', 'DOM') : null;
      }
    }

    airline = airline?.toUpperCase();
    number = number?.toUpperCase();
    terminal = terminal ? terminal.toUpperCase() : null;

    // Status may be on tail or next line
    let status = null;
    if (tail && statusWord.test(tail)) {
      status = tail.match(statusWord)[1].toUpperCase();
    } else if (lines[i + 1] && statusWord.test(lines[i + 1])) {
      status = lines[i + 1].match(statusWord)[1].toUpperCase();
    }

    // Require terminal to be present
    if (!terminal || !airline || !number) continue;

    flights.push({
      airline,
      flightNo: `${airline} ${number}`,
      origin_or_destination: place.trim(),
      scheduled: sched,
      estimated: est || null,
      terminal,
      isDomestic: terminal === 'DOM',
      status
    });
  }

  return { updatedLT: extractUpdatedLT(norm), flights };
}
