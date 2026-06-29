# Lumen Suite

Lumen Suite is an NGO ERP whose current MVP is the school academic lifecycle: yearly setup, enrolment, attendance, assessment, versioned report cards, and student progression.

## Development setup

1. Configure `server/.env` from `server/.env.example` and `client/.env` with the API URL.
2. Install dependencies in `server/` and `client/`.
3. Reset and seed the development database:

   ```sh
   cd server
   npx prisma migrate reset --force
   ```

4. Start `npm run dev` in both `server/` and `client/`.

The seed login is `admin@erp.com` / `admin123`. Change it outside local development.

## Academic lifecycle

- Academic years default to three terms and support one to four terms.
- Grade levels are permanent progression steps; class sections/streams belong to a specific year.
- Curriculum, assessment schemes, enrolments, attendance, and results are historical records.
- Published report cards are immutable PDF versions. Corrections create a new version.
- Promotion requires the configured final term to be closed and a following draft year to exist.

## Checks

```sh
cd server && npm run build && npm test && npx prisma validate
cd client && npx tsc --noEmit && npm run lint && npm run build
```
