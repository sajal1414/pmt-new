# Putting Hazdemy online

Hazdemy runs as **one Node.js app**: it serves the website and the API from the same address, on one port.
It needs a **PostgreSQL database** for the data and a few **settings** (environment variables).
It works on any host that runs Node.js 18 or newer, or Docker: Render, Railway, Fly.io, DigitalOcean, AWS, or your own server.

## 1. Create a PostgreSQL database

Any provider works (Neon, Supabase, Render, Railway, Amazon RDS…). Create the database with **UTF8** encoding
and copy its connection URL. It usually looks like `postgres://user:password@host/dbname?sslmode=require`.

On the first start Hazdemy creates its tables and starts with **no data**: just the admin account below.

## 2. Settings

Set these on the host (its "Environment" or "Variables" page). Never put them in Git.

| Setting | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | The PostgreSQL connection URL from step 1 |
| `ATLAS_SECRET` | A long random value: run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep it the same between deploys; changing it signs everyone out |
| `ATLAS_ADMIN_EMAIL` | Your admin sign-in email, for example `admin@hazdemy.com` |
| `ATLAS_ADMIN_PASSWORD` | A temporary password for the first sign-in. You're asked to choose a new one straight away |
| `ATLAS_TRUST_PROXY` | `1` on hosts that put a proxy in front of the app (Render, Railway, Fly.io, nginx) |
| `PORT` | Usually set by the host. Defaults to `4000` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Your **live** Razorpay keys, when taking payments |
| `PAYMENT_CURRENCY` | For example `INR` or `USD` |
| `PAYMENT_COD` | `false` on the live site |

The server refuses to start in production without `ATLAS_SECRET`, and (on the first start) without `ATLAS_ADMIN_PASSWORD`,
so a live site never runs on a default secret or password.
`ATLAS_ADMIN_EMAIL` and `ATLAS_ADMIN_PASSWORD` are only used to create the first admin. Change the password on the site afterwards.

## 3. Deploy

**With Docker** (the `Dockerfile` in this folder builds everything):

```
docker build -t hazdemy .
docker run -p 4000:4000 --env-file production.env -v hazdemy-data:/app/server/data hazdemy
```

**Without Docker** (hosts that run Node.js directly). Use these commands:

- Build command: `npm run setup && npm run build`
- Start command: `npm start`

## 4. After the first deploy

1. Open the site and sign in with `ATLAS_ADMIN_EMAIL` and `ATLAS_ADMIN_PASSWORD`. Choose your own password.
2. **Site Settings**: check the platform name and set the support email and phone.
3. **Courses → Bulk import** to bring in your course inventory, or add courses one by one.
4. **Website API**: create a key for each website that shows your courses, and paste the embed code there.
5. Check **Security** on the dashboard: everything should be green, including HTTPS.

## Good to know

- **HTTPS**: hosts such as Render and Railway provide it automatically. On your own server, put nginx or Caddy in front with a certificate.
- **Uploaded Word outlines** are kept in `server/data/outlines` on the server's disk. On hosts that wipe the disk at each deploy,
  mount a persistent disk there (the Docker command above does), or upload the outlines again after a redeploy.
- **Backups**: use your database provider's automatic backups. Site Settings → *Download a full backup* saves a copy any time.
- **Sample data** for a demo site: set `ATLAS_SAMPLE_DATA=1` before the first start. Never on the live site.
- **Erase all data**: Site Settings → *Erase data* (or `npm run reset-data`) removes everything except admin accounts, after saving a backup.
