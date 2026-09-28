import type { Game, WeatherInfo } from "../../shared/types";
import { fetchKickoffWeather, geocodeVenue } from "../providers/weather";
import { cached, readJSON, writeJSON, HOUR, MIN } from "../cache";

const FORECAST_DAYS = 15;

/** Kickoff weather for a game. Indoor venues are marked and never adjusted. */
export async function getGameWeather(game: Game): Promise<WeatherInfo> {
  const espn = game.weather;
  if (game.venue.indoor === true) {
    return {
      status: "live", indoor: true, source: "ESPN venue", fetchedAt: new Date().toISOString(),
      tempF: null, windMph: null, windGustMph: null, precipProb: null, conditions: "Indoor / dome",
      note: "Indoor or closed-roof venue per ESPN — weather is not applied",
    };
  }
  const unavailable = (note: string): WeatherInfo =>
    espn ? { ...espn, note: `${note}. ESPN summary only (no wind data).` }
      : { status: "unavailable", indoor: game.venue.indoor, source: "none", fetchedAt: null, tempF: null, windMph: null, windGustMph: null, precipProb: null, conditions: null, note };

  const daysOut = (Date.parse(game.date) - Date.now()) / (24 * HOUR);
  if (game.state !== "pre") return unavailable("Game started or finished");
  if (daysOut > FORECAST_DAYS) return unavailable("Kickoff beyond forecast range");
  if (!game.venue.city) return unavailable("Venue location unknown");

  try {
    const geoKey = `geo/${[game.venue.city, game.venue.state, game.venue.country].join("|")}`;
    let geo = (await readJSON<{ lat: number; lon: number } | null>(geoKey))?.value ?? null;
    if (!geo) {
      geo = await geocodeVenue(game.venue.city, game.venue.state, game.venue.country);
      if (geo) await writeJSON(geoKey, geo);
    }
    if (!geo) return unavailable("Could not locate venue");
    const r = await cached(`weather/${game.id}`, 60 * MIN, () => fetchKickoffWeather(geo!.lat, geo!.lon, game.date));
    return { ...r.data, status: r.fromCache ? "cached" : "live", fetchedAt: r.fetchedAt, indoor: game.venue.indoor === false ? false : null,
      note: game.venue.indoor === null ? "Roof status unknown — outdoor weather shown" : undefined };
  } catch {
    return unavailable("Weather service unavailable");
  }
}
