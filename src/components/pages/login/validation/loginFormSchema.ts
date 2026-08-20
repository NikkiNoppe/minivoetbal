
import { z } from "zod";

export const loginValidationSchema = z.object({
  usernameOrEmail: z
    .string()
    .min(1, "Gebruikersnaam of email is verplicht")
    .max(50, "Gebruikersnaam of email mag maximaal 50 karakters bevatten")
    .trim(),
  password: z
    .string()
    .min(1, "Wachtwoord is verplicht")
    .max(100, "Wachtwoord mag maximaal 100 karakters bevatten"),
});

export type LoginFormData = z.infer<typeof loginValidationSchema>;
