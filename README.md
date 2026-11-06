# Hazdemy: local React + Node.js project

The Hazdemy learning-services app as a real project you run on your own computer:

- **client/**: React 18 app built with Vite (pages, components, styling)
- **server/**: Node.js + Express REST API that stores data in a JSON file and imports Excel/CSV

---

## 1. Install the tools (one time)

| Tool | Why | Get it |
|---|---|---|
| **Node.js 20 LTS or newer** (includes npm) | Runs the server and builds the React app | https://nodejs.org → "LTS" installer |
| **VS Code** (recommended) | Editor with a built-in terminal | https://code.visualstudio.com |
| Git (optional) | Version control | https://git-scm.com |

Check Node is installed. Open a terminal (Windows: **PowerShell**, Mac: **Terminal**) and run:

```bash
node -v    # should print v20.x or higher
npm -v
```

## 2. Open the project

1. Unzip `nfolks-atlas.zip` somewhere easy, for example `C:\Projects\nfolks-atlas` or `~/Projects/nfolks-atlas`.
2. In VS Code: **File → Open Folder…** and pick that folder.
3. Open the terminal in VS Code: **Terminal → New Terminal**.

## 3. Install dependencies (one time)

From the project folder (the one with this README):

```bash
npm run setup
```

This installs packages for the root, `server/` and `client/`. It takes a minute or two.

## 4. Run it in development

```bash
npm run dev
```

This starts two processes side by side:

- **api**: the Node server on http://localhost:4000
- **web**: the React dev server on http://localhost:5173

Open **http://localhost:5173** in your browser. Edits you make to files in `client/src` show up instantly; edits to `server/src` restart the API automatically.

Stop everything with **Ctrl + C** in the terminal.

**Signing in:** the first time, sign in as `admin@hazdemy.example` with password `atlas-admin` (set `ATLAS_ADMIN_PASSWORD` to change that default). You'll be asked to choose your own password straight away. Users an admin creates sign in with their temporary password and set their own the same way. Only admins see the **Users** page and **Reset sample data**. Sessions last 12 hours and are signed with a key stored in `server/data/session.key`.

## 5. Load your real data

1. Go to **Courses → Bulk import**.
2. Choose your Excel file (for example `Hazdemy_Learning_Services_Course_Inventory.xlsx`).
3. Tick **Replace all existing courses with this file** to swap the sample courses for your inventory.
4. Click **Replace with … courses**.

Workbooks can also contain a **Lessons** sheet (Course Code, Order, Lesson Title, Timeline (mins), Video Link, Attachment, Article). Use **Download .xlsx** in the import dialog to get a sample with both sheets.

Import instructors the same way from **Instructors → Bulk import** (needs Name and Email columns).

All data is saved to `server/data/atlas.json`. Back that file up to keep a copy; delete it (or run `npm run reset-data`) to start again with no data (only the admin account). Set `ATLAS_SAMPLE_DATA=1` in `server/.env` first to get example courses and learners instead.

**Going live:** see [docs/PRODUCTION.md](docs/PRODUCTION.md) for the database, settings and Docker setup.

## 6. Run it like production (one server)

```bash
npm run build   # builds the React app into client/dist
npm start       # serves the app and the API together
```

Open **http://localhost:4000**. Others on your network can reach it at `http://<your-computer-ip>:4000`.

---

## Project structure

```
nfolks-atlas/
├─ package.json            root scripts: setup, dev, build, start, production, reset-data
├─ Dockerfile              production image (website + API in one container)
├─ server/
│  ├─ src/index.js         Express app and all API routes
│  ├─ src/db.js            JSON-file storage (load / save / reset)
│  ├─ src/importer.js      Excel/CSV parsing, column matching, validation, sample workbooks
│  ├─ src/constants.js     Statuses, field lists, helpers
│  ├─ src/seed.js          Starting data: empty, or example data with ATLAS_SAMPLE_DATA=1
│  └─ data/atlas.json      Your data (created on first run)
└─ client/
   ├─ index.html
   ├─ vite.config.js       Dev server + /api proxy to :4000
   └─ src/
      ├─ main.jsx          Routes
      ├─ api.js            fetch wrapper
      ├─ styles.css        Soft glass gradient theme (light + dark)
      ├─ lib/              constants, data + toast providers
      ├─ components/       Layout (sidebar), Icon, Dialog, Field, DataTable, ImportDialog
      └─ pages/            Home, Courses, CourseDetail, Instructors, Users
```

## API reference

| Method | Path | What it does |
|---|---|---|
| GET | `/api/courses` | All courses |
| POST | `/api/courses` | Create a course (`name`, `code` required) |
| GET / PUT / DELETE | `/api/courses/:id` | Read, update (any fields, including `lessons` and `instructors`), delete |
| GET / POST | `/api/instructors` | List / create (`name`, `email` required) |
| PUT / DELETE | `/api/instructors/:id` | Update / delete (also unlinks from courses) |
| GET / POST | `/api/users` | List / create (`email`, `password` ≥ 8 chars; stored as a scrypt hash) |
| PUT / DELETE | `/api/users/:id` | Update role and instructor profile / delete (the last admin is protected) |
| POST | `/api/import/courses` · `/api/import/instructors` | Multipart upload `file` (+ `replace`, `sheet`). Without `commit=true` it returns a preview; with it, it saves |
| GET | `/api/import/sample/:kind` | Sample .xlsx |
| GET | `/api/activity` · POST `/api/activity/read` | Notifications |
| POST | `/api/admin/reset-data` | Erase all data (admin accounts kept), after a backup |

Validation errors come back as `422 { error, fields: { fieldName: message } }`, which the forms show under each field.

## Common problems

- **`npm` is not recognized**: Node isn't installed, or the terminal was open before you installed it. Close and reopen the terminal.
- **Port 4000 or 5173 already in use**: another app uses it. Stop it, or run the API on another port with `PORT=4001 npm --prefix server run dev` (Windows PowerShell: `$env:PORT=4001; npm --prefix server run dev`) and change the proxy in `client/vite.config.js` to match.
- **"Can’t reach the Hazdemy server"** banner in the app: the API isn't running. Use `npm run dev`, not just the client.
- **PowerShell blocks scripts** (`running scripts is disabled`): run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, then retry.

## Security note on the Excel library

The project uses `xlsx` 0.18.5 from npm, the last version SheetJS published there. `npm audit` reports known issues in it for untrusted files. For a tool only your team uploads to, that's usually acceptable. To use the patched release, run this inside `server/`:

```bash
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

## Suggested next steps

1. **Put it in Git**: `git init && git add . && git commit -m "Hazdemy starter"`, then push to GitHub/GitLab.
2. **Add sign-in**: users already have hashed passwords. Add a `POST /api/login` that checks the hash and issues a session cookie (for example with `express-session`), and protect the routes.
3. **Move to a real database** when several people use it: PostgreSQL with Prisma or Drizzle. Only `server/src/db.js` and the route handlers need to change; the React app talks to the same API.
4. **Deploy**: build the client, then run the server on a VM or a platform such as Render, Railway or Azure App Service, with `PORT` set by the host.
