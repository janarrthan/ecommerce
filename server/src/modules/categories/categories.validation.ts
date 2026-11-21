import { z } from "zod";

/** Accepts no query parameters, so a mistake such as `?categry=apparel` gets a 400 instead of being ignored. */
export const listStorefrontCategoriesQuerySchema = z.object({}).strict();
