const { z } = require('zod');

const updateProfileSchema = z.object({
  fullName: z.string().min(1).max(120).optional(),
  marketingOptIn: z.boolean().optional(),
});

const updatePrefsSchema = z.object({
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
  push: z.boolean().optional(),
  marketing: z.boolean().optional(),
});

module.exports = { updateProfileSchema, updatePrefsSchema };
