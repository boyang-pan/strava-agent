import { initLogger, wrapAISDK } from "braintrust";
import * as ai from "ai";

export const logger = initLogger({
  projectName: "training-chat",
  apiKey: process.env.BRAINTRUST_API_KEY,
});

const { streamText, generateObject } = wrapAISDK(ai);
export { streamText, generateObject };
