import { Router } from "express";

import { asyncHandler } from "../../shared/http/async-handler.js";
import { listStorefrontCategories } from "./categories.service.js";
import { listStorefrontCategoriesQuerySchema } from "./categories.validation.js";

export const categoriesRouter = Router();

categoriesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    listStorefrontCategoriesQuerySchema.parse(req.query);
    const categories = await listStorefrontCategories();

    res.status(200).json({ categories });
  }),
);
