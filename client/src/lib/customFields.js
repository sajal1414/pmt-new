import { useEffect, useState } from 'react';
import { api } from '../api.js';

/**
 * Fields an admin added, for example from a new spreadsheet column at import: { courses: [{ key, label }], instructors: [...] }.
 * Their values are kept in each record's `extra` object. `bump` reloads after a change.
 */
export function useCustomFields() {
  const [fields, setFields] = useState({ courses: [], instructors: [] });
  const [n, setN] = useState(0);
  useEffect(() => { let on = true; api.get('/api/custom-fields').then((f) => { if (on) setFields(f); }, () => {}); return () => { on = false; }; }, [n]);
  return { ...fields, bump: () => setN((x) => x + 1) };
}
