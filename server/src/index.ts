import express from "express";
import { cyclesRouter } from "./routes/cycles.js";
import { leaguesRouter } from "./routes/leagues.js";
import { playersRouter } from "./routes/players.js";
import { scheduleRouter } from "./routes/schedule.js";
import { seasonsRouter } from "./routes/seasons.js";
import { teamsRouter } from "./routes/teams.js";
import { timeSlotPairsRouter } from "./routes/timeslot-pairs.js";

const app = express();
const port = process.env.PORT ?? 3001;

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "Curling scheduler API is running" });
});

app.use("/api/leagues", leaguesRouter);
app.use("/api/players", playersRouter);
app.use("/api/timeslot-pairs", timeSlotPairsRouter);
app.use("/api/seasons", seasonsRouter);
app.use("/api/cycles", cyclesRouter);
app.use("/api", teamsRouter);
app.use("/api", scheduleRouter);

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
