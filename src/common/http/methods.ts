import { METHODS } from "node:http";

/**
 * Get http methods list
 */
export const methods = METHODS.map((method) => method.toLowerCase());
