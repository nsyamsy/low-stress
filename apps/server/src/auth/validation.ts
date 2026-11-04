import { z } from "zod";

export const USERNAME_REGEX = /^[a-z0-9_.]+$/;

export const usernameSchema = z
  .string()
  .min(3, "USERNAME_TOO_SHORT")
  .max(20, "USERNAME_TOO_LONG")
  .regex(USERNAME_REGEX, "USERNAME_INVALID")
  .transform((val) => val.toLowerCase());

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "DISPLAY_NAME_TOO_SHORT")
  .max(24, "DISPLAY_NAME_TOO_LONG");

export const emailSchema = z
  .string()
  .trim()
  .email("EMAIL_INVALID")
  .transform((val) => val.toLowerCase());

export const passwordSchema = z.string().min(8, "PASSWORD_TOO_WEAK");

export const registerBodySchema = z
  .object({
    username: usernameSchema,
    displayName: displayNameSchema,
    email: emailSchema,
    password: passwordSchema,
    captcha: z
      .object({
        challenge: z.string().min(1),
        nonce: z.string().min(1),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.password.toLowerCase() === data.username.toLowerCase()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "PASSWORD_TOO_WEAK",
      });
    }
  });

export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  username: z.string().min(1).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  locale: z.enum(["auto", "id", "en"]).optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  email: emailSchema.optional(),
});

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
  })
  .superRefine((data, ctx) => {
    if (data.newPassword === data.currentPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "PASSWORD_TOO_WEAK",
      });
    }
  });

export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1),
});

export type DeleteAccountBody = z.infer<typeof deleteAccountSchema>;
