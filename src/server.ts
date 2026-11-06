import { app } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Volunteer shift API listening on http://localhost:${port}`);
});
