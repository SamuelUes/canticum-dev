"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionStatusSchema = void 0;
const zod_1 = require("zod");
exports.subscriptionStatusSchema = zod_1.z.object({
    platform: zod_1.z.enum(['android', 'ios', 'web']).optional(),
    plan: zod_1.z.string(),
    status: zod_1.z.enum(['active', 'inactive', 'expired'])
});
//# sourceMappingURL=index.js.map