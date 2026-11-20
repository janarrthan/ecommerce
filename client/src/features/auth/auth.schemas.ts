import { z } from "zod";

/** Validates the browser-visible user. Server authorization still checks database permissions independently. */
export const userSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  roles: z.array(z.string()),
});
export const sessionSchema = z.object({ user: userSchema.nullable() });
export const loginResponseSchema = z.object({ user: userSchema });
export const csrfSchema = z.object({ csrfToken: z.string().min(1) });
export const emptySchema = z.undefined();
export const loginInputSchema = z.object({
  // Matches the server's order: trim " Customer@Example.com ", validate the address, then lowercase it.
  email: z.string().trim().pipe(z.email().max(254).toLowerCase()),
  password: z.string().min(1).max(128),
});
export type User = z.infer<typeof userSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
