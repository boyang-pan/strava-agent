import { initLogger } from "braintrust";

export const logger = initLogger({
  projectName: "training-chat",
  apiKey: process.env.BRAINTRUST_API_KEY,
});
