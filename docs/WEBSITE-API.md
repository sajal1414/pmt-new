# Showing ATLAS courses on a website

ATLAS publishes its live course catalogue for the Hazdemy websites. You can either paste a ready-made course list (option 1), or build your own design on top of the API (option 2).

You need two things from the ATLAS admin (**ATLAS → Website API**):

- **The ATLAS address**, for example `https://courses.hazdemy.com`. It's written as `ATLAS` below.
- **A website key** (`atlas_pk_…`). It is tied to your website's address. Browsers on any other website are refused, so the key can safely appear in page source.

## Option 1: paste the course list (no coding)

Paste this where the courses should appear. In WordPress, use a **Custom HTML** block; in Wix or Webflow, use an **Embed** element.

```html
<div data-atlas-courses
     data-key="atlas_pk_..."
     data-theme="hazdemy"
     data-heading="Our courses"></div>
<script src="https://ATLAS/embed/courses.js" async></script>
```

The list includes search, platform and level filters, sorting, a details window with the course outline and a PDF download, and an "Ask about this course" form. It uses the website's own font and won't clash with the site's styles.

| Attribute | Values |
|---|---|
| `data-theme` | `hazdemy`, `navy`, `plain` |
| `data-accent` | Any CSS colour; overrides the theme colour |
| `data-mode` | `light` (default) or `dark` |
| `data-limit` | Courses per page (default 9) |
| `data-platform`, `data-vendor`, `data-product`, `data-level` | Show only these courses |
| `data-sort` | `name`, `rating`, `popular`, `newest`, `shortest`, `price`, `upcoming` (next batch first) |
| `data-client` | Show only the custom versions made for this client, e.g. `Acme Corp`. `data-custom="0"` shows only standard courses, `data-custom="1"` only custom versions. |
| `data-time-zone` | Zone for class times, e.g. `Asia/Kolkata`. By default each visitor sees their own time zone, and can switch zones in the course details. |
| `data-enroll-url` | Adds an Enroll button, e.g. `https://www.hazdemy.com/enroll?course={code}` (`{code}`, `{id}` and `{name}` are filled in) |
| `data-toolbar="off"` | Hides search, filters and sort |
| `data-enquiry="off"` | Hides the enquiry form |

**Single-page apps.** If the `<div>` is added after the page loads, call `window.AtlasCourses.mount(div)`.

**Tracking.** Listen for the `atlas:enquiry` event on the `<div>` to record form submissions in analytics.

## Option 2: the API

Send the key in an `X-API-Key` header or as `?key=`. Answers are JSON. Only published courses are returned.

| Request | Returns |
|---|---|
| `GET /api/v1/courses` | `{ total, limit, offset, items: [...] }`. Filters: `q`, `vendor`, `platform`, `product`, `portfolio`, `level`, `delivery`. `sort` is `name`, `rating`, `popular`, `newest`, `shortest`, `price` or `upcoming`. `scheduled=1` returns only courses with an upcoming batch. `custom=1` returns only custom (client) versions, `custom=0` only standard courses, and `client=Acme Corp` the versions for one client. Each course has `nextBatch`, plus `customFor` (the client, or empty) and `baseCourse` (`{ id, code, name }` of the original, or null). `limit` is at most 100, plus `offset`. |
| `GET /api/v1/courses/{id or code}` | One course with `description`, `objectives`, `topics`, `prerequisites` and `audience` (safe HTML), `outline` (`[{ day, title, minutes }]`), `instructors` and `schedule` (see below) |
| `GET /api/v1/courses/{id or code}/outline.pdf` | The outline as a PDF |
| `GET /api/v1/filters` | Vendors, platforms, products, levels and delivery types, with course counts |
| `POST /api/v1/enquiries` | JSON `{ name, email, phone?, company?, course?, message? }`. The enquiry appears in ATLAS → Website API. |

Example:

```bash
curl "https://ATLAS/api/v1/courses?platform=Data&sort=rating&limit=5" -H "X-API-Key: atlas_pk_..."
```

Each course in a list looks like this:

```json
{ "id": "c2364", "code": "HAZ-AT-008", "name": "IBM webMethods Integration v12.1 Developer",
  "vendor": "IBM", "platform": "Automation", "product": "webMethods Integration", "level": "Intermediate",
  "delivery": "ILT", "durationDays": 3, "hours": 24, "price": null, "currency": "USD",
  "rating": 5, "ratings": 1, "summary": "This 3-day, hands-on technical course…",
  "links": { "self": "https://ATLAS/api/v1/courses/c2364", "outlinePdf": "https://ATLAS/api/v1/courses/c2364/outline.pdf" } }
```

### Batches and time zones

Each entry in `schedule` (and `nextBatch`) gives the class times as set in the batch's own time zone, plus the first class in UTC. Use the UTC values to show the time in any other zone:

```json
{ "startDate": "2026-11-10", "endDate": "2026-11-12", "startTime": "09:00", "endTime": "17:00", "timeZone": "Asia/Kolkata",
  "times": "9:00 AM – 5:00 PM IST", "startUtc": "2026-11-10T03:30:00.000Z", "endUtc": "2026-11-10T11:30:00.000Z",
  "days": "Mon–Wed", "mode": "Virtual", "location": "Zoom", "seats": 12, "status": "Open" }
```

`status` is `Open`, `Few seats left` or `Full`. Cancelled and finished batches are left out.

### Errors and limits

| Status | Meaning |
|---|---|
| `401` | The key is missing, wrong or switched off |
| `403` | The page's website isn't on the key's list |
| `404` | The course isn't published |
| `422` | The form has a problem; `fields` holds a message for each field |
| `429` | Too many requests. The limits are 600 requests per 5 minutes per visitor, and 5 enquiries per 15 minutes. |
