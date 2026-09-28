/**
 * Open-Meteo adapter (free, no key): geocoding + hourly forecast at kickoff.
 * https://open-meteo.com/en/docs
 */
import type { WeatherInfo } from "../../shared/types";
import { fetchJson } from "../http";

interface GeoResult { latitude: number; longitude: number; name: string; admin1?: string; country_code?: string }

const US_STATES: Record<string, string> = {
  AL: "Alabama", AZ: "Arizona", CA: "California", CO: "Colorado", FL: "Florida", GA: "Georgia", IL: "Illinois",
  IN: "Indiana", LA: "Louisiana", MA: "Massachusetts", MD: "Maryland", MI: "Michigan", MN: "Minnesota",
  MO: "Missouri", NC: "North Carolina", NJ: "New Jersey", NV: "Nevada", NY: "New York", OH: "Ohio",
  PA: "Pennsylvania", TN: "Tennessee", TX: "Texas", WA: "Washington", WI: "Wisconsin", DC: "District of Columbia",
};

export async function geocodeVenue(city: string, state: string | null, country: string | null): Promise<{ lat: number; lon: number } | null> {
  const q = new URLSearchParams({ name: city, count: "10", language: "en", format: "json" });
  const { data } = await fetchJson<{ results?: GeoResult[] }>(`https://geocoding-api.open-meteo.com/v1/search?${q}`);
  const results = data.results ?? [];
  if (!results.length) return null;
  const stateName = state ? US_STATES[state.toUpperCase()] ?? state : null;
  const isUS = !country || /^(usa|us|united states)$/i.test(country);
  const best =
    results.find((r) => isUS && r.country_code === "US" && stateName && r.admin1 === stateName) ??
    results.find((r) => (isUS ? r.country_code === "US" : true)) ??
    results[0];
  return { lat: best.latitude, lon: best.longitude };
}

const WMO: Record<number, string> = {
  0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Freezing fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
  66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Showers", 81: "Showers", 82: "Heavy showers", 85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm w/ hail", 99: "Thunderstorm w/ hail",
};

/** Forecast at the kickoff hour. Open-Meteo forecasts ~16 days ahead. */
export async function fetchKickoffWeather(lat: number, lon: number, kickoffIso: string): Promise<WeatherInfo> {
  const kick = new Date(kickoffIso);
  const day = kick.toISOString().slice(0, 10);
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lon),
    hourly: "temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code",
    temperature_unit: "fahrenheit", wind_speed_unit: "mph", timezone: "UTC",
    start_date: day, end_date: day,
  });
  const { data } = await fetchJson<{ hourly?: Record<string, (number | string | null)[]> }>(`https://api.open-meteo.com/v1/forecast?${q}`);
  const h = data.hourly;
  const times = (h?.time ?? []) as string[];
  if (!times.length) throw new Error("No forecast hours returned");
  const target = kick.getTime();
  let idx = 0;
  let best = Infinity;
  times.forEach((t, i) => {
    const d = Math.abs(Date.parse(t + "Z") - target);
    if (d < best) { best = d; idx = i; }
  });
  const pick = (k: string) => {
    const v = h?.[k]?.[idx];
    return typeof v === "number" ? v : null;
  };
  const code = pick("weather_code");
  return {
    status: "live",
    indoor: false,
    source: "Open-Meteo",
    fetchedAt: new Date().toISOString(),
    tempF: pick("temperature_2m"),
    windMph: pick("wind_speed_10m"),
    windGustMph: pick("wind_gusts_10m"),
    precipProb: pick("precipitation_probability"),
    conditions: code === null ? null : WMO[code] ?? `Code ${code}`,
  };
}
