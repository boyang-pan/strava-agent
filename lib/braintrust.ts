import { initLogger } from "braintrust";

export const logger = initLogger({
  projectName: "strava-agent",
  apiKey: process.env.BRAINTRUST_API_KEY,
});
