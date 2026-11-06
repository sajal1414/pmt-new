/** Course Catalog PDF (grouped Vendor > Platform > Portfolio > Product). No ids = every course. */
export async function downloadCatalog({ ids, title = 'Hazdemy Course Catalog', subtitle = '', fields, format = 'pdf', platformOrder } = {}) {
  const res = await fetch('/api/courses/catalog-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, title, subtitle, fields, format, platformOrder }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'The catalog could not be created.');
  const url = URL.createObjectURL(await res.blob()), a = document.createElement('a');
  a.href = url; a.download = `${title || 'Course Catalog'}.${format === 'xlsx' ? 'xlsx' : 'pdf'}`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Course PDFs: one opens the single PDF, several come back as one ZIP from the server.
// `fields`: what to show (see CoursePdfDialog); left out = everything.
export async function downloadCoursePdfs(ids, fields) {
  if (ids.length === 1) { window.location.href = `/api/courses/${ids[0]}/pdf` + (fields ? `?fields=${encodeURIComponent(fields.join(','))}` : ''); return 1; }
  const res = await fetch('/api/courses/pdf-zip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, fields }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'The download didn’t work. Try again.');
  const url = URL.createObjectURL(await res.blob()), a = document.createElement('a');
  a.href = url; a.download = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'atlas-courses.zip';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  return ids.length;
}
